# Concordia Pharmacy website: technical handoff for Vivek

## 1. Scope and verification

Vivek, this handoff describes the current website source and the work needed to
move its hosting to AWS. It is not a certification that the application already
runs on AWS. Architecture and integration details below were checked against the
current repository. No AWS infrastructure, live database migration or DNS cutover
has been performed as part of this handoff.

The prior source export passed ZIP integrity checks, TypeScript checking and a
production frontend/backend build after extraction, using the workspace's
installed dependencies. That does NOT prove a clean AWS installation, production
credentials, end-to-end integration delivery or multi-instance operation.

**Important: we do not use Redis.** Do not provision ElastiCache or require a
Redis URL just to run the current code. See section 6 for the actual cache model.

## 2. What the website does

- Public pharmacy/service information, seasonal branding and SEO content.
- Product browsing, categories, search, product detail and carts.
- Unpaid pickup/delivery shop requests integrated with the separate Staff app.
- Patient sign-in/profile and authenticated patient workflows.
- Prescription-related requests, medication information and external integrations.
- Blister-pack enrollment, administration, communications and app synchronization.
- Flu-shot scheduling, admin status updates and notification/review messaging.
- Admin management, caregiver/attendant access and operational tools.
- Additional clinical/AI/document features, including OCR, notes, prior-
  authorization/appeal support, health journals and related API surfaces.

Not every optional module is necessarily enabled or externally verified. Inventory
the enabled routes with the owner before deciding what can be omitted.

The separate Staff app, ConcordiaCare/mobile app, PharmFlows and pharmacy
management systems are NOT contained in the website source ZIPs. Keeping those
systems hosted where they are while moving this website is possible, provided
network access, integration credentials and callbacks remain valid.

## 3. Application stack

Versions below are the declared package versions/ranges. `package-lock.json`
is the installation source of truth; use `npm ci` rather than updating packages
during migration.

| Layer | Current implementation |
|---|---|
| Language | TypeScript 5.6.3; Node.js ECMAScript modules |
| Frontend | React 18.3.x with Vite 6.4.x |
| Routing | Wouter 3.x, client-side routing |
| Styling/UI | Tailwind CSS 3.4.x, Radix/shadcn-style components, Lucide icons |
| Browser data | TanStack React Query 5.x |
| Forms/validation | React Hook Form and Zod |
| Animation/scroll | Framer Motion and Lenis |
| Backend | Express 5.2.x on Node.js |
| Database | PostgreSQL, Drizzle ORM 0.45.x |
| Database driver | `@neondatabase/serverless` with WebSocket transport |
| Authentication | Clerk; Express sessions also retained for caregiver/attendant context |
| Real time | Server-Sent Events and `ws` WebSockets |
| Email | Resend HTTP API |
| SMS implementation | Twilio HTTP integration, conditional on credentials |
| Storage implementation | Google Cloud Storage client using a Replit-sidecar credential/signed-URL flow |
| AI | OpenAI client, optional credential-dependent features |
| Documents | PDF, spreadsheet and Word tooling; Tesseract OCR |
| Tests | Vitest and Supertest |
| Build | Vite frontend build and esbuild Node backend bundle |

This is not a Next.js app, not a WordPress site and not a frontend-only static
site. There is no configured Redis client, Redis session store, Redis queue,
Bull/BullMQ worker or Redis-backed inventory cache.

## 4. Repository and build/run model

Key locations:

