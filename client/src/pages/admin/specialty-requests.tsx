import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BackButton } from "@/components/back-button";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { useAuth } from "@/hooks/useAuth";
import type { SpecialtyFulfillmentRequest } from "@shared/schema";
import {
  FileText,
  Search,
  Clock,
  CheckCircle2,
  Phone,
  Mail,
  User,
  Stethoscope,
  Pill,
  ArrowRight,
  Upload,
  Eye,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "border-amber-500/30 text-amber-400 bg-amber-500/10" },
  in_review: { label: "In Review", color: "border-primary/30 text-primary bg-primary/10" },
  contacted: { label: "Contacted", color: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
  completed: { label: "Completed", color: "border-green-500/30 text-green-400 bg-green-500/10" },
  cancelled: { label: "Cancelled", color: "border-red-500/30 text-red-400 bg-red-500/10" },
};

const REQUEST_TYPE_MAP: Record<string, { label: string; icon: LucideIcon }> = {
  new_prescription: { label: "New Prescription", icon: Upload },
  transfer: { label: "Transfer", icon: ArrowRight },
  e_script: { label: "E-Script", icon: FileText },
};

const SOURCE_MAP: Record<string, string> = {
  website: "Website",
  mobile_app: "Mobile App",
  staff_app: "Staff App",
};

export default function AdminSpecialtyRequests() {
  useAdminWebSocket();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<SpecialtyFulfillmentRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery<SpecialtyFulfillmentRequest[]>({
    queryKey: ["/api/admin/specialty-fulfillment-requests"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status?: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/specialty-fulfillment-requests/${id}`, { status, adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialty-fulfillment-requests"] });
      toast({ title: "Updated", description: "Request updated successfully." });
      setSelectedRequest(null);
    },
    onError: (error: Error) => {
      toast({ title: "Could not update request", description: error.message, variant: "destructive" });
    },
  });

  const takeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/specialty-fulfillment-requests/${id}/take`, {});
      return res.json() as Promise<SpecialtyFulfillmentRequest>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialty-fulfillment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attention-counts"] });
      setSelectedRequest(updated);
      toast({ title: "Request assigned", description: `You are now managing request #${updated.id}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Could not take request", description: error.message, variant: "destructive" });
    },
  });

  const filtered = requests.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.patientName.toLowerCase().includes(q) ||
        r.medicationName.toLowerCase().includes(q) ||
        r.prescriberName.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = requests.filter(r => r.status === "pending").length;

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 p-3 border-b">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <BackButton to="/admin" />
              <Pill className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold" data-testid="text-page-title">Specialty Requests</h1>
              {pendingCount > 0 && (
                <Badge variant="destructive">{pendingCount} pending</Badge>
              )}
            </div>
          </header>

          <PageTransition className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient, medication, prescriber..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-requests"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No requests found</h3>
                <p className="text-sm text-muted-foreground">
                  {requests.length === 0 ? "No fulfillment requests have been submitted yet." : "Try adjusting your search or filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((req) => {
                  const statusInfo = STATUS_MAP[req.status] || STATUS_MAP.pending;
                  const typeInfo = REQUEST_TYPE_MAP[req.requestType] || REQUEST_TYPE_MAP.new_prescription;
                  const TypeIcon = typeInfo.icon;
                  return (
                    <Card key={req.id} className="hover-elevate" data-testid={`card-request-${req.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium" data-testid={`text-med-name-${req.id}`}>{req.medicationName}</h3>
                              <Badge variant="outline" className={statusInfo.color}>
                                {statusInfo.label}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {req.patientName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {req.phone}
                              </span>
                              {req.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {req.email}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" />
                                {req.prescriberName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                <TypeIcon className="h-3 w-3 mr-1" />
                                {typeInfo.label}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {SOURCE_MAP[req.source] || req.source}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Admin #{req.id}</span>
                              {req.externalRequestId && (
                                <span className="text-xs text-muted-foreground">App ID: {req.externalRequestId}</span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {req.assignedToUserId && (
                              <p className="mt-2 text-xs font-medium text-primary">
                                Assigned to {req.assignedToUserId === user?.id ? "you" : (req.assignedToName || "another administrator")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!req.assignedToUserId && req.status !== "completed" && req.status !== "cancelled" && (
                              <Button
                                size="sm"
                                onClick={() => takeMutation.mutate(req.id)}
                                disabled={takeMutation.isPending}
                                data-testid={`button-take-request-${req.id}`}
                              >
                                Take Request
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedRequest(req);
                                setAdminNotes(req.adminNotes || "");
                              }}
                              data-testid={`button-view-request-${req.id}`}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </PageTransition>
        </div>
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-review-title">Review Request #{selectedRequest?.id}</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Source</p>
                  <p className="font-medium">{SOURCE_MAP[selectedRequest.source] || selectedRequest.source}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Request IDs</p>
                  <p className="font-medium">Admin #{selectedRequest.id}</p>
                  {selectedRequest.externalRequestId && (
                    <p className="text-xs text-muted-foreground">App: {selectedRequest.externalRequestId}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Medication</p>
                  <p className="font-medium">{selectedRequest.medicationName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Request Type</p>
                  <p className="font-medium">{REQUEST_TYPE_MAP[selectedRequest.requestType]?.label}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Patient</p>
                  <p className="font-medium">{selectedRequest.patientName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Phone</p>
                  <p className="font-medium">{selectedRequest.phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Email</p>
                  <p className="font-medium">{selectedRequest.email || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Prescriber</p>
                  <p className="font-medium">{selectedRequest.prescriberName}</p>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground mb-1">Assignment</p>
                {selectedRequest.assignedToUserId ? (
                  <p className="text-sm font-medium">
                    {selectedRequest.assignedToUserId === user?.id ? "Assigned to you" : `Assigned to ${selectedRequest.assignedToName || "another administrator"}`}
                  </p>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => takeMutation.mutate(selectedRequest.id)}
                    disabled={takeMutation.isPending}
                    data-testid="button-take-selected-request"
                  >
                    Take Request
                  </Button>
                )}
              </div>
              {selectedRequest.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Patient Notes</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedRequest.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Update Status</p>
                <Select
                  value={selectedRequest.status}
                  disabled={selectedRequest.assignedToUserId !== user?.id || updateMutation.isPending}
                  onValueChange={(v) => {
                    updateMutation.mutate({ id: selectedRequest.id, status: v, adminNotes });
                  }}
                >
                  <SelectTrigger data-testid="select-update-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Admin Notes</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                  data-testid="input-admin-notes"
                />
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate({ id: selectedRequest.id, adminNotes })}
                  disabled={selectedRequest.assignedToUserId !== user?.id || updateMutation.isPending}
                  data-testid="button-save-notes"
                >
                  Save Notes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
