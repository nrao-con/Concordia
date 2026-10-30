import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import type { ConversionLead } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Search, 
  RefreshCw, 
  Phone, 
  Clock, 
  CheckCircle, 
  XCircle,
  ArrowRight,
  Eye,
  Edit3,
  Upload,
  Gift,
  Building2,
  User,
  FileText,
  Loader2,
  AlertCircle,
  Trash2,
  Pill,
  Unlock,
  Star,
  Package
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { PrescriptionTransferRequest } from "@shared/schema";

type TransferRequestWithWellness = PrescriptionTransferRequest & {
  expectedMedCount?: number | null;
  wellnessPackEligible?: boolean;
  pendingPoints?: number;
  pendingPointsReleased?: boolean;
  vitaminsIncluded?: boolean;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback;
  const responseBody = error.message.match(/^\d+:\s*([\s\S]*)$/)?.[1];
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      // Preserve non-JSON server responses below.
    }
  }
  return error.message;
}

export default function AdminTransferRequests() {
  useAdminWebSocket();
  const [, navigate] = useLocation();
  
  const initialTab = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tab") ?? "all"
    : "all";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(`/admin/transfer-requests${tab !== "all" ? `?tab=${tab}` : ""}`, { replace: true });
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<TransferRequestWithWellness | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery<TransferRequestWithWellness[]>({
    queryKey: ["/api/admin/transfer-requests"],
    refetchInterval: 15000,
  });

  const { data: wellnessConversionLeads = [] } = useQuery<ConversionLead[]>({
    queryKey: ["/api/admin/conversion-leads/wellness-eligible"],
    refetchInterval: 15000,
  });

  const updateRequestMutation = useMutation({
    mutationFn: async (data: { id: number; status: string; notes?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/transfer-requests/${data.id}`, {
        status: data.status,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Updated",
        description: "The transfer request has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
      setDetailsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: getApiErrorMessage(error, "Failed to update the transfer request."),
        variant: "destructive",
      });
    },
  });

  const releasePointsMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/transfer-requests/${id}/release-points`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Points Released",
        description: `${data.pointsReleased} Wellness Points have been added to the patient's account.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
      setDetailsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Release Failed",
        description: getApiErrorMessage(error, "Failed to release points."),
        variant: "destructive",
      });
    },
  });

  const markVitaminsMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/transfer-requests/${id}/mark-vitamins-included`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Vitamins Marked",
        description: "Free wellness vitamins have been marked as included in the first delivery.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: getApiErrorMessage(error, "Failed to mark vitamins."),
        variant: "destructive",
      });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/transfer-requests/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Deleted",
        description: "The transfer request has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
      setDetailsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: getApiErrorMessage(error, "Failed to delete the transfer request."),
        variant: "destructive",
      });
    },
  });

  const filteredRequests = requests.filter((request) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      request.contactName.toLowerCase().includes(search) ||
      request.phoneNumber.toLowerCase().includes(search) ||
      request.email?.toLowerCase().includes(search) ||
      request.previousPharmacyName?.toLowerCase().includes(search);
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const wellnessEligibleRequests = requests.filter(
    (r) => r.wellnessPackEligible
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "request_received":
        return <Badge variant="secondary" className="bg-primary/10 text-primary/80 dark:bg-primary/30 dark:text-primary/70">Received</Badge>;
      case "processing":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Processing</Badge>;
      case "contacting_pharmacy":
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Contacting</Badge>;
      case "transfer_in_progress":
        return <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">In Progress</Badge>;
      case "transfer_successful":
        return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Successful</Badge>;
      case "transfer_failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case "form_submission":
        return <Edit3 className="h-4 w-4 text-primary" />;
      case "label_upload":
        return <Upload className="h-4 w-4 text-primary" />;
      case "click_to_call":
        return <Phone className="h-4 w-4 text-green-600" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const stats = {
    total: requests.length,
    received: requests.filter((r) => r.status === "request_received").length,
    processing: requests.filter((r) => ["processing", "contacting_pharmacy", "transfer_in_progress"].includes(r.status)).length,
    completed: requests.filter((r) => r.status === "transfer_successful").length,
    failed: requests.filter((r) => r.status === "transfer_failed").length,
    wellnessEligible: wellnessEligibleRequests.length + wellnessConversionLeads.length,
  };

  const handleViewDetails = (request: TransferRequestWithWellness) => {
    setSelectedRequest(request);
    setUpdateStatus(request.status);
    setAdminNotes(request.notes || "");
    setDetailsDialogOpen(true);
  };

  const handleUpdateRequest = () => {
    if (selectedRequest) {
      updateRequestMutation.mutate({
        id: selectedRequest.id,
        status: updateStatus,
        notes: adminNotes,
      });
    }
  };

  const RequestsTable = ({ data }: { data: TransferRequestWithWellness[] }) => (
    <Table className="admin-dense-table">
      <TableHeader>
        <TableRow>
          <TableHead>Patient</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Previous Pharmacy</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Wellness</TableHead>
          <TableHead>Reward</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((request) => (
          <TableRow 
            key={request.id}
            className="cursor-pointer hover-elevate"
            onClick={() => handleViewDetails(request)}
            data-testid={`row-transfer-${request.id}`}
          >
            <TableCell>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{request.contactName}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {request.phoneNumber}
                </div>
                {request.email && (
                  <div className="text-muted-foreground text-xs">{request.email}</div>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{request.previousPharmacyName || "Not provided"}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {getModeIcon(request.mode)}
                  <span className="text-sm capitalize">
                    {request.mode.replace(/_/g, " ")}
                  </span>
                </div>
                {request.source === "app" && (
                  <Badge variant="secondary" className="text-xs w-fit bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                    App
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>{getStatusBadge(request.status)}</TableCell>
            <TableCell>
              {request.wellnessPackEligible ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 whitespace-nowrap">
                  <Pill className="h-3 w-3 mr-1" />
                  {request.expectedMedCount}+ meds
                </Badge>
              ) : request.expectedMedCount ? (
                <span className="text-xs text-muted-foreground">{request.expectedMedCount} meds</span>
              ) : (
                <span className="text-xs text-muted-foreground">Not available</span>
              )}
            </TableCell>
            <TableCell>
              {request.pendingPointsReleased ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <Gift className="h-3 w-3 mr-1" />
                  Released
                </Badge>
              ) : request.rewardPointsGranted ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Awaiting
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <div className="text-sm text-muted-foreground">
                {format(new Date(request.createdAt), "MMM d, yyyy")}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails(request);
                  }}
                  data-testid={`button-view-transfer-${request.id}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Are you sure you want to delete this transfer request? This action cannot be undone.")) {
                      deleteRequestMutation.mutate(request.id);
                    }
                  }}
                  disabled={deleteRequestMutation.isPending}
                  data-testid={`button-delete-transfer-${request.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <AdminLayout title="Transfer Requests" backTo="/admin">
      <div className="admin-page-shell admin-table-workspace space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-6">
              <Card className="admin-table-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">New</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary/90">{stats.received}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Loader2 className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Wellness Pack</CardTitle>
              <Star className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.wellnessEligible}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList data-testid="tabs-transfer-requests">
            <TabsTrigger value="all" data-testid="tab-all-requests">All Requests</TabsTrigger>
            <TabsTrigger value="promotion" data-testid="tab-promotion-tracker">
              Promotion Tracker
              {stats.wellnessEligible > 0 && (
                <Badge className="ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {stats.wellnessEligible}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, or pharmacy..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-transfer"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="request_received">Received</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="contacting_pharmacy">Contacting Pharmacy</SelectItem>
                      <SelectItem value="transfer_in_progress">In Progress</SelectItem>
                      <SelectItem value="transfer_successful">Successful</SelectItem>
                      <SelectItem value="transfer_failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Requests Table */}
            <Card>
              <CardHeader>
                <CardTitle>Transfer Requests</CardTitle>
                <CardDescription>
                  Click on a request to view details and update status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {searchTerm || statusFilter !== "all"
                        ? "No transfer requests match your search."
                        : "No transfer requests yet."}
                    </p>
                  </div>
                ) : (
                  <RequestsTable data={filteredRequests} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promotion" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-emerald-500" />
                  Promotion Tracker: Wellness Welcome Pack
                </CardTitle>
                <CardDescription>
                  All patients who transferred 10+ medications and qualify for free vitamins in their first delivery. Mark vitamins as included when packing, then release the 500 Wellness Points after confirming the first fill.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {wellnessEligibleRequests.length === 0 && wellnessConversionLeads.length === 0 ? (
                  <div className="text-center py-12">
                    <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No wellness-eligible patients yet.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Patients who transfer 10+ medications or request 10+ meds via OTC/flu-shot will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {wellnessConversionLeads.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          OTC &amp; Flu Shot Leads
                        </h4>
                        {wellnessConversionLeads.map((lead) => (
                          <Card key={`lead-${lead.id}`} data-testid={`card-wellness-lead-${lead.id}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="font-semibold">{lead.contactName}</span>
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      <Pill className="h-3 w-3 mr-1" />
                                      {lead.medicationCount}+ meds
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {lead.sourceAction?.replace(/_/g, " ")}
                                    </Badge>
                                    <Badge
                                      variant="secondary"
                                      className={lead.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : lead.status === "rejected" ? "" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}
                                    >
                                      {lead.status.replace(/_/g, " ")}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {lead.phone}
                                    </span>
                                    {lead.email && <span>{lead.email}</span>}
                                    <span>Submitted: {format(new Date(lead.createdAt), "MMM d, yyyy")}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Points:</span>
                                    {lead.pointsGranted ? (
                                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        {lead.pendingPoints} Granted
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">
                                        <Clock className="h-3 w-3 mr-1" />
                                        {lead.pendingPoints} Pending Approval
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="default"
                                  onClick={() => window.location.href = "/admin/conversion-leads"}
                                  data-testid={`button-view-lead-${lead.id}`}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View in War Room
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    {wellnessEligibleRequests.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Transfer Requests (Landing Page)
                        </h4>
                        {wellnessEligibleRequests.map((request) => (
                          <Card key={request.id} data-testid={`card-wellness-${request.id}`}>
                            <CardContent className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="space-y-2 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="font-semibold">{request.contactName}</span>
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      <Pill className="h-3 w-3 mr-1" />
                                      {request.expectedMedCount}+ meds
                                    </Badge>
                                    {getStatusBadge(request.status)}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {request.phoneNumber}
                                    </span>
                                    {request.email && <span>{request.email}</span>}
                                    <span>Submitted: {format(new Date(request.createdAt), "MMM d, yyyy")}</span>
                                  </div>
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-sm text-muted-foreground">Vitamins:</span>
                                      {request.vitaminsIncluded ? (
                                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                          <CheckCircle className="h-3 w-3 mr-1" />
                                          Included
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-700">
                                          <Clock className="h-3 w-3 mr-1" />
                                          Pending
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-sm text-muted-foreground">Points:</span>
                                      {request.pendingPointsReleased ? (
                                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                          <CheckCircle className="h-3 w-3 mr-1" />
                                          {request.pendingPoints || 500} Released
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline">
                                          <Clock className="h-3 w-3 mr-1" />
                                          {request.pendingPoints || 500} Pending First Fill
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    variant="outline"
                                    size="default"
                                    onClick={() => handleViewDetails(request)}
                                    data-testid={`button-view-wellness-${request.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Details
                                  </Button>
                                  {!request.vitaminsIncluded && (
                                    <Button
                                      variant="outline"
                                      size="default"
                                      onClick={() => {
                                        if (confirm(`Mark free vitamins as included in ${request.contactName}'s first delivery?`)) {
                                          markVitaminsMutation.mutate(request.id);
                                        }
                                      }}
                                      disabled={markVitaminsMutation.isPending}
                                      data-testid={`button-vitamins-${request.id}`}
                                    >
                                      {markVitaminsMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                      ) : (
                                        <Package className="h-4 w-4 mr-1" />
                                      )}
                                      Mark Vitamins
                                    </Button>
                                  )}
                                  {!request.pendingPointsReleased && request.status === "transfer_successful" && (
                                    <Button
                                      size="default"
                                      onClick={() => {
                                        if (confirm(`Release ${request.pendingPoints || 500} Wellness Points to ${request.contactName} after confirming first fill?`)) {
                                          releasePointsMutation.mutate(request.id);
                                        }
                                      }}
                                      disabled={releasePointsMutation.isPending}
                                      data-testid={`button-release-points-${request.id}`}
                                    >
                                      {releasePointsMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                      ) : (
                                        <Unlock className="h-4 w-4 mr-1" />
                                      )}
                                      Release Points
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Details Dialog */}
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Transfer Request Details
              </DialogTitle>
              <DialogDescription>
                View and update this prescription transfer request
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-6 py-4">
                {/* Wellness Pack Badge */}
                {selectedRequest.wellnessPackEligible && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <Star className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                          Qualifies for Wellness Welcome Pack
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                          {selectedRequest.expectedMedCount}+ medications. Include free vitamins in first delivery.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap pl-8">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">Vitamins:</span>
                        {selectedRequest.vitaminsIncluded ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Included
                          </Badge>
                        ) : (
                          <>
                            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-700">
                              Not marked yet
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markVitaminsMutation.mutate(selectedRequest.id)}
                              disabled={markVitaminsMutation.isPending}
                              data-testid={`button-vitamins-dialog-${selectedRequest.id}`}
                            >
                              {markVitaminsMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Package className="h-3 w-3 mr-1" />
                              )}
                              Mark Included
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Patient Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm border-b pb-2">Patient Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedRequest.contactName}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <p className="font-medium">{selectedRequest.phoneNumber}</p>
                    </div>
                    {selectedRequest.email && (
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <p className="font-medium">{selectedRequest.email}</p>
                      </div>
                    )}
                    {selectedRequest.expectedMedCount != null && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Expected Medications</Label>
                        <p className="font-medium">{selectedRequest.expectedMedCount}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pharmacy Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm border-b pb-2">Previous Pharmacy</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Pharmacy Name</Label>
                      <p className="font-medium">{selectedRequest.previousPharmacyName || "Not provided"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <p className="font-medium">{selectedRequest.previousPharmacyPhone || "Not provided"}</p>
                    </div>
                    {selectedRequest.previousPharmacyAddress && (
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <p className="font-medium">{selectedRequest.previousPharmacyAddress}</p>
                      </div>
                    )}
                    {selectedRequest.labelImageUrl && (
                      <div className="col-span-2 space-y-2">
                        <Label className="text-xs text-muted-foreground">Prescription Label Image</Label>
                        <div className="relative group">
                          <img 
                            src={selectedRequest.labelImageUrl}
                            alt="Prescription label"
                            className="max-w-full max-h-64 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(selectedRequest.labelImageUrl!, '_blank')}
                            data-testid="img-label-preview"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-lg">
                            <span className="text-white text-sm font-medium">Click to view full size</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Request Details */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm border-b pb-2">Request Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Submission Mode</Label>
                      <div className="flex items-center gap-2">
                        {getModeIcon(selectedRequest.mode)}
                        <span className="capitalize">{selectedRequest.mode.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <p className="font-medium">
                        {format(new Date(selectedRequest.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Reward Status</Label>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {selectedRequest.pendingPointsReleased ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            <Gift className="h-3 w-3 mr-1" />
                            {selectedRequest.pendingPoints || 500} Points Released
                          </Badge>
                        ) : selectedRequest.rewardPointsGranted ? (
                          <>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              <Clock className="h-3 w-3 mr-1" />
                              {selectedRequest.pendingPoints || 500} Points Pending First Fill
                            </Badge>
                            <Button
                              size="default"
                              onClick={() => {
                                if (confirm(`Release ${selectedRequest.pendingPoints || 500} Wellness Points to ${selectedRequest.contactName}?`)) {
                                  releasePointsMutation.mutate(selectedRequest.id);
                                }
                              }}
                              disabled={releasePointsMutation.isPending}
                              data-testid={`button-release-points-dialog-${selectedRequest.id}`}
                            >
                              {releasePointsMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <Unlock className="h-4 w-4 mr-1" />
                              )}
                              Release Points
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline">Pending Transfer Completion</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Update */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm border-b pb-2">Update Status</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Current Status</Label>
                      <Select value={updateStatus} onValueChange={setUpdateStatus}>
                        <SelectTrigger data-testid="select-update-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="request_received">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              Request Received
                            </div>
                          </SelectItem>
                          <SelectItem value="processing">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 text-amber-500" />
                              Processing
                            </div>
                          </SelectItem>
                          <SelectItem value="contacting_pharmacy">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-purple-500" />
                              Contacting Pharmacy
                            </div>
                          </SelectItem>
                          <SelectItem value="transfer_in_progress">
                            <div className="flex items-center gap-2">
                              <ArrowRight className="h-4 w-4 text-indigo-500" />
                              Transfer In Progress
                            </div>
                          </SelectItem>
                          <SelectItem value="transfer_successful">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              Transfer Successful
                            </div>
                          </SelectItem>
                          <SelectItem value="transfer_failed">
                            <div className="flex items-center gap-2">
                              <XCircle className="h-4 w-4 text-red-500" />
                              Transfer Failed
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {updateStatus === "transfer_successful" && !selectedRequest.rewardPointsGranted && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                        <Gift className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <span className="font-medium">500 Wellness Points</span> will be marked as pending for this patient. They unlock after the first fill.
                        </p>
                      </div>
                    )}

                    {updateStatus === "transfer_failed" && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-300">
                          Please add a note explaining why the transfer failed.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Internal Notes</Label>
                      <Textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add any notes about this transfer request..."
                        rows={3}
                        data-testid="input-admin-notes"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    data-testid="button-cancel-update"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateRequest}
                    disabled={updateRequestMutation.isPending}
                    data-testid="button-save-update"
                  >
                    {updateRequestMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