- `client/src/`: frontend pages, components, hooks and browser libraries.
- `client/public/`: public images, banners, videos and other static assets.
- `server/index.ts`: Express entry point, middleware and startup.
- `server/routes.ts`: large central route/integration module; inspect before splitting.
- `server/storage.ts`: application data access.
- `server/db.ts`: PostgreSQL connection and Drizzle adapter.
- `shared/schema.ts`: schema/types/validation shared with the application.
- `server/migrations/`: startup migration code.
- `server/clerkAuth.ts`: authentication/roles and caregiver session middleware.
- `server/middlewares/clerkProxyMiddleware.ts`: Clerk proxy handling.
- `server/staff-*`: Staff catalog, sync, events, order delivery and status logic.
- `server/concordia-care-*.ts`: cross-app synchronization.
- `server/pharmflows-client.ts`: prescription submission and connection verification.
- `server/objectStorage.ts`: storage implementation requiring AWS attention.
- `server/email.ts`, `server/sms.ts`, `server/flu-shot-notifications.ts`: messaging.
- `server/__tests__/`: backend tests; other tests may also exist beside source.
- `docs/`: existing API/integration documentation.

Recommended migration runtime: **Node.js 22 LTS on Linux**. This is a deployment
recommendation, not an existing `engines` guarantee. Validate it with a clean
installation in the target environment.

```sh
npm ci --include=dev
npm run check
npm test
npm run build
# Only after runtime configuration, database and storage are ready:
NODE_ENV=production PORT=5000 npm start
```

Development uses `npm run dev` (`tsx server/index.ts`). Production uses
`node dist/index.js`; do not run Vite's development server in production.

Build outputs:

- `dist/public/`: frontend bundle and copied public assets.
- `dist/index.js`: backend bundle.
- Backend packages are external to the bundle, so runtime `node_modules` is
  still required. Do not copy only `dist/index.js` to a server.
- Keep all installed dependencies initially. Do not assume `npm prune --omit=dev`
  is safe until production startup/imports have been tested.
- Keep runtime-served `attached_assets/stock_images/` and
  `attached_assets/generated_images/` alongside the application. These routes
  are not simply equivalent to the Vite asset bundle.
- Retain relevant OCR/runtime assets, including the supplied `eng.traineddata`.

Express serves frontend and API on one origin. It listens on `0.0.0.0`, using
`PORT` or the existing default 5000. Production HTML handling includes
route-aware SEO rendering and an SPA fallback. A reverse proxy must send API,
Clerk proxy, WebSocket and SSE traffic to Node, and preserve browser-route
fallback behavior.

## 5. PostgreSQL and data migration

`server/db.ts` uses a Neon serverless `Pool`, `ws`, and the
`drizzle-orm/neon-serverless` adapter. Configured pool maximum is five in
production and ten in development, with connection and idle timeouts.

Two different hosting choices:

1. **Move the Node application to AWS and retain the existing reachable Neon
   database.** This avoids a database-driver conversion during the hosting move.
2. **Move the database to Amazon RDS/Aurora PostgreSQL.** A normal PostgreSQL TCP
   endpoint is NOT a drop-in replacement for this Neon WebSocket transport.
   Change and test the driver/Drizzle adapter, TLS configuration, session store,
   transactions and all direct SQL before cutover.

Data includes patient-linked records, orders/lines, products and external IDs,
appointments, blister records, audit/history, integration retry/idempotency
records and other application tables. The source ZIP has schema/code, not data.

Development and production databases are separate. Confirm the actual production
database through authorized access; do not migrate a development snapshot and
assume it contains the live website's records.

Preserve primary keys, Clerk-to-patient links, canonical external IDs, foreign
keys, sequence values, timestamps, database enums, indexes, uniqueness rules,
sessions where appropriate and integration outboxes. Contact-only matching is
not a replacement for existing patient ownership relationships.

Startup applies existing idempotent PA-signature, chat-identity and blister-
enrollment migrations before registering routes. Additional initialization SQL
exists in the central routes module. Review startup DDL/permissions against a
restored staging database. `drizzle-kit push` is not a reviewed production
migration plan; do not run it blindly against live data.

The caregiver/attendant system uses `express-session` and `connect-pg-simple`
with the `sessions` PostgreSQL table. It is not Redis-backed. Retain
`SESSION_SECRET` securely if preserving existing sessions is intended. Verify
cookie behavior, store TTL and database permissions after migration.

## 6. Caches: explicitly no Redis

There is no deployed/configured Redis layer in this website implementation.
The cache optimization used the existing in-process model instead.

