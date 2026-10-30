import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Send, X, Clock, Bell, ChevronDown, ChevronUp, Info, ShieldAlert, DoorClosed } from "lucide-react";
import type { PharmacyAlert } from "@shared/schema";
import { format } from "date-fns";

type FraudAlert = {
  id: string;
  signalType: string;
  severity: "medium" | "high" | "critical";
  status: "open" | "reviewed" | "resolved" | "false_positive";
  source: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolution: string | null;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Info }> = {
  info: { label: "Info", color: "text-primary/90 border-primary/30 bg-primary/5 dark:bg-primary/30 dark:border-primary/20", icon: Info },
  warning: { label: "Warning", color: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800", icon: AlertTriangle },
  urgent: { label: "Urgent", color: "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800", icon: ShieldAlert },
  closure: { label: "Closure", color: "text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800", icon: DoorClosed },
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
};

function AlertCard({ 
  alert, 
  onDeactivate, 
  isDeactivating 
}: { 
  alert: PharmacyAlert; 
  onDeactivate: () => void; 
  isDeactivating: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_LENGTH = 150;
  const isLongMessage = alert.message.length > MAX_LENGTH;
  const typeConfig = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
  const TypeIcon = typeConfig.icon;
  
  return (
    <div
      className={`rounded-lg border p-4 ${typeConfig.color}`}
      data-testid={`alert-${alert.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <TypeIcon className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium text-sm" data-testid={`text-alert-title-${alert.id}`}>{alert.title}</span>
            <Badge variant="outline" className="flex-shrink-0 text-xs">
              {typeConfig.label}
            </Badge>
            <Badge variant={PRIORITY_BADGE[alert.priority] as "secondary" | "outline" | "destructive"} className="flex-shrink-0 text-xs capitalize">
              {alert.priority}
            </Badge>
          </div>
          <div className="pr-2">
            <p className="text-sm break-words" data-testid={`text-alert-message-${alert.id}`}>
              {isLongMessage && !isExpanded 
                ? `${alert.message.slice(0, MAX_LENGTH)}...` 
                : alert.message}
            </p>
            {isLongMessage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 mt-1 text-xs"
                onClick={() => setIsExpanded(!isExpanded)}
                data-testid={`button-toggle-alert-${alert.id}`}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Read More
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Posted: {format(new Date(alert.createdAt), "MMM d, yyyy h:mm a")}
            {alert.expiresAt && (
              <span className="ml-2">
                | Expires: {format(new Date(alert.expiresAt), "MMM d, yyyy h:mm a")}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 text-destructive"
          onClick={onDeactivate}
          disabled={isDeactivating}
          data-testid={`button-remove-alert-${alert.id}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminAlerts() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "info",
    priority: "medium",
    expiresAt: "",
  });

  const { data: alerts = [], isLoading, isError: alertsError } = useQuery<PharmacyAlert[]>({
    queryKey: ["/api/alerts"],
  });

  const { data: fraudAlerts = [], isLoading: fraudAlertsLoading, isError: fraudAlertsError } = useQuery<FraudAlert[]>({
    queryKey: ["/api/admin/fraud-alerts"],
  });

  const createAlertMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/admin/alerts", {
        ...data,
        title: data.title || "Pharmacy Alert",
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Alert Posted",
        description: "The alert is now visible to customers and in the ConcordiaCare app.",
      });
      setFormData({ title: "", message: "", type: "info", priority: "medium", expiresAt: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create alert",
        variant: "destructive",
      });
    },
  });

  const deactivateAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/alerts/${id}/deactivate`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Alert Removed",
        description: "The alert has been removed from public view and the ConcordiaCare app.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove alert",
        variant: "destructive",
      });
    },
  });

  const reviewFraudAlertMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "resolved" | "false_positive" }) => {
      const response = await apiRequest("PATCH", `/api/admin/fraud-alerts/${id}`, {
        status,
        resolution: status === "false_positive"
          ? "Reviewed by an administrator and marked as a false positive."
          : "Reviewed by an administrator and resolved.",
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-alerts"] });
      toast({ title: "Fraud alert updated", description: "The review decision was logged." });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update fraud alert",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter an alert message.",
        variant: "destructive",
      });
      return;
    }
    createAlertMutation.mutate(formData);
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-bold flex items-center gap-3">
            <Bell className="h-8 w-8 text-primary" />
            Pharmacy Alerts
          </h1>
          <p className="text-muted-foreground">
            Post urgent announcements visible to website visitors and ConcordiaCare app users.
            Perfect for closures, schedule changes, or important notices.
          </p>
        </div>

        <Card className="mb-6 border-red-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              Fraud & Identity Alerts
              {fraudAlerts.filter((alert) => alert.status === "open").length > 0 && (
                <Badge variant="destructive">
                  {fraudAlerts.filter((alert) => alert.status === "open").length} open
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Private, real-time security alerts. Records contain only hashed identifiers and coarse event details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fraudAlertsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : fraudAlertsError ? (
              <div className="py-8 text-center text-sm text-destructive" role="alert">
                Could not load fraud alerts. Refresh the page and try again.
              </div>
            ) : fraudAlerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No fraud alerts have been recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {fraudAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border bg-card p-4" data-testid={`fraud-alert-${alert.id}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant={alert.severity === "medium" ? "outline" : "destructive"}>
                            {alert.severity}
                          </Badge>
                          <Badge variant={alert.status === "open" ? "destructive" : "secondary"}>
                            {alert.status.replace("_", " ")}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {alert.signalType}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{alert.summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(alert.occurredAt), "MMM d, yyyy h:mm a")} · {alert.source}
                        </p>
                        {alert.resolution && (
                          <p className="mt-2 text-xs text-muted-foreground">Resolution: {alert.resolution}</p>
                        )}
                      </div>
                      {alert.status === "open" && (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reviewFraudAlertMutation.isPending}
                            onClick={() => reviewFraudAlertMutation.mutate({ id: alert.id, status: "false_positive" })}
                          >
                            False positive
                          </Button>
                          <Button
                            size="sm"
                            disabled={reviewFraudAlertMutation.isPending}
                            onClick={() => reviewFraudAlertMutation.mutate({ id: alert.id, status: "resolved" })}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Create New Alert
              </CardTitle>
              <CardDescription>
                This alert will be sent to the ConcordiaCare mobile app and displayed on the website.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Alert Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Holiday Closure, Schedule Change"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    data-testid="input-alert-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Alert Message</Label>
                  <Textarea
                    id="message"
                    placeholder="e.g., Pharmacy closed on December 25th for Christmas. Emergency prescriptions: call 555-1234"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={3}
                    data-testid="textarea-alert-message"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Alert Type</Label>
                    <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                      <SelectTrigger data-testid="select-alert-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="closure">Closure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger data-testid="select-alert-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Expiration Date (Optional)
                  </Label>
                  <Input
                    id="expiresAt"
                    type="datetime-local"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    data-testid="input-alert-expires"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for permanent alerts (until manually removed)
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={createAlertMutation.isPending}
                  className="w-full"
                  data-testid="button-post-alert"
                >
                  {createAlertMutation.isPending ? (
                    "Posting..."
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post Alert
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Active Alerts
                {alerts.length > 0 && (
                  <Badge variant="secondary">{alerts.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                These alerts are visible to website visitors and ConcordiaCare app users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : alertsError ? (
                <div className="py-8 text-center text-sm text-destructive" role="alert">
                  Could not load active alerts. Refresh the page and try again.
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No active alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Create an alert to display important notices
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onDeactivate={() => deactivateAlertMutation.mutate(alert.id)}
                      isDeactivating={deactivateAlertMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
