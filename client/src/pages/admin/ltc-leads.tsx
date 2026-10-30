import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { BackButton } from "@/components/back-button";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LtcFacilityLead } from "@shared/schema";
import {
  Building2,
  Search,
  Phone,
  Mail,
  MapPin,
  Users,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "border-primary/30 text-primary bg-primary/10" },
  contacted: { label: "Contacted", color: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" },
  in_discussion: { label: "In Discussion", color: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
  onboarded: { label: "Onboarded", color: "border-green-500/30 text-green-400 bg-green-500/10" },
  declined: { label: "Declined", color: "border-red-500/30 text-red-400 bg-red-500/10" },
};

const FACILITY_TYPE_MAP: Record<string, string> = {
  nursing_home: "Skilled Nursing Facility",
  assisted_living: "Assisted Living Facility",
  memory_care: "Memory Care",
  rehabilitation: "Rehabilitation Center",
  hospice: "Hospice Care",
  other: "Other",
};

export default function AdminLtcLeads() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<LtcFacilityLead | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [updatedStatus, setUpdatedStatus] = useState("");
  const { toast } = useToast();

  const { data: leads = [], isLoading } = useQuery<LtcFacilityLead[]>({
    queryKey: ["/api/admin/ltc-leads"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes: notes }: { id: number; status?: string; adminNotes?: string }) => {
      const body: Record<string, string> = {};
      if (status) body.status = status;
      if (notes !== undefined) body.adminNotes = notes;
      const res = await apiRequest("PATCH", `/api/admin/ltc-leads/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ltc-leads"] });
      toast({ title: "Lead Updated", description: "Changes saved successfully." });
      setSelectedLead(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update lead",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = !searchQuery ||
      lead.facilityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 p-3 border-b flex-wrap">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <BackButton to="/admin" />
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold" data-testid="text-ltc-leads-title">LTC Facility Leads</h1>
              <Badge variant="secondary" className="ml-1">{leads.length}</Badge>
            </div>
          </header>

          <PageTransition className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(STATUS_MAP).map(([key, val]) => (
                <Badge
                  key={key}
                  className={`cursor-pointer ${statusFilter === key ? val.color : "bg-white/5 text-slate-400 border-white/10"}`}
                  onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                  data-testid={`filter-status-${key}`}
                >
                  {val.label} ({statusCounts[key] || 0})
                </Badge>
              ))}
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by facility, contact, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-ltc-leads"
              />
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Loading leads...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {leads.length === 0 ? "No facility inquiries yet." : "No leads match your filters."}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredLeads.map((lead) => {
                  const status = STATUS_MAP[lead.status] || STATUS_MAP.new;
                  const facilityLabel = FACILITY_TYPE_MAP[lead.facilityType] || lead.facilityType;
                  return (
                    <Card
                      key={lead.id}
                      className="border-white/10 bg-white/[0.02] hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedLead(lead);
                        setAdminNotes(lead.adminNotes || "");
                        setUpdatedStatus(lead.status);
                      }}
                      data-testid={`card-ltc-lead-${lead.id}`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-white truncate" data-testid={`text-facility-name-${lead.id}`}>
                                {lead.facilityName}
                              </h3>
                              <Badge className={status.color} data-testid={`badge-status-${lead.id}`}>
                                {status.label}
                              </Badge>
                            </div>

                            <p className="text-sm text-slate-400 mb-2">{facilityLabel}</p>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                              <span className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5 text-slate-500" />
                                {lead.contactName}
                                {lead.contactTitle && <span className="text-slate-500">({lead.contactTitle})</span>}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5 text-slate-500" />
                                {lead.phone}
                              </span>
                              {lead.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                                  {lead.email}
                                </span>
                              )}
                              {lead.numberOfBeds && (
                                <span className="text-slate-400">{lead.numberOfBeds} beds</span>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                            <Calendar className="h-3 w-3" />
                            {new Date(lead.createdAt).toLocaleDateString()}
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

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {selectedLead?.facilityName}
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500 block">Facility Type</span>
                  <span className="text-white">{FACILITY_TYPE_MAP[selectedLead.facilityType]}</span>
                </div>
                {selectedLead.numberOfBeds && (
                  <div>
                    <span className="text-slate-500 block">Beds</span>
                    <span className="text-white">{selectedLead.numberOfBeds}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block">Contact</span>
                  <span className="text-white">{selectedLead.contactName}</span>
                  {selectedLead.contactTitle && <span className="text-slate-400 text-xs block">{selectedLead.contactTitle}</span>}
                </div>
                <div>
                  <span className="text-slate-500 block">Phone</span>
                  <span className="text-white">{selectedLead.phone}</span>
                </div>
                {selectedLead.email && (
                  <div>
                    <span className="text-slate-500 block">Email</span>
                    <span className="text-white">{selectedLead.email}</span>
                  </div>
                )}
                {selectedLead.address && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Address</span>
                    <span className="text-white flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                      {selectedLead.address}
                    </span>
                  </div>
                )}
              </div>

              {selectedLead.notes && (
                <div>
                  <span className="text-slate-500 text-sm block mb-1">Facility Notes</span>
                  <p className="text-sm text-slate-300 bg-white/5 rounded-md p-3">{selectedLead.notes}</p>
                </div>
              )}

              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-slate-300">Status</Label>
                  <Select
                    value={updatedStatus}
                    onValueChange={setUpdatedStatus}
                  >
                    <SelectTrigger data-testid="select-ltc-lead-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_MAP).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Admin Notes</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes about this facility lead..."
                    className="min-h-[80px]"
                    data-testid="input-ltc-admin-notes"
                  />
                </div>

                <Button
                  onClick={() => {
                    if (selectedLead) {
                      updateMutation.mutate({
                        id: selectedLead.id,
                        status: updatedStatus !== selectedLead.status ? updatedStatus : undefined,
                        adminNotes,
                      });
                    }
                  }}
                  disabled={updateMutation.isPending}
                  className="w-full"
                  data-testid="button-save-ltc-lead"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
