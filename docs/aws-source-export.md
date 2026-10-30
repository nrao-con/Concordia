# AWS source export

This is a complete source-code handoff for the website in `client/`, `server/`
and `shared/`, not a completed or tested AWS migration.

## Download and extract

The complete package exceeds the delivery tool's 100 MiB limit, so it is
provided as two ordinary ZIP archives:

- `concordia-website-aws-source.zip`: all code and the remaining assets.
- `concordia-website-banners.zip`: the website's public banner images.

Extract BOTH archives into the SAME parent directory. Each contains a
`concordia-website/` folder; merge them rather than creating a nested folder.
The banner files belong in `concordia-website/client/public/banners/`.
Neither ZIP is a multipart binary fragment; normal ZIP tools can extract them.
The manifest lists the complete combined package.

## Included

- React frontend, Express backend, shared schema and utilities.
- Tests, server migrations, scripts, package manifest and dependency lockfile.
- Build and TypeScript configuration, integration documentation.
- Website public assets and referenced source assets; the generated/stock image
  directories used by the existing static routes.
- A blank environment template and an archive integrity manifest.

No environment-secret values, database rows, patient uploads, sessions, Git
history, private agent context, installed dependencies or compiled bundles are
included. Unreferenced user attachments and generated troubleshooting reports
are excluded. Product image files hosted in Staff and files in remote object
storage are not downloaded into this archive.

## Build and run

Use Node.js 22 LTS and npm on Linux. Set the required environment variables in
the build/runtime environment through your AWS secret/configuration tooling.
Do not commit filled environment files or bake secrets into an AMI/image.

```sh
npm ci --include=dev
npm run check
npm run build
# After the database/storage/auth requirements below are resolved:
NODE_ENV=production PORT=5000 npm start
```

The frontend builds to `dist/public`; the backend builds to `dist/index.js`.
Express serves both on the same port. This is not a frontend-only S3 hosting
package. A Linux EC2 deployment behind an HTTPS load balancer is one possible
target; no AWS resources are provisioned by this export.

Vite exposes `VITE_*` values to browsers. Only publishable/public settings may
use that prefix. Set frontend Clerk publishable settings before building;
server secrets belong only in the runtime environment. The application does
not automatically load a root `.env` file for its backend.

## Requirements before AWS production use

### Database

`server/db.ts` uses `@neondatabase/serverless` with its WebSocket transport.
Keeping a reachable Neon PostgreSQL database can avoid changing that driver.
An ordinary Amazon RDS PostgreSQL connection is not a drop-in replacement for
this transport: port/test the driver and Drizzle adapter before switching.

The archive contains schema and migration source, not application data or a
database backup. Arrange a separately authorized, encrypted database migration,
including all required application tables and relationships. Do not blindly
run `npm run db:push` against a live database. Review schema changes first.
Startup runs several existing idempotent migrations, so verify their permissions
and compatibility on an isolated database before cutover.

### File/object storage

`server/objectStorage.ts` uses Google Cloud Storage with credentials and signed
URL operations obtained from a Replit sidecar on `127.0.0.1:1106`. That service
does not accompany this ZIP. Setting the old bucket variables alone will not
make it work on EC2.

Implement and verify an S3-backed replacement for upload, download, signed URL,
path normalization and access-control behavior, or explicitly configure another
supported credential flow. Migrate stored files separately, preserving patient
privacy, object ownership and access controls. Do not make patient documents
public to simplify migration. Remote Staff catalog images remain dependencies
of the separately hosted Staff app.

### Authentication and domains

Preserve the existing Clerk tenant/application and user identities. Review
`server/clerkAuth.ts`, `server/middlewares/clerkProxyMiddleware.ts` and client Clerk configuration
before setting publishable/secret keys; production key selection depends on
the chosen direct/proxy configuration. Register the AWS hostname and any
required proxy, redirect, webhook and allowed-origin settings in that same
tenant. Do not create a replacement tenant as part of a host move.

Audit domain-specific redirects and CORS in `server/index.ts`, URLs in
`server/routes.ts`, public metadata, canonical URLs and the legacy Replit Auth
module. Keep the original domain active until the new host is verified.

### External integrations

Staff, ConcordiaCare, PharmFlows, Resend, PrimeRx, optional AI and SMS services
remain separate services. This ZIP does not include their applications,
accounts or secrets. Restore only the credentials needed for enabled features
through secure AWS configuration. Preserve stable product/order/patient IDs,
retry payloads and existing idempotency rules.

Point inbound webhooks at the verified AWS domain and verify authentication,
raw-body signature handling, duplicates and retries. For shop requests,
acknowledgement is not proof of reservation or payment; do not introduce online
charging or local stock deduction during migration.

### Infrastructure and verification

- Use HTTPS and correctly configured trusted proxies/secure cookies.
- Support long-lived SSE and WebSocket connections; adjust idle timeouts.
- In-memory caches, event relays and background sync loops are per process.
  Multiple instances require explicit coordination; Redis is not configured.
- Do not run multiple duplicate background workers without reviewing their
  delivery and idempotency behavior.
- Review durable storage, database connectivity, outbound network access,
  health checks, logs, alarms, backups, and recovery procedures.
- Run automated tests and verify sign-in, admin access, catalog freshness,
  stock preflight, unpaid pickup/delivery, blister management, email and file
  access against isolated fixtures before changing DNS.
- This export does not certify security/compliance or successful AWS runtime
  operation. No live AWS deployment or database migration was performed.
