# Concordia Pharmacy Chatbot Complete Audit

**Audit date:** September 10, 2026  
**Scope:** Current source code compared with the uploaded world-class pharmacy assistant blueprint  
**Overall result:** Not approved for release as an autonomous digital pharmacy assistant  
**Current safe positioning:** Guarded informational concierge and staff-request intake

## 1. Executive verdict

The application already contains a substantial deterministic pharmacy concierge. It recognizes English, Spanish, and mixed-language requests; distinguishes refill, transfer, insurance, delivery, pickup, order-status, catalog, and escalation intents; uses the live website catalog; and generally directs operational requests toward staff confirmation.

It does not yet support the blueprint's strongest claims safely. Prescription-label and insurance-card intake have critical security gaps. The effective widget routing can allow a local classifier to override safety-sensitive deterministic intents. Some public handoff routes accept more information than the public transcript policy permits. Delivery, payment, transfer-completion, reminder-delivery, and insurance-verification claims are not backed by authoritative integrations.

The most important conclusion is:

> Do not add more autonomy until the existing privacy, authorization, deterministic-routing, and operational-confirmation defects are corrected.

This report does not certify HIPAA compliance. Compliance also depends on production configuration, contracts, operating procedures, workforce controls, incident response, retention policy, and vendor agreements that cannot be established from source code alone.

## 2. Audit method

The audit covered:

1. The uploaded feature blueprint.
2. Chat intent classification and widget flow control.
3. English, Spanish, and Spanglish handling.
4. Clinical and controlled-substance safety precedence.
5. Public transcript redaction and cross-turn data handling.
6. Clerk patient authentication and caregiver sessions.
7. Refill, transfer, insurance, callback, order, delivery, cart, and reminder workflows.
8. PrimeRx, notification, storage, OCR, and object-access infrastructure.
9. Staff confirmation and request-state models.
10. Checkout integrity and payment truthfulness where chatbot requests can lead to commerce.
11. Accessibility, mobile interaction, and conversation-state cleanup.
12. Existing automated tests and major coverage gaps.

Findings are classified as:

- **Confirmed defect:** A problematic code path is directly visible.
- **Architectural risk:** The implementation lacks a control or depends on another layer that must be verified.
- **Missing capability:** The blueprint asks for something that is not implemented. This is not automatically a bug unless the site claims that it exists.

## 3. Blueprint capability matrix

| Capability | Status | Audit conclusion |
|---|---|---|
| English intent routing | Strong but not fully authoritative | Deterministic engine coverage is substantial, but the widget can use a local model override. |
| Spanish and Spanglish routing | Partial | Core intent recognition exists. Many responses, buttons, and forms remain English. |
| Refill request intake | Partial and real | Authenticated patient intake and staff work items exist. The patient path is not direct PrimeRx fulfillment. |
| Refill by bottle photo | Unsafe and blocked | Public transfer upload can store label images as base64 data. Secure prescription OCR does not exist. |
| Prescription transfer | Real intake, manual fulfillment | Form and staff queue exist. There is no proven automated external-pharmacy transfer completion. |
| Insurance assistance | Real ticket intake only | Staff case handling exists. Card OCR, payer eligibility, claim adjudication, and automated profile update do not. |
| Insurance-card photo upload | Unsafe and blocked | Existing generic document infrastructure lacks sufficient binding, scanning, auditing, and lifecycle controls. |
| Order status | Partial | Local order status can be displayed to authenticated users. It is not proof of external fulfillment. |
| Live courier tracking | Absent | Local tracking fields exist, but no carrier or dispatch integration was found. |
| Delivery and pickup requests | Real pending intake | Chat captures requests, but service area, timing, stock, and assignment require staff confirmation. |
| Live product lookup | Implemented | The chatbot uses the current website catalog and includes out-of-stock handling. |
| Refill plus OTC add-ons | Partial | Catalog/cart behavior exists, but prescription and retail fulfillment are not one authoritative transaction. |
| Staff callback | Implemented with privacy gaps | Contact capture exists, but payload minimization, consent, and cross-turn redaction need correction. |
| Proactive refill reminders | Not demonstrated | Reminder configuration and some notification infrastructure exist. A verified refill-due scheduler and delivery worker were not found. |
| PrimeRx integration | Real but conditional | A tokenized API client and several admin/app operations exist. Configuration and per-workflow correlation must be verified. |
| Secure OCR | Not ready | Administrative OCR utilities exist, but no quarantined, isolated, confidence-scored patient-label pipeline exists. |
| Generative language engine | Intentionally excluded | This matches the project's clinical and privacy constraints. |

