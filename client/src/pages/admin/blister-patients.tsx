import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { BlisterPackPatient } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { formatPhoneNumber, formatZipCode, formatDateInput } from "@/lib/input-helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Users, 
  Pill, 
  Calendar, 
  Eye, 
  Phone, 
  MapPin, 
  AlertCircle, 
  Save, 
  X, 
  Plus,
  Clock,
  Package,
  UserPlus,
  Activity,
  Stethoscope,
  CreditCard,
  FileText,
  Truck,
  Trash2,
  Bell,
  Send,
  MessageSquare,
  CheckCircle,
  RefreshCw
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

type MedicationEntry = {
  name: string;
  dosage: string;
  frequency: string;
  intakeTimes: string[];
  instructions?: string;
  startDate?: string;
  endDate?: string;
  prescriberId?: string;
  isActive: boolean;
  autoSuggestedIntakeTimes?: string[];
  sigAutoParsed?: boolean;
};

export default function AdminBlisterPatients() {
  // Real-time updates via WebSocket
  useAdminWebSocket();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPatient, setSelectedPatient] = useState<BlisterPackPatient | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<BlisterPackPatient>>({});
  const [newPatientData, setNewPatientData] = useState<Partial<BlisterPackPatient>>({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    status: "pending",
    blisterPackType: "weekly",
  });
  const [newMedication, setNewMedication] = useState<MedicationEntry>({
    name: "",
    dosage: "",
    frequency: "",
    intakeTimes: ["morning"],
    isActive: true,
  });
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [notifyData, setNotifyData] = useState({
    type: "blister_ready" as string,
    subject: "",
    message: "",
  });
  const { toast } = useToast();

  const { data: patients = [], isLoading } = useQuery<BlisterPackPatient[]>({
    queryKey: ["/api/admin/blister-patients"],
    refetchInterval: 15000, // Fallback polling every 15 seconds for real-time updates
  });

  const createPatientMutation = useMutation({
    mutationFn: async (data: Partial<BlisterPackPatient>) => {
      const response = await apiRequest("POST", "/api/admin/blister-patients", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Patient created",
        description: "New blister pack patient has been added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blister-patients"] });
      setCreateDialogOpen(false);
      setNewPatientData({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        status: "pending",
        blisterPackType: "weekly",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create patient",
        variant: "destructive",
      });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: Partial<BlisterPackPatient>) => {
      if (!selectedPatient?.id) throw new Error("No patient selected");
      const response = await apiRequest("PATCH", `/api/admin/blister-patients/${selectedPatient.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Patient updated",
        description: "Patient information has been saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blister-patients"] });
      setProfileDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update patient",
        variant: "destructive",
      });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/blister-patients/${id}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Patient deleted",
        description: "The patient has been removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blister-patients"] });
      setDeleteConfirmOpen(false);
      setProfileDialogOpen(false);
      setSelectedPatient(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete patient",
        variant: "destructive",
      });
    },
  });

  const syncToAppMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const response = await apiRequest("POST", `/api/admin/blister-patients/${patientId}/sync-to-app`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.pending ? "Sync queued" : "Synced to ConcordiaCare",
        description: data.message || (data.pending ? "The app will retry delivery." : "Patient data sent to the app"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blister-patients"] });
    },
    onError: (error: any) => {
      let description = error.message || "Could not sync patient to the app";
      try {
        const response = JSON.parse(description.replace(/^\d+:\s*/, ""));
        description = response.message || description;
      } catch {
        // Keep the original error for network and non-JSON failures.
      }
      toast({
        title: "Sync failed",
        description,
        variant: "destructive",
      });
    },
  });

  const notifyPatientMutation = useMutation({
    mutationFn: async (data: { patientId: number; type: string; subject: string; message: string }) => {
      const response = await apiRequest("POST", `/api/admin/blister-patients/${data.patientId}/notify`, {
        type: data.type,
        subject: data.subject,
        message: data.message,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Notification sent",
        description: "The patient has been notified successfully",
      });
      setNotifyDialogOpen(false);
      setNotifyData({ type: "blister_ready", subject: "", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
      });
    },
  });

  const filteredPatients = patients.filter((patient) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      patient.firstName?.toLowerCase().includes(search) ||
      patient.lastName?.toLowerCase().includes(search) ||
      patient.phoneNumber?.includes(search) ||
      patient.email?.toLowerCase().includes(search);
    
    const matchesStatus = statusFilter === "all" || patient.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: patients.length,
    active: patients.filter(p => p.status === "active").length,
    pending: patients.filter(p => p.status === "pending").length,
    onHold: patients.filter(p => p.status === "on_hold").length,
    discontinued: patients.filter(p => p.status === "discontinued").length,
  };

  const handleOpenProfile = (patient: BlisterPackPatient) => {
    setSelectedPatient(patient);
    setEditData({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      email: patient.email || "",
      phoneNumber: patient.phoneNumber || "",
      alternatePhone: patient.alternatePhone || "",
      dateOfBirth: patient.dateOfBirth || "",
      age: patient.age || undefined,
      gender: patient.gender || "",
      address: patient.address || "",
      city: patient.city || "",
      state: patient.state || "",
      zipCode: patient.zipCode || "",
      insuranceProvider: patient.insuranceProvider || "",
      insurancePolicyNumber: patient.insurancePolicyNumber || "",
      insuranceGroupNumber: patient.insuranceGroupNumber || "",
      insurancePhone: patient.insurancePhone || "",
      primaryDoctor: patient.primaryDoctor || "",
      doctorPhone: patient.doctorPhone || "",
      doctorFax: patient.doctorFax || "",
      allergies: patient.allergies || "",
      medicalConditions: patient.medicalConditions || "",
      blisterPackType: patient.blisterPackType || "weekly",
      status: patient.status || "pending",
      medications: patient.medications || [],
      deliveryDay: patient.deliveryDay || "",
      deliveryTime: patient.deliveryTime || "",
      deliveryPreference: patient.deliveryPreference || "",
      morningTime: patient.morningTime || "",
      noonTime: patient.noonTime || "",
      eveningTime: patient.eveningTime || "",
      bedtimeTime: patient.bedtimeTime || "",
      preferences: patient.preferences || "",
      languagePreference: patient.languagePreference || "",
      specialInstructions: patient.specialInstructions || "",
      emergencyContactName: patient.emergencyContactName || "",
      emergencyContactPhone: patient.emergencyContactPhone || "",
      emergencyContactRelation: patient.emergencyContactRelation || "",
      adminNotes: patient.adminNotes || "",
    });
    setProfileDialogOpen(true);
  };

  const handleSave = () => {
    updatePatientMutation.mutate(editData);
  };

  const handleAddMedication = () => {
    if (!newMedication.name || !newMedication.dosage) return;
    const currentMeds = (editData.medications as MedicationEntry[] | undefined) || [];
    setEditData({
      ...editData,
      medications: [...currentMeds, newMedication],
    });
    setNewMedication({ name: "", dosage: "", frequency: "", intakeTimes: ["morning"], isActive: true });
  };

  const handleRemoveMedication = (index: number) => {
    const currentMeds = (editData.medications as MedicationEntry[] | undefined) || [];
    setEditData({
      ...editData,
      medications: currentMeds.filter((_, i) => i !== index),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>;
      case "on_hold":
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">On Hold</Badge>;
      case "discontinued":
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Discontinued</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getBlisterTypeBadge = (type: string) => {
    switch (type) {
      case "weekly":
        return <Badge variant="outline">Weekly</Badge>;
      case "bi_weekly":
        return <Badge variant="outline">Bi-Weekly</Badge>;
      case "monthly":
        return <Badge variant="outline">Monthly</Badge>;
      case "multi_dose":
        return <Badge variant="outline">Multi-Dose</Badge>;
      case "unit_dose":
        return <Badge variant="outline">Unit-Dose</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 font-heading text-3xl font-bold">Blister Pack Patients</h1>
            <p className="text-muted-foreground">
              Manage blister pack enrollments and patient profiles
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-patient">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Patient
          </Button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
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
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-active-patients">
                {isLoading ? "..." : stats.active}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-pending-patients">
                {isLoading ? "..." : stats.pending}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Hold</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="stat-onhold-patients">
                {isLoading ? "..." : stats.onHold}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Patient Directory</CardTitle>
            <CardDescription>Search and manage blister pack patients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, or email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-patients"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Package className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No patients found</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Pack Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next Pack</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((patient) => (
                      <TableRow key={patient.id} data-testid={`row-patient-${patient.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {patient.firstName} {patient.lastName}
                            </div>
                            {patient.dateOfBirth && (
                              <div className="text-sm text-muted-foreground">
                                DOB: {patient.dateOfBirth}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />
                              {patient.phoneNumber}
                            </div>
                            {patient.email && (
                              <div className="text-sm text-muted-foreground">{patient.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getBlisterTypeBadge(patient.blisterPackType || "weekly")}</TableCell>
                        <TableCell>{getStatusBadge(patient.status || "pending")}</TableCell>
                        <TableCell>
                          {patient.nextPackDate ? (
                            format(new Date(patient.nextPackDate), "MMM d, yyyy")
                          ) : (
                            <span className="text-muted-foreground">Not scheduled</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenProfile(patient)}
                            data-testid={`button-view-patient-${patient.id}`}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Patient Profile: {selectedPatient?.firstName} {selectedPatient?.lastName}
              </DialogTitle>
              <DialogDescription>
                View and edit blister pack patient information
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="sticky top-0 z-50 grid w-full grid-cols-5 bg-background">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="medical">Medical</TabsTrigger>
                <TabsTrigger value="medications">Medications</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

                <TabsContent value="personal" className="space-y-4 mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>First Name</Label>
                      <Input
                        value={editData.firstName || ""}
                        onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <Label>Last Name</Label>
                      <Input
                        value={editData.lastName || ""}
                        onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                        data-testid="input-last-name"
                      />
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input
                        value={editData.phoneNumber || ""}
                        onChange={(e) => setEditData({ ...editData, phoneNumber: formatPhoneNumber(e.target.value) })}
                        placeholder="10-digit phone number"
                        maxLength={10}
                        inputMode="numeric"
                        data-testid="input-phone"
                      />
                    </div>
                    <div>
                      <Label>Alternate Phone</Label>
                      <Input
                        value={editData.alternatePhone || ""}
                        onChange={(e) => setEditData({ ...editData, alternatePhone: formatPhoneNumber(e.target.value) })}
                        placeholder="10-digit phone number"
                        maxLength={10}
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        data-testid="input-email"
                      />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <Input
                        value={editData.dateOfBirth || ""}
                        onChange={(e) => setEditData({ ...editData, dateOfBirth: formatDateInput(e.target.value) })}
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        data-testid="input-dob"
                      />
                    </div>
                    <div>
                      <Label>Age</Label>
                      <Input
                        type="number"
                        value={editData.age || ""}
                        onChange={(e) => setEditData({ ...editData, age: parseInt(e.target.value) || undefined })}
                      />
                    </div>
                    <div>
                      <Label>Gender</Label>
                      <Select
                        value={editData.gender || ""}
                        onValueChange={(value) => setEditData({ ...editData, gender: value })}
                      >
                        <SelectTrigger data-testid="select-gender">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Language Preference</Label>
                      <Select
                        value={editData.languagePreference || ""}
                        onValueChange={(value) => setEditData({ ...editData, languagePreference: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value="spanish">Spanish</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Address Information
                    </h4>
                    <div>
                      <Label>Street Address</Label>
                      <Input
                        value={editData.address || ""}
                        onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                        data-testid="input-address"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>City</Label>
                        <Input
                          value={editData.city || ""}
                          onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={editData.state || ""}
                          onChange={(e) => setEditData({ ...editData, state: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>ZIP Code</Label>
                        <Input
                          value={editData.zipCode || ""}
                          onChange={(e) => setEditData({ ...editData, zipCode: formatZipCode(e.target.value) })}
                          placeholder="12345"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Emergency Contact
                    </h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={editData.emergencyContactName || ""}
                          onChange={(e) => setEditData({ ...editData, emergencyContactName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Contact Phone</Label>
                        <Input
                          value={editData.emergencyContactPhone || ""}
                          onChange={(e) => setEditData({ ...editData, emergencyContactPhone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Relationship</Label>
                        <Input
                          value={editData.emergencyContactRelation || ""}
                          onChange={(e) => setEditData({ ...editData, emergencyContactRelation: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="medical" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Doctor Information
                    </h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Primary Doctor</Label>
                        <Input
                          value={editData.primaryDoctor || ""}
                          onChange={(e) => setEditData({ ...editData, primaryDoctor: e.target.value })}
                          data-testid="input-doctor"
                        />
                      </div>
                      <div>
                        <Label>Doctor Phone</Label>
                        <Input
                          value={editData.doctorPhone || ""}
                          onChange={(e) => setEditData({ ...editData, doctorPhone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Doctor Fax</Label>
                        <Input
                          value={editData.doctorFax || ""}
                          onChange={(e) => setEditData({ ...editData, doctorFax: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Insurance Information
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Insurance Provider</Label>
                        <Input
                          value={editData.insuranceProvider || ""}
                          onChange={(e) => setEditData({ ...editData, insuranceProvider: e.target.value })}
                          data-testid="input-insurance"
                        />
                      </div>
                      <div>
                        <Label>Policy Number</Label>
                        <Input
                          value={editData.insurancePolicyNumber || ""}
                          onChange={(e) => setEditData({ ...editData, insurancePolicyNumber: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Group Number</Label>
                        <Input
                          value={editData.insuranceGroupNumber || ""}
                          onChange={(e) => setEditData({ ...editData, insuranceGroupNumber: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Insurance Phone</Label>
                        <Input
                          value={editData.insurancePhone || ""}
                          onChange={(e) => setEditData({ ...editData, insurancePhone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Medical Conditions
                    </h4>
                    <div>
                      <Label>Allergies</Label>
                      <Textarea
                        value={editData.allergies || ""}
                        onChange={(e) => setEditData({ ...editData, allergies: e.target.value })}
                        placeholder="List any known allergies..."
                        data-testid="input-allergies"
                      />
                    </div>
                    <div>
                      <Label>Medical Conditions</Label>
                      <Textarea
                        value={editData.medicalConditions || ""}
                        onChange={(e) => setEditData({ ...editData, medicalConditions: e.target.value })}
                        placeholder="List any medical conditions..."
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="medications" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium flex items-center gap-2">
                        <Pill className="h-4 w-4" />
                        Current Medications
                      </h4>
                      <div className="flex gap-2">
                        <Select
                          value={editData.blisterPackType || "weekly"}
                          onValueChange={(value) => setEditData({ ...editData, blisterPackType: value as any })}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly Pack</SelectItem>
                            <SelectItem value="bi_weekly">Bi-Weekly Pack</SelectItem>
                            <SelectItem value="monthly">Monthly Pack</SelectItem>
                            <SelectItem value="multi_dose">Multi-Dose</SelectItem>
                            <SelectItem value="unit_dose">Unit-Dose</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={editData.status || "pending"}
                          onValueChange={(value) => setEditData({ ...editData, status: value as any })}
                        >
                          <SelectTrigger className="w-[140px]" data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="on_hold">On Hold</SelectItem>
                            <SelectItem value="discontinued">Discontinued</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Add New Medication</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-5">
                          <Input
                            placeholder="Medication name"
                            value={newMedication.name}
                            onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                            data-testid="input-med-name"
                          />
                          <Input
                            placeholder="Dosage (e.g., 10mg)"
                            value={newMedication.dosage}
                            onChange={(e) => setNewMedication({ ...newMedication, dosage: e.target.value })}
                            data-testid="input-med-dosage"
                          />
                          <Input
                            placeholder="Frequency (e.g., daily)"
                            value={newMedication.frequency}
                            onChange={(e) => setNewMedication({ ...newMedication, frequency: e.target.value })}
                          />
                          <Select
                            value={newMedication.intakeTimes[0] || "morning"}
                            onValueChange={(value) => setNewMedication({ ...newMedication, intakeTimes: [value] })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Time" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="morning">Morning</SelectItem>
                              <SelectItem value="noon">Noon</SelectItem>
                              <SelectItem value="evening">Evening</SelectItem>
                              <SelectItem value="bedtime">Bedtime</SelectItem>
                              <SelectItem value="as_needed">As Needed</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button onClick={handleAddMedication} data-testid="button-add-medication">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Medication</TableHead>
                            <TableHead>Dosage</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Schedule</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {((editData.medications as MedicationEntry[] | undefined) || []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No medications added yet
                              </TableCell>
                            </TableRow>
                          ) : (
                            ((editData.medications as MedicationEntry[] | undefined) || []).map((med, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">{med.name}</TableCell>
                                <TableCell>{med.dosage}</TableCell>
                                <TableCell>{med.frequency}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap gap-1">
                                      {med.intakeTimes?.map((time, i) => (
                                        <Badge key={i} variant="outline" className="capitalize">{time}</Badge>
                                      ))}
                                    </div>
                                    {med.sigAutoParsed && (
                                      <div className="flex items-center gap-1 flex-wrap" data-testid={`sig-auto-parsed-${index}`}>
                                        <Badge variant="secondary" className="text-xs gap-1">
                                          <CheckCircle className="h-3 w-3 text-green-500" />
                                          SIG auto-parsed
                                        </Badge>
                                        {med.autoSuggestedIntakeTimes && med.autoSuggestedIntakeTimes.length > 0 && (
                                          <span className="text-xs text-muted-foreground">
                                            Suggested: {med.autoSuggestedIntakeTimes.join(", ")}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveMedication(index)}
                                    data-testid={`button-remove-med-${index}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="schedule" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Intake Schedule Times
                    </h4>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <Label>Morning Time</Label>
                        <Input
                          placeholder="e.g., 8:00 AM"
                          value={editData.morningTime || ""}
                          onChange={(e) => setEditData({ ...editData, morningTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Noon Time</Label>
                        <Input
                          placeholder="e.g., 12:00 PM"
                          value={editData.noonTime || ""}
                          onChange={(e) => setEditData({ ...editData, noonTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Evening Time</Label>
                        <Input
                          placeholder="e.g., 6:00 PM"
                          value={editData.eveningTime || ""}
                          onChange={(e) => setEditData({ ...editData, eveningTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Bedtime</Label>
                        <Input
                          placeholder="e.g., 10:00 PM"
                          value={editData.bedtimeTime || ""}
                          onChange={(e) => setEditData({ ...editData, bedtimeTime: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Delivery Preferences
                    </h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Delivery Day</Label>
                        <Select
                          value={editData.deliveryDay || ""}
                          onValueChange={(value) => setEditData({ ...editData, deliveryDay: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monday">Monday</SelectItem>
                            <SelectItem value="tuesday">Tuesday</SelectItem>
                            <SelectItem value="wednesday">Wednesday</SelectItem>
                            <SelectItem value="thursday">Thursday</SelectItem>
                            <SelectItem value="friday">Friday</SelectItem>
                            <SelectItem value="saturday">Saturday</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Delivery Time</Label>
                        <Select
                          value={editData.deliveryTime || ""}
                          onValueChange={(value) => setEditData({ ...editData, deliveryTime: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select time" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="morning">Morning (9-12)</SelectItem>
                            <SelectItem value="afternoon">Afternoon (12-5)</SelectItem>
                            <SelectItem value="evening">Evening (5-8)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Delivery Method</Label>
                        <Select
                          value={editData.deliveryPreference || ""}
                          onValueChange={(value) => setEditData({ ...editData, deliveryPreference: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="delivery">Home Delivery</SelectItem>
                            <SelectItem value="pickup">Pickup</SelectItem>
                            <SelectItem value="mail">Mail</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label>Special Instructions</Label>
                    <Textarea
                      value={editData.specialInstructions || ""}
                      onChange={(e) => setEditData({ ...editData, specialInstructions: e.target.value })}
                      placeholder="Any special delivery or handling instructions..."
                    />
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Admin Notes
                    </h4>
                    <Textarea
                      value={editData.adminNotes || ""}
                      onChange={(e) => setEditData({ ...editData, adminNotes: e.target.value })}
                      placeholder="Add notes about this patient..."
                      className="min-h-[200px]"
                      data-testid="input-admin-notes"
                    />
                    <p className="text-sm text-muted-foreground">
                      These notes are only visible to pharmacy staff.
                    </p>
                  </div>

                  <Separator />

                  <div>
                    <Label>Patient Preferences</Label>
                    <Textarea
                      value={editData.preferences || ""}
                      onChange={(e) => setEditData({ ...editData, preferences: e.target.value })}
                      placeholder="Patient preferences and requests..."
                    />
                  </div>
                </TabsContent>
            </Tabs>

            <div className="sticky bottom-0 z-50 bg-background flex justify-between pt-4 border-t mt-4">
              <Button
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                data-testid="button-delete-patient"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Patient
              </Button>
              <Button
                variant="outline"
                className="border-primary text-primary hover-elevate"
                onClick={() => setNotifyDialogOpen(true)}
                data-testid="button-notify-patient"
              >
                <Bell className="mr-2 h-4 w-4" />
                Ring / Notify
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedPatient && syncToAppMutation.mutate(selectedPatient.id)}
                disabled={syncToAppMutation.isPending}
                data-testid="button-sync-to-app"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncToAppMutation.isPending ? "animate-spin" : ""}`} />
                {syncToAppMutation.isPending ? "Syncing..." : "Sync to App"}
              </Button>
              {selectedPatient && !(patients.find((p) => p.id === selectedPatient.id) || selectedPatient).concordiaCareBlisterPackId && (
                <span className="text-xs text-muted-foreground">Not synced to app</span>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={updatePatientMutation.isPending}
                  data-testid="button-save-patient"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updatePatientMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Blister Pack Patient
              </DialogTitle>
              <DialogDescription>
                Create a new patient profile for blister pack service
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 overflow-y-auto flex-1 pr-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>First Name *</Label>
                  <Input
                    value={newPatientData.firstName || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, firstName: e.target.value })}
                    data-testid="input-new-first-name"
                  />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input
                    value={newPatientData.lastName || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, lastName: e.target.value })}
                    data-testid="input-new-last-name"
                  />
                </div>
                <div>
                  <Label>Phone Number *</Label>
                  <Input
                    value={newPatientData.phoneNumber || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, phoneNumber: formatPhoneNumber(e.target.value) })}
                    placeholder="10-digit phone number"
                    maxLength={10}
                    inputMode="numeric"
                    data-testid="input-new-phone"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newPatientData.email || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    value={newPatientData.dateOfBirth || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, dateOfBirth: formatDateInput(e.target.value) })}
                    placeholder="MM/DD/YYYY"
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select
                    value={newPatientData.gender || ""}
                    onValueChange={(value) => setNewPatientData({ ...newPatientData, gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Blister Pack Type</Label>
                  <Select
                    value={newPatientData.blisterPackType || "weekly"}
                    onValueChange={(value) => setNewPatientData({ ...newPatientData, blisterPackType: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="multi_dose">Multi-Dose</SelectItem>
                      <SelectItem value="unit_dose">Unit-Dose</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={newPatientData.status || "pending"}
                    onValueChange={(value) => setNewPatientData({ ...newPatientData, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Address</Label>
                <Input
                  value={newPatientData.address || ""}
                  onChange={(e) => setNewPatientData({ ...newPatientData, address: e.target.value })}
                />
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>City</Label>
                  <Input
                    value={newPatientData.city || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={newPatientData.state || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, state: e.target.value })}
                  />
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  <Input
                    value={newPatientData.zipCode || ""}
                    onChange={(e) => setNewPatientData({ ...newPatientData, zipCode: formatZipCode(e.target.value) })}
                    placeholder="12345"
                    maxLength={5}
                  />
                </div>
              </div>

              <div>
                <Label>Primary Doctor</Label>
                <Input
                  value={newPatientData.primaryDoctor || ""}
                  onChange={(e) => setNewPatientData({ ...newPatientData, primaryDoctor: e.target.value })}
                />
              </div>

              <div>
                <Label>Allergies</Label>
                <Textarea
                  value={newPatientData.allergies || ""}
                  onChange={(e) => setNewPatientData({ ...newPatientData, allergies: e.target.value })}
                  placeholder="List any known allergies..."
                />
              </div>

              <div>
                <Label>Admin Notes</Label>
                <Textarea
                  value={newPatientData.adminNotes || ""}
                  onChange={(e) => setNewPatientData({ ...newPatientData, adminNotes: e.target.value })}
                  placeholder="Add notes about this patient..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 flex-shrink-0 border-t mt-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createPatientMutation.mutate(newPatientData)}
                disabled={!newPatientData.firstName?.trim() || !newPatientData.lastName?.trim() || (newPatientData.phoneNumber?.replace(/\D/g, "").length ?? 0) < 10 || createPatientMutation.isPending}
                data-testid="button-create-new-patient"
              >
                {createPatientMutation.isPending ? "Creating..." : "Create Patient"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Patient</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedPatient?.firstName} {selectedPatient?.lastName}? 
                This action cannot be undone and will remove all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedPatient && deletePatientMutation.mutate(selectedPatient.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deletePatientMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Notify Patient Dialog */}
        <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Send Notification
              </DialogTitle>
              <DialogDescription>
                Send a notification to {selectedPatient?.firstName} {selectedPatient?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="notifyType">Notification Type</Label>
                <Select
                  value={notifyData.type}
                  onValueChange={(value) => {
                    setNotifyData({ ...notifyData, type: value });
                    // Set default subjects based on type
                    const subjects: Record<string, string> = {
                      blister_ready: "Your Blister Pack is Ready",
                      blister_due_soon: "Blister Pack Due Soon",
                      new_prescription_required: "New Prescription Required",
                      no_more_refills: "No More Refills Available",
                      payment_reminder: "Payment Reminder",
                      general_update: "Pharmacy Update",
                    };
                    if (subjects[value]) {
                      setNotifyData((prev) => ({ ...prev, subject: subjects[value] }));
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-notify-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blister_ready">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Blister Pack Ready
                      </div>
                    </SelectItem>
                    <SelectItem value="blister_due_soon">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-500" />
                        Blister Due Soon
                      </div>
                    </SelectItem>
                    <SelectItem value="new_prescription_required">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        New Prescription Required
                      </div>
                    </SelectItem>
                    <SelectItem value="no_more_refills">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        No More Refills
                      </div>
                    </SelectItem>
                    <SelectItem value="payment_reminder">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-purple-500" />
                        Payment Reminder
                      </div>
                    </SelectItem>
                    <SelectItem value="general_update">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-gray-500" />
                        General Update
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notifySubject">Subject</Label>
                <Input
                  id="notifySubject"
                  value={notifyData.subject}
                  onChange={(e) => setNotifyData({ ...notifyData, subject: e.target.value })}
                  placeholder="Enter notification subject"
                  data-testid="input-notify-subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notifyMessage">Message</Label>
                <Textarea
                  id="notifyMessage"
                  value={notifyData.message}
                  onChange={(e) => setNotifyData({ ...notifyData, message: e.target.value })}
                  placeholder="Enter your message to the patient..."
                  rows={4}
                  data-testid="input-notify-message"
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Will be sent to: {selectedPatient?.phoneNumber || "No phone number"}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setNotifyDialogOpen(false)}
                data-testid="button-cancel-notify"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedPatient) {
                    notifyPatientMutation.mutate({
                      patientId: selectedPatient.id,
                      type: notifyData.type,
                      subject: notifyData.subject,
                      message: notifyData.message,
                    });
                  }
                }}
                disabled={!notifyData.message.trim() || notifyPatientMutation.isPending}
                data-testid="button-send-notify"
              >
                {notifyPatientMutation.isPending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Notification
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
