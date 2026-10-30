import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, authenticatedFetch, queryClient } from "@/lib/queryClient";
import type { PatientDoctor } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Upload, Download, Stethoscope, Trash2, Pencil, FileText, Loader2, XCircle } from "lucide-react";

interface DoctorFormData {
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string;
  fax: string;
  email: string;
  npi: string;
  address: string;
  notes: string;
}

const emptyForm: DoctorFormData = {
  firstName: "",
  lastName: "",
  specialty: "",
  phone: "",
  fax: "",
  email: "",
  npi: "",
  address: "",
  notes: "",
};

function DoctorFormDialog({
  open,
  onOpenChange,
  doctor,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor: PatientDoctor | null;
  onSubmit: (data: DoctorFormData) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<DoctorFormData>(emptyForm);

  const resetForm = (doc: PatientDoctor | null) => {
    if (doc) {
      setForm({
        firstName: doc.firstName,
        lastName: doc.lastName,
        specialty: doc.specialty || "",
        phone: doc.phone || "",
        fax: doc.fax || "",
        email: doc.email || "",
        npi: doc.npi || "",
        address: doc.address || "",
        notes: doc.notes || "",
      });
    } else {
      setForm(emptyForm);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (val) resetForm(doctor);
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-doctor-dialog-title">
            {doctor ? "Edit Doctor" : "Add Doctor"}
          </DialogTitle>
          <DialogDescription>
            {doctor ? "Update doctor information." : "Add a new doctor to the directory."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-firstName">First Name *</Label>
              <Input
                id="doctor-firstName"
                data-testid="input-doctor-firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-lastName">Last Name *</Label>
              <Input
                id="doctor-lastName"
                data-testid="input-doctor-lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doctor-specialty">Specialty</Label>
            <Input
              id="doctor-specialty"
              data-testid="input-doctor-specialty"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              placeholder="e.g. Cardiology, Family Medicine"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-phone">Phone</Label>
              <Input
                id="doctor-phone"
                data-testid="input-doctor-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-fax">Fax</Label>
              <Input
                id="doctor-fax"
                data-testid="input-doctor-fax"
                value={form.fax}
                onChange={(e) => setForm({ ...form, fax: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-email">Email</Label>
              <Input
                id="doctor-email"
                data-testid="input-doctor-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-npi">NPI</Label>
              <Input
                id="doctor-npi"
                data-testid="input-doctor-npi"
                value={form.npi}
                onChange={(e) => setForm({ ...form, npi: e.target.value })}
                placeholder="National Provider Identifier"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doctor-address">Address</Label>
            <Input
              id="doctor-address"
              data-testid="input-doctor-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doctor-notes">Notes</Label>
            <Textarea
              id="doctor-notes"
              data-testid="input-doctor-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="resize-none"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-doctor-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.firstName || !form.lastName}
              data-testid="button-doctor-save"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {doctor ? "Update" : "Add Doctor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DoctorDirectory() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<PatientDoctor | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientDoctor | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<PatientDoctor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: doctors = [], isLoading, isError } = useQuery<PatientDoctor[]>({
    queryKey: ["/api/admin/doctors", searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/admin/doctors?search=${encodeURIComponent(searchQuery)}`
        : "/api/admin/doctors";
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error("Failed to fetch doctors");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DoctorFormData) => {
      return await apiRequest("POST", "/api/admin/doctors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctors"] });
      toast({ title: "Doctor added successfully" });
      setIsAddOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add doctor", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: DoctorFormData }) => {
      return await apiRequest("PATCH", `/api/admin/doctors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctors"] });
      toast({ title: "Doctor updated successfully" });
      setIsEditOpen(false);
      setEditingDoctor(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update doctor", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/doctors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctors"] });
      toast({ title: "Doctor deactivated" });
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to deactivate doctor", description: error.message, variant: "destructive" });
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/doctors/${id}?permanent=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctors"] });
      toast({ title: "Doctor permanently deleted" });
      setHardDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete doctor", description: error.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authenticatedFetch("/api/admin/doctors/csv-import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const responseText = await res.text();
        let message = responseText || "Import failed";
        try {
          message = JSON.parse(responseText).message || message;
        } catch {
          // Keep the response text for non-JSON server errors.
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctors"] });
      toast({
        title: "Import Complete",
        description: data.message,
      });
      setIsImportOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleExport = async () => {
    try {
      const response = await authenticatedFetch("/api/admin/doctors/export");
      if (!response.ok) {
        const responseText = await response.text();
        let message = responseText || "Export failed";
        try {
          message = JSON.parse(responseText).message || message;
        } catch {
          // Keep the response text for non-JSON server errors.
        }
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "doctors_export.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not export doctors.",
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = () => {
    const template = `firstName,lastName,phone,specialty,fax,email,npi,address,notes
"John","Smith","(555) 123-4567","Family Medicine","(555) 123-4568","jsmith@example.com","1234567890","123 Medical Dr","Primary care physician"`;
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doctors_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRowClick = (doctor: PatientDoctor) => {
    setEditingDoctor(doctor);
    setIsEditOpen(true);
  };

  const activeDoctors = doctors.filter((d) => d.isActive);
  const inactiveDoctors = doctors.filter((d) => !d.isActive);

  return (
    <AdminLayout title="Doctor Directory" backTo="/admin">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground" data-testid="text-doctor-count">
                {activeDoctors.length} active doctor{activeDoctors.length !== 1 ? "s" : ""}
                {inactiveDoctors.length > 0 && ` / ${inactiveDoctors.length} inactive`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsImportOpen(true)}
              data-testid="button-import-csv"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              data-testid="button-export-csv"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-doctor">
              <Plus className="mr-2 h-4 w-4" />
              Add Doctor
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, specialty, or NPI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-doctor-search"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="p-12 text-center text-sm text-destructive" role="alert">
                Could not load the doctor directory. Refresh the page and try again.
              </div>
            ) : doctors.length === 0 ? (
              <div className="p-12 text-center" data-testid="text-empty-state">
                <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery
                    ? "No doctors found matching your search."
                    : "No doctors in the directory yet. Add one or import a CSV."}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Specialty</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Fax</TableHead>
                        <TableHead>NPI</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doctors.map((doctor) => (
                        <TableRow
                          key={doctor.id}
                          className="cursor-pointer"
                          onClick={() => handleRowClick(doctor)}
                          data-testid={`row-doctor-${doctor.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-doctor-name-${doctor.id}`}>
                            Dr. {doctor.firstName} {doctor.lastName}
                          </TableCell>
                          <TableCell data-testid={`text-doctor-specialty-${doctor.id}`}>
                            {doctor.specialty || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell data-testid={`text-doctor-phone-${doctor.id}`}>
                            {doctor.phone || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell data-testid={`text-doctor-fax-${doctor.id}`}>
                            {doctor.fax || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell data-testid={`text-doctor-npi-${doctor.id}`}>
                            {doctor.npi || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={doctor.isActive ? "default" : "secondary"}
                              data-testid={`badge-doctor-status-${doctor.id}`}
                            >
                              {doctor.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowClick(doctor);
                                }}
                                data-testid={`button-edit-doctor-${doctor.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {doctor.isActive && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(doctor);
                                  }}
                                  data-testid={`button-deactivate-doctor-${doctor.id}`}
                                >
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHardDeleteTarget(doctor);
                                }}
                                data-testid={`button-delete-doctor-${doctor.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 p-4 md:hidden">
                  {doctors.map((doctor) => (
                    <Card
                      key={doctor.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleRowClick(doctor)}
                      data-testid={`card-doctor-${doctor.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium">
                              Dr. {doctor.firstName} {doctor.lastName}
                            </h3>
                            {doctor.specialty && (
                              <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                            )}
                          </div>
                          <Badge variant={doctor.isActive ? "default" : "secondary"}>
                            {doctor.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                          {doctor.phone && <p>Phone: {doctor.phone}</p>}
                          {doctor.npi && <p>NPI: {doctor.npi}</p>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <DoctorFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        doctor={null}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      <DoctorFormDialog
        open={isEditOpen}
        onOpenChange={(val) => {
          setIsEditOpen(val);
          if (!val) setEditingDoctor(null);
        }}
        doctor={editingDoctor}
        onSubmit={(data) => {
          if (editingDoctor) {
            updateMutation.mutate({ id: editingDoctor.id, data });
          }
        }}
        isPending={updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(val) => !val && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-confirm-title">Deactivate Doctor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate Dr. {deleteTarget?.firstName} {deleteTarget?.lastName}?
              This will mark them as inactive but keep their records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hardDeleteTarget} onOpenChange={(val) => !val && setHardDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-hard-delete-confirm-title">Delete Doctor Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete Dr. {hardDeleteTarget?.firstName} {hardDeleteTarget?.lastName}?
              This action cannot be undone. All records for this doctor will be removed from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-hard-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => hardDeleteTarget && hardDeleteMutation.mutate(hardDeleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-hard-delete-confirm"
            >
              {hardDeleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-import-dialog-title">Import Doctors from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file with doctor information. Required columns: firstName, lastName, phone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template">
              <FileText className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="input-csv-file"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              data-testid="button-upload-csv"
            >
              {importMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {importMutation.isPending ? "Importing..." : "Upload CSV"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
