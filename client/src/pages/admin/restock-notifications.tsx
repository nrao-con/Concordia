import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminSidebar } from "@/components/admin-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  BellRing,
  Trash2,
  Search,
  Mail,
  Phone,
  Package,
  RefreshCw,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";

interface RestockNotification {
  id: number;
  category: string | null;
  productId: string | null;
  productName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  notifiedAt: string | null;
}

type StatusFilter = "all" | "pending" | "sent";

export default function AdminRestockNotifications() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: notifications = [], isLoading } = useQuery<RestockNotification[]>({
    queryKey: ["/api/admin/restock-notifications"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/restock-notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restock-notifications"] });
      toast({ title: "Notification removed" });
    },
    onError: (error: Error) => toast({
      title: "Failed to remove notification",
      description: error.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const clearSentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/restock-notifications/clear-sent"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restock-notifications"] });
      toast({ title: "Sent notifications cleared" });
    },
    onError: (error: Error) => toast({
      title: "Failed to clear sent notifications",
      description: error.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const filtered = notifications.filter((n) => {
    if (statusFilter !== "all" && n.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (n.name ?? "").toLowerCase().includes(q) ||
      (n.email ?? "").toLowerCase().includes(q) ||
      (n.phone ?? "").toLowerCase().includes(q) ||
      (n.category ?? "").toLowerCase().includes(q) ||
      (n.productName ?? "").toLowerCase().includes(q)
    );
  });

  const pendingCount = notifications.filter((n) => n.status === "pending").length;
  const sentCount = notifications.filter((n) => n.status === "sent").length;

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-restock-title">
                <BellRing className="h-6 w-6 text-primary" />
                Restock Alerts
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Patients waiting to be notified when out-of-stock items return
              </p>
            </div>
            <Button
              variant="outline"
              size="default"
              onClick={() => clearSentMutation.mutate()}
              disabled={clearSentMutation.isPending || sentCount === 0}
              data-testid="button-clear-sent"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Clear Sent ({sentCount})
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-total-count">{notifications.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending</p>
                <p className="text-2xl font-bold mt-1 text-amber-500" data-testid="text-pending-count">{pendingCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Notified</p>
                <p className="text-2xl font-bold mt-1 text-green-500" data-testid="text-sent-count">{sentCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Subscriptions</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, product…"
                    className="pl-9 w-60 text-sm"
                    data-testid="input-search-restock"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {(["all", "pending", "sent"] as StatusFilter[]).map((f) => (
                    <Button
                      key={f}
                      variant={statusFilter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatusFilter(f)}
                      data-testid={`button-filter-${f}`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm" data-testid="text-empty-restock">
                  No restock subscriptions found.
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-3"
                      data-testid={`row-restock-${n.id}`}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {n.name ?? "Anonymous"}
                          </span>
                          <Badge variant={n.status === "sent" ? "secondary" : "outline"} className="text-xs">
                            {n.status === "sent" ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />Notified</>
                            ) : (
                              <><Clock className="h-3 w-3 mr-1 text-amber-500" />Pending</>
                            )}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {n.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />{n.email}
                            </span>
                          )}
                          {n.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />{n.phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {n.productName
                              ? n.productName
                              : n.category
                              ? `Category: ${n.category}`
                              : "General"}
                          </span>
                          <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                          {n.notifiedAt && (
                            <span className="text-green-600">
                              Sent {new Date(n.notifiedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(n.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-restock-${n.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