## 4. Controls worth preserving

The following are good foundations:

1. The deterministic intent engine contains ordered guards, bilingual recognition, typo handling, and extensive unit coverage in:
   - `client/src/lib/intent-engine.ts`
   - `client/src/__tests__/intent-engine.test.ts`
   - `client/src/__tests__/hybrid-intent-engine.test.ts`
   - `client/src/__tests__/chat-quality-250.test.ts`
   - `client/src/__tests__/chat-persona-100.test.ts`

2. Product statements are tied to the live website catalog rather than generated inventory.

3. The chat identity service includes generic responses, challenge expiration, attempt limits, IP controls, and HMAC-derived identifiers:
   - `server/chat-identity.ts:7-12`
   - `server/chat-identity.ts:79-105`
   - `server/chat-identity.ts:130-240`

4. PrimeRx token acquisition coalesces concurrent refreshes and retries authentication failure:
   - `server/primerx-api.ts:190-253`

5. Checkout has stock decrement and rollback logic:
   - `server/checkout-service.ts:78-145`

6. Private object storage, expiring signed URLs, and ACL primitives already exist:
   - `server/objectStorage.ts:119-137`
   - `server/objectStorage.ts:220-315`
   - `server/objectAcl.ts:40-94`

7. Audit tables and mutation-audit infrastructure exist:
   - `shared/schema.ts:519-552`
   - `server/auditLogger.ts`

8. The current product philosophy correctly keeps operational requests pending until staff or an authoritative system confirms them.

## 5. Critical findings

### C-01: Safety-sensitive intents can be overridden by the local classifier

**Type:** Confirmed defect  
**Status:** Resolved September 10, 2026  
**Evidence:** `client/src/components/chat-widget.tsx:818-846`, `client/src/components/chat-widget.tsx:2248-2251`

The widget calls `detectIntentWithLocalModel`. Its protected-intent handling does not make every clinical and prohibited intent authoritative. Controlled-substance, missed-dose, drug-interaction, and side-effect messages can potentially be replaced by a transactional classification.

**Impact**

A patient safety message could be routed to refill, product, delivery, or another operational response instead of the required safety response.

**Required remediation**

1. Make deterministic safety classification the final authority.
2. Create one explicit priority table covering emergency, adverse reaction, overdose, missed dose, interaction, pregnancy, controlled substance, privacy, refusal, and cancellation.
3. Allow the local model to classify only when deterministic classification returns an eligible general-intent result.
4. Reject unknown model intents.

**Acceptance tests**

- Mock the model to return a transactional intent for every protected category.
- Confirm that deterministic safety intent always wins.
- Confirm identical routing over repeated runs.

### C-02: Cross-turn lead handoff can submit sensitive user text

**Type:** Confirmed defect  
**Status:** Resolved September 10, 2026  
**Evidence:** `client/src/components/chat-widget.tsx:2061-2073`, `client/src/components/chat-widget.tsx:2633-2651`

Current-turn display masking does not guarantee that `userTurnRef` or the generated lead summary is sanitized. A previous message containing a DOB, member number, prescription number, or other sensitive detail can be included when a later callback action submits the conversation summary.

**Impact**

Sensitive text can leave the protected transcript boundary and become durable lead data.

**Required remediation**

1. Sanitize every turn at the initial input boundary.
2. Never keep raw sensitive text in `userTurnRef`.
3. Build callback payloads from an allowlist of structured fields.
4. Do not send a free-text conversation summary for public callbacks.
5. Repeat server-side sanitization before persistence.

**Acceptance tests**

