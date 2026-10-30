import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Activity, Check, Clock, Package, Truck, FileText, AlertCircle, CheckCircle, XCircle,
  Users, Upload, Link, Copy, RefreshCw, Eye
} from "lucide-react";
import type { Prescription, PrimeRxSyncLog } from "@shared/schema";

const workflowStatuses = [
  { value: "received", label: "Received from PrimeRx", icon: FileText, color: "text-primary" },
  { value: "typing", label: "Data Entry In Progress", icon: Clock, color: "text-yellow-500" },
  { value: "billing", label: "Billing In Progress", icon: Activity, color: "text-orange-500" },
  { value: "billed", label: "Billing Complete", icon: Check, color: "text-green-500" },
  { value: "ready_for_delivery", label: "Ready for Delivery", icon: Package, color: "text-purple-500" },
  { value: "out_for_delivery", label: "Out for Delivery", icon: Truck, color: "text-indigo-500" },
  { value: "delivered", label: "Delivered", icon: CheckCircle, color: "text-emerald-500" },
];

function StatusBadge({ status }: { status: string }) {
  const statusConfig = workflowStatuses.find(s => s.value === status);
  if (!statusConfig) return <Badge variant="secondary">{status}</Badge>;

  const Icon = statusConfig.icon;
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className={`h-3 w-3 ${statusConfig.color}`} />
      {statusConfig.label}
    </Badge>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === "staff_review_required") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Staff review required
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle className="h-3 w-3 text-green-500" />
        Success
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Pending
    </Badge>
  );
}

