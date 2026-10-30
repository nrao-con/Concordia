import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { staffApi, StaffOrder } from "@/lib/staffApi";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Package,
  CreditCard,
  Banknote,
  ChevronRight,
  Clock,
  User,
  Phone,
  Truck,
  Store,
  RefreshCw,
} from "lucide-react";

// Fulfillment stages in display order
type FulfillmentStatus =
  | "pending"
  | "preparing"
  | "ready_for_pickup"
  | "sent_for_delivery"
  | "delivered"
  | "picked_up";

type ColumnDef = {
  id: string;
  label: string;
  statuses: string[];
  colorClass: string;
  headerBg: string;
  isTerminal?: boolean;
};

const COLUMNS: ColumnDef[] = [
  {
    id: "new",
    label: "New",
    statuses: ["pending", "processing"],
    colorClass: "text-amber-600 dark:text-amber-400",
    headerBg: "bg-amber-500/10",
  },
  {
    id: "preparing",
    label: "Preparing",
    statuses: ["preparing"],
    colorClass: "text-primary/90 dark:text-primary",
    headerBg: "bg-primary/10",
  },
  {
    id: "ready",
    label: "Ready",
    statuses: ["ready_for_pickup"],
    colorClass: "text-violet-600 dark:text-violet-400",
    headerBg: "bg-violet-500/10",
  },
  {
    id: "out_for_delivery",
    label: "Out for Delivery",
    statuses: ["sent_for_delivery"],
    colorClass: "text-indigo-600 dark:text-indigo-400",
    headerBg: "bg-indigo-500/10",
  },
  {
    id: "done",
    label: "Done",
    statuses: ["delivered", "picked_up", "completed"],
    colorClass: "text-emerald-600 dark:text-emerald-400",
    headerBg: "bg-emerald-500/10",
    isTerminal: true,
  },
];

// Next statuses for the Advance Status button.
// For "ready_for_pickup", two actions are possible (delivery or pickup),
// so we offer both from the detail sheet.
const NEXT_STATUS: Record<string, { label: string; status: string; secondary?: { label: string; status: string } }> = {
  pending:          { label: "Start Preparing",    status: "preparing" },
  processing:       { label: "Start Preparing",    status: "preparing" },
  preparing:        { label: "Mark Ready",          status: "ready_for_pickup" },
  ready_for_pickup: {
    label: "Send for Delivery",
    status: "sent_for_delivery",
    secondary: { label: "Mark Picked Up", status: "picked_up" },
  },
  sent_for_delivery: { label: "Mark Delivered", status: "delivered" },
};

function PaymentBadge({ order }: { order: StaffOrder }) {
  const isPaid = order.paymentStatus === "paid_online";

  if (isPaid) {
    return (
      <Badge
        className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0"
        data-testid={`badge-payment-${order.id}`}
      >
        <CreditCard className="h-3 w-3" />
        Paid Online
      </Badge>
    );
  }
  return (
    <Badge
      className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0"
      data-testid={`badge-payment-${order.id}`}
    >
      <Banknote className="h-3 w-3" />
      Collect at Counter
    </Badge>
  );
}

function DeliveryBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const isDelivery = method === "delivery";
  return (
    <Badge className="bg-muted text-muted-foreground border shrink-0 flex items-center gap-1">
      {isDelivery ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
      {isDelivery ? "Delivery" : "Pickup"}
    </Badge>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function OrderCard({
  order,
  onTap,
  isNew,
}: {
  order: StaffOrder;
  onTap: (o: StaffOrder) => void;
  isNew: boolean;
}) {
  const name = order.customer?.name || "Guest";
  const items = order.items ?? [];
  const itemCount = items.length;
  const total = parseFloat(order.total || "0").toFixed(2);

  // Show first 2 item names inline; "+N more" if there are additional items
  const previewItems = items.slice(0, 2);
  const extraCount = itemCount - previewItems.length;

  return (
    <button
      data-testid={`card-order-${order.id}`}
      onClick={() => onTap(order)}
      className={`w-full text-left rounded-md border bg-card p-3 flex flex-col gap-2 hover-elevate transition-all ${isNew ? "ring-2 ring-amber-500 animate-pulse" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground font-mono" data-testid={`text-order-number-${order.id}`}>
            #{order.orderNumber}
          </p>
          <p className="font-medium text-sm leading-tight" data-testid={`text-customer-name-${order.id}`}>
            {name}
          </p>
        </div>
        <PaymentBadge order={order} />
      </div>

      {/* Items preview list */}
      {previewItems.length > 0 && (
        <ul className="space-y-0.5" data-testid={`text-items-list-${order.id}`}>
          {previewItems.map((item, idx) => (
            <li key={idx} className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
              <span className="shrink-0 font-medium text-foreground">{item.quantity}×</span>
              <span className="truncate">{item.name}</span>
            </li>
          ))}
          {extraCount > 0 && (
            <li className="text-xs text-muted-foreground">+{extraCount} more</li>
          )}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground" data-testid={`text-items-count-${order.id}`}>
          {itemCount} item{itemCount !== 1 ? "s" : ""} ·{" "}
          <span className="font-medium text-foreground">${total}</span>
        </p>
        <DeliveryBadge method={order.deliveryMethod} />
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span data-testid={`text-order-time-${order.id}`}>
          {formatDate(order.createdAt)} {formatTime(order.createdAt)}
        </span>
      </div>
    </button>
  );
}

function OrderDetailSheet({
  order,
  open,
  onClose,
  onAdvance,
  isAdvancing,
}: {
  order: StaffOrder | null;
  open: boolean;
  onClose: () => void;
  onAdvance: (id: string, status: string) => void;
  isAdvancing: boolean;
}) {
  if (!order) return null;
  const next = NEXT_STATUS[order.status];
  const name = order.customer?.name || "Guest";
  const phone = order.customer?.phone || null;
  const total = parseFloat(order.total || "0").toFixed(2);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Order #{order.orderNumber}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Customer */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span data-testid="text-detail-customer-name">{name}</span>
            </div>
            {phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span data-testid="text-detail-customer-phone">{phone}</span>
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <PaymentBadge order={order} />
            <DeliveryBadge method={order.deliveryMethod} />
          </div>

          {/* Items */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Items</p>
            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 text-sm"
                  data-testid={`item-detail-${idx}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <span className="font-medium shrink-0">${parseFloat(item.price || "0").toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-medium">Total</span>
            <span className="font-semibold text-lg" data-testid="text-detail-total">
              ${total}
            </span>
          </div>
        </div>

        {/* Action footer */}
        <div className="p-5 border-t space-y-2">
          {next ? (
            <>
              <Button
                data-testid="button-advance-status"
                className="w-full"
                size="lg"
                disabled={isAdvancing}
                onClick={() => onAdvance(order.id, next.status)}
              >
                {isAdvancing ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                {next.label}
              </Button>
              {next.secondary && (
                <Button
                  data-testid="button-advance-status-secondary"
                  variant="outline"
                  className="w-full"
                  size="lg"
                  disabled={isAdvancing}
                  onClick={() => onAdvance(order.id, next.secondary!.status)}
                >
                  <ChevronRight className="h-4 w-4 mr-2" />
                  {next.secondary.label}
                </Button>
              )}
            </>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-2">
              Order complete. No further action needed.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Two-tone chime: high note then slightly lower note
    const tones = [880, 660];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const startAt = ctx.currentTime + i * 0.2;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.3, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
    });
    // Auto-close context after chime
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Silently ignore if Web Audio is unavailable (e.g. browser policy)
  }
}

export function StaffOrders({
  newOrderAlert,
  onClearAlert,
}: {
  newOrderAlert: boolean;
  onClearAlert: () => void;
}) {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<StaffOrder | null>(null);
  const [newestOrderId, setNewestOrderId] = useState<string | null>(null);
  const prevAlertRef = useRef(false);

  // Play audible chime when a new order alert fires
  useEffect(() => {
    if (newOrderAlert && !prevAlertRef.current) {
      playNewOrderChime();
    }
    prevAlertRef.current = newOrderAlert;
  }, [newOrderAlert]);

  const { data: orders = [], isLoading } = useQuery<StaffOrder[]>({
    queryKey: ["/api/staff/orders"],
    queryFn: () => staffApi.getOrders(),
    refetchInterval: 30_000,
  });

  // Track most recently arrived order ID for the pulse ring (effect, not render)
  useEffect(() => {
    if (newOrderAlert && orders.length > 0 && orders[0]?.id !== newestOrderId) {
      setNewestOrderId(orders[0]?.id ?? null);
    }
  }, [newOrderAlert, orders]);

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      staffApi.advanceOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/orders"] });
      setSelectedOrder(null);
      toast({ title: "Order updated" });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Could not update order.",
        variant: "destructive",
      });
    },
  });

  function handleCardTap(order: StaffOrder) {
    setSelectedOrder(order);
    if (order.id === newestOrderId) {
      onClearAlert();
      setNewestOrderId(null);
    }
  }

  // Bucket orders into columns
  const columnOrders = COLUMNS.map((col) => ({
    col,
    orders: orders
      .filter((o) => col.statuses.includes(o.status))
      .slice(0, col.isTerminal ? 30 : undefined),
  }));

  return (
    <div className="h-full flex flex-col">
      {newOrderAlert && (
        <div
          className="bg-amber-500 text-white text-sm font-medium px-4 py-2 flex items-center justify-between gap-2 shrink-0 cursor-pointer"
          data-testid="banner-new-order"
          onClick={() => {
            onClearAlert();
            setNewestOrderId(null);
          }}
        >
          <span>New order arrived</span>
          <span className="text-xs opacity-80">Tap to dismiss</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 p-4 grid gap-4" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          {COLUMNS.map((col) => (
            <div key={col.id} className="space-y-3">
              <Skeleton className="h-6 w-24 rounded-md" />
              {[0, 1].map((j) => (
                <Skeleton key={j} className="h-28 rounded-md" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 h-full" style={{ minWidth: "900px" }}>
            {columnOrders.map(({ col, orders: colOrders }) => (
              <KanbanColumn
                key={col.id}
                col={col}
                orders={colOrders}
                newestId={newestOrderId}
                onTap={handleCardTap}
              />
            ))}
          </div>
        </div>
      )}

      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onAdvance={(id, status) => advance.mutate({ id, status })}
        isAdvancing={advance.isPending}
      />
    </div>
  );
}

function KanbanColumn({
  col,
  orders,
  newestId,
  onTap,
}: {
  col: ColumnDef;
  orders: StaffOrder[];
  newestId: string | null;
  onTap: (o: StaffOrder) => void;
}) {
  return (
    <div
      className="flex-1 flex flex-col min-w-0 rounded-md border bg-muted/30 overflow-hidden"
      data-testid={`column-${col.id}`}
    >
      <div className={`${col.headerBg} px-3 py-2 flex items-center gap-2 border-b shrink-0`}>
        <span className={`font-semibold text-xs ${col.colorClass}`}>{col.label}</span>
        <span className="ml-auto text-xs text-muted-foreground font-medium bg-background/60 rounded-full px-1.5 py-0.5">
          {orders.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nothing here</p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onTap={onTap}
              isNew={order.id === newestId}
            />
          ))
        )}
      </div>
    </div>
  );
}