- Submit sensitive information in turn one and request a callback in turn two.
- Assert that request payloads, stored lead records, audit rows, and logs contain none of the sensitive values.

### C-03: Public transfer upload stores prescription-label images as database data

**Type:** Confirmed defect  
**Status:** Resolved September 11, 2026. Public multipart transfer submissions, label-upload mode, files, and caller-provided label URLs are rejected; the transfer form now accepts only contact and current-pharmacy details.  
**Evidence:** `server/routes.ts:9901-9902`, `server/routes.ts:9932-9961`

The public `/api/transfer-request` flow can convert an uploaded label image into a base64 `data:` URL and store it with transfer data. It can also accept a caller-provided `labelImageUrl`.

**Impact**

- Prescription information may be copied into database records, backups, exports, admin responses, and logs.
- Object ACLs do not protect base64 database content.
- Arbitrary URL or data content may be persisted.
- Retention and deletion are difficult to enforce.

**Required remediation**

1. Disable public image persistence.
2. Replace it with a single-use, purpose-bound upload intent.
3. Store only a private object identifier and metadata.
4. Bind the upload to a transfer case and authenticated patient, or use a deliberately designed low-assurance intake token with strong abuse controls.
5. Reject all caller-provided permanent URLs and base64 payloads.

**Acceptance tests**

- Database records never contain `data:image`.
- Upload tokens expire, cannot be replayed, and cannot target another case.
- Anonymous callers cannot attach arbitrary files or URLs.

### C-04: Caregiver patient context is broader than demonstrated capability authorization

**Type:** Architectural authorization risk with high-confidence code evidence  
**Evidence:** `server/routes.ts:224-231`, `server/routes.ts:7504-7510`, `server/routes.ts:7578-7611`

`getPatientId` accepts `actingPatientId` when an attendant session exists. That identifies the patient context but does not itself prove permission for each resource and action.

**Impact**

A caregiver session could receive document, prescription, order, or deletion authority beyond the patient's granted scope if every route relies only on the selected patient ID.

**Required remediation**

Introduce `requirePatientCapability(resource, action)` that validates:

- Active caregiver relationship
- Patient consent
- Resource scope
- Read versus write permission
- Expiration and revocation
- Actor, subject, purpose, and outcome auditing

Rotate the session when caregiver context changes.

**Acceptance tests**

- A document-only caregiver cannot access prescriptions or orders.
- A read-only caregiver cannot upload or delete.
- Revoked access fails immediately.
- Selecting a different patient does not grant access.

### C-05: Checkout records unpaid orders as paid

**Type:** Confirmed operational-integrity defect  
**Evidence:** `server/checkout-service.ts:190-204`

Checkout generates a `demo_payment_*` identifier and writes `status: "completed"` and `paymentStatus: "paid_online"` without demonstrated payment authorization or capture.

**Impact**

Any chatbot or cart flow reaching this service can produce an order that appears paid when no payment occurred. This can cause inventory, fulfillment, accounting, and patient-trust failures.

**Required remediation**

- Prevent this path from being used as real checkout.
- Mark demo orders explicitly as unpaid test orders, or integrate an authoritative payment workflow.
- Fulfillment must not begin from a synthetic paid state.

**Acceptance tests**

- No order becomes paid without a verified provider event or explicit approved offline-payment state.
- Test and production order paths cannot be confused.

### C-06: Checkout has no request idempotency

**Type:** Confirmed defect  
**Evidence:** `server/checkout-service.ts:27-40`, `server/checkout-service.ts:190-204`

The checkout request does not accept an idempotency key. Replays can create duplicate orders and duplicate side effects.

**Impact**

Chat retries, mobile reconnects, double taps, or network replay can submit the same purchase more than once.

**Required remediation**

- Require a client-generated checkout key.
- Enforce a unique server record per patient or guest basket and key.
- Return the original result for safe retries.

## 6. High findings

### H-01: Privacy enforcement is primarily client-side

**Type:** Confirmed boundary weakness  
**Status:** Partially resolved September 10, 2026. The concierge lead route now strips raw challenge and conversation-summary fields and restricts intent metadata. Other public intake routes still require separate review.  
**Evidence:** `client/src/components/chat-widget.tsx:435-448`, `server/routes.ts:6382-6474`

