# Concordia website: detailed AWS migration runbook

Audience: Vivek and the website owner.

This is an execution plan, not a record of completed AWS work. Commands are
templates for an authorized migration operator. Review paths, permissions,
region, database names and versions before running them. No live credentials,
patient data, infrastructure provisioning or DNS changes are included here.

Read this together with `docs/VIVEK_AWS_TECHNICAL_HANDOFF.md`. That document
explains the current implementation; this document specifies migration order,
technical requirements, acceptance gates and rollback.

## 1. Recommended migration strategy

**First move hosting, retain Neon and the existing external apps, and port file
storage. Move PostgreSQL to RDS later if required.**

This separates a hosting change from a database-driver conversion. Keeping Neon
means the website runs on AWS but PostgreSQL remains an external dependency.
If all application data must move into AWS immediately, choose the RDS track
below and complete its additional engineering/testing before cutover.

Do not change primary authentication provider, Staff inventory ownership,
payment behavior or patient identity rules during migration.

### Target layout

```text
Browser
   |
DNS for approved website hostname
   |
HTTPS Application Load Balancer + ACM certificate
   |
One Linux EC2 instance initially, Node.js service on port 5000
   |-- Express API + frontend static files/SEO/SPA routing
   |-- authenticated API + caregiver PostgreSQL sessions
   |-- SSE/WebSocket connections and sync/retry workers
   |
   |-- PostgreSQL: existing Neon OR separately ported RDS
   |-- S3: replacement upload/document storage
   |-- existing Clerk application/tenant
   |-- external Staff, ConcordiaCare, PharmFlows and PrimeRx
   |-- Resend / optional Twilio / optional OpenAI
   |
CloudWatch + backup/restore tooling + secure runtime configuration
```

No Redis/ElastiCache is required. Redis is not currently configured.
S3-only static hosting and a request-only serverless conversion are not drop-in
deployment options for this backend.

## 2. Current technical specifications

| Component | Current specification |
|---|---|
| Runtime | Node.js ESM; use Node 22 LTS as target and validate clean install |
| Language | TypeScript 5.6.3 |
| Frontend | React 18.3.x, Vite 6.4.x, Wouter |
| UI/data | Tailwind 3.4.x, Radix, React Query 5.x, React Hook Form, Zod |
| Backend | Express 5.2.x, esbuild bundle with external packages |
| Database | PostgreSQL + Drizzle 0.45.x + Neon serverless WebSocket driver |
| Primary auth | Clerk; preserve current tenant and user identities |
| Secondary context | Express-session + connect-pg-simple, PostgreSQL sessions |
| Real-time | SSE and ws; `/ws/admin`, `/ws/staff` |
| Storage today | GCS library + Replit credential/signing sidecar |
| Email/SMS | Resend; conditional Twilio code |
| Tests | Vitest, Supertest |
| Production command | `NODE_ENV=production PORT=5000 npm start` |
| Build products | `dist/index.js` and `dist/public/` |

Use the supplied lockfile for exact resolved dependency versions.

### Actual cache behavior

- Node-process catalog cache: 1,000 ms.
- Inventory revision response coalescing: 750 ms.
- Failed ordinary inventory/revision fetch retry cooldown: 1,000 ms.
- Concurrent reads share in-flight work.
- Forced order-time inventory checks bypass normal catalog caching.
- Browser query cache: TanStack Query.
- Durable records: PostgreSQL, not the memory cache.
- SSE listeners, WebSocket connections, some rate-limit state and workers are
  process-local, not coordinated across instances.

Start with one Node process/instance. PM2 cluster mode, several systemd
instances, an autoscaling group with multiple active instances or parallel
worker copies are not automatically safe.

## 3. Step 1: agree scope, ownership and downtime

Before provisioning:

1. Decide Neon-retained versus RDS-now.
2. Name AWS account owner, technical operator, DNS owner and rollback approver.
3. Confirm approved region and patient-data requirements. `us-east-1` is a
   reasonable planning candidate for this US-based service, not an approved
   residency/compliance decision.
4. Agree final domain and a separate staging hostname.
5. Agree a maintenance/write-freeze window and recovery objectives.
6. List enabled features and who can approve each end-to-end test.
7. Confirm existing Staff/ConcordiaCare/PharmFlows contacts for callback changes.
8. Decide which storage files and production records must migrate.
9. Record acceptable error rate/latency and recovery times using actual business
   needs; do not invent a capacity or availability guarantee.

