import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { HybridCartItem } from "@shared/schema";
import { Header } from "@/components/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    isAuthenticated,
    isSignedIn,
    clerkLoaded,
    localUserLoading,
    patientAuthReady,
    refetchUser,
  } = useAuth();

  useEffect(() => {
    if (patientAuthReady && !isAuthenticated) {
      toast({
        title: "Account Required",
        description: "Please sign up or log in to view your saved cart.",
      });
      setTimeout(() => setLocation("/signup"), 500);
    }
  }, [isAuthenticated, patientAuthReady, toast, setLocation]);

  const checkoutAuthReady = patientAuthReady && isAuthenticated;
  const {
    data: cartItems = [],
    isLoading: cartLoading,
    isError: cartError,
    refetch: refetchCart,
  } = useQuery<HybridCartItem[]>({
    queryKey: ["/api/cart"],
    enabled: checkoutAuthReady,
  });

  const productItems = cartItems.filter(
    (item) => item.itemType === "product" && item.product,
  );
  const subtotal = productItems.reduce(
    (sum, item) => sum + parseFloat(item.product!.price) * item.quantity,
    0,
  );

  useEffect(() => {
    if (checkoutAuthReady && cartItems.length === 0 && !cartLoading && !cartError) {
      setLocation("/cart");
    }
  }, [cartItems, cartLoading, cartError, checkoutAuthReady, setLocation]);

  if (!clerkLoaded || localUserLoading || (checkoutAuthReady && cartLoading)) {
    return (
      <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <div className="container mx-auto px-4 py-8 md:px-6">
          <Skeleton className="mb-6 h-12 w-64" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (isSignedIn === true && !patientAuthReady) {
    return (
      <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <main className="container mx-auto px-4 py-8 md:px-6">
          <Card className="mx-auto max-w-lg" data-testid="card-checkout-auth-recovery">
            <CardHeader><CardTitle>We couldn't load your patient account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Your cart and checkout are paused until your account reconnects.</p>
              <Button onClick={() => refetchUser()} data-testid="button-retry-checkout-auth">Retry</Button>
            </CardContent>
          </Card>
        </main>
      </PageTransition>
    );
  }

  if (checkoutAuthReady && cartError) {
    return (
      <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
        <Header />
        <main className="container mx-auto px-4 py-8 md:px-6">
          <Card className="mx-auto max-w-lg" data-testid="card-checkout-cart-error">
            <CardHeader><CardTitle>We couldn't load your cart</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Please retry so we can verify your saved items and prices.</p>
              <Button onClick={() => refetchCart()} data-testid="button-retry-checkout-cart">Retry</Button>
            </CardContent>
          </Card>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO title="Checkout" description="Review your saved cart and order details." path="/checkout" />
      <Header />
      <main className="container mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-bold md:text-4xl">Checkout</h1>
          <p className="text-muted-foreground">Review your saved cart and order details</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Cart Summary</CardTitle>
              <CardDescription>{productItems.length} items in your saved cart</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {productItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-md border p-3" data-testid={`checkout-item-${item.id}`}>
                  <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                    {item.product!.imageUrl ? (
                      <img src={item.product!.imageUrl} alt={item.product!.name} className="h-full w-full rounded-md object-cover" />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{item.product!.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      ${parseFloat(item.product!.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">${(parseFloat(item.product!.price) * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="h-fit lg:sticky lg:top-20">
            <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="border-t pt-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-2xl font-bold" data-testid="text-checkout-total">${subtotal.toFixed(2)}</span>
                </div>
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                  <p className="font-medium text-amber-200">Online checkout is currently unavailable</p>
                  <p className="mt-1 text-muted-foreground">
                    Your signed-in cart is saved. We cannot submit an order from this page right now.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/cart">
                      <Button variant="outline" size="sm" data-testid="button-return-to-cart">Return to Cart</Button>
                    </Link>
                    <a href="tel:+17183282833">
                      <Button variant="outline" size="sm" data-testid="button-contact-pharmacy">Contact Pharmacy</Button>
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </PageTransition>
  );
}