The public lead API accepts broad free-text and contact fields. A direct caller can bypass browser masking.

**Remediation**

Use server-side allowlisted schemas, sanitization, rate limiting, consent capture, and neutral patient matching. Do not create or link patient identities based only on unverified public contact data.

### H-02: Chat identity verification is not full clinical authorization

**Type:** Architectural risk  
**Evidence:** `server/routes.ts:440-468`, `server/chat-identity.ts`

The chat identity mechanism is intentionally separate from Clerk. Recognition must not authorize prescriptions, documents, insurance, orders, or delivery details.

**Remediation**

Issue only short-lived, purpose-limited chat recognition. Require Clerk patient authentication or an authorized caregiver session for protected actions.

### H-03: Generic signed upload URLs are not bound to a patient resource

**Type:** Confirmed design gap  
**Evidence:** `server/routes.ts:7458-7467`, `server/objectStorage.ts:119-137`

The signed PUT route does not visibly bind content type, exact size, document purpose, patient, case, scan state, or finalization.

**Remediation**

Replace it for sensitive documents with server-created upload intents, exact limits, quarantine, finalization, object hashing, ACL assignment, and orphan cleanup.

### H-04: File validation trusts MIME and extension

**Type:** Confirmed design gap  
**Evidence:** `server/routes.ts:7523-7539`, `server/routes.ts:14576-14635`

There is no demonstrated magic-byte validation, image normalization, PDF sanitization, malware scanning, decompression-bomb protection, or parser isolation.

**Impact**

Malformed or hostile documents can consume web-process memory and CPU or exploit parsers.

### H-05: Document reads are not comprehensively audited

**Type:** Confirmed defect  
**Evidence:** `server/routes.ts:7470-7492`, `server/routes.ts:7578-7591`, `server/routes.ts:14767-14779`

Object and document creation/deletion have some audit support, but views, downloads, denied access, OCR, and signed-link issuance are not consistently recorded.

### H-06: Document deletion can leave the object behind

**Type:** Confirmed lifecycle defect  
**Evidence:** `server/routes.ts:7595-7627`

The visible deletion path removes the document record without demonstrating deletion of the object and derivatives.

**Remediation**

Use an idempotent deletion workflow covering database row, original object, quarantine copy, normalized object, thumbnail, OCR output, and retries.

### H-07: Generic audit middleware can copy protected response content

**Type:** Confirmed defect  
**Evidence:** `server/auditLogger.ts:51-95`, `shared/schema.ts:534-545`

Mutation response bodies can be stored as `newValue`. Chat routes are excluded, but other clinical, document, patient, and insurance responses may contain sensitive data.

**Remediation**

Audit metadata from an allowlist. Never store full bodies, file data, raw OCR, credentials, medication details, DOB, address, insurance identifiers, or tokens.

### H-08: Audit persistence fails open

**Type:** Confirmed resilience gap  
**Evidence:** `server/auditLogger.ts:21-35`

Audit-write errors are logged to the console without a durable retry or alert.

**Impact**

Sensitive actions can succeed with no durable audit record.

### H-09: Button actions bypass the primary workflow dispatcher

**Type:** Confirmed conversational defect  
**Evidence:** `client/src/components/chat-widget.tsx:3536-3561`

Main-menu buttons call a shorter intent-response path instead of the complete submission flow. Button-driven and typed versions of the same request can therefore produce different authentication, address, catalog, or transfer behavior.

**Remediation**

Route typed messages, suggested actions, and menu buttons through one authoritative dispatcher.

### H-10: Order cancellation conflicts with general conversation cancellation

**Type:** Confirmed routing defect  
**Evidence:** `client/src/lib/intent-engine.ts:486-489`, `client/src/lib/intent-engine.ts:949-954`, `client/src/lib/intent-engine.ts:1017-1020`

Generic stop/cancel guards can consume “cancel my order” before the object-specific `cancel_order` intent is reached.

**Remediation**

Separate:

- Stop this conversation
- Clear this draft request
- Cancel an existing order
- Cancel delivery
- Cancel a refill request

