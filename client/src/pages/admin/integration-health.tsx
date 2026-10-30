import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, AlertCircle, CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";

type OutboxStatus = "pending" | "failed" | "delivered";

type SyncOutboxEntry = {
  id: number;
  operation: string;
  destination: string;
  method: string;
  attempts: number;
  status: OutboxStatus;
  errorSummary?: string | null;
  createdAt: string;
  orderNumber?: string | null;
};

const statusLabels: Record<OutboxStatus, string> = {
  pending: "Pending",
  failed: "Failed",
  delivered: "Delivered",
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function StatusIcon({ status }: { status: OutboxStatus }) {
  if (status === "delivered") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock3 className="h-4 w-4 text-amber-600" />;
}

export default function IntegrationHealth() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SyncOutboxEntry[]>({
    queryKey: ["/api/admin/sync-outbox"],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
  const entries = Array.isArray(data) ? data : [];
  const count = (status: OutboxStatus) => entries.filter((entry) => entry.status === status).length;

  return (
    <AdminLayout title="Integration Health" backTo="/admin">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-2xl font-semibold">Integration Health</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor ConcordiaCare retries and staff order acknowledgments without exposing customer details.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>What these statuses mean</AlertTitle>
          <AlertDescription>
            New staff handoffs appear here whether confirmed or unconfirmed. Older successful handoffs may not be listed.
            Do not resend an unconfirmed order until staff checks whether it was accepted.
            A delivered outbox entry means the destination accepted the HTTP request, not that the order was fulfilled.
          </AlertDescription>
        </Alert>

        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unable to load integration health</AlertTitle>
            <AlertDescription>Try refreshing to request the ConcordiaCare outbox again.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {([
            ["pending", "Pending", Clock3, "text-amber-600"],
            ["failed", "Failed", XCircle, "text-destructive"],
            ["delivered", "Delivered", CheckCircle2, "text-emerald-600"],
          ] as const).map(([status, label, Icon, color]) => (
            <Card key={status}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{isLoading ? "—" : count(status)}</div>
                <p className="text-xs text-muted-foreground">of the 100 most recent entries</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent outbox activity</CardTitle>
            <CardDescription>Use the order reference to find an affected order. Customer details and request payloads are omitted.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Order reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading outbox activity…</TableCell></TableRow>
                  ) : entries.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No integration outbox activity found.</TableCell></TableRow>
                  ) : entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant={entry.status === "failed" ? "destructive" : "outline"} className="gap-1 whitespace-nowrap">
                          <StatusIcon status={entry.status} />
                          {statusLabels[entry.status] ?? "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatTimestamp(entry.createdAt)}</TableCell>
                      <TableCell className="text-sm">{entry.destination}</TableCell>
                      <TableCell className="text-sm">{entry.operation}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{entry.orderNumber ?? "Not applicable"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.method}</TableCell>
                      <TableCell className="text-right">{entry.attempts}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.errorSummary ?? "No error recorded"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}