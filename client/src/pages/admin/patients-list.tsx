import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  Users,
  Pill,
  Stethoscope,
  UserCheck,
  ChevronRight,
  RefreshCw,
  Heart,
  Smartphone,
  X,
  Phone,
  Mail,
  UserCog,
  Copy,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PatientListItem {
  id: string;
  concordiaId: string | null;
  primeRxPatientId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  familyGroupId: string | null;
  familyMembers: { id: string; firstName: string; lastName: string }[];
  insurance: { provider: string | null; policyNumber: string | null };
  allergies: string | null;
  medicalConditions: string | null;
  diagnosis: string | null;
  doctorCount: number;
  doctors: { id: number; firstName: string; lastName: string; specialty: string | null; phone: string | null; fax: string | null; npi: string | null; primeRxId: string | null }[];
  medicationCount: number;
  prescriptions: { id: string; rxNumber: string; medicationName: string; dosage: string; refillsRemaining: number; status: string }[];
  medications: any[];
  adherenceRate: number | null;
  blisterPackStatus: string | null;
  caregiver: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  lastSyncedToApp: string | null;
  usingApp: boolean;
  concordiaCareUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CaregiverDetail {
  hasAttendant: boolean;
  attendant?: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    email: string | null;
    agencyName: string | null;
  };
  relationship?: {
    relationshipType: string | null;
    linkedAt: string | null;
  };
}

