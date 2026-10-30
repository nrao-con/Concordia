import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { FluShotAppointment } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  Pill,
  Package,
  Boxes,
  Users,
  DollarSign,
  ArrowRight,
  Syringe,
  Calendar,
  Gift,
} from "lucide-react";
export default function AdminDashboard() {
  const { toast } = useToast();
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<number | null>(null);

  // Real-time dashboard - auto-refresh every 10 seconds
  const { data: analytics, isLoading: analyticsLoading } = useQuery<{
    totalRevenue: number;
    totalOrders: number;
    totalPrescriptions: number;
    totalUsers: number;
    pendingOrders: number;
    pendingRefills: number;
    lowStockProducts: number;
    bySource: Record<string, { revenue: number; orders: number }>;
  }>({
    queryKey: ["/api/admin/analytics"],
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not active
  });

  const { data: fluShotAppointments = [], isLoading: appointmentsLoading, isFetching: appointmentsFetching } = useQuery<FluShotAppointment[]>({
    queryKey: ["/api/admin/flu-shot-appointments"],
    refetchInterval: 20000, // Auto-refresh appointments every 20 seconds
  });

  const isInitialLoading = appointmentsLoading && !fluShotAppointments.length;

  const updateAppointmentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      setUpdatingAppointmentId(id);
      
      // Optimistically update the cache
      const previousData = queryClient.getQueryData<FluShotAppointment[]>(["/api/admin/flu-shot-appointments"]);
      if (previousData) {
        queryClient.setQueryData<FluShotAppointment[]>(
          ["/api/admin/flu-shot-appointments"],
          previousData.map((apt) =>
            apt.id === id ? { ...apt, status: status as FluShotAppointment["status"] } : apt
          )
        );
      }
      
      try {
        const res = await apiRequest("PATCH", `/api/admin/flu-shot-appointments/${id}/status`, { status });
        const data = await res.json();
        return { data, previousData, id };
      } catch (error) {
        // Revert optimistic update on error
        if (previousData) {
          queryClient.setQueryData(["/api/admin/flu-shot-appointments"], previousData);
        }
        
        // Parse backend error for specific message
        if (error instanceof Error) {
          try {
            const errorMessage = error.message.split(': ')[1] || error.message;
            const parsedError = JSON.parse(errorMessage);
            throw new Error(parsedError.message || errorMessage);
          } catch {
            throw error;
          }
        }
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      try {
        // Update cache with server response to ensure consistency
        const currentData = queryClient.getQueryData<FluShotAppointment[]>(["/api/admin/flu-shot-appointments"]);
        if (currentData && result.data) {
          queryClient.setQueryData<FluShotAppointment[]>(
            ["/api/admin/flu-shot-appointments"],
            currentData.map((apt) => (apt.id === result.id ? result.data : apt))
          );
        }
        
        // Refetch to ensure full sync
        queryClient.invalidateQueries({ queryKey: ["/api/admin/flu-shot-appointments"] });
        
        toast({
          title: "Success",
          description: `Appointment ${variables.status === "completed" ? "completed" : "cancelled"} successfully`,
        });
      } finally {
        setUpdatingAppointmentId(null);
      }
    },
    onError: (error) => {
      try {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to update appointment status",
          variant: "destructive",
        });
      } finally {
        setUpdatingAppointmentId(null);
      }
    },
  });

  return (
    <AdminLayout showBackButton={false}>
      <div className="admin-dashboard-shell container mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <p className="admin-eyebrow mb-2">Today at Concordia</p>
          <h1 className="mb-2 text-2xl md:text-3xl font-bold tracking-tight">Dashboard overview</h1>
          <p className="text-muted-foreground">
            The work that needs attention, at a glance.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="admin-stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-revenue">
                ${analyticsLoading ? "..." : (analytics?.totalRevenue || 0).toFixed(2)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {analytics?.bySource?.website && (
                  <span data-testid="stat-revenue-website">Website: ${analytics.bySource.website.revenue.toFixed(2)}</span>
                )}
                {analytics?.bySource?.app && (
                  <span data-testid="stat-revenue-app">App: ${analytics.bySource.app.revenue.toFixed(2)}</span>
                )}
                {analytics?.bySource?.in_store && (
                  <span data-testid="stat-revenue-instore">In-Store: ${analytics.bySource.in_store.revenue.toFixed(2)}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-pending-orders">
                {analyticsLoading ? "..." : analytics?.pendingOrders || 0}
              </div>
              <p className="text-xs text-muted-foreground">Orders awaiting action</p>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending refills</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-pending-refills">
                {analyticsLoading ? "..." : analytics?.pendingRefills || 0}
              </div>
              <p className="text-xs text-muted-foreground">Refill requests to review</p>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low stock</CardTitle>
              <Boxes className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-low-stock">
                {analyticsLoading ? "..." : analytics?.lowStockProducts || 0}
              </div>
              <p className="text-xs text-muted-foreground">Products below threshold</p>
            </CardContent>
          </Card>

          <Card className="admin-stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {analyticsLoading ? "..." : analytics?.totalUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground">Registered pharmacy customers</p>
            </CardContent>
          </Card>
        </div>

        {/* Wellness Promotion Tracker */}
        <div className="mb-6 md:mb-8">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <Gift className="h-5 w-5 text-primary" />
                  Wellness Welcome Pack: Promotion Tracker
                </CardTitle>
                <CardDescription className="mt-1">
                  Track vitamins delivery and unlock pending points for wellness-eligible patients
                </CardDescription>
              </div>
              <Link href="/admin/transfer-requests?tab=promotion">
                <Button variant="outline" size="default" data-testid="button-promotion-tracker">
                  Open Tracker
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="mb-6 md:mb-8 grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* Flu Shot Appointments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Syringe className="h-4 w-4" />
                    Flu Shot Due
                    {appointmentsFetching && !isInitialLoading && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Syncing...
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Upcoming appointments</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading appointments...</p>
                </div>
              ) : fluShotAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No appointments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fluShotAppointments
                    .slice(0, 5)
                    .map((appointment) => {
                      const statusVariant = 
                        appointment.status === "completed" ? "default" : 
                        appointment.status === "cancelled" ? "destructive" : 
                        "secondary";
                      const statusLabel = appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1);
                      
                      return (
                        <div
                          key={appointment.id}
                          className="rounded-md border p-3"
                          data-testid={`flu-shot-${appointment.id}`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="font-semibold">
                                {appointment.firstName} {appointment.lastName}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {new Date(appointment.scheduledDate).toLocaleDateString()} at{" "}
                                {appointment.scheduledTime}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {appointment.fluShotType}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              <Badge variant={statusVariant} data-testid={`status-${appointment.id}`}>
                                {statusLabel}
                              </Badge>
                              <Badge variant={appointment.isExistingPatient ? "default" : "secondary"}>
                                {appointment.isExistingPatient ? "Existing" : "New"}
                              </Badge>
                            </div>
                          </div>
                          {appointment.status === "scheduled" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() =>
                                  updateAppointmentStatus.mutate({
                                    id: appointment.id,
                                    status: "completed",
                                  })
                                }
                                disabled={updatingAppointmentId === appointment.id}
                                data-testid={`button-complete-${appointment.id}`}
                              >
                                {updatingAppointmentId === appointment.id ? "Updating..." : "Complete"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() =>
                                  updateAppointmentStatus.mutate({
                                    id: appointment.id,
                                    status: "cancelled",
                                  })
                                }
                                disabled={updatingAppointmentId === appointment.id}
                                data-testid={`button-cancel-${appointment.id}`}
                              >
                                {updatingAppointmentId === appointment.id ? "Updating..." : "Cancel"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/admin/prescriptions">
                <Button className="w-full" variant="outline" data-testid="button-view-prescriptions">
                  <Pill className="mr-2 h-4 w-4" />
                  View Prescriptions
                </Button>
              </Link>
              <Link href="/admin/analytics">
                <Button className="w-full" variant="outline" data-testid="button-view-analytics">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View Analytics
                </Button>
              </Link>
              <Link href="/admin/milestone-patients">
                <Button className="w-full" variant="outline" data-testid="button-milestone-patients">
                  <Gift className="mr-2 h-4 w-4" />
                  Milestone Rewards
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
