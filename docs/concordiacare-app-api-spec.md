# ConcordiaCare Mobile App — External API Contract

**Version:** 1.1
**Last updated:** September 2026
**Purpose:** This document is the complete specification for every HTTP endpoint the ConcordiaCare mobile app must expose so the Concordia Pharmacy backend can push real-time updates. It also documents what the app can call on the pharmacy backend.

---

## Authentication

Every inbound call from the pharmacy backend includes:

```
X-API-KEY: <shared secret>
Content-Type: application/json
```

The shared secret must match the Concordia integration key stored in the app.
The pharmacy backend reads its preferred copy from `CONCORDIA_RX_API_KEY` (with legacy `API_KEY` compatibility) and the app base URL from `CONCORDIA_CARE_APP_URL`.

Expected response for all endpoints on success: **HTTP 200** with a JSON body.  
Any non-2xx response causes the pharmacy backend to queue the call to the sync outbox and retry with exponential back-off (1 min → 2 → 4 → 8 → 16, max 5 attempts).

---

## Endpoints the App Must Implement (Pharmacy → App)

### 1. Order / Delivery Status Update

**Triggered when:** A pharmacist or the courier system changes an order's status or delivery stage.

```
POST /api/external/order-status-update
```

**Payload:**
```json
{
  "orderId": "uuid",
  "deliveryStatus": "pending | processing | completed | cancelled | assigned | picked_up | in_transit | out_for_delivery | delivered | failed | returned",
  "patientEmail": "jane@example.com",      // nullable
  "concordiaCareUserId": "app-user-uuid"   // nullable — prefer this for lookup
}
```

**What to do:** Find the patient by `concordiaCareUserId` (primary) or `patientEmail` (fallback). Update their order status in the app and fire a push notification, e.g. "Your order is out for delivery."

**Response:**
```json
{ "success": true }
```

---

### 2. Prescription (Rx) Status Update

**Triggered when:** PrimeRx sends a workflow/queue event (e.g. filled, ready for pickup, shipped).

```
POST /api/external/rx-status-update
```

**Payload:**
```json
{
  "rxNumber": "RX-123456",
  "medicationName": "Lisinopril 10mg",
  "workflowStatus": "FILLED | READY_FOR_PICKUP | SHIPPED | ON_HOLD | CANCELLED",
  "queueName": "string — PrimeRx queue label",
  "patientEmail": "jane@example.com",      // nullable
  "concordiaCareUserId": "app-user-uuid"   // nullable
}
```

**What to do:** Update the prescription entry for the patient in the app and send a push notification, e.g. "Your prescription is ready for pickup."

**Response:**
```json
{ "success": true }
```

---

### 3. Medication List Sync

**Triggered when:** A pharmacist manually syncs a patient's medications, or PrimeRx reports a new/updated prescription.

```
POST /api/external/sync-medications
```

**Payload:**
```json
{
  "concordiaCareUserId": "app-user-uuid",  // nullable
  "patientEmail": "jane@example.com",      // nullable
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "555-0100",                     // nullable
  "dateOfBirth": "1985-03-15",             // nullable, ISO date
  "createIfNotExists": true,
  "medications": [
    {
      "name": "Lisinopril",
      "dosage": "10mg",
      "frequency": "Once daily",
      "rxNumber": "RX-123456",
      "refillsRemaining": 3,
      "prescribedBy": "Dr. Smith",
      "instructions": "Take with water in the morning",
      "ndc": "00093-1049-01",
      "quantity": 30,
      "status": "active | on_hold | discontinued | expired",
      "lastFilledDate": "2026-04-01",      // nullable, ISO date
      "nextRefillDate": "2026-05-01"       // nullable, ISO date
    }
  ]
}
```

**What to do:** Replace the patient's full medication list in the app. If `createIfNotExists` is true and the patient is not found, create a shell profile so the medications are ready when they sign up.

**Response:**
```json
{ "success": true, "updated": 4 }
```

---

### 4. Product Catalog Sync

**Triggered when:** A pharmacist publishes one or more draft products from the Pending Review queue.

