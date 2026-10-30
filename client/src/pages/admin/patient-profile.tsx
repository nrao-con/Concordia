import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  Stethoscope,
  Pill,
  Heart,
  Users,
  UserCheck,
  RefreshCw,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Star,
  TrendingUp,
  Gift,
  Zap,
  Trash2,
  Loader2,
  Package,
  Truck,
  DollarSign,
  ShoppingBag,
  BookOpen,
} from "lucide-react";

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

interface PatientProfile {
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
  familyMembers: { id: string; firstName: string; lastName: string; phone: string; email: string }[];
  insurance: { provider: string | null; policyNumber: string | null; groupNumber: string | null };
  allergies: string | null;
  medicalConditions: string | null;
  diagnosis: string | null;
  adminNotes: string | null;
  doctors: {
    id: number;
    firstName: string;
    lastName: string;
    specialty: string | null;
    phone: string | null;
    fax: string | null;
    email: string | null;
    npi: string | null;
  }[];
  prescriptions: {
    id: string;
    rxNumber: string;
    medicationName: string;
    dosage: string;
    quantity: number;
    refillsRemaining: number;
    prescribedBy: string;
    instructions: string | null;
    status: string;
    workflowStatus: string | null;
  }[];
  medications: {
    name: string;
    dosage: string;
    frequency: string;
    intakeTimes: string[];
    instructions?: string;
    isActive: boolean;
  }[];
  adherence: {
    totalDoses: number;
    takenDoses: number;
    skippedDoses: number;
    missedDoses: number;
    rate: number | null;
    recentLogs: {
      id: number;
      status: string;
      medicationName: string;
      scheduledTime: string;
      takenAt: string | null;
      createdAt: string;
    }[];
  };
  caregiver: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    permissions: {
      canManagePrescriptions: boolean;
      canViewMedicalInfo: boolean;
      canRequestRefills: boolean;
      canPlaceOrders: boolean;
    };
  } | null;
  blisterPack: {
    id: number;
    status: string;
    type: string | null;
    lastPackDate: string | null;
    nextPackDate: string | null;
    lastSyncedToApp: string | null;
    concordiaCareId: string | null;
  } | null;
  concordiaCareUserId: string | null;
  loyalty: {
    wallet: {
      currentBalance: number;
      lifetimeEarned: number;
      lifetimeRedeemed: number;
      lifetimeExpired: number;
    };
    streaks: { type: string; currentCount: number; bestCount: number; lastQualifyingActionAt: string | null }[];
    recentTransactions: { id: number; actionType: string; points: number; balanceAfter: number; description: string | null; createdAt: string }[];
    redemptions: { id: number; rewardName: string | null; pointsSpent: number; status: string; createdAt: string }[];
  };
  deliveryInsights: {
    totalOrders: number;
    totalSpending: number;
    monthlyAvgSpending: number;
    orderTypeBreakdown: { type: string; count: number; percentage: number }[];
    deliveryMethodBreakdown: { method: string; count: number; percentage: number }[];
    courierBreakdown: { courier: string; count: number; percentage: number }[];
    predictedDeliveryPreference: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AdminPatientProfile() {
  const [, params] = useRoute("/admin/patients/:id");
  const patientId = params?.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showDissolve, setShowDissolve] = useState(false);
  const [dissolveReason, setDissolveReason] = useState("");

  const { data: patient, isLoading, error: patientError } = useQuery<PatientProfile>({
    queryKey: ["/api/admin/patients", patientId],
    enabled: !!patientId,
  });

  interface PatientCondition {
    id: string;
    conditionName: string;
    icd10Code: string | null;
    diagnosedAt: string | null;
    status: "active" | "resolved";
    notes: string | null;
    createdAt: string;
  }

  const { data: structuredConditions = [], error: conditionsError } = useQuery<PatientCondition[]>({
    queryKey: ["/api/admin/patients", patientId, "conditions"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/patients/${patientId}/conditions`);
      return response.json();
    },
    enabled: !!patientId,
  });

  const dissolveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/patients/${patientId}`, { reason: dissolveReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patients"] });
      toast({ title: "Profile dissolved", description: "Patient profile has been permanently removed and app access revoked." });
      setShowDissolve(false);
      setDissolveReason("");
      navigate("/admin/customers");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to dissolve profile",
        description: getApiErrorMessage(error, "An error occurred while dissolving the profile."),
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/primerx/sync-to-app`, { patientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/patients", patientId] });
      toast({ title: "Sync triggered", description: "Patient data synced to ConcordiaCare app." });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: getApiErrorMessage(error, "Could not sync patient data."), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout title="Patient Profile" backTo="/admin/customers">
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48" />
        </div>
      </AdminLayout>
    );
  }

  if (patientError || !patient) {
    return (
      <AdminLayout title="Patient Profile" backTo="/admin/customers">
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-semibold" data-testid="text-not-found">
                {patientError ? "Failed to load patient profile" : "Patient not found"}
              </p>
              {patientError && (
                <p className="mt-2 text-sm text-destructive" role="alert">{(patientError as Error).message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unknown Patient";
  const adherenceRate = patient.adherence.rate;

  return (
    <AdminLayout title="Patient Profile" backTo="/admin/customers">
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold" data-testid="text-patient-name">{fullName}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {patient.concordiaId && (
                  <Badge variant="secondary" data-testid="badge-concordia-id" className="font-mono">
                    {patient.concordiaId}
                  </Badge>
                )}
                {patient.primeRxPatientId && (
                  <Badge variant="outline" data-testid="badge-primerx-id">
                    PrimeRx: {patient.primeRxPatientId}
                  </Badge>
                )}
                {patient.familyGroupId && (
                  <Badge variant="secondary" data-testid="badge-family-group">
                    <Users className="mr-1 h-3 w-3" />
                    Family Group
                  </Badge>
                )}
                {patient.blisterPack && (
                  <Badge data-testid="badge-blister-status">
                    {patient.blisterPack.status}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-to-app"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync to App"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Demographics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Calendar} label="Date of Birth" value={patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : null} testId="text-dob" />
              <InfoRow icon={User} label="Gender" value={patient.gender} testId="text-gender" />
              <InfoRow icon={Phone} label="Phone" value={patient.phone} testId="text-phone" />
              <InfoRow icon={Mail} label="Email" value={patient.email} testId="text-email" />
              <InfoRow icon={MapPin} label="Address" value={patient.address} testId="text-address" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Insurance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Shield} label="Provider" value={patient.insurance.provider} testId="text-insurance-provider" />
              <InfoRow icon={Shield} label="Policy #" value={patient.insurance.policyNumber} testId="text-insurance-policy" />
              <InfoRow icon={Shield} label="Group #" value={patient.insurance.groupNumber} testId="text-insurance-group" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Doctors ({patient.doctors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {patient.doctors.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-doctors">No doctors linked</p>
            ) : (
              <div className="space-y-3">
                {patient.doctors.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3" data-testid={`doctor-${doc.id}`}>
                    <div>
                      <p className="font-semibold">Dr. {doc.firstName} {doc.lastName}</p>
                      {doc.specialty && <p className="text-sm text-muted-foreground">{doc.specialty}</p>}
                    </div>
                    <div className="text-right text-sm text-muted-foreground space-y-0.5">
                      {doc.phone && <p>{doc.phone}</p>}
                      {doc.npi && <p>NPI: {doc.npi}</p>}
                      {doc.email && <p>{doc.email}</p>}
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
                <Pill className="h-4 w-4" />
                Medications ({patient.medications.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patient.medications.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-medications">No blister pack medications</p>
              ) : (
                <div className="space-y-3">
                  {patient.medications.map((med, idx) => (
                    <div key={idx} className="rounded-md border p-3" data-testid={`medication-${idx}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{med.name}</p>
                        <Badge variant={med.isActive ? "default" : "secondary"}>
                          {med.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{med.dosage} &middot; {med.frequency}</p>
                      {med.intakeTimes && med.intakeTimes.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {med.intakeTimes.map((time) => (
                            <Badge key={time} variant="outline" className="text-xs">{time}</Badge>
                          ))}
                        </div>
                      )}
                      {med.instructions && <p className="mt-1 text-xs text-muted-foreground">{med.instructions}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-4 w-4" />
                Prescriptions ({patient.prescriptions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patient.prescriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-prescriptions">No prescriptions</p>
              ) : (
                <div className="space-y-3">
                  {patient.prescriptions.map((rx) => (
                    <div key={rx.id} className="rounded-md border p-3" data-testid={`prescription-${rx.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{rx.medicationName}</p>
                        <Badge variant={rx.status === "active" ? "default" : "secondary"}>
                          {rx.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Rx# {rx.rxNumber} &middot; {rx.dosage} &middot; Qty: {rx.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Prescribed by: {rx.prescribedBy} &middot; Refills: {rx.refillsRemaining}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Diagnosis &amp; Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Diagnosis</p>
                <p className="text-sm" data-testid="text-diagnosis">
                  {patient.diagnosis || "None recorded"}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Medical Conditions</p>
                <p className="text-sm" data-testid="text-conditions">
                  {patient.medicalConditions || "None recorded"}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Allergies</p>
                <p className="text-sm" data-testid="text-allergies">
                  {patient.allergies || "None recorded"}
                </p>
              </div>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Care Navigator Conditions</p>
                </div>
                {conditionsError ? (
                  <p className="text-sm text-destructive" role="alert">
                    Failed to load Care Navigator conditions: {(conditionsError as Error).message}
                  </p>
                ) : structuredConditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-care-conditions">No conditions logged in Care Navigator</p>
                ) : (
                  <div className="flex flex-col gap-2" data-testid="list-care-conditions">
                    {structuredConditions.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-2" data-testid={`row-care-condition-${c.id}`}>
                        <Badge variant={c.status === "active" ? "default" : "secondary"} data-testid={`badge-condition-status-${c.id}`}>
                          {c.status}
                        </Badge>
                        <span className="text-sm font-medium" data-testid={`text-condition-name-${c.id}`}>{c.conditionName}</span>
                        {c.icd10Code && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-condition-icd10-${c.id}`}>ICD-10: {c.icd10Code}</span>
                        )}
                        {c.diagnosedAt && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-condition-date-${c.id}`}>
                            Dx: {new Date(c.diagnosedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Adherence Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patient.adherence.totalDoses === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-adherence">No dose tracking data available</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold" data-testid="text-adherence-rate">
                        {adherenceRate !== null ? `${adherenceRate}%` : "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">Compliance</p>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div className="flex gap-4">
                      <StatMini icon={CheckCircle} label="Taken" value={patient.adherence.takenDoses} color="text-green-600" testId="text-doses-taken" />
                      <StatMini icon={XCircle} label="Skipped" value={patient.adherence.skippedDoses} color="text-yellow-600" testId="text-doses-skipped" />
                      <StatMini icon={AlertTriangle} label="Missed" value={patient.adherence.missedDoses} color="text-red-600" testId="text-doses-missed" />
                    </div>
                  </div>
                  {patient.adherence.recentLogs.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium mb-2">Recent Doses</p>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {patient.adherence.recentLogs.slice(0, 10).map((log) => (
                            <div key={log.id} className="flex items-center justify-between text-sm" data-testid={`dose-log-${log.id}`}>
                              <span>{log.medicationName}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{log.scheduledTime}</span>
                                <Badge variant={log.status === "taken" ? "default" : "secondary"} className="text-xs">
                                  {log.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Family Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!patient.familyGroupId ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-family">No family group assigned</p>
              ) : patient.familyMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-family-members">No other family members found</p>
              ) : (
                <div className="space-y-2">
                  {patient.familyMembers.map((member) => (
                    <Link key={member.id} href={`/admin/patients/${member.id}`}>
                      <div className="flex items-center justify-between rounded-md border p-3 hover-elevate cursor-pointer" data-testid={`family-member-${member.id}`}>
                        <div>
                          <p className="font-semibold">{member.firstName} {member.lastName}</p>
                          <p className="text-sm text-muted-foreground">{member.phone || member.email || "No contact"}</p>
                        </div>
                        <Badge variant="outline">View</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Caregiver
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!patient.caregiver ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-caregiver">No caregiver linked</p>
              ) : (
                <div className="space-y-3" data-testid="caregiver-info">
                  <div>
                    <p className="font-semibold">{patient.caregiver.firstName} {patient.caregiver.lastName}</p>
                    {patient.caregiver.phone && <p className="text-sm text-muted-foreground">{patient.caregiver.phone}</p>}
                    {patient.caregiver.email && <p className="text-sm text-muted-foreground">{patient.caregiver.email}</p>}
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">Permissions</p>
                    <div className="flex flex-wrap gap-2">
                      <PermBadge label="Prescriptions" allowed={patient.caregiver.permissions.canManagePrescriptions} />
                      <PermBadge label="Medical Info" allowed={patient.caregiver.permissions.canViewMedicalInfo} />
                      <PermBadge label="Refills" allowed={patient.caregiver.permissions.canRequestRefills} />
                      <PermBadge label="Orders" allowed={patient.caregiver.permissions.canPlaceOrders} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Loyalty & Wellness Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="text-center" data-testid="stat-points-balance">
                <Zap className="mx-auto h-4 w-4 text-amber-500" />
                <p className="text-lg font-bold">{patient.loyalty.wallet.currentBalance}</p>
                <p className="text-xs text-muted-foreground">Current Points</p>
              </div>
              <div className="text-center" data-testid="stat-points-earned">
                <TrendingUp className="mx-auto h-4 w-4 text-green-500" />
                <p className="text-lg font-bold">{patient.loyalty.wallet.lifetimeEarned}</p>
                <p className="text-xs text-muted-foreground">Lifetime Earned</p>
              </div>
              <div className="text-center" data-testid="stat-points-redeemed">
                <Gift className="mx-auto h-4 w-4 text-primary" />
                <p className="text-lg font-bold">{patient.loyalty.wallet.lifetimeRedeemed}</p>
                <p className="text-xs text-muted-foreground">Redeemed</p>
              </div>
              <div className="text-center" data-testid="stat-points-expired">
                <Clock className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold">{patient.loyalty.wallet.lifetimeExpired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
            {patient.loyalty.streaks.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Active Streaks</p>
                <div className="flex flex-wrap gap-2">
                  {patient.loyalty.streaks.map((s, i) => (
                    <Badge key={i} variant="secondary" data-testid={`badge-streak-${i}`}>
                      {s.type.replace(/_/g, " ")}: {s.currentCount} (best: {s.bestCount})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {patient.loyalty.recentTransactions.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Recent Transactions</p>
                <div className="space-y-1">
                  {patient.loyalty.recentTransactions.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`text-transaction-${t.id}`}>
                      <span className="text-muted-foreground">{t.description || t.actionType.replace(/_/g, " ")}</span>
                      <span className={t.points >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {t.points >= 0 ? "+" : ""}{t.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {patient.loyalty.redemptions.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Redemption History</p>
                <div className="space-y-1">
                  {patient.loyalty.redemptions.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`text-redemption-${r.id}`}>
                      <span>{r.rewardName || "Reward"}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{r.pointsSpent} pts</span>
                        <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {patient.loyalty.wallet.currentBalance === 0 && patient.loyalty.wallet.lifetimeEarned === 0 && patient.loyalty.streaks.length === 0 && patient.loyalty.recentTransactions.length === 0 && patient.loyalty.redemptions.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-no-loyalty">No loyalty activity yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last PrimeRx Sync</p>
                <p className="text-sm" data-testid="text-last-primerx-sync">
                  {patient.blisterPack?.lastSyncedToApp
                    ? new Date(patient.blisterPack.lastSyncedToApp).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">ConcordiaCare ID</p>
                <p className="text-sm" data-testid="text-concordia-id">
                  {patient.blisterPack?.concordiaCareId || "Not linked"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Account Created</p>
                <p className="text-sm" data-testid="text-created-at">
                  {new Date(patient.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-sm" data-testid="text-updated-at">
                  {new Date(patient.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Delivery Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            {patient.deliveryInsights.totalOrders === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-delivery-data">No order history yet</p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="text-center">
                    <ShoppingBag className="mx-auto h-4 w-4 text-muted-foreground" />
                    <p className="text-lg font-bold" data-testid="text-total-orders">{patient.deliveryInsights.totalOrders}</p>
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                  </div>
                  <div className="text-center">
                    <DollarSign className="mx-auto h-4 w-4 text-green-500" />
                    <p className="text-lg font-bold" data-testid="text-total-spending">${patient.deliveryInsights.totalSpending.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                  </div>
                  <div className="text-center">
                    <TrendingUp className="mx-auto h-4 w-4 text-primary" />
                    <p className="text-lg font-bold" data-testid="text-monthly-avg">${patient.deliveryInsights.monthlyAvgSpending.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Monthly Avg</p>
                  </div>
                  <div className="text-center">
                    <Package className="mx-auto h-4 w-4 text-orange-500" />
                    <p className="text-lg font-bold" data-testid="text-predicted-pref">
                      {patient.deliveryInsights.predictedDeliveryPreference || "N/A"}
                    </p>
                    <p className="text-xs text-muted-foreground">Predicted Preference</p>
                  </div>
                </div>

                {patient.deliveryInsights.deliveryMethodBreakdown.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Delivery Method Breakdown</p>
                    <div className="space-y-2">
                      {patient.deliveryInsights.deliveryMethodBreakdown.map((item) => (
                        <div key={item.method} className="flex items-center gap-3" data-testid={`delivery-method-${item.method}`}>
                          <span className="text-sm capitalize w-20">{item.method}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-20 text-right">
                            {item.count} ({item.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {patient.deliveryInsights.courierBreakdown.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Courier Preference</p>
                    <div className="space-y-2">
                      {patient.deliveryInsights.courierBreakdown.map((item) => (
                        <div key={item.courier} className="flex items-center gap-3" data-testid={`courier-${item.courier}`}>
                          <span className="text-sm w-20">{item.courier}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-20 text-right">
                            {item.count} ({item.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {patient.deliveryInsights.orderTypeBreakdown.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Order Types</p>
                    <div className="flex flex-wrap gap-2">
                      {patient.deliveryInsights.orderTypeBreakdown.map((item) => (
                        <Badge key={item.type} variant="secondary" data-testid={`order-type-${item.type}`}>
                          <span className="capitalize">{item.type}</span>: {item.count} ({item.percentage}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Dissolving a patient profile is permanent and cannot be undone. All prescriptions, orders, loyalty data,
              documents, and app access will be permanently removed.
            </p>
            <Button
              variant="destructive"
              onClick={() => setShowDissolve(true)}
              data-testid="button-dissolve-profile"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Dissolve Profile
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDissolve} onOpenChange={(val) => { if (!val) { setShowDissolve(false); setDissolveReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-dissolve-title">Dissolve Patient Profile</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to permanently dissolve the profile for <span className="font-semibold">{fullName}</span>.
                  This action is irreversible.
                </p>
                <div className="text-sm space-y-1">
                  <p className="font-medium">The following will be permanently deleted:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>All prescriptions and medication records</li>
                    <li>All orders and transaction history</li>
                    <li>Loyalty points and wellness credits</li>
                    <li>Patient documents and records</li>
                    <li>Blister pack data and schedules</li>
                    <li>Caregiver links and family group associations</li>
                  </ul>
                </div>
                <p className="text-sm font-medium">App access will be revoked immediately.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="dissolve-reason" className="text-sm font-medium">
              Reason for dissolution <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="dissolve-reason"
              placeholder="Provide a detailed reason for dissolving this patient profile..."
              value={dissolveReason}
              onChange={(e) => setDissolveReason(e.target.value)}
              className="mt-1.5"
              rows={3}
              data-testid="input-dissolve-reason"
            />
            {dissolveReason.length > 0 && dissolveReason.length < 5 && (
              <p className="text-xs text-destructive mt-1">Reason must be at least 5 characters</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-dissolve-cancel">Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => dissolveMutation.mutate()}
              disabled={dissolveReason.length < 5 || dissolveMutation.isPending}
              data-testid="button-dissolve-confirm"
            >
              {dissolveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dissolve Profile
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function InfoRow({ icon: Icon, label, value, testId }: { icon: any; label: string; value: string | null | undefined; testId: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm" data-testid={testId}>{value || "Not provided"}</p>
      </div>
    </div>
  );
}

function StatMini({ icon: Icon, label, value, color, testId }: { icon: any; label: string; value: number; color: string; testId: string }) {
  return (
    <div className="text-center">
      <Icon className={`mx-auto h-4 w-4 ${color}`} />
      <p className="text-lg font-bold" data-testid={testId}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PermBadge({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <Badge variant={allowed ? "default" : "secondary"} className="text-xs">
      {allowed ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}