### Staff inventory caching

- Each Node process keeps its own catalog snapshot and revision state in memory.
- Ordinary catalog freshness window: **1,000 ms**.
- Revision-response coalescing window: **750 ms**.
- Concurrent ordinary requests share in-flight work rather than repeating it.
- Failed catalog/revision work has a **1,000 ms** retry cooldown.
- Failed reads return errors rather than stale successful availability.
- Forced order-time checks and authenticated product push hints bypass the
  ordinary catalog cache/cooldown.
- Handoff invalidation clears relevant cache/cooldown state.
- Reconciliation indexes products by canonical identity and avoids unchanged
  database writes. Reordering identical rows does not change the revision.

### Browser data and other process state

TanStack Query maintains browser-side query state. The backend also has
process-local event listeners, WebSocket connections, timers and bounded local
state such as some request rate-limit maps. These are not a distributed system.
Database-backed outbox/idempotency/session records must not be confused with
temporary caches.

Implications:

- Restarts clear memory caches; authoritative data remains in external Staff
  and/or PostgreSQL.
- Running several Node instances creates several independent cache/worker/event
  contexts. WebSocket broadcasts are not automatically cross-instance.
- Multiple workers may attempt overlapping background work; do not assume every
  existing worker has a proven distributed lease/claim protocol.
- Start with one application instance during migration. Load-test and design
  coordination before enabling horizontal scaling.
- Redis could be introduced later for specific coordination needs, but it is a
  separate engineering change, not a missing prerequisite for today's code.
- Never add long-lived/CDN caching to live inventory or private API responses
  just to improve speed.

## 7. Staff inventory is authoritative

The current Staff base URL in code is:

`https://concordia-staff.replit.app`

Staff owns product IDs, selling prices, stock/availability, visibility and image
references. The website maintains a local mirror; it must not become a second
independent inventory owner.

Current upstream interfaces:

- `GET /api/public/products`
- `GET /api/public/inventory/revision`
- `GET /api/public/events` for SSE
- `POST /api/public/webhooks/new-order` for shop request handoff

Current website interfaces to preserve:

- `GET /api/inventory/events`
- `GET /api/inventory/revision`
- `POST /api/external/products/sync`
- `POST /api/external/products/hide`
- `PATCH /api/external/orders/:externalOrderId/app-status`
- Additional Staff status/order access routes in `server/routes.ts`, including
  `POST /api/external/staff/orders/status`.

The backend consumes Staff SSE, reconciles on initial connection/reconnection
and recognized product events, and runs recovery every two minutes. Reconnects
back off from five seconds to a maximum of 60 seconds.

The browser uses the same-origin relay and checks revision approximately every
second while visible, plus focus/network recovery. If the upstream revision
endpoint is absent, bounded five-second full-catalog polling supplies fallback
recovery. A fallback is not evidence that Staff's revision protocol is deployed.

Webhook/event bodies trigger a fresh authoritative read rather than blindly
applying potentially late stock events. A valid empty upstream catalog hides
mapped items without deleting their history. An upstream failure must not be
misrepresented as an empty successful catalog or available stock.

Private website integration calls use the backend `CONCORDIA_RX_API_KEY` as
`X-API-KEY`. Other Staff-facing interfaces use their existing route-specific
credentials; do not replace all keys with one or assume `STAFF_API_KEY` and
`CONCORDIA_RX_API_KEY` are interchangeable.

## 8. Shop requests, retry safety and payment restrictions

**There is no active online payment checkout in the current application.**
The signed-in `/api/checkout` route deliberately returns 503, and legacy online
payment-status lookup returns 410. The guest/shop-request path accepts unpaid
pickup/delivery requests and rejects card/wallet payment claims.

A contact phone number is required. Delivery requires server verification of
the selected address/map result. Pharmacy staff confirms availability,
fulfillment, delivery charges and payment arrangements.

Current Staff handoff:

```text
POST https://concordia-staff.replit.app/api/public/webhooks/new-order
Content-Type: application/json
Accept: application/json
X-API-KEY: backend-only website integration credential
```