function CaregiverPopover({
  patientId,
  caregiverName,
  onFilterClick,
}: {
  patientId: string;
  caregiverName: string;
  onFilterClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  function copyToClipboard(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      toast({ description: `${label} copied!`, duration: 2000 });
    });
  }

  const { data, isLoading, error } = useQuery<CaregiverDetail>({
    queryKey: ["/api/admin/users", patientId, "attendant"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/users/${patientId}/attendant`);
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-sm text-left hover:underline hover:text-foreground transition-colors cursor-pointer"
          data-testid={`button-caregiver-popover-${patientId}`}
          onClick={(e) => e.stopPropagation()}
        >
          {caregiverName}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        data-testid={`popover-caregiver-${patientId}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{caregiverName}</span>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {!isLoading && data && data.hasAttendant && data.attendant && (
          <div className="space-y-1.5">
            {data.relationship?.relationshipType && (
              <p className="text-xs text-muted-foreground capitalize mb-2">
                {data.relationship.relationshipType}
              </p>
            )}
            {data.attendant.phoneNumber && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <a
                  href={`tel:${data.attendant.phoneNumber}`}
                  className="text-sm hover:underline flex-1"
                  data-testid={`link-caregiver-phone-${patientId}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {data.attendant.phoneNumber}
                </a>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(data.attendant!.phoneNumber!, "Phone number"); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-copy-caregiver-phone-${patientId}`}
                  title="Copy phone number"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {data.attendant.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <a
                  href={`mailto:${data.attendant.email}`}
                  className="text-sm hover:underline truncate flex-1"
                  data-testid={`link-caregiver-email-${patientId}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {data.attendant.email}
                </a>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(data.attendant!.email!, "Email"); }}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  data-testid={`button-copy-caregiver-email-${patientId}`}
                  title="Copy email"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!data.attendant.phoneNumber && !data.attendant.email && (
              <p className="text-sm text-muted-foreground">No contact info on file.</p>
            )}
          </div>
        )}

        {!isLoading && data && !data.hasAttendant && (
          <p className="text-sm text-muted-foreground">No caregiver linked.</p>
        )}

        {!isLoading && error && (
          <p className="text-sm text-destructive" role="alert">
            Failed to load caregiver details: {(error as Error).message}
          </p>
        )}

        <div className="mt-3 pt-2 border-t">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`button-caregiver-filter-inline-${patientId}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onFilterClick();
            }}
          >
            Filter by this caregiver
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AdminPatientsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [caregiverFilter, setCaregiverFilter] = useState("all");
  const [adherenceFilter, setAdherenceFilter] = useState("all");

  const { data: patients = [], isLoading, error } = useQuery<PatientListItem[]>({
    queryKey: ["/api/admin/patients"],
    refetchInterval: 30000,
  });

  const allDoctors = useMemo(() => {
    const doctorMap = new Map<string, string>();
    patients.forEach((p) => {
      p.doctors.forEach((d) => {
        const key = `${d.firstName} ${d.lastName}`;
        if (!doctorMap.has(key)) {
          doctorMap.set(key, key);
        }
      });
    });
    return Array.from(doctorMap.values()).sort();
  }, [patients]);

  const allFamilyGroups = useMemo(() => {
    const groups = new Set<string>();
    patients.forEach((p) => {
      if (p.familyGroupId) groups.add(p.familyGroupId);
    });
    return Array.from(groups).sort();
  }, [patients]);

  const allCaregivers = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    patients.forEach((p) => {
      if (p.caregiver) {
        const name = `${p.caregiver.firstName} ${p.caregiver.lastName}`.trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
    });
    return names.sort();
  }, [patients]);

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const fullName = `${p.firstName || ""} ${p.lastName || ""}`.toLowerCase();
        const caregiverName = p.caregiver
          ? `${p.caregiver.firstName} ${p.caregiver.lastName}`.toLowerCase()
          : "";
        const matchesSearch =
          fullName.includes(q) ||
          (p.phone && p.phone.toLowerCase().includes(q)) ||
          (p.email && p.email.toLowerCase().includes(q)) ||
          (p.primeRxPatientId && p.primeRxPatientId.toLowerCase().includes(q)) ||
          (p.concordiaId && p.concordiaId.toLowerCase().includes(q)) ||
          caregiverName.includes(q);
        if (!matchesSearch) return false;
      }

      if (statusFilter !== "all") {
        if (statusFilter === "active" && p.blisterPackStatus !== "active") return false;
        if (statusFilter === "inactive" && p.blisterPackStatus === "active") return false;
      }

      if (familyFilter !== "all") {
        if (familyFilter === "has_family" && !p.familyGroupId) return false;
        if (familyFilter === "no_family" && p.familyGroupId) return false;
        if (familyFilter !== "has_family" && familyFilter !== "no_family" && p.familyGroupId !== familyFilter) return false;
      }

      if (doctorFilter !== "all") {
        const hasDoctor = p.doctors.some((d) => `${d.firstName} ${d.lastName}` === doctorFilter);
        if (!hasDoctor) return false;
      }

      if (caregiverFilter !== "all") {
        if (caregiverFilter === "has_caregiver" && !p.caregiver) return false;
        if (caregiverFilter === "no_caregiver" && p.caregiver) return false;
        if (caregiverFilter !== "has_caregiver" && caregiverFilter !== "no_caregiver") {
          const name = p.caregiver
            ? `${p.caregiver.firstName} ${p.caregiver.lastName}`.trim()
            : "";
          if (name !== caregiverFilter) return false;
        }
      }

      if (adherenceFilter !== "all") {
        if (adherenceFilter === "high" && (p.adherenceRate === null || p.adherenceRate < 80)) return false;
        if (adherenceFilter === "medium" && (p.adherenceRate === null || p.adherenceRate < 50 || p.adherenceRate >= 80)) return false;
        if (adherenceFilter === "low" && (p.adherenceRate === null || p.adherenceRate >= 50)) return false;
        if (adherenceFilter === "none" && p.adherenceRate !== null) return false;
      }

      return true;
    });
  }, [patients, searchQuery, statusFilter, familyFilter, doctorFilter, caregiverFilter, adherenceFilter]);

  const stats = useMemo(() => {
    const total = patients.length;
    const withFamily = patients.filter((p) => p.familyGroupId).length;
    const withCaregiver = patients.filter((p) => p.caregiver).length;
    const avgAdherence = patients.filter((p) => p.adherenceRate !== null);
    const avg = avgAdherence.length > 0
      ? Math.round(avgAdherence.reduce((sum, p) => sum + (p.adherenceRate || 0), 0) / avgAdherence.length)
      : null;
    return { total, withFamily, withCaregiver, avgAdherence: avg };
  }, [patients]);

  function getAdherenceBadge(rate: number | null) {
    if (rate === null) return <Badge variant="secondary">N/A</Badge>;
    if (rate >= 80) return <Badge variant="default">{rate}%</Badge>;
    if (rate >= 50) return <Badge variant="secondary">{rate}%</Badge>;
    return <Badge variant="destructive">{rate}%</Badge>;
  }

  function formatLastSync(dateStr: string | null) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  }

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="mb-2 font-heading text-3xl font-bold" data-testid="text-patients-title">
            Patient Directory
          </h1>
          <p className="text-muted-foreground">
            Comprehensive view of all patients with their medical data, family groups, and care teams
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-patients">
                {isLoading ? "..." : stats.total}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Family Groups</CardTitle>
              <Heart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-family-groups">
                {isLoading ? "..." : stats.withFamily}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Caregiver</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-with-caregiver">
                {isLoading ? "..." : stats.withCaregiver}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Adherence</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-adherence">
                {isLoading ? "..." : stats.avgAdherence !== null ? `${stats.avgAdherence}%` : "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, email, PrimeRx ID, or caregiver..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-patients"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={familyFilter} onValueChange={setFamilyFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-family-filter">
                    <SelectValue placeholder="Family Group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Families</SelectItem>
                    <SelectItem value="has_family">Has Family</SelectItem>
                    <SelectItem value="no_family">No Family</SelectItem>
                    {allFamilyGroups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g.substring(0, 12)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-doctor-filter">
                    <SelectValue placeholder="Doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Doctors</SelectItem>
                    {allDoctors.map((d) => (
                      <SelectItem key={d} value={d}>
                        Dr. {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Select value={caregiverFilter} onValueChange={setCaregiverFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-caregiver-filter">
                      <SelectValue placeholder="Caregiver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="has_caregiver">Has Caregiver</SelectItem>
                      <SelectItem value="no_caregiver">No Caregiver</SelectItem>
                      {allCaregivers.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {caregiverFilter !== "all" && caregiverFilter !== "has_caregiver" && caregiverFilter !== "no_caregiver" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCaregiverFilter("all")}
                      data-testid="button-clear-caregiver-filter"
                      title="Clear caregiver filter"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Select value={adherenceFilter} onValueChange={setAdherenceFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-adherence-filter">
                    <SelectValue placeholder="Adherence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High (80%+)</SelectItem>
                    <SelectItem value="medium">Medium (50-79%)</SelectItem>
                    <SelectItem value="low">Low (&lt;50%)</SelectItem>
                    <SelectItem value="none">No Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 text-sm text-muted-foreground" data-testid="text-results-count">
              Showing {filteredPatients.length} of {patients.length} patients
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Meds</TableHead>
                    <TableHead className="text-center">Doctors</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-center">Adherence</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Caregiver</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-destructive" role="alert">
                        Failed to load patients: {(error as Error).message}
                      </TableCell>
                    </TableRow>
                  ) : filteredPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center">
                        <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground" data-testid="text-no-patients">
                          No patients found matching your criteria
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPatients.map((patient) => (
                      <TableRow
                        key={patient.id}
                        className="cursor-pointer hover-elevate"
                        data-testid={`row-patient-${patient.id}`}
                      >
                        <TableCell>
                          <Link href={`/admin/patients/${patient.id}`}>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium" data-testid={`text-patient-name-${patient.id}`}>
                                  {patient.firstName || ""} {patient.lastName || ""}
                                </span>
                                {patient.usingApp && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0" data-testid={`badge-using-app-${patient.id}`}>
                                    <Smartphone className="h-2.5 w-2.5 mr-0.5" />
                                    App
                                  </Badge>
                                )}
                              </div>
                              {patient.concordiaId && (
                                <div className="text-xs text-muted-foreground font-mono" data-testid={`text-concordia-id-${patient.id}`}>
                                  {patient.concordiaId}
                                </div>
                              )}
                              {patient.primeRxPatientId && (
                                <div className="text-xs text-muted-foreground">
                                  PrimeRx: {patient.primeRxPatientId}
                                </div>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-patient-phone-${patient.id}`}>
                            {patient.phone || "Not available"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {patient.blisterPackStatus ? (
                            <Badge
                              variant={patient.blisterPackStatus === "active" ? "default" : "secondary"}
                              data-testid={`badge-status-${patient.id}`}
                            >
                              {patient.blisterPackStatus}
                            </Badge>
                          ) : (
                            <Badge variant="outline" data-testid={`badge-status-${patient.id}`}>
                              Standard
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Pill className="h-3 w-3 text-muted-foreground" />
                            <span data-testid={`text-med-count-${patient.id}`}>
                              {patient.medicationCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Stethoscope className="h-3 w-3 text-muted-foreground" />
                            <span data-testid={`text-doc-count-${patient.id}`}>
                              {patient.doctorCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {patient.familyGroupId ? (
                            <div>
                              <Badge variant="outline" data-testid={`badge-family-${patient.id}`}>
                                <Heart className="mr-1 h-3 w-3" />
                                {patient.familyMembers.length + 1}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not available</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" data-testid={`text-adherence-${patient.id}`}>
                          {getAdherenceBadge(patient.adherenceRate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground" data-testid={`text-sync-${patient.id}`}>
                              {formatLastSync(patient.lastSyncedToApp)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {patient.caregiver ? (
                            <CaregiverPopover
                              patientId={patient.id}
                              caregiverName={`${patient.caregiver.firstName} ${patient.caregiver.lastName}`.trim()}
                              onFilterClick={() => {
                                const name = `${patient.caregiver!.firstName} ${patient.caregiver!.lastName}`.trim();
                                setCaregiverFilter(name);
                              }}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">Not available</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/patients/${patient.id}`}>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-view-patient-${patient.id}`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
