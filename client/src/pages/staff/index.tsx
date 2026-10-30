import { useState } from "react";
import { useAuthBridge } from "@/contexts/authBridge";
import { useStaffWebSocket } from "@/hooks/useStaffWebSocket";
import { StaffLogin } from "./login";
import { StaffOrders } from "./orders";
import { StaffInventory } from "./inventory";
import { PharmacyLoader } from "@/components/pharmacy-loader";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Package, Wifi, WifiOff, LogOut, Pill, ShieldAlert } from "lucide-react";

type Tab = "orders" | "inventory";

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      data-testid={connected ? "status-connected" : "status-disconnected"}
      className={`inline-flex items-center gap-1.5 text-xs ${connected ? "text-emerald-500" : "text-muted-foreground"}`}
    >
      {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {connected ? "Live" : "Reconnecting…"}
    </span>
  );
}

export default function StaffApp() {
  const { isLoaded, isSignedIn, clerkUser, signOut } = useAuthBridge();
  const [tab, setTab] = useState<Tab>("orders");

  const role = clerkUser?.publicMetadata?.role as string | undefined;
  const isAuthorized = isSignedIn === true && (role === "staff" || role === "admin");

  const { isConnected, hasNewOrder, clearNewOrder } = useStaffWebSocket(isAuthorized);

  function handleLogout() {
    signOut({ redirectUrl: "/staff" });
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PharmacyLoader size="lg" text="Loading staff app…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <StaffLogin />;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Access Denied</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your account does not have staff access. Contact your manager to have the{" "}
              <strong>staff</strong> role assigned in Clerk.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-staff-unauthorized-logout">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 border-b px-4 py-2.5 flex items-center gap-3" data-testid="staff-header">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Pill className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">Concordia</span>
          <span className="text-muted-foreground text-sm hidden sm:inline">· Staff</span>
        </div>
        <ConnectionDot connected={isConnected} />
        <Button
          data-testid="button-staff-logout"
          size="icon"
          variant="ghost"
          onClick={handleLogout}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Main content area */}
      <main className="flex-1 min-h-0">
        {tab === "orders" ? (
          <StaffOrders newOrderAlert={hasNewOrder} onClearAlert={clearNewOrder} />
        ) : (
          <StaffInventory />
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="shrink-0 border-t bg-background" data-testid="staff-bottom-nav">
        <div className="flex">
          <button
            data-testid="tab-orders"
            onClick={() => setTab("orders")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors relative ${
              tab === "orders"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "orders" && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
            )}
            <div className="relative">
              <ShoppingBag className="h-5 w-5" />
              {hasNewOrder && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background animate-pulse" data-testid="badge-new-order-dot" />
              )}
            </div>
            <span className="text-xs font-medium">Orders</span>
          </button>

          <button
            data-testid="tab-inventory"
            onClick={() => setTab("inventory")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors relative ${
              tab === "inventory"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "inventory" && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary" />
            )}
            <Package className="h-5 w-5" />
            <span className="text-xs font-medium">Inventory</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