Payload keys:

```json
{
  "id": "saved-website-order-id",
  "orderNumber": "saved-order-number",
  "source": "website",
  "status": "pending",
  "createdAt": "ISO timestamp from saved order",
  "updatedAt": "ISO timestamp from saved order",
  "customerName": "synthetic example",
  "customerEmail": null,
  "customerPhone": "2025550101",
  "deliveryMethod": "pickup",
  "shippingAddress": null,
  "pickupSlot": null,
  "paymentStatus": "collect_at_counter",
  "paymentMethod": "cash",
  "notes": null,
  "orderItems": [
    {
      "concordiaProductId": 123,
      "name": "Synthetic fixture",
      "quantity": 1,
      "unitPrice": 4.25
    }
  ]
}
```

The `cash` transport label does not mean that online payment occurred or that a
driver has agreed to collect payment. Pickup retains `collect_at_counter`;
delivery is unpaid.

Current sequence:

1. Fresh Staff inventory preflight; a snapshot, NOT an atomic reservation.
2. Local pending order header, then order lines are saved.
3. Full handoff body is persisted in a durable database outbox.
4. Backend attempts delivery, waiting up to ten seconds.
5. Matching successful JSON acknowledgement records receipt; timeout is uncertain
   delivery, not proof Staff rejected or did not commit.
6. Retry reuses the same saved external order ID and exact persisted payload.

**Known gap:** order header, lines and outbox are not one atomic transaction.
Crashes can leave incomplete pending local records. Preserve their uncertain
state; do not reinterpret them as completed sales.

Staff's webhook imports accepted upstream requests and can preserve shortages.
Even though Staff has stock transactions and duplicate-order protection, its
acknowledgement is not a verified reservation, availability guarantee or
authorization to charge.

Do not:

- Enable Stripe/card/wallet checkout simply because the hosting changes.
- Deduct/restock inventory independently on this website.
- Add a central checkout call plus an independently identified webhook order.
- Regenerate order IDs when retrying after deployment.
- Replay the new-order webhook to cancel an existing order.

Cancellation/refund/return/restock contracts remain unresolved until explicitly
agreed with Staff. Preserve that status during migration.

## 9. Other integrations and boundaries

### PharmFlows

Prescription requests only; not grocery/OTC orders.

`POST https://pharmflows.com/api/external/prescription-requests`

Backend credentials: `PHARMFLOWS_API_KEY`, `PHARMFLOWS_PHARMACY_CODE`.
Authentication: `x-api-key`. A patient-free `_test:true`, `dryRun:true` request
must receive a matching confirmed response before a real submission.

Run `npm run pharmflows:check` with secure configuration to test that handshake
without sending patient information. The existence of code/secrets does not
prove the currently published receiver accepts the connection.

### ConcordiaCare and blister synchronization

Review `server/concordia-care-sync.ts` and
`server/concordia-care-blister-sync.ts`, their outbound routes, retry records,
shared-secret checks and the configured target URL. Preserve immutable
website/patient/enrollment identifiers, pending retries and the receiver's
expected payload. The app's database and source are not included in this export.

Do not replace failed delivery with contact-only identity matching, delete
remote medications simply because they are absent from one update, or resend
uncertain creates with new identities.

### PrimeRx

PrimeRx API/import/webhook code exists. Preserve existing credentials, endpoint,
pharmacy identity and webhook authorization. Unknown imported identities need
review; migration is not permission to automatically enroll them as website users.

### Email and SMS

- Email calls Resend from the backend using `RESEND_API_KEY`.
- `EMAIL_FROM` must identify an allowed verified sender. The current code has
  an `onboarding@resend.dev` fallback; do not treat that fallback as production-
  ready sender-domain configuration.
- SMS code uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
  `TWILIO_FROM_NUMBER` or `TWILIO_PHONE_NUMBER`.
- SMS implementation present does NOT mean an active SMS account/number is
  configured or delivery has been verified.