**Gate:** no unresolved ownership of database, files, domain or credentials.

## 4. Step 2: receive and verify the source package

Obtain:

- `concordia-website-aws-source.zip`
- `concordia-website-banners.zip`
- Vivek's technical handoff and this runbook.

Extract BOTH ZIPs into the same parent directory and merge their shared
`concordia-website/` folder. The split exists because of a download size limit;
neither archive is a binary split fragment.

Check:

```text
concordia-website/
  client/src/
  client/public/banners/
  server/
  shared/
  attached_assets/stock_images/
  attached_assets/generated_images/
  package.json
  package-lock.json
  .env.aws.example
  EXPORT-MANIFEST.json
```

Compare extracted file sizes/SHA-256 values against the export manifest using a
local script. Record source/export identity before making changes. The archive
contains no production database dump, private uploads or secret values.

Create a private review repository if appropriate; do not upload source or
backups to a public repository. Keep migration changes separate from feature
redesigns.

## 5. Step 3: provision a staging AWS foundation

Recommended baseline, subject to cost/security review:

| Resource | Initial specification |
|---|---|
| VPC | Public/private subnet design in at least two Availability Zones for the ALB |
| ALB | Public HTTPS 443; HTTP 80 redirects to HTTPS |
| Certificate | ACM certificate covering approved hostnames, validated before cutover |
| Node host | One Linux EC2 instance; private subnet preferred |
| Sizing | 2 vCPU / 4 GiB RAM starting benchmark only; OCR/AI document work may require more |
| Disk | Encrypted EBS; roughly 30 GiB starting point, adjust for builds/logs/temp files |
| Service manager | systemd; one Node process initially |
| Storage | Private S3 bucket/prefixes with explicit public-asset delivery design |
| Database | Reachable Neon, or private RDS after driver migration |
| Secrets | AWS Secrets Manager or secure Parameter Store, read by approved deployment tooling |
| Administration | SSM Session Manager preferred over open SSH |
| Observability | CloudWatch logs/metrics/alarms with retention controls |

Network requirements:

- ALB security group accepts public HTTPS; EC2 accepts application port 5000
  only from the ALB security group, not from the whole internet.
- Private Node hosts need working outbound HTTPS/DNS for Clerk, Staff, email,
  external APIs and Neon WebSockets. Provide NAT or another reviewed egress
  design. An S3 VPC endpoint alone does not provide external internet access.
- RDS, if selected, accepts PostgreSQL traffic only from approved application/
  operator security groups. Keep it nonpublic unless explicitly justified.
- Restrict administration access and enforce MFA/least privilege.

Do not assume these suggested sizes or this single-instance layout provide high
availability. The ALB alone does not make one backend instance highly available.

## 6. Step 4: IAM, secrets and environment separation

Use an EC2 instance role, not hardcoded AWS access keys.

Grant only the required:

- Secret/parameter reads on named application resources.
- S3 object actions on approved prefixes, plus narrowly scoped bucket listing.
- Relevant KMS permissions where customer-managed keys are selected.
- Log publishing and approved SSM access.

Creating a Secrets Manager entry does not automatically inject it into Node.
Choose and implement a deployment/startup retrieval mechanism. It must fail
closed if required configuration is missing and must never print secret values.

Separate staging/production credentials, data, buckets/prefixes and outbound
delivery targets. Do not copy the entire old environment indiscriminately.

Core runtime configuration:

```text
NODE_ENV=production
PORT=5000
DATABASE_URL=<securely injected database setting>
SESSION_SECRET=<securely injected session secret>
<the correct matching Clerk key configuration>
```

Feature-specific names and key-selection rules are in the handoff and
`.env.aws.example`. Optional credentials should only be requested for enabled
features. The current template is a starting checklist, not a deployed AWS
configuration.

`VITE_*` settings are PUBLIC and are baked into frontend builds. Never use that
prefix for a server secret. Build-time public configuration and runtime secret
configuration are separate.

## 7. Step 5: isolate staging before starting the application

The application starts sync loops, retries and initialization work at startup.
A production database clone may contain live contact details AND saved outbound
payloads. Scrubbing only patient/contact tables is not sufficient.

Before the first staging start:

1. Prefer synthetic fixtures. If using production data, obtain authorization,
   apply appropriate privacy controls and sanitize/quarantine copied outboxes,
   notifications, pending requests and identities.