Existing-order cancellation must require authentication and current status validation.

### H-11: Generic staff approval cannot confirm multiple operational facts

**Type:** Confirmed workflow-model gap  
**Evidence:** `client/src/components/chat-widget.tsx:2637-2666`, `shared/schema.ts:2336-2358`, `server/routes.ts:6581-6618`

The chat can imply staff will confirm stock, delivery, timing, and prescription processing, but the generic conversion-lead status does not record separate confirmation evidence for those domains.

**Remediation**

Use domain-specific request records and state transitions. Each confirmation must identify what was confirmed, by whom, from which source, and when.

### H-12: Delivery and service claims exceed proven integrations

**Type:** Confirmed truthfulness defect  
**Status:** Resolved September 10, 2026. Public copy now states that delivery eligibility, fees, and timing require staff confirmation; live courier GPS is not currently available. Fabricated courier assignment was disabled, and patient tracking suppresses unverified courier fields.  
**Evidence:** `client/src/components/chat-widget.tsx:1125-1135`, `client/src/components/chat-widget.tsx:2612-2622`, `client/src/pages/landing.tsx:165-188`

Claims include universal free delivery, live GPS, recurring drivers, broad delivery coverage, rapid fills, and real-time confirmation. No carrier integration was found.

**Remediation**

Use conditional wording:

- “Request delivery”
- “Available in eligible service areas”
- “Staff will confirm timing”
- “Tracking is shown when provided for your order”

### H-13: Refill intake lacks idempotency and direct patient-to-PrimeRx correlation

**Type:** Confirmed operational gap  
**Status:** Resolved September 10, 2026 for patient, admin, and external PrimeRx refill entry points. Each now requires a validated idempotency key, atomically records a durable request fingerprint and correlation ID, and returns stable replay responses.  
**Evidence:** `server/routes.ts:963-1030`, `shared/schema.ts:598-640`

The patient route creates a local pending request. It does not demonstrate a unique request key or PrimeRx request ID.

**Impact**

Repeated submissions can create duplicate staff work, and completion may not be traceable to the original patient request.

### H-14: Transfer intake lacks external completion and deduplication

**Type:** Missing integration plus confirmed control gap  
**Evidence:** `server/routes.ts:4202-4299`, `shared/schema.ts:1268-1342`

Transfer intake and staff notification are real. Automated source-pharmacy or PMS completion, SLA escalation, and idempotency were not found.

### H-15: Notification delivery is not durable

**Type:** Architectural risk  
**Evidence:** `server/email.ts`, `server/sms.ts`, `server/routes.ts:4277-4281`

Several email and SMS calls are conditional or fire-and-forget. Universal delivery receipts, retries, dead-letter handling, and idempotency were not demonstrated.

## 7. Medium findings

### M-01: Spanish support is incomplete at the response layer

**Evidence:** `client/src/components/chat-widget.tsx:2264-2292`, `client/src/components/chat-widget.tsx:2395-2413`, `client/src/components/chat-widget.tsx:2553-2622`

Core recognition is stronger than the rendered experience. Several responses and action labels remain English.

**Remediation**

Move all visible chat text and actions into a typed language catalog. Test every supported intent in English, Spanish, and representative Spanglish.

### M-02: Spanish privacy detection is not demonstrated

Patterns for phrases such as “fecha de nacimiento,” “número de receta,” “número de miembro,” and “número de póliza” need explicit tests, including accents and mixed-language messages.

### M-03: Closing the widget can preserve stale operational state

**Evidence:** `client/src/components/chat-widget.tsx:1837-1865`, `client/src/components/chat-widget.tsx:220-232`

Close and reset behavior is distributed across many state variables. Timers, pending network calls, restock details, callback details, and persisted draft state can drift.

**Remediation**

Create a single state machine and a central reset transition. Abort pending requests and clear timers.

### M-04: The chat component is too large to reason about safely

`client/src/components/chat-widget.tsx` contains routing, privacy, identity, catalog matching, network submissions, localization, rendering, timers, and persistence.

**Impact**

Safety precedence and cleanup regressions become difficult to detect.

