import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { SavingsRequest } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { BadgeDollarSign, Phone, Mail, Pill, Search, Clock, CheckCircle2, MessageSquare } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new:       { label: "New",       color: "border-primary/30 text-primary bg-primary/10" },
  contacted: { label: "Contacted", color: "border-yellow-500/30 text-yellow-600 bg-yellow-500/10" },
  resolved:  { label: "Resolved",  color: "border-green-500/30 text-green-600 bg-green-500/10" },
};

function fmt(ts: string | Date) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminSavingsRequests() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<SavingsRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery<SavingsRequest[]>({
    queryKey: ["/api/admin/savings-requests"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes: notes }: { id: number; status?: string; adminNotes?: string }) => {
      const body: Record<string, string> = {};
      if (status) body.status = status;
      if (notes !== undefined) body.adminNotes = notes;
      const res = await apiRequest("PATCH", `/api/admin/savings-requests/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/savings-requests"] });
      toast({ title: "Updated", description: "Savings request updated." });
      setSelected(null);
    },
    onError: (error: Error) => toast({
      title: "Error",
      description: error.message || "Failed to update request.",
      variant: "destructive",
    }),
  });

  const filtered = requests.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search) ||
      (r.medication ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    new: requests.filter((r) => r.status === "new").length,
    contacted: requests.filter((r) => r.status === "contacted").length,
    resolved: requests.filter((r) => r.status === "resolved").length,
  };

  function openDetail(r: SavingsRequest) {
    setSelected(r);
    setAdminNotes(r.adminNotes ?? "");
    setNewStatus(r.status);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BadgeDollarSign className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Rx Savings Requests</h1>
            <p className="text-sm text-muted-foreground">Patients asking about prescription savings. Submitted via the Rx Savings page.</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "New",       value: counts.new,       color: "text-primary" },
            { label: "Contacted", value: counts.contacted, color: "text-yellow-600" },
            { label: "Resolved",  value: counts.resolved,  color: "text-green-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or medication…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="input-search-savings"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filtered.length} request{filtered.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">No savings requests found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Medication</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(r)} data-testid={`row-savings-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <a href={`tel:${r.phone}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.phone}
                        </a>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.medication ?? "Not available"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_MAP[r.status]?.color ?? ""}>
                          {STATUS_MAP[r.status]?.label ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{fmt(r.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(r); }} data-testid={`button-edit-savings-${r.id}`}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeDollarSign className="h-4 w-4 text-primary" />
              Savings Request #{selected?.id}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`tel:${selected.phone}`} className="text-primary hover:underline font-medium">{selected.phone}</a>
                </div>
                {selected.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${selected.email}`} className="text-primary hover:underline">{selected.email}</a>
                  </div>
                )}
                {selected.medication && (
                  <div className="flex items-center gap-2 text-sm col-span-2">
                    <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground">{selected.medication}</span>
                  </div>
                )}
                {selected.notes && (
                  <div className="flex items-start gap-2 text-sm col-span-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">{selected.notes}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground col-span-2">
                  <Clock className="h-3.5 w-3.5" />
                  {fmt(selected.createdAt)}
                </div>
              </div>

              {/* Status update */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-new-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Admin notes */}
              <div className="space-y-1.5">
                <Label>Admin Notes</Label>
                <Textarea
                  placeholder="Notes for your team…"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-admin-notes"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({ id: selected.id, status: newStatus, adminNotes })}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-savings"
                >
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