2. Mock/disable outbound order, patient/app, email and SMS transports.
3. Use receiver sandbox/test accounts wherever supported.
4. Keep staging from consuming or modifying live receiver data.
5. Validate that no restored retry job can send old patient information.

**Important:** do not assume a universal `DISABLE_WORKERS` or `DRY_RUN` environment
switch already exists. Where needed, implement and test explicit controls or
mock transports before starting staging. Setting an invented environment
variable does not disable anything.

## 8. Step 6A: retain Neon initially

1. Confirm authorized access to the actual production database; development is
   separate and is not a substitute.
2. Create a protected backup before migration changes.
3. Provide Neon connectivity from staging using isolated data/credentials.
4. Keep the current Neon pool and Drizzle adapter.
5. Verify TLS/network access, startup migrations and caregiver sessions.
6. Confirm production pool limit (currently five per app process) fits actual
   connection limits, including the independent session store.
7. At cutover, stop duplicate worker execution on the old host before allowing
   the new host to take over against the same live database.

Even with one shared database, simultaneous old/new workers can send duplicate
integration attempts or run conflicting initialization. Shared data does not
automatically provide worker leadership.

## 9. Step 6B: migrate PostgreSQL to RDS if required

Additional implementation work:

1. Choose compatible PostgreSQL major version and required extensions/enums.
2. Replace Neon WebSocket transport with a supported PostgreSQL TCP driver and
   corresponding Drizzle adapter. `DATABASE_URL` alone does not do this.
3. Test `connect-pg-simple` separately: session storage is not identical to the
   application's Drizzle connection path.
4. Configure TLS with verified certificates and the current RDS CA trust chain.
   Do not use `rejectUnauthorized:false` as a production workaround.
5. Review transactions, raw SQL, pool limits, timeouts and reconnect behavior.
6. Restore a staging copy and validate before any production freeze.

Example authorized backup/restore workflow:

```sh
# Configure restricted PostgreSQL service/password files securely beforehand.
# The service aliases below are placeholders, not existing configuration.
# Do not put credentials into shell history or command-line URLs.

pg_dump --dbname="service=concordia_source" \
  --format=custom \
  --file=/secure-backups/concordia-before-cutover.dump

pg_restore --dbname="service=concordia_target_staging" \
  --no-owner --no-acl --exit-on-error --single-transaction \
  /secure-backups/concordia-before-cutover.dump
```

Use PostgreSQL client versions compatible with the source server. Store backups
encrypted with restricted access. Review source ownership, privileges, RLS,
extensions and restore roles separately: `--no-owner --no-acl` does not recreate
the application's least-privilege grants.

Validate all relevant tables/relationships, IDs, sequence positions, indexes,
constraints, enums, sessions, audit records and outbox/idempotency state.
Compare appropriate counts and controlled checksums without exporting patient
rows into ordinary logs.

For production, an initial restore is not enough while the source keeps
receiving writes. Either:

- Freeze writes, perform a final consistent dump/restore, validate and switch; or
- Design/test a compatible change-data-capture process separately.

Do not improvise CDC, dual writes or two independently writable databases during
the cutover. Never run `npm run db:push` blindly on production.

## 10. Step 7: implement and migrate S3 storage

This is a launch blocker, not just a bucket-creation task.

Current storage uses a GCS client with a Replit-sidecar credential/signing flow
at `127.0.0.1:1106`. That sidecar is not supplied by AWS or the source ZIP.

Implement an AWS-compatible adapter preserving existing API behavior:

1. Inventory upload/download routes and every stored object-path format.
2. Define separate private/public prefixes or buckets.
3. Add backend S3 operations using the IAM role.
4. Implement expiring upload/download presigned URLs as appropriate.
5. Preserve ownership/authorization checks before signing private downloads.
6. Validate path normalization, traversal prevention, content type, limits and
   relevant object ACL semantics.
7. Restrict S3 CORS to approved website origins and required methods/headers.
8. Migrate stored objects; preserve/update database references through a
   controlled mapping.
9. Compare file counts, sizes and content checksums. Do not assume an S3 ETag
   always equals MD5, especially for multipart/encrypted objects.
10. Verify that one patient cannot access another patient's files.

Keep Block Public Access enabled for private patient storage. Public banners
are not a reason to make an entire mixed-content bucket public. Configure
encryption, versioning, retention/lifecycle and backup requirements explicitly.
Do not automatically delete old versions containing required records.

