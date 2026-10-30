import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { FluShotAppointment } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Syringe, Search, Calendar, Clock, CheckCircle, XCircle, User, Phone, Mail, MapPin, Ticket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { appointmentDeliverySummary, type AppointmentNotificationDelivery } from "@shared/flu-shot-notifications";

const statusColors: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/70",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  no_show: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const statusIcons: Record<string, typeof Calendar> = {
  scheduled: Calendar,
  completed: CheckCircle,
  cancelled: XCircle,
  no_show: XCircle,
};

export default function AdminFluShots() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<FluShotAppointment | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: appointments = [], isLoading } = useQuery<FluShotAppointment[]>({
    queryKey: ["/api/admin/flu-shot-appointments"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/flu-shot-appointments/${id}/status`, { status });
      return response.json();
    },
    onSuccess: (data: { notificationDelivery?: AppointmentNotificationDelivery }) => {
      const delivery = data.notificationDelivery;
      const failed = delivery && [delivery.email, delivery.sms].some(state => state === "failed" || state === "not_configured");
      toast({
        title: failed ? "Status updated - message needs attention" : "Status Updated",
        description: appointmentDeliverySummary(delivery),
        variant: failed ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flu-shot-appointments"] });
      setDetailsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredAppointments = appointments.filter((apt) => {
    const search = searchTerm.toLowerCase();
    const fullName = `${apt.firstName} ${apt.lastName}`.toLowerCase();
    return (
      fullName.includes(search) ||
      apt.email?.toLowerCase().includes(search) ||
      apt.ticketNumber?.toLowerCase().includes(search) ||
      apt.phoneNumber?.toLowerCase().includes(search)
    );
  });

  const scheduledCount = appointments.filter(a => a.status === "scheduled").length;
  const completedCount = appointments.filter(a => a.status === "completed").length;
  const todayCount = appointments.filter(a => {
    const today = new Date();
    const aptDate = new Date(a.scheduledDate);
    return aptDate.toDateString() === today.toDateString() && a.status === "scheduled";
  }).length;

  const handleViewDetails = (appointment: FluShotAppointment) => {
    setSelectedAppointment(appointment);
    setNewStatus(appointment.status);
    setDetailsDialogOpen(true);
  };

  const handleUpdateStatus = () => {
    if (selectedAppointment && newStatus) {
      updateStatusMutation.mutate({ id: selectedAppointment.id, status: newStatus });
    }
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-4 md:p-6">
        <div className="mb-6 md:mb-8">
          <h1 className="mb-2 font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Syringe className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            Flu Shot Appointments
          </h1>
          <p className="text-muted-foreground">
            Manage flu shot scheduling and patient appointments
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
              <Syringe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-appointments">
                {isLoading ? "..." : appointments.length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Appointments</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary/90" data-testid="stat-today">
                {isLoading ? "..." : todayCount}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-scheduled">
                {isLoading ? "..." : scheduledCount}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-completed">
                {isLoading ? "..." : completedCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Appointments</CardTitle>
            <CardDescription>View and manage flu shot appointments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or ticket number..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-appointments"
              />
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : filteredAppointments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No appointments found</p>
            ) : (
              isMobile ? (
                /* Mobile card view */
                <div className="space-y-3">
                  {filteredAppointments.map((appointment) => {
                    const StatusIcon = statusIcons[appointment.status] || Calendar;
                    return (
                      <div
                        key={appointment.id}
                        className="rounded-md border p-4 space-y-2"
                        data-testid={`appointment-row-${appointment.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium">{appointment.firstName} {appointment.lastName}</p>
                            <p className="text-sm text-muted-foreground">{appointment.phoneNumber}</p>
                          </div>
                          <Badge className={statusColors[appointment.status]}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {appointment.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Ticket className="h-3 w-3" />
                            <code className="font-mono">{appointment.ticketNumber}</code>
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(appointment.scheduledDate).toLocaleDateString()} · {appointment.scheduledTime}
                          </span>
                        </div>
                        <p className="text-sm">{appointment.fluShotType}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleViewDetails(appointment)}
                          data-testid={`button-view-${appointment.id}`}
                        >
                          <Ticket className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Desktop table view */
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Vaccine Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAppointments.map((appointment) => {
                        const StatusIcon = statusIcons[appointment.status] || Calendar;
                        return (
                          <TableRow key={appointment.id} data-testid={`appointment-row-${appointment.id}`}>
                            <TableCell>
                              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {appointment.ticketNumber}
                              </code>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {appointment.firstName} {appointment.lastName}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground ml-6">
                                {appointment.phoneNumber}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {new Date(appointment.scheduledDate).toLocaleDateString()}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                                <Clock className="h-3 w-3" />
                                {appointment.scheduledTime}
                              </div>
                            </TableCell>
                            <TableCell>{appointment.fluShotType}</TableCell>
                            <TableCell>
                              <Badge className={statusColors[appointment.status]}>
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {appointment.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewDetails(appointment)}
                                data-testid={`button-view-${appointment.id}`}
                              >
                                <Ticket className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Syringe className="h-5 w-5" />
                Appointment Details
              </DialogTitle>
              <DialogDescription>
                Ticket: {selectedAppointment?.ticketNumber}
              </DialogDescription>
            </DialogHeader>

            {selectedAppointment && (
              <div className="space-y-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Ticket Number (Patient should present this)</p>
                      <code className="text-2xl font-mono font-bold text-primary">
                        {selectedAppointment.ticketNumber}
                      </code>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Patient Name</p>
                      <p className="font-medium">{selectedAppointment.firstName} {selectedAppointment.lastName}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedAppointment.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedAppointment.email || "Not provided"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date & Time</p>
                      <p className="font-medium">
                        {new Date(selectedAppointment.scheduledDate).toLocaleDateString()} at {selectedAppointment.scheduledTime}
                      </p>
                    </div>
                  </div>
                  {selectedAppointment.address && (
                    <div className="flex items-start gap-2 md:col-span-2">
                      <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Address</p>
                        <p className="font-medium">{selectedAppointment.address}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Vaccine Type</p>
                    <p className="font-medium">{selectedAppointment.fluShotType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Patient Type</p>
                    <Badge variant={selectedAppointment.isExistingPatient ? "default" : "secondary"}>
                      {selectedAppointment.isExistingPatient ? "Existing Patient" : "New Patient"}
                    </Badge>
                  </div>
                </div>

                {selectedAppointment.insuranceProvider && (
                  <div>
                    <p className="text-sm text-muted-foreground">Insurance</p>
                    <p className="font-medium">
                      {selectedAppointment.insuranceProvider}
                      {selectedAppointment.insurancePolicyNumber && ` - ${selectedAppointment.insurancePolicyNumber}`}
                    </p>
                  </div>
                )}

                {selectedAppointment.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Notes</p>
                    <div className="bg-muted p-4 rounded-md">
                      <p className="whitespace-pre-wrap">{selectedAppointment.notes}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Update Status</p>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                Close
              </Button>
              <Button
                onClick={handleUpdateStatus}
                disabled={updateStatusMutation.isPending}
                data-testid="button-update-status"
              >
                {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
