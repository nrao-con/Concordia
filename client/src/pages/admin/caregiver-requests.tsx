import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, X, UserCheck, ShieldAlert, Clock } from "lucide-react";
import type { PointsSetting } from "@shared/schema";

interface CaregiverRequest {
  id: number;
  attendantId: number;
  patientId: string;
  attendantName: string;
  attendantPhone: string;
  attendantStatus: string;
  patientName: string;
  patientDob: string | null;
  patientConsent: boolean;
  relationshipType: string | null;
  isActive: boolean;
  requestDate: string;
}

export default function CaregiverRequests() {
  const { toast } = useToast();

  const { data: requests = [], isLoading: requestsLoading } = useQuery<CaregiverRequest[]>({
    queryKey: ["/api/admin/caregiver-requests"],
  });

  const { data: settings = [], isLoading: settingsLoading } = useQuery<PointsSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const approvalSetting = settings.find((s) => s.settingKey === "caregiver_approval_mode");
  const isAutoApprove = approvalSetting?.settingValue === "auto";

  const toggleSettingMutation = useMutation({
    mutationFn: async (newValue: string) => {
      await apiRequest("PATCH", "/api/admin/settings/caregiver_approval_mode", {
        value: newValue,
      });
    },
    onSuccess: () => {
      toast({
        title: "Setting updated",
        description: `Caregiver approval mode changed to ${isAutoApprove ? "manual" : "auto-approve"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update setting",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/caregiver-requests/${id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Caregiver access request has been approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/caregiver-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve request", variant: "destructive" });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/caregiver-requests/${id}/deny`);
    },
    onSuccess: () => {
      toast({ title: "Denied", description: "Caregiver access request has been denied" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/caregiver-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to deny request", variant: "destructive" });
    },
  });

  const getStatusBadge = (request: CaregiverRequest) => {
    if (request.attendantStatus === "pending_verification") {
      return <Badge variant="outline" data-testid={`badge-status-${request.id}`}>Pending Verification</Badge>;
    }
    if (!request.patientConsent) {
      return <Badge variant="secondary" data-testid={`badge-status-${request.id}`}>Awaiting Consent</Badge>;
    }
    return <Badge variant="outline" data-testid={`badge-status-${request.id}`}>Pending Review</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDob = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <AdminLayout title="Access Requests" backTo="/admin">
      <div className="container mx-auto p-4 md:p-6">
        <div className="mb-6 md:mb-8">
          <h1 className="mb-2 font-heading text-2xl md:text-3xl font-bold" data-testid="text-page-title">
            Caregiver Access Requests
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Review and manage caregiver-patient access requests
          </p>
        </div>

        <Card className="mb-6" data-testid="card-settings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium">Approval Settings</CardTitle>
              <CardDescription>
                Control how new caregiver requests are handled
              </CardDescription>
            </div>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="flex items-center gap-3">
                <Switch
                  id="auto-approve"
                  checked={isAutoApprove}
                  onCheckedChange={(checked) =>
                    toggleSettingMutation.mutate(checked ? "auto" : "manual")
                  }
                  disabled={toggleSettingMutation.isPending}
                  data-testid="switch-auto-approve"
                />
                <Label htmlFor="auto-approve" className="text-sm">
                  Auto-Approve Caregivers
                </Label>
                <Badge variant={isAutoApprove ? "default" : "secondary"} data-testid="badge-approval-mode">
                  {isAutoApprove ? "Auto" : "Manual"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-requests">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Pending Requests
            </CardTitle>
            <CardDescription>
              {requests.length} pending caregiver access {requests.length === 1 ? "request" : "requests"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No Pending Requests</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  There are no caregiver access requests awaiting review at this time.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto hidden md:block">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Caregiver Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Patient Name</TableHead>
                          <TableHead>Patient DOB</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date Requested</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((request) => (
                          <TableRow key={request.id} data-testid={`request-row-${request.id}`}>
                            <TableCell className="font-medium" data-testid={`text-attendant-name-${request.id}`}>
                              {request.attendantName}
                            </TableCell>
                            <TableCell data-testid={`text-attendant-phone-${request.id}`}>
                              {request.attendantPhone}
                            </TableCell>
                            <TableCell data-testid={`text-patient-name-${request.id}`}>
                              {request.patientName || "-"}
                            </TableCell>
                            <TableCell data-testid={`text-patient-dob-${request.id}`}>
                              {formatDob(request.patientDob)}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(request)}
                            </TableCell>
                            <TableCell data-testid={`text-request-date-${request.id}`}>
                              {formatDate(request.requestDate)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-green-600 hover:bg-green-600 text-white border-green-600"
                                  onClick={() => approveMutation.mutate(request.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-${request.id}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-red-600 hover:bg-red-600 text-white border-red-600"
                                  onClick={() => denyMutation.mutate(request.id)}
                                  disabled={denyMutation.isPending}
                                  data-testid={`button-deny-${request.id}`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Deny
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {requests.map((request) => (
                    <Card key={request.id} className="p-4" data-testid={`request-card-${request.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                        <div>
                          <p className="font-medium" data-testid={`text-attendant-name-mobile-${request.id}`}>
                            {request.attendantName}
                          </p>
                          <p className="text-sm text-muted-foreground">{request.attendantPhone}</p>
                        </div>
                        {getStatusBadge(request)}
                      </div>
                      <div className="space-y-1 text-sm mb-3">
                        <p>
                          <span className="text-muted-foreground">Patient:</span>{" "}
                          {request.patientName || "-"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">DOB:</span>{" "}
                          {formatDob(request.patientDob)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Requested:</span>{" "}
                          {formatDate(request.requestDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-green-600 hover:bg-green-600 text-white border-green-600 flex-1"
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-mobile-${request.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-red-600 hover:bg-red-600 text-white border-red-600 flex-1"
                          onClick={() => denyMutation.mutate(request.id)}
                          disabled={denyMutation.isPending}
                          data-testid={`button-deny-mobile-${request.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Deny
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}