Proposed settings such as `AWS_REGION`, `S3_BUCKET` or `S3_PRIVATE_PREFIX` only
work after the adapter implements them. The current `PUBLIC_OBJECT_SEARCH_PATHS`
and `PRIVATE_OBJECT_DIR` are not drop-in S3 settings.

Staff-hosted product image URLs are a separate external dependency. Do not
silently bulk-copy or rewrite them without agreement with Staff.

## 11. Step 8: resolve deployment blockers and safeguards in code

Before acceptance, review:

- Object storage replacement.
- RDS driver change, only for the RDS track.
- Domain/CORS/canonical URL assumptions and generated callback links.
- Matching Clerk direct/proxy key selection.
- Startup DDL/migrations and required permissions.
- Explicit staging worker/outbound isolation.
- Liveness/readiness endpoints and shutdown behavior.
- Order header/lines/outbox atomicity gap.

The current pending order header, line inserts and outbox save are separate
writes. Fix/test their atomicity, or document and formally accept the recovery
procedure before launch. Never label a partial pending record a completed sale.

Add minimal health endpoints as an implementation task, for example:

```text
GET /api/health/live   -> 200 when process is serving
GET /api/health/ready  -> 200 only after required initialization; otherwise 503
```

These names are PROPOSED, not existing implemented routes. Responses should not
expose credentials, patient records or internal connection strings. Distinguish
an upstream Staff outage from a completely dead process; do not unnecessarily
make every page unavailable because one optional service is down.

Review signal handling, termination grace, stopping new work and closing DB/
stream connections. Do not assume current exception/signal handlers already
meet systemd/ALB graceful-shutdown requirements.

## 12. Step 9: configure authentication and origins

1. Retain the existing Clerk application/tenant and user identities.
2. Use authorized tenant/domain administration access; do not provision a new
   tenant as a shortcut.
3. Approve staging and final hostname behavior, redirects and cookie settings.
4. Choose the correct existing proxy/direct mode and matching key pair.
5. Supply public Clerk settings before the frontend build.
6. Preserve Clerk proxy middleware ordering before JSON/body parsing.
7. Preserve webhook raw bodies and signature checks.
8. Verify admin metadata and API-side patient identity/ownership.

Inspect:

```text
server/clerkAuth.ts
server/middlewares/clerkProxyMiddleware.ts
server/middlewares/recoverLegacyClerkHandshake.ts
server/index.ts
client authentication configuration
```

The configured canonical site is `concordianyc.com`; verify actual DNS separately.
Review hardcoded origins for website, Staff, ConcordiaCare and PharmFlows.
Do not blanket-allow `*` with credentials.

The app currently trusts one proxy hop. Match that to the actual trusted
network path; test spoofed forwarding headers as well as legitimate HTTPS.
Caregiver cookies require production HTTPS behavior.

## 13. Step 10: install, build and run on the Node host

Install a supported Node 22 LTS runtime through the approved OS/tooling process.
Verify:

```sh
node --version
npm --version
command -v node
```

Deploy versioned releases under an application-owned path such as
`/opt/concordia/releases/<release-name>`, with a `current` symlink for activation.
Use a dedicated unprivileged service user. Keep secrets outside the source and
release directory; do not expose them in frontend files.

From a clean extracted release:

```sh
npm ci --include=dev
npm run check
npm test
npm run build
```

Provide only approved public build variables at build time. Runtime secrets are
injected separately. Do not source an untrusted environment file as a shell
script. Retain installed dependencies initially; production imports must be
verified before pruning development packages.

Example systemd unit, to be adapted and reviewed:

```ini
[Unit]
Description=Concordia website Node service
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=concordia
Group=concordia
WorkingDirectory=/opt/concordia/current
Environment=NODE_ENV=production
Environment=PORT=5000
EnvironmentFile=/etc/concordia/runtime.env
ExecStart=/usr/bin/node /opt/concordia/current/dist/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`/usr/bin/node` is an example; use the actual absolute path from `command -v node`.
Have approved tooling retrieve secrets into a root-owned restricted environment
file if choosing this pattern. The system service manager reads it; do not make
it world-readable or put it in backups/source exports. This mechanism must be
implemented; Secrets Manager does not create the file automatically.

After code/secret setup and health-route implementation:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now concordia
sudo systemctl status concordia --no-pager
# Proposed endpoint, only after implementation:
curl --fail http://127.0.0.1:5000/api/health/ready
```

Use controlled log access. Do not send raw patient payloads or secret-bearing
exceptions to general-purpose logs.

## 14. Step 11: configure ALB, TLS and streams