**Remediation**

Separate:

- Authoritative intent router
- Conversation reducer/state machine
- Privacy sanitizer
- Authenticated action dispatcher
- Catalog adapter
- Request payload builders
- Localized response catalog
- Presentational components

### M-05: Restock notification intake needs consent and abuse controls

**Evidence:** `client/src/components/chat-widget.tsx:2677-2692`, `client/src/components/chat-widget.tsx:3888-3938`

Phone or email collection needs explicit consent, rate limiting, verification policy, duplicate suppression, and consistent credentials handling.

### M-06: Phone validation is US-only and brittle

**Evidence:** `client/src/components/chat-widget.tsx:3839-3848`

The field strips non-digits and caps input at ten digits. This mishandles `+1`, pasted formatting, and international numbers.

### M-07: Chat accessibility needs dedicated verification

**Evidence:** `client/src/components/chat-widget.tsx:3944-3982`

The reviewed composer and icon controls do not demonstrate complete accessible names, live message announcements, keyboard focus management, focus return, or minimum touch targets.

### M-08: OTP and attendant session hardening is incomplete

**Evidence:** `server/routes.ts:10542-10729`

Risks include account enumeration, in-memory per-instance rate limits, `Math.random()` OTP generation, OTP storage/attempt handling that needs confirmation, and no demonstrated session regeneration after login.

### M-09: OCR runs in the web process

**Evidence:** `server/routes.ts:14576-14635`

Tesseract and document parsers execute against untrusted bytes in the application process without demonstrated CPU, memory, timeout, or concurrency isolation.

### M-10: No complete PHI retention and deletion policy is implemented

There is no demonstrated purpose-specific expiration, purge worker, legal hold, backup lifecycle, derivative cleanup, or deletion verification for labels and insurance cards.

### M-11: PrimeRx workflows lack broad contract and failure tests

The client is real, but comprehensive tests for token expiry, schema drift, timeout, duplicate requests, webhook correlation, and retry exhaustion were not found.

### M-12: Operational observability is fragmented

PrimeRx logs and outbox tables are useful foundations, but there is no demonstrated cross-workflow correlation ID, stuck-request alerting, notification retry dashboard, or SLA escalation covering refill, transfer, insurance, delivery, and reminders.

### M-13: Checkout side effects are not one durable transaction

**Evidence:** `server/checkout-service.ts:107-264`

Stock, order creation, staff push, items, and points occur across separate steps. Rollback exists, but a process interruption can leave partial state.

**Remediation**

Use a database transaction for local state plus an outbox for external side effects.

### M-14: Proactive reminder delivery is not demonstrated

**Evidence:** `shared/schema.ts:2245-2264`, `server/routes.ts:13603-13776`

Reminder records and administration exist. A worker that evaluates due reminders, consent, quiet hours, duplicate suppression, and provider delivery was not found.

## 8. Low findings

### L-01: Greeting variation is module-global

**Evidence:** `client/src/components/chat-widget.tsx:257-262`

This can make behavior differ across widget instances and complicate deterministic tests.

### L-02: Landing forms are not fully localized

Transfer, insurance, and related handoff dialogs remain predominantly English even when chat recognizes Spanish.

### L-03: Security headers can be strengthened

**Evidence:** `server/index.ts:12-47`

CORS and several baseline headers exist. Production should also verify HSTS, CSP, `frame-ancestors`, sensitive-response cache control, and cookie policy.

### L-04: Object and signed-link response policy is inconsistent

Private object responses should consistently use short expiration, `Cache-Control: private, no-store`, safe `Content-Type`, and `Content-Disposition`.

## 9. Operational truthfulness audit

The chatbot may truthfully state:

- A request was submitted to Concordia staff.
- A product appears in the current website catalog.
- A product is currently marked in stock or out of stock in that catalog.
- An authenticated local order has a particular stored status.
- A configured PrimeRx API call returned a specific result.
- Staff must confirm prescription, delivery, transfer, and insurance outcomes.

The chatbot must not state without authoritative evidence:

