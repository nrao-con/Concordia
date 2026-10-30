import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PriorAuthorizationRequest } from "@shared/schema";
import {
  FileText, Search, Clock, CheckCircle2, XCircle, Send, AlertTriangle,
  Loader2, User, Pill, Building2, Phone, ClipboardList, ExternalLink,
  RefreshCw, ChevronDown, WrenchIcon, MessageSquareWarning, Gavel,
  BookOpen, CalendarCheck, PenLine, Mail, Ban, Download,
} from "lucide-react";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:               { label: "Draft",               color: "bg-slate-100 text-slate-700 border-slate-300",       icon: FileText },
  pending_submission:  { label: "Pending",             color: "bg-amber-100 text-amber-800 border-amber-300",       icon: Clock },
  awaiting_signature:  { label: "Awaiting Signature",  color: "bg-cyan-100 text-cyan-800 border-cyan-300",          icon: PenLine },
  signature_received:  { label: "Signature Received",  color: "bg-teal-100 text-teal-800 border-teal-300",          icon: CheckCircle2 },
  submitted:           { label: "Submitted",           color: "bg-blue-100 text-blue-800 border-blue-300",          icon: Send },
  rfi_received:        { label: "RFI Received",        color: "bg-orange-100 text-orange-800 border-orange-300",    icon: MessageSquareWarning },
  approved:            { label: "Approved",            color: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  denied:              { label: "Denied",              color: "bg-red-100 text-red-800 border-red-300",             icon: XCircle },
  appeal_in_progress:  { label: "Appeal Pending",      color: "bg-purple-100 text-purple-800 border-purple-300",    icon: Gavel },
  appealed:            { label: "Appealed",            color: "bg-indigo-100 text-indigo-800 border-indigo-300",    icon: RefreshCw },
  expired:             { label: "Expired",             color: "bg-gray-100 text-gray-600 border-gray-300",          icon: Clock },
  cancelled:           { label: "Cancelled",           color: "bg-gray-100 text-gray-500 border-gray-300",          icon: XCircle },
};

const STATUS_ORDER = [
  "draft", "pending_submission", "awaiting_signature", "signature_received",
  "submitted", "rfi_received", "approved", "denied",
  "appeal_in_progress", "appealed", "expired", "cancelled",
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, color: "bg-slate-100 text-slate-700 border-slate-300", icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} font-medium text-xs gap-1`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function LetterViewer({ html, text, label = "Generated Letter" }: { html?: string | null; text?: string | null; label?: string }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-muted px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {html && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(html); w.document.close(); }
            }}
          >
            <ExternalLink className="h-3 w-3" />
            Open / Print PDF
          </Button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto p-4">
        <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
          {text ?? "No letter generated."}
        </pre>
      </div>
    </div>
  );
}

// ── RFI Fix & Resubmit panel ──────────────────────────────────────────────────
function RfiPanel({
  pa,
  onSuccess,
}: {
  pa: PriorAuthorizationRequest;
  onSuccess: (updated: PriorAuthorizationRequest) => void;
}) {
  const { toast } = useToast();
  const [rfiContext, setRfiContext] = useState(pa.rfiNotes ?? "");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pa-requests/${pa.id}/regenerate`, {
        rfiContext,
        additionalNotes: additionalNotes || undefined,
      });
      return res.json();
    },
    onSuccess: (updated: PriorAuthorizationRequest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests/stats"] });
      toast({ title: "Letter regenerated", description: "Status updated to Appeal Pending." });
      onSuccess(updated);
    },
    onError: (error: Error) => toast({ title: "Regeneration failed", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <WrenchIcon className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-orange-900">Fix &amp; Resubmit</p>
          <p className="text-xs text-orange-700 mt-0.5">
            Describe what the payer flagged. The AI will regenerate the PA letter incorporating
            the additional clinical context, and the status will move to &ldquo;Appeal Pending&rdquo;.
          </p>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-orange-900 mb-1 block">
          What did the payer flag as missing? <span className="text-red-600">*</span>
        </label>
        <Textarea
          placeholder="e.g. Step therapy trial dates for Methotrexate, LFT labs within last 90 days…"
          value={rfiContext}
          onChange={(e) => setRfiContext(e.target.value)}
          rows={3}
          className="bg-white border-orange-300 focus:border-orange-500 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-orange-900 mb-1 block">
          Additional clinical context <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          placeholder="e.g. Patient completed 60-day trial of first-line therapy…"
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          rows={3}
          className="bg-white border-orange-300 focus:border-orange-500 text-sm"
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => regenerateMutation.mutate()}
          disabled={!rfiContext.trim() || regenerateMutation.isPending}
          className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
        >
          {regenerateMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Regenerating…</>
            : <><RefreshCw className="h-4 w-4" /> Regenerate &amp; Resubmit</>}
        </Button>
      </div>
    </div>
  );
}

