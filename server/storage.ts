import { assignConcordiaId } from "./concordiaId";
import { IdentityLinkRequiredError, assertEmailDoesNotClaimOtherClerkUser } from "./canonicalPatientIdentity";
import { computeDecisionRates, buildMonthlySeries, computeItemRate } from "./pa-analytics-helpers";
import {
  users,
  prescriptions,
  products,
  orders,
  orderItems,
  cartItems,
  loyaltyTransactions,
  primeRxSyncLogs,
  primeRxDrugs,
  otpCodes,
  auditLogs,
  notifications,
  insuranceAssistanceRequests,
  patientChats,
  patientChatMessages,
  fluShotAppointments,
  deliveryChats,
  blogPosts,
  pharmacyAlerts,
  patientDocuments,
  vendors,
  vendorPrices,
  reorderItems,
  blisterPackPatients,
  blisterPackMedicationHistory,
  patientCommunications,
  prescriptionTransferRequests,
  homeAttendants,
  patientAttendants,
  attendantAuditLog,
  urgentRefillRequests,
  staffEmails,
  staffOtpCodes,
  pointsSettings,
  // Points & Rewards System
  pointsWallets,
  pointsLedger,
  streaks,
  rewards,
  rewardRedemptions,
  earningRules,
  campaigns,
  referrals,
  oneTimeRewards,
  otcCards,
  EARNING_POINTS,
  POINTS_EXPIRY_MONTHS,
  type User,
  type UpsertUser,
  type Prescription,
  type InsertPrescription,
  type Product,
  type InsertProduct,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type CartItem,
  type InsertCartItem,
  type LoyaltyTransaction,
  type InsertLoyaltyTransaction,
  type PrimeRxSyncLog,
  type InsertPrimeRxSyncLog,
  type PrimeRxDrug,
  type InsertPrimeRxDrug,
  type OtpCode,
  type InsertOtpCode,
  type AuditLog,
  type InsertAuditLog,
  type Notification,
  type InsertNotification,
  type InsuranceAssistanceRequest,
  type InsertInsuranceAssistanceRequest,
  type PatientChat,
  type PatientChatMessage,
  type InsertPatientChatMessage,
  type FluShotAppointment,
  type InsertFluShotAppointment,
  type DeliveryChat,
  type InsertDeliveryChat,
  type BlogPost,
  type InsertBlogPost,
  type PharmacyAlert,
  type InsertPharmacyAlert,
  type PatientDocument,
  type InsertPatientDocument,
  type Vendor,
  type InsertVendor,
  type VendorPrice,
  type InsertVendorPrice,
  type ReorderItem,
  type InsertReorderItem,
  type BlisterPackPatient,
  type InsertBlisterPackPatient,
  type BlisterPackMedicationHistory,
  type InsertBlisterPackMedicationHistory,
  type PatientCommunication,
  type InsertPatientCommunication,
  type PrescriptionTransferRequest,
  type InsertPrescriptionTransferRequest,
  type CartItemWithProduct,
  type HybridCartItem,
  type OrderWithItems,
  type HomeAttendant,
  type InsertHomeAttendant,
  type PatientAttendant,
  type InsertPatientAttendant,
  type AttendantAuditLog,
  type InsertAttendantAuditLog,
  type UrgentRefillRequest,
  type InsertUrgentRefillRequest,
  type StaffEmail,
  type InsertStaffEmail,
  type StaffOtpCode,
  type InsertStaffOtpCode,
  // Points & Rewards System types
  type PointsWallet,
  type InsertPointsWallet,
  type PointsLedgerEntry,
  type InsertPointsLedgerEntry,
  type Streak,
  type InsertStreak,
  type Reward,
  type InsertReward,
  type RewardRedemption,
  type InsertRewardRedemption,
  type EarningRule,
  type InsertEarningRule,
  type Campaign,
  type InsertCampaign,
  type Referral,
  type InsertReferral,
  type OneTimeReward,
  type OtcCard,
  type InsertOtcCard,
  patientRequests,
  requestStatusHistory,
  staffRolePermissions,
  blisterDoseLogs,
  blisterReminders,
  changeLog,
  type PatientRequest,
  type InsertPatientRequest,
  type RequestStatusHistory,
  type InsertRequestStatusHistory,
  type StaffRolePermission,
  type BlisterDoseLog,
  type InsertBlisterDoseLog,
  type BlisterReminder,
  type InsertBlisterReminder,
  type ChangeLog,
  type InsertChangeLog,
  patientDoctors,
  type PatientDoctor,
  type InsertPatientDoctor,
  type PointsSetting,
  conversionLeads,
  type ConversionLead,
  type InsertConversionLead,
  contactSubmissions,
  type ContactSubmission,
  type InsertContactSubmission,
  pageViews,
  type PageView,
  type InsertPageView,
  doctorPartners,
  type DoctorPartner,
  type InsertDoctorPartner,
  doctorMatchLeads,
  type DoctorMatchLead,
  type InsertDoctorMatchLead,
  notificationRecipients,
  type NotificationRecipient,
  type InsertNotificationRecipient,
  notificationSettings,
  type NotificationSetting,
  testEmailLogs,
  type TestEmailLog,
  type InsertTestEmailLog,
  syncOutbox,
  type SyncOutboxEntry,
  type InsertSyncOutboxEntry,
  patientConditions,
  type PatientCondition,
  type InsertPatientCondition,
  healthJournalEntries,
  type HealthJournalEntry,
  type InsertHealthJournalEntry,
  conditionExplainerCache,
  chatEvents,
  type InsertChatEvent,
  restockNotifications,
  type RestockNotification,
  type InsertRestockNotification,
  // Engine tables
  drugInfoCache,
  type DrugInfoCache,
  type InsertDrugInfoCache,
  clinicalNotes,
  type ClinicalNote,
  type InsertClinicalNote,
  priorAuthorizationRequests,
  type PriorAuthorizationRequest,
  type InsertPriorAuthorizationRequest,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gt, gte, lte, sql, or, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersByPhone(phoneNumber: string): Promise<User[]>;
  getUserByPrimeRxPatientId(primeRxPatientId: string): Promise<User | undefined>;
  getUserByConcordiaCareUserId(concordiaCareUserId: string): Promise<User | undefined>;
  getUserByConcordiaId(concordiaId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByClerkId(clerkId: string): Promise<User | undefined>;
  getUsersByFamilyGroup(familyGroupId: string): Promise<User[]>;
  updateUserProfile(id: string, updates: Partial<User>): Promise<User | undefined>;
  linkConcordiaCareUser(
    patientId: string,
    concordiaCareUserId: string,
  ): Promise<"linked" | "already_linked" | "conflict" | "not_found">;
  upsertUser(user: UpsertUser): Promise<User>;
  upsertUserByClerkId(clerkId: string, data: { email?: string; firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Prescription operations
  getPrescription(id: string): Promise<Prescription | undefined>;
  getPrescriptionsByUserId(userId: string): Promise<Prescription[]>;
  getAllPrescriptions(): Promise<Prescription[]>;
  getPrescriptionsByWorkflowStatus(status: string): Promise<Prescription[]>;
  createPrescription(prescription: InsertPrescription): Promise<Prescription>;
  getPrescriptionByRxNumber(rxNumber: string): Promise<Prescription | undefined>;
  updatePrescription(id: string, updates: Partial<InsertPrescription>): Promise<Prescription | undefined>;
  updatePrescriptionStatus(id: string, status: string): Promise<Prescription | undefined>;
  updatePrescriptionWorkflowStatus(id: string, workflowStatus: string): Promise<Prescription | undefined>;
  
  // Product operations
  getProduct(id: string): Promise<Product | undefined>;
  getProductByNdc(ndc: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  getProductsBelowThreshold(): Promise<Product[]>;
  getProductSalesAnalysis(): Promise<Array<{ productId: string; productName: string; totalSold: number; revenue: number }>>;
  getProductByExternalId(externalId: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  decrementProductStock(id: string, quantity: number): Promise<Product | undefined>;
  incrementProductStock(id: string, quantity: number): Promise<Product | undefined>;
  
  // Cart operations (hybrid cart - supports products and prescriptions)
  getCartItemsByUserId(userId: string): Promise<HybridCartItem[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  addPrescriptionToCart(userId: string, prescriptionId: string, copayAmount?: string): Promise<CartItem>;
  updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined>;
  removeFromCart(id: string): Promise<void>;
  removeSubmittedCartItem(id: string, userId: string, quantity: number): Promise<void>;
  clearCart(userId: string): Promise<void>;
  
  // Order operations
  getOrder(id: string): Promise<OrderWithItems | undefined>;
  getOrdersByUserId(userId: string): Promise<OrderWithItems[]>;
  getAllOrders(): Promise<OrderWithItems[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  updateOrderDelivery(id: string, deliveryData: Partial<Order>): Promise<Order | undefined>;
  getOrderByConcordiaCareId(concordiaCareOrderId: string): Promise<Order | undefined>;
  getOrderByOrderNumber(orderNumber: string): Promise<Order | undefined>;
  getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined>;
  getOrderByOrderNumberWithItems(orderNumber: string): Promise<OrderWithItems | undefined>;
  
  // Loyalty operations
  getLoyaltyTransactionsByUserId(userId: string): Promise<LoyaltyTransaction[]>;
  createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction>;
  updateUserPoints(userId: string, points: number): Promise<User | undefined>;
  
  // PrimeRx Sync operations
  createSyncLog(log: InsertPrimeRxSyncLog): Promise<PrimeRxSyncLog>;
  getSyncLogs(limit?: number): Promise<PrimeRxSyncLog[]>;
  
  // PrimeRx Drug Dictionary operations
  getDrug(id: string): Promise<PrimeRxDrug | undefined>;
  getDrugByNdc(ndc: string): Promise<PrimeRxDrug | undefined>;
  getAllDrugs(): Promise<PrimeRxDrug[]>;
  searchDrugs(query: string): Promise<PrimeRxDrug[]>;
  upsertDrug(drug: InsertPrimeRxDrug): Promise<PrimeRxDrug>;
  updateDrug(id: string, drug: Partial<InsertPrimeRxDrug>): Promise<PrimeRxDrug | undefined>;
  
  // Prescription operations with drug lookup
  updatePrescriptionWithDrugInfo(prescriptionId: string, ndc: string): Promise<Prescription | undefined>;

  // Audit Log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: string; actionType?: string; entityType?: string; limit?: number }): Promise<AuditLog[]>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUserId(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  createScheduledEventReminder(userId: string, event: import("@shared/schema").ScheduledEvent, channel: "in_app" | "email" | "sms"): Promise<Notification>;

  // Insurance Assistance operations
  createInsuranceAssistanceRequest(request: InsertInsuranceAssistanceRequest): Promise<InsuranceAssistanceRequest>;
  getAllInsuranceAssistanceRequests(): Promise<InsuranceAssistanceRequest[]>;
  getInsuranceAssistanceRequestsByUserId(userId: string): Promise<InsuranceAssistanceRequest[]>;
  getInsuranceAssistanceRequestsByEmail(email: string): Promise<InsuranceAssistanceRequest[]>;
  getInsuranceAssistanceRequestByTicketNumber(ticketNumber: string): Promise<InsuranceAssistanceRequest | undefined>;
  updateInsuranceAssistanceRequestStatus(id: string, status: string): Promise<InsuranceAssistanceRequest | undefined>;

  // Patient Chat operations
  getChatsByUserId(userId: string): Promise<PatientChat[]>;
  getChatForUser(chatId: string, userId: string): Promise<PatientChat | undefined>;
  getChatMessagesForUser(chatId: string, userId: string): Promise<PatientChatMessage[]>;
  createChatExchangeForUser(params: {
    userId: string;
    chatId?: string;
    title: string;
    userContent: string;
    assistantContent: string;
    auditMetadata: Record<string, unknown>;
  }): Promise<{ chat: PatientChat; assistantMessage: PatientChatMessage; isNewChat: boolean } | undefined>;
  deleteChatForUser(chatId: string, userId: string, auditLog: InsertAuditLog): Promise<boolean>;

  // Flu Shot Appointment operations
  createFluShotAppointment(appointment: InsertFluShotAppointment): Promise<FluShotAppointment>;
  getAllFluShotAppointments(): Promise<FluShotAppointment[]>;
  getFluShotAppointmentsByUserId(userId: string): Promise<FluShotAppointment[]>;
  getFluShotAppointmentsByEmail(email: string): Promise<FluShotAppointment[]>;
  getFluShotAppointmentByTicketNumber(ticketNumber: string): Promise<FluShotAppointment | undefined>;
  updateFluShotAppointmentStatus(id: number, status: string): Promise<FluShotAppointment | undefined>;
  getPatientScheduledEvents(userId: string, phoneNumber?: string): Promise<import("@shared/schema").ScheduledEvent[]>;

  // Delivery chat operations
  getDeliveryChatsByOrderId(orderId: string): Promise<DeliveryChat[]>;
  createDeliveryChatMessage(orderId: string, senderType: string, message: string): Promise<DeliveryChat>;

  // OTP operations
  createOtpCode(phoneNumber: string, code: string, expiresAt: Date): Promise<OtpCode>;
  getValidOtpCode(phoneNumber: string, code: string): Promise<OtpCode | undefined>;
  incrementOtpAttempts(id: number): Promise<void>;
  markOtpVerified(id: number): Promise<void>;
  cleanupExpiredOtps(): Promise<void>;
  
  // Username/password auth
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;

  // Analytics operations
  getAnalyticsSummary(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    totalPrescriptions: number;
    totalUsers: number;
    pendingOrders: number;
    pendingRefills: number;
    lowStockProducts: number;
    bySource: Record<string, { revenue: number; orders: number }>;
  }>;

  getPharmFlowInsights(): Promise<{
    processing: { total: number; completed: number; pending: number; processing: number; cancelled: number };
    deliveryMethodBreakdown: { method: string; count: number; percentage: number }[];
    courierBreakdown: { courier: string; count: number; percentage: number; avgDeliveryHours: number | null; successRate: number | null }[];
    pickupVsDeliveryRate: { pickup: number; delivery: number; pickupPercent: number; deliveryPercent: number };
  }>;

  getPatientInsights(userId: string): Promise<{
    totalOrders: number;
    totalSpending: number;
    monthlyAvgSpending: number;
    orderTypeBreakdown: { type: string; count: number; percentage: number }[];
    deliveryMethodBreakdown: { method: string; count: number; percentage: number }[];
    courierBreakdown: { courier: string; count: number; percentage: number }[];
    predictedDeliveryPreference: string | null;
    recentOrders: { id: string; orderNumber: string; type: string; total: string; deliveryMethod: string | null; courierPartner: string | null; status: string; createdAt: Date }[];
  }>;

  // Blog operations
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: number, updates: { title?: string; content?: string; category?: string; imageUrl?: string | null; pinnedToHero?: boolean }): Promise<BlogPost | undefined>;
  getPinnedBlogPostCount(): Promise<number>;
  getPinnedPublishedBlogPosts(): Promise<BlogPost[]>;
  getAllPublishedBlogPosts(): Promise<BlogPost[]>;
  getAllBlogPosts(): Promise<BlogPost[]>;
  getPublishedBlogPostsPaginated(page: number, limit: number): Promise<{ posts: BlogPost[]; total: number }>;
  getBlogPost(id: number): Promise<BlogPost | undefined>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  likeBlogPost(id: number): Promise<BlogPost | undefined>;
  publishBlogPost(id: number): Promise<BlogPost | undefined>;
  unpublishBlogPost(id: number): Promise<BlogPost | undefined>;
  deleteExpiredBlogPosts(): Promise<number>;

  // Pharmacy Alerts operations
  createPharmacyAlert(alert: InsertPharmacyAlert): Promise<PharmacyAlert>;
  getActivePharmacyAlerts(): Promise<PharmacyAlert[]>;
  deactivatePharmacyAlert(id: number): Promise<PharmacyAlert | undefined>;
  deleteExpiredAlerts(): Promise<number>;

  // Patient Documents operations
  createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocument>;
  getPatientDocuments(userId: string): Promise<PatientDocument[]>;
  getPatientDocument(id: number): Promise<PatientDocument | undefined>;
  deletePatientDocument(id: number): Promise<void>;
  updateBlogPostImage(id: number, imageUrl: string): Promise<BlogPost | undefined>;

  // Vendor operations
  getAllVendors(): Promise<Vendor[]>;
  getVendor(id: number): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: number, vendor: Partial<InsertVendor>): Promise<Vendor | undefined>;
  
  // Vendor prices operations  
  getVendorPricesByNdc(ndc: string): Promise<VendorPrice[]>;
  upsertVendorPrice(price: InsertVendorPrice): Promise<VendorPrice>;
  
  // Reorder items operations
  getLowStockProducts(): Promise<Product[]>;
  getReorderItems(): Promise<ReorderItem[]>;
  createReorderItem(item: InsertReorderItem): Promise<ReorderItem>;
  updateReorderItem(id: number, updates: Partial<ReorderItem>): Promise<ReorderItem | undefined>;
  deleteReorderItem(id: number): Promise<void>;

  // Blister Pack Patient operations
  getAllBlisterPackPatients(): Promise<BlisterPackPatient[]>;
  getBlisterPackPatient(id: number): Promise<BlisterPackPatient | undefined>;
  getBlisterPackPatientByPhone(phone: string): Promise<BlisterPackPatient | undefined>;
  getBlisterPackPatientByUserId(userId: string): Promise<BlisterPackPatient | undefined>;
  createBlisterPackPatient(patient: InsertBlisterPackPatient): Promise<BlisterPackPatient>;
  updateBlisterPackPatient(id: number, updates: Partial<BlisterPackPatient>): Promise<BlisterPackPatient | undefined>;
  updateBlisterPackSyncMeta(id: number, meta: { lastSyncedToApp?: Date; lastAppSync?: Date; concordiaCareBlisterPackId?: string }): Promise<void>;
  deleteBlisterPackPatient(id: number): Promise<void>;
  
  // Blister Pack Medication History
  getBlisterPackMedicationHistory(patientId: number): Promise<BlisterPackMedicationHistory[]>;
  addBlisterPackMedicationHistory(entry: InsertBlisterPackMedicationHistory): Promise<BlisterPackMedicationHistory>;

  // Patient Communications operations
  createPatientCommunication(comm: InsertPatientCommunication): Promise<PatientCommunication>;
  getPatientCommunication(id: number): Promise<PatientCommunication | undefined>;
  getPatientCommunications(blisterPatientId: number): Promise<PatientCommunication[]>;
  getPatientCommunicationsFiltered(filters: { userId?: string; blisterPatientId?: number; direction?: string }): Promise<PatientCommunication[]>;
  getUnreadCommunications(filters: { userId?: string; blisterPatientId?: number }): Promise<PatientCommunication[]>;
  updatePatientCommunication(id: number, updates: Partial<PatientCommunication>): Promise<PatientCommunication | undefined>;
  markCommunicationRead(id: number): Promise<PatientCommunication | undefined>;
  markCommunicationAcknowledged(id: number, acknowledgedBy: string): Promise<PatientCommunication | undefined>;
  markCommunicationResolved(id: number, resolvedBy: string): Promise<PatientCommunication | undefined>;

  // Prescription Transfer Request operations
  createTransferRequest(request: InsertPrescriptionTransferRequest): Promise<PrescriptionTransferRequest>;
  getAllTransferRequests(): Promise<PrescriptionTransferRequest[]>;
  getTransferRequest(id: number): Promise<PrescriptionTransferRequest | undefined>;
  getTransferRequestsByUserId(userId: string): Promise<PrescriptionTransferRequest[]>;
  updateTransferRequestStatus(id: number, status: string, statusMessage?: string, notes?: string): Promise<PrescriptionTransferRequest | undefined>;
  markTransferRewardGranted(id: number): Promise<PrescriptionTransferRequest | undefined>;
  deleteTransferRequest(id: number): Promise<void>;

  // Home Attendant operations
  createHomeAttendant(attendant: InsertHomeAttendant): Promise<HomeAttendant>;
  getHomeAttendant(id: number): Promise<HomeAttendant | undefined>;
  getHomeAttendantByPhone(phone: string): Promise<HomeAttendant | undefined>;
  getHomeAttendantByUsername(username: string): Promise<HomeAttendant | undefined>;
  getAllHomeAttendants(): Promise<HomeAttendant[]>;
  updateHomeAttendant(id: number, updates: Partial<HomeAttendant>): Promise<HomeAttendant | undefined>;
  updateAttendantLastLogin(id: number): Promise<HomeAttendant | undefined>;
  
  // Patient-Attendant Link operations
  linkPatientToAttendant(link: InsertPatientAttendant): Promise<PatientAttendant>;
  getPatientAttendant(patientId: string): Promise<(PatientAttendant & { attendant: HomeAttendant }) | undefined>;
  getAttendantPatients(attendantId: number): Promise<(PatientAttendant & { patient: User })[]>;
  updatePatientAttendantLink(id: number, updates: Partial<PatientAttendant>): Promise<PatientAttendant | undefined>;
  revokePatientAttendantLink(patientId: string): Promise<void>;
  
  // Attendant Audit Log operations
  createAttendantAuditLog(log: InsertAttendantAuditLog): Promise<AttendantAuditLog>;
  getAttendantAuditLogs(filters: { attendantId?: number; patientId?: string; limit?: number }): Promise<AttendantAuditLog[]>;

  // Urgent Refill Request operations
  createUrgentRefillRequest(request: InsertUrgentRefillRequest): Promise<UrgentRefillRequest>;
  getAllUrgentRefillRequests(): Promise<(UrgentRefillRequest & { prescription?: Prescription; patient?: User })[]>;
  getPendingUrgentRefillRequests(): Promise<(UrgentRefillRequest & { prescription?: Prescription; patient?: User })[]>;
  updateUrgentRefillRequestStatus(id: string, status: string, processedBy?: string, adminNotes?: string): Promise<UrgentRefillRequest | undefined>;

  // Staff Email operations (admin manages staff who can log in)
  createStaffEmail(staff: InsertStaffEmail): Promise<StaffEmail>;
  getStaffEmail(id: number): Promise<StaffEmail | undefined>;
  getStaffEmailByEmail(email: string): Promise<StaffEmail | undefined>;
  getAllStaffEmails(): Promise<StaffEmail[]>;
  updateStaffEmail(id: number, updates: Partial<StaffEmail>): Promise<StaffEmail | undefined>;
  deleteStaffEmail(id: number): Promise<void>;
  updateStaffLastLogin(id: number): Promise<StaffEmail | undefined>;

  // Staff OTP operations (email-based OTP authentication)
  createStaffOtpCode(otp: InsertStaffOtpCode): Promise<StaffOtpCode>;
  getActiveStaffOtpByEmail(email: string): Promise<StaffOtpCode | undefined>;
  incrementStaffOtpAttempts(id: number): Promise<StaffOtpCode | undefined>;
  markStaffOtpVerified(id: number): Promise<StaffOtpCode | undefined>;
  invalidateStaffOtpCodes(email: string): Promise<void>;
  countRecentStaffOtpRequests(email: string, minutes: number): Promise<number>;

  // ==========================================
  // POINTS & REWARDS ENGINE
  // ==========================================
  
  // Points Wallet operations
  getPointsWallet(userId: string): Promise<PointsWallet | undefined>;
  getOrCreatePointsWallet(userId: string): Promise<PointsWallet>;
  updatePointsWallet(userId: string, updates: Partial<PointsWallet>): Promise<PointsWallet | undefined>;
  freezeWallet(userId: string, reason: string, adminId: string): Promise<PointsWallet | undefined>;
  unfreezeWallet(userId: string): Promise<PointsWallet | undefined>;
  resetDailyPointsCap(userId: string): Promise<void>;
  resetWeeklyPointsCap(userId: string): Promise<void>;
  updateDailyWeeklyPoints(userId: string, pointsEarned: number): Promise<void>;
  flagUserForGaming(userId: string, reason: string, anomalyScore: number): Promise<void>;
  getFlaggedUsers(): Promise<PointsWallet[]>;
  restoreStreak(userId: string, streakType: string, newCount: number, adminId: string, reason: string): Promise<Streak>;
  getGamificationAnalytics(): Promise<{
    adherenceStats: {
      onTimeRefillRate: number;
      avgStreakLength: number;
      usersWithActiveStreaks: number;
      totalStreakBreaks30Days: number;
    };
    streakRetention: { day: number; retention: number }[];
    rewardsROI: {
      pointsIssued: number;
      estimatedCostUSD: number;
      refillsGenerated: number;
      revenueGenerated: number;
    };
    flaggedUsersCount: number;
    gamingIncidents30Days: number;
  }>;
  
  // Points Ledger operations
  addPointsLedgerEntry(entry: InsertPointsLedgerEntry): Promise<PointsLedgerEntry>;
  getPointsLedger(userId: string, limit?: number): Promise<PointsLedgerEntry[]>;
  getPointsLedgerByOrderId(orderId: string): Promise<PointsLedgerEntry[]>;
  checkIdempotencyKey(key: string): Promise<boolean>;
  getExpiringPoints(userId: string, beforeDate: Date): Promise<PointsLedgerEntry[]>;
  markPointsExpired(entryId: number): Promise<void>;
  
  // Core points engine methods
  awardPoints(params: {
    userId: string;
    actionType: string;
    points: number;
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
    campaignId?: number;
    adminId?: string;
    adminReason?: string;
    idempotencyKey?: string;
  }): Promise<PointsLedgerEntry | null>;
  
  deductPoints(params: {
    userId: string;
    actionType: string;
    points: number;
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
    adminId?: string;
    adminReason?: string;
    idempotencyKey?: string;
  }): Promise<PointsLedgerEntry | null>;
  
  // Streak operations
  getStreak(userId: string, streakType: string): Promise<Streak | undefined>;
  getUserStreaks(userId: string): Promise<Streak[]>;
  updateStreak(userId: string, streakType: string, increment: boolean, referenceId?: string): Promise<Streak>;
  getStreakMilestoneBonus(currentCount: number, lastMilestone: number): { milestone: number; points: number } | null;
  
  // Reward operations
  getReward(id: number): Promise<Reward | undefined>;
  getAllRewards(): Promise<Reward[]>;
  getActiveRewards(): Promise<Reward[]>;
  getAvailableRewardsForUser(userId: string): Promise<Reward[]>;
  createReward(reward: InsertReward): Promise<Reward>;
  updateReward(id: number, updates: Partial<Reward>): Promise<Reward | undefined>;
  deleteReward(id: number): Promise<void>;
  
  // Reward redemption operations
  redeemReward(userId: string, rewardId: number, orderId?: string): Promise<RewardRedemption | null>;
  getUserRedemptions(userId: string): Promise<(RewardRedemption & { reward: Reward })[]>;
  canUserRedeemReward(userId: string, rewardId: number): Promise<{ canRedeem: boolean; reason?: string }>;
  
  // Earning rules operations
  getEarningRule(ruleKey: string): Promise<EarningRule | undefined>;
  getAllEarningRules(): Promise<EarningRule[]>;
  getActiveEarningRules(): Promise<EarningRule[]>;
  createEarningRule(rule: InsertEarningRule): Promise<EarningRule>;
  updateEarningRule(id: number, updates: Partial<EarningRule>): Promise<EarningRule | undefined>;
  deleteEarningRule(id: number): Promise<void>;
  toggleEarningRule(id: number, isActive: boolean, modifiedBy?: string): Promise<EarningRule | undefined>;
  seedDefaultEarningRules(): Promise<void>;
  
  // Campaign operations
  getCampaign(id: number): Promise<Campaign | undefined>;
  getAllCampaigns(): Promise<Campaign[]>;
  getActiveCampaigns(): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, updates: Partial<Campaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<void>;
  getApplicableCampaign(actionType: string): Promise<Campaign | undefined>;
  
  // Referral operations
  createReferral(referral: InsertReferral): Promise<Referral>;
  getReferral(id: number): Promise<Referral | undefined>;
  getReferralByCode(code: string): Promise<Referral | undefined>;
  getUserReferrals(referrerId: string): Promise<Referral[]>;
  updateReferralStatus(id: number, status: string, updates?: Partial<Referral>): Promise<Referral | undefined>;
  countUserReferralsThisMonth(referrerId: string): Promise<number>;
  
  // One-time reward tracking
  hasReceivedOneTimeReward(userId: string, rewardType: string): Promise<boolean>;
  recordOneTimeReward(userId: string, rewardType: string, points: number): Promise<OneTimeReward>;
  
  // Admin analytics
  getPointsAnalytics(): Promise<{
    totalPointsIssued: number;
    totalPointsRedeemed: number;
    totalPointsExpired: number;
    activeWallets: number;
    topEarners: { userId: string; points: number }[];
  }>;
  
  // OTC Card operations
  getOtcCard(userId: string): Promise<OtcCard | undefined>;
  createOtcCard(card: InsertOtcCard): Promise<OtcCard>;
  updateOtcCard(userId: string, updates: Partial<OtcCard>): Promise<OtcCard | undefined>;
  deleteOtcCard(userId: string): Promise<void>;
  
  // Seed rewards
  seedDefaultRewards(): Promise<void>;

  // Settings operations (points_settings table)
  getSettingByKey(key: string): Promise<PointsSetting | undefined>;
  getAllSettings(): Promise<PointsSetting[]>;
  upsertSetting(key: string, value: string, description?: string, updatedBy?: string): Promise<PointsSetting>;

  // Pending caregiver link requests
  getPendingCaregiverLinks(): Promise<Array<PatientAttendant & { attendant: HomeAttendant; patient: User }>>;

  // Patient Request Queue operations (T004)
  createPatientRequest(request: InsertPatientRequest): Promise<PatientRequest>;
  getPatientRequests(filters?: { status?: string; type?: string; assignedStaffId?: number }): Promise<PatientRequest[]>;
  getPatientRequest(id: number): Promise<PatientRequest | undefined>;
  updatePatientRequestStatus(id: number, status: string, changedBy?: number, notes?: string): Promise<PatientRequest | undefined>;
  assignPatientRequest(id: number, staffId: number): Promise<PatientRequest | undefined>;
  getRequestStatusHistory(requestId: number): Promise<RequestStatusHistory[]>;

  // Blister Dose Tracking operations (T005)
  createBlisterDoseLog(log: InsertBlisterDoseLog): Promise<BlisterDoseLog>;
  getBlisterDoseLogs(blisterPatientId: number, dateFrom?: string, dateTo?: string): Promise<BlisterDoseLog[]>;
  getLatestDoseLogsByPatient(blisterPatientId: number): Promise<BlisterDoseLog[]>;
  createBlisterReminder(reminder: InsertBlisterReminder): Promise<BlisterReminder>;
  updateBlisterReminder(id: number, updates: Partial<BlisterReminder>): Promise<BlisterReminder | undefined>;
  deleteBlisterReminder(id: number): Promise<void>;
  getActiveBlisterReminders(blisterPatientId: number): Promise<BlisterReminder[]>;
  getAllActiveBlisterReminders(): Promise<BlisterReminder[]>;

  // Product visibility (T006)
  getWebsiteProducts(): Promise<Product[]>;
  getAppProducts(): Promise<Product[]>;
  updateProductVisibility(id: string, showOnWebsite?: boolean, showInApp?: boolean): Promise<Product | undefined>;
  syncOtcVisibility(): Promise<number>;

  // Draft product workflow (Task #163)
  getDraftProducts(): Promise<Product[]>;
  publishDraftProducts(ids?: string[], importBatchId?: string): Promise<number>;

  // Bulk OTC product sync (Task #188)
  bulkSyncOtcProducts(incoming: InsertProduct[], source: string): Promise<{ upserted: number; markedUnavailable: number }>;

  // Change Log operations (T012)
  createChangeLogEntry(entry: InsertChangeLog): Promise<ChangeLog>;
  getChangeLogEntries(entityType: string, entityId: string): Promise<ChangeLog[]>;

  // Doctor Partner operations (Find Your Doctor quiz)
  getAllDoctorPartners(activeOnly?: boolean): Promise<DoctorPartner[]>;
  getDoctorPartner(id: number): Promise<DoctorPartner | undefined>;
  createDoctorPartner(data: InsertDoctorPartner): Promise<DoctorPartner>;
  updateDoctorPartner(id: number, updates: Partial<InsertDoctorPartner>): Promise<DoctorPartner | undefined>;
  deleteDoctorPartner(id: number): Promise<boolean>;
  matchDoctorPartners(criteria: { specialty: string; language: string; genderPreference: string; borough: string }): Promise<DoctorPartner[]>;
  createDoctorMatchLead(data: InsertDoctorMatchLead): Promise<DoctorMatchLead>;
  updateDoctorMatchLeadSelection(id: number, selectedDoctorId: number): Promise<DoctorMatchLead | undefined>;
  getDoctorMatchLeadById(id: number): Promise<DoctorMatchLead | undefined>;
  submitDoctorMatchRequest(id: number, data: { patientName: string; patientPhone: string; patientEmail?: string | null; preferredTime?: string | null; preferredDays?: string[] | null; preferredTimesOfDay?: string[] | null; patientNotes?: string | null; selectedDoctorId?: number | null }): Promise<DoctorMatchLead | undefined>;
  getDoctorMatchLeads(): Promise<DoctorMatchLead[]>;

  // Notification recipients & settings (admin-managed)
  getNotificationRecipients(notificationType?: string): Promise<NotificationRecipient[]>;
  createNotificationRecipient(data: InsertNotificationRecipient): Promise<NotificationRecipient>;
  updateNotificationRecipient(id: number, updates: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | undefined>;
  deleteNotificationRecipient(id: number): Promise<boolean>;
  getNotificationSetting(key: string): Promise<NotificationSetting | undefined>;
  setNotificationSetting(key: string, value: string): Promise<NotificationSetting>;

  // Doctor operations (T003)
  createDoctor(doctor: InsertPatientDoctor): Promise<PatientDoctor>;
  getDoctorById(id: number): Promise<PatientDoctor | undefined>;
  getDoctorsByPatient(userId: string): Promise<PatientDoctor[]>;
  getAllDoctors(search?: string): Promise<PatientDoctor[]>;
  updateDoctor(id: number, updates: Partial<PatientDoctor>): Promise<PatientDoctor | undefined>;
  softDeleteDoctor(id: number): Promise<PatientDoctor | undefined>;
  hardDeleteDoctor(id: number): Promise<PatientDoctor | undefined>;
  bulkCreateDoctors(doctors: InsertPatientDoctor[]): Promise<{ created: number; errors: string[] }>;

  // Conversion Leads operations
  createConversionLead(lead: InsertConversionLead): Promise<ConversionLead>;
  getConversionLead(id: number): Promise<ConversionLead | undefined>;
  getAllConversionLeads(status?: string): Promise<ConversionLead[]>;
  getPriorityConversionLeads(): Promise<ConversionLead[]>;
  updateConversionLead(id: number, updates: Partial<ConversionLead>): Promise<ConversionLead | undefined>;
  approveConversionLead(id: number, approvedBy: string): Promise<ConversionLead | undefined>;
  rejectConversionLead(id: number, reason: string): Promise<ConversionLead | undefined>;
  getConversionLeadByPhone(phone: string): Promise<ConversionLead | undefined>;
  getConversionLeadByIdempotencyKey(key: string): Promise<ConversionLead | undefined>;
  getPendingConversionLeadsCount(): Promise<number>;

  createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission>;
  getAllContactSubmissions(): Promise<ContactSubmission[]>;
  updateContactSubmissionStatus(id: number, status: string): Promise<ContactSubmission | undefined>;

  recordPageView(path: string, referrer?: string, userAgent?: string): Promise<void>;

  // Chat analytics
  recordChatEvent(eventType: string, intent?: string, pagePath?: string): Promise<void>;
  getChatEventStats(): Promise<{ eventType: string; count: number }[]>;
  getPageViewStats(): Promise<{ topPages: { path: string; views: number }[]; dailyViews: { date: string; views: number }[]; totalViews: number }>;

  // Restock notifications
  createRestockNotification(data: InsertRestockNotification): Promise<RestockNotification>;
  getRestockNotifications(status?: string): Promise<RestockNotification[]>;
  getPendingRestockNotificationsByTarget(category?: string, productId?: string): Promise<RestockNotification[]>;
  markRestockNotificationSent(id: number): Promise<void>;
  deleteRestockNotification(id: number): Promise<void>;
  clearSentRestockNotifications(): Promise<number>;

  // Test email log operations
  appendTestEmailLog(entry: InsertTestEmailLog): Promise<TestEmailLog>;
  getTestEmailLogs(limit?: number): Promise<TestEmailLog[]>;
  pruneOldTestEmailLogs(olderThanDays: number): Promise<void>;
  deleteTestEmailLog(id: number): Promise<void>;
  clearAllTestEmailLogs(): Promise<void>;

  // Sync outbox operations
  createSyncOutboxEntry(entry: InsertSyncOutboxEntry): Promise<SyncOutboxEntry>;
  getPendingSyncOutboxEntries(): Promise<SyncOutboxEntry[]>;
  getRecentSyncOutboxEntries(limit: number): Promise<SyncOutboxEntry[]>;
  markSyncOutboxDelivered(id: number): Promise<void>;
  scheduleSyncOutboxRetry(id: number, nextRetryAt: Date, reason: string): Promise<void>;
  markSyncOutboxFailed(id: number, error: string): Promise<void>;
  incrementSyncOutboxAttempt(id: number, nextRetryAt: Date, lastError?: string): Promise<void>;

  // Care Navigator — patient conditions
  getPatientConditions(userId: string): Promise<PatientCondition[]>;
  getPatientCondition(id: string): Promise<PatientCondition | undefined>;
  createPatientCondition(condition: InsertPatientCondition): Promise<PatientCondition>;
  updatePatientCondition(id: string, updates: Partial<InsertPatientCondition>): Promise<PatientCondition | undefined>;
  deletePatientCondition(id: string): Promise<void>;

  // Care Navigator — health journal
  getHealthJournalEntries(userId: string, options?: { conditionId?: string; limit?: number; offset?: number }): Promise<HealthJournalEntry[]>;
  getHealthJournalEntry(id: string): Promise<HealthJournalEntry | undefined>;
  createHealthJournalEntry(entry: InsertHealthJournalEntry): Promise<HealthJournalEntry>;

  // Care Navigator — explainer cache
  getConditionExplainerCache(conditionKey: string): Promise<{ responseJson: unknown; generatedAt: Date } | undefined>;
  upsertConditionExplainerCache(conditionKey: string, responseJson: unknown): Promise<void>;

  // ENGINE 3 — Prior Authorization
  createPriorAuthRequest(data: InsertPriorAuthorizationRequest): Promise<PriorAuthorizationRequest>;
  getPriorAuthRequest(id: string): Promise<PriorAuthorizationRequest | undefined>;
  getPriorAuthRequestBySignatureToken(tokenHash: string): Promise<PriorAuthorizationRequest | undefined>;
  /**
   * Atomically consume a signature token and write the signed letter in one
   * conditional UPDATE.  Returns the updated row or null if no row matched
   * (token expired, already consumed, or never existed — safe for concurrency).
   */
  submitSignatureAtomically(params: {
    tokenHash: string;
    signedLetterHtml: string;
    signatureReceivedAt: Date;
  }): Promise<PriorAuthorizationRequest | null>;
  getPatientPriorAuthRequests(userId: string): Promise<PriorAuthorizationRequest[]>;
  listAllPriorAuthRequests(options?: { status?: string; limit?: number; offset?: number; assignedTo?: string }): Promise<PriorAuthorizationRequest[]>;
  updatePriorAuthRequest(id: string, updates: Partial<InsertPriorAuthorizationRequest>): Promise<PriorAuthorizationRequest | undefined>;
  countPriorAuthRequestsByStatus(): Promise<{ status: string; count: number }[]>;
  getPaAnalytics(): Promise<{
    headline: {
      totalThisMonth: number; avgTatHours: number | null;
      approvalRate: number; denialRate: number; appealSuccessRate: number;
      timeSavedHours: number; aiGeneratedCount: number;
    };
    monthly: Array<{ month: string; submitted: number; approved: number; denied: number; total: number }>;
    payerBreakdown: Array<{ payer: string; total: number; approved: number; denied: number; approvalRate: number; avgTatHours: number | null; commonDenialReason: string | null }>;
    medicationBreakdown: Array<{ medicationName: string; total: number; approved: number; denied: number; approvalRate: number }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUsersByPhone(phoneNumber: string): Promise<User[]> {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const allUsers = await db.select().from(users);
    return allUsers.filter(user => {
      if (!user.phoneNumber) return false;
      const userCleanPhone = user.phoneNumber.replace(/\D/g, "");
      return userCleanPhone === cleanPhone;
    });
  }

  async getUserByPrimeRxPatientId(primeRxPatientId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.primeRxPatientId, primeRxPatientId));
    return user || undefined;
  }

  async getUserByConcordiaCareUserId(concordiaCareUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.concordiaCareUserId, concordiaCareUserId));
    return user || undefined;
  }

  async getUserByConcordiaId(concordiaId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.concordiaId, concordiaId.toUpperCase()));
    return user || undefined;
  }

  async getUsersByFamilyGroup(familyGroupId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.familyGroupId, familyGroupId));
  }

  async updateUserProfile(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  async linkConcordiaCareUser(
    patientId: string,
    concordiaCareUserId: string,
  ): Promise<"linked" | "already_linked" | "conflict" | "not_found"> {
    const existingPatient = await this.getUser(patientId);
    if (!existingPatient || existingPatient.role !== "patient") return "not_found";
    if (
      existingPatient.concordiaCareUserId &&
      existingPatient.concordiaCareUserId !== concordiaCareUserId
    ) {
      return "conflict";
    }

    const existingAppLink = await this.getUserByConcordiaCareUserId(concordiaCareUserId);
    if (existingAppLink && existingAppLink.id !== patientId) return "conflict";
    if (existingPatient.concordiaCareUserId === concordiaCareUserId) return "already_linked";

    try {
      const [linked] = await db
        .update(users)
        .set({
          concordiaCareUserId,
          usingApp: true,
          updatedAt: new Date(),
        })
        .where(and(
          eq(users.id, patientId),
          isNull(users.concordiaCareUserId),
        ))
        .returning({ id: users.id });

      if (linked) return "linked";
    } catch (error: any) {
      if (error?.code === "23505") return "conflict";
      throw error;
    }

    const current = await this.getUser(patientId);
    if (!current) return "not_found";
    return current.concordiaCareUserId === concordiaCareUserId
      ? "already_linked"
      : "conflict";
  }

  async deleteUser(id: string): Promise<void> {
    // Delete related data first (cascade manually for safety)
    await db.delete(patientDocuments).where(eq(patientDocuments.userId, id));
    await db.delete(cartItems).where(eq(cartItems.userId, id));
    await db.delete(loyaltyTransactions).where(eq(loyaltyTransactions.userId, id));
    await db.delete(notifications).where(eq(notifications.userId, id));
    // Nullify referral references to avoid FK constraint failures
    await db.update(referrals).set({ refereeUserId: null }).where(eq(referrals.refereeUserId, id));
    // Delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!user.concordiaId) {
      try {
        const cid = await assignConcordiaId(user.id);
        return { ...user, concordiaId: cid };
      } catch {
        // non-fatal; backfill will cover it
      }
    }
    return user;
  }

  // Prescription operations
  async getPrescription(id: string): Promise<Prescription | undefined> {
    const [prescription] = await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));
    return prescription || undefined;
  }

  async getPrescriptionsByUserId(userId: string): Promise<Prescription[]> {
    return await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.userId, userId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getAllPrescriptions(): Promise<Prescription[]> {
    return await db
      .select()
      .from(prescriptions)
      .orderBy(desc(prescriptions.createdAt));
  }

  async createPrescription(prescription: InsertPrescription): Promise<Prescription> {
    const [newPrescription] = await db
      .insert(prescriptions)
      .values(prescription)
      .returning();
    return newPrescription;
  }

  async getPrescriptionByRxNumber(rxNumber: string): Promise<Prescription | undefined> {
    const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.rxNumber, rxNumber));
    return rx || undefined;
  }

  async updatePrescription(id: string, updates: Partial<InsertPrescription>): Promise<Prescription | undefined> {
    const [updated] = await db
      .update(prescriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(prescriptions.id, id))
      .returning();
    return updated || undefined;
  }

  async updatePrescriptionStatus(id: string, status: string): Promise<Prescription | undefined> {
    const [updated] = await db
      .update(prescriptions)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(prescriptions.id, id))
      .returning();
    return updated || undefined;
  }

  async updatePrescriptionWorkflowStatus(id: string, workflowStatus: string): Promise<Prescription | undefined> {
    const [updated] = await db
      .update(prescriptions)
      .set({ workflowStatus: workflowStatus as any, updatedAt: new Date() })
      .where(eq(prescriptions.id, id))
      .returning();
    return updated || undefined;
  }

  async getPrescriptionsByWorkflowStatus(status: string): Promise<Prescription[]> {
    return await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.workflowStatus, status as any))
      .orderBy(desc(prescriptions.createdAt));
  }

  // Product operations
  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));
    return product || undefined;
  }

  async getProductByNdc(ndc: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.ndc, ndc));
    return product || undefined;
  }

  async getProductByExternalId(externalId: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.externalId, externalId));
    return product || undefined;
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(products.name);
  }

  async getProductsBelowThreshold(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(and(
        lte(products.stockQuantity, products.stockThreshold),
        or(eq(products.showOnWebsite, true), eq(products.showInApp, true))
      ))
      .orderBy(products.stockQuantity);
  }

  async getProductSalesAnalysis(): Promise<Array<{ productId: string; productName: string; totalSold: number; revenue: number }>> {
    const { sql } = await import('drizzle-orm');
    const { sum } = await import('drizzle-orm');
    
    const results = await db
      .select({
        productId: orderItems.productId,
        productName: orderItems.name,
        totalSold: sql<number>`CAST(SUM(${orderItems.quantity}) AS INTEGER)`,
        revenue: sql<number>`CAST(SUM(${orderItems.quantity} * ${orderItems.price}) AS DECIMAL(10,2))`,
      })
      .from(orderItems)
      .where(sql`${orderItems.productId} IS NOT NULL`)
      .groupBy(orderItems.productId, orderItems.name)
      .orderBy(sql`SUM(${orderItems.quantity}) DESC`);
    
    return results.map(r => ({
      productId: r.productId!,
      productName: r.productName,
      totalSold: Number(r.totalSold) || 0,
      revenue: Number(r.revenue) || 0,
    }));
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: string, productData: Partial<InsertProduct>): Promise<Product | undefined> {
    const patch: Partial<InsertProduct> & { updatedAt: Date; inStock?: boolean } = {
      ...productData,
      updatedAt: new Date(),
    };
    if (productData.stockQuantity !== undefined && productData.inStock === undefined) {
      patch.inStock = productData.stockQuantity > 0;
    }
    const [updated] = await db
      .update(products)
      .set(patch)
      .where(eq(products.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.productId, id));
    await db.delete(orderItems).where(eq(orderItems.productId, id));
    await db.delete(products).where(eq(products.id, id));
  }

  async decrementProductStock(id: string, quantity: number): Promise<Product | undefined> {
    const { sql, gte } = await import('drizzle-orm');
    
    // Atomically decrement stock only if sufficient quantity is available
    // This uses a conditional update to prevent overselling under concurrency
    const [updated] = await db
      .update(products)
      .set({
        stockQuantity: sql`${products.stockQuantity} - ${quantity}`,
        inStock: sql`(${products.stockQuantity} - ${quantity}) > 0`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, id),
          gte(products.stockQuantity, quantity)
        )
      )
      .returning();
    
    return updated || undefined;
  }

  async incrementProductStock(id: string, quantity: number): Promise<Product | undefined> {
    const { sql: sqlFn } = await import('drizzle-orm');
    
    const [updated] = await db
      .update(products)
      .set({
        stockQuantity: sqlFn`${products.stockQuantity} + ${quantity}`,
        inStock: sqlFn`true`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();
    
    return updated || undefined;
  }

  // Cart operations (hybrid cart - supports products and prescriptions)
  async getCartItemsByUserId(userId: string): Promise<HybridCartItem[]> {
    const items = await db
      .select()
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(prescriptions, eq(cartItems.prescriptionId, prescriptions.id))
      .where(eq(cartItems.userId, userId))
      .orderBy(desc(cartItems.createdAt));

    return items.map((item) => ({
      ...item.cart_items,
      product: item.products || null,
      prescription: item.prescriptions || null,
    }));
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    // Check if product item already exists in cart
    if (cartItem.productId) {
      const [existingItem] = await db
        .select()
        .from(cartItems)
        .where(
          and(
            eq(cartItems.userId, cartItem.userId),
            eq(cartItems.productId, cartItem.productId),
            eq(cartItems.itemType, 'product')
          )
        );

      if (existingItem) {
        // Update quantity if item already exists
        const [updated] = await db
          .update(cartItems)
          .set({
            quantity: existingItem.quantity + (cartItem.quantity || 1),
            updatedAt: new Date(),
          })
          .where(eq(cartItems.id, existingItem.id))
          .returning();
        return updated;
      }
    }
    
    // Create new cart item
    const [newItem] = await db.insert(cartItems).values({
      ...cartItem,
      itemType: cartItem.prescriptionId ? 'prescription' : 'product',
    }).returning();
    return newItem;
  }

  async addPrescriptionToCart(userId: string, prescriptionId: string, copayAmount?: string): Promise<CartItem> {
    // Check if prescription already exists in cart
    const [existingItem] = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.userId, userId),
          eq(cartItems.prescriptionId, prescriptionId),
          eq(cartItems.itemType, 'prescription')
        )
      );

    if (existingItem) {
      // Prescription already in cart - just return it (quantity always 1 for prescriptions)
      return existingItem;
    }

    // Add new prescription to cart
    const [newItem] = await db.insert(cartItems).values({
      userId,
      prescriptionId,
      itemType: 'prescription',
      quantity: 1,
      copayAmount,
    }).returning();
    return newItem;
  }

  async updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(cartItems.id, id))
      .returning();
    return updated || undefined;
  }

  async removeFromCart(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Order operations
  async getOrder(id: string): Promise<OrderWithItems | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;

    const items = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(prescriptions, eq(orderItems.prescriptionId, prescriptions.id))
      .where(eq(orderItems.orderId, id));

    return {
      ...order,
      orderItems: items.map((item) => ({
        ...item.order_items,
        product: item.products || null,
        prescription: item.prescriptions || null,
      })),
    };
  }

  async getOrdersByUserId(userId: string): Promise<OrderWithItems[]> {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));

    const ordersWithItems = await Promise.all(
      userOrders.map(async (order) => {
        const items = await db
          .select()
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .leftJoin(prescriptions, eq(orderItems.prescriptionId, prescriptions.id))
          .where(eq(orderItems.orderId, order.id));

        return {
          ...order,
          orderItems: items.map((item) => ({
            ...item.order_items,
            product: item.products || null,
            prescription: item.prescriptions || null,
          })),
        };
      })
    );

    return ordersWithItems;
  }

  async getAllOrders(): Promise<OrderWithItems[]> {
    const allOrders = await db
      .select()
      .from(orders)
      .orderBy(asc(orders.createdAt));

    const ordersWithItems = await Promise.all(
      allOrders.map(async (order) => {
        const items = await db
          .select()
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .leftJoin(prescriptions, eq(orderItems.prescriptionId, prescriptions.id))
          .where(eq(orderItems.orderId, order.id));

        let customerName = order.guestName || null;
        let customerPhone = order.guestPhone || null;
        if (order.userId && (!customerName || !customerPhone)) {
          const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
          if (user) {
            if (!customerName) customerName = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.username || null;
            if (!customerPhone) customerPhone = user.phoneNumber || null;
          }
        }

        return {
          ...order,
          customerName,
          customerPhone,
          orderItems: items.map((item) => ({
            ...item.order_items,
            product: item.products || null,
            prescription: item.prescriptions || null,
          })),
        };
      })
    );

    return ordersWithItems;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async removeSubmittedCartItem(id: string, userId: string, quantity: number): Promise<void> {
    // Do not erase new items or quantities changed in another tab.
    await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, userId), eq(cartItems.quantity, quantity)));
  }

  async createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [newItem] = await db.insert(orderItems).values(orderItem).returning();
    return newItem;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated || undefined;
  }

  async updateOrderDelivery(id: string, deliveryData: Partial<Order>): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ ...deliveryData, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated || undefined;
  }

  async getOrderByConcordiaCareId(concordiaCareOrderId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.concordiaCareOrderId, concordiaCareOrderId));
    return order || undefined;
  }

  async getOrderByOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(sql`upper(${orders.orderNumber}) = ${orderNumber.toUpperCase()}`)
      .limit(1);
    return order || undefined;
  }

  async getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.paymentIntentId, paymentIntentId)).limit(1);
    return order;
  }

  async getOrderByOrderNumberWithItems(orderNumber: string): Promise<OrderWithItems | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(sql`upper(${orders.orderNumber}) = ${orderNumber.toUpperCase()}`)
      .limit(1);
    if (!order) return undefined;

    const items = await db
      .select()
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(prescriptions, eq(orderItems.prescriptionId, prescriptions.id))
      .where(eq(orderItems.orderId, order.id));

    let customerName = order.guestName || null;
    let customerPhone = order.guestPhone || null;
    if (order.userId && (!customerName || !customerPhone)) {
      const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
      if (user) {
        if (!customerName) customerName = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.username || null;
        if (!customerPhone) customerPhone = user.phoneNumber || null;
      }
    }

    return {
      ...order,
      customerName,
      customerPhone,
      orderItems: items.map((item) => ({
        ...item.order_items,
        product: item.products || null,
        prescription: item.prescriptions || null,
      })),
    };
  }

  // Loyalty operations
  async getLoyaltyTransactionsByUserId(userId: string): Promise<LoyaltyTransaction[]> {
    return await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, userId))
      .orderBy(desc(loyaltyTransactions.createdAt));
  }

  async createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction> {
    const [newTransaction] = await db
      .insert(loyaltyTransactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  async updateUserPoints(userId: string, points: number): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ loyaltyPoints: points, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated || undefined;
  }

  // PrimeRx Sync operations
  async createSyncLog(log: InsertPrimeRxSyncLog): Promise<PrimeRxSyncLog> {
    const [syncLog] = await db
      .insert(primeRxSyncLogs)
      .values(log)
      .returning();
    return syncLog;
  }

  async getSyncLogs(limit: number = 50): Promise<PrimeRxSyncLog[]> {
    return await db
      .select()
      .from(primeRxSyncLogs)
      .orderBy(desc(primeRxSyncLogs.createdAt))
      .limit(limit);
  }

  // PrimeRx Drug Dictionary operations
  async getDrug(id: string): Promise<PrimeRxDrug | undefined> {
    const [drug] = await db.select().from(primeRxDrugs).where(eq(primeRxDrugs.id, id));
    return drug || undefined;
  }

  async getDrugByNdc(ndc: string): Promise<PrimeRxDrug | undefined> {
    const [drug] = await db.select().from(primeRxDrugs).where(eq(primeRxDrugs.ndc, ndc));
    return drug || undefined;
  }

  async getAllDrugs(): Promise<PrimeRxDrug[]> {
    return await db.select().from(primeRxDrugs).orderBy(primeRxDrugs.genericName);
  }

  async searchDrugs(query: string): Promise<PrimeRxDrug[]> {
    const { ilike, or } = await import('drizzle-orm');
    const searchPattern = `%${query}%`;
    return await db
      .select()
      .from(primeRxDrugs)
      .where(
        or(
          ilike(primeRxDrugs.genericName, searchPattern),
          ilike(primeRxDrugs.brandName, searchPattern),
          ilike(primeRxDrugs.ndc, searchPattern)
        )
      )
      .orderBy(primeRxDrugs.genericName)
      .limit(50);
  }

  async upsertDrug(drug: InsertPrimeRxDrug): Promise<PrimeRxDrug> {
    const existing = await this.getDrugByNdc(drug.ndc);
    if (existing) {
      const [updated] = await db
        .update(primeRxDrugs)
        .set({ ...drug, updatedAt: new Date(), lastSyncedAt: new Date() })
        .where(eq(primeRxDrugs.ndc, drug.ndc))
        .returning();
      return updated;
    }
    const [newDrug] = await db.insert(primeRxDrugs).values(drug).returning();
    return newDrug;
  }

  async updateDrug(id: string, drugData: Partial<InsertPrimeRxDrug>): Promise<PrimeRxDrug | undefined> {
    const [updated] = await db
      .update(primeRxDrugs)
      .set({ ...drugData, updatedAt: new Date() })
      .where(eq(primeRxDrugs.id, id))
      .returning();
    return updated || undefined;
  }

  // Update prescription with drug info from dictionary
  async updatePrescriptionWithDrugInfo(prescriptionId: string, ndc: string): Promise<Prescription | undefined> {
    const drug = await this.getDrugByNdc(ndc);
    if (!drug) return undefined;

    const [updated] = await db
      .update(prescriptions)
      .set({
        ndc: drug.ndc,
        strength: drug.strength,
        strengthUnit: drug.strengthUnit,
        drugForm: drug.drugForm,
        releaseType: drug.releaseType,
        color: drug.color,
        shape: drug.shape,
        imprint: drug.imprint,
        manufacturer: drug.manufacturer,
        genericName: drug.genericName,
        brandName: drug.brandName,
        updatedAt: new Date(),
      })
      .where(eq(prescriptions.id, prescriptionId))
      .returning();
    return updated || undefined;
  }

  // Audit Log operations
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db
      .insert(auditLogs)
      .values(log)
      .returning();
    return auditLog;
  }

  async getAuditLogs(filters: { userId?: string; actionType?: string; entityType?: string; limit?: number } = {}): Promise<AuditLog[]> {
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }
    if (filters.actionType) {
      conditions.push(eq(auditLogs.actionType, filters.actionType as any));
    }
    if (filters.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType as any));
    }

    let query = db.select().from(auditLogs);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.limit || 100);
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return newNotification;
  }

  async getNotificationsByUserId(userId: string, limit: number = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.length;
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated || undefined;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async createScheduledEventReminder(userId: string, event: import("@shared/schema").ScheduledEvent, channel: "in_app" | "email" | "sms"): Promise<Notification> {
    const { format } = await import('date-fns');
    const scheduledDate = new Date(event.scheduledDate);
    const formattedDate = format(scheduledDate, "EEEE, MMMM d 'at' h:mm a");
    
    let title = "";
    let message = "";
    
    switch (event.type) {
      case "flu_shot":
        title = "Flu Shot Appointment Reminder";
        message = `Don't forget your flu shot appointment on ${formattedDate}. Location: Concordia Pharmacy.`;
        break;
      case "order_pickup":
        title = "Order Ready for Pickup";
        message = `Your order is ready for pickup. Expected: ${formattedDate}.`;
        break;
      case "blister_pack":
        title = "Blister Pack Ready";
        message = `Your blister pack will be ready on ${formattedDate}.`;
        break;
      case "prescription_ready":
        title = "Prescription Ready";
        message = `Your prescription is ready for pickup. Please visit Concordia Pharmacy.`;
        break;
      default:
        title = "Event Reminder";
        message = `You have an event scheduled for ${formattedDate}.`;
    }

    const [notification] = await db
      .insert(notifications)
      .values({
        userId,
        type: "scheduled_event",
        channel,
        title,
        message,
        entityId: event.id,
      })
      .returning();
    
    return notification;
  }

  // Insurance Assistance operations
  async createInsuranceAssistanceRequest(request: InsertInsuranceAssistanceRequest): Promise<InsuranceAssistanceRequest> {
    const [newRequest] = await db
      .insert(insuranceAssistanceRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getAllInsuranceAssistanceRequests(): Promise<InsuranceAssistanceRequest[]> {
    return await db
      .select()
      .from(insuranceAssistanceRequests)
      .orderBy(desc(insuranceAssistanceRequests.createdAt));
  }

  async getInsuranceAssistanceRequestsByUserId(userId: string): Promise<InsuranceAssistanceRequest[]> {
    return await db
      .select()
      .from(insuranceAssistanceRequests)
      .where(eq(insuranceAssistanceRequests.userId, userId))
      .orderBy(desc(insuranceAssistanceRequests.createdAt));
  }

  async getInsuranceAssistanceRequestsByEmail(email: string): Promise<InsuranceAssistanceRequest[]> {
    return await db
      .select()
      .from(insuranceAssistanceRequests)
      .where(eq(insuranceAssistanceRequests.email, email))
      .orderBy(desc(insuranceAssistanceRequests.createdAt));
  }

  async getInsuranceAssistanceRequestByTicketNumber(ticketNumber: string): Promise<InsuranceAssistanceRequest | undefined> {
    const [request] = await db
      .select()
      .from(insuranceAssistanceRequests)
      .where(eq(insuranceAssistanceRequests.ticketNumber, ticketNumber));
    return request || undefined;
  }

  async updateInsuranceAssistanceRequestStatus(id: string, status: string): Promise<InsuranceAssistanceRequest | undefined> {
    const [updated] = await db
      .update(insuranceAssistanceRequests)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(insuranceAssistanceRequests.id, id))
      .returning();
    return updated || undefined;
  }

  // Patient Chat operations
  async getChatsByUserId(userId: string): Promise<PatientChat[]> {
    return await db
      .select()
      .from(patientChats)
      .where(eq(patientChats.userId, userId))
      .orderBy(desc(patientChats.updatedAt));
  }

  async getChatForUser(chatId: string, userId: string): Promise<PatientChat | undefined> {
    const [chat] = await db
      .select()
      .from(patientChats)
      .where(and(eq(patientChats.id, chatId), eq(patientChats.userId, userId)));
    return chat || undefined;
  }

  async getChatMessagesForUser(chatId: string, userId: string): Promise<PatientChatMessage[]> {
    return db
      .select({ id: patientChatMessages.id, chatId: patientChatMessages.chatId, role: patientChatMessages.role, content: patientChatMessages.content, createdAt: patientChatMessages.createdAt })
      .from(patientChatMessages)
      .innerJoin(patientChats, eq(patientChatMessages.chatId, patientChats.id))
      .where(and(eq(patientChatMessages.chatId, chatId), eq(patientChats.userId, userId)))
      .orderBy(patientChatMessages.createdAt);
  }

  async createChatExchangeForUser(params: {
    userId: string;
    chatId?: string;
    title: string;
    userContent: string;
    assistantContent: string;
    auditMetadata: Record<string, unknown>;
  }): Promise<{ chat: PatientChat; assistantMessage: PatientChatMessage; isNewChat: boolean } | undefined> {
    return db.transaction(async (tx) => {
      const isNewChat = !params.chatId;
      let chat: PatientChat | undefined;

      if (params.chatId) {
        // Recheck ownership inside the transaction rather than relying on any
        // route-level lookup performed before response generation.
        const [ownedChat] = await tx
          .select()
          .from(patientChats)
          .where(and(eq(patientChats.id, params.chatId), eq(patientChats.userId, params.userId)));
        chat = ownedChat;
      } else {
        const [newChat] = await tx
          .insert(patientChats)
          .values({ userId: params.userId, title: params.title })
          .returning();
        chat = newChat;
      }
      if (!chat) return undefined;

      const insertedMessages = await tx
        .insert(patientChatMessages)
        .values([
          { chatId: chat.id, role: "user", content: params.userContent },
          { chatId: chat.id, role: "assistant", content: params.assistantContent },
        ])
        .returning();
      const assistantMessage = insertedMessages[1];
      if (!assistantMessage) {
        throw new Error("Failed to persist chat exchange");
      }

      await tx
        .update(patientChats)
        .set({ updatedAt: new Date() })
        .where(and(eq(patientChats.id, chat.id), eq(patientChats.userId, params.userId)));

      await tx.insert(auditLogs).values({
        userId: params.userId,
        actionType: isNewChat ? "create" : "update",
        entityType: "chat",
        entityId: chat.id,
        newValue: params.auditMetadata,
      });

      return { chat, assistantMessage, isNewChat };
    });
  }

  async deleteChatForUser(chatId: string, userId: string, auditLog: InsertAuditLog): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Deleting the chat cascades to its messages. The audit insert is in the
      // same transaction, so a failed audit cannot leave an unaudited deletion.
      const [deleted] = await tx
        .delete(patientChats)
        .where(and(eq(patientChats.id, chatId), eq(patientChats.userId, userId)))
        .returning({ id: patientChats.id });
      if (!deleted) return false;

      await tx.insert(auditLogs).values(auditLog);
      return true;
    });
  }

  // Flu Shot Appointment operations
  async createFluShotAppointment(appointment: InsertFluShotAppointment): Promise<FluShotAppointment> {
    const [newAppointment] = await db
      .insert(fluShotAppointments)
      .values(appointment)
      .returning();
    return newAppointment;
  }

  async getAllFluShotAppointments(): Promise<FluShotAppointment[]> {
    return await db
      .select()
      .from(fluShotAppointments)
      .orderBy(desc(fluShotAppointments.scheduledDate));
  }

  async getFluShotAppointmentsByUserId(userId: string): Promise<FluShotAppointment[]> {
    return await db
      .select()
      .from(fluShotAppointments)
      .where(eq(fluShotAppointments.userId, userId))
      .orderBy(desc(fluShotAppointments.createdAt));
  }

  async getFluShotAppointmentsByEmail(email: string): Promise<FluShotAppointment[]> {
    return await db
      .select()
      .from(fluShotAppointments)
      .where(eq(fluShotAppointments.email, email))
      .orderBy(desc(fluShotAppointments.createdAt));
  }

  async getFluShotAppointmentByTicketNumber(ticketNumber: string): Promise<FluShotAppointment | undefined> {
    const [appointment] = await db
      .select()
      .from(fluShotAppointments)
      .where(eq(fluShotAppointments.ticketNumber, ticketNumber));
    return appointment || undefined;
  }

  async updateFluShotAppointmentStatus(id: number, status: string): Promise<FluShotAppointment | undefined> {
    const [updated] = await db
      .update(fluShotAppointments)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(fluShotAppointments.id, id))
      .returning();
    return updated || undefined;
  }

  async getPatientScheduledEvents(userId: string, phoneNumber?: string): Promise<import("@shared/schema").ScheduledEvent[]> {
    const { gte, or } = await import('drizzle-orm');
    const now = new Date();
    const events: import("@shared/schema").ScheduledEvent[] = [];

    // Get upcoming flu shot appointments for this patient
    const fluShotQuery = phoneNumber
      ? or(eq(fluShotAppointments.userId, userId), eq(fluShotAppointments.phoneNumber, phoneNumber))
      : eq(fluShotAppointments.userId, userId);
    
    const upcomingFluShots = await db
      .select()
      .from(fluShotAppointments)
      .where(and(fluShotQuery, gte(fluShotAppointments.scheduledDate, now)));

    for (const appointment of upcomingFluShots) {
      events.push({
        id: `flu-${appointment.id}`,
        type: "flu_shot",
        title: "Flu Shot Appointment",
        description: `${appointment.fluShotType} scheduled at ${appointment.scheduledTime}`,
        scheduledDate: appointment.scheduledDate,
        scheduledTime: appointment.scheduledTime,
        status: appointment.status,
        metadata: {
          ticketNumber: appointment.ticketNumber,
          location: "Concordia Pharmacy",
        },
      });
    }

    // Get upcoming order pickups/deliveries for this patient
    const upcomingOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          or(eq(orders.status, "processing"), eq(orders.status, "pending")),
          gte(orders.estimatedDelivery, now)
        )
      );

    for (const order of upcomingOrders) {
      if (order.estimatedDelivery) {
        events.push({
          id: `order-${order.id}`,
          type: "order_pickup",
          title: order.deliveryStatus === "not_assigned" ? "Order Ready for Pickup" : "Delivery Scheduled",
          description: `Order #${order.orderNumber} - ${order.type === "prescription" ? "Prescription" : order.type === "otc" ? "OTC" : "Mixed"} order`,
          scheduledDate: order.estimatedDelivery,
          status: order.deliveryStatus || "pending",
          metadata: {
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber,
            courierPartner: order.courierPartner,
          },
        });
      }
    }

    // Get blister pack due dates for this patient (by phone number match)
    if (phoneNumber) {
      const blisterPacks = await db
        .select()
        .from(blisterPackPatients)
        .where(
          and(
            eq(blisterPackPatients.phoneNumber, phoneNumber),
            eq(blisterPackPatients.status, "active")
          )
        );

      for (const pack of blisterPacks) {
        if (pack.nextPackDate) {
          events.push({
            id: `blister-${pack.id}`,
            type: "blister_pack",
            title: "Blister Pack Ready",
            description: `Your ${pack.blisterPackType} blister pack will be ready`,
            scheduledDate: pack.nextPackDate,
            status: "scheduled",
            metadata: {
              deliveryPreference: pack.deliveryPreference,
              deliveryDay: pack.deliveryDay,
            },
          });
        }
      }
    }

    // Sort events by scheduled date
    events.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
    
    return events;
  }

  // Delivery chat operations
  async getDeliveryChatsByOrderId(orderId: string): Promise<DeliveryChat[]> {
    return await db
      .select()
      .from(deliveryChats)
      .where(eq(deliveryChats.orderId, orderId))
      .orderBy(deliveryChats.createdAt);
  }

  async createDeliveryChatMessage(orderId: string, senderType: string, message: string): Promise<DeliveryChat> {
    const [newMessage] = await db
      .insert(deliveryChats)
      .values({
        orderId,
        senderType: senderType as any,
        message,
      })
      .returning();
    return newMessage;
  }

  // OTP operations
  async createOtpCode(phoneNumber: string, code: string, expiresAt: Date): Promise<OtpCode> {
    const [otp] = await db
      .insert(otpCodes)
      .values({ phoneNumber, code, expiresAt })
      .returning();
    return otp;
  }

  async getValidOtpCode(phoneNumber: string, code: string): Promise<OtpCode | undefined> {
    const { gt } = await import('drizzle-orm');
    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phoneNumber, phoneNumber),
          eq(otpCodes.code, code),
          eq(otpCodes.verified, false),
          gt(otpCodes.expiresAt, new Date())
        )
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    return otp || undefined;
  }

  async incrementOtpAttempts(id: number): Promise<void> {
    const { sql } = await import('drizzle-orm');
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, id));
  }

  async markOtpVerified(id: number): Promise<void> {
    await db
      .update(otpCodes)
      .set({ verified: true })
      .where(eq(otpCodes.id, id));
  }

  async cleanupExpiredOtps(): Promise<void> {
    const { lt } = await import('drizzle-orm');
    await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date()));
  }

  // Username/password auth
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByClerkId(clerkId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId));
    return user || undefined;
  }

  async upsertUserByClerkId(
    clerkId: string,
    data: { email?: string; firstName?: string; lastName?: string; profileImageUrl?: string },
  ): Promise<User> {
    // Email is a contact attribute, not proof of ownership of a legacy
    // patient record. A collision requires explicit identity review, even
    // when the existing row has no Clerk ID.
    if (data.email) {
      const existing = await this.getUserByEmail(data.email);
      assertEmailDoesNotClaimOtherClerkUser(existing, clerkId);
    }

    // Create or update the record keyed by clerkId
    let user: User;
    try {
      [user] = await db
        .insert(users)
        .values({ clerkId, ...data, role: "patient" })
        .onConflictDoUpdate({
          target: users.clerkId,
          set: { ...data, updatedAt: new Date() },
        })
        .returning();
    } catch (error: any) {
      // A concurrent email claim must also fail closed.
      if (data.email && error?.code === "23505") {
        throw new IdentityLinkRequiredError();
      }
      throw error;
    }

    if (!user.concordiaId) {
      try {
        const { assignConcordiaId } = await import("./concordiaId");
        const cid = await assignConcordiaId(user.id);
        return { ...user, concordiaId: cid };
      } catch {
        // non-fatal
      }
    }
    return user;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.referralCode, referralCode));
    return user || undefined;
  }

  // Analytics operations
  async getAnalyticsSummary() {
    const [ordersResult, prescriptionsResult, usersResult, productsResult] = await Promise.all([
      db.select().from(orders),
      db.select().from(prescriptions),
      db.select().from(users),
      db.select().from(products),
    ]);

    const totalRevenue = ordersResult.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const pendingOrders = ordersResult.filter((o) => o.status === "pending").length;
    const pendingRefills = prescriptionsResult.filter((p) => p.status === "pending_refill").length;
    const lowStockProducts = productsResult.filter((p) => p.stockQuantity < 10).length;

    const bySource: Record<string, { revenue: number; orders: number }> = {};
    for (const order of ordersResult) {
      const src = (order as any).source || "website";
      if (!bySource[src]) bySource[src] = { revenue: 0, orders: 0 };
      bySource[src].revenue += parseFloat(order.total);
      bySource[src].orders += 1;
    }

    return {
      totalRevenue,
      totalOrders: ordersResult.length,
      totalPrescriptions: prescriptionsResult.length,
      totalUsers: usersResult.length,
      pendingOrders,
      pendingRefills,
      lowStockProducts,
      bySource,
    };
  }

  async getPharmFlowInsights() {
    const allOrders = await db.select().from(orders);

    const completed = allOrders.filter(o => o.status === "completed").length;
    const pending = allOrders.filter(o => o.status === "pending").length;
    const processingCount = allOrders.filter(o => o.status === "processing").length;
    const cancelled = allOrders.filter(o => o.status === "cancelled").length;

    const deliveryMethodCounts: Record<string, number> = {};
    const courierData: Record<string, { count: number; deliveryHours: number[]; delivered: number; failed: number }> = {};
    let pickupCount = 0;
    let deliveryCount = 0;

    for (const order of allOrders) {
      const method = (order.deliveryMethod || "pickup").toLowerCase();
      deliveryMethodCounts[method] = (deliveryMethodCounts[method] || 0) + 1;

      if (method === "pickup") {
        pickupCount++;
      } else {
        deliveryCount++;
      }

      if (order.courierPartner) {
        const courier = order.courierPartner;
        if (!courierData[courier]) courierData[courier] = { count: 0, deliveryHours: [], delivered: 0, failed: 0 };
        courierData[courier].count++;
        if (order.deliveryStatus === "delivered") {
          courierData[courier].delivered++;
          if (order.actualDelivery) {
            const hours = (new Date(order.actualDelivery).getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
            if (hours > 0) courierData[courier].deliveryHours.push(hours);
          }
        } else if (order.deliveryStatus === "failed" || order.deliveryStatus === "returned") {
          courierData[courier].failed++;
        }
      }
    }

    const total = allOrders.length || 1;
    const deliveryTotal = deliveryCount || 1;

    const deliveryMethodBreakdown = Object.entries(deliveryMethodCounts).map(([method, count]) => ({
      method,
      count,
      percentage: Math.round((count / total) * 100),
    }));

    const courierBreakdown = Object.entries(courierData).map(([courier, data]) => ({
      courier,
      count: data.count,
      percentage: Math.round((data.count / deliveryTotal) * 100),
      avgDeliveryHours: data.deliveryHours.length > 0
        ? Math.round((data.deliveryHours.reduce((a, b) => a + b, 0) / data.deliveryHours.length) * 10) / 10
        : null,
      successRate: (data.delivered + data.failed) > 0
        ? Math.round((data.delivered / (data.delivered + data.failed)) * 100)
        : null,
    }));

    const totalOrders = allOrders.length || 1;
    return {
      processing: { total: allOrders.length, completed, pending, processing: processingCount, cancelled },
      deliveryMethodBreakdown,
      courierBreakdown,
      pickupVsDeliveryRate: {
        pickup: pickupCount,
        delivery: deliveryCount,
        pickupPercent: Math.round((pickupCount / totalOrders) * 100),
        deliveryPercent: Math.round((deliveryCount / totalOrders) * 100),
      },
    };
  }

  async getPatientInsights(userId: string) {
    const patientOrders = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));

    const totalOrders = patientOrders.length;
    const completedOrders = patientOrders.filter(o => o.status === "completed");
    const totalSpending = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);

    let monthlyAvgSpending = 0;
    if (completedOrders.length > 0) {
      const oldestOrder = patientOrders[patientOrders.length - 1];
      const monthsActive = Math.max(1, Math.ceil(
        (Date.now() - new Date(oldestOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
      ));
      monthlyAvgSpending = Math.round((totalSpending / monthsActive) * 100) / 100;
    }

    const typeCounts: Record<string, number> = {};
    const methodCounts: Record<string, number> = {};
    const courierCounts: Record<string, number> = {};

    for (const order of patientOrders) {
      typeCounts[order.type] = (typeCounts[order.type] || 0) + 1;
      const method = (order.deliveryMethod || "pickup").toLowerCase();
      methodCounts[method] = (methodCounts[method] || 0) + 1;
      if (order.courierPartner) {
        courierCounts[order.courierPartner] = (courierCounts[order.courierPartner] || 0) + 1;
      }
    }

    const safeTotal = totalOrders || 1;
    const deliveryOnlyTotal = Object.entries(courierCounts).reduce((s, [, c]) => s + c, 0) || 1;

    const orderTypeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({
      type, count, percentage: Math.round((count / safeTotal) * 100),
    }));

    const deliveryMethodBreakdown = Object.entries(methodCounts).map(([method, count]) => ({
      method, count, percentage: Math.round((count / safeTotal) * 100),
    }));

    const courierBreakdown = Object.entries(courierCounts).map(([courier, count]) => ({
      courier, count, percentage: Math.round((count / deliveryOnlyTotal) * 100),
    }));

    let predictedDeliveryPreference: string | null = null;
    if (totalOrders >= 3) {
      const recentOrders = patientOrders.slice(0, Math.min(10, patientOrders.length));
      const recentMethodCounts: Record<string, number> = {};
      for (const o of recentOrders) {
        const m = (o.deliveryMethod || "pickup").toLowerCase();
        const label = m === "pickup" ? "Pickup" : (o.courierPartner || "Delivery");
        recentMethodCounts[label] = (recentMethodCounts[label] || 0) + 1;
      }
      let maxMethod = "";
      let maxCount = 0;
      for (const [method, count] of Object.entries(recentMethodCounts)) {
        if (count > maxCount) { maxMethod = method; maxCount = count; }
      }
      const pct = Math.round((maxCount / recentOrders.length) * 100);
      predictedDeliveryPreference = `${maxMethod} (${pct}%)`;
    }

    const recentOrdersList = patientOrders.slice(0, 5).map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      type: o.type,
      total: o.total,
      deliveryMethod: o.deliveryMethod,
      courierPartner: o.courierPartner,
      status: o.status,
      createdAt: o.createdAt,
    }));

    return {
      totalOrders,
      totalSpending: Math.round(totalSpending * 100) / 100,
      monthlyAvgSpending,
      orderTypeBreakdown,
      deliveryMethodBreakdown,
      courierBreakdown,
      predictedDeliveryPreference,
      recentOrders: recentOrdersList,
    };
  }

  // Blog operations
  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const baseSlug = post.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const [newPost] = await db.insert(blogPosts).values(post).returning();
    const slug = `${newPost.id}-${baseSlug}`;
    const [updated] = await db.update(blogPosts).set({ slug }).where(eq(blogPosts.id, newPost.id)).returning();
    return updated;
  }

  async updateBlogPost(id: number, updates: { title?: string; content?: string; category?: string; imageUrl?: string | null; pinnedToHero?: boolean }): Promise<BlogPost | undefined> {
    const [updated] = await db
      .update(blogPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || undefined;
  }

  async getPinnedBlogPostCount(): Promise<number> {
    const { count } = await import('drizzle-orm');
    const [row] = await db.select({ count: count() }).from(blogPosts).where(eq(blogPosts.pinnedToHero, true));
    return Number(row?.count ?? 0);
  }

  async getPinnedPublishedBlogPosts(): Promise<BlogPost[]> {
    return await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.isPublished, true), eq(blogPosts.pinnedToHero, true)))
      .orderBy(desc(blogPosts.publishedAt));
  }

  async getAllBlogPosts(): Promise<BlogPost[]> {
    return await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
  }

  async getAllPublishedBlogPosts(): Promise<BlogPost[]> {
    const now = new Date();
    return await db
      .select()
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.isPublished, true),
          or(isNull(blogPosts.expiresAt), gt(blogPosts.expiresAt, now))
        )
      )
      .orderBy(desc(blogPosts.publishedAt));
  }

  async getPublishedBlogPostsPaginated(page: number, limit: number): Promise<{ posts: BlogPost[]; total: number }> {
    const { count } = await import('drizzle-orm');
    const now = new Date();
    const condition = and(
      eq(blogPosts.isPublished, true),
      or(isNull(blogPosts.expiresAt), gt(blogPosts.expiresAt, now))
    );
    const [countResult] = await db.select({ count: count() }).from(blogPosts).where(condition);
    const total = Number(countResult?.count ?? 0);
    const posts = await db
      .select()
      .from(blogPosts)
      .where(condition)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return { posts, total };
  }

  async getBlogPost(id: number): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return post || undefined;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    return post || undefined;
  }

  async likeBlogPost(id: number): Promise<BlogPost | undefined> {
    const { sql } = await import('drizzle-orm');
    const [updated] = await db
      .update(blogPosts)
      .set({ likes: sql`${blogPosts.likes} + 1` })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || undefined;
  }

  async publishBlogPost(id: number): Promise<BlogPost | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks from now
    const [updated] = await db
      .update(blogPosts)
      .set({
        isPublished: true,
        publishedAt: now,
        expiresAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteExpiredBlogPosts(): Promise<number> {
    const { lt } = await import('drizzle-orm');
    const now = new Date();
    const result = await db
      .delete(blogPosts)
      .where(lt(blogPosts.expiresAt, now))
      .returning();
    return result.length;
  }

  async unpublishBlogPost(id: number): Promise<BlogPost | undefined> {
    const now = new Date();
    const [updated] = await db
      .update(blogPosts)
      .set({
        isPublished: false,
        updatedAt: now,
      })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || undefined;
  }

  // Pharmacy Alerts operations
  async createPharmacyAlert(alert: InsertPharmacyAlert): Promise<PharmacyAlert> {
    const [newAlert] = await db.insert(pharmacyAlerts).values(alert).returning();
    return newAlert;
  }

  async getActivePharmacyAlerts(): Promise<PharmacyAlert[]> {
    const now = new Date();
    return await db
      .select()
      .from(pharmacyAlerts)
      .where(
        and(
          eq(pharmacyAlerts.isActive, true),
          or(
            isNull(pharmacyAlerts.expiresAt),
            gt(pharmacyAlerts.expiresAt, now)
          )
        )
      )
      .orderBy(desc(pharmacyAlerts.createdAt));
  }

  async deactivatePharmacyAlert(id: number): Promise<PharmacyAlert | undefined> {
    const [updated] = await db
      .update(pharmacyAlerts)
      .set({ isActive: false })
      .where(eq(pharmacyAlerts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteExpiredAlerts(): Promise<number> {
    const { lt, and: andOp } = await import('drizzle-orm');
    const now = new Date();
    const result = await db
      .delete(pharmacyAlerts)
      .where(
        andOp(
          lt(pharmacyAlerts.expiresAt, now),
          eq(pharmacyAlerts.isActive, false)
        )
      )
      .returning();
    return result.length;
  }

  // Patient Documents operations
  async createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocument> {
    const [newDoc] = await db.insert(patientDocuments).values(doc).returning();
    return newDoc;
  }

  async getPatientDocuments(userId: string): Promise<PatientDocument[]> {
    return await db
      .select()
      .from(patientDocuments)
      .where(eq(patientDocuments.userId, userId))
      .orderBy(desc(patientDocuments.uploadedAt));
  }

  async getPatientDocument(id: number): Promise<PatientDocument | undefined> {
    const [doc] = await db.select().from(patientDocuments).where(eq(patientDocuments.id, id));
    return doc || undefined;
  }

  async deletePatientDocument(id: number): Promise<void> {
    await db.delete(patientDocuments).where(eq(patientDocuments.id, id));
  }

  async updateBlogPostImage(id: number, imageUrl: string): Promise<BlogPost | undefined> {
    const [updated] = await db
      .update(blogPosts)
      .set({ imageUrl })
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || undefined;
  }

  // Vendor operations
  async getAllVendors(): Promise<Vendor[]> {
    return await db.select().from(vendors).orderBy(vendors.name);
  }

  async getVendor(id: number): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor || undefined;
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [newVendor] = await db.insert(vendors).values(vendor).returning();
    return newVendor;
  }

  async updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor | undefined> {
    const [updated] = await db
      .update(vendors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning();
    return updated || undefined;
  }

  // Vendor prices operations
  async getVendorPricesByNdc(ndc: string): Promise<VendorPrice[]> {
    return await db
      .select()
      .from(vendorPrices)
      .where(eq(vendorPrices.ndc, ndc))
      .orderBy(vendorPrices.price);
  }

  async upsertVendorPrice(price: InsertVendorPrice): Promise<VendorPrice> {
    const [existing] = await db
      .select()
      .from(vendorPrices)
      .where(and(
        eq(vendorPrices.ndc, price.ndc),
        eq(vendorPrices.vendorCode, price.vendorCode)
      ));
    
    if (existing) {
      const [updated] = await db
        .update(vendorPrices)
        .set({ ...price, lastUpdated: new Date() })
        .where(eq(vendorPrices.id, existing.id))
        .returning();
      return updated;
    } else {
      const [newPrice] = await db.insert(vendorPrices).values(price).returning();
      return newPrice;
    }
  }

  // Reorder items operations
  async getLowStockProducts(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(and(
        lte(products.stockQuantity, products.stockThreshold),
        or(eq(products.showOnWebsite, true), eq(products.showInApp, true))
      ))
      .orderBy(products.stockQuantity);
  }

  async getReorderItems(): Promise<ReorderItem[]> {
    return await db
      .select()
      .from(reorderItems)
      .orderBy(desc(reorderItems.createdAt));
  }

  async createReorderItem(item: InsertReorderItem): Promise<ReorderItem> {
    const [newItem] = await db.insert(reorderItems).values(item).returning();
    return newItem;
  }

  async updateReorderItem(id: number, updates: Partial<ReorderItem>): Promise<ReorderItem | undefined> {
    const [updated] = await db
      .update(reorderItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(reorderItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteReorderItem(id: number): Promise<void> {
    await db.delete(reorderItems).where(eq(reorderItems.id, id));
  }

  // Blister Pack Patient operations
  async getAllBlisterPackPatients(): Promise<BlisterPackPatient[]> {
    return await db
      .select()
      .from(blisterPackPatients)
      .orderBy(desc(blisterPackPatients.createdAt));
  }

  async getBlisterPackPatient(id: number): Promise<BlisterPackPatient | undefined> {
    const [patient] = await db
      .select()
      .from(blisterPackPatients)
      .where(eq(blisterPackPatients.id, id));
    return patient || undefined;
  }

  async getBlisterPackPatientByPhone(phone: string): Promise<BlisterPackPatient | undefined> {
    const cleanPhone = phone.replace(/\D/g, "");
    const allPatients = await db.select().from(blisterPackPatients);
    const patient = allPatients.find(p => {
      if (!p.phoneNumber) return false;
      const patientCleanPhone = p.phoneNumber.replace(/\D/g, "");
      return patientCleanPhone === cleanPhone;
    });
    return patient || undefined;
  }

  async getBlisterPackPatientByUserId(userId: string): Promise<BlisterPackPatient | undefined> {
    const [patient] = await db.select().from(blisterPackPatients).where(eq(blisterPackPatients.linkedUserId, userId));
    return patient || undefined;
  }

  async createBlisterPackPatient(patient: InsertBlisterPackPatient): Promise<BlisterPackPatient> {
    const [newPatient] = await db
      .insert(blisterPackPatients)
      .values(patient)
      .returning();
    return newPatient;
  }

  async updateBlisterPackPatient(id: number, updates: Partial<BlisterPackPatient>): Promise<BlisterPackPatient | undefined> {
    const [updated] = await db
      .update(blisterPackPatients)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blisterPackPatients.id, id))
      .returning();
    return updated || undefined;
  }

  async updateBlisterPackSyncMeta(id: number, meta: { lastSyncedToApp?: Date; lastAppSync?: Date; concordiaCareBlisterPackId?: string }): Promise<void> {
    const setData: any = {};
    if (meta.lastSyncedToApp) setData.lastSyncedToApp = meta.lastSyncedToApp;
    if (meta.lastAppSync) setData.lastAppSync = meta.lastAppSync;
    if (meta.concordiaCareBlisterPackId) setData.concordiaCareBlisterPackId = meta.concordiaCareBlisterPackId;
    if (Object.keys(setData).length === 0) return;
    await db.update(blisterPackPatients).set(setData).where(eq(blisterPackPatients.id, id));
  }

  async deleteBlisterPackPatient(id: number): Promise<void> {
    // Delete medication history first
    await db.delete(blisterPackMedicationHistory).where(eq(blisterPackMedicationHistory.patientId, id));
    await db.delete(blisterPackPatients).where(eq(blisterPackPatients.id, id));
  }

  // Blister Pack Medication History
  async getBlisterPackMedicationHistory(patientId: number): Promise<BlisterPackMedicationHistory[]> {
    return await db
      .select()
      .from(blisterPackMedicationHistory)
      .where(eq(blisterPackMedicationHistory.patientId, patientId))
      .orderBy(desc(blisterPackMedicationHistory.createdAt));
  }

  async addBlisterPackMedicationHistory(entry: InsertBlisterPackMedicationHistory): Promise<BlisterPackMedicationHistory> {
    const [newEntry] = await db
      .insert(blisterPackMedicationHistory)
      .values(entry)
      .returning();
    return newEntry;
  }

  // Patient Communications operations
  async createPatientCommunication(comm: InsertPatientCommunication): Promise<PatientCommunication> {
    const [newComm] = await db
      .insert(patientCommunications)
      .values(comm)
      .returning();
    return newComm;
  }

  async getPatientCommunication(id: number): Promise<PatientCommunication | undefined> {
    const [comm] = await db.select().from(patientCommunications).where(eq(patientCommunications.id, id));
    return comm || undefined;
  }

  async getPatientCommunications(blisterPatientId: number): Promise<PatientCommunication[]> {
    return await db
      .select()
      .from(patientCommunications)
      .where(eq(patientCommunications.blisterPatientId, blisterPatientId))
      .orderBy(desc(patientCommunications.createdAt));
  }

  async getPatientCommunicationsFiltered(filters: { userId?: string; blisterPatientId?: number; direction?: string }): Promise<PatientCommunication[]> {
    let query = db.select().from(patientCommunications);
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(eq(patientCommunications.userId, filters.userId));
    }
    if (filters.blisterPatientId) {
      conditions.push(eq(patientCommunications.blisterPatientId, filters.blisterPatientId));
    }
    if (filters.direction) {
      conditions.push(eq(patientCommunications.direction, filters.direction as any));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(patientCommunications.createdAt));
  }

  async updatePatientCommunication(id: number, updates: Partial<PatientCommunication>): Promise<PatientCommunication | undefined> {
    const [updated] = await db
      .update(patientCommunications)
      .set(updates as any)
      .where(eq(patientCommunications.id, id))
      .returning();
    return updated || undefined;
  }

  async getUnreadCommunications(filters: { userId?: string; blisterPatientId?: number }): Promise<PatientCommunication[]> {
    const conditions = [eq(patientCommunications.status, "unread")];
    
    if (filters.userId) {
      conditions.push(eq(patientCommunications.userId, filters.userId));
    }
    if (filters.blisterPatientId) {
      conditions.push(eq(patientCommunications.blisterPatientId, filters.blisterPatientId));
    }
    
    return await db
      .select()
      .from(patientCommunications)
      .where(and(...conditions))
      .orderBy(desc(patientCommunications.createdAt));
  }

  async markCommunicationRead(id: number): Promise<PatientCommunication | undefined> {
    const [updated] = await db
      .update(patientCommunications)
      .set({ status: "read", readAt: new Date() })
      .where(eq(patientCommunications.id, id))
      .returning();
    return updated || undefined;
  }

  async markCommunicationAcknowledged(id: number, acknowledgedBy: string): Promise<PatientCommunication | undefined> {
    const [updated] = await db
      .update(patientCommunications)
      .set({ status: "acknowledged", acknowledgedBy, acknowledgedAt: new Date() })
      .where(eq(patientCommunications.id, id))
      .returning();
    return updated || undefined;
  }

  async markCommunicationResolved(id: number, resolvedBy: string): Promise<PatientCommunication | undefined> {
    const [updated] = await db
      .update(patientCommunications)
      .set({ status: "resolved", resolvedBy, resolvedAt: new Date() })
      .where(eq(patientCommunications.id, id))
      .returning();
    return updated || undefined;
  }

  // Prescription Transfer Request operations
  async createTransferRequest(request: InsertPrescriptionTransferRequest): Promise<PrescriptionTransferRequest> {
    const [newRequest] = await db
      .insert(prescriptionTransferRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getAllTransferRequests(): Promise<PrescriptionTransferRequest[]> {
    return await db
      .select()
      .from(prescriptionTransferRequests)
      .orderBy(desc(prescriptionTransferRequests.createdAt));
  }

  async getTransferRequest(id: number): Promise<PrescriptionTransferRequest | undefined> {
    const [request] = await db
      .select()
      .from(prescriptionTransferRequests)
      .where(eq(prescriptionTransferRequests.id, id));
    return request || undefined;
  }

  async getTransferRequestsByUserId(userId: string): Promise<PrescriptionTransferRequest[]> {
    return await db
      .select()
      .from(prescriptionTransferRequests)
      .where(eq(prescriptionTransferRequests.userId, userId))
      .orderBy(desc(prescriptionTransferRequests.createdAt));
  }

  async updateTransferRequestStatus(id: number, status: string, statusMessage?: string, notes?: string): Promise<PrescriptionTransferRequest | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (statusMessage !== undefined) {
      updates.statusMessage = statusMessage;
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }
    if (status === "transfer_successful") {
      updates.completedAt = new Date();
    }
    
    const [updated] = await db
      .update(prescriptionTransferRequests)
      .set(updates)
      .where(eq(prescriptionTransferRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async markTransferRewardGranted(id: number): Promise<PrescriptionTransferRequest | undefined> {
    const [updated] = await db
      .update(prescriptionTransferRequests)
      .set({ rewardPointsGranted: true, updatedAt: new Date() })
      .where(eq(prescriptionTransferRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTransferRequest(id: number): Promise<void> {
    await db.delete(prescriptionTransferRequests).where(eq(prescriptionTransferRequests.id, id));
  }

  // Home Attendant operations
  async createHomeAttendant(attendant: InsertHomeAttendant): Promise<HomeAttendant> {
    const [newAttendant] = await db
      .insert(homeAttendants)
      .values(attendant)
      .returning();
    return newAttendant;
  }

  async getHomeAttendant(id: number): Promise<HomeAttendant | undefined> {
    const [attendant] = await db
      .select()
      .from(homeAttendants)
      .where(eq(homeAttendants.id, id));
    return attendant || undefined;
  }

  async getHomeAttendantByPhone(phone: string): Promise<HomeAttendant | undefined> {
    const cleanPhone = phone.replace(/\D/g, "");
    const allAttendants = await db.select().from(homeAttendants);
    const found = allAttendants.find(a => a.phoneNumber.replace(/\D/g, "") === cleanPhone);
    return found || undefined;
  }

  async getHomeAttendantByUsername(username: string): Promise<HomeAttendant | undefined> {
    const [attendant] = await db
      .select()
      .from(homeAttendants)
      .where(eq(homeAttendants.username, username));
    return attendant || undefined;
  }

  async getAllHomeAttendants(): Promise<HomeAttendant[]> {
    return await db
      .select()
      .from(homeAttendants)
      .orderBy(desc(homeAttendants.createdAt));
  }

  async updateHomeAttendant(id: number, updates: Partial<HomeAttendant>): Promise<HomeAttendant | undefined> {
    const [updated] = await db
      .update(homeAttendants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(homeAttendants.id, id))
      .returning();
    return updated || undefined;
  }

  async updateAttendantLastLogin(id: number): Promise<HomeAttendant | undefined> {
    const [updated] = await db
      .update(homeAttendants)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(homeAttendants.id, id))
      .returning();
    return updated || undefined;
  }

  // Patient-Attendant Link operations
  async linkPatientToAttendant(link: InsertPatientAttendant): Promise<PatientAttendant> {
    const [newLink] = await db
      .insert(patientAttendants)
      .values(link)
      .returning();
    return newLink;
  }

  async getPatientAttendant(patientId: string): Promise<(PatientAttendant & { attendant: HomeAttendant }) | undefined> {
    const [link] = await db
      .select()
      .from(patientAttendants)
      .where(and(
        eq(patientAttendants.patientId, patientId),
        eq(patientAttendants.isActive, true)
      ));
    
    if (!link) return undefined;
    
    const [attendant] = await db
      .select()
      .from(homeAttendants)
      .where(eq(homeAttendants.id, link.attendantId));
    
    if (!attendant) return undefined;
    
    return { ...link, attendant };
  }

  async getAttendantPatients(attendantId: number): Promise<(PatientAttendant & { patient: User })[]> {
    const links = await db
      .select()
      .from(patientAttendants)
      .where(and(
        eq(patientAttendants.attendantId, attendantId),
        eq(patientAttendants.isActive, true)
      ));
    
    const result: (PatientAttendant & { patient: User })[] = [];
    
    for (const link of links) {
      const [patient] = await db
        .select()
        .from(users)
        .where(eq(users.id, link.patientId));
      
      if (patient) {
        result.push({ ...link, patient });
      }
    }
    
    return result;
  }

  async updatePatientAttendantLink(id: number, updates: Partial<PatientAttendant>): Promise<PatientAttendant | undefined> {
    const [updated] = await db
      .update(patientAttendants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(patientAttendants.id, id))
      .returning();
    return updated || undefined;
  }

  async revokePatientAttendantLink(patientId: string): Promise<void> {
    await db
      .update(patientAttendants)
      .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(patientAttendants.patientId, patientId));
  }

  // Attendant Audit Log operations
  async createAttendantAuditLog(log: InsertAttendantAuditLog): Promise<AttendantAuditLog> {
    const [newLog] = await db
      .insert(attendantAuditLog)
      .values(log)
      .returning();
    return newLog;
  }

  async getAttendantAuditLogs(filters: { attendantId?: number; patientId?: string; limit?: number }): Promise<AttendantAuditLog[]> {
    const conditions = [];
    if (filters.attendantId) {
      conditions.push(eq(attendantAuditLog.attendantId, filters.attendantId));
    }
    if (filters.patientId) {
      conditions.push(eq(attendantAuditLog.patientId, filters.patientId));
    }
    
    let query = db.select().from(attendantAuditLog);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const results = await query.orderBy(desc(attendantAuditLog.createdAt));
    return filters.limit ? results.slice(0, filters.limit) : results;
  }

  // Urgent Refill Request operations
  async createUrgentRefillRequest(request: InsertUrgentRefillRequest): Promise<UrgentRefillRequest> {
    const [newRequest] = await db
      .insert(urgentRefillRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getAllUrgentRefillRequests(): Promise<(UrgentRefillRequest & { prescription?: Prescription; patient?: User })[]> {
    const requests = await db
      .select()
      .from(urgentRefillRequests)
      .orderBy(desc(urgentRefillRequests.createdAt));
    
    const result: (UrgentRefillRequest & { prescription?: Prescription; patient?: User })[] = [];
    
    for (const request of requests) {
      const [prescription] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, request.prescriptionId));
      
      const [patient] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.patientId));
      
      result.push({
        ...request,
        prescription: prescription || undefined,
        patient: patient || undefined,
      });
    }
    
    return result;
  }

  async getPendingUrgentRefillRequests(): Promise<(UrgentRefillRequest & { prescription?: Prescription; patient?: User })[]> {
    const requests = await db
      .select()
      .from(urgentRefillRequests)
      .where(eq(urgentRefillRequests.status, "pending"))
      .orderBy(desc(urgentRefillRequests.createdAt));
    
    const result: (UrgentRefillRequest & { prescription?: Prescription; patient?: User })[] = [];
    
    for (const request of requests) {
      const [prescription] = await db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, request.prescriptionId));
      
      const [patient] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.patientId));
      
      result.push({
        ...request,
        prescription: prescription || undefined,
        patient: patient || undefined,
      });
    }
    
    return result;
  }

  async updateUrgentRefillRequestStatus(id: string, status: string, processedBy?: string, adminNotes?: string): Promise<UrgentRefillRequest | undefined> {
    const updateData: any = {
      status: status as any,
      processedAt: new Date(),
    };
    if (processedBy) updateData.processedBy = processedBy;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    
    const [updated] = await db
      .update(urgentRefillRequests)
      .set(updateData)
      .where(eq(urgentRefillRequests.id, id))
      .returning();
    return updated || undefined;
  }

  // Staff Email operations
  async createStaffEmail(staff: InsertStaffEmail): Promise<StaffEmail> {
    // Normalize email to lowercase for consistent lookups
    const normalizedStaff = {
      ...staff,
      email: staff.email.toLowerCase(),
    };
    const [newStaff] = await db
      .insert(staffEmails)
      .values(normalizedStaff)
      .returning();
    return newStaff;
  }

  async getStaffEmail(id: number): Promise<StaffEmail | undefined> {
    const [staff] = await db
      .select()
      .from(staffEmails)
      .where(eq(staffEmails.id, id));
    return staff || undefined;
  }

  async getStaffEmailByEmail(email: string): Promise<StaffEmail | undefined> {
    const [staff] = await db
      .select()
      .from(staffEmails)
      .where(eq(staffEmails.email, email.toLowerCase()));
    return staff || undefined;
  }

  async getAllStaffEmails(): Promise<StaffEmail[]> {
    return await db
      .select()
      .from(staffEmails)
      .orderBy(desc(staffEmails.createdAt));
  }

  async updateStaffEmail(id: number, updates: Partial<StaffEmail>): Promise<StaffEmail | undefined> {
    // Normalize email to lowercase if being updated
    const normalizedUpdates = {
      ...updates,
      ...(updates.email ? { email: updates.email.toLowerCase() } : {}),
      updatedAt: new Date(),
    };
    const [updated] = await db
      .update(staffEmails)
      .set(normalizedUpdates)
      .where(eq(staffEmails.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteStaffEmail(id: number): Promise<void> {
    await db.delete(staffEmails).where(eq(staffEmails.id, id));
  }

  async updateStaffLastLogin(id: number): Promise<StaffEmail | undefined> {
    const [updated] = await db
      .update(staffEmails)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(staffEmails.id, id))
      .returning();
    return updated || undefined;
  }

  // Staff OTP operations
  async createStaffOtpCode(otp: InsertStaffOtpCode): Promise<StaffOtpCode> {
    const [newOtp] = await db
      .insert(staffOtpCodes)
      .values(otp)
      .returning();
    return newOtp;
  }

  async getActiveStaffOtpByEmail(email: string): Promise<StaffOtpCode | undefined> {
    const now = new Date();
    const [otp] = await db
      .select()
      .from(staffOtpCodes)
      .where(and(
        eq(staffOtpCodes.email, email.toLowerCase()),
        eq(staffOtpCodes.verified, false)
      ))
      .orderBy(desc(staffOtpCodes.createdAt));
    
    // Check if expired or max attempts reached
    if (otp && otp.expiresAt > now && otp.attempts < otp.maxAttempts) {
      return otp;
    }
    return undefined;
  }

  async incrementStaffOtpAttempts(id: number): Promise<StaffOtpCode | undefined> {
    const [updated] = await db
      .update(staffOtpCodes)
      .set({ attempts: sql`${staffOtpCodes.attempts} + 1` })
      .where(eq(staffOtpCodes.id, id))
      .returning();
    return updated || undefined;
  }

  async markStaffOtpVerified(id: number): Promise<StaffOtpCode | undefined> {
    const [updated] = await db
      .update(staffOtpCodes)
      .set({ verified: true })
      .where(eq(staffOtpCodes.id, id))
      .returning();
    return updated || undefined;
  }

  async invalidateStaffOtpCodes(email: string): Promise<void> {
    await db
      .update(staffOtpCodes)
      .set({ verified: true })
      .where(eq(staffOtpCodes.email, email.toLowerCase()));
  }

  async countRecentStaffOtpRequests(email: string, minutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const results = await db
      .select()
      .from(staffOtpCodes)
      .where(and(
        eq(staffOtpCodes.email, email.toLowerCase()),
        gt(staffOtpCodes.createdAt, cutoff)
      ));
    return results.length;
  }

  // ==========================================
  // POINTS & REWARDS ENGINE IMPLEMENTATION
  // ==========================================

  // Points Wallet operations
  async getPointsWallet(userId: string): Promise<PointsWallet | undefined> {
    const [wallet] = await db.select().from(pointsWallets).where(eq(pointsWallets.userId, userId));
    return wallet || undefined;
  }

  async getOrCreatePointsWallet(userId: string): Promise<PointsWallet> {
    let wallet = await this.getPointsWallet(userId);
    if (!wallet) {
      const [newWallet] = await db.insert(pointsWallets).values({ userId }).returning();
      wallet = newWallet;
    }
    return wallet;
  }

  async updatePointsWallet(userId: string, updates: Partial<PointsWallet>): Promise<PointsWallet | undefined> {
    const [updated] = await db
      .update(pointsWallets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pointsWallets.userId, userId))
      .returning();
    return updated || undefined;
  }

  async freezeWallet(userId: string, reason: string, adminId: string): Promise<PointsWallet | undefined> {
    return this.updatePointsWallet(userId, {
      isFrozen: true,
      frozenReason: reason,
      frozenAt: new Date(),
      frozenBy: adminId,
    });
  }

  async unfreezeWallet(userId: string): Promise<PointsWallet | undefined> {
    return this.updatePointsWallet(userId, {
      isFrozen: false,
      frozenReason: null,
      frozenAt: null,
      frozenBy: null,
    });
  }

  async resetDailyPointsCap(userId: string): Promise<void> {
    await db
      .update(pointsWallets)
      .set({
        dailyPointsEarned: 0,
        dailyPointsResetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pointsWallets.userId, userId));
  }

  async resetWeeklyPointsCap(userId: string): Promise<void> {
    await db
      .update(pointsWallets)
      .set({
        weeklyPointsEarned: 0,
        weeklyPointsResetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pointsWallets.userId, userId));
  }

  async updateDailyWeeklyPoints(userId: string, pointsEarned: number): Promise<void> {
    const wallet = await this.getOrCreatePointsWallet(userId);
    await db
      .update(pointsWallets)
      .set({
        dailyPointsEarned: (wallet.dailyPointsEarned ?? 0) + pointsEarned,
        weeklyPointsEarned: (wallet.weeklyPointsEarned ?? 0) + pointsEarned,
        updatedAt: new Date(),
      })
      .where(eq(pointsWallets.userId, userId));
  }

  async flagUserForGaming(userId: string, reason: string, anomalyScore: number): Promise<void> {
    await db
      .update(pointsWallets)
      .set({
        isFlagged: true,
        flaggedReason: reason,
        flaggedAt: new Date(),
        anomalyScore: anomalyScore,
        updatedAt: new Date(),
      })
      .where(eq(pointsWallets.userId, userId));
  }

  async getFlaggedUsers(): Promise<PointsWallet[]> {
    return db
      .select()
      .from(pointsWallets)
      .where(eq(pointsWallets.isFlagged, true))
      .orderBy(desc(pointsWallets.anomalyScore));
  }

  async restoreStreak(userId: string, streakType: string, newCount: number, adminId: string, reason: string): Promise<Streak> {
    const [existing] = await db
      .select()
      .from(streaks)
      .where(and(
        eq(streaks.userId, userId),
        eq(streaks.streakType, streakType as any)
      ));

    if (existing) {
      const [updated] = await db
        .update(streaks)
        .set({
          currentCount: newCount,
          bestCount: Math.max(existing.bestCount, newCount),
          wasManuallyRestored: true,
          restoredBy: adminId,
          restoredAt: new Date(),
          restoredReason: reason,
          brokenAt: null,
          updatedAt: new Date(),
        })
        .where(eq(streaks.id, existing.id))
        .returning();
      return updated;
    } else {
      const [newStreak] = await db
        .insert(streaks)
        .values({
          userId,
          streakType: streakType as any,
          currentCount: newCount,
          bestCount: newCount,
          wasManuallyRestored: true,
          restoredBy: adminId,
          restoredAt: new Date(),
          restoredReason: reason,
          startedAt: new Date(),
        })
        .returning();
      return newStreak;
    }
  }

  async getGamificationAnalytics(): Promise<{
    adherenceStats: {
      onTimeRefillRate: number;
      avgStreakLength: number;
      usersWithActiveStreaks: number;
      totalStreakBreaks30Days: number;
    };
    streakRetention: { day: number; retention: number }[];
    rewardsROI: {
      pointsIssued: number;
      estimatedCostUSD: number;
      refillsGenerated: number;
      revenueGenerated: number;
    };
    flaggedUsersCount: number;
    gamingIncidents30Days: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all streaks
    const allStreaks = await db.select().from(streaks);
    const refillStreaks = allStreaks.filter(s => s.streakType === "refill_adherence");
    
    // Calculate adherence stats
    const activeRefillStreaks = refillStreaks.filter(s => s.currentCount > 0);
    const avgStreakLength = refillStreaks.length > 0 
      ? refillStreaks.reduce((sum, s) => sum + s.currentCount, 0) / refillStreaks.length 
      : 0;
    
    // Count streak breaks in last 30 days
    const streakBreaks30Days = refillStreaks.filter(s => 
      s.brokenAt && new Date(s.brokenAt) >= thirtyDaysAgo
    ).length;

    // Calculate on-time refill rate from ledger entries
    const ledgerEntries = await db.select().from(pointsLedger)
      .where(gte(pointsLedger.createdAt, thirtyDaysAgo));
    
    const refillEntries = ledgerEntries.filter(e => e.actionType === "on_time_refill");
    const totalPatients = (await db.select().from(users)).length;
    const onTimeRefillRate = totalPatients > 0 ? (refillEntries.length / totalPatients) * 100 : 0;

    // Build streak retention curve (how many users maintain streaks by day)
    const streakRetention: { day: number; retention: number }[] = [];
    for (let day = 1; day <= 30; day++) {
      const usersWithStreakAtDay = refillStreaks.filter(s => 
        s.currentCount >= day || s.bestCount >= day
      ).length;
      const retention = refillStreaks.length > 0 
        ? (usersWithStreakAtDay / refillStreaks.length) * 100 
        : 0;
      streakRetention.push({ day, retention: Math.round(retention) });
    }

    // Calculate rewards ROI
    const wallets = await db.select().from(pointsWallets);
    const totalPointsIssued = wallets.reduce((sum, w) => sum + w.lifetimeEarned, 0);
    const estimatedCostUSD = totalPointsIssued * 0.01; // Assume $0.01 per point
    
    // Estimate revenue from refills (simplified)
    const completedRefills = refillEntries.length;
    const avgRefillValue = 45; // Estimated average refill value
    const revenueGenerated = completedRefills * avgRefillValue;

    // Get flagged users
    const flaggedWallets = await db.select().from(pointsWallets)
      .where(eq(pointsWallets.isFlagged, true));
    
    // Count gaming incidents (flags in last 30 days)
    const gamingIncidents = flaggedWallets.filter(w => 
      w.flaggedAt && new Date(w.flaggedAt) >= thirtyDaysAgo
    ).length;

    return {
      adherenceStats: {
        onTimeRefillRate: Math.round(onTimeRefillRate * 10) / 10,
        avgStreakLength: Math.round(avgStreakLength * 10) / 10,
        usersWithActiveStreaks: activeRefillStreaks.length,
        totalStreakBreaks30Days: streakBreaks30Days,
      },
      streakRetention,
      rewardsROI: {
        pointsIssued: totalPointsIssued,
        estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
        refillsGenerated: completedRefills,
        revenueGenerated: Math.round(revenueGenerated * 100) / 100,
      },
      flaggedUsersCount: flaggedWallets.length,
      gamingIncidents30Days: gamingIncidents,
    };
  }

  // Points Ledger operations
  async addPointsLedgerEntry(entry: InsertPointsLedgerEntry): Promise<PointsLedgerEntry> {
    const [newEntry] = await db.insert(pointsLedger).values(entry).returning();
    return newEntry;
  }

  async getPointsLedger(userId: string, limit: number = 50): Promise<PointsLedgerEntry[]> {
    return db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.userId, userId))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(limit);
  }

  async getPointsLedgerByOrderId(orderId: string): Promise<PointsLedgerEntry[]> {
    return db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.referenceType, "order"),
          eq(pointsLedger.referenceId, orderId),
          gt(pointsLedger.points, 0)
        )
      )
      .orderBy(desc(pointsLedger.createdAt));
  }

  async checkIdempotencyKey(key: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.eventIdempotencyKey, key));
    return !!existing;
  }

  async getExpiringPoints(userId: string, beforeDate: Date): Promise<PointsLedgerEntry[]> {
    return db
      .select()
      .from(pointsLedger)
      .where(and(
        eq(pointsLedger.userId, userId),
        eq(pointsLedger.isExpired, false),
        gt(pointsLedger.points, 0),
        lte(pointsLedger.expiresAt, beforeDate)
      ));
  }

  async markPointsExpired(entryId: number): Promise<void> {
    await db.update(pointsLedger).set({ isExpired: true }).where(eq(pointsLedger.id, entryId));
  }

  // Core points engine - Award Points
  async awardPoints(params: {
    userId: string;
    actionType: string;
    points: number;
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
    campaignId?: number;
    adminId?: string;
    adminReason?: string;
    idempotencyKey?: string;
  }): Promise<PointsLedgerEntry | null> {
    // Check idempotency
    if (params.idempotencyKey) {
      const exists = await this.checkIdempotencyKey(params.idempotencyKey);
      if (exists) return null;
    }

    // Get or create wallet
    const wallet = await this.getOrCreatePointsWallet(params.userId);
    
    // Check if wallet is frozen
    if (wallet.isFrozen) return null;

    const newBalance = wallet.currentBalance + params.points;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + POINTS_EXPIRY_MONTHS);

    // Create ledger entry
    const entry = await this.addPointsLedgerEntry({
      userId: params.userId,
      actionType: params.actionType as any,
      points: params.points,
      balanceAfter: newBalance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description,
      metadata: params.metadata,
      expiresAt,
      campaignId: params.campaignId,
      adminId: params.adminId,
      adminReason: params.adminReason,
      eventIdempotencyKey: params.idempotencyKey,
    });

    // Update wallet balance
    await this.updatePointsWallet(params.userId, {
      currentBalance: newBalance,
      lifetimeEarned: wallet.lifetimeEarned + params.points,
      lastEarnedAt: new Date(),
    });

    return entry;
  }

  // Core points engine - Deduct Points
  async deductPoints(params: {
    userId: string;
    actionType: string;
    points: number;
    description: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
    adminId?: string;
    adminReason?: string;
    idempotencyKey?: string;
  }): Promise<PointsLedgerEntry | null> {
    // Check idempotency to prevent duplicate reversals
    if (params.idempotencyKey) {
      const exists = await this.checkIdempotencyKey(params.idempotencyKey);
      if (exists) return null;
    }

    const wallet = await this.getPointsWallet(params.userId);
    if (!wallet || wallet.isFrozen) return null;
    if (wallet.currentBalance < params.points) return null;

    const newBalance = wallet.currentBalance - params.points;

    // Create ledger entry (negative points)
    const entry = await this.addPointsLedgerEntry({
      userId: params.userId,
      actionType: params.actionType as any,
      points: -params.points,
      balanceAfter: newBalance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: params.description,
      metadata: params.metadata,
      adminId: params.adminId,
      adminReason: params.adminReason,
      eventIdempotencyKey: params.idempotencyKey,
    });

    // Update wallet
    await this.updatePointsWallet(params.userId, {
      currentBalance: newBalance,
      lifetimeRedeemed: wallet.lifetimeRedeemed + params.points,
      lastRedeemedAt: new Date(),
    });

    return entry;
  }

  // Streak operations
  async getStreak(userId: string, streakType: string): Promise<Streak | undefined> {
    const [streak] = await db
      .select()
      .from(streaks)
      .where(and(eq(streaks.userId, userId), eq(streaks.streakType, streakType as any)));
    return streak || undefined;
  }

  async getUserStreaks(userId: string): Promise<Streak[]> {
    return db.select().from(streaks).where(eq(streaks.userId, userId));
  }

  async updateStreak(userId: string, streakType: string, increment: boolean, referenceId?: string): Promise<Streak> {
    let streak = await this.getStreak(userId, streakType);
    
    if (!streak) {
      const [newStreak] = await db.insert(streaks).values({
        userId,
        streakType: streakType as any,
        currentCount: increment ? 1 : 0,
        bestCount: increment ? 1 : 0,
        startedAt: increment ? new Date() : null,
        lastQualifyingActionAt: increment ? new Date() : null,
        lastQualifyingReferenceId: referenceId,
      }).returning();
      return newStreak;
    }

    if (increment) {
      const newCount = streak.currentCount + 1;
      const [updated] = await db
        .update(streaks)
        .set({
          currentCount: newCount,
          bestCount: Math.max(streak.bestCount, newCount),
          lastQualifyingActionAt: new Date(),
          lastQualifyingReferenceId: referenceId,
          brokenAt: null,
          updatedAt: new Date(),
        })
        .where(eq(streaks.id, streak.id))
        .returning();
      return updated;
    } else {
      // Break streak
      const [updated] = await db
        .update(streaks)
        .set({
          currentCount: 0,
          brokenAt: new Date(),
          startedAt: null,
          lastMilestoneAwarded: 0,
          updatedAt: new Date(),
        })
        .where(eq(streaks.id, streak.id))
        .returning();
      return updated;
    }
  }

  getStreakMilestoneBonus(currentCount: number, lastMilestone: number): { milestone: number; points: number } | null {
    if (currentCount >= 10 && lastMilestone < 10) {
      return { milestone: 10, points: EARNING_POINTS.STREAK_10_REFILLS };
    }
    if (currentCount >= 5 && lastMilestone < 5) {
      return { milestone: 5, points: EARNING_POINTS.STREAK_5_REFILLS };
    }
    if (currentCount >= 3 && lastMilestone < 3) {
      return { milestone: 3, points: EARNING_POINTS.STREAK_3_REFILLS };
    }
    return null;
  }

  // Reward operations
  async getReward(id: number): Promise<Reward | undefined> {
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, id));
    return reward || undefined;
  }

  async getAllRewards(): Promise<Reward[]> {
    return db.select().from(rewards).orderBy(desc(rewards.createdAt));
  }

  async getActiveRewards(): Promise<Reward[]> {
    const now = new Date();
    return db
      .select()
      .from(rewards)
      .where(and(
        eq(rewards.status, "active"),
        lte(rewards.startsAt, now),
        or(isNull(rewards.expiresAt), gt(rewards.expiresAt, now))
      ))
      .orderBy(rewards.pointsCost);
  }

  async getAvailableRewardsForUser(userId: string): Promise<Reward[]> {
    const wallet = await this.getPointsWallet(userId);
    if (!wallet) return [];
    
    const activeRewards = await this.getActiveRewards();
    const userStreaks = await this.getUserStreaks(userId);
    const userRedemptions = await this.getUserRedemptions(userId);
    
    return activeRewards.filter(reward => {
      // Check points balance
      if (reward.minPointsBalance && wallet.currentBalance < reward.minPointsBalance) return false;
      if (wallet.currentBalance < reward.pointsCost) return false;
      
      // Check streak requirement
      if (reward.requiredStreakType && reward.requiredStreakCount) {
        const userStreak = userStreaks.find(s => s.streakType === reward.requiredStreakType);
        if (!userStreak || userStreak.currentCount < reward.requiredStreakCount) return false;
      }
      
      // Check max redemptions per user
      if (reward.maxRedemptionsPerUser && !reward.isReusable) {
        const userRedeemCount = userRedemptions.filter(r => r.rewardId === reward.id).length;
        if (userRedeemCount >= reward.maxRedemptionsPerUser) return false;
      }
      
      // Check total redemptions
      if (reward.maxRedemptionsTotal && reward.currentRedemptions >= reward.maxRedemptionsTotal) return false;
      
      return true;
    });
  }

  async createReward(reward: InsertReward): Promise<Reward> {
    const [newReward] = await db.insert(rewards).values(reward).returning();
    return newReward;
  }

  async updateReward(id: number, updates: Partial<Reward>): Promise<Reward | undefined> {
    const [updated] = await db
      .update(rewards)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rewards.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteReward(id: number): Promise<void> {
    await db.delete(rewards).where(eq(rewards.id, id));
  }

  // Reward redemption
  async redeemReward(userId: string, rewardId: number, orderId?: string): Promise<RewardRedemption | null> {
    const canRedeem = await this.canUserRedeemReward(userId, rewardId);
    if (!canRedeem.canRedeem) return null;

    const reward = await this.getReward(rewardId);
    if (!reward) return null;

    // Deduct points
    const deduction = await this.deductPoints({
      userId,
      actionType: reward.rewardType === "otc_discount" ? "redeem_otc" : 
                  reward.rewardType === "delivery_waiver" ? "redeem_delivery_fee" : 
                  reward.rewardType === "copay_assistance" ? "redeem_copay" : "redeem_otc",
      points: reward.pointsCost,
      description: `Redeemed: ${reward.name}`,
      referenceType: "reward",
      referenceId: rewardId.toString(),
    });

    if (!deduction) return null;

    // Create redemption record
    const [redemption] = await db.insert(rewardRedemptions).values({
      userId,
      rewardId,
      orderId,
      pointsSpent: reward.pointsCost,
      discountApplied: reward.discountValue,
    }).returning();

    // Increment reward redemption count
    await db
      .update(rewards)
      .set({ currentRedemptions: sql`${rewards.currentRedemptions} + 1` })
      .where(eq(rewards.id, rewardId));

    return redemption;
  }

  async getUserRedemptions(userId: string): Promise<(RewardRedemption & { reward: Reward })[]> {
    const redemptions = await db
      .select()
      .from(rewardRedemptions)
      .where(eq(rewardRedemptions.userId, userId))
      .orderBy(desc(rewardRedemptions.createdAt));
    
    const result: (RewardRedemption & { reward: Reward })[] = [];
    for (const r of redemptions) {
      const reward = await this.getReward(r.rewardId);
      if (reward) {
        result.push({ ...r, reward });
      }
    }
    return result;
  }

  async canUserRedeemReward(userId: string, rewardId: number): Promise<{ canRedeem: boolean; reason?: string }> {
    const wallet = await this.getPointsWallet(userId);
    if (!wallet) return { canRedeem: false, reason: "No points wallet found" };
    if (wallet.isFrozen) return { canRedeem: false, reason: "Wallet is frozen" };

    const reward = await this.getReward(rewardId);
    if (!reward) return { canRedeem: false, reason: "Reward not found" };
    if (reward.status !== "active") return { canRedeem: false, reason: "Reward is not active" };
    
    const now = new Date();
    if (reward.expiresAt && reward.expiresAt < now) return { canRedeem: false, reason: "Reward has expired" };
    if (reward.startsAt > now) return { canRedeem: false, reason: "Reward is not yet available" };

    if (wallet.currentBalance < reward.pointsCost) {
      return { canRedeem: false, reason: `Insufficient points. Need ${reward.pointsCost}, have ${wallet.currentBalance}` };
    }

    if (reward.maxRedemptionsTotal && reward.currentRedemptions >= reward.maxRedemptionsTotal) {
      return { canRedeem: false, reason: "Reward redemption limit reached" };
    }

    if (reward.maxRedemptionsPerUser && !reward.isReusable) {
      const userRedemptions = await this.getUserRedemptions(userId);
      const rewardRedeemCount = userRedemptions.filter(r => r.rewardId === rewardId).length;
      if (rewardRedeemCount >= reward.maxRedemptionsPerUser) {
        return { canRedeem: false, reason: "You have already redeemed this reward" };
      }
    }

    return { canRedeem: true };
  }

  // Earning rules operations
  async getEarningRule(ruleKey: string): Promise<EarningRule | undefined> {
    const [rule] = await db.select().from(earningRules).where(eq(earningRules.ruleKey, ruleKey));
    return rule || undefined;
  }

  async getAllEarningRules(): Promise<EarningRule[]> {
    return db.select().from(earningRules).orderBy(earningRules.name);
  }

  async getActiveEarningRules(): Promise<EarningRule[]> {
    return db.select().from(earningRules).where(eq(earningRules.isActive, true));
  }

  async updateEarningRule(id: number, updates: Partial<EarningRule>): Promise<EarningRule | undefined> {
    const [updated] = await db
      .update(earningRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(earningRules.id, id))
      .returning();
    return updated || undefined;
  }

  async toggleEarningRule(id: number, isActive: boolean, modifiedBy?: string): Promise<EarningRule | undefined> {
    return this.updateEarningRule(id, { isActive, lastModifiedBy: modifiedBy });
  }

  async createEarningRule(rule: InsertEarningRule): Promise<EarningRule> {
    const [newRule] = await db.insert(earningRules).values(rule).returning();
    return newRule;
  }

  async deleteEarningRule(id: number): Promise<void> {
    await db.delete(earningRules).where(eq(earningRules.id, id));
  }

  async seedDefaultEarningRules(): Promise<void> {
    const existingRules = await this.getAllEarningRules();
    if (existingRules.length > 0) {
      console.log(`[Seed] Found ${existingRules.length} existing earning rules, skipping seed.`);
      return;
    }

    console.log("[Seed] No earning rules found, seeding defaults...");

    const defaultRules: InsertEarningRule[] = [
      {
        ruleKey: "on_time_refill",
        actionType: "on_time_refill",
        name: "On-Time Refill Bonus",
        description: "Earn points for refilling prescriptions on time (within 2 days before due)",
        basePoints: 50,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "otc_purchase",
        actionType: "otc_purchase",
        name: "OTC Purchase Points",
        description: "Earn 1 point per dollar spent on over-the-counter products",
        basePoints: 0,
        pointsPerDollar: "1.00",
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "signup_bonus",
        actionType: "signup_bonus",
        name: "New Account Bonus",
        description: "Welcome bonus for creating a new account",
        basePoints: 100,
        isOneTime: true,
        isActive: true,
      },
      {
        ruleKey: "referral_bonus",
        actionType: "referral_completed",
        name: "Referral Bonus",
        description: "Earn points when someone you refer makes their first purchase",
        basePoints: 500,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "weekly_engagement",
        actionType: "weekly_app_engagement",
        name: "Weekly Engagement Streak",
        description: "Bonus points for maintaining weekly app engagement",
        basePoints: 20,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "streak_3_refills",
        actionType: "streak_3_refills",
        name: "3-Refill Adherence Streak",
        description: "Bonus points for 3 consecutive on-time refills",
        basePoints: 100,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "streak_5_refills",
        actionType: "streak_5_refills",
        name: "5-Refill Adherence Streak",
        description: "Bonus points for 5 consecutive on-time refills",
        basePoints: 250,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "prescription_transfer",
        actionType: "prescription_transfer",
        name: "Prescription Transfer Bonus",
        description: "Earn points when transferring prescriptions to Concordia Pharmacy",
        basePoints: 200,
        isOneTime: true,
        isActive: true,
      },
      {
        ruleKey: "vaccine_completed",
        actionType: "vaccine_completed",
        name: "Vaccine Bonus",
        description: "Earn points for getting vaccinations (flu shot, etc.)",
        basePoints: 150,
        isOneTime: false,
        isActive: true,
      },
      {
        ruleKey: "profile_completion",
        actionType: "profile_completion",
        name: "Profile Completion Bonus",
        description: "Earn points for completing your profile",
        basePoints: 50,
        isOneTime: true,
        isActive: true,
      },
    ];

    for (const rule of defaultRules) {
      try {
        await this.createEarningRule(rule);
        console.log(`[Seed] Created earning rule: ${rule.name}`);
      } catch (error) {
        console.error(`[Seed] Failed to create earning rule ${rule.name}:`, error);
      }
    }

    console.log("[Seed] Default earning rules seeded successfully.");
  }

  // Campaign operations
  async getCampaign(id: number): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async getAllCampaigns(): Promise<Campaign[]> {
    return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    const now = new Date();
    return db
      .select()
      .from(campaigns)
      .where(and(
        eq(campaigns.isActive, true),
        lte(campaigns.startsAt, now),
        gt(campaigns.endsAt, now)
      ));
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [newCampaign] = await db.insert(campaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateCampaign(id: number, updates: Partial<Campaign>): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(campaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCampaign(id: number): Promise<void> {
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async getApplicableCampaign(actionType: string): Promise<Campaign | undefined> {
    const activeCampaigns = await this.getActiveCampaigns();
    
    for (const campaign of activeCampaigns) {
      // Check if campaign applies to this action type
      if (!campaign.applicableActions) {
        // null means applies to all
        return campaign;
      }
      const applicableActions = campaign.applicableActions as string[];
      if (applicableActions.includes(actionType)) {
        return campaign;
      }
    }
    return undefined;
  }

  // Referral operations
  async createReferral(referral: InsertReferral): Promise<Referral> {
    const [newReferral] = await db.insert(referrals).values(referral).returning();
    return newReferral;
  }

  async getReferral(id: number): Promise<Referral | undefined> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.id, id));
    return referral || undefined;
  }

  async getReferralByCode(code: string): Promise<Referral | undefined> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.referralCode, code));
    return referral || undefined;
  }

  async getUserReferrals(referrerId: string): Promise<Referral[]> {
    return db.select().from(referrals).where(eq(referrals.referrerId, referrerId)).orderBy(desc(referrals.createdAt));
  }

  async updateReferralStatus(id: number, status: string, updates?: Partial<Referral>): Promise<Referral | undefined> {
    const [updated] = await db
      .update(referrals)
      .set({ status: status as any, ...updates, updatedAt: new Date() })
      .where(eq(referrals.id, id))
      .returning();
    return updated || undefined;
  }

  async countUserReferralsThisMonth(referrerId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const results = await db
      .select()
      .from(referrals)
      .where(and(
        eq(referrals.referrerId, referrerId),
        eq(referrals.status, "rewarded"),
        gte(referrals.rewardedAt, startOfMonth)
      ));
    return results.length;
  }

  // One-time reward tracking
  async hasReceivedOneTimeReward(userId: string, rewardType: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(oneTimeRewards)
      .where(and(
        eq(oneTimeRewards.userId, userId),
        eq(oneTimeRewards.rewardType, rewardType)
      ));
    return !!existing;
  }

  async recordOneTimeReward(userId: string, rewardType: string, points: number): Promise<OneTimeReward> {
    const [record] = await db.insert(oneTimeRewards).values({
      userId,
      rewardType,
      pointsAwarded: points,
    }).returning();
    return record;
  }

  // Admin analytics
  async getPointsAnalytics(): Promise<{
    totalPointsIssued: number;
    totalPointsRedeemed: number;
    totalPointsExpired: number;
    activeWallets: number;
    topEarners: { userId: string; points: number }[];
  }> {
    const wallets = await db.select().from(pointsWallets);
    
    let totalIssued = 0;
    let totalRedeemed = 0;
    let totalExpired = 0;
    
    for (const w of wallets) {
      totalIssued += w.lifetimeEarned;
      totalRedeemed += w.lifetimeRedeemed;
      totalExpired += w.lifetimeExpired;
    }
    
    const activeWallets = wallets.filter(w => w.currentBalance > 0).length;
    
    const topEarners = wallets
      .sort((a, b) => b.lifetimeEarned - a.lifetimeEarned)
      .slice(0, 10)
      .map(w => ({ userId: w.userId, points: w.lifetimeEarned }));
    
    return {
      totalPointsIssued: totalIssued,
      totalPointsRedeemed: totalRedeemed,
      totalPointsExpired: totalExpired,
      activeWallets,
      topEarners,
    };
  }

  // OTC Card operations
  async getOtcCard(userId: string): Promise<OtcCard | undefined> {
    const [card] = await db.select().from(otcCards).where(eq(otcCards.userId, userId));
    return card || undefined;
  }

  async createOtcCard(card: InsertOtcCard): Promise<OtcCard> {
    const [created] = await db.insert(otcCards).values(card).returning();
    return created;
  }

  async updateOtcCard(userId: string, updates: Partial<OtcCard>): Promise<OtcCard | undefined> {
    const [updated] = await db
      .update(otcCards)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(otcCards.userId, userId))
      .returning();
    return updated || undefined;
  }

  async deleteOtcCard(userId: string): Promise<void> {
    await db.delete(otcCards).where(eq(otcCards.userId, userId));
  }

  // Seed default rewards
  async seedDefaultRewards(): Promise<void> {
    const existingRewards = await this.getAllRewards();
    if (existingRewards.length > 0) {
      console.log(`[Seed] Found ${existingRewards.length} existing rewards, skipping seed.`);
      return;
    }

    console.log("[Seed] No rewards found, seeding defaults...");

    const defaultRewards: InsertReward[] = [
      {
        name: "$5 Off OTC Purchase",
        description: "Get $5 off your next over-the-counter purchase of $20 or more",
        pointsCost: 500,
        rewardType: "otc_discount",
        discountValue: "5.00",
        discountType: "fixed",
        status: "active",
        isReusable: true,
        isHighlighted: true,
      },
      {
        name: "$10 Off OTC Purchase",
        description: "Get $10 off your next over-the-counter purchase of $40 or more",
        pointsCost: 1000,
        rewardType: "otc_discount",
        discountValue: "10.00",
        discountType: "fixed",
        status: "active",
        isReusable: true,
        isHighlighted: false,
      },
      {
        name: "15% Off OTC Products",
        description: "Get 15% off your entire OTC cart (max $25 discount)",
        pointsCost: 1500,
        rewardType: "otc_discount",
        discountValue: "15.00",
        discountType: "percentage",
        maxDiscountAmount: "25.00",
        status: "active",
        isReusable: true,
        isHighlighted: false,
      },
      {
        name: "Free Standard Delivery",
        description: "Get free standard delivery on your next order",
        pointsCost: 300,
        rewardType: "delivery_waiver",
        discountValue: "7.99",
        discountType: "fixed",
        status: "active",
        isReusable: true,
        isHighlighted: true,
      },
      {
        name: "Express Delivery Upgrade",
        description: "Free upgrade to express same-day delivery",
        pointsCost: 600,
        rewardType: "delivery_waiver",
        discountValue: "14.99",
        discountType: "fixed",
        status: "active",
        isReusable: true,
        isHighlighted: false,
      },
      {
        name: "Double Points Day",
        description: "Earn double points on all purchases for 24 hours",
        pointsCost: 800,
        rewardType: "points_multiplier",
        status: "active",
        isReusable: true,
        isHighlighted: false,
      },
      {
        name: "10% Copay Assistance",
        description: "Get 10% off your prescription copay (up to $10)",
        pointsCost: 750,
        rewardType: "copay_assistance",
        discountValue: "10.00",
        discountType: "percentage",
        maxDiscountAmount: "10.00",
        status: "active",
        isReusable: true,
        isHighlighted: true,
      },
      {
        name: "$2 Off Any Purchase",
        description: "A small discount for loyal customers - $2 off any order",
        pointsCost: 200,
        rewardType: "otc_discount",
        discountValue: "2.00",
        discountType: "fixed",
        status: "active",
        isReusable: true,
        isHighlighted: false,
      },
    ];

    for (const reward of defaultRewards) {
      await this.createReward(reward);
    }

    console.log(`[Seed] Successfully seeded ${defaultRewards.length} default rewards.`);
  }

  // ==========================================
  // PATIENT REQUEST QUEUE (T004)
  // ==========================================

  async createPatientRequest(request: InsertPatientRequest): Promise<PatientRequest> {
    const [created] = await db.insert(patientRequests).values(request).returning();
    await db.insert(requestStatusHistory).values({
      requestId: created.id,
      fromStatus: null,
      toStatus: "new_from_app",
      notes: "Request created",
    });
    return created;
  }

  async getPatientRequests(filters?: { status?: string; type?: string; assignedStaffId?: number }): Promise<PatientRequest[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(patientRequests.status, filters.status as any));
    }
    if (filters?.type) {
      conditions.push(eq(patientRequests.type, filters.type as any));
    }
    if (filters?.assignedStaffId) {
      conditions.push(eq(patientRequests.assignedStaffId, filters.assignedStaffId));
    }
    if (conditions.length > 0) {
      return db.select().from(patientRequests).where(and(...conditions)).orderBy(desc(patientRequests.createdAt));
    }
    return db.select().from(patientRequests).orderBy(desc(patientRequests.createdAt));
  }

  async getPatientRequest(id: number): Promise<PatientRequest | undefined> {
    const [request] = await db.select().from(patientRequests).where(eq(patientRequests.id, id));
    return request;
  }

  async updatePatientRequestStatus(id: number, status: string, changedBy?: number, notes?: string): Promise<PatientRequest | undefined> {
    const existing = await this.getPatientRequest(id);
    if (!existing) return undefined;

    const [updated] = await db
      .update(patientRequests)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(patientRequests.id, id))
      .returning();

    await db.insert(requestStatusHistory).values({
      requestId: id,
      fromStatus: existing.status,
      toStatus: status as any,
      changedBy: changedBy ?? null,
      notes: notes ?? null,
    });

    return updated;
  }

  async assignPatientRequest(id: number, staffId: number): Promise<PatientRequest | undefined> {
    const [updated] = await db
      .update(patientRequests)
      .set({ assignedStaffId: staffId, updatedAt: new Date() })
      .where(eq(patientRequests.id, id))
      .returning();
    return updated;
  }

  async getRequestStatusHistory(requestId: number): Promise<RequestStatusHistory[]> {
    return db
      .select()
      .from(requestStatusHistory)
      .where(eq(requestStatusHistory.requestId, requestId))
      .orderBy(desc(requestStatusHistory.createdAt));
  }

  // ==========================================
  // BLISTER DOSE TRACKING (T005)
  // ==========================================

  async createBlisterDoseLog(log: InsertBlisterDoseLog): Promise<BlisterDoseLog> {
    const [created] = await db.insert(blisterDoseLogs).values(log).returning();
    return created;
  }

  async getBlisterDoseLogs(blisterPatientId: number, dateFrom?: string, dateTo?: string): Promise<BlisterDoseLog[]> {
    const conditions = [eq(blisterDoseLogs.blisterPatientId, blisterPatientId)];
    if (dateFrom) {
      conditions.push(gte(blisterDoseLogs.scheduledDate, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(blisterDoseLogs.scheduledDate, dateTo));
    }
    return db
      .select()
      .from(blisterDoseLogs)
      .where(and(...conditions))
      .orderBy(desc(blisterDoseLogs.actionTime));
  }

  async getLatestDoseLogsByPatient(blisterPatientId: number): Promise<BlisterDoseLog[]> {
    return db
      .select()
      .from(blisterDoseLogs)
      .where(eq(blisterDoseLogs.blisterPatientId, blisterPatientId))
      .orderBy(desc(blisterDoseLogs.actionTime))
      .limit(50);
  }

  async createBlisterReminder(reminder: InsertBlisterReminder): Promise<BlisterReminder> {
    const [created] = await db.insert(blisterReminders).values(reminder).returning();
    return created;
  }

  async updateBlisterReminder(id: number, updates: Partial<BlisterReminder>): Promise<BlisterReminder | undefined> {
    const [updated] = await db
      .update(blisterReminders)
      .set(updates)
      .where(eq(blisterReminders.id, id))
      .returning();
    return updated;
  }

  async deleteBlisterReminder(id: number): Promise<void> {
    await db.delete(blisterReminders).where(eq(blisterReminders.id, id));
  }

  async getActiveBlisterReminders(blisterPatientId: number): Promise<BlisterReminder[]> {
    return db
      .select()
      .from(blisterReminders)
      .where(and(
        eq(blisterReminders.blisterPatientId, blisterPatientId),
        eq(blisterReminders.isActive, true),
      ));
  }

  async getAllActiveBlisterReminders(): Promise<BlisterReminder[]> {
    return db
      .select()
      .from(blisterReminders)
      .where(eq(blisterReminders.isActive, true));
  }

  // ==========================================
  // PRODUCT VISIBILITY (T006)
  // ==========================================

  async getWebsiteProducts(): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(and(
        eq(products.status, "active"),
        eq(products.requiresPrescription, false),
        eq(products.showOnWebsite, true),
      ));
  }

  async getAppProducts(): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(and(eq(products.showInApp, true), eq(products.status, "active")));
  }

  async syncOtcVisibility(): Promise<number> {
    const otcProducts = await db
      .select()
      .from(products)
      .where(sql`${products.category} != 'rx'`);

    let updated = 0;
    for (const product of otcProducts) {
      if (!product.showOnWebsite || !product.showInApp) {
        await db
          .update(products)
          .set({ showOnWebsite: true, showInApp: true })
          .where(eq(products.id, product.id));
        updated++;
      }
    }
    return updated;
  }

  async getDraftProducts(): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(eq(products.status, "draft"))
      .orderBy(products.createdAt);
  }

  async publishDraftProducts(ids?: string[], importBatchId?: string): Promise<number> {
    const conditions = [eq(products.status, "draft")];
    if (ids && ids.length > 0) conditions.push(inArray(products.id, ids));
    if (importBatchId) conditions.push(eq(products.importBatchId, importBatchId));
    const updated = await db
      .update(products)
      .set({ status: "active", showOnWebsite: true, showInApp: true, inStock: true, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return updated.length;
  }

  async bulkSyncOtcProducts(incoming: InsertProduct[], source: string): Promise<{ upserted: number; markedUnavailable: number }> {
    const now = new Date();

    return db.transaction(async (tx) => {
      if (incoming.length === 0) {
        const deactivated = await tx
          .update(products)
          .set({ status: "inactive", inStock: false, updatedAt: now })
          .where(
            and(
              eq(products.importSource, source),
              sql`external_id IS NOT NULL`,
              sql`(status != 'inactive' OR in_stock = true)`,
            )
          )
          .returning();
        return { upserted: 0, markedUnavailable: deactivated.length };
      }

      // Deduplicate by externalId — keep the last occurrence per key to avoid
      // same-statement multi-row conflicts on the unique constraint.
      const seen = new Map<string, InsertProduct>();
      for (const p of incoming) {
        if (p.externalId) seen.set(p.externalId, p);
      }
      const rows = Array.from(seen.values()).map((p) => ({ ...p, importSource: source, updatedAt: now }));

      const upserted = await tx
        .insert(products)
        .values(rows)
        .onConflictDoUpdate({
          target: products.externalId,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            category: sql`excluded.category`,
            price: sql`excluded.price`,
            imageUrl: sql`excluded.image_url`,
            inStock: sql`excluded.in_stock`,
            stockQuantity: sql`excluded.stock_quantity`,
            stockThreshold: sql`excluded.stock_threshold`,
            requiresPrescription: sql`excluded.requires_prescription`,
            ndc: sql`excluded.ndc`,
            showOnWebsite: sql`excluded.show_on_website`,
            showInApp: sql`excluded.show_in_app`,
            status: sql`excluded.status`,
            importSource: sql`excluded.import_source`,
            importBatchId: sql`excluded.import_batch_id`,
            expiryDate: sql`excluded.expiry_date`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning();

      const incomingExternalIds = incoming.map((p) => p.externalId).filter((id): id is string => !!id);

      let markedUnavailable = 0;
      if (incomingExternalIds.length > 0) {
        const deactivated = await tx
          .update(products)
          .set({ status: "inactive", inStock: false, updatedAt: now })
          .where(
            and(
              eq(products.importSource, source),
              sql`external_id IS NOT NULL`,
              notInArray(products.externalId, incomingExternalIds),
              sql`(status != 'inactive' OR in_stock = true)`,
            )
          )
          .returning();
        markedUnavailable = deactivated.length;
      }

      return { upserted: upserted.length, markedUnavailable };
    });
  }

  async updateProductVisibility(id: string, showOnWebsite?: boolean, showInApp?: boolean): Promise<Product | undefined> {
    const updates: Partial<Product> = { updatedAt: new Date() };
    if (showOnWebsite !== undefined) updates.showOnWebsite = showOnWebsite;
    if (showInApp !== undefined) updates.showInApp = showInApp;
    const [updated] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  // ==========================================
  // SETTINGS (points_settings table)
  // ==========================================

  async getSettingByKey(key: string): Promise<PointsSetting | undefined> {
    const [setting] = await db
      .select()
      .from(pointsSettings)
      .where(eq(pointsSettings.settingKey, key));
    return setting || undefined;
  }

  async getAllSettings(): Promise<PointsSetting[]> {
    return db.select().from(pointsSettings).orderBy(pointsSettings.settingKey);
  }

  async upsertSetting(key: string, value: string, description?: string, updatedBy?: string): Promise<PointsSetting> {
    const [setting] = await db
      .insert(pointsSettings)
      .values({
        settingKey: key,
        settingValue: value,
        description: description || null,
        updatedAt: new Date(),
        updatedBy: updatedBy || null,
      })
      .onConflictDoUpdate({
        target: pointsSettings.settingKey,
        set: {
          settingValue: value,
          ...(description !== undefined && { description }),
          updatedAt: new Date(),
          ...(updatedBy !== undefined && { updatedBy }),
        },
      })
      .returning();
    return setting;
  }

  // ==========================================
  // PENDING CAREGIVER LINKS
  // ==========================================

  async getPendingCaregiverLinks(): Promise<Array<PatientAttendant & { attendant: HomeAttendant; patient: User }>> {
    const links = await db
      .select()
      .from(patientAttendants)
      .where(
        or(
          eq(patientAttendants.patientConsent, false),
          eq(patientAttendants.isActive, false)
        )
      )
      .orderBy(desc(patientAttendants.createdAt));

    const result: Array<PatientAttendant & { attendant: HomeAttendant; patient: User }> = [];

    for (const link of links) {
      if (link.revokedAt) continue;

      const [attendant] = await db
        .select()
        .from(homeAttendants)
        .where(eq(homeAttendants.id, link.attendantId));

      if (!attendant) continue;

      if (attendant.status !== "pending_verification" && link.patientConsent !== false) continue;

      const [patient] = await db
        .select()
        .from(users)
        .where(eq(users.id, link.patientId));

      if (!patient) continue;

      result.push({ ...link, attendant, patient });
    }

    return result;
  }

  // ==========================================
  // CHANGE LOG (T012)
  // ==========================================

  async createChangeLogEntry(entry: InsertChangeLog): Promise<ChangeLog> {
    const [created] = await db.insert(changeLog).values(entry).returning();
    return created;
  }

  async getChangeLogEntries(entityType: string, entityId: string): Promise<ChangeLog[]> {
    return db
      .select()
      .from(changeLog)
      .where(and(
        eq(changeLog.entityType, entityType),
        eq(changeLog.entityId, entityId),
      ))
      .orderBy(desc(changeLog.changedAt));
  }
  // ==========================================
  // DOCTOR OPERATIONS (T003)
  // ==========================================

  async createDoctor(doctor: InsertPatientDoctor): Promise<PatientDoctor> {
    const [created] = await db.insert(patientDoctors).values(doctor).returning();
    return created;
  }

  async getDoctorById(id: number): Promise<PatientDoctor | undefined> {
    const [doctor] = await db.select().from(patientDoctors).where(eq(patientDoctors.id, id));
    return doctor || undefined;
  }

  async getDoctorsByPatient(userId: string): Promise<PatientDoctor[]> {
    return db
      .select()
      .from(patientDoctors)
      .where(and(eq(patientDoctors.userId, userId), eq(patientDoctors.isActive, true)))
      .orderBy(desc(patientDoctors.createdAt));
  }

  async getAllDoctors(search?: string): Promise<PatientDoctor[]> {
    if (search) {
      const searchLower = `%${search.toLowerCase()}%`;
      return db
        .select()
        .from(patientDoctors)
        .where(
          or(
            sql`LOWER(${patientDoctors.firstName}) LIKE ${searchLower}`,
            sql`LOWER(${patientDoctors.lastName}) LIKE ${searchLower}`,
            sql`LOWER(${patientDoctors.specialty}) LIKE ${searchLower}`,
            sql`${patientDoctors.npi} LIKE ${searchLower}`,
            sql`LOWER(${patientDoctors.phone}) LIKE ${searchLower}`
          )
        )
        .orderBy(desc(patientDoctors.createdAt));
    }
    return db.select().from(patientDoctors).orderBy(desc(patientDoctors.createdAt));
  }

  async updateDoctor(id: number, updates: Partial<PatientDoctor>): Promise<PatientDoctor | undefined> {
    const [updated] = await db
      .update(patientDoctors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(patientDoctors.id, id))
      .returning();
    return updated || undefined;
  }

  async softDeleteDoctor(id: number): Promise<PatientDoctor | undefined> {
    const [updated] = await db
      .update(patientDoctors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(patientDoctors.id, id))
      .returning();
    return updated || undefined;
  }

  async hardDeleteDoctor(id: number): Promise<PatientDoctor | undefined> {
    const [deleted] = await db
      .delete(patientDoctors)
      .where(eq(patientDoctors.id, id))
      .returning();
    return deleted || undefined;
  }

  async bulkCreateDoctors(doctors: InsertPatientDoctor[]): Promise<{ created: number; errors: string[] }> {
    let created = 0;
    const errors: string[] = [];
    for (let i = 0; i < doctors.length; i++) {
      try {
        await db.insert(patientDoctors).values(doctors[i]).returning();
        created++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
    return { created, errors };
  }

  // Conversion Leads operations
  async createConversionLead(lead: InsertConversionLead): Promise<ConversionLead> {
    const [created] = await db.insert(conversionLeads).values(lead).returning();
    return created;
  }

  async getConversionLead(id: number): Promise<ConversionLead | undefined> {
    const [lead] = await db.select().from(conversionLeads).where(eq(conversionLeads.id, id));
    return lead;
  }

  async getAllConversionLeads(status?: string): Promise<ConversionLead[]> {
    if (status) {
      return await db.select().from(conversionLeads)
        .where(eq(conversionLeads.status, status as any))
        .orderBy(desc(conversionLeads.createdAt));
    }
    return await db.select().from(conversionLeads).orderBy(desc(conversionLeads.createdAt));
  }

  async getPriorityConversionLeads(): Promise<ConversionLead[]> {
    return await db.select().from(conversionLeads)
      .where(
        and(
          eq(conversionLeads.status, "pending_request"),
          gte(conversionLeads.medicationCount, 10)
        )
      )
      .orderBy(conversionLeads.createdAt);
  }

  async updateConversionLead(id: number, updates: Partial<ConversionLead>): Promise<ConversionLead | undefined> {
    const [updated] = await db.update(conversionLeads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversionLeads.id, id))
      .returning();
    return updated;
  }

  async approveConversionLead(id: number, approvedBy: string): Promise<ConversionLead | undefined> {
    const [updated] = await db.update(conversionLeads)
      .set({
        status: "approved",
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversionLeads.id, id))
      .returning();
    return updated;
  }

  async rejectConversionLead(id: number, reason: string): Promise<ConversionLead | undefined> {
    const [updated] = await db.update(conversionLeads)
      .set({
        status: "rejected",
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(conversionLeads.id, id))
      .returning();
    return updated;
  }

  async getConversionLeadByPhone(phone: string): Promise<ConversionLead | undefined> {
    const [lead] = await db.select().from(conversionLeads)
      .where(eq(conversionLeads.phone, phone))
      .orderBy(desc(conversionLeads.createdAt));
    return lead;
  }

  async getConversionLeadByIdempotencyKey(key: string): Promise<ConversionLead | undefined> {
    const [lead] = await db.select().from(conversionLeads)
      .where(eq(conversionLeads.idempotencyKey, key))
      .limit(1);
    return lead;
  }

  async getPendingConversionLeadsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(conversionLeads)
      .where(eq(conversionLeads.status, "pending_request"));
    return Number(result[0]?.count || 0);
  }

  async createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission> {
    const [created] = await db.insert(contactSubmissions).values(submission).returning();
    return created;
  }

  async getAllContactSubmissions(): Promise<ContactSubmission[]> {
    return db.select().from(contactSubmissions).orderBy(desc(contactSubmissions.createdAt));
  }

  async updateContactSubmissionStatus(id: number, status: string): Promise<ContactSubmission | undefined> {
    const [updated] = await db
      .update(contactSubmissions)
      .set({ status })
      .where(eq(contactSubmissions.id, id))
      .returning();
    return updated;
  }

  async recordPageView(path: string, referrer?: string, userAgent?: string): Promise<void> {
    await db.insert(pageViews).values({ path, referrer: referrer || null, userAgent: userAgent || null });
  }

  async getPageViewStats(): Promise<{ topPages: { path: string; views: number }[]; dailyViews: { date: string; views: number }[]; totalViews: number }> {
    const topPages = await db
      .select({ path: pageViews.path, views: sql<number>`count(*)::int` })
      .from(pageViews)
      .groupBy(pageViews.path)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    const dailyViews = await db
      .select({
        date: sql<string>`to_char(viewed_at, 'YYYY-MM-DD')`,
        views: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(gte(pageViews.viewedAt, sql`now() - interval '30 days'`))
      .groupBy(sql`to_char(viewed_at, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(viewed_at, 'YYYY-MM-DD')`);

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pageViews);

    return {
      topPages,
      dailyViews,
      totalViews: totalResult[0]?.count || 0,
    };
  }

  // ==========================================
  // DOCTOR PARTNER OPERATIONS
  // ==========================================
  async getAllDoctorPartners(activeOnly = false): Promise<DoctorPartner[]> {
    if (activeOnly) {
      return await db.select().from(doctorPartners).where(eq(doctorPartners.isActive, true)).orderBy(asc(doctorPartners.lastName));
    }
    return await db.select().from(doctorPartners).orderBy(asc(doctorPartners.lastName));
  }

  async getDoctorPartner(id: number): Promise<DoctorPartner | undefined> {
    const [d] = await db.select().from(doctorPartners).where(eq(doctorPartners.id, id));
    return d || undefined;
  }

  async createDoctorPartner(data: InsertDoctorPartner): Promise<DoctorPartner> {
    const [d] = await db.insert(doctorPartners).values(data).returning();
    return d;
  }

  async updateDoctorPartner(id: number, updates: Partial<InsertDoctorPartner>): Promise<DoctorPartner | undefined> {
    const [d] = await db.update(doctorPartners).set(updates).where(eq(doctorPartners.id, id)).returning();
    return d || undefined;
  }

  async deleteDoctorPartner(id: number): Promise<boolean> {
    const result = await db.delete(doctorPartners).where(eq(doctorPartners.id, id)).returning();
    return result.length > 0;
  }

  async matchDoctorPartners(criteria: { specialty: string; language: string; genderPreference: string; borough: string }): Promise<DoctorPartner[]> {
    // Pull all active partners and rank them across all four criteria so we can
    // gracefully fall back when there aren't perfect matches in the network.
    const all = await db.select().from(doctorPartners).where(eq(doctorPartners.isActive, true));
    const wantSpec = criteria.specialty && criteria.specialty !== "any";
    const wantLang = criteria.language && criteria.language !== "any";
    const wantGender = criteria.genderPreference && criteria.genderPreference !== "any";
    const wantBorough = criteria.borough && criteria.borough !== "any";

    const scored = all.map((d) => {
      let score = 0;
      // Specialty is the strongest signal.
      if (wantSpec && d.specialty === criteria.specialty) score += 10;
      if (wantLang && (d.languages || []).includes(criteria.language)) score += 6;
      if (wantBorough && d.borough === criteria.borough) score += 4;
      if (wantGender && (d.gender === criteria.genderPreference || d.gender === "any")) score += 3;
      // Slight preference for doctors accepting new patients.
      if (d.acceptingNewPatients) score += 1;
      return { d, score };
    });

    // If user provided strict specialty preference, require at least the specialty match.
    let candidates = scored;
    if (wantSpec) {
      const exact = scored.filter((s) => s.d.specialty === criteria.specialty);
      if (exact.length > 0) candidates = exact;
    }

    candidates.sort((a, b) => b.score - a.score || a.d.lastName.localeCompare(b.d.lastName));
    return candidates.slice(0, 3).map((s) => s.d);
  }

  async createDoctorMatchLead(data: InsertDoctorMatchLead): Promise<DoctorMatchLead> {
    const [lead] = await db.insert(doctorMatchLeads).values(data).returning();
    return lead;
  }

  async getDoctorMatchLeadById(id: number): Promise<DoctorMatchLead | undefined> {
    const [lead] = await db.select().from(doctorMatchLeads).where(eq(doctorMatchLeads.id, id));
    return lead;
  }

  async updateDoctorMatchLeadSelection(id: number, selectedDoctorId: number): Promise<DoctorMatchLead | undefined> {
    const [lead] = await db.update(doctorMatchLeads).set({ selectedDoctorId }).where(eq(doctorMatchLeads.id, id)).returning();
    return lead;
  }

  async submitDoctorMatchRequest(
    id: number,
    data: { patientName: string; patientPhone: string; patientEmail?: string | null; preferredTime?: string | null; preferredDays?: string[] | null; preferredTimesOfDay?: string[] | null; patientNotes?: string | null; selectedDoctorId?: number | null }
  ): Promise<DoctorMatchLead | undefined> {
    const updates: Partial<DoctorMatchLead> = {
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail ?? null,
      preferredTime: data.preferredTime ?? null,
      preferredDays: data.preferredDays ?? null,
      preferredTimesOfDay: data.preferredTimesOfDay ?? null,
      patientNotes: data.patientNotes ?? null,
      requestedAt: new Date(),
    };
    if (data.selectedDoctorId != null) {
      updates.selectedDoctorId = data.selectedDoctorId;
    }
    const [lead] = await db.update(doctorMatchLeads).set(updates).where(eq(doctorMatchLeads.id, id)).returning();
    return lead;
  }

  async getDoctorMatchLeads(): Promise<DoctorMatchLead[]> {
    return await db.select().from(doctorMatchLeads).orderBy(desc(doctorMatchLeads.createdAt));
  }

  async getNotificationRecipients(notificationType?: string): Promise<NotificationRecipient[]> {
    const query = notificationType
      ? db.select().from(notificationRecipients).where(eq(notificationRecipients.notificationType, notificationType))
      : db.select().from(notificationRecipients);
    return await query.orderBy(asc(notificationRecipients.id));
  }

  async createNotificationRecipient(data: InsertNotificationRecipient): Promise<NotificationRecipient> {
    const [row] = await db.insert(notificationRecipients).values(data).returning();
    return row;
  }

  async updateNotificationRecipient(id: number, updates: Partial<InsertNotificationRecipient>): Promise<NotificationRecipient | undefined> {
    const [row] = await db
      .update(notificationRecipients)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(notificationRecipients.id, id))
      .returning();
    return row;
  }

  async deleteNotificationRecipient(id: number): Promise<boolean> {
    const result = await db.delete(notificationRecipients).where(eq(notificationRecipients.id, id)).returning();
    return result.length > 0;
  }

  async getNotificationSetting(key: string): Promise<NotificationSetting | undefined> {
    const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.settingKey, key));
    return row;
  }

  async setNotificationSetting(key: string, value: string): Promise<NotificationSetting> {
    const existing = await this.getNotificationSetting(key);
    if (existing) {
      const [row] = await db
        .update(notificationSettings)
        .set({ settingValue: value, updatedAt: new Date() })
        .where(eq(notificationSettings.settingKey, key))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(notificationSettings)
      .values({ settingKey: key, settingValue: value })
      .returning();
    return row;
  }

  async appendTestEmailLog(entry: InsertTestEmailLog): Promise<TestEmailLog> {
    const [row] = await db.insert(testEmailLogs).values(entry).returning();
    return row;
  }

  async getTestEmailLogs(limit = 10): Promise<TestEmailLog[]> {
    return db
      .select()
      .from(testEmailLogs)
      .orderBy(desc(testEmailLogs.sentAt))
      .limit(limit);
  }

  async pruneOldTestEmailLogs(olderThanDays: number): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await db.delete(testEmailLogs).where(lte(testEmailLogs.sentAt, cutoff));
  }

  async deleteTestEmailLog(id: number): Promise<void> {
    await db.delete(testEmailLogs).where(eq(testEmailLogs.id, id));
  }

  async clearAllTestEmailLogs(): Promise<void> {
    await db.delete(testEmailLogs);
  }

  // Sync outbox — retryable queue for outbound ConcordiaCare pushes
  async createSyncOutboxEntry(entry: InsertSyncOutboxEntry): Promise<SyncOutboxEntry> {
    const [row] = await db.insert(syncOutbox).values(entry).returning();
    return row;
  }

  async getPendingSyncOutboxEntries(): Promise<SyncOutboxEntry[]> {
    const now = new Date();
    return db
      .select()
      .from(syncOutbox)
      .where(
        and(
          eq(syncOutbox.status, "pending"),
          lte(syncOutbox.nextRetryAt, now)
        )
      )
      .orderBy(asc(syncOutbox.nextRetryAt))
      .limit(50);
  }

  async getRecentSyncOutboxEntries(limit: number): Promise<SyncOutboxEntry[]> {
    return db
      .select()
      .from(syncOutbox)
      .orderBy(desc(syncOutbox.createdAt))
      .limit(limit);
  }

  async markSyncOutboxDelivered(id: number): Promise<void> {
    await db
      .update(syncOutbox)
      .set({ status: "delivered", lastError: null })
      .where(eq(syncOutbox.id, id));
  }

  async scheduleSyncOutboxRetry(id: number, nextRetryAt: Date, reason: string): Promise<void> {
    await db.update(syncOutbox).set({ status: "pending", nextRetryAt, lastError: reason })
      .where(eq(syncOutbox.id, id));
  }

  async markSyncOutboxFailed(id: number, error: string): Promise<void> {
    await db
      .update(syncOutbox)
      .set({ status: "failed", lastError: error })
      .where(eq(syncOutbox.id, id));
  }

  async incrementSyncOutboxAttempt(id: number, nextRetryAt: Date, lastError?: string): Promise<void> {
    await db
      .update(syncOutbox)
      .set({
        attempts: sql`${syncOutbox.attempts} + 1`,
        nextRetryAt,
        ...(lastError ? { lastError } : {}),
      })
      .where(eq(syncOutbox.id, id));
  }

  // ============================================================
  // CARE NAVIGATOR — Patient Conditions
  // ============================================================

  async getPatientConditions(userId: string): Promise<PatientCondition[]> {
    return db
      .select()
      .from(patientConditions)
      .where(eq(patientConditions.userId, userId))
      .orderBy(desc(patientConditions.createdAt));
  }

  async getPatientCondition(id: string): Promise<PatientCondition | undefined> {
    const [row] = await db
      .select()
      .from(patientConditions)
      .where(eq(patientConditions.id, id));
    return row || undefined;
  }

  async createPatientCondition(condition: InsertPatientCondition): Promise<PatientCondition> {
    const [row] = await db.insert(patientConditions).values(condition).returning();
    return row;
  }

  async updatePatientCondition(id: string, updates: Partial<InsertPatientCondition>): Promise<PatientCondition | undefined> {
    const [row] = await db
      .update(patientConditions)
      .set(updates)
      .where(eq(patientConditions.id, id))
      .returning();
    return row || undefined;
  }

  async deletePatientCondition(id: string): Promise<void> {
    await db.delete(patientConditions).where(eq(patientConditions.id, id));
  }

  // ============================================================
  // CARE NAVIGATOR — Health Journal
  // ============================================================

  async getHealthJournalEntries(
    userId: string,
    options?: { conditionId?: string; limit?: number; offset?: number }
  ): Promise<HealthJournalEntry[]> {
    const conditions = [eq(healthJournalEntries.userId, userId)];
    if (options?.conditionId) {
      conditions.push(eq(healthJournalEntries.conditionId, options.conditionId));
    }
    const query = db
      .select()
      .from(healthJournalEntries)
      .where(and(...conditions))
      .orderBy(desc(healthJournalEntries.entryDate))
      .limit(options?.limit ?? 90)
      .offset(options?.offset ?? 0);
    return query;
  }

  async getHealthJournalEntry(id: string): Promise<HealthJournalEntry | undefined> {
    const [row] = await db
      .select()
      .from(healthJournalEntries)
      .where(eq(healthJournalEntries.id, id));
    return row || undefined;
  }

  async createHealthJournalEntry(entry: InsertHealthJournalEntry): Promise<HealthJournalEntry> {
    const [row] = await db.insert(healthJournalEntries).values(entry).returning();
    return row;
  }

  // ============================================================
  // CARE NAVIGATOR — Condition Explainer Cache
  // ============================================================

  async getConditionExplainerCache(conditionKey: string): Promise<{ responseJson: unknown; generatedAt: Date } | undefined> {
    const [row] = await db
      .select()
      .from(conditionExplainerCache)
      .where(eq(conditionExplainerCache.conditionKey, conditionKey))
      .limit(1);
    if (!row) return undefined;
    return { responseJson: row.responseJson, generatedAt: row.generatedAt };
  }

  async upsertConditionExplainerCache(conditionKey: string, responseJson: unknown): Promise<void> {
    await db
      .insert(conditionExplainerCache)
      .values({ conditionKey, responseJson: responseJson as any })
      .onConflictDoUpdate({
        target: conditionExplainerCache.conditionKey,
        set: { responseJson: responseJson as any, generatedAt: new Date() },
      });
  }

  async recordChatEvent(eventType: string, intent?: string, pagePath?: string): Promise<void> {
    await db.insert(chatEvents).values({ eventType, intent, pagePath });
  }

  async getChatEventStats(): Promise<{ eventType: string; count: number }[]> {
    const rows = await db
      .select({
        eventType: chatEvents.eventType,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(chatEvents)
      .groupBy(chatEvents.eventType)
      .orderBy(desc(sql`count(*)`));
    return rows;
  }

  async createRestockNotification(data: InsertRestockNotification): Promise<RestockNotification> {
    const [row] = await db.insert(restockNotifications).values(data).returning();
    return row;
  }

  async getRestockNotifications(status?: string): Promise<RestockNotification[]> {
    const query = db.select().from(restockNotifications);
    if (status) {
      return query.where(eq(restockNotifications.status, status)).orderBy(desc(restockNotifications.createdAt));
    }
    return query.orderBy(desc(restockNotifications.createdAt));
  }

  async getPendingRestockNotificationsByTarget(category?: string, productId?: string): Promise<RestockNotification[]> {
    if (!category && !productId) return [];
    // Match semantics:
    //   product-level subscriptions  → productId IS NOT NULL AND productId = :productId
    //   category-level subscriptions → productId IS NULL AND category = :category
    // This prevents a product-specific subscription from firing when a different product
    // in the same category is restocked.
    const orConditions: any[] = [];
    if (productId) {
      // Rows created with a specific product (productId set, whether or not category is also set)
      orConditions.push(and(isNotNull(restockNotifications.productId), eq(restockNotifications.productId, productId)));
    }
    if (category) {
      // Rows created for a whole category (no productId)
      orConditions.push(and(isNull(restockNotifications.productId), eq(restockNotifications.category, category)));
    }
    return db
      .select()
      .from(restockNotifications)
      .where(and(eq(restockNotifications.status, "pending"), or(...orConditions)))
      .orderBy(asc(restockNotifications.createdAt));
  }

  async markRestockNotificationSent(id: number): Promise<void> {
    await db
      .update(restockNotifications)
      .set({ status: "sent", notifiedAt: new Date() })
      .where(eq(restockNotifications.id, id));
  }

  async deleteRestockNotification(id: number): Promise<void> {
    await db.delete(restockNotifications).where(eq(restockNotifications.id, id));
  }

  async clearSentRestockNotifications(): Promise<number> {
    const result = await db
      .delete(restockNotifications)
      .where(eq(restockNotifications.status, "sent"))
      .returning({ id: restockNotifications.id });
    return result.length;
  }

  // ============================================================
  // ENGINE 1 — NDC Drug Info Cache
  // ============================================================

  async getDrugInfoCache(ndc: string): Promise<DrugInfoCache | undefined> {
    const [row] = await db
      .select()
      .from(drugInfoCache)
      .where(eq(drugInfoCache.ndc, ndc))
      .limit(1);
    return row ?? undefined;
  }

  async upsertDrugInfoCache(data: InsertDrugInfoCache): Promise<DrugInfoCache> {
    const [row] = await db
      .insert(drugInfoCache)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: drugInfoCache.ndc,
        set: {
          brandName: data.brandName,
          genericName: data.genericName,
          labelerName: data.labelerName,
          dosageFormName: data.dosageFormName,
          routeName: data.routeName,
          strength: data.strength,
          deaSchedule: data.deaSchedule,
          productType: data.productType,
          marketingStatus: data.marketingStatus,
          substanceName: data.substanceName,
          pharmClass: data.pharmClass,
          warningsJson: data.warningsJson,
          inactiveIngredients: data.inactiveIngredients,
          packagingJson: data.packagingJson,
          rawFdaJson: data.rawFdaJson,
          fetchedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async listDrugInfoCache(limit = 100, offset = 0): Promise<DrugInfoCache[]> {
    return db
      .select()
      .from(drugInfoCache)
      .orderBy(desc(drugInfoCache.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  // ============================================================
  // ENGINE 2 — Clinical Notes
  // ============================================================

  async getClinicalNotes(userId: string, options?: { limit?: number; offset?: number; status?: string }): Promise<ClinicalNote[]> {
    const conditions = [eq(clinicalNotes.userId, userId)];
    if (options?.status) {
      conditions.push(eq(clinicalNotes.status, options.status));
    }
    return db
      .select()
      .from(clinicalNotes)
      .where(and(...conditions))
      .orderBy(desc(clinicalNotes.noteDate))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  async getClinicalNote(id: string): Promise<ClinicalNote | undefined> {
    const [row] = await db
      .select()
      .from(clinicalNotes)
      .where(eq(clinicalNotes.id, id));
    return row ?? undefined;
  }

  async createClinicalNote(data: InsertClinicalNote): Promise<ClinicalNote> {
    const [row] = await db.insert(clinicalNotes).values(data).returning();
    return row;
  }

  async updateClinicalNote(id: string, updates: Partial<InsertClinicalNote>): Promise<ClinicalNote | undefined> {
    const [row] = await db
      .update(clinicalNotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clinicalNotes.id, id))
      .returning();
    return row ?? undefined;
  }

  async deleteClinicalNote(id: string): Promise<void> {
    await db.delete(clinicalNotes).where(eq(clinicalNotes.id, id));
  }

  async listAllClinicalNotes(options?: { limit?: number; offset?: number; status?: string }): Promise<ClinicalNote[]> {
    const conditions = options?.status ? [eq(clinicalNotes.status, options.status)] : [];
    const query = db.select().from(clinicalNotes);
    if (conditions.length) query.where(and(...conditions));
    return query.orderBy(desc(clinicalNotes.noteDate)).limit(options?.limit ?? 100).offset(options?.offset ?? 0);
  }

  // ============================================================
  // ENGINE 3 — Prior Authorization Requests
  // ============================================================

  async createPriorAuthRequest(data: InsertPriorAuthorizationRequest): Promise<PriorAuthorizationRequest> {
    const [row] = await db.insert(priorAuthorizationRequests).values(data).returning();
    return row;
  }

  async getPriorAuthRequest(id: string): Promise<PriorAuthorizationRequest | undefined> {
    const [row] = await db
      .select()
      .from(priorAuthorizationRequests)
      .where(eq(priorAuthorizationRequests.id, id));
    return row ?? undefined;
  }

  async getPatientPriorAuthRequests(userId: string): Promise<PriorAuthorizationRequest[]> {
    return db
      .select()
      .from(priorAuthorizationRequests)
      .where(eq(priorAuthorizationRequests.userId, userId))
      .orderBy(desc(priorAuthorizationRequests.createdAt));
  }

  async listAllPriorAuthRequests(options?: {
    status?: string;
    limit?: number;
    offset?: number;
    assignedTo?: string;
  }): Promise<PriorAuthorizationRequest[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (options?.status) conditions.push(eq(priorAuthorizationRequests.status, options.status as any));
    if (options?.assignedTo) conditions.push(eq(priorAuthorizationRequests.assignedTo, options.assignedTo));
    const query = db.select().from(priorAuthorizationRequests);
    if (conditions.length) query.where(and(...conditions));
    return query
      .orderBy(desc(priorAuthorizationRequests.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async updatePriorAuthRequest(id: string, updates: Partial<InsertPriorAuthorizationRequest>): Promise<PriorAuthorizationRequest | undefined> {
    const [row] = await db
      .update(priorAuthorizationRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(priorAuthorizationRequests.id, id))
      .returning();
    return row ?? undefined;
  }

  async countPriorAuthRequestsByStatus(): Promise<{ status: string; count: number }[]> {
    const rows = await db
      .select({ status: priorAuthorizationRequests.status, count: sql<number>`count(*)::int` })
      .from(priorAuthorizationRequests)
      .groupBy(priorAuthorizationRequests.status);
    return rows.map((r) => ({ status: r.status, count: r.count }));
  }

  async getPriorAuthRequestBySignatureToken(tokenHash: string): Promise<PriorAuthorizationRequest | undefined> {
    const [row] = await db
      .select()
      .from(priorAuthorizationRequests)
      .where(
        and(
          eq(priorAuthorizationRequests.signatureTokenHash, tokenHash),
          sql`${priorAuthorizationRequests.signatureTokenExpiresAt} > now()`
        )
      );
    return row ?? undefined;
  }

  /**
   * Single conditional UPDATE that both validates and consumes the token.
   * If another request already cleared the token, no rows match → returns null.
   * This prevents double-submission under concurrent requests.
   */
  async submitSignatureAtomically(params: {
    tokenHash: string;
    signedLetterHtml: string;
    signatureReceivedAt: Date;
  }): Promise<PriorAuthorizationRequest | null> {
    const [row] = await db
      .update(priorAuthorizationRequests)
      .set({
        signedLetterHtml: params.signedLetterHtml,
        signatureReceivedAt: params.signatureReceivedAt,
        signatureStatus: "received",
        status: "signature_received",
        signatureTokenHash: null,
        signatureTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(priorAuthorizationRequests.signatureTokenHash, params.tokenHash),
          sql`${priorAuthorizationRequests.signatureTokenExpiresAt} > now()`,
          eq(priorAuthorizationRequests.signatureStatus, "requested" as any)
        )
      )
      .returning();
    return row ?? null;
  }

  async getPaAnalytics(): Promise<{
    headline: {
      totalThisMonth: number;
      avgTatHours: number | null;
      approvalRate: number;
      denialRate: number;
      appealSuccessRate: number;
      timeSavedHours: number;
      aiGeneratedCount: number;
    };
    monthly: Array<{ month: string; submitted: number; approved: number; denied: number; total: number }>;
    payerBreakdown: Array<{
      payer: string;
      total: number;
      approved: number;
      denied: number;
      approvalRate: number;
      avgTatHours: number | null;
      commonDenialReason: string | null;
    }>;
    medicationBreakdown: Array<{
      medicationName: string;
      total: number;
      approved: number;
      denied: number;
      approvalRate: number;
    }>;
  }> {
    const [headlineRows, submittedMonthly, approvedMonthly, deniedMonthly, payerRows, medicationRows] = await Promise.all([
      // ── Headline aggregates ──────────────────────────────────────────────────
      // Rates are computed against RESOLVED decisions (approved + denied) only.
      // Drafts, pending, RFI, cancelled, and in-progress PAs are excluded from
      // the approval/denial rate denominator — they have not received a decision.
      db.execute(sql`
        SELECT
          -- "this month" = PAs submitted this month (not drafts)
          COUNT(*) FILTER (WHERE submitted_at >= date_trunc('month', NOW()))::int   AS this_month_submitted,
          COUNT(*) FILTER (WHERE status = 'approved')::int                          AS total_approved,
          COUNT(*) FILTER (WHERE status = 'denied')::int                            AS total_denied,
          -- Resolved decisions = approved + denied (denominator for rates)
          (COUNT(*) FILTER (WHERE status = 'approved') +
           COUNT(*) FILTER (WHERE status = 'denied'))::int                          AS resolved,
          COUNT(*) FILTER (WHERE ai_generated = TRUE)::int                          AS ai_generated,
          COUNT(*) FILTER (WHERE appeal_submitted_at IS NOT NULL)::int              AS appeals_submitted,
          COUNT(*) FILTER (WHERE appeal_submitted_at IS NOT NULL AND status = 'approved')::int
                                                                                    AS appeals_approved,
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (response_received_at - submitted_at)) / 3600.0
            ) FILTER (WHERE response_received_at IS NOT NULL AND submitted_at IS NOT NULL)::numeric,
            1
          )::float                                                                  AS avg_tat_hours
        FROM prior_authorization_requests
      `),

      // ── Monthly submissions — grouped by submitted_at ──────────────────────
      db.execute(sql`
        SELECT
          TO_CHAR(date_trunc('month', submitted_at), 'YYYY-MM') AS month,
          COUNT(*)::int                                           AS cnt
        FROM prior_authorization_requests
        WHERE submitted_at IS NOT NULL
          AND submitted_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY month
        ORDER BY month
      `),

      // ── Monthly approvals — grouped by response_received_at ───────────────
      db.execute(sql`
        SELECT
          TO_CHAR(date_trunc('month', response_received_at), 'YYYY-MM') AS month,
          COUNT(*)::int                                                    AS cnt
        FROM prior_authorization_requests
        WHERE status = 'approved'
          AND response_received_at IS NOT NULL
          AND response_received_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY month
        ORDER BY month
      `),

      // ── Monthly denials — grouped by response_received_at ─────────────────
      db.execute(sql`
        SELECT
          TO_CHAR(date_trunc('month', response_received_at), 'YYYY-MM') AS month,
          COUNT(*)::int                                                    AS cnt
        FROM prior_authorization_requests
        WHERE status = 'denied'
          AND response_received_at IS NOT NULL
          AND response_received_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
        GROUP BY month
        ORDER BY month
      `),

      // ── Payer breakdown — rates against resolved decisions ────────────────
      db.execute(sql`
        SELECT
          COALESCE(insurance_plan, 'Unknown Payer')                                 AS payer,
          COUNT(*)::int                                                              AS total,
          COUNT(*) FILTER (WHERE status = 'approved')::int                          AS approved,
          COUNT(*) FILTER (WHERE status = 'denied')::int                            AS denied,
          ROUND(
            AVG(EXTRACT(EPOCH FROM (response_received_at - submitted_at)) / 3600.0)
              FILTER (WHERE response_received_at IS NOT NULL AND submitted_at IS NOT NULL)::numeric,
            1
          )::float                                                                   AS avg_tat_hours,
          (
            SELECT denial_reason
            FROM prior_authorization_requests sub
            WHERE sub.insurance_plan = par.insurance_plan
              AND sub.denial_reason IS NOT NULL
            GROUP BY denial_reason
            ORDER BY COUNT(*) DESC
            LIMIT 1
          )                                                                          AS common_denial_reason
        FROM prior_authorization_requests par
        GROUP BY insurance_plan
        ORDER BY total DESC
        LIMIT 20
      `),

      // ── Medication breakdown — top 10 by volume, rates against resolved ───
      db.execute(sql`
        SELECT
          medication_name,
          COUNT(*)::int                                          AS total,
          COUNT(*) FILTER (WHERE status = 'approved')::int      AS approved,
          COUNT(*) FILTER (WHERE status = 'denied')::int        AS denied
        FROM prior_authorization_requests
        GROUP BY medication_name
        ORDER BY total DESC
        LIMIT 10
      `),
    ]);

    // ── Parse headline ──────────────────────────────────────────────────────
    const h = (headlineRows.rows[0] ?? {}) as Record<string, unknown>;
    const totalApproved = Number(h.total_approved ?? 0);
    const totalDenied = Number(h.total_denied ?? 0);
    const appealsSubmitted = Number(h.appeals_submitted ?? 0);
    const appealsApproved = Number(h.appeals_approved ?? 0);
    const aiGenerated = Number(h.ai_generated ?? 0);

    const { approvalRate, denialRate } = computeDecisionRates(totalApproved, totalDenied);
    const { approvalRate: appealSuccessRate } = computeDecisionRates(appealsApproved, appealsSubmitted - appealsApproved);

    const headline = {
      totalThisMonth: Number(h.this_month_submitted ?? 0),
      avgTatHours: h.avg_tat_hours != null ? Number(h.avg_tat_hours) : null,
      approvalRate,
      denialRate,
      appealSuccessRate,
      timeSavedHours: Math.round(aiGenerated * 0.75), // 45 min per PA
      aiGeneratedCount: aiGenerated,
    };

    // ── Build monthly series — guaranteed 6 months, all zero-filled ─────────
    const toMap = (rows: Array<Record<string, unknown>>) =>
      new Map(rows.map((r) => [String(r.month ?? ""), Number(r.cnt ?? 0)]));

    const monthly = buildMonthlySeries(
      toMap(submittedMonthly.rows as Array<Record<string, unknown>>),
      toMap(approvedMonthly.rows as Array<Record<string, unknown>>),
      toMap(deniedMonthly.rows as Array<Record<string, unknown>>)
    );

    // ── Payer breakdown — approval rate against resolved decisions ──────────
    const payerBreakdown = (payerRows.rows as Array<Record<string, unknown>>).map((r) => {
      const approved = Number(r.approved ?? 0);
      const denied = Number(r.denied ?? 0);
      return {
        payer: String(r.payer ?? ""),
        total: Number(r.total ?? 0),
        approved,
        denied,
        approvalRate: computeItemRate(approved, denied),
        avgTatHours: r.avg_tat_hours != null ? Number(r.avg_tat_hours) : null,
        commonDenialReason: r.common_denial_reason ? String(r.common_denial_reason) : null,
      };
    });

    // ── Medication breakdown — approval rate against resolved decisions ──────
    const medicationBreakdown = (medicationRows.rows as Array<Record<string, unknown>>).map((r) => {
      const approved = Number(r.approved ?? 0);
      const denied = Number(r.denied ?? 0);
      return {
        medicationName: String(r.medication_name ?? ""),
        total: Number(r.total ?? 0),
        approved,
        denied,
        approvalRate: computeItemRate(approved, denied),
      };
    });

    return { headline, monthly, payerBreakdown, medicationBreakdown };
  }
}

export const storage = new DatabaseStorage();
