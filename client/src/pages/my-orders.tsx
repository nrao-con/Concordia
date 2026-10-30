import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Package, LogIn, Truck, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@shared/schema";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "delivered":
    case "completed":
      return "default";
    case "processing":
    case "shipped":
    case "ready_for_pickup":
      return "secondary";
    case "cancelled":
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "delivered":
    case "completed":
      return <CheckCircle className="h-3.5 w-3.5" />;
    case "shipped":
      return <Truck className="h-3.5 w-3.5" />;
    case "cancelled":
    case "refunded":
      return <XCircle className="h-3.5 w-3.5" />;
    case "processing":
      return <Clock className="h-3.5 w-3.5" />;
    default:
      return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ready_for_pickup": return "Ready for Pickup";
    case "out_for_delivery": return "Out for Delivery";
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "Not available";
  return `$${Number(amount).toFixed(2)}`;
}

export default function MyOrders() {
  const {
    isLoading: authLoading,
    isAuthenticated,
    isSignedIn,
    patientAuthReady,
    refetchUser,
  } = useAuth();

  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: patientAuthReady && isAuthenticated,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  const isLoading =
    authLoading ||
    (patientAuthReady && isAuthenticated && ordersLoading);

  return (
    <PageTransition>
      <SEO
        title="My Orders | Concordia Pharmacy"
        description="View your OTC order history and delivery status."
      />
      <Header />
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-2">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
          </div>
          <p className="text-muted-foreground text-sm mb-8">
            Your OTC purchase history, newest first.
          </p>

          {isLoading && (
            <div className="flex flex-col gap-3" data-testid="loading-orders">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-24" />
                </Card>
              ))}
            </div>
          )}

          {!isLoading && !isAuthenticated && isSignedIn !== true && (
            <Card data-testid="card-orders-sign-in">
              <CardHeader>
                <CardTitle className="text-base">Sign in to view your orders</CardTitle>
                <CardDescription>
                  Log in to your Concordia account to see your purchase history and delivery status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/login">
                  <Button data-testid="button-orders-sign-in">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign in
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {!isLoading && isSignedIn === true && !patientAuthReady && (
            <Card data-testid="card-orders-auth-recovery">
              <CardHeader>
                <CardTitle className="text-base">We couldn't load your account</CardTitle>
                <CardDescription>Your orders remain unavailable until we reconnect to your patient account.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => refetchUser()} data-testid="button-retry-orders-auth">Retry</Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && isAuthenticated && ordersError && (
            <Card data-testid="card-orders-error">
              <CardHeader>
                <CardTitle className="text-base">We couldn't load your orders</CardTitle>
                <CardDescription>Please check your connection and try again.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => refetchOrders()} data-testid="button-retry-orders">Try Again</Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && isAuthenticated && !ordersError && orders && orders.length === 0 && (
            <Card data-testid="card-orders-empty">
              <CardHeader>
                <CardTitle className="text-base">No orders yet</CardTitle>
                <CardDescription>
                  When you place an OTC order, it will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/shop">
                  <Button variant="outline" data-testid="button-orders-shop">
                    <Package className="h-4 w-4 mr-2" />
                    Browse the Shop
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {!isLoading && isAuthenticated && !ordersError && orders && orders.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="list-orders">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`card-order-${order.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <CardTitle className="text-base">Order #{order.orderNumber}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {formatDate(order.createdAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={statusVariant(order.status)}
                      className="flex items-center gap-1"
                      data-testid={`status-order-${order.id}`}
                    >
                      {statusIcon(order.status)}
                      {statusLabel(order.status)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1.5 pt-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium">{formatCurrency(order.total)}</span>
                    </div>
                    {order.deliveryMethod && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Delivery</span>
                        <span className="capitalize">{order.deliveryMethod.replace(/_/g, " ")}</span>
                      </div>
                    )}
                    {order.trackingNumber && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tracking</span>
                        <span className="font-mono text-xs">{order.trackingNumber}</span>
                      </div>
                    )}
                    {order.paymentMethod && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Payment</span>
                        <span className="capitalize">{order.paymentMethod.replace(/_/g, " ")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </PageTransition>
  );
}