1. Issue/validate ACM certificate for the approved domain.
2. Configure HTTPS listener 443; redirect HTTP 80 to HTTPS.
3. Register the EC2 target on port 5000.
4. Use the implemented readiness endpoint for target checks; verify the target
   is serving JSON/status, not a misleading SPA HTML fallback.
5. Start with a reviewed idle timeout such as 120 seconds, then verify against
   all stream/operation behavior. Inventory emits 20-second SSE keepalives.
6. Preserve WebSocket Upgrade behavior for `/ws/admin` and `/ws/staff`.
7. Do not buffer/transform SSE. If adding Nginx or another proxy, explicitly
   configure its streaming, upstream HTTP and WebSocket upgrade settings.
8. Test large uploads, timeout boundaries, reconnects and target deregistration.
9. Limit request-body sizes and rate limits deliberately; match existing
   upload/clinical document requirements rather than choosing arbitrary limits.

The backend serves the SPA and SEO HTML as well as API traffic. Routing every
unknown path to a static index before reaching Express can break APIs/metadata.

CloudFront is optional, not required for initial cutover. If introduced, cache
only approved public content; forward the required authentication/header/query
information and bypass caching for APIs, auth, private files and streams.

## 15. Step 12: reconnect external integrations safely

### Staff

Retain canonical Staff IDs, stock/price ownership and stable website order IDs.
Current Staff origin:

`https://concordia-staff.replit.app`

Verify public catalog, revision and event connections. Preserve website inbound:

```text
POST  /api/external/products/sync
POST  /api/external/products/hide
PATCH /api/external/orders/:externalOrderId/app-status
POST  /api/external/staff/orders/status
```

Audit each route's authentication separately. Private order handoff is:

`POST https://concordia-staff.replit.app/api/public/webhooks/new-order`

The website integration uses its existing backend credential and exact saved
payload/identity for retries. A successful Staff response confirms receipt only,
not reserved stock or payment authorization.

Keep pickup/delivery requests unpaid, require phone contact, retain server-side
delivery-address verification, and do not deduct/restock inventory locally.
Cancellation/refund/return/restock remain unresolved contracts. Never replay a
new-order webhook to cancel.

### PharmFlows

Prescription requests only:

`POST https://pharmflows.com/api/external/prescription-requests`

Restore pharmacy-scoped credentials securely. Run:

```sh
npm run pharmflows:check
```

The safe handshake must confirm `_test:true`, `dryRun:true` and matching pharmacy
code without patient data. This does not test all real prescription journeys.

### ConcordiaCare / PrimeRx / messaging

- Coordinate target/callback URLs and existing shared-secret checks.
- Preserve patient/enrollment/Rx ownership and pending retry identities.
- Avoid automatic replay of uncertain historical creates.
- Restore Resend credentials and a verified sender; do not rely on the default
  onboarding sender for production delivery.
- Test SMS only if a real provider/number is configured and approved.
- Verify flu-shot booking, status and completion/review notifications using
  controlled contacts, including duplicate suppression.

## 16. Step 13: acceptance tests and evidence

Run tests against isolated fixtures and mock payment/outbound transports where
needed. There are no active online payments to enable.

| Area | Required acceptance evidence |
|---|---|
| Build | Clean lockfile install, type check, test results, production build/start |
| Public site | Home/services/shop/deep links, SEO HTML, images/banners/video |
| Auth | Same tenant, sign-in/out, admin access, caregiver sessions, denied unauthorized access |
| Private files | Upload/download, expiry, ownership enforcement, cross-patient denial |
| Inventory | Staff prices/stock/visibility/images; empty, stale-event and outage behavior |
| Recovery | Missed event, disconnect/reconnect, revision fallback, process restart |
| Requests | Mandatory phone, verified delivery address, insufficient-stock blocking |
| Handoff | Stable ID/body retries, duplicate delivery, timeout uncertainty, authenticated status |
| Blister | Create/update/history/sync, ownership, uncertain prior create recovery |
| Prescription | Safe connection check and controlled end-to-end receiver validation |
| Notifications | Booking/status/completion delivery and duplicate suppression |
| Streams | SSE/WebSocket auth, keepalives, reconnect and deploy termination |
| Data | Preserved IDs/constraints/sequences/outboxes, approved counts/checksums |
| Operations | Backup restore test, logs/alarms, restart, disk/resource monitoring |