- A refill was accepted, filled, or ready.
- A prescription transfer completed.
- Insurance was verified or approved.
- A copay is final.
- An order was paid.
- A driver was assigned.
- A driver is a specific number of minutes away.
- Live GPS is available.
- Delivery is free or available everywhere.
- A reminder was sent.
- A notification was delivered.
- Staff approval confirmed several unrelated facts.

## 10. Authentication and authorization audit

### Appropriate public capabilities

- General pharmacy information
- Store hours and contact information
- General service descriptions
- Live public catalog lookup
- Starting a non-sensitive staff callback with minimal contact information and consent
- Opening a secure sign-in or transfer handoff

### Capabilities requiring authenticated patient context

- Prescription status
- Refill submission
- Insurance documents
- Prescription-label documents
- Order history
- Delivery address
- Tracking information
- Medication list
- Copay or balance
- Patient-specific reminders

### Capabilities requiring additional caregiver scope

- Acting for another patient
- Reading prescriptions
- Reading or uploading documents
- Viewing orders or tracking
- Changing delivery details
- Submitting refill or transfer requests
- Deleting documents

Client-side flags such as `isKnownMember` must never substitute for server authorization.

## 11. Secure upload and OCR release requirements

Prescription labels and insurance cards remain blocked until all of the following exist:

1. Purpose-bound upload intents.
2. Exact file-size and type constraints.
3. Magic-byte and decoded-format validation.
4. Private quarantine storage.
5. Malware scanning or content disarm and reconstruction.
6. Image re-encoding and metadata stripping.
7. Isolated OCR workers with time and resource limits.
8. Confidence scores and human verification.
9. Owner and caregiver-capability checks on every access.
10. Audited creation, view, denial, download, OCR, correction, and deletion.
11. Metadata-only audit records.
12. Complete original and derivative deletion.
13. Retention and purge policy.
14. Backup and legal-hold policy.
15. Verified provider encryption, access controls, and applicable vendor agreements.

OCR output must be treated as a suggestion. It cannot authorize a refill, update insurance automatically, or become a verified medication fact without review.

## 12. Test coverage audit

### Existing strengths

The project has strong intent-level test volume covering:

- English and Spanish routing
- Typographical errors
- Negation
- False positives
- Refill and transfer distinctions
- Catalog synonyms
- Order and tracking language
- Chat persona and quality cases

### Missing critical suites

1. Widget-level deterministic precedence with a disagreeing local model.
2. Cross-turn sensitive-data redaction.
3. Button and typed-message parity.
4. Conversation cancellation versus order cancellation.
5. Complete close and reset state.
6. Authenticated handoff ownership.
7. Caregiver capability enforcement.
8. Public upload rejection.
9. MIME spoofing, malformed files, decompression bombs, and malware quarantine.
10. Object-level IDOR attempts.
11. Document view and denied-access auditing.
12. Complete object and derivative deletion.
13. Audit redaction and audit-write failure.
14. Patient refill idempotency.
15. Transfer and insurance deduplication.
16. PrimeRx timeout, token expiry, retry, and webhook correlation.
17. Notification retries and delivery receipts.
18. Reminder scheduling, consent, quiet hours, and duplicate suppression.
19. Carrier webhook ownership and replay protection.
20. Checkout replay and partial-failure recovery.
21. Chat keyboard, screen-reader, focus, and mobile touch behavior.
22. Full Spanish response and action-label coverage.

## 13. Prioritized remediation roadmap

### Release gate 0: Immediate containment

1. Disable public base64 prescription-label persistence.
2. Prevent demo checkout from representing orders as paid.
3. Make all clinical and prohibited intents non-overridable. Completed September 10, 2026.
4. Remove unsupported delivery, timing, payment, and insurance claims.
5. Stop free-text lead summaries from receiving unsanitized conversation data. Completed September 10, 2026.

### Release gate 1: Guarded concierge

1. One authoritative dispatcher for typed and button input.
2. Server-side public-input minimization and rate limits.
3. Separate conversation, draft-request, and existing-order cancellation.
4. Domain-specific pending request records.
5. Complete English and Spanish response catalog.
6. Widget state machine and complete reset behavior.
7. Accessibility verification.

