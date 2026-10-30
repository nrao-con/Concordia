import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PatientRequest, RequestStatusHistory, StaffEmail } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
  Users,
  Inbox,
  Send,
  ClipboardList,
  UserCheck,
  ArrowRight,
  Smartphone,
  Copy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type PatientRequestWithDetails = PatientRequest & {
  patient?: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string | null };
  blisterPatient?: { id: number; firstName: string; lastName: string };
  assignedStaff?: StaffEmail | null;
};

const statusLabels: Record<string, string> = {
  new_from_app: "New - From App",
  assigned_cashier: "Assigned to Cashier",
  sent_to_billing: "Sent to Billing",
  sent_to_filling: "Sent to Filling",
  pharmacist_review: "Pharmacist Review",
  completed: "Completed",
};

const statusColors: Record<string, string> = {
  new_from_app: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/70",
  assigned_cashier: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  sent_to_billing: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  sent_to_filling: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  pharmacist_review: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

const typeLabels: Record<string, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  refill: "Refill",
  medication_question: "Medication Question",
  general: "General",
};

const isNewSignup = (request: PatientRequestWithDetails) =>
  request.type === "general" && (request.message || "").startsWith("[NEW_SIGNUP]");

const statusIcons: Record<string, typeof Clock> = {
  new_from_app: Inbox,
  assigned_cashier: UserCheck,
  sent_to_billing: Send,
  sent_to_filling: ClipboardList,
  pharmacist_review: Loader2,
  completed: CheckCircle,
};

