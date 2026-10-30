# Care Navigator API Specification

**Version:** 1.0  
**Base URL:** `/api/external/care-navigator`  
**Authentication:** All endpoints require `X-API-KEY` header matching the `API_KEY` environment variable.

---

## Overview

The Care Navigator API gives the ConcordiaCare mobile app full access to the patient's structured condition list and health journal. It also provides an AI-powered plain-language explainer for each condition and rule-based platform CTAs ("next steps") to drive patient engagement.

### AI-Generated Content Disclaimer

Any response that includes an `explainer` object **must** display the following disclaimer to the patient, verbatim, in the UI:

> *"This content is AI-generated for educational purposes only and is not medical advice. Always consult your doctor or pharmacist before making any health decisions."*

All AI-generated content carries `"aiGenerated": true` in the response body.

---

## Endpoints

### 1. List Patient Conditions

```
GET /api/external/care-navigator/patients/:userId/conditions
```

Returns all conditions logged by the patient, ordered newest first.

**Response 200**
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "conditionName": "Type 2 Diabetes",
    "icd10Code": "E11",
    "diagnosedAt": "2023-06-01T00:00:00.000Z",
    "notes": "Diagnosed during annual checkup",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**Error responses:** `401 Invalid or missing API key` | `404 Patient not found` | `500`

---

### 2. Create a Condition

```
POST /api/external/care-navigator/patients/:userId/conditions
```