### Release gate 2: Authenticated patient actions

1. Clerk-bound patient context.
2. Capability-bound caregiver authorization.
3. Idempotent refill, transfer, insurance, and checkout submission.
4. Correlation IDs across local requests, PrimeRx, notifications, and staff actions.
5. Durable outbox and retry controls.

### Release gate 3: Secure documents

1. Quarantined private upload architecture.
2. Object and derivative lifecycle.
3. Durable metadata-only audit.
4. Isolated OCR with manual verification.
5. Retention, deletion, and access-review procedures.

### Release gate 4: Read-only authoritative integrations

1. Authenticated PrimeRx prescription and refill-status reads.
2. Verified courier status reads.
3. Minimal patient-specific responses.
4. Provider contract tests and outage behavior.

### Release gate 5: Controlled mutations

Only after the previous gates:

1. PrimeRx refill mutation with idempotency and correlation.
2. Verified transfer workflow transitions.
3. Insurance update after staff approval.
4. Delivery changes with service-area validation.
5. Proactive reminders with consent and durable delivery.

## 14. Hard release gates

### The current chatbot may remain available only as a guarded concierge if:

- Safety intents cannot be overridden.
- Unsupported claims are removed.
- Public lead payloads cannot persist sensitive transcript content.
- Public image upload is disabled or secured.
- Operational requests clearly remain pending.

### Prescription-label and insurance-card uploads must not launch until:

- C-03, C-04, H-03, H-04, H-05, H-06, H-07, H-08, M-09, and M-10 are resolved.
- Cross-patient and caregiver authorization tests pass.
- Every document access is audited without document content.
- Deletion removes every object and derivative.

### Real-time delivery must not launch until:

- A carrier source of truth is integrated.
- Order ownership is verified.
- Tracking links are short-lived.
- Webhook signatures and replay protection are tested.
- The UI no longer falls back to invented estimates.

### Proactive reminders must not launch until:

- PrimeRx or another authoritative due-date source is established.
- Consent and opt-out are enforced.
- Quiet hours and duplicate suppression exist.
- Delivery attempts and failures are durable.
- Sensitive lock-screen content is minimized.

## 15. Explicit non-goals

The chatbot should not:

- Send patient or prescription data to a general-purpose language model.
- Diagnose conditions.
- Recommend prescription changes.
- Automatically trust OCR.
- Approve refills or transfers without an authoritative result.
- Update insurance automatically from a card image.
- Invent copays, inventory, delivery timing, driver identity, or tracking.
- Accept protected information in public chat.
- Expose permanent document or tracking URLs.
- Treat staff lead approval as proof of fulfillment.

## 16. External decisions and runtime verification

The following require business, compliance, vendor, or production confirmation:

1. PrimeRx production API scope and webhook guarantees.
2. Courier or dispatch provider.
3. Payment-provider strategy or explicit removal of online-payment claims.
4. OCR execution environment.
5. Malware scanning or document-sanitization provider.
6. SMS and WhatsApp providers and patient consent model.
7. Storage encryption, bucket public-access prevention, lifecycle, and regionality.
8. Vendor agreements appropriate for the data handled.
9. Prescription-label and insurance-card retention periods.
10. Audit retention and integrity monitoring.
11. Incident response and breach procedures.
12. Staff roles permitted to view each document and patient-data category.

## 17. Final conclusion

The existing chatbot is not an empty prototype. It has a strong deterministic intent foundation, real catalog access, several real request queues, and a conditional PrimeRx client. Those assets should be retained.

The blueprint should not be implemented by adding generative AI, public OCR, or optimistic fulfillment messages. The correct path is:

1. Correct the confirmed privacy, safety, payment, and truthfulness defects.
2. Establish server-authoritative patient and caregiver permissions.
3. Create domain-specific pending and confirmed states.
4. Secure document storage and OCR.
5. Add read-only authoritative integrations.
6. Add controlled mutations only after idempotency, audit, retry, and staff-verification controls are proven.

Until those gates are met, market and operate the chatbot as an informational concierge and secure staff-request assistant, not as an autonomous pharmacy fulfillment system.