import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { useAuth } from "@/hooks/useAuth";
import { useGuestCart } from "@/hooks/useGuestCart";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { HybridCartItem, Product } from "@shared/schema";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Minus, ArrowRight, Package, Pill, AlertCircle, ShoppingBag, UserPlus, Star } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { SmartUpsells } from "@/components/smart-upsells";
import { PharmacyLoader, EmptyState } from "@/components/pharmacy-loader";
import { PageTransition } from "@/components/page-transition";
import { getAvailableProductQuantity } from "@shared/cart-utils";

export default function Cart() {
  const { toast } = useToast();
  const {
    user,
    isAuthenticated,
    isAdmin,
    hasSelectedPatient,
    isSignedIn,
    clerkLoaded,
    localUserLoading,
    patientAuthReady,
    refetchUser,
  } = useAuth();
  const guestCart = useGuestCart();
  const isPatientAuthenticated =
    patientAuthReady && isAuthenticated && !isAdmin && (!!user || hasSelectedPatient);
  const isGuestMode = patientAuthReady && !isPatientAuthenticated;

  const { data: cartItems = [], isLoading } = useQuery<HybridCartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isPatientAuthenticated,
  });

  const { data: allProducts = [], isLoading: isLoadingProducts } = useQuery<any[]>({
    queryKey: ["/api/public/products"],
    enabled: isGuestMode,
  });

  type WalletResponse = {
    wallet: {
      id: number;
      userId: string;
      currentBalance: number;
      lifetimeEarned: number;
      lifetimeRedeemed: number;
    };
    streaks: Array<{
      id: number;
      streakType: string;
      currentStreak: number;
      longestStreak: number;
    }>;
  };

  const { data: walletData } = useQuery<WalletResponse>({
    queryKey: ["/api/points/wallet"],
    enabled: isPatientAuthenticated,
  });

  const pointsBalance = walletData?.wallet?.currentBalance ?? user?.loyaltyPoints ?? 0;

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
      await apiRequest("PATCH", `/api/cart/${cartItemId}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update quantity.",
        variant: "destructive",
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (cartItemId: string) => {
      await apiRequest("DELETE", `/api/cart/${cartItemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Item Removed",
        description: "Item has been removed from your cart.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove item.",
        variant: "destructive",
      });
    },
  });

  const guestProductItems = guestCart.items
    .map((gi) => {
      const product = allProducts.find((p) => p.id === gi.productId);
      return { ...gi, missing: !product, product: product ?? ({
        id: gi.productId, name: "Item no longer available", price: "0",
        stockQuantity: 0, inStock: false, imageUrl: null,
      } as Product) };
    }) as Array<{ productId: string; quantity: number; addedAt: number; product: Product; missing: boolean }>;

  const guestSubtotal = guestProductItems.reduce(
    (sum, item) => sum + (item.missing ? 0 : parseFloat(item.product.price) * item.quantity), 0
  );
  const guestHasStockIssues = guestProductItems.length !== guestCart.items.length || guestProductItems.some(
    (item) => item.quantity > getAvailableProductQuantity(item.product),
  );

  if (!patientAuthReady) {
    return (
      <div className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <main className="container mx-auto px-4 py-8 md:px-6">
          {!clerkLoaded || localUserLoading ? (
            <PharmacyLoader size="lg" text="Loading your patient cart..." className="py-24" />
          ) : (
            <Card className="mx-auto max-w-lg" data-testid="card-cart-auth-recovery">
              <CardHeader>
                <CardTitle>We couldn't load your patient account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your cart is protected while we reconnect to your account. Please try again.
                </p>
                <Button onClick={() => refetchUser()} data-testid="button-retry-cart-auth">
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  if (!isPatientAuthenticated) {
    const totalItems = guestCart.items.reduce((s, i) => s + i.quantity, 0);

    return (
      <div className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <PageTransition>
          <main className="container mx-auto px-4 py-8 md:px-6">
            <div className="mb-8">
              <h1 className="mb-2 font-heading text-3xl font-bold md:text-4xl">Shopping Cart</h1>
              <p className="text-muted-foreground">
                {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
              </p>
            </div>

            {guestCart.items.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="h-16 w-16" />}
                title="Your Cart is Empty"
                description="Browse our OTC products and add items to get started"
                action={
                  <div className="flex flex-wrap gap-4">
                    <Link href="/shop">
                      <Button data-testid="button-shop-now">
                        <Package className="mr-2 h-4 w-4" />
                        Shop OTC Products
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button variant="outline" data-testid="button-go-home">
                        Back to Home
                      </Button>
                    </Link>
                  </div>
                }
              />
            ) : isLoadingProducts ? (
              <PharmacyLoader size="lg" text="Loading your cart..." className="py-24" />
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  {guestProductItems.length === 0 && (
                    <Card>
                      <CardContent className="p-6 text-center text-muted-foreground">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">Some items in your cart are no longer available.</p>
                        <Link href="/shop">
                          <Button variant="outline" size="sm" className="mt-3" data-testid="button-reshop">
                            <Package className="mr-2 h-4 w-4" />
                            Browse Products
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  )}
                  {guestProductItems.map((item) => {
                    const availableQuantity = getAvailableProductQuantity(item.product);
                    return (
                    <Card key={item.productId} data-testid={`cart-guest-item-${item.productId}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex h-20 w-20 items-center justify-center rounded-md bg-muted">
                            {item.product.imageUrl ? (
                              <img
                                src={item.product.imageUrl}
                                alt={item.product.name}
                                className="h-full w-full object-cover rounded-md"
                              />
                            ) : (
                              <Package className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>

                          <div className="flex flex-1 flex-col justify-between">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-semibold">{item.product.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {item.missing ? "Price unavailable" : `$${parseFloat(item.product.price).toFixed(2)} each`}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => guestCart.removeItem(item.productId)}
                                data-testid={`button-remove-guest-${item.productId}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    guestCart.updateQuantity(item.productId, Math.max(1, item.quantity - 1))
                                  }
                                  disabled={item.quantity <= 1}
                                  data-testid={`button-decrease-guest-${item.productId}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-12 text-center font-medium" data-testid={`quantity-guest-${item.productId}`}>
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    guestCart.updateQuantity(
                                      item.productId,
                                      item.quantity + 1,
                                      availableQuantity,
                                    )
                                  }
                                  disabled={availableQuantity <= 0 || item.quantity >= availableQuantity}
                                  data-testid={`button-increase-guest-${item.productId}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="font-semibold" data-testid={`item-total-guest-${item.productId}`}>
                                {item.missing ? "Unavailable" : `$${(parseFloat(item.product.price) * item.quantity).toFixed(2)}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <Card className="sticky top-20">
                    <CardHeader>
                      <CardTitle>Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium" data-testid="text-guest-subtotal">
                            ${guestSubtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <div className="mb-4 flex items-center justify-between">
                          <span className="font-semibold">Total</span>
                          <span className="text-2xl font-bold" data-testid="text-guest-total">
                            ${guestSubtotal.toFixed(2)}
                          </span>
                        </div>

                        <Link href="/express-checkout">
                          <Button
                            className="w-full"
                            size="lg"
                            disabled={guestHasStockIssues}
                            title={guestHasStockIssues ? "Adjust unavailable quantities before checkout" : undefined}
                            data-testid="button-express-checkout"
                          >
                            Express Checkout
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>

                      <div className="rounded-md bg-primary/10 p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <Star className="h-4 w-4 text-primary" />
                          <p className="font-medium text-primary/70">Want to earn loyalty points?</p>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          <Link href="/signup" className="text-primary hover:text-primary/70">Create a free account</Link> to earn points on every purchase and unlock exclusive rewards.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </main>
        </PageTransition>
      </div>
    );
  }

  const productItems = cartItems.filter(item => item.itemType === 'product' && item.product);
  const prescriptionItems = cartItems.filter(item => item.itemType === 'prescription' && item.prescription);

  const productSubtotal = productItems.reduce(
    (sum, item) => sum + (item.product ? parseFloat(item.product.price) * item.quantity : 0),
    0
  );

  const prescriptionSubtotal = prescriptionItems.reduce(
    (sum, item) => sum + (item.copayAmount ? parseFloat(item.copayAmount) : 0),
    0
  );

  const subtotal = productSubtotal + prescriptionSubtotal;
  const pointsToEarn = Math.floor(productSubtotal * 10);

  const hasProducts = productItems.length > 0;
  const hasPrescriptions = prescriptionItems.length > 0;
  const isMixedCart = hasProducts && hasPrescriptions;
  const hasProductStockIssues = productItems.some(
    (item) =>
      !item.product ||
      item.quantity > getAvailableProductQuantity(item.product),
  );

  return (
    <div className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO title="Your Cart" description="Review items in your Concordia Pharmacy cart before checkout." path="/cart" />
      <Header />
      
      <PageTransition>
      <main className="container mx-auto px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-bold md:text-4xl">Shopping Cart</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground">
              {cartItems.length} {cartItems.length === 1 ? "item" : "items"} in your cart
            </p>
            {isMixedCart && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-mixed-cart">
                Mixed Cart: Rx + OTC
              </Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <PharmacyLoader size="lg" text="Loading your cart..." className="py-24" />
        ) : cartItems.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-16 w-16" />}
            title="Your Cart is Empty"
            description="Add OTC products or refill your prescriptions to get started"
            action={
              <div className="flex flex-wrap gap-4">
                <Link href="/shop">
                  <Button data-testid="button-shop-now">
                    <Package className="mr-2 h-4 w-4" />
                    Shop OTC Products
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" data-testid="button-go-home">
                    Back to Home
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {hasPrescriptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold text-lg">Prescriptions</h2>
                    <Badge variant="secondary" className="text-xs">
                      {prescriptionItems.length} {prescriptionItems.length === 1 ? 'Rx' : 'Rx items'}
                    </Badge>
                  </div>
                  
                  {prescriptionItems.map((item) => (
                    <Card key={item.id} className="border-primary/20" data-testid={`cart-rx-${item.id}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                            <Pill className="h-8 w-8 text-primary" />
                          </div>

                          <div className="flex flex-1 flex-col justify-between">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{item.prescription?.medicationName}</h3>
                                  <Badge variant="outline" className="text-xs">
                                    Rx #{item.prescription?.rxNumber}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {item.prescription?.dosage}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Prescribed by: {item.prescription?.prescribedBy}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItemMutation.mutate(item.id)}
                                disabled={removeItemMutation.isPending}
                                data-testid={`button-remove-rx-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <AlertCircle className="h-4 w-4" />
                                <span>{item.prescription?.refillsRemaining} refills remaining</span>
                              </div>
                              <div className="text-right">
                                {item.copayAmount ? (
                                  <p className="font-semibold" data-testid={`rx-copay-${item.id}`}>
                                    Copay: ${parseFloat(item.copayAmount).toFixed(2)}
                                  </p>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    Copay TBD
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </motion.div>
              )}

              {hasProducts && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: hasPrescriptions ? 0.1 : 0 }}
                  className="space-y-4"
                >
                  {hasPrescriptions && (
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      <h2 className="font-semibold text-lg">OTC Products</h2>
                      <Badge variant="secondary" className="text-xs">
                        {productItems.length} {productItems.length === 1 ? 'item' : 'items'}
                      </Badge>
                    </div>
                  )}
                  
                  {productItems.map((item) => (
                    <Card key={item.id} data-testid={`cart-item-${item.id}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex h-20 w-20 items-center justify-center rounded-md bg-muted">
                            {item.product?.imageUrl ? (
                              <img
                                src={item.product.imageUrl}
                                alt={item.product.name}
                                className="h-full w-full object-cover rounded-md"
                              />
                            ) : (
                              <Package className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>

                          <div className="flex flex-1 flex-col justify-between">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-semibold">{item.product?.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  ${item.product ? parseFloat(item.product.price).toFixed(2) : '0.00'} each
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItemMutation.mutate(item.id)}
                                disabled={removeItemMutation.isPending}
                                data-testid={`button-remove-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    updateQuantityMutation.mutate({
                                      cartItemId: item.id,
                                      quantity: Math.max(1, item.quantity - 1),
                                    })
                                  }
                                  disabled={item.quantity <= 1 || updateQuantityMutation.isPending}
                                  data-testid={`button-decrease-${item.id}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-12 text-center font-medium" data-testid={`quantity-${item.id}`}>
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    updateQuantityMutation.mutate({
                                      cartItemId: item.id,
                                      quantity: item.quantity + 1,
                                    })
                                  }
                                  disabled={
                                    updateQuantityMutation.isPending ||
                                    !item.product ||
                                    item.quantity >= getAvailableProductQuantity(item.product)
                                  }
                                  data-testid={`button-increase-${item.id}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="font-semibold" data-testid={`item-total-${item.id}`}>
                                ${item.product ? (parseFloat(item.product.price) * item.quantity).toFixed(2) : '0.00'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </motion.div>
              )}
            </div>

            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {hasProducts && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">OTC Subtotal</span>
                        <span className="font-medium" data-testid="text-product-subtotal">
                          ${productSubtotal.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {hasPrescriptions && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Rx Copays</span>
                        <span className="font-medium" data-testid="text-rx-subtotal">
                          {prescriptionSubtotal > 0 ? `$${prescriptionSubtotal.toFixed(2)}` : 'TBD'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Points to Earn</span>
                      <span className="font-medium text-primary" data-testid="text-points-to-earn">
                        +{pointsToEarn} pts
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="text-2xl font-bold" data-testid="text-total">
                        ${subtotal.toFixed(2)}
                        {hasPrescriptions && prescriptionSubtotal === 0 && (
                          <span className="text-xs text-muted-foreground block text-right">+ Rx copays</span>
                        )}
                      </span>
                    </div>

                    <Link href="/express-checkout">
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={hasProductStockIssues}
                        title={hasProductStockIssues ? "Adjust unavailable quantities before checkout" : undefined}
                        data-testid="button-checkout"
                      >
                        Request Shop Items
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>

                  {isMixedCart && (
                    <div className="rounded-md bg-primary/10 p-3 text-sm">
                      <p className="font-medium text-primary/70">Mixed Cart Order</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Prescriptions will be verified before processing. OTC items ship separately.
                      </p>
                    </div>
                  )}

                  <div className="rounded-md bg-primary/10 p-3 text-sm">
                    <p className="font-medium text-primary">Your Loyalty Points</p>
                    <p className="text-muted-foreground">
                      Current balance: {pointsBalance.toLocaleString()} points
                    </p>
                  </div>
                </CardContent>
              </Card>

              <SmartUpsells cartItems={cartItems} />
            </div>
          </div>
        )}
      </main>
      </PageTransition>
    </div>
  );
}