- Flu-shot notification code handles booking/status updates and completed-
  appointment feedback invitations, with per-appointment/status/channel
  idempotency. Preserve notification records during the database move.
- `FLU_SHOT_REVIEW_URL` controls the optional review link.
- Verify actual delivery to controlled contacts after migration, not just a
  successful appointment save.

### AI/document/external APIs

`OPENAI_API_KEY` enables optional OpenAI features. OCR/PDF/document tooling may
need outbound network access and has different CPU/memory demands from browsing.
Inventory all remaining external URLs and clinical/data-processing providers
before setting egress rules. Do not assume their package installation proves
their contracts, permissions or production credentials are active.

## 10. File storage: a required AWS change

The current `server/objectStorage.ts` uses `@google-cloud/storage` with a local
Replit sidecar at `127.0.0.1:1106` for credential/signing operations.
That credential service is not included in the ZIP and is not available merely
by starting Node on an AWS server.

`PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR` describe the existing
storage layout. They are not S3 configuration. `@uppy/aws-s3` in frontend
dependencies does not mean the current backend is already using an AWS bucket.

For S3, implement and verify equivalent behavior for:

- Upload initiation and presigned URLs.
- Download paths and signed/private access.
- Public-versus-private object classification.
- Object ownership and record associations.
- Path normalization, allowed types/size limits, expiry and browser CORS.
- Private ACL/authorization checks and audit behavior.
- Existing-file migration and references stored in the database.

Use an instance/task IAM role or appropriate managed identity rather than
hardcoded AWS access keys. Restrict bucket access and encryption policy.

There are three distinct asset groups:

1. Bundled/static website assets included in the ZIP downloads.
2. Dynamic product images referenced from Staff, which remain external.
3. Uploaded documents/images in remote object storage, which are NOT in the ZIP.

Migrating one group does not migrate the other two.

## 11. Clerk, HTTPS, CORS and domain configuration

Preserve the existing Clerk application/tenant and its user IDs. Do not create a
replacement Clerk tenant, swap test/live identities or bulk remap patients as a
side effect of moving hosting.

The code has development, proxy and direct/external production key-selection
paths. Review the effective combination of:

- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY_DEV`, `VITE_CLERK_PUBLISHABLE_KEY_DEV`
- `VITE_USE_DIRECT_CLERK`
- `VITE_EXTERNAL_CLERK_PUBLISHABLE_KEY`, `EXTERNAL_CLERK_SECRET_KEY`
- `VITE_CLERK_PROXY_URL`, `CLERK_WEBHOOK_SECRET`

Do not populate every key with unrelated tenant credentials. Follow current
selection logic in `server/clerkAuth.ts` and the browser setup.

The code treats `concordianyc.com` as the canonical direct-production origin.
There are explicit redirects for selected alternate hostnames and an allowlist
containing the website, Staff, ConcordiaCare and PharmFlows origins. Audit these
in `server/index.ts` for the AWS staging hostname and final domain. These
configured strings are not a fresh verification of public DNS/deployment state.

Clerk proxy middleware must precede JSON/urlencoded body parsing. Webhook
verification also depends on preserved raw request bytes. An AWS proxy must not
silently rewrite these request bodies or strip required headers.

Express uses `trust proxy = 1`; verify this matches the actual trusted hop
topology rather than copying it blindly behind several proxies. Production
caregiver session cookies are secure, HTTP-only and SameSite=Lax. Test actual
HTTPS cookies and redirects behind the final load balancer.

Preserve Clerk role metadata/admin authorization and protected-route ownership
checks. A browser sign-in alone is not proof API-side patient hydration/ownership
is ready.

Use relative same-origin frontend API URLs. Review existing uses of
`REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN` for generated links, callbacks and signature
URLs; do not manufacture equivalent AWS values without reviewing semantics.
Legacy Replit Auth source is not the primary login system.

## 12. AWS infrastructure recommendation

This is a proposed baseline, not infrastructure already provisioned:

- A long-running Node service, initially one instance, such as Linux EC2 managed
  by a service supervisor, behind an HTTPS Application Load Balancer.
- Existing Neon initially, OR a separately tested RDS driver/data migration.
- S3 after the storage adapter and object migration are implemented.
- Secrets Manager/secure Parameter Store or equivalent for runtime secrets.
- Restricted security groups, private database access where applicable and
  required outbound HTTPS/database connectivity.
- Centralized structured logs, metrics, alerts, backups and recovery procedures.
- DNS/certificate management with verified domain access.
- Optional CDN for appropriately public static assets only.

Do not select S3-only hosting or request-only Lambda as a drop-in migration:
this application includes an Express API, long-running sync loops and streaming
connections. Containerization, serverless rearchitecture and autoscaling are
separate projects, not assumptions of this export.

Streaming requirements:

- WebSocket upgrade paths `/ws/admin` and `/ws/staff`.
- Inventory SSE `/api/inventory/events`, with 20-second keepalives and
  `Cache-Control: no-cache, no-transform`.
- Other SSE/real-time endpoints in the central routes module.
- Proxy buffering/compression and idle timeouts must not break event delivery.
- Preserve authentication and one-time ticket semantics on protected streams.

Add an explicit liveness/readiness design before production load balancing;
do not assume an undocumented `/api/health` route exists or that serving `/`
proves database, Staff and storage readiness.

Cache fingerprinted public build assets appropriately, but do not CDN-cache
patient/admin responses, authenticated requests, live inventory APIs, webhooks
or SSE. Avoid putting patient data into proxy/provider logs.

## 13. Configuration/access Vivek needs

Provide access by least privilege, through owner-approved accounts/secure secret
sharing, NOT by putting real credentials into this document, ZIPs or chat.

| Area | Required handoff |
|---|---|
| Code | Both source/asset ZIPs, lockfile and integration docs |
| AWS | Approved account, region, IAM permissions, network and cost owner |
| Domain | DNS/certificate control and agreed final/staging hostnames |
| Database | Authorized production access, backup/restore plan, chosen Neon/RDS path |
| Storage | Existing bucket/object access, path/ACL map, encrypted transfer plan |
| Clerk | Access to the same app/tenant and correct production-domain configuration |
| Staff | Existing integration credentials, receiver owner and callback coordination |
| ConcordiaCare | Target URL, shared authentication and retry/identity contracts |
| PharmFlows | Pharmacy-scoped code/key and verified dry-run response |
| Messaging | Resend sender/domain access; SMS account/number only if enabled |
| Operations | Log/alert ownership, backup schedule and rollback approval |

Core runtime names: `DATABASE_URL`, `NODE_ENV`, `PORT`, `SESSION_SECRET`, correct
Clerk key combination. Feature-dependent names include:

```text
CONCORDIA_RX_API_KEY
STAFF_API_KEY
CONCORDIA_CARE_APP_URL
CONCORDIA_WEBSITE_URL
CONCORDIA_WEBSITE_API_KEY
VITE_CONCORDIA_CARE_APP_URL
PHARMFLOWS_API_KEY
PHARMFLOWS_PHARMACY_CODE
PHARMFLOWS_TIMEOUT_MS
RESEND_API_KEY
EMAIL_FROM
FLU_SHOT_REVIEW_URL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
TWILIO_PHONE_NUMBER
PRIMERX_API_URL
PRIMERX_CLIENT_ID
PRIMERX_CLIENT_SECRET
PRIMERX_MEMBER_ID
PRIMERX_PHARMACY_NPI
OPENAI_API_KEY
ADMIN_NOTIFICATION_EMAIL
PHARMACY_TEAM_EMAIL
PHARMACY_TEAM_SMS
PUBLIC_OBJECT_SEARCH_PATHS
PRIVATE_OBJECT_DIR
```

This is a functional configuration checklist, not a declaration that every
listed value is currently configured. Inspect the specific code path before
requesting optional credentials. Other legacy/bootstrap/SEO settings exist;
review source references rather than copying all old workspace variables.

Only public settings may have a `VITE_` prefix: they are exposed to the browser
and baked into frontend builds. Server API keys must never use that prefix.
The backend does not automatically load a root `.env` file. Inject runtime
variables through the service configuration, and supply public build settings
before `npm run build`. Never log secret values while testing configuration.

## 14. Migration sequence and acceptance checklist

### Stage and prepare

1. Extract BOTH downloads into the same parent folder, merging
   `concordia-website/`. Read `docs/aws-source-export.md` and `.env.aws.example`.
2. Review `docs/staff-order-handoff.md`, `docs/pharmflows-connection.md`,
   `docs/concordiacare-app-api-spec.md`, `API_DOCUMENTATION.md` and
   `CONCORDIA_INTEGRATION.md` against the current implementation.
3. Establish a staging environment and restored isolated database. Do not send
   real patient information to test receivers.
4. Resolve storage, database-driver choice, origins, Clerk and secrets before
   declaring runtime readiness.
5. Perform a clean lockfile install, type check, test run, build and startup.
   Investigate failures; do not treat a build alone as production acceptance.

### Verify with isolated fixtures/mock transports where appropriate

- Public routes, deep links, SEO HTML and static/banner/video assets.
- Same-tenant sign-in/sign-out, patient linkage, admin roles and caregiver access.
- Private upload/download permissions; unauthorized cross-patient access denied.
- Product images, canonical IDs, prices, categories, hidden/zero-stock items.
- Staff initial sync, SSE reconnect, missed-event recovery and revision fallback.
- Late/duplicate inventory events do not overwrite newer Staff truth.
- Shop phone requirement, delivery-address verification and insufficient stock.
- Persisted unpaid request, uncertain acknowledgement and retry with identical ID/body.
- Duplicate order delivery and authenticated status callbacks.
- No online payment, local stock deduction or accidental new-order cancellation.
- Blister create/update/sync and recovery of uncertain prior sends.
- PharmFlows patient-free verification and controlled prescription submission.
- Flu-shot booking/status/completion notifications and duplicate suppression.
- WebSocket/SSE auth, stability, reconnects and proxy timeouts.
- Restart recovery of database outboxes; no lost records or duplicate workers.

### Production cutover

6. Back up database and objects; record a restore point and validation results.
7. Coordinate write freeze/final delta if moving the database. Avoid independent
   old/new writers creating divergent live data.
8. Point approved callback URLs to AWS and coordinate sender retry behavior.
   Keep IDs/idempotency records stable across old and new hosts.
9. Change DNS only after explicit acceptance. Monitor errors, latency, pool use,
   inventory freshness, outbox age/failures and actual notification delivery.
10. Keep an actionable rollback plan. DNS rollback alone is insufficient if the
    old database/storage no longer has writes accepted on AWS; plan data
    reconciliation before reverting.

## 15. Items still requiring engineering/contract decisions

- AWS-compatible object storage implementation and existing-file migration.
- RDS driver conversion and database migration, if RDS is selected.
- Clean target-runtime installation/startup and environment verification.
- Production email sender and SMS delivery validation, where enabled.
- Atomic local order-header/lines/outbox creation.
- Verified reservation/payment contract before enabling online checkout.
- Agreed cancellation/refund/return/restock authorization and endpoints.
- Horizontal-worker coordination, cross-instance real-time delivery and
  distributed rate limiting before autoscaling.
- Load-test-based capacity, readiness checks, monitoring and recovery drills.
- Appropriate privacy/security review for patient data and the selected providers.

Do not describe the application as HIPAA-compliant or fully AWS-ready solely
because its source builds. Hosting agreements, service configuration, access
controls, data handling and operational processes need their own review.

**Summary:** move hosting without changing identity, inventory ownership or order
semantics. PostgreSQL is the durable store; Staff owns inventory; Clerk owns
primary sign-in; storage currently needs an AWS adaptation; Redis is not used.