export default function AdminPatientRequests() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<PatientRequestWithDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [assignStaffId, setAssignStaffId] = useState<string>("");
  const { toast } = useToast();

  const { data: requests = [], isLoading, refetch, isFetching } = useQuery<PatientRequestWithDetails[]>({
    queryKey: ["/api/admin/patient-requests"],
    refetchInterval: 15000,
  });

  const { data: staffList = [] } = useQuery<StaffEmail[]>({
    queryKey: ["/api/admin/staff-emails"],
  });

  const { data: requestHistory = [], refetch: refetchHistory } = useQuery<RequestStatusHistory[]>({
    queryKey: ["/api/admin/patient-requests", selectedRequest?.id, "history"],
    enabled: !!selectedRequest,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/patient-requests/${id}/status`, { status, notes });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Status Updated", description: "Request status has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patient-requests"] });
      refetchHistory();
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, staffId }: { id: number; staffId: number }) => {
      const response = await apiRequest("PATCH", `/api/admin/patient-requests/${id}/assign`, { staffId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Staff Assigned", description: "Request has been assigned to staff." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patient-requests"] });
      setAssignStaffId("");
    },
    onError: (error: Error) => {
      toast({ title: "Assignment Failed", description: error.message, variant: "destructive" });
    },
  });

  const sendAppLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/patient-requests/${id}/send-app-link`, {});
      return response.json() as Promise<{ success: boolean; appUrl: string; patientEmail: string | null; patientName: string | null; message: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: "App Link Ready",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patient-requests"] });
      setDetailsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const newFromAppCount = requests.filter((r) => r.status === "new_from_app").length;
  const inProgressCount = requests.filter((r) => !["new_from_app", "completed"].includes(r.status)).length;
  const completedCount = requests.filter((r) => r.status === "completed").length;

  const filteredRequests = requests.filter((request) => {
    const patientName = request.patient
      ? `${request.patient.firstName || ""} ${request.patient.lastName || ""}`.toLowerCase()
      : request.blisterPatient
        ? `${request.blisterPatient.firstName} ${request.blisterPatient.lastName}`.toLowerCase()
        : "";
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || patientName.includes(searchLower) || (request.message || "").toLowerCase().includes(searchLower);
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    const matchesType = typeFilter === "all" || request.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleViewDetails = (request: PatientRequestWithDetails) => {
    setSelectedRequest(request);
    setAssignStaffId(request.assignedStaffId?.toString() || "");
    setDetailsDialogOpen(true);
  };

  const handleStatusAction = (id: number, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleAssign = () => {
    if (selectedRequest && assignStaffId) {
      assignMutation.mutate({ id: selectedRequest.id, staffId: parseInt(assignStaffId) });
    }
  };

  const getPatientName = (request: PatientRequestWithDetails) => {
    if (request.patient) {
      return `${request.patient.firstName || ""} ${request.patient.lastName || ""}`.trim() || "Unknown";
    }
    if (request.blisterPatient) {
      return `${request.blisterPatient.firstName} ${request.blisterPatient.lastName}`;
    }
    return "Unknown";
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const RequestRow = ({ request }: { request: PatientRequestWithDetails }) => {
    const StatusIcon = statusIcons[request.status] || Clock;
    const signup = isNewSignup(request);
    return (
      <TableRow
        className="cursor-pointer hover-elevate"
        onClick={() => handleViewDetails(request)}
        data-testid={`row-patient-request-${request.id}`}
      >
        <TableCell>
          <span className="font-medium">{getPatientName(request)}</span>
          {request.patient?.phoneNumber && (
            <div className="text-sm text-muted-foreground">{request.patient.phoneNumber}</div>
          )}
        </TableCell>
        <TableCell>
          {signup ? (
            <Badge className="bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/70">
              <Smartphone className="h-3 w-3 mr-1" />
              New Signup
            </Badge>
          ) : (
            <Badge className={statusColors[request.type] || "bg-muted text-muted-foreground"}>
              {typeLabels[request.type] || request.type}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <Badge className={statusColors[request.status]}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusLabels[request.status] || request.status}
          </Badge>
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {request.priority > 0 ? `Priority ${request.priority}` : "Normal"}
          </span>
        </TableCell>
        <TableCell>
          <span className="text-sm">
            {request.assignedStaff
              ? `${request.assignedStaff.firstName} ${request.assignedStaff.lastName}`
              : "Unassigned"}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{formatDate(request.createdAt)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {signup && request.status !== "completed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  sendAppLinkMutation.mutate(request.id);
                }}
                disabled={sendAppLinkMutation.isPending}
                data-testid={`button-send-app-link-${request.id}`}
              >
                <Smartphone className="h-3 w-3 mr-1" />
                Send App Link
              </Button>
            )}
            {!signup && request.status === "new_from_app" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusAction(request.id, "sent_to_billing");
                }}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-billing-${request.id}`}
              >
                Billing
              </Button>
            )}
            {!signup && (request.status === "new_from_app" || request.status === "assigned_cashier") && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusAction(request.id, "sent_to_filling");
                }}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-filling-${request.id}`}
              >
                Filling
              </Button>
            )}
            {request.status !== "completed" && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusAction(request.id, "completed");
                }}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-complete-${request.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Done
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="admin-page-shell admin-table-workspace p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <ClipboardList className="h-6 w-6 text-primary" />
              PharmFlow Queue
            </h1>
            <p className="text-muted-foreground">Manage incoming patient requests and route through workflow</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {newFromAppCount > 0 && (
              <Badge className="bg-primary/50 text-white" data-testid="badge-new-count">
                {newFromAppCount} New from App
              </Badge>
            )}
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              disabled={isFetching}
              data-testid="button-refresh-requests"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">New from App</CardTitle>
              <Inbox className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-new-count">{newFromAppCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting triage</p>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Loader2 className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-progress-count">{inProgressCount}</div>
              <p className="text-xs text-muted-foreground">Being processed</p>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-completed-count">{completedCount}</div>
              <p className="text-xs text-muted-foreground">Total fulfilled</p>
            </CardContent>
          </Card>
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-count">{requests.length}</div>
              <p className="text-xs text-muted-foreground">All requests</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Patient Requests</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full md:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search patient..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-requests"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="new_from_app">New from App</SelectItem>
                    <SelectItem value="assigned_cashier">Assigned Cashier</SelectItem>
                    <SelectItem value="sent_to_billing">Sent to Billing</SelectItem>
                    <SelectItem value="sent_to_filling">Sent to Filling</SelectItem>
                    <SelectItem value="pharmacist_review">Pharmacist Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40" data-testid="select-type-filter">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="refill">Refill</SelectItem>
                    <SelectItem value="medication_question">Medication Q</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
                <div className="admin-table-frame rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No patient requests found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRequests.map((request) => (
                        <RequestRow key={request.id} request={request} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Request Details
              </DialogTitle>
              <DialogDescription>
                Review request details, assign staff, and update status
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Patient</label>
                    <p className="font-medium mt-1" data-testid="text-detail-patient">
                      {getPatientName(selectedRequest)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Type</label>
                    <div className="mt-1">
                      <Badge className={statusColors[selectedRequest.type] || "bg-muted text-muted-foreground"}>
                        {typeLabels[selectedRequest.type] || selectedRequest.type}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Current Status</label>
                    <div className="mt-1">
                      <Badge className={statusColors[selectedRequest.status]}>
                        {statusLabels[selectedRequest.status] || selectedRequest.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Created</label>
                    <p className="text-sm mt-1">{formatDate(selectedRequest.createdAt)}</p>
                  </div>
                </div>

                {selectedRequest.message && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {isNewSignup(selectedRequest) ? "Signup Notice" : "Message"}
                    </label>
                    <p className="mt-1 p-3 bg-muted rounded-md text-sm" data-testid="text-detail-message">
                      {isNewSignup(selectedRequest)
                        ? selectedRequest.message.replace(/^\[NEW_SIGNUP\]\s*/, "")
                        : selectedRequest.message}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Assign Staff</label>
                  <div className="flex items-center gap-2">
                    <Select value={assignStaffId} onValueChange={setAssignStaffId}>
                      <SelectTrigger data-testid="select-assign-staff">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffList.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id.toString()}>
                            {staff.firstName} {staff.lastName} ({staff.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleAssign}
                      disabled={!assignStaffId || assignMutation.isPending}
                      data-testid="button-assign-staff"
                    >
                      Assign
                    </Button>
                  </div>
                </div>

                {isNewSignup(selectedRequest) && selectedRequest.status !== "completed" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">App Invite</label>
                    <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                      <p className="text-muted-foreground">
                        Send this patient the ConcordiaCare app download link. This will mark the request as complete.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => sendAppLinkMutation.mutate(selectedRequest.id)}
                        disabled={sendAppLinkMutation.isPending}
                        data-testid="button-detail-send-app-link"
                      >
                        {sendAppLinkMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Smartphone className="h-3 w-3 mr-1" />
                        )}
                        Send App Download Link
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Route Request</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isNewSignup(selectedRequest) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusAction(selectedRequest.id, "sent_to_billing")}
                          disabled={updateStatusMutation.isPending || selectedRequest.status === "completed"}
                          data-testid="button-detail-billing"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Send to Billing
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusAction(selectedRequest.id, "sent_to_filling")}
                          disabled={updateStatusMutation.isPending || selectedRequest.status === "completed"}
                          data-testid="button-detail-filling"
                        >
                          <ClipboardList className="h-3 w-3 mr-1" />
                          Send to Filling
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleStatusAction(selectedRequest.id, "completed")}
                      disabled={updateStatusMutation.isPending || selectedRequest.status === "completed"}
                      data-testid="button-detail-complete"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Mark Complete
                    </Button>
                  </div>
                </div>

                {requestHistory.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status History</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {requestHistory.map((entry: any, index: number) => (
                        <div
                          key={entry.id || index}
                          className="flex items-start gap-3 p-2 rounded-md bg-muted text-sm"
                          data-testid={`history-entry-${index}`}
                        >
                          <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {entry.fromStatus && (
                                <>
                                  <Badge className={statusColors[entry.fromStatus] || ""}>
                                    {statusLabels[entry.fromStatus] || entry.fromStatus}
                                  </Badge>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </>
                              )}
                              <Badge className={statusColors[entry.toStatus] || ""}>
                                {statusLabels[entry.toStatus] || entry.toStatus}
                              </Badge>
                            </div>
                            {entry.notes && (
                              <p className="text-muted-foreground mt-1">{entry.notes}</p>
                            )}
                            <p className="text-muted-foreground text-xs mt-1">
                              {formatDate(entry.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailsDialogOpen(false)} data-testid="button-close-details">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
