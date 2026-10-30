import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Prescription } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Check, X, Pill } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function AdminPrescriptions() {
  const { toast } = useToast();
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/admin-login";
      }, 500);
    } else if (!authLoading && isAuthenticated && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, isAdmin, authLoading, toast]);

  const { data: prescriptions = [], isLoading } = useQuery<Prescription[]>({
    queryKey: ["/api/admin/prescriptions"],
    enabled: isAuthenticated && isAdmin,
  });

  const approveRefillMutation = useMutation({
    mutationFn: async (prescriptionId: string) => {
      await apiRequest("POST", "/api/admin/prescriptions/approve-refill", { prescriptionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prescriptions"] });
      toast({
        title: "Refill Approved",
        description: "Prescription refill has been approved.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/admin-login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to approve refill.",
        variant: "destructive",
      });
    },
  });

  const filteredPrescriptions = prescriptions.filter(
    (p) =>
      p.medicationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.rxNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingPrescriptions = filteredPrescriptions.filter((p) => p.status === "pending_refill");
  const activePrescriptions = filteredPrescriptions.filter((p) => p.status === "active");

  if (authLoading || !isAdmin) {
    return (
      <AdminLayout title="Prescription Management" backTo="/admin">
        <div className="p-4 md:p-6">
          <Skeleton className="mb-6 h-12 w-64" />
          <Skeleton className="mb-6 h-10 w-full" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Prescription Management" backTo="/admin">
       <main className="admin-page-shell admin-table-workspace p-4 md:p-6">

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by medication or Rx number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-prescriptions"
            />
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending Refills ({pendingPrescriptions.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activePrescriptions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : pendingPrescriptions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Pill className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-2 text-lg font-semibold">No Pending Refills</p>
                  <p className="text-sm text-muted-foreground">
                    All refill requests have been processed
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingPrescriptions.map((prescription) => (
                  <Card key={prescription.id} data-testid={`prescription-${prescription.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <CardTitle>{prescription.medicationName}</CardTitle>
                            <Badge variant="secondary">{prescription.status.replace("_", " ")}</Badge>
                          </div>
                           <CardDescription>Rx <span className="admin-mono">{prescription.rxNumber}</span></CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-sm font-medium">Dosage</p>
                          <p className="text-sm text-muted-foreground">{prescription.dosage}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Prescribed By</p>
                          <p className="text-sm text-muted-foreground">
                            {prescription.prescribedBy}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Refills Remaining</p>
                          <p className="text-sm text-muted-foreground">
                            {prescription.refillsRemaining}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => approveRefillMutation.mutate(prescription.id)}
                          disabled={approveRefillMutation.isPending}
                          data-testid={`button-approve-${prescription.id}`}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Approve Refill
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : activePrescriptions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Pill className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-2 text-lg font-semibold">No Active Prescriptions</p>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? "No results match your search" : "No active prescriptions found"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activePrescriptions.map((prescription) => (
                  <Card key={prescription.id} data-testid={`prescription-${prescription.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <CardTitle>{prescription.medicationName}</CardTitle>
                            <Badge>{prescription.status}</Badge>
                          </div>
                           <CardDescription>Rx <span className="admin-mono">{prescription.rxNumber}</span></CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-sm font-medium">Dosage</p>
                          <p className="text-sm text-muted-foreground">{prescription.dosage}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Prescribed By</p>
                          <p className="text-sm text-muted-foreground">
                            {prescription.prescribedBy}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Refills Remaining</p>
                          <p className="text-sm text-muted-foreground">
                            {prescription.refillsRemaining}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </AdminLayout>
  );
}
