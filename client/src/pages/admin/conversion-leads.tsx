import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authenticatedFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BackButton } from "@/components/back-button";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Clock,
  CheckCircle,
  XCircle,
  Phone,
  Star,
  Pill,
  Search,
  Flame,
  Shield,
} from "lucide-react";
import type { ConversionLead } from "@shared/schema";

function getTimeElapsed(dateStr: Date | string): string {
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function isOverdue(date: Date | string): boolean {
  const created = new Date(date);
  const now = new Date();
  return (now.getTime() - created.getTime()) > 2 * 60 * 60 * 1000;
}

export default function AdminConversionLeads() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("pending_request");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<ConversionLead | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLeadId, setRejectLeadId] = useState<number | null>(null);

  const { data: leads = [], isLoading } = useQuery<ConversionLead[]>({
    queryKey: ["/api/admin/conversion-leads", statusFilter],
    queryFn: async () => {
      const url = statusFilter ? `/api/admin/conversion-leads?status=${statusFilter}` : "/api/admin/conversion-leads";
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/conversion-leads/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversion-leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attention-counts"] });
      toast({ title: "Lead Approved", description: "Patient has been approved and notified." });
      setSelectedLead(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve lead.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      return await apiRequest("POST", `/api/admin/conversion-leads/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversion-leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attention-counts"] });
      toast({ title: "Lead Rejected", description: "Lead has been rejected." });
      setShowRejectDialog(false);
      setSelectedLead(null);
      setRejectReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reject lead.", variant: "destructive" });
    },
  });

  const filledMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/conversion-leads/${id}/filled`, {});
      return response.json();
    },
    onSuccess: (result: { notificationChannel?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversion-leads"] });
      toast({
        title: "Patient notified",
        description: `The ready update was sent by ${result.notificationChannel || "the configured channel"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Notification not sent",
        description: error.message || "The request is filled, but the patient notification could not be delivered.",
        variant: "destructive",
      });
    },
  });

  const filtered = leads.filter((lead) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.contactName.toLowerCase().includes(q) ||
      lead.phone.includes(q) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.previousPharmacyName && lead.previousPharmacyName.toLowerCase().includes(q))
    );
  });

  const pendingCount = leads.filter(l => l.status === "pending_request").length;
  const highPriorityCount = leads.filter(l => l.status === "pending_request" && (l.medicationCount || 0) >= 10).length;

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden admin-command-center">
          <header className="flex items-center justify-between gap-2 border-b p-3 sticky top-0 z-50 bg-[hsl(220,15%,8%)]">
            <div className="flex items-center gap-2 flex-wrap">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <BackButton to="/admin" />
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold font-mono tracking-tight">WAR ROOM</h1>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="font-mono text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                  {pendingCount} PENDING
                </Badge>
              )}
              {highPriorityCount > 0 && (
                <Badge className="font-mono text-xs bg-red-900/50 text-red-300 border border-red-700/50">
                  {highPriorityCount} HIGH PRI
                </Badge>
              )}
            </div>
          </header>

          <PageTransition className="flex-1 overflow-auto p-4 space-y-4 bg-[hsl(220,15%,6%)]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-[hsl(220,12%,10%)] border-[hsl(220,10%,18%)]">
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold font-mono text-[hsl(210,5%,90%)]" data-testid="text-total-leads">{leads.length}</div>
                  <p className="text-xs text-[hsl(210,5%,55%)] font-mono uppercase tracking-wide">Total</p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(220,12%,10%)] border-[hsl(220,10%,18%)]">
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold font-mono text-yellow-400">{pendingCount}</div>
                  <p className="text-xs text-[hsl(210,5%,55%)] font-mono uppercase tracking-wide">Pending</p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(220,12%,10%)] border-[hsl(220,10%,18%)]">
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold font-mono text-red-400">{highPriorityCount}</div>
                  <p className="text-xs text-[hsl(210,5%,55%)] font-mono uppercase tracking-wide">High Pri</p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(220,12%,10%)] border-[hsl(220,10%,18%)]">
                <CardContent className="pt-4 pb-3 text-center">
                  <div className="text-2xl font-bold font-mono text-green-400">
                    {leads.filter(l => l.status === "approved").length}
                  </div>
                  <p className="text-xs text-[hsl(210,5%,55%)] font-mono uppercase tracking-wide">Approved</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(210,5%,50%)]" />
                <Input
                  placeholder="Search by name, phone, pharmacy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-[hsl(220,12%,10%)] border-[hsl(220,10%,20%)] text-[hsl(210,5%,90%)] placeholder:text-[hsl(210,5%,40%)] font-mono text-sm"
                  data-testid="input-search-leads"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 bg-[hsl(220,12%,10%)] border-[hsl(220,10%,20%)] text-[hsl(210,5%,90%)] font-mono text-sm" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_request">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All Leads</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-[hsl(210,5%,50%)] font-mono">Loading leads...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-[hsl(210,5%,50%)] font-mono">
                No conversion leads found
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((lead) => {
                  const overdue = lead.status === "pending_request" && isOverdue(lead.createdAt);
                  const isHighPriority = (lead.medicationCount || 0) >= 10;
                  const isFluShot = lead.sourceAction === "flu_shot_booking";

                  return (
                    <Card
                      key={lead.id}
                      className={`hover-elevate cursor-pointer bg-[hsl(220,12%,10%)] border-[hsl(220,10%,18%)] ${overdue ? "glow-red-pulse" : ""} ${isHighPriority && lead.status === "pending_request" ? "border-yellow-700/50" : ""}`}
                      onClick={() => setSelectedLead(lead)}
                      data-testid={`card-lead-${lead.id}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`rounded-full p-2 flex-shrink-0 ${lead.status === "approved" ? "bg-green-900/30" : lead.status === "rejected" ? "bg-[hsl(220,10%,15%)]" : "bg-primary/15"}`}>
                              {lead.status === "approved" ? (
                                <CheckCircle className="h-5 w-5 text-green-400" />
                              ) : lead.status === "rejected" ? (
                                <XCircle className="h-5 w-5 text-[hsl(210,5%,50%)]" />
                              ) : (
                                <UserPlus className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate text-[hsl(210,5%,90%)]" data-testid={`text-lead-name-${lead.id}`}>
                                  {lead.contactName}
                                </span>
                                {isHighPriority && lead.status === "pending_request" && (
                                  <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 text-xs font-mono">
                                    <Flame className="h-3 w-3 mr-1" />
                                    HIGH PRI
                                  </Badge>
                                )}
                                {isFluShot && lead.status === "pending_request" && (
                                  <Badge variant="outline" className="text-xs border-primary/50 text-primary/70 font-mono">
                                    IN-PERSON
                                  </Badge>
                                )}
                                {lead.status === "approved" && (
                                  <Badge className="bg-green-900/40 text-green-300 border border-green-700/50 text-xs font-mono">APPROVED</Badge>
                                )}
                                {lead.status === "rejected" && (
                                  <Badge variant="secondary" className="text-xs font-mono bg-[hsl(220,10%,15%)] text-[hsl(210,5%,50%)]">REJECTED</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-[hsl(210,5%,50%)] mt-0.5 flex-wrap font-mono">
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone}
                                </span>
                                {lead.previousPharmacyName && (
                                  <span>FROM: {lead.previousPharmacyName}</span>
                                )}
                                <span>{lead.leadType === "transfer" ? "XFER" : "NEW RX"}</span>
                                {lead.medicationCount !== null && lead.medicationCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Pill className="h-3 w-3" />
                                    {lead.medicationCount} meds
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className={`text-xs text-right font-mono ${overdue ? "text-red-400 font-medium" : "text-[hsl(210,5%,50%)]"}`}>
                              <Clock className="h-3 w-3 inline mr-1" />
                              {getTimeElapsed(lead.createdAt)}
                              {overdue && <span className="block text-red-400 font-semibold">OVERDUE</span>}
                            </div>
                            {lead.status === "pending_request" && (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  onClick={() => approveMutation.mutate(lead.id)}
                                  disabled={approveMutation.isPending}
                                  className="font-mono text-xs bg-green-700 border-green-600"
                                  data-testid={`button-approve-${lead.id}`}
                                >
                                  APPROVE
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRejectLeadId(lead.id);
                                    setShowRejectDialog(true);
                                  }}
                                  className="font-mono text-xs border-[hsl(220,10%,25%)] text-[hsl(210,5%,70%)]"
                                  data-testid={`button-reject-${lead.id}`}
                                >
                                  REJECT
                                </Button>
                              </div>
                            )}
                            {lead.status === "approved" && !lead.adminNotes?.includes("[PATIENT_READY_NOTIFICATION_SENT]") && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  filledMutation.mutate(lead.id);
                                }}
                                disabled={filledMutation.isPending}
                                className="font-mono text-xs bg-blue-700 border-blue-600"
                                data-testid={`button-filled-notify-${lead.id}`}
                              >
                                FILLED &amp; NOTIFY
                              </Button>
                            )}
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

      {selectedLead && (
        <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {selectedLead.contactName}
                {(selectedLead.medicationCount || 0) >= 10 && (
                  <Badge className="bg-yellow-500 text-white">
                    <Flame className="h-3 w-3 mr-1" />
                    High Priority
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedLead.leadType === "transfer" ? "Prescription Transfer Request" : "New Prescription Request"}
                {" "}via {selectedLead.sourceAction.replace(/_/g, " ")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Phone</span>
                  <p className="font-medium">{selectedLead.phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email</span>
                  <p className="font-medium">{selectedLead.email || "Not available"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date of Birth</span>
                  <p className="font-medium">{selectedLead.dateOfBirth || "Not available"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Medication Count</span>
                  <p className="font-medium">{selectedLead.medicationCount || 0} daily meds</p>
                </div>
              </div>
              {selectedLead.previousPharmacyName && (
                <div>
                  <span className="text-muted-foreground">Previous Pharmacy</span>
                  <p className="font-medium">{selectedLead.previousPharmacyName}</p>
                </div>
              )}
              {selectedLead.doctorInfo && (
                <div>
                  <span className="text-muted-foreground">Doctor Info</span>
                  <p className="font-medium">{selectedLead.doctorInfo}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={selectedLead.status === "approved" ? "default" : selectedLead.status === "rejected" ? "secondary" : "outline"}>
                  {selectedLead.status.replace(/_/g, " ")}
                </Badge>
              </div>
              {selectedLead.qualifiesForWellnessPack && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md border border-yellow-200 dark:border-yellow-800">
                  <Star className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-800 dark:text-yellow-300 text-sm font-medium">
                    Qualifies for Free 30-Day Wellness Pack
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Submitted {getTimeElapsed(selectedLead.createdAt)}
                {selectedLead.status === "pending_request" && isOverdue(selectedLead.createdAt) && (
                  <Badge className="bg-red-500 text-white text-xs ml-2">Callback Overdue</Badge>
                )}
              </div>
              {selectedLead.pointsGranted && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">500 Points Granted</span>
                </div>
              )}
              {selectedLead.rejectionReason && (
                <div className="p-3 bg-muted rounded-md">
                  <span className="text-muted-foreground text-xs">Rejection Reason:</span>
                  <p className="text-sm">{selectedLead.rejectionReason}</p>
                </div>
              )}
            </div>
            {selectedLead.status === "pending_request" && (
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectLeadId(selectedLead.id);
                    setShowRejectDialog(true);
                  }}
                  data-testid="button-reject-dialog"
                >
                  Reject
                </Button>
                <Button
                  onClick={() => approveMutation.mutate(selectedLead.id)}
                  disabled={approveMutation.isPending}
                  className="gap-2"
                  data-testid="button-approve-dialog"
                >
                  <CheckCircle className="h-4 w-4" />
                  {approveMutation.isPending ? "Approving..." : "Approve & Invite"}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Lead</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unable to verify transfer, duplicate request..."
              data-testid="input-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason || rejectMutation.isPending}
              onClick={() => rejectLeadId && rejectMutation.mutate({ id: rejectLeadId, reason: rejectReason })}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
