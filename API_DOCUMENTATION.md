# PharmFlow API Documentation

## Table of Contents
- [Authentication Overview](#authentication-overview)
- [1. Auth - Patient](#1-auth---patient)
- [2. Auth - Admin](#2-auth---admin)
- [3. Auth - Staff](#3-auth---staff)
- [4. Auth - Attendant/Caregiver](#4-auth---attendantcaregiver)
- [5. Patient Profile](#5-patient-profile)
- [6. Prescriptions (Patient)](#6-prescriptions-patient)
- [7. Products / Shop](#7-products--shop)
- [8. Cart](#8-cart)
- [9. Checkout & Orders](#9-checkout--orders)
- [10. Order Tracking & Delivery](#10-order-tracking--delivery)
- [11. Delivery Chat](#11-delivery-chat)
- [12. Loyalty / Points (Patient)](#12-loyalty--points-patient)
- [13. OTC Loyalty Card](#13-otc-loyalty-card)
- [14. Patient Chat (Chatbot)](#14-patient-chat-chatbot)
- [15. Notifications](#15-notifications)
- [16. Patient Documents](#16-patient-documents)
- [17. Insurance Assistance](#17-insurance-assistance)
- [18. Blister Pack (Patient)](#18-blister-pack-patient)
- [19. Patient Communications](#19-patient-communications)
- [20. Transfer Requests](#20-transfer-requests)
- [21. Patient Attendant Management](#21-patient-attendant-management)
- [22. Patient Scheduled Events](#22-patient-scheduled-events)
- [23. Flu Shot Appointments](#23-flu-shot-appointments)
- [24. Blog & Alerts (Public)](#24-blog--alerts-public)
- [25. File Upload](#25-file-upload)
- [26. Admin - Users](#26-admin---users)
- [27. Admin - Prescriptions](#27-admin---prescriptions)
- [28. Admin - Orders](#28-admin---orders)
- [29. Admin - Products & Inventory](#29-admin---products--inventory)
- [30. Admin - Vendors & Reorder](#30-admin---vendors--reorder)
- [31. Admin - Blister Pack Patients](#31-admin---blister-pack-patients)
- [32. Admin - Transfer Requests](#32-admin---transfer-requests)
- [33. Admin - Urgent Refills](#33-admin---urgent-refills)
- [34. Admin - Attendants/Caregivers](#34-admin---attendantscaregivers)
- [35. Admin - Staff Email Management](#35-admin---staff-email-management)
- [36. Admin - Blog & Alerts](#36-admin---blog--alerts)
- [37. Admin - Analytics & Audit](#37-admin---analytics--audit)
- [38. Admin - Points & Rewards Engine](#38-admin---points--rewards-engine)
- [39. Admin - PrimeRx Integration](#39-admin---primerx-integration)
- [40. Admin - Drug Dictionary](#40-admin---drug-dictionary)
- [41. Admin - Insurance Help](#41-admin---insurance-help)
- [42. Admin - Flu Shot Appointments](#42-admin---flu-shot-appointments)
- [43. Admin - Communications](#43-admin---communications)
- [44. WebSocket - Real-time Updates](#44-websocket---real-time-updates)
- [45. Public MCP Server](#45-public-mcp-server)

---

## Authentication Overview

The system supports multiple authentication methods. All authenticated endpoints use session-based cookies.

### 1. Patient Phone OTP
Patients authenticate via phone number + 6-digit OTP code sent via SMS.

### 2. Patient Username/Password
Patients can also register and log in with username/password credentials (bcrypt-hashed).

### 3. Admin PIN
Admins authenticate with a PIN code (env var `ADMIN_PIN`, default `"2025"`). Session has a 30-minute timeout.

### 4. Staff Email OTP
Staff members authenticate with email + 6-digit OTP. Staff emails must be pre-registered by an admin.

### 5. Attendant/Caregiver
Caregivers authenticate via phone OTP or username/password. They can act on behalf of linked patients.

### Middleware
- `isAuthenticated` - Requires any valid session (patient, admin, staff, or attendant)
- `isAdmin` - Requires admin PIN session (`isAdminLoggedIn === true`)

### Patient Identity Resolution
The `getPatientId()` helper resolves patient identity in this priority order:
1. Attendant acting on behalf of a patient (`actingPatientId`)
2. Session-based patient auth (`patientUserId`)
3. Replit Auth OIDC (`req.user.claims.sub`)

---

## Common Response Patterns

### Success
```json
{ "success": true, "message": "..." }
```

### Validation Error (400)
```json
{ "message": "Invalid request data", "errors": [{ "path": ["field"], "message": "..." }] }
```

### Unauthorized (401)
```json
{ "message": "Patient authentication required" }
```

### Forbidden (403)
```json
{ "message": "Forbidden" }
```

### Not Found (404)
```json
{ "message": "Resource not found" }
```

### Rate Limited (429)
```json
{ "message": "Too many requests. Please wait..." }
```

---

## 1. Auth - Patient

### GET /api/auth/user
Get the current authenticated user's profile.

**Auth:** `isAuthenticated`

**Response (200):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "1234567890",
  "role": "patient",
  "loyaltyPoints": 500,
  "referralCode": "ABC12345",
  "referredByUserId": null,
  "referralPointsAwarded": false,
  "address": "123 Main St",
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "allergies": "Penicillin",
  "medicalConditions": "Diabetes",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "insuranceGroupNumber": "GRP456",
  "profileImageUrl": null,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Response (200) - Admin-only session (no patient profile):**
```json
null
```

---

### POST /api/auth/phone/request-otp
Request a 6-digit OTP for phone-based login.

**Auth:** None

**Request Body:**
```json
{
  "phoneNumber": "1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

**Error Responses:**
- `404` - No account found with this phone number
- `429` - Rate limited (max 5 requests/minute)

---

### POST /api/auth/phone/verify-otp
Verify OTP and establish patient session.

**Auth:** None

**Request Body:**
```json
{
  "phoneNumber": "1234567890",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Phone verified successfully",
  "user": {
    "id": "uuid-string",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phoneNumber": "1234567890"
  }
}
```

**Error Responses:**
- `401` - Invalid or expired verification code
- `429` - Too many verification attempts (15-min lockout after 10 attempts in 10 min)

---

### POST /api/auth/login
Log in with username and password.

**Auth:** None

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "uuid-string",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phoneNumber": "1234567890"
  }
}
```

**Error Responses:**
- `401` - Invalid username or password

---

### POST /api/auth/register
Register a new patient account with username/password.

**Auth:** None

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "1234567890",
  "referralCode": "ABC12345"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| username | string | Yes | min 3, max 50 chars |
| password | string | Yes | min 6 chars |
| firstName | string | Yes | |
| lastName | string | Yes | |
| email | string | No | Must be valid email |
| phoneNumber | string | No | |
| referralCode | string | No | Existing user's referral code |

**Response (200):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "uuid-string",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**
- `409` - Username already taken / Email already exists

---

### POST /api/auth/logout
Log out the current patient session.

**Auth:** None (clears session)

**Response (200):**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

## 2. Auth - Admin

### POST /api/admin/login
Authenticate as admin with PIN.

**Auth:** None

**Request Body:**
```json
{
  "pin": "2025"
}
```

**Response (200):**
```json
{ "success": true, "message": "Admin login successful" }
```

**Error:** `401` - Invalid PIN

---

### POST /api/admin/logout
Log out admin session.

**Auth:** None

**Response (200):**
```json
{ "success": true, "message": "Admin logout successful" }
```

---

### GET /api/admin/check
Check if current session has admin privileges. Session expires after 30 minutes.

**Auth:** None

**Response (200):**
```json
{ "isAdmin": true }
```

---

## 3. Auth - Staff

### POST /api/staff/auth/request-otp
Request OTP for staff email login. Rate limited to 5 requests per 10 minutes.

**Auth:** None

**Request Body:**
```json
{
  "email": "staff@pharmacy.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If your email is registered, you will receive a verification code"
}
```

---

### POST /api/staff/auth/verify-otp
Verify staff OTP and establish staff session.

**Auth:** None

**Request Body:**
```json
{
  "email": "staff@pharmacy.com",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "staff": {
    "id": 1,
    "email": "staff@pharmacy.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "pharmacist"
  }
}
```

**Error:** `401` - Invalid email/code, max attempts reached

---

### GET /api/staff/auth/session
Get current staff session info.

**Auth:** Staff session required

**Response (200):**
```json
{
  "id": 1,
  "email": "staff@pharmacy.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "pharmacist"
}
```

---

### POST /api/staff/auth/logout
Log out staff session.

**Auth:** None

**Response (200):**
```json
{ "success": true }
```

---

## 4. Auth - Attendant/Caregiver

### POST /api/attendant/request-otp
Request OTP for caregiver phone login.

**Auth:** None

**Request Body:**
```json
{
  "phoneNumber": "1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 600
}
```

---

### POST /api/attendant/verify-otp
Verify caregiver OTP and establish session.

**Auth:** None

**Request Body:**
```json
{
  "phoneNumber": "1234567890",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "attendant": {
    "id": 1,
    "firstName": "Jane",
    "lastName": "Caregiver",
    "phoneNumber": "1234567890",
    "email": "jane@example.com"
  },
  "patients": [
    {
      "linkId": 1,
      "patientId": "uuid-string",
      "firstName": "John",
      "lastName": "Doe",
      "relationshipType": "home_health_aide"
    }
  ]
}
```

---

### POST /api/attendant/login
Log in as caregiver with username/password.

**Auth:** None

**Request Body:**
```json
{
  "username": "caregiver1",
  "password": "securepassword"
}
```

**Response (200):** Same as verify-otp response above.

---

### POST /api/attendant/set-password
Set or reset caregiver password and optional username.

**Auth:** None

**Request Body:**
```json
{
  "phoneNumber": "1234567890",
  "password": "newpassword",
  "username": "caregiver1"
}
```

---

### POST /api/attendant/select-patient
Set the acting patient context for subsequent requests.

**Auth:** Attendant session required

**Request Body:**
```json
{
  "patientId": "uuid-string"
}
```

**Response (200):**
```json
{ "success": true, "message": "Patient selected", "patientId": "uuid-string" }
```

---

### GET /api/attendant/me
Get current attendant session info and linked patients.

**Auth:** Attendant session required

**Response (200):**
```json
{
  "attendant": {
    "id": 1,
    "firstName": "Jane",
    "lastName": "Caregiver",
    "phoneNumber": "1234567890",
    "email": "jane@example.com",
    "status": "active"
  },
  "patients": [
    {
      "linkId": 1,
      "patientId": "uuid-string",
      "firstName": "John",
      "lastName": "Doe",
      "relationshipType": "home_health_aide",
      "canManagePrescriptions": true,
      "canViewMedicalInfo": true,
      "canRequestRefills": true,
      "canPlaceOrders": true
    }
  ],
  "actingPatientId": "uuid-string"
}
```

---

### POST /api/attendant/logout
Log out attendant session.

**Auth:** None

**Response (200):**
```json
{ "success": true }
```

---

## 5. Patient Profile

### PATCH /api/profile
Update the authenticated patient's profile.

**Auth:** `isAuthenticated` (Patient)

**Request Body (all fields optional):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "1234567890",
  "dateOfBirth": "1990-01-15",
  "address": "123 Main St, Bronx, NY",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "insuranceGroupNumber": "GRP456",
  "allergies": "Penicillin",
  "medicalConditions": "Diabetes"
}
```

**Response (200):** Updated user object.

---

## 6. Prescriptions (Patient)

### GET /api/prescriptions
Get all prescriptions for the authenticated patient.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "userId": "uuid-string",
    "rxNumber": "RX-001234",
    "medicationName": "Metformin 500mg",
    "dosage": "500mg",
    "quantity": 90,
    "refillsRemaining": 3,
    "prescribedBy": "Dr. Smith",
    "instructions": "Take twice daily with meals",
    "status": "active",
    "workflowStatus": "received",
    "primeRxId": "PRX-001",
    "ndc": "12345678901",
    "copayAmount": "10.00",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### POST /api/prescriptions/refill
Request a refill for a prescription. Creates an urgent refill request visible on the admin dashboard.

**Auth:** `isAuthenticated` (Patient or Caregiver)

**Request Body:**
```json
{
  "prescriptionId": "uuid-string",
  "priority": "normal",
  "notes": "Running low, need by Friday"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| prescriptionId | string (UUID) | Yes | |
| priority | string | No | `"normal"` or `"urgent"`, default `"normal"` |
| notes | string | No | |

**Response (200):**
```json
{ "message": "Refill request submitted successfully" }
```

**Error Responses:**
- `403` - Prescription doesn't belong to user
- `400` - No refills remaining

---

## 7. Products / Shop

### GET /api/products
Get all products (OTC, grocery, Rx).

**Auth:** `isAuthenticated`

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "name": "Ibuprofen 200mg",
    "description": "Pain reliever",
    "price": "9.99",
    "category": "otc",
    "imageUrl": "/objects/products/ibuprofen.jpg",
    "inStock": true,
    "stockQuantity": 50,
    "stockThreshold": 10,
    "requiresPrescription": false,
    "ndc": "12345678901",
    "reorderLevel": 10,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

## 8. Cart

### GET /api/cart
Get the authenticated user's cart items with product/prescription details.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "userId": "uuid-string",
    "productId": "uuid-string",
    "prescriptionId": null,
    "quantity": 2,
    "product": { "id": "...", "name": "Ibuprofen", "price": "9.99", ... },
    "prescription": null,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### POST /api/cart
Add an OTC product to cart.

**Auth:** `isAuthenticated` (Patient)

**Request Body:**
```json
{
  "productId": "uuid-string",
  "quantity": 2
}
```

**Response (200):** Created cart item object.

**Error Responses:**
- `404` - Product not found
- `400` - Product out of stock / Insufficient stock

---

### POST /api/cart/prescription
Add a prescription to the hybrid cart.

**Auth:** `isAuthenticated` (Patient)

**Request Body:**
```json
{
  "prescriptionId": "uuid-string",
  "copayAmount": "10.00"
}
```

**Error Responses:**
- `404` - Prescription not found
- `403` - Not your prescription
- `400` - Prescription not available for refill

---

### PATCH /api/cart/:id
Update quantity of a cart item.

**Auth:** `isAuthenticated`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "quantity": 3
}
```

---

### DELETE /api/cart/:id
Remove an item from cart.

**Auth:** `isAuthenticated` (Patient)

**Path Params:** `id` (UUID)

**Response (200):**
```json
{ "message": "Item removed from cart" }
```

---

## 9. Checkout & Orders

### POST /api/checkout
Process checkout - creates order, decrements inventory, handles loyalty points.

**Auth:** `isAuthenticated` (Patient)

**Request Body:**
```json
{
  "pointsToUse": 500
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| pointsToUse | number | No | Default 0. Points to redeem (1000 pts = $1 discount) |

**Response (200):**
```json
{
  "message": "Order placed successfully",
  "order": {
    "id": "uuid-string",
    "orderNumber": "ORD-abc123-XYZ",
    "userId": "uuid-string",
    "type": "otc",
    "status": "completed",
    "subtotal": "29.97",
    "pointsUsed": 500,
    "pointsEarned": 30,
    "total": "24.97",
    "paymentIntentId": "demo_payment_1234567890",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Cart empty / Insufficient loyalty points / Product out of stock
- `409` - Concurrent stock conflict / Points balance changed

---

### GET /api/orders
Get all orders for the authenticated patient.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "orderNumber": "ORD-abc123-XYZ",
    "userId": "uuid-string",
    "type": "otc",
    "status": "completed",
    "subtotal": "29.97",
    "total": "24.97",
    "pointsUsed": 500,
    "pointsEarned": 30,
    "deliveryStatus": "not_assigned",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

## 10. Order Tracking & Delivery

### GET /api/orders/:id/tracking
Get tracking info for a specific order. Available to order owner and admins.

**Auth:** `isAuthenticated` (Patient or Admin)

**Path Params:** `id` (UUID)

**Response (200):**
```json
{
  "orderNumber": "ORD-abc123-XYZ",
  "status": "completed",
  "deliveryStatus": "in_transit",
  "courierPartner": "PKGSEND",
  "courierName": null,
  "trackingNumber": "TRK-1234567890-ABCDEF",
  "estimatedDelivery": "2024-01-15T14:00:00.000Z",
  "actualDelivery": null,
  "deliveryNotes": null,
  "proofOfDeliveryUrl": null
}
```

---

## 11. Delivery Chat

### GET /api/delivery/chat/:orderId
Get delivery chat messages for an order.

**Auth:** `isAuthenticated` (Patient, order owner only)

**Path Params:** `orderId` (UUID)

**Response (200):** Array of chat messages.

---

### POST /api/delivery/chat/:orderId
Send a delivery chat message.

**Auth:** `isAuthenticated` (Patient as customer, Admin as courier/system)

**Path Params:** `orderId` (UUID)

**Request Body:**
```json
{
  "message": "When will my order arrive?",
  "senderType": "customer"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| message | string | Yes | 1-1000 chars |
| senderType | string | Yes | `"customer"`, `"courier"`, `"system"` |

**Restrictions:** Chat only available when `deliveryStatus` is `assigned`, `picked_up`, `in_transit`, or `out_for_delivery`.

---

## 12. Loyalty / Points (Patient)

### GET /api/loyalty/transactions
Get legacy loyalty transactions.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "userId": "uuid-string",
    "orderId": "uuid-string",
    "points": 30,
    "type": "earned",
    "description": "Earned from order #ORD-abc123",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### GET /api/points/wallet
Get patient's points wallet and streaks.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{
  "wallet": {
    "id": 1,
    "userId": "uuid-string",
    "currentBalance": 1500,
    "lifetimeEarned": 2500,
    "lifetimeRedeemed": 1000,
    "isFrozen": false,
    "isFlagged": false,
    "tier": "silver",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "streaks": [
    {
      "id": 1,
      "userId": "uuid-string",
      "streakType": "refill_adherence",
      "currentCount": 5,
      "longestCount": 8,
      "lastActivityAt": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

---

### GET /api/points/history
Get detailed points ledger history.

**Auth:** `isAuthenticated` (Patient)

**Query Params:**
- `limit` (number, default 50)

**Response (200):** Array of points ledger entries.

---

### GET /api/points/rewards
Get available rewards the patient can redeem.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{
  "availableRewards": [...],
  "allActiveRewards": [...],
  "currentBalance": 1500
}
```

---

### POST /api/points/rewards/:rewardId/redeem
Redeem a reward using points.

**Auth:** `isAuthenticated` (Patient)

**Path Params:** `rewardId` (numeric)

**Request Body:**
```json
{
  "orderId": "uuid-string"
}
```

---

### GET /api/points/redemptions
Get patient's reward redemption history.

**Auth:** `isAuthenticated` (Patient)

---

### GET /api/points/referrals
Get patient's referral info and stats.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{
  "referrals": [...],
  "referralsThisMonth": 2,
  "referralCode": "ABC12345"
}
```

---

### GET /api/points/earning-rules
Get all active earning rules (public).

**Auth:** None

**Response (200):** Array of earning rule objects.

---

## 13. OTC Loyalty Card

### GET /api/otc-card
Get the patient's OTC loyalty card.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{
  "id": 1,
  "userId": "uuid-string",
  "cardNumber": "1234567890",
  "cardholderName": "John Doe",
  "barcodeData": "1234567890",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### POST /api/otc-card
Create or update OTC loyalty card.

**Auth:** `isAuthenticated` (Patient)

**Request Body:**
```json
{
  "cardNumber": "1234567890",
  "cardholderName": "John Doe"
}
```

---

### DELETE /api/otc-card
Delete OTC loyalty card.

**Auth:** `isAuthenticated` (Patient)

---

## 14. Patient Chat (Chatbot)

### POST /api/chat
Send a message to the rule-based pharmacy chatbot.

**Auth:** `isAuthenticated` (Patient)

**Request Body:**
```json
{
  "message": "How many refills do I have left?",
  "chatId": "uuid-string"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| message | string | Yes | |
| chatId | string (UUID) | No | Omit to start a new chat |

**Response (200):**
```json
{
  "chatId": "uuid-string",
  "message": {
    "id": "uuid-string",
    "chatId": "uuid-string",
    "role": "assistant",
    "content": "Here are your refill details:\n...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### GET /api/chat/:chatId
Get a specific chat with all messages.

**Auth:** `isAuthenticated` (Patient, chat owner only)

**Response (200):**
```json
{
  "chat": { "id": "uuid-string", "userId": "...", "title": "...", "createdAt": "..." },
  "messages": [
    { "id": "...", "role": "user", "content": "...", "createdAt": "..." },
    { "id": "...", "role": "assistant", "content": "...", "createdAt": "..." }
  ]
}
```

---

### GET /api/chats
Get all chats for the authenticated user.

**Auth:** `isAuthenticated` (Patient)

**Response (200):** Array of chat objects (without messages).

---

## 15. Notifications

### GET /api/notifications
Get patient notifications.

**Auth:** `isAuthenticated` (Patient)

**Query Params:** `limit` (number, default 50)

**Response (200):** Array of notification objects.

---

### GET /api/notifications/unread-count
Get count of unread notifications.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{ "count": 5 }
```

---

### PATCH /api/notifications/:id/read
Mark a single notification as read.

**Auth:** `isAuthenticated` (Patient)

**Path Params:** `id` (UUID)

---

### POST /api/notifications/mark-all-read
Mark all notifications as read.

**Auth:** `isAuthenticated` (Patient)

**Response (200):**
```json
{ "message": "All notifications marked as read" }
```

---

## 16. Patient Documents

### POST /api/patient/documents
Upload a patient document (multipart form data with file).

**Auth:** `isAuthenticated` (Patient)

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file` - The file to upload (max 10MB)
- `documentType` - One of: `"drivers_license"`, `"state_id"`, `"insurance_card"`, `"insurance_card_back"`, `"miscellaneous"`
- `notes` - Optional text notes

**Response (201):** Created document object.

---

### GET /api/patient/documents
Get all documents for the authenticated patient.

**Auth:** `isAuthenticated` (Patient)

---

### DELETE /api/patient/documents/:id
Delete a patient document.

**Auth:** `isAuthenticated` (Patient, document owner only)

**Path Params:** `id` (numeric)

---

## 17. Insurance Assistance

### POST /api/insurance-help
Submit an insurance assistance request (public or authenticated).

**Auth:** None (userId auto-attached if logged in)

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "1234567890",
  "message": "I need help understanding my coverage"
}
```

**Response (201):** Created request object with `ticketNumber`.

---

### GET /api/insurance-help
Get the authenticated patient's insurance help requests.

**Auth:** `isAuthenticated` (Patient)

---

## 18. Blister Pack (Patient)

### POST /api/blister-pack-enrollment
Enroll in the blister pack program (creates entry in blister_pack_patients table).

**Auth:** None (userId auto-attached if logged in)

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "1234567890",
  "email": "john@example.com",
  "address": "123 Main St",
  "insuranceNumber": "POL123",
  "isNewPatient": false,
  "previousPharmacyName": "Old Pharmacy",
  "previousPharmacyPhone": "9876543210"
}
```

**Response (201):**
```json
{
  "success": true,
  "referenceNumber": "BL-ABC123-XYZ",
  "patientId": 1,
  "message": "Enrollment submitted successfully"
}
```

---

### POST /api/blister-pack/enroll
Public blister pack enrollment (landing page form, more detailed).

**Auth:** None

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "1234567890",
  "email": "john@example.com",
  "dateOfBirth": "1990-01-15",
  "address": "123 Main St",
  "city": "Bronx",
  "state": "NY",
  "zipCode": "10460",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "primaryDoctor": "Dr. Smith",
  "doctorPhone": "5551234567",
  "medications": [],
  "allergies": "Penicillin",
  "preferences": "Morning delivery preferred",
  "isNewPatient": true,
  "previousPharmacyName": "Old Pharmacy",
  "previousPharmacyPhone": "9876543210",
  "enrollmentSource": "website"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Enrollment submitted successfully. We will contact you within 24-48 hours.",
  "patientId": 1
}
```

---

### GET /api/my-blister-status
Check if authenticated patient is enrolled in blister pack program.

**Auth:** `isAuthenticated` (Patient)

**Response (200) - Enrolled:**
```json
{
  "enrolled": true,
  "patient": {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "status": "active",
    "medications": [...],
    "nextPackDate": "2024-01-20",
    "lastPackDate": "2024-01-13",
    "deliveryPreference": "delivery",
    "deliveryDay": "Monday",
    "morningTime": "08:00",
    "noonTime": "12:00",
    "eveningTime": "18:00",
    "bedtimeTime": "22:00",
    "enrolledAt": "2024-01-01T00:00:00.000Z",
    "preferences": "Large print labels"
  },
  "communications": [...],
  "unreadCount": 2
}
```

**Response (200) - Not enrolled:**
```json
{ "enrolled": false }
```

---

### PATCH /api/my-blister-communications/:id/read
Mark a blister pack communication as read.

**Auth:** `isAuthenticated` (Patient)

**Path Params:** `id` (numeric)

---

### POST /api/my-blister-communications
Send a message to pharmacy from blister pack section.

**Auth:** `isAuthenticated` (Patient, must be enrolled)

**Request Body:**
```json
{
  "type": "request_blister",
  "message": "I need my next blister pack by Friday",
  "subject": "Blister Pack Request"
}
```

| type | Description |
|------|-------------|
| `request_blister` | Request a new blister pack |
| `request_new_meds` | Request new medications be added |
| `request_blister_change` | Request changes to current pack |
| `general_inquiry` | General question |

---

## 19. Patient Communications

### POST /api/patient/communications
Send a request/message to admin.

**Auth:** Patient session required

**Request Body:**
```json
{
  "type": "general_inquiry",
  "message": "I have a question about my prescription",
  "subject": "Prescription Question"
}
```

---

### GET /api/patient/communications
Get all communications for the authenticated patient.

**Auth:** Patient session required

---

### PATCH /api/patient/communications/:id/read
Mark a communication as read.

**Auth:** Patient session required

**Path Params:** `id` (numeric)

---

## 20. Transfer Requests

### POST /api/transfer-request
Submit a prescription transfer request (public, no auth required). Supports both JSON and multipart/form-data for label image uploads.

**Auth:** None

**Request Body (JSON):**
```json
{
  "contactName": "John Doe",
  "phoneNumber": "1234567890",
  "email": "john@example.com",
  "mode": "form_submission",
  "previousPharmacyName": "Old Pharmacy",
  "previousPharmacyPhone": "9876543210",
  "previousPharmacyAddress": "456 Oak Ave"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| contactName | string | Yes | |
| phoneNumber | string | Yes | min 10 chars |
| email | string | No | |
| mode | string | Yes | `"form_submission"`, `"label_upload"`, `"click_to_call"` |
| previousPharmacyName | string | No | |
| previousPharmacyPhone | string | No | |
| previousPharmacyAddress | string | No | |
| labelImageUrl | string | No | For `label_upload` mode (JSON) |

**For `label_upload` mode via multipart:** Send `labelImage` as file field.

**Response (201):**
```json
{
  "success": true,
  "message": "Transfer request submitted successfully. We will contact you shortly.",
  "requestId": 1
}
```

---

### GET /api/patient/transfer-requests
Get the authenticated patient's transfer requests.

**Auth:** Patient session required

---

## 21. Patient Attendant Management

### GET /api/patient/attendant
Get the patient's linked home attendant/caregiver.

**Auth:** Patient session required

**Response (200) - Has attendant:**
```json
{
  "hasAttendant": true,
  "attendant": {
    "id": 1,
    "firstName": "Jane",
    "lastName": "Caregiver",
    "phoneNumber": "1234567890",
    "email": "jane@example.com",
    "agencyName": "HomeHealth Inc",
    "username": "caregiver1"
  },
  "relationship": {
    "relationshipType": "home_health_aide",
    "canManagePrescriptions": true,
    "canViewMedicalInfo": true,
    "canRequestRefills": true,
    "canPlaceOrders": true,
    "linkedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (200) - No attendant:**
```json
{ "hasAttendant": false }
```

---

### POST /api/patient/attendant
Link or update a home attendant (creates attendant if not found by phone).

**Auth:** Patient session required

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Caregiver",
  "phoneNumber": "1234567890",
  "email": "jane@example.com",
  "relationshipType": "home_health_aide",
  "agencyName": "HomeHealth Inc",
  "username": "caregiver1",
  "password": "securepassword"
}
```

---

### DELETE /api/patient/attendant
Remove the patient's linked home attendant.

**Auth:** Patient session required

---

### POST /api/patient/attendant/credentials
Set login credentials (username/password) for the patient's caregiver.

**Auth:** Patient session required

**Request Body:**
```json
{
  "username": "caregiver1",
  "password": "securepassword"
}
```

---

### GET /api/patient/attendant/audit-log
Get audit log of actions taken on patient's behalf by caregivers.

**Auth:** Patient session required

---

## 22. Patient Scheduled Events

### GET /api/patient/scheduled-events
Get patient's scheduled events (flu shots, pickups, blister packs).

**Auth:** Patient session required

---

## 23. Flu Shot Appointments

### POST /api/flu-shot-appointments
Create a flu shot appointment (public endpoint).

**Auth:** None

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "1234567890",
  "dateOfBirth": "1990-01-15",
  "address": "123 Main St",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "scheduledDate": "2024-02-01",
  "scheduledTime": "10:00 AM",
  "fluShotType": "Standard Flu Vaccine",
  "notes": "First time getting flu shot",
  "isExistingPatient": true,
  "userId": "uuid-string"
}
```

**Response (201):** Created appointment object with `ticketNumber`.

---

## 24. Blog & Alerts (Public)

### GET /api/blogs
Get all published blog posts (public).

**Auth:** None

---

### POST /api/blogs/:id/like
Like a blog post (no auth required).

**Auth:** None

**Path Params:** `id` (numeric)

---

### GET /api/alerts
Get all active pharmacy alerts (public).

**Auth:** None

---

## 25. File Upload

### GET /api/upload/url
Get a signed upload URL for file uploads.

**Auth:** `isAuthenticated`

**Response (200):**
```json
{ "uploadUrl": "https://..." }
```

---

### GET /objects/*
Serve private object files with access control.

**Auth:** None (access control checked internally based on session)

---

## 26. Admin - Users

### GET /api/admin/users
Get all registered users.

**Auth:** `isAuthenticated` + `isAdmin`

**Response (200):** Array of user objects.

---

### PATCH /api/admin/users/:id
Update customer information.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (string)

**Request Body (all fields optional):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "1234567890",
  "address": "123 Main St",
  "allergies": "Penicillin",
  "medicalConditions": "Diabetes",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "insuranceGroupNumber": "GRP456"
}
```

---

### DELETE /api/admin/users/:userId
Delete a customer profile and all related data.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `userId` (string)

---

### GET /api/admin/users/:id/prescriptions
Get prescriptions for a specific user (HIPAA audit-logged).

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/users/:id/orders
Get orders for a specific user (HIPAA audit-logged).

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/users/:id/attendant
Get caregiver/attendant info for a specific patient.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/users/:userId/otc-card
Get OTC card for a specific user.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/users/:userId/documents
Get documents for a specific user.

**Auth:** `isAuthenticated` + `isAdmin`

---

### DELETE /api/admin/users/:userId/documents/:documentId
Delete a specific patient document.

**Auth:** `isAuthenticated` + `isAdmin`

---

## 27. Admin - Prescriptions

### GET /api/admin/prescriptions
Get all prescriptions.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/prescriptions/approve-refill
Approve a pending refill request.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "prescriptionId": "uuid-string"
}
```

---

### PATCH /api/admin/prescriptions/:id/workflow-status
Update prescription workflow status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "workflowStatus": "billing"
}
```

| Value | Description |
|-------|-------------|
| `received` | Prescription received |
| `typing` | Being typed into system |
| `billing` | Insurance billing |
| `billed` | Billing complete |
| `ready_for_delivery` | Ready for pickup/delivery |
| `out_for_delivery` | Out for delivery |
| `delivered` | Delivered to patient |

---

### GET /api/admin/prescriptions/workflow/:status
Get prescriptions by workflow status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `status` - One of the workflow statuses above.

---

### PATCH /api/admin/prescriptions/:id/link-drug
Link a prescription with drug info from the drug dictionary by NDC.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "ndc": "12345678901"
}
```

---

## 28. Admin - Orders

### GET /api/admin/orders
Get all orders.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/orders/:id/status
Update order status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "status": "processing"
}
```

| Value | Options |
|-------|---------|
| status | `"pending"`, `"processing"`, `"completed"`, `"cancelled"` |

---

### POST /api/admin/orders/:id/assign-delivery
Assign a delivery courier to an order.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "courierPartner": "PKGSEND",
  "estimatedDelivery": "2024-01-15T14:00:00.000Z"
}
```

| Field | Type | Values |
|-------|------|--------|
| courierPartner | string | `"PKGSEND"`, `"Burq"` |
| estimatedDelivery | string | ISO date (optional) |

**Response (200):**
```json
{
  "message": "Delivery assigned successfully",
  "order": { ... }
}
```

---

### PATCH /api/admin/orders/:id/delivery-status
Update delivery status of an order.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "deliveryStatus": "in_transit",
  "deliveryNotes": "Driver en route",
  "proofOfDeliveryUrl": "https://..."
}
```

| Delivery Status Values |
|------------------------|
| `not_assigned`, `assigned`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`, `failed`, `returned` |

---

## 29. Admin - Products & Inventory

### POST /api/admin/products
Create a new product.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "name": "Ibuprofen 200mg",
  "description": "Pain reliever",
  "price": "9.99",
  "category": "otc",
  "stockQuantity": 100,
  "stockThreshold": 10,
  "imageUrl": null,
  "ndc": "12345678901",
  "inStock": true,
  "requiresPrescription": false
}
```

---

### PATCH /api/admin/products/:id
Update a product.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

---

### DELETE /api/admin/products/:id
Delete a product.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

---

### POST /api/admin/products/bulk-import
Bulk import products from CSV file.

**Auth:** `isAuthenticated` + `isAdmin`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file` - CSV file with headers: `name`, `price`, `category` (required), plus optional: `description`, `stockquantity`, `stockthreshold`, `imageurl`, `ndc`

**Response (200):**
```json
{
  "message": "Successfully imported 25 products",
  "created": 25,
  "total": 27,
  "errors": ["Row 3: Invalid price", "Row 15: Missing name"]
}
```

---

### GET /api/admin/products/below-threshold
Get products below stock threshold (reorder list).

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/products/sales-analysis
Get product sales analysis data.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/inventory/low-stock
Get low stock products for real-time inventory sync.

**Auth:** `isAuthenticated` + `isAdmin`

---

## 30. Admin - Vendors & Reorder

### GET /api/admin/vendors
Get all vendors.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/vendors
Create a vendor.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "name": "McKesson Distribution",
  "code": "mckesson",
  "accountNumber": "ACC-123",
  "apiEndpoint": "https://api.mckesson.com",
  "contactEmail": "orders@mckesson.com",
  "contactPhone": "1-800-555-0100",
  "notes": "Primary distributor"
}
```

| code | Options |
|------|---------|
| code | `"mckesson"`, `"kinray"`, `"smart_source"`, `"master"`, `"integralrx"`, `"other"` |

---

### PATCH /api/admin/vendors/:id
Update a vendor.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### GET /api/admin/vendor-prices/:ndc
Get vendor price comparison for a specific NDC code.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `ndc` (10-11 digit string)

---

### GET /api/admin/reorder-items
Get all reorder items.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/reorder-items
Create a reorder item.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "productId": "uuid-string",
  "ndc": "12345678901",
  "quantityNeeded": 50,
  "preferredVendor": "mckesson",
  "notes": "Urgent reorder"
}
```

---

### PATCH /api/admin/reorder-items/:id
Update a reorder item.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body (all optional):**
```json
{
  "quantityNeeded": 100,
  "preferredVendor": "kinray",
  "status": "ordered",
  "orderedFrom": "mckesson",
  "notes": "Expected delivery in 2 days"
}
```

---

### DELETE /api/admin/reorder-items/:id
Delete a reorder item.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

## 31. Admin - Blister Pack Patients

### GET /api/admin/blister-patients
Get all blister pack patients.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/blister-patients/:id
Get a single blister pack patient (HIPAA audit-logged).

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### POST /api/admin/blister-patients
Create a new blister pack patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "1234567890",
  "email": "john@example.com",
  "dateOfBirth": "1990-01-15",
  "age": 34,
  "gender": "male",
  "address": "123 Main St",
  "city": "Bronx",
  "state": "NY",
  "zipCode": "10460",
  "insuranceProvider": "Aetna",
  "insurancePolicyNumber": "POL123",
  "insuranceGroupNumber": "GRP456",
  "insurancePhone": "1-800-555-0100",
  "primaryDoctor": "Dr. Smith",
  "doctorPhone": "5551234567",
  "doctorFax": "5551234568",
  "allergies": "Penicillin",
  "medicalConditions": "Diabetes, Hypertension",
  "blisterPackType": "weekly",
  "status": "pending",
  "medications": [],
  "deliveryDay": "Monday",
  "deliveryTime": "10:00 AM",
  "deliveryPreference": "delivery",
  "morningTime": "08:00",
  "noonTime": "12:00",
  "eveningTime": "18:00",
  "bedtimeTime": "22:00",
  "preferences": "Large print labels",
  "languagePreference": "English",
  "specialInstructions": "Leave with doorman",
  "emergencyContactName": "Jane Doe",
  "emergencyContactPhone": "9876543210",
  "emergencyContactRelation": "Spouse",
  "adminNotes": "New enrollment",
  "enrollmentSource": "website",
  "previousPharmacyName": "Old Pharmacy",
  "previousPharmacyPhone": "5559876543",
  "isNewPatient": false
}
```

| blisterPackType | Options |
|-----------------|---------|
| blisterPackType | `"weekly"`, `"bi_weekly"`, `"monthly"`, `"multi_dose"`, `"unit_dose"` |

| status | Options |
|--------|---------|
| status | `"pending"`, `"active"`, `"on_hold"`, `"discontinued"` |

---

### PATCH /api/admin/blister-patients/:id
Update a blister pack patient. All fields are optional (same schema as create, plus `lastPackDate` and `nextPackDate`).

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### DELETE /api/admin/blister-patients/:id
Delete a blister pack patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### GET /api/admin/blister-patients/:id/medication-history
Get medication change history for a blister pack patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### POST /api/admin/blister-patients/:id/medication-history
Add a medication history entry.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body:**
```json
{
  "action": "added",
  "medicationName": "Lisinopril 10mg",
  "oldValue": null,
  "newValue": { "dosage": "10mg", "frequency": "daily" },
  "changedBy": "Dr. Smith",
  "reason": "New prescription for blood pressure"
}
```

---

### POST /api/admin/blister-patients/:id/notify
Send a notification to a blister pack patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body:**
```json
{
  "type": "blister_ready",
  "message": "Your blister pack is ready for pickup!",
  "subject": "Blister Pack Ready"
}
```

| type | Description |
|------|-------------|
| `blister_ready` | Blister pack is ready |
| `blister_due_soon` | Pack is due soon |
| `new_prescription_required` | Need new Rx |
| `no_more_refills` | Refills exhausted |
| `prescription_ready` | Prescription ready |
| `delivery_scheduled` | Delivery scheduled |
| `custom_message` | Custom notification |
| `payment_reminder` | Payment reminder |
| `general_update` | General update |

---

### GET /api/admin/blister-patients/:id/communications
Get all communications for a blister pack patient.

**Auth:** `isAuthenticated` + `isAdmin`

---

## 32. Admin - Transfer Requests

### GET /api/admin/transfer-requests
Get all transfer requests.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/transfer-requests/:id
Update transfer request status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body:**
```json
{
  "status": "contacting_pharmacy",
  "statusMessage": "Called previous pharmacy",
  "notes": "Waiting for fax",
  "assignedTo": "Jane Pharmacist"
}
```

| Transfer Status Values |
|------------------------|
| `request_received`, `processing`, `contacting_pharmacy`, `transfer_in_progress`, `transfer_successful`, `transfer_failed`, `cancelled` |

When status is `transfer_successful`, 1000 loyalty points are automatically awarded if the request is linked to a user.

---

### PATCH /api/admin/transfer-requests/:id/link-user
Link a transfer request to a user account.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "userId": "uuid-string"
}
```

---

### DELETE /api/admin/transfer-requests/:id
Delete a transfer request.

**Auth:** `isAuthenticated` + `isAdmin`

---

## 33. Admin - Urgent Refills

### GET /api/admin/urgent-refills
Get all urgent refill requests.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/urgent-refills/pending
Get only pending urgent refill requests.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/urgent-refills/:id
Update urgent refill request status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "status": "completed",
  "adminNotes": "Refill processed and ready for pickup"
}
```

| Status Values |
|---------------|
| `"pending"`, `"processing"`, `"completed"`, `"cancelled"` |

When `status` is `completed`, the prescription status is automatically updated to `"filled"`.

---

## 34. Admin - Attendants/Caregivers

### GET /api/admin/attendants
Get all home attendants with linked patient counts.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/attendants/:id
Update attendant information/status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body (all optional):**
```json
{
  "status": "active",
  "firstName": "Jane",
  "lastName": "Caregiver",
  "email": "jane@example.com",
  "agencyName": "HomeHealth Inc",
  "licenseNumber": "LIC-123"
}
```

| Status Options |
|----------------|
| `"pending_verification"`, `"active"`, `"suspended"`, `"inactive"` |

---

### GET /api/admin/attendant-audit-logs
Get caregiver audit logs.

**Auth:** `isAuthenticated` + `isAdmin`

**Query Params:**
- `attendantId` (numeric, optional)
- `patientId` (string, optional)
- `limit` (number, default 100)

---

### POST /api/attendants
Create or find a home attendant (used during patient registration).

**Auth:** None

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Caregiver",
  "phoneNumber": "1234567890",
  "email": "jane@example.com",
  "agencyName": "HomeHealth Inc",
  "licenseNumber": "LIC-123",
  "patientId": "uuid-string",
  "relationshipType": "home_health_aide"
}
```

---

### GET /api/attendants/by-phone/:phone
Look up attendant by phone number (used during patient registration).

**Auth:** None

---

## 35. Admin - Staff Email Management

### GET /api/admin/staff-emails
Get all registered staff emails.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/staff-emails
Register a new staff email.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "email": "newstaff@pharmacy.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "pharmacist",
  "isActive": true
}
```

| Role Options |
|-------------|
| `"staff"`, `"manager"`, `"pharmacist"`, `"technician"`, `"admin"` |

---

### PATCH /api/admin/staff-emails/:id
Update a staff email entry.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### DELETE /api/admin/staff-emails/:id
Delete a staff email.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

## 36. Admin - Blog & Alerts

### POST /api/admin/blog
Create a new blog post (saved as draft).

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "title": "Flu Season Tips",
  "content": "Here are some tips for staying healthy...",
  "authorName": "Dr. Smith",
  "authorDesignation": "PharmD"
}
```

---

### POST /api/admin/blog/:id/publish
Publish a draft blog post.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### POST /api/admin/blog/:id/unpublish
Unpublish a blog post.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### PATCH /api/admin/blog/:id/image
Set or update a blog post's image URL.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body:**
```json
{
  "imageUrl": "https://objects/blog/image.jpg"
}
```

---

### POST /api/admin/alerts
Create a new pharmacy alert.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "message": "Pharmacy will be closed on Jan 1st for New Year's Day",
  "expiresAt": "2024-01-02T00:00:00.000Z"
}
```

---

### POST /api/admin/alerts/:id/deactivate
Deactivate a pharmacy alert.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

## 37. Admin - Analytics & Audit

### GET /api/admin/analytics
Get analytics dashboard summary.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/attention-counts
Get sidebar badge counts for items needing attention.

**Auth:** `isAuthenticated` + `isAdmin`

**Response (200):**
```json
{
  "urgentRefills": {
    "count": 3,
    "urgentCount": 1,
    "normalCount": 2,
    "level": "high"
  },
  "transferRequests": {
    "count": 2,
    "level": "low"
  },
  "orders": {
    "count": 5,
    "level": "medium"
  },
  "insuranceHelp": {
    "count": 1,
    "level": "low"
  },
  "reorderList": {
    "count": 8,
    "level": "medium"
  }
}
```

Level values: `"none"`, `"low"`, `"medium"`, `"high"`

---

### GET /api/admin/audit-logs
Get audit logs with optional filtering.

**Auth:** `isAuthenticated` + `isAdmin`

**Query Params:**
- `userId` (UUID, optional)
- `actionType` (string, optional) - `"create"`, `"update"`, `"delete"`, `"view"`
- `entityType` (string, optional) - `"user"`, `"prescription"`, `"order"`, `"chat"`, `"product"`, etc.
- `limit` (number, 1-500, default 100)

---

## 38. Admin - Points & Rewards Engine

### GET /api/admin/points/analytics
Get points system analytics overview.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/points/gamification-analytics
Get comprehensive gamification analytics.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/points/earning-rules
Get all earning rules (active and inactive).

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/points/earning-rules
Create a new earning rule.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "ruleKey": "flu_vaccine_bonus",
  "actionType": "vaccine_completed",
  "name": "Flu Vaccine Bonus",
  "description": "Points for getting vaccinated at our pharmacy",
  "basePoints": 200,
  "pointsPerDollar": "0",
  "maxPointsPerEvent": 200,
  "maxEventsPerDay": 1,
  "maxEventsPerMonth": 1,
  "isOneTime": true,
  "isActive": true
}
```

| Action Types |
|-------------|
| `on_time_refill`, `perfect_adherence_month`, `streak_3_refills`, `streak_5_refills`, `streak_10_refills`, `weekly_app_engagement`, `enable_delivery`, `profile_completion`, `otc_purchase`, `delivery_completed`, `vaccine_completed`, `prescription_transfer`, `referral_completed`, `redeem_otc`, `redeem_delivery_fee`, `redeem_copay`, `admin_adjustment`, `expiration`, `signup_bonus`, `campaign_bonus` |

---

### PATCH /api/admin/points/earning-rules/:id
Update an earning rule.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body (all optional):**
```json
{
  "points": 300,
  "isActive": true,
  "description": "Updated description"
}
```

---

### DELETE /api/admin/points/earning-rules/:id
Delete an earning rule.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/points/rewards
Get all rewards.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/points/rewards
Create a new reward.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "name": "$5 Off OTC Purchase",
  "description": "Redeem for $5 off any OTC purchase",
  "pointsCost": 500,
  "rewardType": "otc_discount",
  "discountValue": "5.00",
  "discountType": "fixed",
  "status": "active",
  "isReusable": true,
  "maxRedemptionsPerUser": 3,
  "maxRedemptionsTotal": 1000,
  "minPointsBalance": 500,
  "requiredStreakType": "refill_adherence",
  "requiredStreakCount": 3,
  "startsAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

| Reward Types |
|-------------|
| `"otc_discount"`, `"delivery_waiver"`, `"copay_assistance"`, `"points_multiplier"`, `"free_item"` |

---

### PATCH /api/admin/points/rewards/:id
Update a reward.

**Auth:** `isAuthenticated` + `isAdmin`

---

### DELETE /api/admin/points/rewards/:id
Delete a reward.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/points/campaigns
Get all campaigns.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/points/campaigns
Create a new campaign (double points, bonus, etc.).

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "name": "Double Points Weekend",
  "description": "Earn double points on all purchases this weekend",
  "campaignType": "double_points",
  "multiplier": 2.0,
  "bonusPoints": null,
  "applicableActions": ["otc_purchase", "on_time_refill"],
  "startsAt": "2024-01-20T00:00:00.000Z",
  "endsAt": "2024-01-22T23:59:59.000Z",
  "isActive": true
}
```

| Campaign Types |
|---------------|
| `"double_points"`, `"bonus_points"`, `"multiplier"` |

---

### PATCH /api/admin/points/campaigns/:id
Update a campaign.

**Auth:** `isAuthenticated` + `isAdmin`

---

### DELETE /api/admin/points/campaigns/:id
Delete a campaign.

**Auth:** `isAuthenticated` + `isAdmin`

---

### POST /api/admin/points/award
Manually award points to a patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "userId": "uuid-string",
  "points": 100,
  "reason": "Customer service resolution - price match"
}
```

---

### POST /api/admin/points/deduct
Manually deduct points from a patient.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "userId": "uuid-string",
  "points": 50,
  "reason": "Points correction - duplicate entry"
}
```

---

### POST /api/admin/points/wallet/:userId/freeze
Freeze a patient's points wallet.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `userId` (string)

**Request Body:**
```json
{
  "reason": "Suspected fraudulent activity"
}
```

---

### POST /api/admin/points/wallet/:userId/unfreeze
Unfreeze a patient's points wallet.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `userId` (string)

---

### GET /api/admin/points/wallet/:userId
Get a patient's points wallet, recent ledger, and streaks.

**Auth:** `isAuthenticated` + `isAdmin`

**Response (200):**
```json
{
  "wallet": { ... },
  "ledger": [ ... ],
  "streaks": [ ... ]
}
```

---

### GET /api/admin/points/wallet/:userId/ledger
Get a patient's detailed points ledger.

**Auth:** `isAuthenticated` + `isAdmin`

**Query Params:** `limit` (number, default 100)

---

### POST /api/admin/streaks/:userId/restore
Restore a patient's streak count (admin override).

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `userId` (string)

**Request Body:**
```json
{
  "streakType": "refill_adherence",
  "newCount": 5,
  "reason": "System error reset streak incorrectly"
}
```

| Streak Types |
|-------------|
| `"refill_adherence"`, `"weekly_engagement"`, `"monthly_adherence"` |

---

### POST /api/admin/points/wallet/:userId/clear-flag
Clear gaming/anomaly flag on a patient's wallet.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "reason": "Reviewed and confirmed legitimate activity"
}
```

---

### GET /api/admin/points/flagged-users
Get all users flagged for suspicious points activity.

**Auth:** `isAuthenticated` + `isAdmin`

---

## 39. Admin - PrimeRx Integration

### POST /api/admin/primerx/sync
Simulate receiving prescription data from PrimeRx system.

**Auth:** `isAuthenticated` + `isAdmin`

**Request Body:**
```json
{
  "primeRxId": "PRX-001",
  "patientEmail": "patient@example.com",
  "rxNumber": "RX-001234",
  "medicationName": "Metformin 500mg",
  "dosage": "500mg",
  "quantity": 90,
  "refillsRemaining": 3,
  "prescribedBy": "Dr. Smith",
  "instructions": "Take twice daily with meals"
}
```

**Response (200):**
```json
{
  "message": "Prescription synced successfully",
  "prescription": { ... }
}
```

---

### GET /api/admin/primerx/sync-logs
Get PrimeRx sync history logs.

**Auth:** `isAuthenticated` + `isAdmin`

**Query Params:** `limit` (number, default 50)

---

## 40. Admin - Drug Dictionary

### GET /api/admin/drugs
Get all drugs in the dictionary.

**Auth:** `isAuthenticated` + `isAdmin`

---

### GET /api/admin/drugs/search
Search drugs by name.

**Auth:** `isAuthenticated` + `isAdmin`

**Query Params:** `q` (string, min 2 chars)

---

### GET /api/admin/drugs/:id
Get a single drug by ID.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

---

### GET /api/admin/drugs/ndc/:ndc
Look up a drug by NDC code.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `ndc` (string)

---

## 41. Admin - Insurance Help

### GET /api/admin/insurance-help
Get all insurance assistance requests.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/insurance-help/:id/status
Update insurance assistance request status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (UUID)

**Request Body:**
```json
{
  "status": "in_progress"
}
```

| Status Values |
|--------------|
| `"pending"`, `"in_progress"`, `"completed"`, `"cancelled"` |

---

## 42. Admin - Flu Shot Appointments

### GET /api/admin/flu-shot-appointments
Get all flu shot appointments.

**Auth:** `isAuthenticated` + `isAdmin`

---

### PATCH /api/admin/flu-shot-appointments/:id/status
Update flu shot appointment status.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

**Request Body:**
```json
{
  "status": "completed"
}
```

---

## 43. Admin - Communications

### PATCH /api/admin/communications/:id/acknowledge
Mark a patient communication as acknowledged.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

### PATCH /api/admin/communications/:id/resolve
Mark a patient communication as resolved.

**Auth:** `isAuthenticated` + `isAdmin`

**Path Params:** `id` (numeric)

---

## 44. WebSocket - Real-time Updates

### WS /ws/admin
WebSocket endpoint for real-time admin dashboard updates.

**Connection:** `ws://host/ws/admin`

**Message Format (incoming):**
```json
{
  "channel": "transfer-requests",
  "type": "new",
  "data": { ... }
}
```

| Channel | Events |
|---------|--------|
| `transfer-requests` | `new` - New transfer request submitted |
| `transfer_requests` | `deleted` - Transfer request deleted |
| `blister-patients` | `new` - New blister pack enrollment |
| `urgent_refills` | `updated` - Refill request status changed |
| `blister-communications` | New patient message (includes `patientId`) |

---

## Rate Limiting Summary

| Endpoint | Limit |
|----------|-------|
| Patient OTP Request | 5 per minute per phone |
| Patient OTP Verify | 10 per 10 minutes, 15-min lockout |
| Per-OTP Attempts | 5 per code |
| Staff OTP Request | 5 per 10 minutes per email |
| Staff OTP Verify | 5 attempts per code |
| Attendant OTP Request | 5 per minute per phone |
| Attendant OTP Verify | 10 per 10 minutes, 15-min lockout |

---

## HIPAA Compliance Notes

- All PHI access (prescriptions, medical info, documents) is audit-logged
- Chat access is audit-logged for compliance traceability
- Admin views of patient data create audit log entries
- Delivery chat messages are logged for HIPAA compliance
- Document uploads/deletions are audit-logged
- Patient profile edits by admin are tracked with before/after values

---

## 45. Public MCP Server

Concordia exposes a stateless Streamable HTTP MCP endpoint for public, read-only
AI-agent access.

- **Endpoint:** `POST /mcp`
- **Discovery:** `GET /.well-known/mcp.json`
- **Authentication:** None; public information only
- **Rate limit:** 120 requests per minute per source address

### Available tools

| Tool | Purpose |
|------|---------|
| `get_pharmacy_info` | Public phone, address, hours, and safety guidance |
| `list_catalog_categories` | Public OTC catalog categories |
| `search_catalog` | Bounded public OTC product search |
| `get_catalog_product` | Sanitized details for one public OTC product |

The MCP server intentionally excludes patient records, prescription and order
data, exact inventory counts, NDC/barcode fields, checkout, refill submission,
staff actions, and arbitrary API/database access. Website availability remains
informational until pharmacy staff confirm it.
