#!/usr/bin/env python3
"""Export website source and public assets, never workspace secrets or data."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "generated-artifacts" / "concordia-website-aws-source.zip"
PREFIX = "concordia-website/"
SOURCE_DIRS = ("client", "server", "shared", "scripts", "docs", "lib", "artifacts")
SKIP_DIRS = {
    "node_modules", "dist", "build", ".git", ".cache", ".local", ".agents",
    ".replit-artifact", "coverage", "test-results", "playwright-report",
    "__pycache__", "uploads", "sessions",
}
ROOT_FILES = {
    "package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "tsconfig.json", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts",
    "postcss.config.js", "components.json", "drizzle.config.ts", ".gitignore",
    ".env.aws.example", "LICENSE", "LICENSE.md", "API_DOCUMENTATION.md",
    "CONCORDIA_INTEGRATION.md", "design_guidelines.md", "eng.traineddata",
}
SECRET_PATTERNS = [
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"\bsk_live_[A-Za-z0-9]{24,}\b"),
    re.compile(rb"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(rb"\bghp_[A-Za-z0-9]{36}\b"),
    re.compile(rb"\bxox[baprs]-[0-9A-Za-z-]{25,}\b"),
    re.compile(rb"(?:postgres(?:ql)?|rediss?)://[^/\s:'\"]+:[^@\s'\"]+@"),
]


def allowed(path):
    relative = path.relative_to(ROOT)
    return (
        path.is_file()
        and not path.is_symlink()
        and not any(part in SKIP_DIRS for part in relative.parts)
        and not path.name.endswith((".tsbuildinfo", ".log", ".map", ".pem", ".key"))
        and (not path.name.startswith(".env") or path.name == ".env.aws.example")
    )


files = set()
for directory in SOURCE_DIRS:
    folder = ROOT / directory
    if folder.exists():
        files.update(p for p in folder.rglob("*") if allowed(p))
files.update(ROOT / name for name in ROOT_FILES if (ROOT / name).is_file())

# Only intentional public image trees and assets actually referenced by source.
# Do not copy the unfiltered attachment folder: it contains user uploads.
for directory in ("stock_images", "generated_images"):
    folder = ROOT / "attached_assets" / directory
    if folder.exists():
        files.update(p for p in folder.rglob("*") if allowed(p))
for source in list(files):
    if source.suffix not in {".ts", ".tsx", ".js", ".jsx", ".css", ".html"}:
        continue
    text = source.read_text(errors="replace")
    for reference in re.findall(r"""(?:@assets/|/attached_assets/)([^"'`\s)<>]+)""", text):
        if "*" in reference or "?" in reference or "${" in reference:
            continue
        asset = ROOT / "attached_assets" / reference
        if asset.is_file() and allowed(asset):
            files.add(asset)

manifest = []
blocked = []
for path in sorted(files):
    data = path.read_bytes()
    # Inspect text-like source only. Never print matching credential values.
    if path.suffix in {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".py", ".sh"}:
        if any(pattern.search(data) for pattern in SECRET_PATTERNS):
            # Synthetic test fixtures can contain fake credentials. Do not
            # automatically export a match; require review regardless.
            blocked.append(str(path.relative_to(ROOT)))
    manifest.append({
        "path": str(path.relative_to(ROOT)),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
if blocked:
    raise SystemExit("Review possible embedded credentials before export (paths only): " + ", ".join(blocked))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(files):
        archive.write(path, PREFIX + str(path.relative_to(ROOT)))
    archive.writestr(PREFIX + "EXPORT-MANIFEST.json", json.dumps({
        "description": "Source export, not a certified AWS deployment",
        "excludes": [
            "secret values", "database contents", "unreferenced user attachments",
            "patient uploads", "node_modules", "compiled bundles", "Git history",
            "private agent context", "remote object storage and Staff image files",
        ],
        "files": manifest,
    }, indent=2))
    archive.writestr(PREFIX + "README-AWS.txt",
        "Start with docs/aws-source-export.md and .env.aws.example.\n"
        "Full frontend/backend/shared source and public website assets are included.\n"
        "Database contents and secret values are NOT included.\n"
        "Replit object storage must be replaced/configured for AWS; the current\n"
        "Neon database transport is not a drop-in RDS PostgreSQL driver.\n"
        "See EXPORT-MANIFEST.json for file checksums and exclusions.\n")

with zipfile.ZipFile(OUTPUT) as archive:
    if archive.testzip():
        raise SystemExit("ZIP integrity check failed")
    for entry in manifest:
        data = archive.read(PREFIX + entry["path"])
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise SystemExit("Archive checksum mismatch: " + entry["path"])

outputs = [OUTPUT]
if OUTPUT.stat().st_size > 100 * 1024 * 1024:
    full = OUTPUT.with_name("concordia-website-complete-local.zip")
    OUTPUT.replace(full)
    banners = OUTPUT.with_name("concordia-website-banners.zip")
    with zipfile.ZipFile(full) as archive, \
            zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as source_zip, \
            zipfile.ZipFile(banners, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as banner_zip:
        for entry in archive.infolist():
            target = banner_zip if entry.filename.startswith(PREFIX + "client/public/banners/") else source_zip
            target.writestr(entry, archive.read(entry.filename))
    outputs = [OUTPUT, banners]

# Verify the combined download set reproduces every source/asset checksum.
combined = {}
for output in outputs:
    if output.stat().st_size > 100 * 1024 * 1024:
        raise SystemExit("Archive still exceeds delivery size limit")
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():
            raise SystemExit("Download archive integrity failed")
        for entry in archive.infolist():
            if entry.filename in combined:
                raise SystemExit("Duplicate entry in download set")
            combined[entry.filename] = hashlib.sha256(archive.read(entry.filename)).hexdigest()
for entry in manifest:
    if combined.get(PREFIX + entry["path"]) != entry["sha256"]:
        raise SystemExit("Combined download manifest mismatch: " + entry["path"])
print(json.dumps({
    "downloads": [{
        "zip": str(output.relative_to(ROOT)),
        "bytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    } for output in outputs],
    "files": len(manifest) + 2,
    "integrity": "all combined file checksums passed",
}, indent=2))
