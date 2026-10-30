import { sql } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  check,
  decimal,
  pgEnum,
  serial,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Enums
export const userRoleEnum = pgEnum("user_role", ["patient", "admin"]);
export const prescriptionStatusEnum = pgEnum("prescription_status", [
  "active",
  "pending_refill",
  "expired",
  "cancelled",
  "discontinued",
]);
export const prescriptionWorkflowStatusEnum = pgEnum("prescription_workflow_status", [
  "received",
  "typing",
  "billing",
  "billed",
  "label_printed",
  "dpv_verified",
  "rph_verified",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "filed",
  "reversed",
  "rejected",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "processing",
  "completed",
  "cancelled",
  "refunded",
  "preparing",
  "ready_for_pickup",
  "sent_for_delivery",
  "delivered",
  "picked_up",
]);
export const orderTypeEnum = pgEnum("order_type", ["prescription", "otc", "mixed"]);
export const orderSourceEnum = pgEnum("order_source", ["website", "app", "in_store"]);
export const vendorEnum = pgEnum("vendor", [
  "mckesson",
  "kinray", 
  "smart_source",
  "master",
  "integralrx",
  "other",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "not_assigned",
  "assigned",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
]);

// Conversion funnel enums
export const leadTypeEnum = pgEnum("lead_type", ["transfer", "new_script"]);
export const leadStatusEnum = pgEnum("lead_status", ["pending_request", "approved", "rejected"]);
export const patientStatusEnum = pgEnum("patient_status", ["pending_request", "active", "rejected"]);

// Users table with Replit Auth fields
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").notNull().default("patient"),
  phoneNumber: varchar("phone_number"),
  dateOfBirth: timestamp("date_of_birth"),
  address: text("address"),
  // Structured address returned by the server's map/provider verification.
  // The legacy freeform address remains unchanged for compatibility.
  verifiedDeliveryAddress: jsonb("verified_delivery_address").$type<{
    label: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    lat: number;
    lon: number;
    osmType?: string;
    osmId?: number;
  } | null>(),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  // Insurance information
  insuranceProvider: varchar("insurance_provider"),
  insurancePolicyNumber: varchar("insurance_policy_number"),
  insuranceGroupNumber: varchar("insurance_group_number"),
  insuranceData: jsonb("insurance_data"),
  refillReminder: boolean("refill_reminder").default(false),
  // Medical information
  allergies: text("allergies"),
  medicalConditions: text("medical_conditions"),
  // Additional patient info
  gender: varchar("gender"),
  doctorName: varchar("doctor_name"),
  doctorPhone: varchar("doctor_phone"),
  preferences: text("preferences"),
  adminNotes: text("admin_notes"),
  diagnosis: text("diagnosis"),
  primeRxPatientId: varchar("prime_rx_patient_id").unique(),
  familyGroupId: varchar("family_group_id"),
  concordiaCareUserId: varchar("concordia_care_user_id").unique(),
  middleInitial: varchar("middle_initial"),
  concordiaId: varchar("concordia_id").unique(),
  mrn: varchar("mrn"),
  chartNo: varchar("chart_no"),
  language: varchar("language"),
  preferredDeliveryMethod: varchar("preferred_delivery_method"),
  smokerCode: varchar("smoker_code"),
  pregnancyCode: varchar("pregnancy_code"),
  usingApp: boolean("using_app").default(false),
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"),
  clerkId: varchar("clerk_id").unique(),
  // Referral tracking
  referralCode: varchar("referral_code").unique(), // This user's unique code to share
  referredByUserId: varchar("referred_by_user_id"), // Who referred this user (if anyone)
  referralPointsAwarded: boolean("referral_points_awarded").default(false), // Track if referrer got points
  patientStatus: patientStatusEnum("patient_status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OTP verification codes for phone login
export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  phoneNumber: varchar("phone_number").notNull(),
  code: varchar("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat-only directory verification. This is deliberately separate from all
// account authentication and legacy OTP records: it stores no demographics,
// email address, or raw verification code.
export const chatIdentityChallenges = pgTable("chat_identity_challenges", {
  id: varchar("id").primaryKey(),
  patientId: varchar("patient_id"),
  codeHash: varchar("code_hash").notNull(),
  identifierHash: varchar("identifier_hash").notNull(),
  ipHash: varchar("ip_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A purpose-specific, hashed-key cooldown store. Never reuse this for account
// login or patient data access rate limiting.
export const chatIdentityRateLimits = pgTable("chat_identity_rate_limits", {
  keyHash: varchar("key_hash").primaryKey(),
  lastRequestedAt: timestamp("last_requested_at").notNull(),
});

// Staff emails for email-based OTP authentication
export const staffEmails = pgTable("staff_emails", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull().unique(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  role: varchar("role").notNull().default("staff"), // staff, manager, pharmacist, etc.
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  addedBy: varchar("added_by"), // admin who added this staff email
});

export const insertStaffEmailSchema = createInsertSchema(staffEmails).omit({
  id: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
});

export type StaffEmail = typeof staffEmails.$inferSelect;
export type InsertStaffEmail = z.infer<typeof insertStaffEmailSchema>;

// Staff OTP codes for email-based authentication (separate from patient phone OTPs)
export const staffOtpCodes = pgTable("staff_otp_codes", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  codeHash: varchar("code_hash").notNull(), // Hashed OTP for security
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffOtpCodeSchema = createInsertSchema(staffOtpCodes).omit({
  id: true,
  verified: true,
  attempts: true,
  createdAt: true,
});

export type StaffOtpCode = typeof staffOtpCodes.$inferSelect;
export type InsertStaffOtpCode = z.infer<typeof insertStaffOtpCodeSchema>;

export const usersRelations = relations(users, ({ many }) => ({
  prescriptions: many(prescriptions),
  orders: many(orders),
  cartItems: many(cartItems),
  loyaltyTransactions: many(loyaltyTransactions),
}));

// Drug form enum (tablet, capsule, liquid, etc.)
export const drugFormEnum = pgEnum("drug_form", [
  "tablet", "capsule", "liquid", "cream", "gel", "ointment", 
  "patch", "injection", "inhaler", "drops", "powder", "suppository", "other"
]);

// Release type enum (ER = Extended Release, DR = Delayed Release, IR = Immediate Release)
export const releaseTypeEnum = pgEnum("release_type", ["IR", "ER", "DR", "SR", "XR", "CR"]);

// Prescriptions table
export const prescriptions = pgTable("prescriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rxNumber: varchar("rx_number").notNull().unique(),
  medicationName: varchar("medication_name").notNull(),
  dosage: varchar("dosage").notNull(),
  quantity: integer("quantity").notNull(),
  refillsRemaining: integer("refills_remaining").notNull().default(0),
  prescribedBy: varchar("prescribed_by").notNull(),
  instructions: text("instructions"),
  status: prescriptionStatusEnum("status").notNull().default("active"),
  workflowStatus: prescriptionWorkflowStatusEnum("workflow_status").default("received"),
  primeRxId: varchar("prime_rx_id"),
  expirationDate: timestamp("expiration_date"),
  lastFilledDate: timestamp("last_filled_date"),
  nextRefillDate: timestamp("next_refill_date"),
  ndc: varchar("ndc"),
  strength: varchar("strength"),
  strengthUnit: varchar("strength_unit"),
  drugForm: drugFormEnum("drug_form"),
  releaseType: releaseTypeEnum("release_type"),
  color: varchar("color"),
  shape: varchar("shape"),
  imprint: varchar("imprint"),
  manufacturer: varchar("manufacturer"),
  genericName: varchar("generic_name"),
  brandName: varchar("brand_name"),
  copayAmount: decimal("copay_amount", { precision: 10, scale: 2 }),
  sig: text("sig"),
  parsedSig: jsonb("parsed_sig").$type<{
    dose: number | null;
    unit: string | null;
    route: string | null;
    frequencyCode: string | null;
    intakeTimes: string[];
    intervalHours: number | null;
    withFood: boolean | null;
    specialFlag: string | null;
    autoParsed: boolean;
  }>(),
  daysSupply: integer("days_supply"),
  refillNo: integer("refill_no"),
  authRefills: integer("auth_refills"),
  totalRxAmount: decimal("total_rx_amount", { precision: 10, scale: 2 }),
  primaryInsurancePaid: decimal("primary_insurance_paid", { precision: 10, scale: 2 }),
  secondaryInsurancePaid: decimal("secondary_insurance_paid", { precision: 10, scale: 2 }),
  tertiaryInsurancePaid: decimal("tertiary_insurance_paid", { precision: 10, scale: 2 }),
  billType: varchar("bill_type"),
  deliveryMethod: varchar("delivery_method"),
  rxOriginCode: varchar("rx_origin_code"),
  rxOriginDescription: varchar("rx_origin_description"),
  lotNo: varchar("lot_no"),
  drugExpiryDate: timestamp("drug_expiry_date"),
  drugClass: varchar("drug_class"),
  pickedUp: varchar("picked_up"),
  queueName: varchar("queue_name"),
  qtyOrdered: decimal("qty_ordered", { precision: 10, scale: 3 }),
  qtyDispensed: decimal("qty_dispensed", { precision: 10, scale: 3 }),
  qtyRemaining: decimal("qty_remaining", { precision: 10, scale: 3 }),
  dateFilled: timestamp("date_filled"),
  dateOrdered: timestamp("date_ordered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// PrimeRx Drug Dictionary - synced from PrimeRx
export const primeRxDrugs = pgTable("prime_rx_drugs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ndc: varchar("ndc").notNull().unique(),
  brandName: varchar("brand_name"),
  genericName: varchar("generic_name").notNull(),
  strength: varchar("strength"),
  strengthUnit: varchar("strength_unit"),
  drugForm: drugFormEnum("drug_form"),
  releaseType: releaseTypeEnum("release_type"),
  color: varchar("color"),
  shape: varchar("shape"),
  imprint: varchar("imprint"),
  manufacturer: varchar("manufacturer"),
  packageSize: integer("package_size"),
  deaSchedule: varchar("dea_schedule"),
  awpPrice: decimal("awp_price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  primeRxId: varchar("prime_rx_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const prescriptionsRelations = relations(prescriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [prescriptions.userId],
    references: [users.id],
  }),
  syncLogs: many(primeRxSyncLogs),
}));

// Products table (OTC items and prescription-gated products)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  category: varchar("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: varchar("image_url"),
  inStock: boolean("in_stock").notNull().default(true),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  stockThreshold: integer("stock_threshold").notNull().default(10),
  requiresPrescription: boolean("requires_prescription").notNull().default(false),
  ndc: varchar("ndc", { length: 14 }),
  preferredVendor: vendorEnum("preferred_vendor"),
  vendorProductCode: varchar("vendor_product_code"),
  lastOrderedFrom: vendorEnum("last_ordered_from"),
  lastOrderedAt: timestamp("last_ordered_at"),
  showOnWebsite: boolean("show_on_website").notNull().default(true),
  showInApp: boolean("show_in_app").notNull().default(true),
  expiryDate: varchar("expiry_date"),
  status: varchar("status").notNull().default("active"),
  importBatchId: varchar("import_batch_id"),
  importSource: varchar("import_source"),
  externalId: varchar("external_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productsRelations = relations(products, ({ many }) => ({
  cartItems: many(cartItems),
  orderItems: many(orderItems),
}));

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  orderNumber: varchar("order_number").notNull().unique(),
  type: orderTypeEnum("type").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  pointsUsed: integer("points_used").notNull().default(0),
  pointsEarned: integer("points_earned").notNull().default(0),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentIntentId: varchar("payment_intent_id"),
  guestEmail: varchar("guest_email"),
  guestName: varchar("guest_name"),
  guestPhone: varchar("guest_phone"),
  notes: text("notes"),
  shippingAddress: text("shipping_address"),
  courierName: varchar("courier_name"),
  courierPhone: varchar("courier_phone"),
  courierPartner: varchar("courier_partner"),
  trackingNumber: varchar("tracking_number"),
  deliveryStatus: deliveryStatusEnum("delivery_status").default("not_assigned"),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  proofOfDeliveryUrl: varchar("proof_of_delivery_url"),
  deliveryNotes: text("delivery_notes"),
  source: orderSourceEnum("source").default("website").notNull(),
  concordiaCareOrderId: varchar("concordia_care_order_id").unique(),
  appStatus: varchar("app_status"),
  deliveryMethod: varchar("delivery_method"),
  paymentMethod: varchar("payment_method"),
  pickupSlot: varchar("pickup_slot"),
  estimatedReadyTime: varchar("estimated_ready_time"),
  paymentStatus: varchar("payment_status").default("collect_at_counter"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

// Order Items table
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").references(() => products.id),
  prescriptionId: varchar("prescription_id").references(() => prescriptions.id),
  name: varchar("name").notNull(),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  prescription: one(prescriptions, {
    fields: [orderItems.prescriptionId],
    references: [prescriptions.id],
  }),
}));

// Cart Items table - supports both OTC products and prescriptions (hybrid cart)
export const cartItemTypeEnum = pgEnum("cart_item_type", ["product", "prescription"]);

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemType: cartItemTypeEnum("item_type").notNull().default("product"),
  productId: varchar("product_id").references(() => products.id, { onDelete: "cascade" }),
  prescriptionId: varchar("prescription_id").references(() => prescriptions.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  copayAmount: decimal("copay_amount", { precision: 10, scale: 2 }), // For prescriptions with copay
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  prescription: one(prescriptions, {
    fields: [cartItems.prescriptionId],
    references: [prescriptions.id],
  }),
}));

