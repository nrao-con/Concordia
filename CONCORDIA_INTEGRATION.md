# Concordia Pharmacy — External Integration Guide

This document is for the **staff app agent** and **patient app agent** to integrate with concordianyc.com (this project).

---

## Architecture

```
Staff App (separate Replit project)
  │
  ├── pushes product changes ──► POST /api/external/products/sync
  │                              POST /api/external/products/hide
  │
  └── pushes order status ─────► POST /api/external/orders/status

Patient App (separate Replit project)
  │
  └── reads medications, alerts, etc. via /api/external/* endpoints
```

concordianyc.com is the **receiver**. The staff app is the **sender**.

---

## Authentication

All inbound requests to `/api/external/*` that require auth must include:

```
X-API-KEY: <shared secret>
```

The shared key is stored in the `CONCORDIA_WEBSITE_API_KEY` environment variable on concordianyc.com. The staff app must set the same value on its side and include it in every push.

---

## Product Sync (Staff App → This Website)

### Add or update a product

```
POST https://concordianyc.com/api/external/products/sync
X-API-KEY: <shared secret>
Content-Type: application/json
```

Body:
```json
{
  "concordiaId": "abc123",
  "externalProductId": "staff-internal-456",
  "name": "Aspirin 325mg",
  "price": 9.99,
  "stockCount": 40,
  "inStock": true,
  "category": "Pain Relief",
  "imageUrl": "https://staff-app.com/uploads/aspirin.jpg",
  "description": "Fast-acting pain relief"
}
```

- `concordiaId` — the staff app's internal product ID (required)
- `externalProductId` — an alternative ID to match on (optional; falls back to `concordiaId`)
- `inStock` — optional; if omitted, derived from `stockCount > 0`

Response:
```json
{ "ok": true, "action": "created", "id": "website-product-id" }
{ "ok": true, "action": "updated", "id": "website-product-id" }
```

**Behaviour:** matched by `externalProductId` (or `concordiaId` if none). Creates the product if not found; updates it if found. Sets `showOnWebsite: true` and `status: active` automatically.

---

### Hide or delete a product

```
POST https://concordianyc.com/api/external/products/hide
X-API-KEY: <shared secret>
Content-Type: application/json
```

Body:
```json
{
  "concordiaId": "abc123",
  "externalProductId": "staff-internal-456"
}
```

Response:
```json
{ "ok": true, "action": "hidden", "id": "website-product-id" }
{ "ok": true, "action": "not_found" }
```

**Behaviour:** sets `showOnWebsite: false` and `status: inactive` on the matched product. Does not permanently delete.

---

### Pull the full catalog (polling fallback)

```
GET https://concordianyc.com/api/external/products
X-API-KEY: <shared secret>
```

Returns the complete list of active, website-visible OTC products:

```json
[
  {
    "id": "website-product-id",
    "name": "Aspirin 325mg",
    "sku": "staff-internal-456",
    "category": "Pain Relief",
    "price": "9.99",
    "stockCount": 40,
    "inStock": true,
    "active": true,
    "imageUrl": "https://concordianyc.com/uploads/aspirin.jpg",
    "description": "Fast-acting pain relief"
  }
]
```

Use this for an initial full-sync on startup, then rely on push calls for ongoing updates.

---

## Real-time SSE Stream (Optional)

To receive live events in any connected browser or client without polling:

```
GET https://concordianyc.com/api/public/events
Accept: text/event-stream
```

No API key required. Events fired on every product change:

| Event | Payload | When |
|---|---|---|
| `product_updated` | `{id, name, price, stockQuantity, inStock, category}` | Added, restocked, made visible |
| `product_hidden` | `{id}` | Hidden from website |
| `product_deleted` | `{id}` | Permanently deleted |

---

## Order Status (Staff App → This Website)

```
POST https://concordianyc.com/api/external/orders/status
X-API-KEY: <shared secret>
Content-Type: application/json
```

Body:
```json
{
  "orderNumber": "ORD-20240101-XXXX",
  "status": "ready_for_pickup"
}
```

Valid status values: `pending`, `preparing`, `ready_for_pickup`, `sent_for_delivery`, `delivered`, `picked_up`, `processing`, `completed`, `cancelled`, `refunded`

---

## What triggers a push (staff app responsibility)

| Staff action | Call this endpoint |
|---|---|
| Product added | `POST /sync` |
| Stock adjusted | `POST /sync` |
| Product hidden | `POST /hide` |
| Product shown again | `POST /sync` |
| Product deleted | `POST /hide` |
| Order status changed | `POST /api/external/orders/status` |

---

## Setup checklist

**On concordianyc.com (this project):**
- [ ] `CONCORDIA_RX_API_KEY` — set to the shared secret in Replit Secrets (validates inbound pushes from staff app)
- [ ] `CONCORDIA_STAFF_APP_URL` — set to `https://concordia-staff.replit.app` in Replit Secrets (enables live SSE subscription)

**On the staff app:**
- [ ] `CONCORDIA_WEBSITE_API_KEY` — set to the same shared secret (sent as `X-API-KEY` on every push to us)
- [ ] Call `POST /api/external/products/sync` on every product add/update
- [ ] Call `POST /api/external/products/hide` on every product delete or visibility-off
- [ ] On startup: call `GET /api/external/products` to confirm connection

---

## Testing

```bash
# Confirm the API key works
curl https://concordianyc.com/api/external/products \
  -H "X-API-KEY: your-key"

# Push a test product
curl -X POST https://concordianyc.com/api/external/products/sync \
  -H "X-API-KEY: your-key" \
  -H "Content-Type: application/json" \
  -d '{"concordiaId":"test-1","name":"Test Product","price":5.00,"stockCount":10,"category":"General"}'

# Hide it
curl -X POST https://concordianyc.com/api/external/products/hide \
  -H "X-API-KEY: your-key" \
  -H "Content-Type: application/json" \
  -d '{"concordiaId":"test-1"}'
```
