import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { SEO } from "@/components/seo";
import { useGuestCart } from "@/hooks/useGuestCart";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Product, HybridCartItem } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { normalizeShopPhone } from "@shared/shop-request";
import { AddressAutocompleteInput, type VerifiedAddressSelection } from "@/components/address-autocomplete-input";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Package, ShieldCheck, Loader2, UserPlus, Store, Banknote, AlertCircle, Truck, CreditCard } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/page-transition";

type DeliveryMethod = "pickup" | "delivery";
type PaymentMethod = "cash";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Arrange with staff",
};


export default function ExpressCheckout() {
  const { toast } = useToast();
  const guestCart = useGuestCart();
  const { user, isAuthenticated, isAdmin, hasSelectedPatient, patientAuthReady, refetchUser } = useAuth();
  const member = patientAuthReady && isAuthenticated && !isAdmin && (!!user || hasSelectedPatient);
  const [, navigate] = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!member || !user) return;
    setName(value => value || [user.firstName, user.lastName].filter(Boolean).join(" "));
    setEmail(value => value || user.email || "");
    setPhone(value => value || user.phoneNumber || "");
  }, [member, user]);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pickup");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingAddressUnit, setShippingAddressUnit] = useState("");
  const [addressSelection, setAddressSelection] = useState<VerifiedAddressSelection | null>(null);
  const paymentMethod: PaymentMethod = "cash";

  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [staffConfirmed, setStaffConfirmed] = useState(false);
  const [confirmedDelivery, setConfirmedDelivery] = useState<DeliveryMethod>("pickup");
  const [confirmedAddress, setConfirmedAddress] = useState("");
  const [confirmedPayment, setConfirmedPayment] = useState<PaymentMethod>("cash");
  const checkoutIdempotencyKey = useRef("");
  if (!checkoutIdempotencyKey.current) {
    // Persist only an opaque key, never contact details. A lost response followed
    // by a reload must not create another independently identified Staff request.
    try { checkoutIdempotencyKey.current = sessionStorage.getItem("concordia_shop_pending_request") || ""; } catch {}
    if (!checkoutIdempotencyKey.current) {
      checkoutIdempotencyKey.current = `shop-request-${crypto.randomUUID()}`;
      try { sessionStorage.setItem("concordia_shop_pending_request", checkoutIdempotencyKey.current); } catch {}
    }
  }

  const { data: allProducts = [], isLoading: isLoadingProducts, isError: productsError } = useQuery<any[]>({
    queryKey: ["/api/public/products"],
    enabled: patientAuthReady,
  });
  const { data: memberCart = [], isLoading: memberCartLoading, isError: memberCartError, refetch: refetchMemberCart } = useQuery<HybridCartItem[]>({
    queryKey: ["/api/cart"], enabled: member,
  });
  const selectedItems = member
    ? memberCart.filter(item => item.productId && !item.prescriptionId).map(item => ({ productId: item.productId!, quantity: item.quantity }))
    : guestCart.items;

  const cartProductItems = selectedItems
    .map((gi) => {
      const product = allProducts.find((p) => p.id === gi.productId);
      return product ? { ...gi, product } : null;
    })
    .filter(Boolean) as Array<{ productId: string; quantity: number; product: Product }>;

  const subtotal = cartProductItems.reduce(
    (sum, item) => sum + parseFloat(item.product.price) * item.quantity, 0
  );

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!patientAuthReady) throw new Error("Wait for your account to load before submitting.");
      const items = selectedItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const details = {
        guestName: name,
        guestPhone: phone,
        guestEmail: email.trim() || undefined,
        notes: notes || undefined,
        deliveryMethod,
        ...(deliveryMethod === "delivery" ? {
          shippingAddress, shippingAddressUnit: shippingAddressUnit.trim() || undefined,
          shippingAddressVerification: addressSelection,
        } : {}),
      };
      const res = await apiRequest("POST", member ? "/api/shop/order-requests" : "/api/checkout/guest",
        member ? details : { ...details, items, paymentMethod: "cash" },
        { "Idempotency-Key": checkoutIdempotencyKey.current });
      return res.json();
    },
    onSuccess: (data: { orderNumber: string; deliveryMethod: string; shippingAddress: string | null; paymentMethod: string; staffHandoff?: string }) => {
      try { sessionStorage.removeItem("concordia_shop_pending_request"); } catch {}
      if (!member) guestCart.clearCart();
      void queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/public/products"] });
      setOrderPlaced(true);
      setOrderNumber(data.orderNumber);
      setStaffConfirmed(data.staffHandoff === "confirmed");
      setConfirmedDelivery(data.deliveryMethod as DeliveryMethod);
      setConfirmedAddress(data.shippingAddress || "");
       setConfirmedPayment("cash");
      toast({ title: "Order Request Saved", description: data.staffHandoff === "confirmed"
        ? `Request #${data.orderNumber} received by staff. They will call to confirm availability and fulfillment.`
        : `Request #${data.orderNumber} needs staff confirmation. Do not place it again.` });
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout Failed",
        description: error.message || "Could not place your order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const phoneDigits = phone.replace(/\D/g, "");
  const inventoryBlocked = !patientAuthReady || isLoadingProducts || productsError || (member && (memberCartLoading || memberCartError)) || selectedItems.some(item => {
    const product = allProducts.find(p => p.id === item.productId);
    return !product || product.inStock === false || item.quantity > product.stockQuantity;
  });

  const isFormValid =
    name.trim().length >= 2 &&
    !!normalizeShopPhone(phone) &&
    !inventoryBlocked && selectedItems.length > 0 &&
    (deliveryMethod === "pickup" || (!!addressSelection && shippingAddress === addressSelection.label));

  if (orderPlaced) {
    return (
      <div className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <PageTransition>
          <main className="container mx-auto px-4 py-16 md:px-6 max-w-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-10 w-10 text-green-400" />
              </div>
              <h1 className="mb-2 font-heading text-3xl font-bold" data-testid="text-order-confirmed">Order Request Saved</h1>
              <p className="text-muted-foreground mb-6">
                Your order request <span className="font-mono font-semibold text-white" data-testid="text-order-number">#{orderNumber}</span> has been saved. No payment has been taken. Stock is not reserved or guaranteed.
                {staffConfirmed
                  ? " The staff app confirmed receipt. Staff will call to confirm availability, fulfillment and payment arrangements."
                  : " Receipt by the staff app is not confirmed. Do not submit it again. Call (718) 328-2833 with this order number so staff can check it."}
              </p>
              <Card>
                <CardContent className="p-6 space-y-3 text-left">
                  <div className="flex items-center gap-2 text-sm" data-testid="text-fulfillment-info">
                    {confirmedDelivery === "delivery" ? (
                      <>
                        <Truck className="h-4 w-4 text-primary shrink-0" />
                        <span>Delivery requested to <span className="text-white font-medium">{confirmedAddress}</span>. Staff will call to confirm.</span>
                      </>
                    ) : (
                      <>
                        <Store className="h-4 w-4 text-green-400 shrink-0" />
                        <span>Pickup requested. Wait for staff to confirm it is ready.</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm" data-testid="text-payment-info">
                    <CreditCard className="h-4 w-4 text-primary shrink-0" />
                    <span>Payment: <span className="text-white font-medium">{PAYMENT_LABELS[confirmedPayment]}</span></span>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-6 text-left">
                <PostSubmissionCTA confirmationMessage={staffConfirmed
                  ? "Your order request was received by staff. Stock is not guaranteed. Wait for staff confirmation."
                  : "Your order request is saved and needs staff confirmation. Do not submit it again."}>
                  <div className="text-sm space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Order Reference</p>
                    <p className="font-mono font-bold text-primary text-base" data-testid="text-order-ref">#{orderNumber}</p>
                    {confirmedDelivery === "delivery"
                      ? <p className="text-muted-foreground">Delivery requested to {confirmedAddress}. Wait for staff to confirm availability, timing and any delivery charges.</p>
                      : <p className="text-muted-foreground">Pickup requested. Wait for staff confirmation before visiting.</p>
                    }
                  </div>
                </PostSubmissionCTA>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 justify-center">
                <Link href="/shop">
                  <Button data-testid="button-continue-shopping">
                    <Package className="mr-2 h-4 w-4" />
                    Continue Shopping
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" data-testid="button-go-home-confirm">
                    Back to Home
                  </Button>
                </Link>
              </div>
            </motion.div>
          </main>
        </PageTransition>
      </div>
    );
  }

  if (!patientAuthReady || (member && (memberCartLoading || memberCartError))) {
    return <div className="min-h-screen clinical-dark-page"><Header /><main className="container px-4 py-20">
      <h1 className="text-2xl font-semibold">Loading your account and cart</h1>
      <p className="mt-3">{memberCartError ? "Your cart could not be loaded. Please retry." : "Your account must finish loading before we can open the correct cart."}</p>
      <Button className="mt-4" onClick={() => member ? refetchMemberCart() : refetchUser()}>Retry loading</Button>
    </main></div>;
  }
  if (selectedItems.length === 0) {
    return (
      <div className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <PageTransition>
          <main className="container mx-auto px-4 py-16 md:px-6 max-w-lg text-center">
            <h1 className="mb-4 font-heading text-2xl font-bold">No Items in Cart</h1>
            <p className="text-muted-foreground mb-6">Add some items to your cart before checking out.</p>
            <Link href="/shop">
              <Button data-testid="button-back-to-shop">
                <Package className="mr-2 h-4 w-4" />
                Browse Products
              </Button>
            </Link>
          </main>
        </PageTransition>
      </div>
    );
  }

  return (
    <div className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO title="Express Checkout" description="Quick guest checkout at Concordia Pharmacy. No account required for OTC purchases." path="/express-checkout" />
      <Header />
      <PageTransition>
        <main className="container mx-auto px-4 py-8 md:px-6 max-w-3xl">
          <Link href="/cart">
            <Button variant="ghost" size="sm" className="mb-4 gap-1.5 text-slate-400" data-testid="button-back-to-cart">
              <ArrowLeft className="h-4 w-4" />
              Back to Cart
            </Button>
          </Link>

          <h1 className="mb-6 font-heading text-3xl font-bold">Express Checkout</h1>

          <div className="grid gap-6 md:grid-cols-5">
            <div className="md:col-span-3 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="guest-name">Full Name *</Label>
                    <Input
                      id="guest-name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="input-guest-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-phone">Phone Number *</Label>
                    <Input
                      id="guest-phone"
                      type="tel"
                      required
                      placeholder="(718) 555-0123"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      data-testid="input-guest-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-email" className="text-muted-foreground">Email Address (optional)</Label>
                    <Input
                      id="guest-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-guest-email"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Fulfillment Method</CardTitle>
                </CardHeader>
                <CardContent>
                  <button type="button" onClick={() => setDeliveryMethod("pickup")} aria-pressed={deliveryMethod === "pickup"} className={`flex w-full items-center gap-3 rounded-md border p-4 text-left ${deliveryMethod === "pickup" ? "border-primary bg-primary/10 text-primary" : "border-border"}`} data-testid="button-pickup">
                    <Store className="h-6 w-6" />
                    <div>
                      <p className="text-sm font-medium">Pickup at the pharmacy</p>
                      <p className="text-xs text-muted-foreground">Staff will call to confirm when your items are available.</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => setDeliveryMethod("delivery")} aria-pressed={deliveryMethod === "delivery"} className={`mt-3 flex w-full items-center gap-3 rounded-md border p-4 text-left ${deliveryMethod === "delivery" ? "border-primary bg-primary/10 text-primary" : "border-border"}`} data-testid="button-delivery">
                    <Truck className="h-6 w-6" />
                    <div><p className="text-sm font-medium">Request delivery</p><p className="text-xs text-muted-foreground">Staff will call to confirm delivery availability, any charges and payment arrangements.</p></div>
                  </button>
                  {deliveryMethod === "delivery" && (
                    <div className="mt-4 space-y-3">
                      <Label htmlFor="shipping-address">Delivery address *</Label>
                      <AddressAutocompleteInput id="shipping-address" value={shippingAddress} onChange={setShippingAddress} onVerificationChange={setAddressSelection} required dataTestId="input-shipping-address" />
                      <Label htmlFor="shipping-unit">Apartment / unit (optional)</Label>
                      <Input id="shipping-unit" value={shippingAddressUnit} onChange={e => setShippingAddressUnit(e.target.value)} maxLength={100} data-testid="input-shipping-unit" />
                      {!addressSelection && <p className="text-xs text-muted-foreground" data-testid="text-address-required">Select your full address from the suggestions. It will be verified before your request is saved.</p>}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">No online payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-md border border-primary bg-primary/10 p-3 text-primary" data-testid="button-pay-cash">
                    <Banknote className="h-4 w-4" />
                    <span className="text-sm font-medium">Arrange payment with staff</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    No payment is taken on this website. Staff will call the required phone number to confirm your request and payment arrangements.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    id="guest-notes"
                    placeholder="Special instructions or preferences"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="resize-none"
                    data-testid="input-guest-notes"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Order Items
                    {!isLoadingProducts && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({selectedItems.reduce((s, i) => s + i.quantity, 0)} {selectedItems.reduce((s, i) => s + i.quantity, 0) === 1 ? "item" : "items"})
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingProducts ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      <span className="text-sm">Loading items…</span>
                    </div>
                  ) : cartProductItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No items found</p>
                  ) : cartProductItems.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
                      data-testid={`checkout-item-${item.productId}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
                          {item.product.imageUrl ? (
                            <img
                              src={item.product.imageUrl}
                              alt={item.product.name}
                              className="h-full w-full object-cover rounded-md"
                            />
                          ) : (
                            <Package className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold shrink-0">
                        ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2">
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle className="text-lg">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium" data-testid="text-express-subtotal">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fulfillment</span>
                    <Badge variant="outline" data-testid="badge-fulfillment">
                      {deliveryMethod === "pickup" ? "Pickup" : "Delivery"}
                    </Badge>
                  </div>

                  {paymentMethod && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Payment</span>
                      <Badge variant="outline" data-testid="badge-payment-method">
                        {PAYMENT_LABELS[paymentMethod]}
                      </Badge>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-semibold">Items total</span>
                      <span className="text-2xl font-bold" data-testid="text-express-total">
                        ${subtotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Show what's still needed before submitting */}
                    {!isFormValid && (
                      <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
                        {name.trim().length < 2 && (
                          <li className="flex items-center gap-1.5 text-amber-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Full name required
                          </li>
                        )}
                        {!normalizeShopPhone(phone) && (
                          <li className="flex items-center gap-1.5 text-amber-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {phoneDigits.length === 0 ? "Phone number required" : "Enter a complete 10-digit phone number"}
                          </li>
                        )}
                      </ul>
                    )}

                    {inventoryBlocked && (
                      <p className="mb-3 text-sm text-amber-400" role="alert" data-testid="text-inventory-blocked">
                        Inventory changed or is unavailable. Review your cart before placing this order.
                      </p>
                    )}
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!isFormValid || placeOrderMutation.isPending}
                      onClick={() => placeOrderMutation.mutate()}
                      data-testid="button-place-order"
                      >
                      {placeOrderMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                      ) : (
                        <><ShieldCheck className="mr-2 h-4 w-4" /> Submit Order Request</>
                      )}
                    </Button>
                  </div>

                   <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-primary">Secure Checkout</span>
                    </div>
                     <p>Your order details are transmitted over an encrypted connection. Pay in cash at the pharmacy counter when you pick up your order.</p>
                  </div>

                  <div className="rounded-md bg-primary/10 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 mb-1">
                      <UserPlus className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-primary/70">Save time next order</span>
                    </div>
                    <p>
                      <Link href="/signup" className="text-primary hover:text-primary/70">Create an account</Link> for faster checkout, order tracking, and loyalty rewards.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </PageTransition>
    </div>
  );
}
