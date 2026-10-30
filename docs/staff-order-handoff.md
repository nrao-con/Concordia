# Staff catalog and website order integration

## In-memory cache behavior

Public catalog reads share an in-flight fetch and retain the existing one-second
freshness window. Reconciliation indexes existing products by canonical Staff ID
and writes only changed Staff-owned fields. Already hidden products are not
rewritten, and row reordering alone does not change the public catalog revision.

Failed ordinary catalog/revision reads have a one-second retry cooldown and
continue returning errors, never stale availability. Forced order-time checks
bypass the catalog read/failure cache. Order handoff invalidation clears the
cooldowns. No Redis dependency, patient-data cache, or local stock deduction is
introduced.

## Ownership and authentication

The canonical Staff origin is `https://concordia-staff.replit.app`.
Staff owns product identity, stock, availability, selling price, image, and
visibility. The website never pushes its independent stock counts to Staff.
Website checkout submits a **pending, unpaid pickup or delivery request**;
online payment routes remain disabled. Website checkout does not deduct or
restore its mirrored stock. Prescription requests are not sent to Staff.

Private website integration calls use the existing backend
`CONCORDIA_RX_API_KEY` as `X-API-KEY`. Public inventory reads need no key.
Never copy the key to JavaScript, a browser adapter, error messages, or logs.

## Product pushes and late deliveries

Authenticated receiver routes:

- `POST /api/external/products/sync`
- `POST /api/external/products/hide`

Both accept positive numeric `concordiaId` or its numeric string form.
`externalProductId` can be null. The canonical ID is stored as the local
product's external identity. A nonnull `externalProductId` is only a hint
to an existing local product, never a substitute canonical ID.

The former receiver rejected numeric IDs because its schema required strings.
It also preferred the optional external reference over the canonical identity.
Both issues are removed. Invalid requests get field names and error codes,
not echoed payloads or raw exceptions.

Pushes and SSE events trigger a read of current Staff inventory. They do not
blindly apply event bodies, so a late hide cannot hide a product Staff has since
made available. No mandatory event version field is added.

A valid empty catalog hides mapped products from sale but preserves their
records and order history. Missing/hidden products acknowledge a committed
safe no-op or hide. Failed authoritative fetches or commits return 503,
not false success. Old discarded Staff operations are not replayed.

## Visible storefront

The backend listens to Staff events and the shared browser subscription uses
the same-origin `/api/inventory/events` relay (no external browser CORS or keys):

- `product_updated`
- `product_hidden`
- `product_deleted`
- `inventory_resync`

While visible, the browser checks `/api/inventory/revision` every 1,000 ms.
This backend proxy coalesces checks to Staff's
`GET /api/public/inventory/revision` and reconciles full
`GET /api/public/products` only on revision changes or recovery.

Focus, network restoration, initial SSE connection, and reconnection recover
the catalog. The shared query invalidation refreshes shop/search/detail queries
and authenticated cart data. Guest cart stock comes from the same catalog.
Hidden/absent/short-stock items block checkout, and server-side checkout
rechecks Staff inventory regardless of what the browser previously saw.

If the published Staff revision endpoint is absent, bounded five-second catalog
polling provides recovery. This fallback is not proof the requested Staff
revision protocol is deployed. The optional Staff inventory-sync.js adapter
is not required by this site's equivalent adapter.

## Immediate orders and recovery

After local order lines are saved, the backend persists the full handoff before
POSTing to:

`https://concordia-staff.replit.app/api/public/webhooks/new-order`

The saved payload contains stable website `id` and `orderNumber`, source
`website`, actual status, ISO creation/update timestamps, payment/fulfillment
details, notes, and 1–100 `orderItems`. Each line includes name, quantity 1–100,
precise unit price, and canonical `concordiaProductId`, not a local product or
order-line ID.

Retries reuse the exact persisted body and external order ID. The outbox retains
network failures and unsuccessful acknowledgments with bounded backoff. Invalid
payloads/authentication rejections and exhausted retries remain visible as
failed entries for staff review; they are not deleted. Legacy unkeyed failed
order sends are not automatically migrated or replayed.

Staff has confirmed transactional stock handling and duplicate-order protection.
However, this webhook imports upstream orders and may preserve shortages.
Its acknowledgment proves receipt only: it does **not** prove availability,
reservation, sale completion, or permission to charge. The website has not
verified Staff's reservation/payment journey. Its duplicate-delivery fixture
proves the sender's stable identity/body, not live reservation behavior.

No central checkout/reservation call is currently made. Do not add one followed
by an independently identified webhook order. Any future reservation/payment
contract must reuse one agreed order identity throughout.

### Exact current request

`POST https://concordia-staff.replit.app/api/public/webhooks/new-order`