// ── Appeal panel ──────────────────────────────────────────────────────────────
function AppealPanel({
  pa,
  onSuccess,
}: {
  pa: PriorAuthorizationRequest;
  onSuccess: (updated: PriorAuthorizationRequest) => void;
}) {
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (): Promise<PriorAuthorizationRequest> => {
      const res = await apiRequest("POST", `/api/admin/pa-requests/${pa.id}/generate-appeal`, {});
      return res.json();
    },
    onSuccess: (result: PriorAuthorizationRequest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests/stats"] });
      toast({ title: "Appeal letter generated", description: "Status updated to Appeal Pending." });
      onSuccess(result);
    },
    onError: (error: Error) => toast({ title: "Failed to generate appeal", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Gavel className="h-4 w-4 text-purple-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-purple-900">Generate Appeal Letter</p>
          <p className="text-xs text-purple-700 mt-0.5">
            AI will build a formal appeal using the denial reason, FDA drug data, clinical practice
            guidelines, peer-reviewed citations, and a prescriber peer-to-peer prep note.
          </p>
        </div>
      </div>

      {pa.denialReason && (
        <div className="rounded bg-white border border-purple-200 p-3">
          <p className="text-xs font-medium text-purple-800 mb-1">Denial Reason on File</p>
          <p className="text-sm text-purple-900">{pa.denialReason}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="gap-2 bg-purple-700 hover:bg-purple-800 text-white"
        >
          {generateMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Appeal…</>
            : <><Gavel className="h-4 w-4" /> Generate Appeal Letter</>}
        </Button>
      </div>
    </div>
  );
}

// ── Appeal Submitted panel ────────────────────────────────────────────────────
function MarkAppealSubmittedPanel({
  pa,
  onSuccess,
}: {
  pa: PriorAuthorizationRequest;
  onSuccess: (updated: PriorAuthorizationRequest) => void;
}) {
  const { toast } = useToast();
  const [deadline, setDeadline] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/pa-requests/${pa.id}`, {
        status: "appealed",
        // appealSubmittedAt is always NOW (confirmation time)
        appealSubmittedAt: new Date().toISOString(),
        // The date input maps only to the payer deadline, not submission time
        ...(deadline ? { appealDeadline: new Date(deadline).toISOString() } : {}),
      });
      return res.json();
    },
    onSuccess: (updated: PriorAuthorizationRequest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests/stats"] });
      toast({ title: "Appeal marked as submitted", description: "Status updated to Appealed." });
      onSuccess(updated);
    },
    onError: (error: Error) => toast({ title: "Failed to mark appeal submitted", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-indigo-700" />
        <p className="text-sm font-semibold text-indigo-900">Mark Appeal as Submitted</p>
      </div>
      <div>
        <label className="text-xs text-indigo-800 mb-1 block">
          Appeal deadline / follow-up date <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="bg-white border-indigo-300 text-sm max-w-xs"
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          size="sm"
          className="gap-2 bg-indigo-700 hover:bg-indigo-800 text-white"
        >
          {submitMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            : <><CalendarCheck className="h-4 w-4" /> Confirm Appeal Submitted</>}
        </Button>
      </div>
    </div>
  );
}

// ── Signature Request panel ───────────────────────────────────────────────────
function SignatureRequestPanel({
  pa,
  onSuccess,
}: {
  pa: PriorAuthorizationRequest;
  onSuccess: (updated: PriorAuthorizationRequest) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState((pa as any).prescriberEmail ?? "");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pa-requests/${pa.id}/request-signature`, { prescriberEmail: email });
      return res.json();
    },
    onSuccess: (result: { pa: PriorAuthorizationRequest; emailSent: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests/stats"] });
      const msg = result.emailSent
        ? "Signature request email sent to prescriber."
        : "Signature link generated. Email delivery may have failed. Check logs.";
      toast({ title: "Signature requested", description: msg });
      onSuccess(result.pa);
    },
    onError: (error: Error) => toast({ title: "Failed to send signature request", description: error.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pa-requests/${pa.id}/void-signature`, {});
      return res.json();
    },
    onSuccess: (updated: PriorAuthorizationRequest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      toast({ title: "Signature voided", description: "Status returned to Pending. A new request can be sent." });
      onSuccess(updated);
    },
    onError: (error: Error) => toast({ title: "Failed to void signature", description: error.message, variant: "destructive" }),
  });

  const sigStatus = (pa as any).signatureStatus as string | undefined;

  return (
    <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <PenLine className="h-4 w-4 text-cyan-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-cyan-900">Request Prescriber E-Signature</p>
          <p className="text-xs text-cyan-700 mt-0.5">
            A secure one-time link will be emailed to the prescriber. When they sign, the letter is
            automatically stored and the status updates to Signature Received.
          </p>
        </div>
      </div>

      {sigStatus === "received" ? (
        <div className="space-y-3">
          <div className="rounded bg-teal-100 border border-teal-300 px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
            <div>
              <p className="text-sm font-medium text-teal-900">Signature received</p>
              {(pa as any).signatureReceivedAt && (
                <p className="text-xs text-teal-700">
                  Signed {new Date((pa as any).signatureReceivedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
            onClick={() => voidMutation.mutate()}
            disabled={voidMutation.isPending}
          >
            {voidMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Void Signature (letter needs regeneration)
          </Button>
        </div>
      ) : (
        <>
          {sigStatus === "requested" && (
            <div className="rounded bg-cyan-100 border border-cyan-300 px-3 py-2 text-xs text-cyan-800">
              Signature request sent. Waiting for prescriber to sign.
              {(pa as any).signatureTokenExpiresAt && (
                <span> Link expires {new Date((pa as any).signatureTokenExpiresAt).toLocaleDateString()}.</span>
              )}
              <span className="ml-1">You can resend a new link below.</span>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-cyan-900 mb-1 block">
              Prescriber email <span className="text-red-600">*</span>
            </label>
            <Input
              type="email"
              placeholder="dr.smith@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white border-cyan-300 focus:border-cyan-500 text-sm max-w-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => requestMutation.mutate()}
              disabled={!email.trim() || requestMutation.isPending}
              className="gap-2 bg-cyan-700 hover:bg-cyan-800 text-white"
            >
              {requestMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Mail className="h-4 w-4" /> Send Signature Request</>}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPaRequests() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<PriorAuthorizationRequest | null>(null);
  const [view, setView] = useState<"detail" | "edit" | "rfi" | "appeal" | "submit-appeal" | "request-signature">("detail");

  // Edit state
  const [editStatus, setEditStatus] = useState("");
  const [editRefNum, setEditRefNum] = useState("");
  const [editDenial, setEditDenial] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssigned, setEditAssigned] = useState("");

  const { data: requests = [], isLoading } = useQuery<PriorAuthorizationRequest[]>({
    queryKey: ["/api/admin/pa-requests"],
  });

  const { data: stats = [] } = useQuery<{ status: string; count: number }[]>({
    queryKey: ["/api/admin/pa-requests/stats"],
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<PriorAuthorizationRequest> & { id: string }) => {
      const { id, ...rest } = payload;
      const res = await apiRequest("PATCH", `/api/admin/pa-requests/${id}`, rest);
      return res.json();
    },
    onSuccess: (updated: PriorAuthorizationRequest) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pa-requests/stats"] });
      setSelected(updated);
      setView("detail");
      toast({ title: "PA request updated", description: `Status: ${STATUS_MAP[updated.status]?.label ?? updated.status}` });
    },
    onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  function openDetail(req: PriorAuthorizationRequest) {
    setSelected(req);
    setView("detail");
    setEditStatus(req.status);
    setEditRefNum(req.referenceNumber ?? "");
    setEditDenial(req.denialReason ?? "");
    setEditNotes(req.adminNotes ?? "");
    setEditAssigned(req.assignedTo ?? "");
  }

  function saveEdit() {
    if (!selected) return;
    updateMutation.mutate({
      id: selected.id,
      status: editStatus as PriorAuthorizationRequest["status"],
      referenceNumber: editRefNum || undefined,
      denialReason: editDenial || undefined,
      adminNotes: editNotes || undefined,
      assignedTo: editAssigned || undefined,
    });
  }

  const statCount = (key: string) => stats.find((s) => s.status === key)?.count ?? 0;
  const totalPending = statCount("pending_submission") + statCount("submitted");
  const totalRfi = statCount("rfi_received");
  const totalApproved = statCount("approved");
  const totalDenied = statCount("denied");
  const totalAppeals = statCount("appeal_in_progress") + statCount("appealed");

  const filtered = requests.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.medicationName, r.userId, r.insurancePlanName, r.prescriberName]
      .some((f) => f?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const showRfiButton = (status: string) => status === "rfi_received";
  const showAppealButton = (status: string) => status === "denied";
  const showSubmitAppealButton = (status: string) => status === "appeal_in_progress";
  const showSignatureButton = (status: string) => status === "pending_submission" || status === "signature_received";

  return (
    <AdminLayout>
      <div className="admin-page-shell admin-table-workspace space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Prior Authorization Requests
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review, track, and submit AI-generated PA letters to insurance payers.
          </p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Pending / Submitted" value={totalPending} color="text-amber-600" />
          <StatCard label="RFI Received" value={totalRfi} color="text-orange-600" />
          <StatCard label="Approved" value={totalApproved} color="text-emerald-600" />
          <StatCard label="Denied" value={totalDenied} color="text-red-600" />
          <StatCard label="Appeals" value={totalAppeals} color="text-purple-600" />
        </div>

        {/* Filters + table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by medication, patient ID, insurance…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_MAP[s]?.label ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No PA requests found.</p>
              </div>
            ) : (
               <div className="admin-table-frame rounded-md border overflow-x-auto">
                 <Table className="admin-dense-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medication</TableHead>
                      <TableHead>Patient ID</TableHead>
                      <TableHead>Insurance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((req) => (
                      <TableRow key={req.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <Pill className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium text-sm">{req.medicationName}</p>
                              {req.strength && <p className="text-xs text-muted-foreground">{req.strength}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">{req.userId.slice(0, 12)}…</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {req.insurancePlanName ?? <span className="text-muted-foreground italic">Not available</span>}
                            {req.insuranceMemberId && (
                              <p className="text-xs text-muted-foreground">#{req.insuranceMemberId}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={req.status} />
                            {showRfiButton(req.status) && (
                              <span className="text-xs text-orange-600 font-medium">RFI action needed</span>
                            )}
                            {showAppealButton(req.status) && (
                              <span className="text-xs text-purple-700 font-medium">Appeal available</span>
                            )}
                            {showSubmitAppealButton(req.status) && (
                              <span className="text-xs text-indigo-700 font-medium">Ready to submit</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{req.assignedTo ?? "Not assigned"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(req.createdAt).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {showRfiButton(req.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-700 border-orange-300 hover:bg-orange-50 gap-1"
                                onClick={() => { openDetail(req); setView("rfi"); }}
                              >
                                <WrenchIcon className="h-3 w-3" />
                                Fix &amp; Resubmit
                              </Button>
                            )}
                            {showAppealButton(req.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-purple-700 border-purple-300 hover:bg-purple-50 gap-1"
                                onClick={() => { openDetail(req); setView("appeal"); }}
                              >
                                <Gavel className="h-3 w-3" />
                                Appeal
                              </Button>
                            )}
                            {showSubmitAppealButton(req.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-indigo-700 border-indigo-300 hover:bg-indigo-50 gap-1"
                                onClick={() => { openDetail(req); setView("submit-appeal"); }}
                              >
                                <CalendarCheck className="h-3 w-3" />
                                Submit
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openDetail(req)}>
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setView("detail"); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" />
                  Prior Authorization: {selected.medicationName}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(selected.createdAt).toLocaleDateString()}
                    {selected.submittedAt && ` · Submitted ${new Date(selected.submittedAt).toLocaleDateString()}`}
                    {selected.responseReceivedAt && ` · Response ${new Date(selected.responseReceivedAt).toLocaleDateString()}`}
                    {(selected as any).appealGeneratedAt && ` · Appeal generated ${new Date((selected as any).appealGeneratedAt).toLocaleDateString()}`}
                    {(selected as any).appealSubmittedAt && ` · Appeal submitted ${new Date((selected as any).appealSubmittedAt).toLocaleDateString()}`}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* RFI alert banner */}
                {showRfiButton(selected.status) && view !== "rfi" && (
                  <div className="flex items-start gap-3 rounded-lg border-2 border-orange-200 bg-orange-50 p-3">
                    <MessageSquareWarning className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-900">Payer sent a Request for Information</p>
                      {selected.rfiNotes && (
                        <p className="text-xs text-orange-700 mt-0.5">Flagged: {selected.rfiNotes}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-orange-700 border-orange-300 hover:bg-orange-100 gap-1 shrink-0"
                      onClick={() => setView("rfi")}
                    >
                      <WrenchIcon className="h-3.5 w-3.5" />
                      Fix &amp; Resubmit
                    </Button>
                  </div>
                )}

                {/* Denied → appeal banner */}
                {showAppealButton(selected.status) && view !== "appeal" && (
                  <div className="flex items-start gap-3 rounded-lg border-2 border-purple-200 bg-purple-50 p-3">
                    <Gavel className="h-5 w-5 text-purple-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-900">PA was denied. Generate a formal appeal.</p>
                      <p className="text-xs text-purple-700 mt-0.5">
                        AI will draft a medical necessity appeal with FDA citations, clinical guidelines, and a prescriber peer-to-peer prep note.
                        ~40% of denied PAs are overturned on appeal.
                      </p>
                      {selected.denialReason && (
                        <p className="text-xs text-purple-800 mt-1 font-medium">Denial: {selected.denialReason}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-purple-700 border-purple-300 hover:bg-purple-100 gap-1 shrink-0"
                      onClick={() => setView("appeal")}
                    >
                      <Gavel className="h-3.5 w-3.5" />
                      Generate Appeal
                    </Button>
                  </div>
                )}

                {/* Appeal in progress → submit banner */}
                {showSubmitAppealButton(selected.status) && view !== "submit-appeal" && (
                  <div className="flex items-start gap-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 p-3">
                    <CalendarCheck className="h-5 w-5 text-indigo-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-indigo-900">Appeal letter is ready to submit to the payer</p>
                      <p className="text-xs text-indigo-700 mt-0.5">Once faxed or submitted via portal, mark it as submitted to track the deadline.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-indigo-700 border-indigo-300 hover:bg-indigo-100 gap-1 shrink-0"
                      onClick={() => setView("submit-appeal")}
                    >
                      <CalendarCheck className="h-3.5 w-3.5" />
                      Mark Submitted
                    </Button>
                  </div>
                )}

                {/* Awaiting signature banner */}
                {selected.status === "awaiting_signature" && view !== "request-signature" && (
                  <div className="flex items-start gap-3 rounded-lg border-2 border-cyan-200 bg-cyan-50 p-3">
                    <PenLine className="h-5 w-5 text-cyan-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-cyan-900">Waiting for prescriber signature</p>
                      <p className="text-xs text-cyan-700 mt-0.5">
                        A signature request was sent to {(selected as any).prescriberEmail ?? "the prescriber"}.
                        {(selected as any).signatureTokenExpiresAt && (
                          <span> Link expires {new Date((selected as any).signatureTokenExpiresAt).toLocaleDateString()}.</span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-cyan-700 border-cyan-300 hover:bg-cyan-100 gap-1 shrink-0"
                      onClick={() => setView("request-signature")}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Resend
                    </Button>
                  </div>
                )}

                {/* Signature received banner */}
                {selected.status === "signature_received" && view !== "request-signature" && (
                  <div className="flex items-start gap-3 rounded-lg border-2 border-teal-200 bg-teal-50 p-3">
                    <CheckCircle2 className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-teal-900">Prescriber signature received. Ready to submit.</p>
                      <p className="text-xs text-teal-700 mt-0.5">
                        The signed letter can be downloaded and submitted to the payer.
                        {(selected as any).signatureReceivedAt && (
                          <span> Signed {new Date((selected as any).signatureReceivedAt).toLocaleDateString()}.</span>
                        )}
                      </p>
                    </div>
                    {(selected as any).signedLetterHtml && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-teal-700 border-teal-300 hover:bg-teal-100 gap-1 shrink-0"
                        onClick={() => {
                          const blob = new Blob([(selected as any).signedLetterHtml], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          const w = window.open(url, "_blank");
                          if (w) setTimeout(() => URL.revokeObjectURL(url), 30_000);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Signed Letter
                      </Button>
                    )}
                  </div>
                )}

                {/* Action panels */}
                {view === "request-signature" && (
                  <>
                    <SignatureRequestPanel
                      pa={selected}
                      onSuccess={(updated) => { setSelected(updated); setView("detail"); }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setView("detail")}>← Back to details</Button>
                    <Separator />
                  </>
                )}

                {view === "rfi" && (
                  <>
                    <RfiPanel
                      pa={selected}
                      onSuccess={(updated) => { setSelected(updated); setView("detail"); }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setView("detail")}>← Back to details</Button>
                    <Separator />
                  </>
                )}

                {view === "appeal" && (
                  <>
                    <AppealPanel
                      pa={selected}
                      onSuccess={(updated) => { setSelected(updated); setView("detail"); }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setView("detail")}>← Back to details</Button>
                    <Separator />
                  </>
                )}

                {view === "submit-appeal" && (
                  <>
                    <MarkAppealSubmittedPanel
                      pa={selected}
                      onSuccess={(updated) => { setSelected(updated); setView("detail"); }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setView("detail")}>← Back to details</Button>
                    <Separator />
                  </>
                )}

                {/* Drug + Insurance info */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Pill className="h-3.5 w-3.5" /> Medication
                    </p>
                    <p className="font-medium">{selected.medicationName}</p>
                    {selected.strength && <p className="text-sm text-muted-foreground">{selected.strength}</p>}
                    {selected.ndc && <p className="text-xs text-muted-foreground font-mono">NDC: {selected.ndc}</p>}
                    {selected.daysSupply && <p className="text-xs text-muted-foreground">{selected.daysSupply} days supply</p>}
                    {selected.icd10Code && <p className="text-xs text-muted-foreground">ICD-10: {selected.icd10Code}</p>}
                    {selected.diagnosisDescription && <p className="text-xs text-muted-foreground">{selected.diagnosisDescription}</p>}
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> Insurance
                    </p>
                    <p className="font-medium">{selected.insurancePlanName ?? "Not available"}</p>
                    {selected.insuranceMemberId && <p className="text-sm">Member ID: {selected.insuranceMemberId}</p>}
                    {selected.insuranceBinNumber && <p className="text-xs text-muted-foreground">BIN: {selected.insuranceBinNumber}</p>}
                    {selected.insurancePcnNumber && <p className="text-xs text-muted-foreground">PCN: {selected.insurancePcnNumber}</p>}
                    {selected.referenceNumber && (
                      <p className="text-sm font-medium text-primary">Ref #: {selected.referenceNumber}</p>
                    )}
                  </div>
                </div>

                {/* Prescriber */}
                {(selected.prescriberName || selected.prescriberNpi) && (
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <User className="h-3.5 w-3.5" /> Prescriber
                    </p>
                    <p className="font-medium">{selected.prescriberName ?? "Not available"}</p>
                    {selected.prescriberNpi && <p className="text-xs text-muted-foreground">NPI: {selected.prescriberNpi}</p>}
                    <div className="flex gap-4 mt-1">
                      {selected.prescriberPhone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {selected.prescriberPhone}
                        </span>
                      )}
                      {selected.prescriberFax && (
                        <span className="text-xs text-muted-foreground">Fax: {selected.prescriberFax}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Clinical justification */}
                {selected.clinicalNotes && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Clinical Justification
                    </p>
                    <p className="text-sm leading-relaxed">{selected.clinicalNotes}</p>
                  </div>
                )}

                {/* Original PA Letter */}
                <LetterViewer html={selected.letterHtml} text={selected.letterText} label="Original PA Letter" />

                {/* Appeal Letter + clinical prep data (persisted, always visible once generated) */}
                {selected.appealLetterText && (
                  <div className="space-y-3">
                    <LetterViewer
                      html={selected.appealLetterHtml}
                      text={selected.appealLetterText}
                      label="Appeal Letter"
                    />

                    {/* Key Arguments */}
                    {Array.isArray(selected.appealKeyArguments) && selected.appealKeyArguments.length > 0 && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                        <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" /> Key Appeal Arguments
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {(selected.appealKeyArguments as string[]).map((arg, i) => (
                            <li key={i} className="text-sm text-purple-900">{arg}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Cited Guidelines */}
                    {Array.isArray(selected.appealCitedGuidelines) && selected.appealCitedGuidelines.length > 0 && (
                      <div className="rounded-lg border border-purple-100 p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Cited Guidelines &amp; Literature
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {(selected.appealCitedGuidelines as string[]).map((ref, i) => (
                            <li key={i} className="text-xs text-muted-foreground">{ref}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Peer-to-peer prep note */}
                    {selected.appealPeerToPeerNote && (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                        <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> Prescriber Peer-to-Peer Prep Note
                        </p>
                        <pre className="text-xs text-indigo-900 whitespace-pre-wrap font-sans leading-relaxed">
                          {selected.appealPeerToPeerNote}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Denial reason */}
                {selected.denialReason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Denial Reason
                    </p>
                    <p className="text-sm text-red-800">{selected.denialReason}</p>
                  </div>
                )}

                {/* Admin notes */}
                {selected.adminNotes && view !== "edit" && (
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Admin Notes</p>
                    <pre className="text-sm whitespace-pre-wrap font-sans">{selected.adminNotes}</pre>
                  </div>
                )}

                {/* Edit panel */}
                {view === "edit" && (
                  <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
                    <p className="text-sm font-semibold">Update PA Request</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_MAP[s]?.label ?? s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Payer Reference #</label>
                        <Input placeholder="PA-12345" value={editRefNum} onChange={(e) => setEditRefNum(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
                      <Input placeholder="Staff member name" value={editAssigned} onChange={(e) => setEditAssigned(e.target.value)} />
                    </div>
                    {editStatus === "denied" && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Denial Reason</label>
                        <Textarea placeholder="Reason provided by insurer…" value={editDenial} onChange={(e) => setEditDenial(e.target.value)} rows={3} />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Admin Notes</label>
                      <Textarea placeholder="Internal notes for the team…" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setView("detail")}>Cancel</Button>
                      <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 gap-2 flex-wrap">
                {view === "detail" && (
                  <>
                    {selected.letterHtml && (
                      <Button
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          const w = window.open("", "_blank");
                          if (w && selected.letterHtml) { w.document.write(selected.letterHtml); w.document.close(); }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open PA Letter
                      </Button>
                    )}
                    {(selected as any).appealLetterHtml && (
                      <Button
                        variant="outline"
                        className="gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
                        onClick={() => {
                          const w = window.open("", "_blank");
                          const html = (selected as any).appealLetterHtml;
                          if (w && html) { w.document.write(html); w.document.close(); }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Appeal Letter
                      </Button>
                    )}
                    {showRfiButton(selected.status) && (
                      <Button
                        variant="outline"
                        className="gap-1 text-orange-700 border-orange-300 hover:bg-orange-50"
                        onClick={() => setView("rfi")}
                      >
                        <WrenchIcon className="h-4 w-4" />
                        Fix &amp; Resubmit
                      </Button>
                    )}
                    {showAppealButton(selected.status) && (
                      <Button
                        variant="outline"
                        className="gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
                        onClick={() => setView("appeal")}
                      >
                        <Gavel className="h-4 w-4" />
                        Generate Appeal
                      </Button>
                    )}
                    {showSubmitAppealButton(selected.status) && (
                      <Button
                        variant="outline"
                        className="gap-1 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                        onClick={() => setView("submit-appeal")}
                      >
                        <CalendarCheck className="h-4 w-4" />
                        Mark Appeal Submitted
                      </Button>
                    )}
                    {showSignatureButton(selected.status) && (
                      <Button
                        variant="outline"
                        className="gap-1 text-cyan-700 border-cyan-300 hover:bg-cyan-50"
                        onClick={() => setView("request-signature")}
                      >
                        <PenLine className="h-4 w-4" />
                        {(selected as any).signatureStatus === "received" ? "Re-request Signature" : "Request Signature"}
                      </Button>
                    )}
                    {(selected as any).signedLetterHtml && (
                      <Button
                        variant="outline"
                        className="gap-1 text-teal-700 border-teal-300 hover:bg-teal-50"
                        onClick={() => {
                          const blob = new Blob([(selected as any).signedLetterHtml], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          const w = window.open(url, "_blank");
                          if (w) setTimeout(() => URL.revokeObjectURL(url), 30_000);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Signed Letter
                      </Button>
                    )}
                    <Button onClick={() => setView("edit")} className="gap-1">
                      <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                      Update Status
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