// Loyalty Transactions table
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id),
  points: integer("points").notNull(),
  type: varchar("type").notNull(), // 'earned' or 'redeemed'
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  user: one(users, {
    fields: [loyaltyTransactions.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [loyaltyTransactions.orderId],
    references: [orders.id],
  }),
}));

// PrimeRx Sync Logs table
export const primeRxSyncLogs = pgTable("prime_rx_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncType: varchar("sync_type").notNull(),
  primeRxId: varchar("prime_rx_id"),
  prescriptionId: varchar("prescription_id").references(() => prescriptions.id),
  status: varchar("status").notNull(),
  errorMessage: text("error_message"),
  syncData: jsonb("sync_data"),
  eventType: varchar("event_type"),
  rxNo: varchar("rx_no"),
  refillNo: integer("refill_no"),
  workflowTransition: varchar("workflow_transition"),
  patientName: varchar("patient_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const primeRxSyncLogsRelations = relations(primeRxSyncLogs, ({ one }) => ({
  prescription: one(prescriptions, {
    fields: [primeRxSyncLogs.prescriptionId],
    references: [prescriptions.id],
  }),
}));

// Audit log enums for HIPAA compliance
export const AUDIT_ACTION_TYPES = ["create", "update", "delete", "view", "export"] as const;
export const AUDIT_ENTITY_TYPES = [
  "prescription", "order", "user", "product", "cart", "payment", "chat", "patient_document",
  "caregiver_contact", "caregiver_credentials", "staff_email", "staff_otp_request", "staff_login", "staff_session",
  "scheduled_events", "earning_rule", "reward", "campaign", "points_wallet", "points_ledger",
  "patient_condition", "health_journal_entry",
  "otc_card", "doctor",
  "clinical_note", "prior_auth_request", "drug_info", "fhir_export"
] as const;

export const auditActionTypeEnum = pgEnum("audit_action_type", AUDIT_ACTION_TYPES);
export const auditEntityTypeEnum = pgEnum("audit_entity_type", AUDIT_ENTITY_TYPES);

// Audit Logs table for HIPAA compliance
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Can be null for system actions
  actionType: auditActionTypeEnum("action_type").notNull(),
  entityType: auditEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id"), // ID of the affected entity
  oldValue: jsonb("old_value"), // Previous state
  newValue: jsonb("new_value"), // New state
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Notifications system
export const notificationTypeEnum = pgEnum("notification_type", [
  "prescription_status",
  "refill_reminder",
  "order_update",
  "delivery_update",
  "system",
  "scheduled_event",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "email",
  "sms",
]);

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  channel: notificationChannelEnum("channel").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  sent: boolean("sent").notNull().default(false),
  entityId: varchar("entity_id"), // Related prescription/order ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Urgent Refill Requests - for admin dashboard
export const urgentRefillStatusEnum = pgEnum("urgent_refill_status", [
  "pending",
  "processing",
  "completed",
  "cancelled",
]);

export const urgentRefillRequests = pgTable("urgent_refill_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prescriptionId: varchar("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedBy: varchar("requested_by"), // Can be patient ID or attendant ID
  requestedByType: varchar("requested_by_type").notNull().default("patient"), // "patient" or "caregiver"
  status: urgentRefillStatusEnum("status").notNull().default("pending"),
  priority: varchar("priority").notNull().default("normal"), // "normal", "urgent"
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by"),
});

export const urgentRefillRequestsRelations = relations(urgentRefillRequests, ({ one }) => ({
  prescription: one(prescriptions, {
    fields: [urgentRefillRequests.prescriptionId],
    references: [prescriptions.id],
  }),
  patient: one(users, {
    fields: [urgentRefillRequests.patientId],
    references: [users.id],
  }),
}));

export const insertUrgentRefillRequestSchema = createInsertSchema(urgentRefillRequests).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  processedBy: true,
});

export type InsertUrgentRefillRequest = z.infer<typeof insertUrgentRefillRequestSchema>;
export type UrgentRefillRequest = typeof urgentRefillRequests.$inferSelect;