Headers: `Content-Type: application/json`, `Accept: application/json`,
`X-API-KEY: <backend-only website integration credential>`.

Representative synthetic payload (fields below are the builder's actual keys;
optional contact/fulfillment fields may be null):

```json
{
  "id": "website-order-fixture",
  "orderNumber": "ORD-FIXTURE",
  "source": "website",
  "status": "pending",
  "createdAt": "2026-10-23T12:00:00.000Z",
  "updatedAt": "2026-10-23T12:00:00.000Z",
  "customerName": "Isolated Fixture",
  "customerEmail": null,
  "customerPhone": "2025550101",
  "deliveryMethod": "pickup",
  "shippingAddress": null,
  "pickupSlot": null,
  "paymentStatus": "collect_at_counter",
  "paymentMethod": "cash",
  "notes": null,
  "orderItems": [
    { "concordiaProductId": 123, "name": "Fixture item", "quantity": 2, "unitPrice": 4.25 }
  ]
}
```

There are no stock counts, payment instructions, or reservation guarantees in
this payload. `id` is the saved website order ID, not the line/product ID;
`orderNumber` and timestamps come from that saved order. `source` is fixed to
`website`. Contact values can be supplied from the authenticated request context.

### Commit, acknowledgment, payment timing

1. The backend reads current Staff catalog availability and calculates local
   request prices. This preflight is a snapshot, not an atomic reservation.
2. The local pending order header is committed, followed by its line inserts.
   These existing writes are separate, not one atomic header/lines/outbox
   transaction. A crash or line-insert failure may leave an incomplete pending
   local record; that must not be interpreted as an accepted sale.
3. After lines exist, the full payload is committed to the durable outbox.
4. The backend attempts the webhook and awaits up to ten seconds. Only a
   successful JSON response with `ok:true` or `success:true` and the matching
   order ID/number is recorded as acknowledged. Tests/dry-runs and explicit
   failures do not count. Timeout/failure is uncertain receipt, not rejection
   or proof Staff did not commit. The locally saved request is retained.
5. The HTTP response describes **request saved / receipt acknowledged or
   needs review**, with `requestOnly:true`, `reservationStatus:"unverified"`,
   and the saved payment status.
6. No payment is taken online. Guest, member and trusted-app OTC paths accept
   pickup or delivery requests, with a required complete contact phone number.
   Pickup retains `collect_at_counter`; delivery is `unpaid`. The legacy
   `cash` transport value does not charge anyone or promise cash collection by
   a driver. Staff calls to confirm availability, fulfillment, any delivery
   charges and payment arrangements. Card/wallet/payment-intent claims are
   rejected, even with an apparently confirmed intent.
   Delivery requires a selected map result and independent server-side forward
   verification before saving. Apartment/unit text is appended only afterward.
   `POST /api/checkout` and online payment-session routes remain disabled.
   The unexposed legacy authenticated checkout helper is not evidence of
   verified payment; do not enable it without server-side processor validation
   and an agreed Staff reservation contract. Counter collection itself has
   not been verified by this website.

Retries deserialize the persisted outbox payload, validate it, and send the
same saved ID/number/timestamps/lines. They do not run the order builder again
or create another order. There are at most ten delivery attempts with bounded
backoff; invalid/auth-rejected/exhausted entries stay failed for review. The
guest HTTP entry also requires an `Idempotency-Key`. Modern random
`shop-request-` keys are retained in tab session storage until receipt, without
contact details, and have a non-IP-bound server scope. Reload/network recovery
can reuse the same key. Historical guest keys keep their original IP-bound
scope; no uncertain historical sends are migrated or replayed. Definitive
preflight failures release their uncompleted claim so restocking can be retried.
Cross-device/new-tab purchases are separate intents; upstream webhook retries
always retain the saved external order ID.

`GET /api/external/orders/since/:timestamp` remains authenticated polling recovery,
includes full order items with canonical product IDs, and includes orders
modified since the watermark as well as newly created orders.

## Staff-controlled shop feeds and member/app requests

All public shop/search/detail/categories, website, app and authenticated external
product feeds select only current canonical Staff listings. Local-only products
and local price/quantity overrides are not shop data. Relative Staff image paths
resolve against Staff's origin, not the website's separate storage.
Cart rows for hidden/removed products remain removable and unavailable. Network
failures also mark nested member-cart products unavailable, not just shop cards.

`POST /api/shop/order-requests` uses existing patient/caregiver authentication.
It requires `Idempotency-Key` and accepts only `guestName`, `guestPhone`, optional
`guestEmail`, optional `notes`, `deliveryMethod` (pickup by default), and the
optional delivery address/unit/verification fields. Patient identity and shop items come from
the server-resolved patient and owned cart, never browser IDs/prices/payment
claims. It creates an owned pending OTC request through the shared Staff handoff.
Prescription selections remain in their separate workflow and cart.
Replay returns the saved response even after cart cleanup. Cleanup removes only
submitted rows with unchanged owner and quantity, retaining items added/changed
in another tab. Uncertain local failures retain the claim for review.

