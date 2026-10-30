import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { UrgentRefillRequest, Prescription, User } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Pill, 
  Search, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  User as UserIcon,
  Calendar,
  HeartHandshake,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type UrgentRefillWithDetails = UrgentRefillRequest & {
  prescription?: Prescription;
  patient?: User;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  processing: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/70",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

const priorityColors: Record<string, string> = {
  normal: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/70",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  cancelled: XCircle,
};

export default function AdminUrgentRefills() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<UrgentRefillWithDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();

  const { data: requests = [], isLoading, refetch, isFetching } = useQuery<UrgentRefillWithDetails[]>({
    queryKey: ["/api/admin/urgent-refills"],
    refetchInterval: 30000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/urgent-refills/${id}`, { status, adminNotes });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "The refill request status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/urgent-refills"] });
      setDetailsDialogOpen(false);
      setSelectedRequest(null);
      setNewStatus("");
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update the request status.",
        variant: "destructive",
      });
    },
  });

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processingRequests = requests.filter((r) => r.status === "processing");
  const completedRequests = requests.filter((r) => r.status === "completed");
  const urgentRequests = requests.filter((r) => r.priority === "urgent" && r.status === "pending");

  const filteredRequests = requests.filter((request) => {
    const patientName = request.patient ? `${request.patient.firstName || ""} ${request.patient.lastName || ""}`.toLowerCase() : "";
    const medicationName = request.prescription?.medicationName?.toLowerCase() || "";
    const searchLower = searchTerm.toLowerCase();
    
    return patientName.includes(searchLower) || medicationName.includes(searchLower);
  });

  const handleViewDetails = (request: UrgentRefillWithDetails) => {
    setSelectedRequest(request);
    setNewStatus(request.status);
    setAdminNotes(request.adminNotes || "");
    setDetailsDialogOpen(true);
  };

  const handleUpdateStatus = () => {
    if (selectedRequest && newStatus) {
      updateStatusMutation.mutate({
        id: selectedRequest.id,
        status: newStatus,
        adminNotes: adminNotes || undefined,
      });
    }
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

  const RequestRow = ({ request }: { request: UrgentRefillWithDetails }) => {
    const StatusIcon = statusIcons[request.status] || Clock;
    const patientName = request.patient ? `${request.patient.firstName || ""} ${request.patient.lastName || ""}`.trim() : "Unknown";
    
    return (
      <TableRow 
        className="cursor-pointer hover-elevate"
        onClick={() => handleViewDetails(request)}
        data-testid={`row-urgent-refill-${request.id}`}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {request.priority === "urgent" && (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}
            <span className="font-medium">{patientName}</span>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            {request.requestedByType === "caregiver" ? (
              <>
                <HeartHandshake className="h-3 w-3" />
                <span>Requested by caregiver</span>
              </>
            ) : (
              <>
                <UserIcon className="h-3 w-3" />
                <span>Self-requested</span>
              </>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="font-medium">{request.prescription?.medicationName || "Unknown"}</div>
          <div className="text-sm text-muted-foreground">
            {request.prescription?.dosage || "N/A"}
          </div>
        </TableCell>
        <TableCell>
          <Badge className={priorityColors[request.priority]}>
            {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge className={statusColors[request.status]}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDate(request.createdAt)}
        </TableCell>
        <TableCell>
          <Button 
            size="sm" 
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetails(request);
            }}
            data-testid={`button-view-refill-${request.id}`}
          >
            View
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="admin-page-shell admin-table-workspace p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Pill className="h-6 w-6 text-primary" />
              Urgent Refill Requests
            </h1>
            <p className="text-muted-foreground">
              Manage prescription refill requests from patients and caregivers
            </p>
          </div>
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            size="sm"
            disabled={isFetching}
            data-testid="button-refresh-refills"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingRequests.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting action</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Urgent</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{urgentRequests.length}</div>
              <p className="text-xs text-muted-foreground">High priority</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Loader2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processingRequests.length}</div>
              <p className="text-xs text-muted-foreground">In progress</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedRequests.length}</div>
              <p className="text-xs text-muted-foreground">Total fulfilled</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Refill Requests</CardTitle>
                <CardDescription>View and manage all prescription refill requests</CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient or medication..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-refills"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all" data-testid="tab-all-refills">
                  All ({requests.length})
                </TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending-refills">
                  Pending ({pendingRequests.length})
                </TabsTrigger>
                <TabsTrigger value="urgent" data-testid="tab-urgent-refills">
                  Urgent ({urgentRequests.length})
                </TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-completed-refills">
                  Completed ({completedRequests.length})
                </TabsTrigger>
              </TabsList>

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <TabsContent value="all">
                    <div className="admin-table-frame rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead>Medication</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRequests.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No refill requests found
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
                  </TabsContent>

                  <TabsContent value="pending">
                    <div className="admin-table-frame rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead>Medication</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingRequests.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No pending requests
                              </TableCell>
                            </TableRow>
                          ) : (
                            pendingRequests.map((request) => (
                              <RequestRow key={request.id} request={request} />
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="urgent">
                    <div className="admin-table-frame rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead>Medication</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {urgentRequests.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No urgent requests
                              </TableCell>
                            </TableRow>
                          ) : (
                            urgentRequests.map((request) => (
                              <RequestRow key={request.id} request={request} />
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="completed">
                    <div className="admin-table-frame rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead>Medication</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {completedRequests.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No completed requests
                              </TableCell>
                            </TableRow>
                          ) : (
                            completedRequests.map((request) => (
                              <RequestRow key={request.id} request={request} />
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Refill Request Details
              </DialogTitle>
              <DialogDescription>
                Review and update the refill request status
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Patient</label>
                    <p className="font-medium flex items-center gap-2 mt-1">
                      <UserIcon className="h-4 w-4" />
                      {selectedRequest.patient 
                        ? `${selectedRequest.patient.firstName || ""} ${selectedRequest.patient.lastName || ""}`.trim() 
                        : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Requested By</label>
                    <p className="font-medium flex items-center gap-2 mt-1">
                      {selectedRequest.requestedByType === "caregiver" ? (
                        <>
                          <HeartHandshake className="h-4 w-4" />
                          Caregiver
                        </>
                      ) : (
                        <>
                          <UserIcon className="h-4 w-4" />
                          Patient
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Medication</label>
                    <p className="font-medium mt-1">
                      {selectedRequest.prescription?.medicationName || "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedRequest.prescription?.dosage || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Priority</label>
                    <div className="mt-1">
                      <Badge className={priorityColors[selectedRequest.priority]}>
                        {selectedRequest.priority === "urgent" && (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {selectedRequest.priority.charAt(0).toUpperCase() + selectedRequest.priority.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Requested</label>
                  <p className="font-medium flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(selectedRequest.createdAt)}
                  </p>
                </div>

                {selectedRequest.notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Patient Notes</label>
                    <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                      {selectedRequest.notes}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Update Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Admin Notes</label>
                  <Textarea
                    placeholder="Add notes about this request..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="input-admin-notes"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDetailsDialogOpen(false)}
                data-testid="button-cancel-dialog"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateStatus}
                disabled={updateStatusMutation.isPending || !newStatus}
                data-testid="button-update-status"
              >
                {updateStatusMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Status"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