// Insurance Assistance Requests
export const assistanceStatusEnum = pgEnum("assistance_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const insuranceAssistanceRequests = pgTable("insurance_assistance_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: varchar("ticket_number").notNull().unique(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // Nullable for anonymous requests
  name: varchar("name").notNull(),
  email: varchar("email"), // Optional
  phone: varchar("phone"),
  message: text("message").notNull(),
  status: assistanceStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  source: varchar("source").default("website"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insuranceAssistanceRequestsRelations = relations(insuranceAssistanceRequests, ({ one }) => ({
  user: one(users, {
    fields: [insuranceAssistanceRequests.userId],
    references: [users.id],
  }),
}));

// Patient Chat - AI Chatbot for medication questions
export const patientChats = pgTable("patient_chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title"), // Generic, non-content-derived conversation label
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const patientChatMessages = pgTable("patient_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => patientChats.id, { onDelete: "cascade" }),
  role: varchar("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const patientChatsRelations = relations(patientChats, ({ one, many }) => ({
  user: one(users, {
    fields: [patientChats.userId],
    references: [users.id],
  }),
  messages: many(patientChatMessages),
}));

export const patientChatMessagesRelations = relations(patientChatMessages, ({ one }) => ({
  chat: one(patientChats, {
    fields: [patientChatMessages.chatId],
    references: [patientChats.id],
  }),
}));

// Flu Shot Appointments
export const fluShotAppointmentStatusEnum = pgEnum("flu_shot_appointment_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

export const fluShotAppointments = pgTable("flu_shot_appointments", {
  id: serial("id").primaryKey(),
  ticketNumber: varchar("ticket_number").notNull().unique(),
  userId: varchar("user_id"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"), // Optional
  phoneNumber: varchar("phone_number").notNull(),
  dateOfBirth: varchar("date_of_birth"),
  address: text("address"),
  insuranceProvider: varchar("insurance_provider"),
  insurancePolicyNumber: varchar("insurance_policy_number"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: varchar("scheduled_time").notNull(),
  fluShotType: varchar("flu_shot_type").notNull().default("Standard Flu Vaccine"),
  status: fluShotAppointmentStatusEnum("status").notNull().default("scheduled"),
  isExistingPatient: boolean("is_existing_patient").notNull().default(false),
  notes: text("notes"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = typeof prescriptions.$inferInsert;
export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = typeof cartItems.$inferInsert;
export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;

export type PrimeRxSyncLog = typeof primeRxSyncLogs.$inferSelect;
export type InsertPrimeRxSyncLog = typeof primeRxSyncLogs.$inferInsert;

export type PrimeRxDrug = typeof primeRxDrugs.$inferSelect;
export type InsertPrimeRxDrug = typeof primeRxDrugs.$inferInsert;
export const insertPrimeRxDrugSchema = createInsertSchema(primeRxDrugs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type InsuranceAssistanceRequest = typeof insuranceAssistanceRequests.$inferSelect;
export type InsertInsuranceAssistanceRequest = typeof insuranceAssistanceRequests.$inferInsert;
export const insertInsuranceAssistanceRequestSchema = createInsertSchema(insuranceAssistanceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

export type PatientChat = typeof patientChats.$inferSelect;
export type InsertPatientChat = typeof patientChats.$inferInsert;

export type PatientChatMessage = typeof patientChatMessages.$inferSelect;
export type InsertPatientChatMessage = typeof patientChatMessages.$inferInsert;

export type FluShotAppointment = typeof fluShotAppointments.$inferSelect;
export type InsertFluShotAppointment = typeof fluShotAppointments.$inferInsert;
export const insertFluShotAppointmentSchema = createInsertSchema(fluShotAppointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

// Scheduled Event type for patient dashboard notifications
export type ScheduledEventType = "flu_shot" | "order_pickup" | "blister_pack" | "prescription_ready";
export interface ScheduledEvent {
  id: string;
  type: ScheduledEventType;
  title: string;
  description: string;
  scheduledDate: Date;
  scheduledTime?: string;
  status: string;
  metadata?: Record<string, any>;
}

// Delivery chats for real-time communication between customer and courier
export const deliveryChats = pgTable("delivery_chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { enum: ["customer", "courier", "system"] }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryChatsRelations = relations(deliveryChats, ({ one }) => ({
  order: one(orders, {
    fields: [deliveryChats.orderId],
    references: [orders.id],
  }),
}));

export type DeliveryChat = typeof deliveryChats.$inferSelect;
export type InsertDeliveryChat = typeof deliveryChats.$inferInsert;

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

// Blog Posts for leadership announcements
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  slug: varchar("slug").unique(),
  content: text("content").notNull(),
  category: varchar("category").default("general").notNull(),
  authorName: varchar("author_name").notNull(),
  authorDesignation: varchar("author_designation").notNull(),
  imageUrl: varchar("image_url"),
  likes: integer("likes").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  pinnedToHero: boolean("pinned_to_hero").notNull().default(false),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;
export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  likes: true,
  publishedAt: true,
  expiresAt: true,
  isPublished: true,
});

// Pharmacy Alerts for urgent announcements (closures, changes, etc.)
export const pharmacyAlerts = pgTable("pharmacy_alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Pharmacy Alert"),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  priority: text("priority").notNull().default("medium"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export type PharmacyAlert = typeof pharmacyAlerts.$inferSelect;
export type InsertPharmacyAlert = typeof pharmacyAlerts.$inferInsert;
export const insertPharmacyAlertSchema = createInsertSchema(pharmacyAlerts).omit({
  id: true,
  createdAt: true,
  isActive: true,
});

// Document type enum for patient documents
export const documentTypeEnum = pgEnum("document_type", [
  "drivers_license",
  "state_id",
  "insurance_card",
  "insurance_card_back",
  "miscellaneous",
]);

// Patient Documents for storing IDs, insurance cards, etc.
export const patientDocuments = pgTable("patient_documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentType: documentTypeEnum("document_type").notNull(),
  documentName: varchar("document_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const patientDocumentsRelations = relations(patientDocuments, ({ one }) => ({
  user: one(users, {
    fields: [patientDocuments.userId],
    references: [users.id],
  }),
}));

export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = typeof patientDocuments.$inferInsert;
export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true,
  uploadedAt: true,
});

// Extended types for frontend use
export type CartItemWithProduct = CartItem & {
  product: Product;
};

// Hybrid cart item - can be either product or prescription
export type HybridCartItem = CartItem & {
  product?: Product | null;
  prescription?: Prescription | null;
};

export type OrderWithItems = Order & {
  customerName?: string | null;
  customerPhone?: string | null;
  orderItems: (OrderItem & {
    product?: Product | null;
    prescription?: Prescription | null;
  })[];
};

export type PrescriptionWithRefillRequest = Prescription & {
  refillRequested?: boolean;
};

// Vendors table for managing pharmacy vendor accounts
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  code: vendorEnum("code").notNull().unique(),
  accountNumber: varchar("account_number"),
  apiEndpoint: varchar("api_endpoint"),
  isActive: boolean("is_active").notNull().default(true),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;
export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Vendor prices for NDC-based price comparison
export const vendorPrices = pgTable("vendor_prices", {
  id: serial("id").primaryKey(),
  ndc: varchar("ndc", { length: 14 }).notNull(),
  vendorCode: vendorEnum("vendor_code").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  packageSize: varchar("package_size"),
  inStock: boolean("in_stock").notNull().default(true),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const vendorPricesRelations = relations(vendorPrices, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorPrices.vendorCode],
    references: [vendors.code],
  }),
}));

export type VendorPrice = typeof vendorPrices.$inferSelect;
export type InsertVendorPrice = typeof vendorPrices.$inferInsert;
export const insertVendorPriceSchema = createInsertSchema(vendorPrices).omit({
  id: true,
  lastUpdated: true,
});

// Re-order list items for tracking what needs to be ordered
export const reorderItems = pgTable("reorder_items", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  ndc: varchar("ndc", { length: 14 }),
  quantityNeeded: integer("quantity_needed").notNull(),
  preferredVendor: vendorEnum("preferred_vendor"),
  status: varchar("status").notNull().default("pending"),
  orderedAt: timestamp("ordered_at"),
  orderedFrom: vendorEnum("ordered_from"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reorderItemsRelations = relations(reorderItems, ({ one }) => ({
  product: one(products, {
    fields: [reorderItems.productId],
    references: [products.id],
  }),
}));

export type ReorderItem = typeof reorderItems.$inferSelect;
export type InsertReorderItem = typeof reorderItems.$inferInsert;
export const insertReorderItemSchema = createInsertSchema(reorderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  orderedAt: true,
});

// Blister Pack Types
export const blisterPackTypeEnum = pgEnum("blister_pack_type", [
  "weekly",           // 7-day blister pack
  "bi_weekly",        // 14-day blister pack
  "monthly",          // 30-day blister pack
  "multi_dose",       // Multiple medications per time slot
  "unit_dose",        // Single dose per slot
]);

// Blister Pack Status
export const blisterPackStatusEnum = pgEnum("blister_pack_status", [
  "pending",          // Just enrolled, pending setup
  "active",           // Currently receiving blister packs
  "on_hold",          // Temporarily paused
  "discontinued",     // No longer receiving blister packs
]);

// Medication frequency enum
export const medicationFrequencyEnum = pgEnum("medication_frequency", [
  "once_daily",
  "twice_daily",
  "three_times_daily",
  "four_times_daily",
  "every_other_day",
  "weekly",
  "as_needed",
  "other",
]);

// Blister Pack Patients table - comprehensive patient profiles
export const blisterPackPatients = pgTable("blister_pack_patients", {
  id: serial("id").primaryKey(),
  pharmacyEnrollmentId: uuid("pharmacy_enrollment_id").defaultRandom().notNull().unique(),
  
  // Basic Information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phoneNumber: varchar("phone_number").notNull(),
  alternatePhone: varchar("alternate_phone"),
  
  // Demographics
  dateOfBirth: varchar("date_of_birth"),
  age: integer("age"),
  gender: varchar("gender"),
  
  // Address Information
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  
  // Insurance Information
  insuranceProvider: varchar("insurance_provider"),
  insurancePolicyNumber: varchar("insurance_policy_number"),
  insuranceGroupNumber: varchar("insurance_group_number"),
  insurancePhone: varchar("insurance_phone"),
  
  // Medical Information
  primaryDoctor: varchar("primary_doctor"),
  doctorPhone: varchar("doctor_phone"),
  doctorFax: varchar("doctor_fax"),
  allergies: text("allergies"),
  medicalConditions: text("medical_conditions"),
  
  // Blister Pack Specific
  blisterPackType: blisterPackTypeEnum("blister_pack_type").default("weekly"),
  status: blisterPackStatusEnum("status").notNull().default("pending"),
  
  // Medications stored as JSON array
  // Each medication: { name, dosage, frequency, intakeTimes[], instructions, startDate, endDate, prescriberId }
  medications: jsonb("medications").$type<{
    name: string;
    dosage: string;
    frequency: string;
    intakeTimes: string[]; // e.g., ["morning", "noon", "evening", "bedtime"]
    instructions?: string;
    startDate?: string;
    endDate?: string;
    prescriberId?: string;
    isActive: boolean;
  }[]>().default([]),
  
  // Schedule Information
  deliveryDay: varchar("delivery_day"), // e.g., "Monday", "Tuesday"
  deliveryTime: varchar("delivery_time"), // e.g., "Morning", "Afternoon"
  deliveryPreference: varchar("delivery_preference"), // "pickup", "delivery", "mail"
  
  // Intake Schedule
  morningTime: varchar("morning_time"),
  noonTime: varchar("noon_time"),
  eveningTime: varchar("evening_time"),
  bedtimeTime: varchar("bedtime_time"),
  
  // Preferences
  preferences: text("preferences"),
  languagePreference: varchar("language_preference"),
  specialInstructions: text("special_instructions"),
  
  // Emergency Contact
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),
  
  // Admin Notes
  adminNotes: text("admin_notes"),
  
  // Enrollment Source
  enrollmentSource: varchar("enrollment_source"), // "website", "phone", "in_person", "referral"
  previousPharmacyName: varchar("previous_pharmacy_name"),
  previousPharmacyPhone: varchar("previous_pharmacy_phone"),
  isNewPatient: boolean("is_new_patient").default(false),
  
  // Linked User Account (if they have an account)
  linkedUserId: varchar("linked_user_id").references(() => users.id, { onDelete: "set null" }),
  
  // ConcordiaCare App sync
  concordiaCareBlisterPackId: varchar("concordia_care_blister_pack_id"),
  lastSyncedToApp: timestamp("last_synced_to_app"),
  lastAppSync: timestamp("last_app_sync"),
  
  // Timestamps
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  lastPackDate: timestamp("last_pack_date"),
  nextPackDate: timestamp("next_pack_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blisterPackPatientsRelations = relations(blisterPackPatients, ({ one }) => ({
  linkedUser: one(users, {
    fields: [blisterPackPatients.linkedUserId],
    references: [users.id],
  }),
}));

export type BlisterPackPatient = typeof blisterPackPatients.$inferSelect;
export type InsertBlisterPackPatient = typeof blisterPackPatients.$inferInsert;
export const insertBlisterPackPatientSchema = createInsertSchema(blisterPackPatients).omit({
  id: true,
  pharmacyEnrollmentId: true,
  createdAt: true,
  updatedAt: true,
  enrolledAt: true,
  lastSyncedToApp: true,
  lastAppSync: true,
});

// Blister Pack Medication History - track changes to medication list
export const blisterPackMedicationHistory = pgTable("blister_pack_medication_history", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => blisterPackPatients.id, { onDelete: "cascade" }),
  action: varchar("action").notNull(), // "added", "removed", "modified"
  medicationName: varchar("medication_name").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  changedBy: varchar("changed_by"), // Admin user ID
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blisterPackMedicationHistoryRelations = relations(blisterPackMedicationHistory, ({ one }) => ({
  patient: one(blisterPackPatients, {
    fields: [blisterPackMedicationHistory.patientId],
    references: [blisterPackPatients.id],
  }),
}));

export type BlisterPackMedicationHistory = typeof blisterPackMedicationHistory.$inferSelect;
export type InsertBlisterPackMedicationHistory = typeof blisterPackMedicationHistory.$inferInsert;

// Patient Communications - two-way messaging between admin and patients
export const communicationTypeEnum = pgEnum("communication_type", [
  "blister_ready",
  "blister_due_soon", 
  "new_prescription_required",
  "no_more_refills",
  "prescription_ready",
  "delivery_scheduled",
  "custom_message",
  "payment_reminder",
  "general_update",
  "request_blister",
  "request_new_meds",
  "request_blister_change",
  "general_inquiry",
  "welcome"
]);

export const communicationDirectionEnum = pgEnum("communication_direction", ["admin_to_patient", "patient_to_admin"]);

export const communicationStatusEnum = pgEnum("communication_status", ["unread", "read", "acknowledged", "resolved"]);

export const patientCommunications = pgTable("patient_communications", {
  id: serial("id").primaryKey(),
  
  // Patient reference (can be userId for regular patients or blisterPatientId for blister patients)
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  blisterPatientId: integer("blister_patient_id").references(() => blisterPackPatients.id, { onDelete: "cascade" }),
  
  // Communication details
  type: communicationTypeEnum("type").notNull(),
  direction: communicationDirectionEnum("direction").notNull(),
  status: communicationStatusEnum("status").notNull().default("unread"),
  
  // Message content
  subject: varchar("subject"),
  message: text("message").notNull(),
  
  // Admin tracking
  sentBy: varchar("sent_by"), // Admin user ID who sent the message
  acknowledgedBy: varchar("acknowledged_by"),
  resolvedBy: varchar("resolved_by"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
});

export const patientCommunicationsRelations = relations(patientCommunications, ({ one }) => ({
  user: one(users, {
    fields: [patientCommunications.userId],
    references: [users.id],
  }),
  blisterPatient: one(blisterPackPatients, {
    fields: [patientCommunications.blisterPatientId],
    references: [blisterPackPatients.id],
  }),
}));

export type PatientCommunication = typeof patientCommunications.$inferSelect;
export type InsertPatientCommunication = typeof patientCommunications.$inferInsert;
export const insertPatientCommunicationSchema = createInsertSchema(patientCommunications).omit({
  id: true,
  createdAt: true,
});

// Prescription Transfer Requests - track transfer requests from landing page
export const transferRequestStatusEnum = pgEnum("transfer_request_status", [
  "request_received",
  "processing", 
  "contacting_pharmacy",
  "transfer_in_progress",
  "transfer_successful",
  "transfer_failed",
  "cancelled"
]);

export const transferRequestModeEnum = pgEnum("transfer_request_mode", [
  "form_submission",
  "label_upload", 
  "click_to_call"
]);

export const prescriptionTransferRequests = pgTable("prescription_transfer_requests", {
  id: serial("id").primaryKey(),
  
  // Contact Information
  contactName: varchar("contact_name").notNull(),
  phoneNumber: varchar("phone_number").notNull(),
  email: varchar("email"),
  
  // Request Mode
  mode: transferRequestModeEnum("mode").notNull(),
  
  // Previous Pharmacy Information
  previousPharmacyName: varchar("previous_pharmacy_name"),
  previousPharmacyPhone: varchar("previous_pharmacy_phone"),
  previousPharmacyAddress: text("previous_pharmacy_address"),
  
  // Label Upload (if applicable)
  labelImageUrl: text("label_image_url"),
  
  // Linked User (if they created an account)
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Status Tracking
  status: transferRequestStatusEnum("status").notNull().default("request_received"),
  statusMessage: text("status_message"),
  
  // Source tracking
  source: varchar("source").default("website"), // "website" | "app"

  // Processing
  assignedTo: varchar("assigned_to"), // Admin handling the transfer
  notes: text("notes"), // Internal notes
  
  // Reward tracking
  rewardPointsGranted: boolean("reward_points_granted").default(false),
  
  // Wellness Welcome Pack fields
  expectedMedCount: integer("expected_med_count"),
  wellnessPackEligible: boolean("wellness_pack_eligible").default(false),
  pendingPoints: integer("pending_points").default(500),
  pendingPointsReleased: boolean("pending_points_released").default(false),
  vitaminsIncluded: boolean("vitamins_included").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const prescriptionTransferRequestsRelations = relations(prescriptionTransferRequests, ({ one }) => ({
  user: one(users, {
    fields: [prescriptionTransferRequests.userId],
    references: [users.id],
  }),
}));

export type PrescriptionTransferRequest = typeof prescriptionTransferRequests.$inferSelect;
export type InsertPrescriptionTransferRequest = typeof prescriptionTransferRequests.$inferInsert;
export const insertPrescriptionTransferRequestSchema = createInsertSchema(prescriptionTransferRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================================================
// HOME ATTENDANTS / CAREGIVERS
// ============================================================================
// Home attendants can manage patient accounts on their behalf.
// One attendant can manage MULTIPLE patients, but one patient can have only ONE attendant.

export const attendantStatusEnum = pgEnum("attendant_status", [
  "pending_verification",
  "active", 
  "suspended",
  "inactive"
]);

export const homeAttendants = pgTable("home_attendants", {
  id: serial("id").primaryKey(),
  
  // Attendant Identity - unique per phone number
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  phoneNumber: varchar("phone_number").notNull().unique(),
  email: varchar("email").unique(),
  
  // Authentication (same options as patients: username/password, phone OTP)
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"),
  
  // Status
  status: attendantStatusEnum("status").notNull().default("pending_verification"),
  
  // Agency/Company info (optional)
  agencyName: varchar("agency_name"),
  licenseNumber: varchar("license_number"),
  
  // Profile
  profileImageUrl: varchar("profile_image_url"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Junction table linking attendants to patients
// Enforces: one patient can have only one attendant (unique on patientId)
// But one attendant can manage multiple patients
export const patientAttendants = pgTable("patient_attendants", {
  id: serial("id").primaryKey(),
  
  // Links
  attendantId: integer("attendant_id").notNull().references(() => homeAttendants.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(), // Unique = one attendant per patient
  
  // Relationship details
  relationshipType: varchar("relationship_type"), // e.g., "home health aide", "family caregiver", "visiting nurse"
  
  // Consent tracking
  patientConsent: boolean("patient_consent").notNull().default(false),
  consentDate: timestamp("consent_date"),
  consentMethod: varchar("consent_method"), // "verbal", "written", "digital"
  
  // Access control
  canManagePrescriptions: boolean("can_manage_prescriptions").notNull().default(true),
  canViewMedicalInfo: boolean("can_view_medical_info").notNull().default(true),
  canRequestRefills: boolean("can_request_refills").notNull().default(true),
  canPlaceOrders: boolean("can_place_orders").notNull().default(true),
  canUpdateProfile: boolean("can_update_profile").notNull().default(false),
  
  // Audit
  addedBy: varchar("added_by"), // Who added this link (patient, admin)
  notes: text("notes"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

// Audit log for attendant actions - tracks when attendants act on behalf of patients
export const attendantAuditLog = pgTable("attendant_audit_log", {
  id: serial("id").primaryKey(),
  
  // Actor
  attendantId: integer("attendant_id").notNull().references(() => homeAttendants.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Action details
  action: varchar("action").notNull(), // e.g., "refill_request", "order_placed", "profile_viewed"
  resourceType: varchar("resource_type"), // e.g., "prescription", "order", "profile"
  resourceId: varchar("resource_id"),
  
  // Additional context
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  // Timestamp
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const homeAttendantsRelations = relations(homeAttendants, ({ many }) => ({
  managedPatients: many(patientAttendants),
  auditLogs: many(attendantAuditLog),
}));

export const patientAttendantsRelations = relations(patientAttendants, ({ one }) => ({
  attendant: one(homeAttendants, {
    fields: [patientAttendants.attendantId],
    references: [homeAttendants.id],
  }),
  patient: one(users, {
    fields: [patientAttendants.patientId],
    references: [users.id],
  }),
}));

export const attendantAuditLogRelations = relations(attendantAuditLog, ({ one }) => ({
  attendant: one(homeAttendants, {
    fields: [attendantAuditLog.attendantId],
    references: [homeAttendants.id],
  }),
  patient: one(users, {
    fields: [attendantAuditLog.patientId],
    references: [users.id],
  }),
}));

// Types
export type HomeAttendant = typeof homeAttendants.$inferSelect;
export type InsertHomeAttendant = typeof homeAttendants.$inferInsert;
export const insertHomeAttendantSchema = createInsertSchema(homeAttendants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export type PatientAttendant = typeof patientAttendants.$inferSelect;
export type InsertPatientAttendant = typeof patientAttendants.$inferInsert;
export const insertPatientAttendantSchema = createInsertSchema(patientAttendants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AttendantAuditLog = typeof attendantAuditLog.$inferSelect;
export type InsertAttendantAuditLog = typeof attendantAuditLog.$inferInsert;
export const insertAttendantAuditLogSchema = createInsertSchema(attendantAuditLog).omit({
  id: true,
  createdAt: true,
});

// ==========================================
// POINTS, STREAKS & REWARDS ENGINE
// ==========================================

// Enums for the rewards system
export const pointsActionTypeEnum = pgEnum("points_action_type", [
  // Prescription & Adherence
  "on_time_refill",           // +50 points (refilled ≤2 days before due)
  "perfect_adherence_month",  // +300 points (all refills on time in month)
  // Streak bonuses
  "streak_3_refills",         // +100 points
  "streak_5_refills",         // +250 points
  "streak_10_refills",        // +750 points
  // Digital & Engagement
  "weekly_app_engagement",    // +20 points
  "enable_delivery",          // +25 points (one-time)
  "profile_completion",       // +50 points (one-time)
  // Purchase & Services
  "otc_purchase",             // 1 point per $1 spent
  "delivery_completed",       // +10 points
  "vaccine_completed",        // +150 points
  // Growth
  "prescription_transfer",    // +200 points
  "referral_completed",       // +500 points
  // Redemptions (negative)
  "redeem_otc",               // Spend points on OTC items
  "redeem_delivery_fee",      // Spend points on delivery fee
  "redeem_copay",             // Spend points on copay (max 20%)
  // Admin actions
  "admin_adjustment",         // Manual adjustment by admin
  "expiration",               // Points expired (12 months)
  "signup_bonus",             // New user signup bonus
  "campaign_bonus",           // Bonus from active campaign
  // Membership milestones
  "membership_milestone",     // 4th-month loyalty reward
  // Reversals
  "order_void",               // Points reversed for cancelled/refunded order
]);

export const streakTypeEnum = pgEnum("streak_type", [
  "refill_adherence",         // Consecutive on-time refills
  "weekly_engagement",        // Consecutive weeks with app engagement
  "monthly_adherence",        // Perfect adherence months in a row
]);

export const rewardTypeEnum = pgEnum("reward_type", [
  "otc_discount",             // Percentage or fixed discount on OTC
  "delivery_waiver",          // Free delivery
  "copay_assistance",         // Copay reduction (max 20%)
  "points_multiplier",        // Double/triple points
  "free_item",                // Specific free item
]);

export const rewardStatusEnum = pgEnum("reward_status", [
  "active",
  "inactive",
  "expired",
]);

export const referralStatusEnum = pgEnum("referral_status", [
  "pending",                  // Referral sent, waiting for signup
  "registered",               // Referee signed up
  "qualified",                // Referee filled first prescription
  "rewarded",                 // Points awarded to referrer
  "expired",                  // Referral expired without completion
]);

// Points Wallet - Each user has one wallet with current balance
export const pointsWallets = pgTable("points_wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Current balance
  currentBalance: integer("current_balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  lifetimeRedeemed: integer("lifetime_redeemed").notNull().default(0),
  lifetimeExpired: integer("lifetime_expired").notNull().default(0),
  
  // Daily/Weekly points caps tracking
  dailyPointsEarned: integer("daily_points_earned").notNull().default(0),
  dailyPointsResetAt: timestamp("daily_points_reset_at").defaultNow().notNull(),
  weeklyPointsEarned: integer("weekly_points_earned").notNull().default(0),
  weeklyPointsResetAt: timestamp("weekly_points_reset_at").defaultNow().notNull(),
  
  // Last activity tracking
  lastEarnedAt: timestamp("last_earned_at"),
  lastRedeemedAt: timestamp("last_redeemed_at"),
  
  // Monthly copay assistance tracking (max $25/month)
  currentMonthCopayAssistance: decimal("current_month_copay_assistance", { precision: 10, scale: 2 }).notNull().default("0"),
  copayAssistanceResetAt: timestamp("copay_assistance_reset_at").defaultNow().notNull(),
  
  // Gaming detection flags
  isFlagged: boolean("is_flagged").notNull().default(false),
  flaggedReason: text("flagged_reason"),
  flaggedAt: timestamp("flagged_at"),
  anomalyScore: integer("anomaly_score").notNull().default(0), // Higher = more suspicious
  
  // Flags
  isFrozen: boolean("is_frozen").notNull().default(false),
  frozenReason: text("frozen_reason"),
  frozenAt: timestamp("frozen_at"),
  frozenBy: varchar("frozen_by"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Points Ledger - Immutable audit trail of all point transactions
export const pointsLedger = pgTable("points_ledger", {
  id: serial("id").primaryKey(),
  
  // User reference
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Transaction details
  actionType: pointsActionTypeEnum("action_type").notNull(),
  points: integer("points").notNull(), // Positive for earn, negative for spend/expire
  balanceAfter: integer("balance_after").notNull(), // Balance after this transaction
  
  // Reference to source (for traceability)
  referenceType: varchar("reference_type"), // 'prescription', 'order', 'referral', 'reward', etc.
  referenceId: varchar("reference_id"), // ID of the referenced entity
  
  // Details
  description: text("description").notNull(),
  metadata: jsonb("metadata"), // Additional context (e.g., order total for OTC, prescription ID for refill)
  
  // Expiration tracking
  expiresAt: timestamp("expires_at"), // Points expire 12 months from earning
  isExpired: boolean("is_expired").notNull().default(false),
  
  // Campaign tracking
  campaignId: integer("campaign_id"),
  
  // Admin action tracking
  adminId: varchar("admin_id"),
  adminReason: text("admin_reason"),
  
  // Fraud prevention
  eventIdempotencyKey: varchar("event_idempotency_key").unique(), // Prevent duplicate event processing
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Streaks - Track various streak types per user
export const streaks = pgTable("streaks", {
  id: serial("id").primaryKey(),
  
  // User reference
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Streak type
  streakType: streakTypeEnum("streak_type").notNull(),
  
  // Current streak
  currentCount: integer("current_count").notNull().default(0),
  bestCount: integer("best_count").notNull().default(0),
  
  // Tracking
  lastQualifyingActionAt: timestamp("last_qualifying_action_at"),
  lastQualifyingReferenceId: varchar("last_qualifying_reference_id"), // e.g., prescription ID
  
  // Grace period tracking (1-2 day buffer for missed refills)
  gracePeriodDays: integer("grace_period_days").notNull().default(2),
  gracePeriodUsedAt: timestamp("grace_period_used_at"),
  gracePeriodUsedCount: integer("grace_period_used_count").notNull().default(0),
  
  // Partial fill handling
  hasPartialFill: boolean("has_partial_fill").notNull().default(false),
  partialFillExtensionDays: integer("partial_fill_extension_days").default(0),
  
  // Insurance delay handling
  insuranceDelayActive: boolean("insurance_delay_active").notNull().default(false),
  insuranceDelayUntil: timestamp("insurance_delay_until"),
  
  // Admin override tracking
  wasManuallyRestored: boolean("was_manually_restored").notNull().default(false),
  restoredBy: varchar("restored_by"),
  restoredAt: timestamp("restored_at"),
  restoredReason: text("restored_reason"),
  
  // Milestone tracking (to prevent double-awarding)
  lastMilestoneAwarded: integer("last_milestone_awarded").default(0), // 3, 5, or 10
  
  // Timestamps
  startedAt: timestamp("started_at"),
  brokenAt: timestamp("broken_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Points System Settings - Global configuration for caps and limits
export const pointsSettings = pgTable("points_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key").notNull().unique(),
  settingValue: varchar("setting_value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"),
});

// Rewards/Coupons - Admin-created rewards that can be redeemed
export const rewards = pgTable("rewards", {
  id: serial("id").primaryKey(),
  
  // Basic info
  name: varchar("name").notNull(),
  description: text("description"),
  imageUrl: varchar("image_url"),
  
  // Redemption requirements
  pointsCost: integer("points_cost").notNull(),
  rewardType: rewardTypeEnum("reward_type").notNull(),
  
  // Value (depends on type)
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }), // For discounts
  discountType: varchar("discount_type"), // 'percentage' or 'fixed'
  maxDiscountAmount: decimal("max_discount_amount", { precision: 10, scale: 2 }), // Cap for percentage discounts
  
  // For free item rewards
  freeItemProductId: varchar("free_item_product_id").references(() => products.id),
  
  // Limits
  maxRedemptionsTotal: integer("max_redemptions_total"), // null = unlimited
  maxRedemptionsPerUser: integer("max_redemptions_per_user").default(1),
  currentRedemptions: integer("current_redemptions").notNull().default(0),
  
  // Validity
  status: rewardStatusEnum("status").notNull().default("active"),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  
  // Eligibility
  minPointsBalance: integer("min_points_balance"), // Must have at least this many points to see reward
  requiredStreakType: streakTypeEnum("required_streak_type"),
  requiredStreakCount: integer("required_streak_count"),
  
  // Flags
  isReusable: boolean("is_reusable").notNull().default(false),
  isHighlighted: boolean("is_highlighted").notNull().default(false), // Featured reward
  
  // Admin tracking
  createdBy: varchar("created_by"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Reward Redemptions - Track which rewards users have redeemed
export const rewardRedemptions = pgTable("reward_redemptions", {
  id: serial("id").primaryKey(),
  
  // References
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardId: integer("reward_id").notNull().references(() => rewards.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id), // If applied to an order
  
  // Points spent
  pointsSpent: integer("points_spent").notNull(),
  
  // Value received
  discountApplied: decimal("discount_applied", { precision: 10, scale: 2 }),
  
  // Status
  status: varchar("status").notNull().default("completed"), // 'completed', 'refunded'
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Earning Rules - Configurable rules that admins can enable/disable
export const earningRules = pgTable("earning_rules", {
  id: serial("id").primaryKey(),
  
  // Rule identification
  ruleKey: varchar("rule_key").notNull().unique(), // e.g., 'on_time_refill', 'otc_purchase'
  actionType: pointsActionTypeEnum("action_type").notNull(),
  
  // Display info
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Points configuration
  basePoints: integer("base_points").notNull(),
  pointsPerDollar: decimal("points_per_dollar", { precision: 10, scale: 2 }), // For purchase-based rules
  
  // Limits
  maxPointsPerEvent: integer("max_points_per_event"),
  maxEventsPerDay: integer("max_events_per_day"),
  maxEventsPerMonth: integer("max_events_per_month"),
  
  // One-time rules
  isOneTime: boolean("is_one_time").notNull().default(false),
  
  // Eligibility
  excludeControlledMedications: boolean("exclude_controlled_medications").notNull().default(false),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  
  // Admin tracking
  lastModifiedBy: varchar("last_modified_by"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Campaigns - Time-limited promotions
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  
  // Basic info
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Configuration
  pointsMultiplier: decimal("points_multiplier", { precision: 3, scale: 2 }).notNull().default("1.00"), // 2.0 = double points
  bonusPoints: integer("bonus_points").default(0), // Flat bonus added
  
  // Applies to specific actions only
  applicableActions: jsonb("applicable_actions"), // Array of action types, null = all
  
  // Validity
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  
  // Limits
  maxUsesTotal: integer("max_uses_total"), // null = unlimited
  maxUsesPerUser: integer("max_uses_per_user"),
  currentUses: integer("current_uses").notNull().default(0),
  
  // Admin tracking
  createdBy: varchar("created_by"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Referrals - Track referral program
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  
  // Referrer (existing user)
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Referee info (may not be a user yet)
  refereeEmail: varchar("referee_email"),
  refereePhone: varchar("referee_phone"),
  refereeUserId: varchar("referee_user_id").references(() => users.id),
  
  // Referral code
  referralCode: varchar("referral_code").notNull().unique(),
  
  // Status tracking
  status: referralStatusEnum("status").notNull().default("pending"),
  
  // Points tracking
  referrerPointsAwarded: integer("referrer_points_awarded").default(0),
  refereePointsAwarded: integer("referee_points_awarded").default(0),
  
  // Timestamps for lifecycle
  inviteSentAt: timestamp("invite_sent_at").defaultNow().notNull(),
  registeredAt: timestamp("registered_at"),
  qualifiedAt: timestamp("qualified_at"), // When first prescription was filled
  rewardedAt: timestamp("rewarded_at"),
  expiresAt: timestamp("expires_at"), // Referral expires after X days
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One-Time Reward Tracking - Prevents duplicate one-time rewards
export const oneTimeRewards = pgTable("one_time_rewards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardType: varchar("reward_type").notNull(), // e.g., 'profile_completion', 'enable_delivery'
  pointsAwarded: integer("points_awarded").notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
});

// ==========================================
// RELATIONS FOR REWARDS SYSTEM
// ==========================================

export const pointsWalletsRelations = relations(pointsWallets, ({ one, many }) => ({
  user: one(users, {
    fields: [pointsWallets.userId],
    references: [users.id],
  }),
}));

export const pointsLedgerRelations = relations(pointsLedger, ({ one }) => ({
  user: one(users, {
    fields: [pointsLedger.userId],
    references: [users.id],
  }),
  campaign: one(campaigns, {
    fields: [pointsLedger.campaignId],
    references: [campaigns.id],
  }),
}));

export const streaksRelations = relations(streaks, ({ one }) => ({
  user: one(users, {
    fields: [streaks.userId],
    references: [users.id],
  }),
}));

export const rewardsRelations = relations(rewards, ({ one, many }) => ({
  freeItemProduct: one(products, {
    fields: [rewards.freeItemProductId],
    references: [products.id],
  }),
  redemptions: many(rewardRedemptions),
}));

export const rewardRedemptionsRelations = relations(rewardRedemptions, ({ one }) => ({
  user: one(users, {
    fields: [rewardRedemptions.userId],
    references: [users.id],
  }),
  reward: one(rewards, {
    fields: [rewardRedemptions.rewardId],
    references: [rewards.id],
  }),
  order: one(orders, {
    fields: [rewardRedemptions.orderId],
    references: [orders.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
  }),
  referee: one(users, {
    fields: [referrals.refereeUserId],
    references: [users.id],
  }),
}));

// ==========================================
// TYPES FOR REWARDS SYSTEM
// ==========================================

export type PointsWallet = typeof pointsWallets.$inferSelect;
export type InsertPointsWallet = typeof pointsWallets.$inferInsert;
export const insertPointsWalletSchema = createInsertSchema(pointsWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type InsertPointsLedgerEntry = typeof pointsLedger.$inferInsert;
export const insertPointsLedgerSchema = createInsertSchema(pointsLedger).omit({
  id: true,
  createdAt: true,
});

export type Streak = typeof streaks.$inferSelect;
export type InsertStreak = typeof streaks.$inferInsert;
export const insertStreakSchema = createInsertSchema(streaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Reward = typeof rewards.$inferSelect;
export type InsertReward = typeof rewards.$inferInsert;
export const insertRewardSchema = createInsertSchema(rewards).omit({
  id: true,
  currentRedemptions: true,
  createdAt: true,
  updatedAt: true,
});

export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type InsertRewardRedemption = typeof rewardRedemptions.$inferInsert;
export const insertRewardRedemptionSchema = createInsertSchema(rewardRedemptions).omit({
  id: true,
  createdAt: true,
});

export type EarningRule = typeof earningRules.$inferSelect;
export type InsertEarningRule = typeof earningRules.$inferInsert;
export const insertEarningRuleSchema = createInsertSchema(earningRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;
export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  currentUses: true,
  createdAt: true,
  updatedAt: true,
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;
export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type OneTimeReward = typeof oneTimeRewards.$inferSelect;
export type InsertOneTimeReward = typeof oneTimeRewards.$inferInsert;

export type PointsSetting = typeof pointsSettings.$inferSelect;
export type InsertPointsSetting = typeof pointsSettings.$inferInsert;

// ==========================================
// CONSTANTS FOR REWARDS ENGINE
// ==========================================

export const POINTS_CONVERSION_RATE = 1000; // 1000 points = $1
export const POINTS_EXPIRY_MONTHS = 12;
export const MAX_COPAY_ASSISTANCE_PERCENT = 20; // 20% max copay reduction
export const MAX_COPAY_ASSISTANCE_PER_MONTH = 25; // $25/month max
export const MAX_REFERRALS_REWARDED_PER_MONTH = 1;

// Daily/Weekly points caps (anti-gaming)
export const DEFAULT_DAILY_POINTS_CAP = 500;
export const DEFAULT_WEEKLY_POINTS_CAP = 2000;
export const GRACE_PERIOD_DAYS = 2; // Buffer for missed refills

// Earning points values
export const EARNING_POINTS = {
  ON_TIME_REFILL: 50,
  PERFECT_ADHERENCE_MONTH: 300,
  STREAK_3_REFILLS: 100,
  STREAK_5_REFILLS: 250,
  STREAK_10_REFILLS: 750,
  WEEKLY_ENGAGEMENT: 20,
  ENABLE_DELIVERY: 25,
  PROFILE_COMPLETION: 50,
  OTC_POINTS_PER_DOLLAR: 1,
  DELIVERY_COMPLETED: 10,
  VACCINE_COMPLETED: 150,
  PRESCRIPTION_TRANSFER: 200,
  REFERRAL_COMPLETED: 500,
} as const;

// Streak milestones
export const STREAK_MILESTONES = [3, 5, 10] as const;

// Gaming detection thresholds
export const GAMING_THRESHOLDS = {
  MAX_LOGINS_PER_DAY: 10,
  MAX_REFILL_REQUESTS_PER_HOUR: 5,
  RAPID_ACTION_WINDOW_MS: 60000, // 1 minute between same actions
  STREAK_RESET_COOLDOWN_HOURS: 24,
  ANOMALY_SCORE_THRESHOLD: 50, // Flag user for review
  ANOMALY_SCORE_FREEZE: 100, // Auto-freeze account
} as const;

// ==========================================
// OTC LOYALTY CARD - Patient's digital card for in-store and online use
// ==========================================

export const otcCards = pgTable("otc_cards", {
  id: serial("id").primaryKey(),
  
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  cardNumber: varchar("card_number").notNull(),
  cardholderName: varchar("cardholder_name").notNull(),
  
  barcodeData: varchar("barcode_data"),
  
  isActive: boolean("is_active").notNull().default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OtcCard = typeof otcCards.$inferSelect;
export type InsertOtcCard = typeof otcCards.$inferInsert;
export const insertOtcCardSchema = createInsertSchema(otcCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ==========================================
// T001: PHARMFLOW REQUEST QUEUE & ROLES
// ==========================================

export const patientRequestTypeEnum = pgEnum("patient_request_type", [
  "pickup",
  "delivery",
  "refill",
  "medication_question",
  "general",
]);

export const patientRequestStatusEnum = pgEnum("patient_request_status", [
  "new_from_app",
  "assigned_cashier",
  "sent_to_billing",
  "sent_to_filling",
  "pharmacist_review",
  "completed",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "cashier",
  "billing",
  "filling",
  "pharmacist",
]);

export const patientRequests = pgTable("patient_requests", {
  id: serial("id").primaryKey(),
  patientId: varchar("patient_id").references(() => users.id, { onDelete: "cascade" }),
  blisterPatientId: integer("blister_patient_id").references(() => blisterPackPatients.id, { onDelete: "cascade" }),
  type: patientRequestTypeEnum("type").notNull(),
  status: patientRequestStatusEnum("status").notNull().default("new_from_app"),
  assignedStaffId: integer("assigned_staff_id").references(() => staffEmails.id, { onDelete: "set null" }),
  message: text("message"),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const patientRequestsRelations = relations(patientRequests, ({ one, many }) => ({
  patient: one(users, {
    fields: [patientRequests.patientId],
    references: [users.id],
  }),
  blisterPatient: one(blisterPackPatients, {
    fields: [patientRequests.blisterPatientId],
    references: [blisterPackPatients.id],
  }),
  assignedStaff: one(staffEmails, {
    fields: [patientRequests.assignedStaffId],
    references: [staffEmails.id],
  }),
  statusHistory: many(requestStatusHistory),
}));

export type PatientRequest = typeof patientRequests.$inferSelect;
export type InsertPatientRequest = typeof patientRequests.$inferInsert;
export const insertPatientRequestSchema = createInsertSchema(patientRequests).omit({
  id: true,
  status: true,
  assignedStaffId: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
});

export const requestStatusHistory = pgTable("request_status_history", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => patientRequests.id, { onDelete: "cascade" }),
  fromStatus: patientRequestStatusEnum("from_status"),
  toStatus: patientRequestStatusEnum("to_status").notNull(),
  changedBy: integer("changed_by").references(() => staffEmails.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const requestStatusHistoryRelations = relations(requestStatusHistory, ({ one }) => ({
  request: one(patientRequests, {
    fields: [requestStatusHistory.requestId],
    references: [patientRequests.id],
  }),
  staff: one(staffEmails, {
    fields: [requestStatusHistory.changedBy],
    references: [staffEmails.id],
  }),
}));

export type RequestStatusHistory = typeof requestStatusHistory.$inferSelect;
export type InsertRequestStatusHistory = typeof requestStatusHistory.$inferInsert;
export const insertRequestStatusHistorySchema = createInsertSchema(requestStatusHistory).omit({
  id: true,
  createdAt: true,
});

export const staffRolePermissions = pgTable("staff_role_permissions", {
  id: serial("id").primaryKey(),
  role: staffRoleEnum("role").notNull(),
  action: varchar("action").notNull(),
  isAllowed: boolean("is_allowed").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffRolePermission = typeof staffRolePermissions.$inferSelect;
export type InsertStaffRolePermission = typeof staffRolePermissions.$inferInsert;

// ==========================================
// T002: BLISTER DOSE TRACKING & REMINDERS
// ==========================================

export const doseActionEnum = pgEnum("dose_action", [
  "taken",
  "skipped",
  "snoozed",
  "missed",
]);

export const blisterDoseLogs = pgTable("blister_dose_logs", {
  id: serial("id").primaryKey(),
  blisterPatientId: integer("blister_patient_id").notNull().references(() => blisterPackPatients.id, { onDelete: "cascade" }),
  medicationName: varchar("medication_name").notNull(),
  scheduledTime: varchar("scheduled_time").notNull(),
  scheduledDate: varchar("scheduled_date").notNull(),
  action: doseActionEnum("action").notNull(),
  actionTime: timestamp("action_time").defaultNow().notNull(),
  notes: text("notes"),
});

export const blisterDoseLogsRelations = relations(blisterDoseLogs, ({ one }) => ({
  blisterPatient: one(blisterPackPatients, {
    fields: [blisterDoseLogs.blisterPatientId],
    references: [blisterPackPatients.id],
  }),
}));

export type BlisterDoseLog = typeof blisterDoseLogs.$inferSelect;
export type InsertBlisterDoseLog = typeof blisterDoseLogs.$inferInsert;
export const insertBlisterDoseLogSchema = createInsertSchema(blisterDoseLogs).omit({
  id: true,
  actionTime: true,
});

export const blisterReminders = pgTable("blister_reminders", {
  id: serial("id").primaryKey(),
  blisterPatientId: integer("blister_patient_id").notNull().references(() => blisterPackPatients.id, { onDelete: "cascade" }),
  medicationName: varchar("medication_name").notNull(),
  reminderTime: varchar("reminder_time").notNull(),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blisterRemindersRelations = relations(blisterReminders, ({ one }) => ({
  blisterPatient: one(blisterPackPatients, {
    fields: [blisterReminders.blisterPatientId],
    references: [blisterPackPatients.id],
  }),
}));

export type BlisterReminder = typeof blisterReminders.$inferSelect;
export type InsertBlisterReminder = typeof blisterReminders.$inferInsert;
export const insertBlisterReminderSchema = createInsertSchema(blisterReminders).omit({
  id: true,
  isActive: true,
  createdAt: true,
});

// ==========================================
// PATIENT DOCTORS (Doctor Master List)
// ==========================================

export const patientDoctors = pgTable("patient_doctors", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  specialty: varchar("specialty"),
  phone: varchar("phone"),
  fax: varchar("fax"),
  email: varchar("email"),
  npi: varchar("npi"),
  address: text("address"),
  notes: text("notes"),
  primeRxId: varchar("prime_rx_id"),
  deaNumber: varchar("dea_number"),
  licenseNumber: varchar("license_number"),
  medicaidProvNo: varchar("medicaid_prov_no"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const patientDoctorsRelations = relations(patientDoctors, ({ one }) => ({
  patient: one(users, {
    fields: [patientDoctors.userId],
    references: [users.id],
  }),
}));

export type PatientDoctor = typeof patientDoctors.$inferSelect;
export type InsertPatientDoctor = typeof patientDoctors.$inferInsert;
export const insertPatientDoctorSchema = createInsertSchema(patientDoctors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ==========================================
// T012: CHANGE LOG / SYNC AUDIT TRAIL
// ==========================================

export const changeLog = pgTable("change_log", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  changedBy: varchar("changed_by"),
  field: varchar("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export type ChangeLog = typeof changeLog.$inferSelect;
export type InsertChangeLog = typeof changeLog.$inferInsert;
export const insertChangeLogSchema = createInsertSchema(changeLog).omit({
  id: true,
  changedAt: true,
});

// ==========================================
// CONVERSION LEADS (Wellness Funnel)
// ==========================================

export const conversionLeads = pgTable("conversion_leads", {
  id: serial("id").primaryKey(),
  contactName: varchar("contact_name").notNull(),
  dateOfBirth: varchar("date_of_birth"),
  phone: varchar("phone").notNull(),
  email: varchar("email"),
  leadType: leadTypeEnum("lead_type").notNull(),
  previousPharmacyName: varchar("previous_pharmacy_name"),
  doctorInfo: text("doctor_info"),
  medicationCount: integer("medication_count").default(0),
  qualifiesForWellnessPack: boolean("qualifies_for_wellness_pack").default(false),
  status: leadStatusEnum("status").notNull().default("pending_request"),
  pendingPoints: integer("pending_points").notNull().default(500),
  pointsGranted: boolean("points_granted").notNull().default(false),
  userId: varchar("user_id"),
  // Public concierge requests use this durable key so a repeated final click
  // returns the same pending request rather than creating another lead.
  idempotencyKey: varchar("idempotency_key").unique(),
  sourceAction: varchar("source_action").notNull(),
  authorizationConsent: boolean("authorization_consent").notNull().default(false),
  adminNotes: text("admin_notes"),
  approvedBy: varchar("approved_by"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ConversionLead = typeof conversionLeads.$inferSelect;
export type InsertConversionLead = typeof conversionLeads.$inferInsert;
export const insertConversionLeadSchema = createInsertSchema(conversionLeads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  pointsGranted: true,
  approvedBy: true,
  rejectionReason: true,
  adminNotes: true,
});

// ==========================================
// SPECIALTY MEDICATIONS
// ==========================================

export const specialtyAvailabilityEnum = pgEnum("specialty_availability", ["available", "specialty_request"]);
export const specialtyCategoryEnum = pgEnum("specialty_category", [
  "oncology_colorectal",
  "psychology",
  "rheumatology",
  "dermatology",
  "hepatitis",
  "multiple_sclerosis",
  "general_oncology",
]);

export const specialtyMedications = pgTable("specialty_medications", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  genericName: varchar("generic_name"),
  brandName: varchar("brand_name"),
  category: specialtyCategoryEnum("category").notNull(),
  subcategory: varchar("subcategory"),
  availabilityStatus: specialtyAvailabilityEnum("availability_status").notNull().default("available"),
  manufacturer: varchar("manufacturer"),
  isComboProtocol: boolean("is_combo_protocol").notNull().default(false),
  comboComponents: text("combo_components"),
  description: text("description"),
  mechanismOfAction: text("mechanism_of_action"),
  commonSideEffects: text("common_side_effects").array(),
  typicalDosing: text("typical_dosing"),
  administrationRoute: varchar("administration_route"),
  storageRequirements: varchar("storage_requirements"),
  fdaApprovalYear: integer("fda_approval_year"),
  blackBoxWarning: boolean("black_box_warning").default(false),
  blackBoxWarningText: text("black_box_warning_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SpecialtyMedication = typeof specialtyMedications.$inferSelect;
export type InsertSpecialtyMedication = typeof specialtyMedications.$inferInsert;
export const insertSpecialtyMedicationSchema = createInsertSchema(specialtyMedications).omit({
  id: true,
  createdAt: true,
});

// ==========================================
// SPECIALTY FULFILLMENT REQUESTS
// ==========================================

export const fulfillmentRequestTypeEnum = pgEnum("fulfillment_request_type", [
  "new_prescription",
  "transfer",
  "e_script",
]);

export const fulfillmentRequestStatusEnum = pgEnum("fulfillment_request_status", [
  "pending",
  "in_review",
  "contacted",
  "completed",
  "cancelled",
]);

export const specialtyFulfillmentRequests = pgTable(
  "specialty_fulfillment_requests",
  {
    id: serial("id").primaryKey(),
    medicationId: integer("medication_id"),
    medicationName: varchar("medication_name").notNull(),
    patientName: varchar("patient_name").notNull(),
    phone: varchar("phone").notNull(),
    email: varchar("email"),
    prescriberName: varchar("prescriber_name").notNull(),
    requestType: fulfillmentRequestTypeEnum("request_type").notNull(),
    labelImageUrl: text("label_image_url"),
    notes: text("notes"),
    status: fulfillmentRequestStatusEnum("status").notNull().default("pending"),
    adminNotes: text("admin_notes"),
    userId: varchar("user_id"),
    source: varchar("source", { length: 32 }).notNull().default("website"),
    externalRequestId: varchar("external_request_id", { length: 128 }),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }),
    assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
    assignedToName: varchar("assigned_to_name", { length: 255 }),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("specialty_requests_source_idx").on(table.source),
    uniqueIndex("specialty_requests_source_external_id_uidx").on(table.source, table.externalRequestId),
    check("specialty_requests_source_check", sql`${table.source} IN ('website', 'mobile_app', 'staff_app')`),
    check(
      "specialty_requests_external_identity_check",
      sql`(${table.source} = 'website' AND ${table.externalRequestId} IS NULL AND ${table.requestFingerprint} IS NULL)
        OR (${table.source} IN ('mobile_app', 'staff_app') AND ${table.externalRequestId} IS NOT NULL AND ${table.requestFingerprint} IS NOT NULL)`,
    ),
  ],
);

export type SpecialtyFulfillmentRequest = typeof specialtyFulfillmentRequests.$inferSelect;
export type InsertSpecialtyFulfillmentRequest = typeof specialtyFulfillmentRequests.$inferInsert;
export const insertSpecialtyFulfillmentRequestSchema = createInsertSchema(specialtyFulfillmentRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  source: true,
  externalRequestId: true,
  requestFingerprint: true,
  assignedToUserId: true,
  assignedToName: true,
  claimedAt: true,
  createdAt: true,
  updatedAt: true,
});

// ==========================================
// LTC FACILITY LEADS
// ==========================================
export const ltcFacilityTypeEnum = pgEnum("ltc_facility_type", ["nursing_home", "assisted_living", "memory_care", "rehabilitation", "hospice", "other"]);
export const ltcLeadStatusEnum = pgEnum("ltc_lead_status", ["new", "contacted", "in_discussion", "onboarded", "declined"]);

export const ltcFacilityLeads = pgTable("ltc_facility_leads", {
  id: serial("id").primaryKey(),
  facilityName: varchar("facility_name").notNull(),
  facilityType: ltcFacilityTypeEnum("facility_type").notNull(),
  numberOfBeds: integer("number_of_beds"),
  contactName: varchar("contact_name").notNull(),
  contactTitle: varchar("contact_title"),
  phone: varchar("phone").notNull(),
  email: varchar("email"),
  address: text("address"),
  notes: text("notes"),
  status: ltcLeadStatusEnum("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LtcFacilityLead = typeof ltcFacilityLeads.$inferSelect;
export type InsertLtcFacilityLead = typeof ltcFacilityLeads.$inferInsert;
export const insertLtcFacilityLeadSchema = createInsertSchema(ltcFacilityLeads).omit({
  id: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  updatedAt: true,
});

export const savingsRequestStatusEnum = pgEnum("savings_request_status", ["new", "contacted", "resolved"]);

export const savingsRequests = pgTable("savings_requests", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  phone: varchar("phone").notNull(),
  email: varchar("email"),
  medication: varchar("medication"),
  notes: text("notes"),
  status: savingsRequestStatusEnum("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SavingsRequest = typeof savingsRequests.$inferSelect;
export type InsertSavingsRequest = typeof savingsRequests.$inferInsert;
export const insertSavingsRequestSchema = createInsertSchema(savingsRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  updatedAt: true,
});

export const pageViews = pgTable("page_views", {
  id: serial("id").primaryKey(),
  path: varchar("path").notNull(),
  referrer: varchar("referrer"),
  userAgent: varchar("user_agent"),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
});

export type PageView = typeof pageViews.$inferSelect;
export type InsertPageView = typeof pageViews.$inferInsert;

export const contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  message: text("message").notNull(),
  status: varchar("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissions.$inferInsert;
export const insertContactSubmissionSchema = createInsertSchema(contactSubmissions).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const doctorPartners = pgTable("doctor_partners", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  title: varchar("title").notNull().default("MD"),
  specialty: varchar("specialty").notNull(),
  languages: text("languages").array().notNull().default(sql`ARRAY['English']::text[]`),
  gender: varchar("gender").notNull().default("any"),
  address: varchar("address"),
  phone: varchar("phone"),
  fax: varchar("fax"),
  email: varchar("email"),
  bio: text("bio"),
  photoUrl: varchar("photo_url"),
  acceptingNewPatients: boolean("accepting_new_patients").notNull().default(true),
  borough: varchar("borough").notNull().default("Manhattan"),
  isActive: boolean("is_active").notNull().default(true),
  rating: decimal("rating", { precision: 3, scale: 1 }),
  reviewCount: integer("review_count").notNull().default(0),
  patientQuote: text("patient_quote"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DoctorPartner = typeof doctorPartners.$inferSelect;
export const insertDoctorPartnerSchema = createInsertSchema(doctorPartners).omit({
  id: true,
  createdAt: true,
});
export type InsertDoctorPartner = typeof insertDoctorPartnerSchema._type;

export const doctorMatchLeads = pgTable("doctor_match_leads", {
  id: serial("id").primaryKey(),
  specialty: varchar("specialty").notNull(),
  language: varchar("language").notNull(),
  genderPreference: varchar("gender_preference").notNull(),
  borough: varchar("borough").notNull().default("any"),
  selectedDoctorId: integer("selected_doctor_id"),
  patientName: varchar("patient_name"),
  patientPhone: varchar("patient_phone"),
  patientEmail: varchar("patient_email"),
  preferredTime: varchar("preferred_time"),
  preferredDays: text("preferred_days").array(),
  preferredTimesOfDay: text("preferred_times_of_day").array(),
  patientNotes: text("patient_notes"),
  requestedAt: timestamp("requested_at"),
  requestToken: varchar("request_token"),
  source: varchar("source").default("website"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DoctorMatchLead = typeof doctorMatchLeads.$inferSelect;
export const insertDoctorMatchLeadSchema = createInsertSchema(doctorMatchLeads).omit({
  id: true,
  createdAt: true,
});
export type InsertDoctorMatchLead = typeof insertDoctorMatchLeadSchema._type;

// Notification recipients (configurable from the admin UI)
export const notificationChannelSettingEnum = pgEnum("notification_channel_setting", ["email", "sms"]);

export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  notificationType: varchar("notification_type").notNull().default("doctor_intro_request"),
  channel: notificationChannelSettingEnum("channel").notNull().default("email"),
  label: varchar("label"),
  address: varchar("address").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationRecipientSchema = createInsertSchema(notificationRecipients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type InsertNotificationRecipient = z.infer<typeof insertNotificationRecipientSchema>;

// Test email send history — lightweight log for admin coordination
export const testEmailLogs = pgTable("test_email_logs", {
  id: serial("id").primaryKey(),
  recipient: varchar("recipient").notNull(),
  sentByEmail: varchar("sent_by_email"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const insertTestEmailLogSchema = createInsertSchema(testEmailLogs).omit({
  id: true,
  sentAt: true,
});
export type TestEmailLog = typeof testEmailLogs.$inferSelect;
export type InsertTestEmailLog = z.infer<typeof insertTestEmailLogSchema>;

// Generic key/value notification settings (e.g. CC the doctor's office on intro requests)
export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key").notNull().unique(),
  settingValue: text("setting_value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSettingSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  updatedAt: true,
});
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = z.infer<typeof insertNotificationSettingSchema>;

// Sync outbox — retryable queue for outbound ConcordiaCare app pushes
export const syncOutboxStatusEnum = pgEnum("sync_outbox_status", ["pending", "delivered", "failed"]);

export const syncOutbox = pgTable("sync_outbox", {
  id: serial("id").primaryKey(),
  endpoint: varchar("endpoint").notNull(),
  method: varchar("method").notNull().default("POST"),
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextRetryAt: timestamp("next_retry_at").defaultNow().notNull(),
  status: syncOutboxStatusEnum("status").notNull().default("pending"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSyncOutboxSchema = createInsertSchema(syncOutbox).omit({
  id: true,
  attempts: true,
  createdAt: true,
});
export type SyncOutboxEntry = typeof syncOutbox.$inferSelect;
export type InsertSyncOutboxEntry = z.infer<typeof insertSyncOutboxSchema>;

// ============================================================
// CARE NAVIGATION TOOL
// ============================================================

export const conditionStatusEnum = pgEnum("condition_status", ["active", "resolved"]);

// Patient-reported conditions (structured, for Care Navigator)
export const patientConditions = pgTable("patient_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionName: varchar("condition_name").notNull(),
  icd10Code: varchar("icd10_code"),
  diagnosedAt: timestamp("diagnosed_at"),
  notes: text("notes"),
  status: conditionStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPatientConditionSchema = createInsertSchema(patientConditions).omit({
  id: true,
  createdAt: true,
});
export type PatientCondition = typeof patientConditions.$inferSelect;
export type InsertPatientCondition = z.infer<typeof insertPatientConditionSchema>;

// Patient health journal entries
export const healthJournalEntries = pgTable("health_journal_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: varchar("condition_id").references(() => patientConditions.id, { onDelete: "set null" }),
  entryDate: timestamp("entry_date").notNull().defaultNow(),
  symptomSeverity: integer("symptom_severity"), // 1-5 scale
  mood: integer("mood"), // 1-5 scale
  energyLevel: integer("energy_level"), // 1-5 scale
  sideEffectsText: text("side_effects_text"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHealthJournalEntrySchema = createInsertSchema(healthJournalEntries).omit({
  id: true,
  createdAt: true,
});
export type HealthJournalEntry = typeof healthJournalEntries.$inferSelect;
export type InsertHealthJournalEntry = z.infer<typeof insertHealthJournalEntrySchema>;

// AI-generated condition explainer cache (30-day TTL)
export const conditionExplainerCache = pgTable("condition_explainer_cache", {
  id: serial("id").primaryKey(),
  conditionKey: varchar("condition_key").notNull().unique(), // normalized condition name + icd10
  responseJson: jsonb("response_json").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export type ConditionExplainerCache = typeof conditionExplainerCache.$inferSelect;
export const insertConditionExplainerCacheSchema = createInsertSchema(conditionExplainerCache).omit({
  id: true,
  generatedAt: true,
});
export type InsertConditionExplainerCache = z.infer<typeof insertConditionExplainerCacheSchema>;

// Restock notifications — patients/visitors who want to be alerted when a category/product is back
export const restockNotifications = pgTable("restock_notifications", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 128 }),
  productId: varchar("product_id"),
  name: varchar("name", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
});

export type RestockNotification = typeof restockNotifications.$inferSelect;
export const insertRestockNotificationSchema = createInsertSchema(restockNotifications).omit({
  id: true,
  createdAt: true,
  notifiedAt: true,
});
export type InsertRestockNotification = z.infer<typeof insertRestockNotificationSchema>;

// ============================================================
// ENGINE 1 — NDC Drug Info Cache (OpenFDA enrichment)
// ============================================================
export const drugInfoCache = pgTable("drug_info_cache", {
  id: serial("id").primaryKey(),
  ndc: varchar("ndc", { length: 20 }).notNull().unique(),
  brandName: varchar("brand_name", { length: 256 }),
  genericName: varchar("generic_name", { length: 256 }),
  labelerName: varchar("labeler_name", { length: 256 }),
  dosageFormName: varchar("dosage_form_name", { length: 128 }),
  routeName: varchar("route_name", { length: 128 }),
  strength: varchar("strength", { length: 128 }),
  deaSchedule: varchar("dea_schedule", { length: 8 }),
  productType: varchar("product_type", { length: 128 }),
  marketingStatus: varchar("marketing_status", { length: 128 }),
  substanceName: varchar("substance_name", { length: 512 }),
  pharmClass: varchar("pharm_class", { length: 512 }),        // pharmacological class
  warningsJson: jsonb("warnings_json").$type<string[]>(),     // black-box / key warnings
  inactiveIngredients: jsonb("inactive_ingredients").$type<string[]>(),
  packagingJson: jsonb("packaging_json").$type<{ description: string; marketingStartDate?: string }[]>(),
  rawFdaJson: jsonb("raw_fda_json"),                          // full FDA product label payload
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DrugInfoCache = typeof drugInfoCache.$inferSelect;
export const insertDrugInfoCacheSchema = createInsertSchema(drugInfoCache).omit({
  id: true,
  fetchedAt: true,
  updatedAt: true,
});
export type InsertDrugInfoCache = typeof drugInfoCache.$inferInsert;

// ============================================================
// ENGINE 2 — Clinical Notes (AI-generated SOAP notes)
// ============================================================
export const clinicalNoteTypeEnum = pgEnum("clinical_note_type", [
  "soap",         // Subjective / Objective / Assessment / Plan
  "progress",     // Progress note
  "medication_review",
  "counseling",
  "discharge_summary",
]);

export const clinicalNotes = pgTable("clinical_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  noteType: clinicalNoteTypeEnum("note_type").notNull().default("soap"),
  conditionId: varchar("condition_id").references(() => patientConditions.id, { onDelete: "set null" }),
  // SOAP sections
  subjective: text("subjective"),      // Patient-reported symptoms, concerns
  objective: text("objective"),        // Vitals, measurements, labs
  assessment: text("assessment"),      // Clinical assessment / diagnosis
  plan: text("plan"),                  // Treatment plan, medication changes
  // Metadata
  noteDate: timestamp("note_date").defaultNow().notNull(),
  authorId: varchar("author_id"),      // admin/pharmacist user ID if manually created
  aiGenerated: boolean("ai_generated").notNull().default(true),
  reviewedBy: varchar("reviewed_by"),  // pharmacist who signed off
  reviewedAt: timestamp("reviewed_at"),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | finalized | archived
  tags: jsonb("tags").$type<string[]>(),
  medicationsAtTime: jsonb("medications_at_time").$type<{ rxNumber: string; medicationName: string; dosage: string }[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClinicalNote = typeof clinicalNotes.$inferSelect;
export const insertClinicalNoteSchema = createInsertSchema(clinicalNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinicalNote = typeof clinicalNotes.$inferInsert;

// ============================================================
// ENGINE 3 — Prior Authorization Requests
// ============================================================
export const paStatusEnum = pgEnum("pa_status", [
  "draft",
  "pending_submission",
  "awaiting_signature",
  "signature_received",
  "submitted",
  "rfi_received",
  "approved",
  "denied",
  "appeal_in_progress",
  "appealed",
  "expired",
  "cancelled",
]);

export const priorAuthorizationRequests = pgTable("prior_authorization_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  prescriptionId: varchar("prescription_id").references(() => prescriptions.id, { onDelete: "set null" }),
  // Drug info
  medicationName: varchar("medication_name").notNull(),
  ndc: varchar("ndc"),
  strength: varchar("strength"),
  daysSupply: integer("days_supply"),
  quantityRequested: decimal("quantity_requested", { precision: 10, scale: 3 }),
  // Diagnosis
  icd10Code: varchar("icd10_code"),
  diagnosisDescription: text("diagnosis_description"),
  // Insurance
  insurancePlanName: varchar("insurance_plan"),
  insuranceMemberId: varchar("insurance_member_id"),
  insuranceBinNumber: varchar("insurance_bin"),
  insurancePcnNumber: varchar("insurance_pcn"),
  payerId: varchar("payer_id"),
  // Prescriber
  prescriberName: varchar("prescriber_name"),
  prescriberNpi: varchar("prescriber_npi"),
  prescriberPhone: varchar("prescriber_phone"),
  prescriberFax: varchar("prescriber_fax"),
  prescriberAddress: text("prescriber_address"),
  // Generated letter
  letterText: text("letter_text"),             // full PA letter body (AI-generated)
  letterHtml: text("letter_html"),             // HTML version for PDF export
  clinicalNotes: text("clinical_notes_summary"), // clinical justification narrative
  supportingDocuments: jsonb("supporting_docs").$type<{ label: string; url: string }[]>(),
  // Workflow
  status: paStatusEnum("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  responseReceivedAt: timestamp("response_received_at"),
  approvalExpiresAt: timestamp("approval_expires_at"),
  referenceNumber: varchar("reference_number"),  // payer's PA reference #
  denialReason: text("denial_reason"),
  appealDeadline: timestamp("appeal_deadline"),
  adminNotes: text("admin_notes"),
  assignedTo: varchar("assigned_to"),            // staff member handling this PA
  aiGenerated: boolean("ai_generated").notNull().default(true),
  // RFI (Request for Information) tracking
  rfiNotes: text("rfi_notes"),                   // what the payer flagged as missing
  rfiReceivedAt: timestamp("rfi_received_at"),    // when the RFI was received
  // Appeal tracking
  appealLetterText: text("appeal_letter_text"),   // AI-generated appeal letter body
  appealLetterHtml: text("appeal_letter_html"),   // HTML version for PDF export
  appealGeneratedAt: timestamp("appeal_generated_at"),
  appealSubmittedAt: timestamp("appeal_submitted_at"),
  appealPeerToPeerNote: text("appeal_peer_to_peer_note"),  // prescriber peer-to-peer call prep
  appealKeyArguments: jsonb("appeal_key_arguments").$type<string[]>(),  // structured arguments
  appealCitedGuidelines: jsonb("appeal_cited_guidelines").$type<string[]>(), // cited guidelines/literature
  // Prescriber e-signature workflow
  prescriberEmail: varchar("prescriber_email"),
  signatureStatus: varchar("signature_status").notNull().default("not_required"), // not_required|requested|received|voided
  signatureTokenHash: varchar("signature_token_hash"),   // SHA-256 of the raw one-time token (never store raw)
  signatureTokenExpiresAt: timestamp("signature_token_expires_at"),
  signatureRequestedAt: timestamp("signature_requested_at"),
  signatureReceivedAt: timestamp("signature_received_at"),
  signedLetterHtml: text("signed_letter_html"),          // PA letter HTML with embedded signature image
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PriorAuthorizationRequest = typeof priorAuthorizationRequests.$inferSelect;
export const insertPriorAuthorizationRequestSchema = createInsertSchema(priorAuthorizationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPriorAuthorizationRequest = typeof priorAuthorizationRequests.$inferInsert;

// Chat widget analytics
export const chatEvents = pgTable("chat_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(), // rx_redirect | fallback | call_click
  intent: varchar("intent", { length: 128 }),
  pagePath: varchar("page_path", { length: 512 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatEvent = typeof chatEvents.$inferSelect;
export const insertChatEventSchema = createInsertSchema(chatEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertChatEvent = z.infer<typeof insertChatEventSchema>;