Both guest and member shop carts now lead to `/express-checkout`; member checkout
reads `/api/cart`, not guest localStorage or the disabled online checkout.
It waits for patient hydration and reports cart-loading failure explicitly.
The legacy `/checkout` browser route is an alias to this same request page,
so older chat and sitemap links cannot enter the retired payment screen.
The legacy online-checkout backend remains disabled.

OTC `POST /api/external/orders` now uses the same Staff-priced request service
and immediate webhook, rather than trusting app line prices or waiting solely
for polling. **The calling app must send a stable `Idempotency-Key`.**
Missing keys return 400; changed-body key reuse returns 409; duplicates return
the saved request. The supplied total must match current Staff-derived prices.
An explicit pharmacy patient ID must exist. Contacts never assign ownership;
without an explicit ID the request stays guest-owned. Prescription/mixed branches
are not forwarded to Staff.

After a Staff import attempt, including an uncertain/lost response, the website
invalidates its inventory cache and notifies visible clients to recover Staff
state. The next read bypasses the old cache. A fetch started before invalidation
cannot mark its old snapshot fresh. This is read-only reconciliation, not a
website deduction or reservation. Receipt alone still proves no stock guarantee.

## Staff status callbacks

Authenticated receiver:

`PATCH /api/external/orders/:externalOrderId/app-status`

Body:

```json
{
  "appStatus": "ready_for_pickup",
  "concordiaOrderNumber": "STAFF-example"
}
```

Supported normal states/aliases include pending, processing/preparing,
ready/ready_for_pickup, out_for_delivery/sent_for_delivery, delivered, picked_up,
and completed (mapped by pickup/delivery method).

Callbacks update the existing order, record the Staff reference in the audit,
and notify local customer-facing consumers. Duplicate/late callbacks do not
change timestamps, decrement stock, create orders, or send another callback.
Forward recovery can skip a missed intermediate state on the same fulfillment
path; regressions and contradictory fulfillment paths are ignored.

Cancellation/refund requests are audited separately and rejected with a missing
central inventory-transition-contract message. Replaying a new-order webhook is
not a stock-restoring cancellation.

## Cancellation, refund, return and restock: unresolved

No central mutation endpoint is proposed as operational or enabled by this
integration. Do not guess or call one, change mirrored stock, or replay the
new-order webhook as a cancellation. Returns and restocking are not agreed.

The contract must specify a Staff-owned endpoint and operation-specific
authorization, pharmacy-scoped backend credentials (never browser keys), the
original external/Staff order identity, a unique idempotent operation ID,
authorized actor/audit reason, expected current state, affected lines and
bounded quantities. Financial refund authorization and processor verification
must be separate from inventory disposition; a returned item must not
automatically become sellable. Staff must return a durable result that duplicate
deliveries can recover. Customer cancellation requests alone must not authorize
refunds, returns or stock restoration.

## Release coordination

After the Staff update is published, verify a real **signed-in** shop and order
request journey using isolated fixtures or mocked payment/outbound transports:
catalog revision and mappings, lost/missed SSE recovery via revision/focus/
reconnect, current price changes, insufficient stock (including a shortage
between preflight and import), import acknowledgment without reserved/paid
claims, timeout-after-commit and same-ID duplicate delivery, status callback
application/duplicate/stale delivery with no loops or local stock changes.
Keep payment disabled and cancellation/refund/return/restock unresolved.

The previous browser fixture used a logged-out visitor and did not submit an
order. It is not signed-in or live Staff order-journey coverage. Do not claim
that deferred verification until performed after Staff publication, and do not
use real customer orders or uncontrolled live-stock changes.

Current browser fixture coverage includes guest cart to mocked request receipt,
silent-SSE revision recovery, shortage blocking, repricing and the explicit
unpaid/unreserved receipt. No real orders, Staff mutations or payments were made.
The corrected synthetic Clerk login attempt reached the tenant's required-phone
gate (`form_data_missing`, `phone_number`); no settings or real accounts were
used to bypass it. Member request ownership/idempotency/price checks are covered
by isolated HTTP fixtures, not an authenticated browser session. Signed-in
browser/live Staff verification remains outstanding.

The unpaid-delivery browser fixture additionally verified phone preservation
(no silent digit truncation), pickup without an address, delivery blocked until
map selection, invalidation after street edits, unit/note forwarding, the
structured guest delivery POST, and an unpaid/unreserved mocked receipt without
a payment POST. The remaining primary-card delivery-assurance phrase was removed
and confirmed by source/build checks. These are fixture results, not live Staff
order acceptance or signed-in browser evidence.