function PatientSyncTab() {
  const { toast } = useToast();
  const [singlePayload, setSinglePayload] = useState("");
  const [bulkPayload, setBulkPayload] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ total: number; created: number; updated: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: syncLogs = [], isLoading: logsLoading } = useQuery<PrimeRxSyncLog[]>({
    queryKey: ['/api/admin/primerx/sync-logs'],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const patientSyncLogs = syncLogs.filter(
    (log) => log.syncType === "patient_created" || log.syncType === "patient_updated" || log.syncType === "patient_sync_failed" || log.syncType?.startsWith("webhook_patient") || log.syncType?.startsWith("native_")
  );

  const totalPatientsSynced = patientSyncLogs.filter(l => l.status === "success").length;
  const lastSyncLog = patientSyncLogs.length > 0 ? patientSyncLogs[0] : null;
  const familyGroupsDetected = new Set(
    patientSyncLogs
      .filter(l => l.status === "success" && l.syncData && typeof l.syncData === "object" && (l.syncData as Record<string, unknown>).familyGroupId)
      .map(l => (l.syncData as Record<string, unknown>).familyGroupId)
  ).size;

  const singleSyncMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiRequest("POST", "/api/admin/primerx/sync-patient", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primerx/sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/patients'] });
      toast({
        title: "Patient Synced",
        description: "Patient data has been synced successfully",
      });
      setSinglePayload("");
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync patient data",
        variant: "destructive",
      });
    },
  });

  const bulkSyncMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await apiRequest("POST", "/api/admin/primerx/sync-patients-bulk", payload);
      return await res.json() as { total: number; created: number; updated: number; failed: number; errors: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primerx/sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/patients'] });
      setBulkProgress(data);
      toast({
        title: data.failed > 0 ? "Bulk Sync Completed with Errors" : "Bulk Sync Complete",
        description: `${data.created} created, ${data.updated} updated, ${data.failed} failed out of ${data.total} patients`,
        variant: data.failed > 0 ? "destructive" : "default",
      });
      setBulkPayload("");
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk Sync Failed",
        description: error.message || "Failed to bulk sync patient data",
        variant: "destructive",
      });
    },
  });

  const handleSingleSync = () => {
    try {
      const parsed = JSON.parse(singlePayload);
      singleSyncMutation.mutate(parsed);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Please enter valid JSON payload",
        variant: "destructive",
      });
    }
  };

  const handleBulkSync = () => {
    try {
      const parsed = JSON.parse(bulkPayload);
      const patients = Array.isArray(parsed) ? parsed : [parsed];
      bulkSyncMutation.mutate(patients);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Please enter valid JSON array payload",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        JSON.parse(text);
        setBulkPayload(text);
        toast({ title: "File Loaded", description: `Loaded ${file.name}` });
      } catch {
        toast({
          title: "Invalid File",
          description: "File does not contain valid JSON",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const webhookUrl = `${window.location.origin}/api/external/primerx/webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Copied", description: "Webhook URL copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Patients Synced</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold" data-testid="text-patients-synced">{totalPatientsSynced}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold" data-testid="text-last-sync">
              {lastSyncLog ? new Date(lastSyncLog.createdAt).toLocaleString() : "Never"}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Family Groups</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold" data-testid="text-family-groups">{familyGroupsDetected}</p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>
            Configure PrimeRx to push patient updates to this endpoint. Requires API key authentication via X-API-Key header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-md border p-3 bg-muted/50">
              <Link className="h-4 w-4 text-muted-foreground shrink-0" />
              <code className="text-sm break-all" data-testid="text-webhook-url">{webhookUrl}</code>
            </div>
            <Button size="icon" variant="outline" onClick={copyWebhookUrl} data-testid="button-copy-webhook">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Supports both single patient and array payloads. Method: POST, Header: X-API-Key
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sync Single Patient</CardTitle>
            <CardDescription>
              Paste a PrimeRx patient JSON payload to sync a single patient
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder='{"primeRxPatientId": "PRX-001", "firstName": "John", "lastName": "Doe", ...}'
              value={singlePayload}
              onChange={(e) => setSinglePayload(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              data-testid="textarea-single-payload"
            />
            <Button
              onClick={handleSingleSync}
              disabled={singleSyncMutation.isPending || !singlePayload.trim()}
              className="w-full"
              data-testid="button-sync-single"
            >
              {singleSyncMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Patient
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk Import</CardTitle>
            <CardDescription>
              Paste a JSON array of patients or upload a JSON file for bulk sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder='[{"primeRxPatientId": "PRX-001", ...}, {"primeRxPatientId": "PRX-002", ...}]'
              value={bulkPayload}
              onChange={(e) => setBulkPayload(e.target.value)}
              className="min-h-[140px] font-mono text-sm"
              data-testid="textarea-bulk-payload"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-file-upload"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
                data-testid="button-upload-file"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload JSON File
              </Button>
              <Button
                onClick={handleBulkSync}
                disabled={bulkSyncMutation.isPending || !bulkPayload.trim()}
                className="flex-1"
                data-testid="button-sync-bulk"
              >
                {bulkSyncMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Import
                  </>
                )}
              </Button>
            </div>
            {bulkSyncMutation.isPending && (
              <div className="space-y-2">
                <Progress value={undefined} className="w-full" />
                <p className="text-sm text-muted-foreground">Processing patients...</p>
              </div>
            )}
            {bulkProgress && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Total: <span className="font-medium" data-testid="text-bulk-total">{bulkProgress.total}</span></div>
                    <div>Created: <span className="font-medium text-green-600" data-testid="text-bulk-created">{bulkProgress.created}</span></div>
                    <div>Updated: <span className="font-medium text-primary/90" data-testid="text-bulk-updated">{bulkProgress.updated}</span></div>
                    <div>Failed: <span className="font-medium text-red-600" data-testid="text-bulk-failed">{bulkProgress.failed}</span></div>
                  </div>
                  {bulkProgress.errors && bulkProgress.errors.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-destructive">Errors:</p>
                        {bulkProgress.errors.map((err, i) => (
                          <p key={i} className="text-xs text-muted-foreground" data-testid={`text-bulk-error-${i}`}>{err}</p>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Sync Logs</CardTitle>
          <CardDescription>
            History of patient data synchronizations from PrimeRx
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sync logs...</div>
          ) : patientSyncLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No patient sync logs available</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>PrimeRx ID</TableHead>
                  <TableHead>Rx#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientSyncLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-patient-sync-log-${log.id}`}>
                    <TableCell className="text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.eventType || log.syncType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {log.patientName || "N/A"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.primeRxId || "N/A"}</TableCell>
                    <TableCell className="font-mono text-sm">{log.rxNo || "-"}</TableCell>
                    <TableCell>
                      <SyncStatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.workflowTransition ? `Status: ${log.workflowTransition}` : (log.errorMessage || "Synced successfully")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GatewayApiTab() {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState<string>("name");
  const [searchValue, setSearchValue] = useState("");
  const [rxNo, setRxNo] = useState("");
  const [refillNo, setRefillNo] = useState("0");
  const [refillPatientId, setRefillPatientId] = useState("");
  const [refillRxNumbers, setRefillRxNumbers] = useState("");

  const { data: apiStatus } = useQuery<{ configured: boolean; status: string; message: string; missingVars?: string[] }>({
    queryKey: ['/api/admin/primerx/api-status'],
  });

  const { data: allSyncLogs = [] } = useQuery<PrimeRxSyncLog[]>({
    queryKey: ['/api/admin/primerx/sync-logs'],
  });

  const apiLogs = allSyncLogs.filter((log) =>
    log.syncType === "refill_request" || log.syncType === "api_sync" || log.syncType === "api_search" ||
    log.syncType?.startsWith("api_") || log.syncType?.startsWith("gateway_")
  );

  const refillMutation = useMutation({
    mutationFn: async () => {
      const rxNums = refillRxNumbers.split(",").map(s => s.trim()).filter(Boolean);
      if (rxNums.length === 0) throw new Error("Enter at least one Rx number");
      const res = await apiRequest(
        "POST",
        "/api/admin/primerx/api-refill",
        { patientId: refillPatientId, rxNumbers: rxNums },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      return await res.json() as { success: boolean; message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primerx/sync-logs'] });
      toast({ title: "Refill Requested", description: data.message });
      setRefillRxNumbers("");
    },
    onError: (error: Error) => {
      toast({ title: "Refill Request Failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: patients = [] } = useQuery<Array<{ id: string; firstName: string; lastName: string; primeRxPatientId: string | null }>>({
    queryKey: ['/api/admin/patients'],
  });

  const primeRxPatients = patients.filter((p: { primeRxPatientId: string | null }) => p.primeRxPatientId);

  const syncPatientMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const res = await apiRequest("POST", "/api/admin/primerx/api-sync-patient", { patientId });
      return await res.json() as { success: boolean; message: string; fieldsUpdated: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primerx/sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/patients'] });
      toast({ title: "Profile Synced", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/primerx/api-search-patient", { searchType, value: searchValue });
      return await res.json() as { success: boolean; patients: Array<{ PatientNo: number; FirstName: string; LastName: string; DateOfBirth: string; Phone: string; Email: string }> };
    },
    onSuccess: (data) => {
      toast({ title: "Search Complete", description: `Found ${data.patients?.length || 0} patient(s)` });
    },
    onError: (error: Error) => {
      toast({ title: "Search Failed", description: error.message, variant: "destructive" });
    },
  });

  const rxDetailMutation = useMutation({
    mutationFn: async () => {
      const parsedRxNo = parseInt(rxNo);
      const parsedRefillNo = parseInt(refillNo) || 0;
      if (isNaN(parsedRxNo) || parsedRxNo <= 0) {
        throw new Error("Please enter a valid Rx number");
      }
      const res = await apiRequest("POST", "/api/admin/primerx/api-rx-detail", { rxNo: parsedRxNo, refillNo: parsedRefillNo });
      return await res.json() as { success: boolean; prescription: Record<string, unknown> };
    },
    onSuccess: () => {
      toast({ title: "Prescription Detail", description: "Detail retrieved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Lookup Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>PrimeRx Gateway API</CardTitle>
            <CardDescription>Direct API connection to PrimeRx for on-demand data operations</CardDescription>
          </div>
          <Badge variant={apiStatus?.configured ? (apiStatus.status === "connected" ? "default" : "destructive") : "secondary"} data-testid="badge-api-status">
            {apiStatus?.configured ? (apiStatus.status === "connected" ? "Connected" : "Error") : "Not Configured"}
          </Badge>
        </CardHeader>
        <CardContent>
          {!apiStatus?.configured && (
            <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground" data-testid="text-api-not-configured">
              <p className="font-medium">API credentials not configured</p>
              <p className="mt-1">Set the following environment variables to enable Gateway API features:</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                {(apiStatus?.missingVars && apiStatus.missingVars.length > 0
                  ? apiStatus.missingVars
                  : ["PRIMERX_API_URL", "PRIMERX_CLIENT_ID", "PRIMERX_CLIENT_SECRET", "PRIMERX_MEMBER_ID", "PRIMERX_PHARMACY_NPI"]
                ).map((v: string) => (
                  <li key={v} className="font-mono text-xs">{v}</li>
                ))}
              </ul>
            </div>
          )}
          {apiStatus?.configured && apiStatus.status === "connected" && (
            <div className="rounded-md bg-muted p-4 text-sm" data-testid="text-api-connected">
              <p className="text-green-600 dark:text-green-400 font-medium">Gateway API connected and authenticated</p>
              <p className="mt-1 text-muted-foreground">GateKeeper token: active | All API endpoints ready</p>
            </div>
          )}
          {apiStatus?.configured && apiStatus.status === "error" && (
            <div className="rounded-md bg-destructive/10 p-4 text-sm" data-testid="text-api-error">
              <p className="text-destructive font-medium">Connection error</p>
              <p className="mt-1 text-muted-foreground">{apiStatus.message || "Failed to connect to PrimeRx Gateway API"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">On-Demand Patient Sync</CardTitle>
            <CardDescription>Pull complete patient profile from PrimeRx</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {primeRxPatients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No PrimeRx-linked patients found</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {primeRxPatients.map((p: { id: string; firstName: string; lastName: string; primeRxPatientId: string | null }) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate" data-testid={`row-sync-patient-${p.id}`}>
                    <div className="text-sm">
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      <span className="text-muted-foreground ml-2">#{p.primeRxPatientId}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncPatientMutation.mutate(p.id)}
                      disabled={syncPatientMutation.isPending || !apiStatus?.configured}
                      data-testid={`button-sync-patient-${p.id}`}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${syncPatientMutation.isPending ? "animate-spin" : ""}`} />
                      Sync Now
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Search</CardTitle>
            <CardDescription>Search PrimeRx database for patients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-32" data-testid="select-search-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="dob">DOB</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={searchType === "name" ? "First Last" : searchType === "phone" ? "Phone number" : "MM/DD/YYYY"}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="flex-1"
                data-testid="input-search-value"
              />
              <Button
                onClick={() => searchMutation.mutate()}
                disabled={searchMutation.isPending || !apiStatus?.configured || !searchValue}
                data-testid="button-search-patient"
              >
                Search
              </Button>
            </div>
            {searchMutation.data?.patients && searchMutation.data.patients.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {searchMutation.data.patients.map((p: { PatientNo: number; FirstName: string; LastName: string; DateOfBirth: string; Phone: string }) => (
                  <div key={p.PatientNo} className="text-sm p-2 rounded-md bg-muted" data-testid={`row-search-result-${p.PatientNo}`}>
                    <span className="font-medium">{p.FirstName} {p.LastName}</span>
                    <span className="text-muted-foreground ml-2">#{p.PatientNo}</span>
                    {p.Phone && <span className="text-muted-foreground ml-2">{p.Phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prescription Lookup</CardTitle>
            <CardDescription>Fetch Rx details directly from PrimeRx</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Rx Number"
                value={rxNo}
                onChange={(e) => setRxNo(e.target.value)}
                className="w-32"
                data-testid="input-rx-no"
              />
              <Input
                placeholder="Refill #"
                value={refillNo}
                onChange={(e) => setRefillNo(e.target.value)}
                className="w-24"
                data-testid="input-refill-no"
              />
              <Button
                onClick={() => rxDetailMutation.mutate()}
                disabled={rxDetailMutation.isPending || !apiStatus?.configured || !rxNo}
                data-testid="button-lookup-rx"
              >
                Lookup
              </Button>
            </div>
            {rxDetailMutation.data?.prescription && (
              <div className="text-sm p-3 rounded-md bg-muted space-y-1" data-testid="text-rx-detail">
                <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-48">
                  {JSON.stringify(rxDetailMutation.data.prescription, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin Refill Request</CardTitle>
            <CardDescription>Submit a refill request to PrimeRx for a patient</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={refillPatientId} onValueChange={setRefillPatientId}>
                <SelectTrigger className="w-48" data-testid="select-refill-patient">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {primeRxPatients.map((p: { id: string; firstName: string; lastName: string; primeRxPatientId: string | null }) => (
                    <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Rx numbers (comma-separated)"
                value={refillRxNumbers}
                onChange={(e) => setRefillRxNumbers(e.target.value)}
                className="flex-1"
                data-testid="input-refill-rx-numbers"
              />
              <Button
                onClick={() => refillMutation.mutate()}
                disabled={refillMutation.isPending || !apiStatus?.configured || !refillPatientId || !refillRxNumbers}
                data-testid="button-submit-refill"
              >
                {refillMutation.isPending ? "Requesting..." : "Request Refill"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">API Call Log</CardTitle>
            <CardDescription>Recent Gateway API operations</CardDescription>
          </div>
          <Badge variant="secondary" data-testid="badge-api-log-count">{apiLogs.length} entries</Badge>
        </CardHeader>
        <CardContent>
          {apiLogs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No API calls logged yet</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {apiLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted text-sm" data-testid={`row-api-log-${log.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{log.eventType || log.syncType}</Badge>
                    <span className="font-medium">{log.patientName || "N/A"}</span>
                    {log.rxNo && <span className="text-muted-foreground font-mono">Rx#{log.rxNo}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <SyncStatusBadge status={log.status} />
                    <span className="text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PrimeRxSyncDashboard() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>("received");
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: prescriptions = [], isLoading: prescriptionsLoading } = useQuery<Prescription[]>({
    queryKey: ['/api/admin/prescriptions/workflow', selectedStatus],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const { data: syncLogs = [], isLoading: logsLoading } = useQuery<PrimeRxSyncLog[]>({
    queryKey: ['/api/admin/primerx/sync-logs'],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, workflowStatus }: { id: string; workflowStatus: string }) => {
      return apiRequest("PATCH", `/api/admin/prescriptions/${id}/workflow-status`, { workflowStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/prescriptions/workflow'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/primerx/sync-logs'] });
      toast({
        title: "Status Updated",
        description: "Prescription workflow status updated successfully",
      });
      setUpdateDialogOpen(false);
      setSelectedPrescription(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update prescription workflow status",
        variant: "destructive",
      });
    },
  });

  const handleUpdateStatus = () => {
    if (selectedPrescription && newStatus) {
      updateStatusMutation.mutate({ id: selectedPrescription.id, workflowStatus: newStatus });
    }
  };

  const getStatusCount = (status: string) => {
    return prescriptions.filter(p => p.workflowStatus === status).length;
  };

  return (
    <AdminLayout title="PrimeRx Sync Dashboard" backTo="/admin">
    <div className="p-6 space-y-6">

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
        {workflowStatuses.map((status) => {
          const Icon = status.icon;
          const count = getStatusCount(status.value);
          return (
            <Card 
              key={status.value}
              className={`cursor-pointer transition-all hover-elevate ${selectedStatus === status.value ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedStatus(status.value)}
              data-testid={`card-status-${status.value}`}
            >
              <CardHeader className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <Icon className={`h-5 w-5 ${status.color}`} />
                  <Badge variant="secondary" data-testid={`badge-count-${status.value}`}>{count}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{status.label}</p>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">Prescription Pipeline</TabsTrigger>
          <TabsTrigger value="patient-sync" data-testid="tab-patient-sync">Patient Sync</TabsTrigger>
          <TabsTrigger value="gateway-api" data-testid="tab-gateway-api">Gateway API</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-sync-logs">Sync Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={selectedStatus} />
                <span>({prescriptions.length} prescriptions)</span>
              </CardTitle>
              <CardDescription>
                Prescriptions currently in this workflow stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {prescriptionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading prescriptions...</div>
              ) : prescriptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No prescriptions in this stage</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rx Number</TableHead>
                      <TableHead>Medication</TableHead>
                      <TableHead>SIG / Intake</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Prescriber</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.map((prescription) => {
                      const parsed = prescription.parsedSig as { dose?: string; unit?: string; route?: string; frequencyCode?: string; intakeTimes?: string[]; withFood?: boolean; specialFlag?: string; autoParsed?: boolean } | null;
                      return (
                      <TableRow key={prescription.id} data-testid={`row-prescription-${prescription.id}`}>
                        <TableCell className="font-medium">{prescription.rxNumber}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{prescription.medicationName}</div>
                            <div className="text-sm text-muted-foreground">{prescription.dosage}</div>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`cell-sig-${prescription.id}`}>
                          {parsed ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                {parsed.autoParsed && (
                                  <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-auto-parsed-${prescription.id}`}>
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                    Auto-parsed
                                  </Badge>
                                )}
                                {parsed.frequencyCode && <Badge variant="secondary" className="text-xs">{parsed.frequencyCode}</Badge>}
                              </div>
                              {parsed.intakeTimes && parsed.intakeTimes.length > 0 && (
                                <div className="flex gap-1 flex-wrap">
                                  {parsed.intakeTimes.map((t, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                                  ))}
                                </div>
                              )}
                              {parsed.dose && <span className="text-xs text-muted-foreground">{parsed.dose} {parsed.unit}{parsed.route ? `, ${parsed.route}` : ""}</span>}
                              {parsed.withFood && <span className="text-xs text-muted-foreground block">with food</span>}
                              {parsed.specialFlag && <Badge variant="destructive" className="text-xs">{parsed.specialFlag}</Badge>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{prescription.sig || "-"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{prescription.userId}</TableCell>
                        <TableCell className="text-sm">{prescription.prescribedBy}</TableCell>
                        <TableCell>
                          <StatusBadge status={prescription.workflowStatus || "received"} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(prescription.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPrescription(prescription);
                              setNewStatus(prescription.workflowStatus || "received");
                              setUpdateDialogOpen(true);
                            }}
                            data-testid={`button-update-status-${prescription.id}`}
                          >
                            Update Status
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patient-sync" className="space-y-4">
          <PatientSyncTab />
        </TabsContent>

        <TabsContent value="gateway-api" className="space-y-4">
          <GatewayApiTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {syncLogs.some((log) => log.status === "staff_review_required") && (
            <Card>
              <CardHeader>
                <CardTitle>Identity conflicts requiring staff review</CardTitle>
                <CardDescription>
                  {syncLogs.filter((log) => log.status === "staff_review_required").length} recent import(s) were stopped before prescription ownership could change. Review the PrimeRx event at the listed time; do not resolve ownership from contact details alone.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>PrimeRx Synchronization Log</CardTitle>
              <CardDescription>
                History of data synchronizations from PrimeRx system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading sync logs...</div>
              ) : syncLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No sync logs available</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>PrimeRx ID</TableHead>
                      <TableHead>Rx#</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-sync-log-${log.id}`}>
                        <TableCell className="text-sm">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.eventType || log.syncType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {log.patientName || "N/A"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.primeRxId || "N/A"}</TableCell>
                        <TableCell className="font-mono text-sm">{log.rxNo || "-"}</TableCell>
                        <TableCell>
                          <SyncStatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.workflowTransition ? `Status: ${log.workflowTransition}` : (log.errorMessage || "Synced successfully")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent data-testid="dialog-update-status">
          <DialogHeader>
            <DialogTitle>Update Workflow Status</DialogTitle>
            <DialogDescription>
              Change the workflow status for prescription {selectedPrescription?.rxNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="medication">Medication</Label>
              <Input
                id="medication"
                value={`${selectedPrescription?.medicationName} ${selectedPrescription?.dosage}`}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current-status">Current Status</Label>
              <Input
                id="current-status"
                value={workflowStatuses.find(s => s.value === selectedPrescription?.workflowStatus)?.label || ""}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-status">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="new-status" data-testid="select-new-status">
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {workflowStatuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpdateDialogOpen(false)}
              data-testid="button-cancel-update"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateStatus}
              disabled={updateStatusMutation.isPending || !newStatus}
              data-testid="button-confirm-update"
            >
              {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