```
POST /api/external/sync-products
```

**Payload:** *(empty body — app should pull fresh catalog)*
```json
{}
```

**What to do:** Trigger a full OTC product catalog refresh by calling back to the pharmacy backend:

```
GET <PHARMACY_BACKEND_URL>/api/products
X-API-KEY: <shared secret>
```

Then update the local product database in the app.

**Response:**
```json
{ "success": true }
```

---

### 5. Blister Pack — Create

**Triggered when:** A pharmacist creates a new blister pack patient.

```
POST /api/external/create-blister-pack
```

**Payload:**
```json
{
  "patientEmail": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "555-0100",
  "dateOfBirth": "1985-03-15",            // nullable
  "userId": "app-user-uuid",              // nullable
  "name": "Weekly Pack — April",
  "durationDays": 7,
  "startDate": "2026-05-01",
  "medications": [
    {
      "name": "Metformin",
      "strength": "500mg",
      "quantity": 1,
      "timeSlot": "Morning | Afternoon | Evening | Bedtime",
      "customTime": "08:00",              // nullable
      "instructions": "Take with food"
    }
  ]
}
```

**Response:**
```json
{ "success": true, "blisterPackId": "app-internal-id" }
```

---

### 6. Blister Pack — Update

**Triggered when:** A pharmacist edits an existing blister pack.

```
PATCH /api/external/blister-pack/:id
```

**Payload:** Same shape as Create (all fields), plus:
```json
{
  "status": "active | paused | completed | cancelled"
}
```

**Response:**
```json
{ "success": true }
```

---

### 7. Blister Pack — Delete

**Triggered when:** A pharmacist removes a blister pack patient.

```
DELETE /api/external/blister-pack/:id
```

*No body.*

**Response:**
```json
{ "success": true }
```

---

### 8. Send Notification to Patient

**Triggered when:** A pharmacist sends a manual alert from the Admin dashboard.

```
POST /api/external/send-notification
```

**Payload:**
```json
{
  "title": "Reminder: Pick Up Your Medication",
  "message": "Your prescription is ready at the pharmacy.",
  "type": "rx_ready | refill_reminder | order_update | general | blister_alert",
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "555-0100",
  "dateOfBirth": "1985-03-15",            // nullable
  "patientEmail": "jane@example.com",     // nullable
  "blisterPackId": "app-internal-id",     // nullable — if notification relates to a blister pack
  "userId": "app-user-uuid"              // nullable — prefer this for lookup
}
```

**What to do:** Deliver a push notification (and optionally an in-app message) to the matched patient.

**Response:**
```json
{ "success": true }
```

---

### 9. Create Patient Profile (Pre-registration)

**Triggered when:** A pharmacist links a patient in the admin panel before the patient has signed up in the app.

```
POST /api/external/create-patient
```

**Payload:**
```json
{
  "concordiaUserId": "pharmacy-internal-uuid",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",            // nullable
  "phone": "555-0100",                    // nullable
  "dateOfBirth": "1985-03-15",            // nullable
  "username": "janedoe"                  // nullable
}
```

**What to do:** Create a pending/shell patient profile in the app. Never merge it into an account based on matching email or phone. Link only after the signed-in Clerk subject resolves to a pharmacy patient and the legacy profile passes explicit identity review.

**Response:**
```json
{ "success": true, "concordiaCareUserId": "app-user-uuid" }
```

The returned `concordiaCareUserId` is stored on the pharmacy side to identify this patient in all future pushes.

---

## Endpoints the App Can Call on the Pharmacy Backend (App → Pharmacy)

### Signed-in patient's canonical identity

`GET /api/patient/canonical-identity`

Pass the signed-in patient's session JWT in `Authorization: Bearer <token>`.
This endpoint uses the pharmacy website's active Clerk tenant to verify the
token. It looks up the exact verified Clerk subject in the pharmacy users
table. It does **not** accept an API key alone, a patient ID, email, phone,
or a contact-matched account as proof of identity. The app backend should call
this endpoint for the signed-in patient, never use the all-patient feed to
decide who is signed in.