Record results and unresolved issues. Prior source build/type checks are useful,
but they do not replace this target-environment acceptance. Do not describe the
entire test suite or live integrations as verified without evidence.

## 17. Step 14: production cutover

### Before the maintenance window

1. Obtain explicit owner approval, backup verification and go/no-go signoff.
2. Prepare TLS, deployment artifact, settings, monitoring and rollback owner.
3. Reduce relevant DNS TTL in advance where supported; a value such as 300
   seconds is a planning target, not a guarantee of all client cache behavior.
4. Inventory DNS records. Preserve mail MX/SPF/DKIM/DMARC, Clerk/auth and other
   service records; do not replace the whole DNS zone.
5. Agree how webhooks and retries will be handled during the transition.
6. Prepare a maintenance mode that truly blocks writes if required. Do not
   assume one already exists.

### During the window

1. Block new mutating requests and coordinate external inbound writes/retries.
2. Stop old outbound/sync workers at an agreed boundary.
3. Capture final database/object backups and outbox state.
4. For RDS, complete final consistent restore/delta and validate data.
5. Complete final object sync and reference verification.
6. Start the AWS service against the chosen production data store.
7. Verify readiness, auth, private files, inventory and controlled request flow.
8. Change approved DNS records to the ALB. Use the appropriate alias/CNAME
   mechanism supported by the DNS provider; do not invent an apex CNAME setup.
9. Coordinate any integration callback URLs that use the old hosting hostname
   rather than the retained custom domain.
10. Release writes only when the correct backend/workers are authoritative.
11. Observe the site continuously through DNS transition and backlog recovery.

Do not have old and new hosts independently accept live orders while writing
to separate databases. This creates split-brain data, not a safe migration.

## 18. Step 15: rollback plan

Define thresholds before cutover: sustained auth errors, failed private-file
access, inventory mismatch, lost/duplicated requests or unacceptable errors.

**If Neon is retained:** reverting traffic may be straightforward, but confirm
schema compatibility and stop AWS workers before starting old ones. Any changed
object references must still resolve through the old code/storage path.

**If RDS becomes writable:** old data is now stale. DNS rollback alone can lose
orders/patient updates. Freeze writes, preserve new writes/outboxes, reconcile
or restore the authoritative dataset and only then reopen the selected host.

For both paths:

- Do not resend requests with new IDs.
- Preserve uncertain acknowledgement state and notification idempotency.
- Avoid two active worker sets.
- Restore compatible code AND database/storage behavior together.
- Record what was restored and verify read/write/integration recovery.

Keep the old environment available but controlled until the owner approves
retirement. Do not delete databases, buckets, objects or accounts immediately
after a successful DNS change.

## 19. Step 16: post-cutover operations

Monitor immediately and through an agreed stabilization window:

- ALB/application 4xx/5xx, response latency and target health.
- CPU, memory, disk, Node restarts and DB connection pressure.
- Staff connection/revision freshness and inventory errors.
- Outbox backlog age, failed sends, uncertain receipts and retry volume.
- Email/SMS provider acceptance and controlled delivery checks.
- File signing/access errors and denied cross-user access.
- Backup completion, restore verification and security alerts.

Not all of these application metrics currently exist: instrument missing ones
before relying on them for launch monitoring.

After stabilization, consider scaling/coordination, queue separation, RDS if
deferred, and performance changes as separate work. Introducing Redis is an
optional design decision with its own data/TTL/invalidation/availability model,
not a necessary migration step.

## 20. Final go-live checklist

- [ ] Full code/assets received and release identity recorded.
- [ ] AWS access, region, budgets, domain and owners approved.
- [ ] Database path chosen, tested and backed up.
- [ ] AWS-compatible private/public object access implemented and migrated.
- [ ] Correct Clerk tenant/domain/key mode verified.
- [ ] Secrets injected securely; no server secrets in frontend builds.
- [ ] One authoritative worker set; no accidental staging deliveries.
- [ ] Health checks, HTTPS, proxy behavior and streams verified.
- [ ] Staff inventory ownership and stable request retries preserved.
- [ ] Payment remains disabled; unresolved cancellation/refund contracts unchanged.
- [ ] Acceptance matrix completed; critical failures closed or explicitly accepted.
- [ ] DNS/write-freeze/callback plan approved.
- [ ] Rollback includes data and files, not DNS alone.
- [ ] Monitoring, restore procedures and on-call owner confirmed.

Until these gates are satisfied, the correct status is:
**ready to execute a controlled migration, not ready to switch live traffic.**
