import type { IStorage } from "./storage";
import type { Order } from "@shared/schema";
import { notifyStaffAppSale } from "./staff-sync";
import { verifyStaffAvailability } from "./staff-catalog";
import { randomUUID } from "crypto";
import {
  formatDeliveryAddress,
  validateAddressSelection,
  type VerifiedAddressSelectionInput,
} from "./address-verification";

export type CheckoutResult =
  | { ok: true; order: Order; staffHandoff: "confirmed" | "needs_review" }
  | { ok: false; status: number; message: string; errors?: unknown[] };

export interface PointsServiceDep {
  calculatePointsForPurchase(total: number): Promise<{ points: number }>;
  awardPoints(params: {
    userId: string;
    actionType: string;
    points: number;
    description: string;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
}

export async function processAuthenticatedCheckout(
  userId: string,
  body: {
    pointsToUse?: number;
    source?: string;
    deliveryMethod?: "pickup" | "delivery";
    shippingAddress?: string;
    shippingAddressUnit?: string;
    shippingAddressVerification?: VerifiedAddressSelectionInput;
    pickupSlot?: string;
    correlationId?: string;
    paymentIntentId?: string;
    expectedTotal?: number;
    expectedItems?: Array<{ productId: string; quantity: number }>;
  },
  storageImpl: IStorage,
  pointsServiceImpl: PointsServiceDep,
  onOrderCreated?: (orderId: string, orderNumber: string, total: number) => Promise<void>
): Promise<CheckoutResult> {
  if (body.deliveryMethod === "delivery") {
    const addressValidation = validateAddressSelection(
      body.shippingAddress,
      body.shippingAddressVerification
    );
    if (!addressValidation.valid) {
      return {
        ok: false,
        status: 400,
        message: addressValidation.message,
      };
    }
  }

  const pointsToUse = body.pointsToUse ?? 0;

  const user = await storageImpl.getUser(userId);
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const wallet = await storageImpl.getOrCreatePointsWallet(userId);
  const walletBalance = wallet?.currentBalance ?? 0;

  if (pointsToUse > walletBalance) {
    return { ok: false, status: 400, message: "Insufficient loyalty points" };
  }

  const cartContents = await storageImpl.getCartItemsByUserId(userId);
  if (cartContents.length === 0) {
    return { ok: false, status: 400, message: "Cart is empty" };
  }
  // Prescription fulfillment has its own request workflow. Never turn an Rx
  // cart row into a grocery checkout/order item.
  if (cartContents.some((item) => item.prescriptionId || item.itemType === "prescription")) {
    return {
      ok: false,
      status: 400,
      message: "Prescription items must be submitted through the prescription request workflow",
    };
  }

  const productItems = cartContents.filter(
    (item) => item.product && item.productId
  );
  try {
    if (!await verifyStaffAvailability(productItems.map(item => ({ productId: item.productId!, quantity: item.quantity }))))
      return { ok: false, status: 409, message: "Staff inventory changed. Refresh your cart before ordering." };
    // Use newly authoritative prices and availability, not hydrated cart snapshots.
    for (const item of productItems) item.product = (await storageImpl.getProduct(item.productId!)) ?? item.product;
  } catch {
    return { ok: false, status: 503, message: "Staff inventory cannot be verified. No order was created." };
  }

  if (body.expectedItems) {
    const currentItems = productItems
      .map((item) => ({ productId: item.productId!, quantity: item.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId));
    const expectedItems = [...body.expectedItems].sort((a, b) => a.productId.localeCompare(b.productId));
    if (
      currentItems.length !== expectedItems.length ||
      currentItems.some((item, index) =>
        item.productId !== expectedItems[index]?.productId ||
        item.quantity !== expectedItems[index]?.quantity
      )
    ) {
      return { ok: false, status: 409, message: "Cart changed while payment was processing. No order was created." };
    }
  }

  for (const item of productItems) {
    if (!item.product!.inStock) {
      return {
        ok: false,
        status: 400,
        message: `Product ${item.product!.name} is out of stock`,
      };
    }
    if (item.product!.stockQuantity < item.quantity) {
      return {
        ok: false,
        status: 400,
        message: `Insufficient stock for ${item.product!.name}. Only ${
          item.product!.stockQuantity
        } available.`,
      };
    }
  }

  const subtotal = productItems.reduce(
    (sum, item) => sum + parseFloat(item.product!.price) * item.quantity,
    0
  );
  const pointsDiscount = pointsToUse ? pointsToUse / 1000 : 0;
  const total = Math.max(0, subtotal - pointsDiscount);
  if (body.expectedTotal != null && Math.abs(total - body.expectedTotal) > 0.005) {
    return { ok: false, status: 409, message: "Cart total changed while payment was processing. No order was created." };
  }
  if (!body.paymentIntentId) {
    return { ok: false, status: 402, message: "A confirmed Stripe payment is required before an order can be created" };
  }

  const { points: pointsEarned } =
    await pointsServiceImpl.calculatePointsForPurchase(total);

  // Staff owns stock. This legacy helper is not exposed by a payment route;
  // a saved request or import acknowledgment is not a reservation.

  const correlationId = body.correlationId ?? randomUUID();
  const orderNumber = `ORD-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 5)
    .toUpperCase()}`;

  let pointsWereDeducted = false;

  if (pointsToUse > 0) {
    const deductionResult = await storageImpl.deductPoints({
      userId,
      actionType: "redeem_otc",
      points: pointsToUse,
      description: `Redeemed for order #${orderNumber}`,
      referenceType: "order",
      referenceId: orderNumber,
    });
    if (!deductionResult) {
      return {
        ok: false,
        status: 409,
        message:
          "Unable to redeem points. Your balance may have changed. Please refresh and try again.",
      };
    }
    pointsWereDeducted = true;
    await storageImpl.createLoyaltyTransaction({
      userId,
      orderId: undefined,
      points: -pointsToUse,
      type: "redeemed",
      description: `Redeemed for order #${orderNumber}`,
    });
  }

  const restorePoints = async () => {
    if (pointsWereDeducted && pointsToUse > 0) {
      await storageImpl.awardPoints({
        userId,
        actionType: "admin_adjustment",
        points: pointsToUse,
        description: `Refund - Order #${orderNumber} failed`,
        referenceType: "order",
        referenceId: orderNumber,
      });
    }
  };

  let order: Order;
  try {
    order = await storageImpl.createOrder({
      userId,
      orderNumber,
      type: "otc",
       status: "pending",
      subtotal: subtotal.toString(),
      pointsUsed: pointsToUse,
      pointsEarned,
      total: total.toString(),
       paymentIntentId: body.paymentIntentId,
      paymentStatus: "paid_online",
      concordiaCareOrderId: correlationId,
      source: (body.source ?? "website") as "website" | "app" | "in_store",
      deliveryMethod: body.deliveryMethod ?? "pickup",
      pickupSlot: body.pickupSlot ?? null,
       shippingAddress:
         body.deliveryMethod === "delivery"
           ? formatDeliveryAddress(body.shippingAddress, body.shippingAddressUnit)
           : null,
    });
  } catch (err) {
    await restorePoints();
    throw err;
  }

  if (onOrderCreated) {
    await onOrderCreated(order.id, orderNumber, total);
  }

  try {
    for (const item of productItems) {
      const itemName = item.product!.name;
      const itemPrice = item.product!.price;
      await storageImpl.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        prescriptionId: null,
        name: itemName,
        quantity: item.quantity,
        price: itemPrice,
      });
    }
  } catch (err) {
    await restorePoints();
    throw err;
  }

  // Never create a staff order before its local line items exist. This is
  // still best-effort delivery; a receiver-side acknowledgment and durable
  // retry contract are needed before claiming full reconciliation.
  const staffConfirmed = await notifyStaffAppSale(
    orderNumber,
    productItems.map((item) => ({ productId: item.productId!, quantity: item.quantity })),
    {
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Patient",
      email: user.email ?? null,
      phone: user.phoneNumber ?? null,
      deliveryMethod: body.deliveryMethod ?? "pickup",
      shippingAddress: body.deliveryMethod === "delivery"
        ? formatDeliveryAddress(body.shippingAddress, body.shippingAddressUnit)
        : null,
      pickupSlot: body.pickupSlot ?? null,
      correlationId,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod ?? "online",
      source: order.source,
    },
  );

  if (pointsEarned > 0) {
    await pointsServiceImpl.awardPoints({
      userId,
      actionType: "otc_purchase",
      points: pointsEarned,
      description: `Earned from order #${orderNumber}`,
      referenceType: "order",
      referenceId: order.id,
      idempotencyKey: `otc_purchase_${order.id}`,
    });
    await storageImpl.createLoyaltyTransaction({
      userId,
      orderId: order.id,
      points: pointsEarned,
      type: "earned",
      description: `Earned from order #${orderNumber}`,
    });
  }


  const updatedWallet = await storageImpl.getPointsWallet(userId);
  if (updatedWallet) {
    await storageImpl.updateUserPoints(userId, updatedWallet.currentBalance);
  }

  if (user.referredByUserId && !user.referralPointsAwarded) {
    const userOrders = await storageImpl.getOrdersByUserId(userId);
    if (userOrders.length === 1) {
      const referrerPoints = 500;
      const refereePoints = 250;
      await pointsServiceImpl.awardPoints({
        userId: user.referredByUserId,
        actionType: "referral_completed",
        points: referrerPoints,
        description: `Referral bonus - ${user.firstName || "Someone"} made their first purchase`,
        referenceType: "user",
        referenceId: userId,
        idempotencyKey: `referral_bonus_${user.referredByUserId}_${userId}`,
      });
      await pointsServiceImpl.awardPoints({
        userId,
        actionType: "signup_bonus",
        points: refereePoints,
        description: "Welcome bonus for being referred",
        referenceType: "user",
        referenceId: user.referredByUserId,
        idempotencyKey: `referral_signup_${userId}`,
      });
      await storageImpl.updateUserProfile(userId, { referralPointsAwarded: true });
    }
  }

  await storageImpl.clearCart(userId);

  return { ok: true, order, staffHandoff: staffConfirmed ? "confirmed" : "needs_review" };
}