On success (`200`), the response is limited to:

```json
{
  "pharmacyUserId": "immutable-pharmacy-user-id",
  "canonicalPatientId": "CP-000321",
  "concordiaCareUserId": null,
  "linkStatus": "unlinked"
}
```

`linkStatus` is `"linked"` only when the pharmacy already has a
ConcordiaCare profile ID for that exact pharmacy user. It is **not** staff
approval or authorization to access migrated app data; ConcordiaCare must
enforce its own approved one-to-one link before granting access.

`401` means no valid session for this tenant; `404` with
`code: "identity_link_required"` means no pharmacy patient belongs to that
Clerk subject; `409` with the same code means the patient record lacks a valid
canonical CP ID and needs review. `500` means resolution is unavailable.
Responses are marked `Cache-Control: no-store`.

The website no longer claims an existing unlinked pharmacy patient by matching
Clerk email. Such a collision needs explicit identity review; authenticated
website routes return `409` with `code: "identity_link_required"`.

Additional pharmacy backend endpoints:

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/external/match-patient` | POST | X-API-KEY | Find a pharmacy patient by name + DOB + contact info |
| `/api/external/link-patient` | POST | X-API-KEY | Permanently link an app user ID to a pharmacy patient record |
| `/api/external/medications` | POST | X-API-KEY | Add, update, or deactivate a medication for an already-linked patient |

### Linked patient identity requirements

- The pharmacy patient record is the canonical source for name, phone, address, insurance, pharmacy patient ID, and pharmacy-verified prescriptions.
- After linking, the app must refresh the patient through `GET /api/external/patients/:id` and replace stale local profile fields with the returned canonical values.
- Medication writes to `POST /api/external/medications` must include the immutable `concordiaCareUserId`. Email, phone, name, and date of birth are attributes and are never accepted as medication ownership keys.
- A missing or unknown `concordiaCareUserId` fails closed. The app must complete `/api/external/link-patient` before sending medication updates.
- The app must not create a second patient profile when the pharmacy patient ID or mobile link is already present. Identity conflicts return `409` and require explicit reconciliation.
| `/api/external/patients/:id` | GET | X-API-KEY | Full patient profile (insurance, allergies, conditions, family) |
| `/api/external/patients/:id/wallet` | GET | X-API-KEY | Loyalty points balance, lifetime earnings, active streaks |
| `/api/external/patients/:id/rewards` | GET | X-API-KEY | Available rewards and redemption history |
| `/api/external/transfer-request` | POST | X-API-KEY | Submit a new prescription transfer request |
| `/api/external/refill-request` | POST | X-API-KEY | Request a refill for a specific Rx number |
| `/api/products` | GET | X-API-KEY | Full OTC product catalog (call this after receiving sync-products) |
| `/api/external/primerx/webhook` | POST | X-API-KEY | PrimeRx sends prescription lifecycle events here |
| `/api/external/fraud-alerts` | POST | X-API-KEY | Send a privacy-safe app fraud signal to the protected pharmacy admin alert log |
| `/api/external/mobile/specialty-requests` | POST | X-API-KEY | Submit a retry-safe specialty request into the pharmacy Admin queue |
| `/api/external/mobile/specialty-requests/:externalRequestId` | GET | X-API-KEY | Read patient-safe request status and assignment state |

### Specialty Request Intake

`POST /api/external/mobile/specialty-requests`

```json
{
  "externalRequestId": "mobile-specialty-unique-id",
  "concordiaCareUserId": "immutable-app-user-id",
  "medicationName": "Medication name",
  "patientName": "Patient name",
  "phone": "Patient phone",
  "email": "optional@example.com",
  "prescriberName": "Prescriber name",
  "requestType": "new_prescription",
  "notes": "Optional notes"
}
```

`externalRequestId` is required and retry-safe. Reusing it with identical data returns the original Admin request ID. Reusing it with different data returns `409`. The mobile request is linked only through the immutable `concordiaCareUserId`; contact fields are never used to infer account ownership.

Success response:

```json
{
  "requestId": 123,
  "externalRequestId": "mobile-specialty-unique-id",
  "source": "mobile_app",
  "status": "pending",
  "correlationId": "server-correlation-id"
}
```

`GET /api/external/mobile/specialty-requests/:externalRequestId` returns the Admin request ID, external request ID, status, assignment state, and update time. It never returns internal Admin notes.

The staff app uses the equivalent routes:

- `POST /api/external/staff/specialty-requests`
- `GET /api/external/staff/specialty-requests/:externalRequestId`

Staff routes authenticate with `STAFF_API_KEY`. `patientId` is optional; when supplied it must exactly match an existing immutable pharmacy patient ID. Requests without a patient ID remain unlinked rather than being matched by contact information.

### ConcordiaCare Fraud Alert

`POST /api/external/fraud-alerts`

The app sends one event after its own fraud controls detect a medium, high, or critical risk. The pharmacy backend records the event once, audits it, and sends a realtime notification to authenticated pharmacy admins.

```json
{
  "eventId": "app-fraud-01J8M4Y4K2",
  "signalType": "account_takeover",
  "severity": "high",
  "occurredAt": "2026-09-08T20:30:00.000Z",
  "metadata": {
    "action": "sign_in",
    "reasonCode": "NEW_DEVICE_FAILURE_VELOCITY",
    "failedAttempts": 7,
    "windowMinutes": 10,
    "deviceRisk": "high",
    "platform": "ios",
    "appVersion": "4.2.0"
  }
}
```

Allowed `signalType` values:

- `account_takeover`
- `identity_switching`
- `verification_abuse`
- `session_anomaly`
- `profile_change_anomaly`
- `checkout_abuse`
- `reward_abuse`
- `prescription_access_abuse`
- `delivery_address_abuse`
- `automation_abuse`

The app MUST use one immutable `eventId` for all retries of the same event. A new record returns HTTP 201 with `duplicate: false`; a retry returns HTTP 200 with `duplicate: true`.

Do not send names, DOBs, email addresses, phone numbers, patient IDs, addresses, medication details, verification codes, tokens, raw IP addresses, free-text descriptions, or arbitrary metadata. The request rejects unknown top-level and metadata fields.

---

## Patient Matching Logic (App Side)

When the pharmacy pushes any event with patient identifiers, the app should match in this priority order:

1. `concordiaCareUserId` — exact match (fastest, most reliable)
2. `patientEmail` — case-insensitive match
3. `phone` + `dateOfBirth` — combined match (fallback)
4. `firstName` + `lastName` + `dateOfBirth` — last resort

If no match is found and `createIfNotExists` is present and true, create a shell profile. Otherwise return HTTP 404 (the pharmacy backend will retry via outbox).

---

## Sync Outbox — Retry Behaviour

If the app returns a non-2xx status or is unreachable, the pharmacy backend automatically retries:

| Attempt | Delay after previous |
|---|---|
| 1 | 1 minute |
| 2 | 2 minutes |
| 3 | 4 minutes |
| 4 | 8 minutes |
| 5 (final) | 16 minutes |

After 5 failed attempts the event is marked `failed` and visible to pharmacy staff in the admin sync outbox panel. Staff can manually re-trigger from there.

This means the app does not need to implement its own retry logic for inbound calls — idempotency is sufficient. **All endpoints must be idempotent** (safe to call twice with the same payload).

---

## Environment Variables the App Needs

| Variable | Description |
|---|---|
| `CONCORDIA_RX_API_KEY` | Preferred shared Concordia integration secret; must match the pharmacy backend |
| `API_KEY` | Legacy shared-secret name supported during migration |
| `PHARMACY_BACKEND_URL` | Base URL of the Concordia Pharmacy backend (for pull calls like `/api/products`) |

The pharmacy backend is configured with:

| Variable | Description |
|---|---|
| `CONCORDIA_CARE_APP_URL` | Base URL of the ConcordiaCare app |
| `CONCORDIA_RX_API_KEY` | Preferred shared Concordia integration secret |
| `API_KEY` | Legacy fallback during migration |
