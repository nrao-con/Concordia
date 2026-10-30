import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Pill, Calendar, Check } from "lucide-react";

type MilestonePatient = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  monthsActive: number;
  prescriptionCount: number;
  claimed: boolean;
  memberSince: string;
};

export default function AdminMilestonePatients() {
  const { data: patients = [], isLoading } = useQuery<MilestonePatient[]>({
    queryKey: ["/api/admin/milestone-eligible"],
  });

  const unclaimed = patients.filter((p) => !p.claimed);
  const claimed = patients.filter((p) => p.claimed);

  return (
    <AdminLayout title="4th-Month Milestone Patients" backTo="/admin">
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Members eligible for (or who have claimed) their loyalty milestone reward
          </p>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary" data-testid="badge-eligible-count">
              {unclaimed.length} eligible
            </Badge>
            <Badge variant="outline" data-testid="badge-claimed-count">
              {claimed.length} claimed
            </Badge>
          </div>
        </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">Loading milestone data...</div>
        ) : patients.length === 0 ? (
          <div className="text-center py-16">
            <Gift className="h-12 w-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No patients currently qualify for the 4th-month milestone.</p>
            <p className="text-xs text-slate-600 mt-1">Patients need 3+ months of membership and at least 1 prescription on file.</p>
          </div>
        ) : (
          <>
            {unclaimed.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-green-400" />
                  Eligible. Reward Not Yet Claimed ({unclaimed.length})
                </h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {unclaimed.map((patient) => (
                    <PatientCard key={patient.id} patient={patient} />
                  ))}
                </div>
              </div>
            )}

            {claimed.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Already Claimed ({claimed.length})
                </h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {claimed.map((patient) => (
                    <PatientCard key={patient.id} patient={patient} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </AdminLayout>
  );
}

function PatientCard({ patient }: { patient: MilestonePatient }) {
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unknown";
  const memberSince = patient.memberSince
    ? new Date(patient.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "N/A";

  return (
    <Card data-testid={`milestone-patient-${patient.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold">{name}</p>
            {patient.email && (
              <p className="text-xs text-muted-foreground">{patient.email}</p>
            )}
            {patient.phone && (
              <p className="text-xs text-muted-foreground">{patient.phone}</p>
            )}
          </div>
          {patient.claimed ? (
            <Badge variant="outline" className="text-green-400 border-green-500/30">
              <Check className="h-3 w-3 mr-1" /> Claimed
            </Badge>
          ) : (
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
              Eligible
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {patient.monthsActive}mo active
          </div>
          <div className="flex items-center gap-1">
            <Pill className="h-3 w-3" />
            {patient.prescriptionCount} Rx on file
          </div>
          <div className="flex items-center gap-1">
            Member since {memberSince}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