**Request body**
```json
{
  "conditionName": "Type 2 Diabetes",
  "icd10Code": "E11",
  "diagnosedAt": "2023-06-01T00:00:00.000Z",
  "notes": "Diagnosed during annual checkup",
  "status": "active"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `conditionName` | string | **yes** | Free-text condition name |
| `icd10Code` | string | no | ICD-10 code (e.g. `E11`) |
| `diagnosedAt` | ISO timestamp | no | Date of diagnosis |
| `notes` | string | no | Patient notes |
| `status` | `"active"` \| `"resolved"` | no | Defaults to `"active"` |

**Response 201** — created condition object (same shape as list item)

**Error responses:** `400 Validation error` | `401` | `404` | `500`

---

### 3. Update a Condition

```
PATCH /api/external/care-navigator/patients/:userId/conditions/:conditionId
```

All fields are optional. Send only the fields to change.

**Request body** — same fields as Create, all optional.

**Response 200** — updated condition object.

**Error responses:** `400` | `401` | `404 Condition not found` | `500`

---

### 4. Delete a Condition

```
DELETE /api/external/care-navigator/patients/:userId/conditions/:conditionId
```

**Response 204** — no body.

**Error responses:** `401` | `404` | `500`

---

### 5. List Health Journal Entries

```
GET /api/external/care-navigator/patients/:userId/journal
```

**Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 30 | Max 90 |
| `offset` | integer | 0 | For pagination |
| `conditionId` | string | — | Filter by condition UUID |

**Response 200**
```json
{
  "entries": [
    {
      "id": "uuid",
      "userId": "uuid",
      "conditionId": "uuid or null",
      "entryDate": "2024-03-10T08:00:00.000Z",
      "symptomSeverity": 3,
      "mood": 4,
      "energyLevel": 2,
      "sideEffectsText": "Mild nausea in the morning",
      "notes": "Felt tired after morning dose",
      "createdAt": "2024-03-10T08:05:00.000Z"
    }
  ],
  "limit": 30,
  "offset": 0,
  "count": 1
}
```

**Severity / mood / energy scale:** 1 = very poor, 5 = excellent. `null` means not recorded.

**Error responses:** `401` | `404` | `500`

---

### 6. Create a Journal Entry

```
POST /api/external/care-navigator/patients/:userId/journal
```

**Request body**
```json
{
  "conditionId": "uuid",
  "entryDate": "2024-03-10T08:00:00.000Z",
  "symptomSeverity": 3,
  "mood": 4,
  "energyLevel": 2,
  "sideEffectsText": "Mild nausea in the morning",
  "notes": "Felt tired after morning dose"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `conditionId` | UUID | no | Link to a specific condition |
| `entryDate` | ISO timestamp | no | Defaults to now |
| `symptomSeverity` | integer 1–5 | no | 1=very poor, 5=excellent |
| `mood` | integer 1–5 | no | 1=very poor, 5=excellent |
| `energyLevel` | integer 1–5 | no | 1=very poor, 5=excellent |
| `sideEffectsText` | string | no | Free-text side effects |
| `notes` | string | no | General free-text notes |

> **Design note — scalar fields vs. `symptomsJson`:** The journal schema uses discrete integer scalar fields (`symptomSeverity`, `mood`, `energyLevel`) rather than a single `symptomsJson` blob. This was a deliberate choice to allow the mobile app to render sparkline/trend charts directly from typed numeric values over 30/90 day windows without client-side JSON parsing, and to enable server-side range queries for future analytics. These three fields cover the core wellness dimensions the mobile UI requires. If additional symptom dimensions are needed in a future version, they can be added as new typed columns or an extension `symptomsExtrasJson` field.

**Response 201** — created entry object.

**Error responses:** `400` | `401` | `404` | `500`

---

### 7. AI Condition Explainer

```
GET /api/external/care-navigator/patients/:userId/conditions/:conditionId/explain
```

Returns a plain-language AI-generated explainer for the condition. Results are cached for 30 days — subsequent calls for the same condition return instantly.

**Response 200**
```json
{
  "conditionId": "uuid",
  "conditionName": "Type 2 Diabetes",
  "icd10Code": "E11",
  "explainer": {
    "summary": "Type 2 diabetes is a condition where your body doesn't use insulin properly...",
    "treatments": [
      "Oral medications such as metformin to control blood sugar",
      "Insulin therapy if oral medications are not sufficient",
      "Regular monitoring of blood glucose levels"
    ],
    "lifestyleTips": [
      "Eat a balanced diet low in refined sugars and processed foods",
      "Aim for at least 30 minutes of moderate exercise most days",
      "Maintain a healthy weight to improve insulin sensitivity"
    ],
    "doctorQuestions": [
      "What is my target blood sugar range?",
      "How often should I check my blood glucose at home?",
      "Are there any medications I should avoid?"
    ],
    "aiGenerated": true
  },
  "disclaimer": "This content is AI-generated for educational purposes only and is not medical advice. Always consult your doctor or pharmacist before making any health decisions."
}
```

> **UI requirement:** Display the `disclaimer` field prominently below the explainer content. Never suppress or truncate it.

**Error responses:** `401` | `404` | `500`

---

### 8. Linked Prescriptions for a Condition

```
GET /api/external/care-navigator/patients/:userId/conditions/:conditionId/prescriptions
```

Automatically matches the patient's active prescriptions to the condition using deterministic medication-class and ICD-10 keyword rules derived from pharmacy records. Returns two arrays: `linked` (matched) and `unlinked` (active prescriptions not matched to this condition).

**Matching logic:** The server maps condition name patterns and ICD-10 prefixes to known drug/medication class keywords for 10 condition categories (diabetes, hypertension, hyperlipidemia, asthma/COPD, depression/anxiety, rheumatoid/autoimmune, thyroid, osteoporosis, GERD, heart failure/cardiac). Each matched prescription includes a human-readable `matchReason`.

**Response 200**
```json
{
  "conditionId": "uuid",
  "conditionName": "Type 2 Diabetes",
  "icd10Code": "E11",
  "linked": [
    {
      "id": "uuid",
      "rxNumber": "RX-12345",
      "medicationName": "Metformin",
      "dosage": "500mg",
      "instructions": "Take twice daily with meals",
      "status": "active",
      "refillsRemaining": 3,
      "nextRefillDate": "2024-04-01T00:00:00.000Z",
      "matchReason": "Commonly prescribed for Diabetes / glycemic control"
    }
  ],
  "unlinked": [
    {
      "id": "uuid",
      "rxNumber": "RX-99001",
      "medicationName": "Atorvastatin",
      "dosage": "20mg",
      "instructions": "Take once daily",
      "status": "active",
      "refillsRemaining": 5,
      "nextRefillDate": "2024-05-01T00:00:00.000Z",
      "matchReason": "No automatic match — confirm with your doctor"
    }
  ],
  "matchNote": "Linked prescriptions are automatically matched from pharmacy records using medication class and condition keywords. Always confirm with your prescriber."
}
```

> **UI guidance:** Display `linked` prescriptions prominently in the condition detail view. Show `unlinked` in a collapsible "Other active medications" section. Always display the `matchNote` disclaimer.

**Error responses:** `401` | `404` | `500`

---

### 9. Next Steps / Platform CTAs

```
GET /api/external/care-navigator/patients/:userId/conditions/:conditionId/next-steps
```

Returns rule-based platform action suggestions tailored to the condition category. No AI is used.

**Response 200**
```json
{
  "conditionId": "uuid",
  "conditionName": "Type 2 Diabetes",
  "nextSteps": [
    {
      "label": "Transfer Your Prescription",
      "url": "/",
      "description": "Transfer your maintenance medications to Concordia for convenient refills."
    },
    {
      "label": "Ask About the Blister Pack Program",
      "url": "/",
      "description": "Our blister pack program simplifies daily dose management for chronic conditions."
    }
  ]
}
```

**Condition categories and matched CTAs:**

| Category keywords | CTAs shown |
|---|---|
| Respiratory (asthma, COPD, bronchitis…) | Specialty Meds, Flu Shot |
| Metabolic / cardiovascular (diabetes, hypertension, cholesterol…) | Transfer Rx, Blister Pack, Specialty Meds |
| Cancer / autoimmune (oncology, Crohn's, MS, lupus…) | Specialty Meds, Transfer Rx |
| Musculoskeletal (arthritis, osteoporosis, back pain…) | Transfer Rx, OTC Shop |
| Mental health (anxiety, depression, ADHD…) | Transfer Rx, Specialty Meds |
| All other conditions | Flu Shot, Loyalty Program, Contact Us |

**Error responses:** `401` | `404` | `500`

---

## HIPAA Audit Logging

Every request to this API that reads or writes patient health data creates an audit log entry.

| Endpoint | `action` | `entityType` | `details.subAction` |
|---|---|---|---|
| GET conditions list | `read` | `patient_condition` | `list` |
| POST condition | `create` | `patient_condition` | — |
| PATCH condition | `update` | `patient_condition` | — |
| DELETE condition | `delete` | `patient_condition` | — |
| GET journal list | `read` | `health_journal_entry` | `list` |
| POST journal entry | `create` | `health_journal_entry` | — |
| GET explain | `read` | `patient_condition` | `explainer_accessed` |
| GET prescriptions | `read` | `patient_condition` | `linked_prescriptions_read` |
| GET next-steps | `read` | `patient_condition` | `next_steps_read` |

All log entries include `userId`, `entityId`, `ipAddress`, and `userAgent`.

---

## Admin API

The following admin endpoint is available for the web dashboard (requires admin session, not API key):

```
GET /api/admin/patients/:id/conditions
```

Returns the patient's structured conditions for display in the admin patient profile page.

---

## Authentication

All external endpoints use header-based API key authentication:

```
X-API-KEY: <your_api_key>
```

The key must match the `API_KEY` environment variable configured on the server. Requests without a valid key receive `401 Unauthorized`.
