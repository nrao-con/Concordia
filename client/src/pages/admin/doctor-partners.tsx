import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DoctorPartner, InsertDoctorPartner } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Stethoscope, Trash2, Pencil, Loader2, Upload, X } from "lucide-react";

const SPECIALTIES = ["Family Medicine", "Internal Medicine", "Pediatrics", "Cardiology", "Geriatrics", "OB/GYN"];
const LANGUAGES = ["English", "Spanish", "Mandarin", "Russian", "Bengali", "Arabic"];
const TITLES = ["MD", "DO", "NP", "PA"];

interface PartnerForm extends Omit<InsertDoctorPartner, "languages"> {
  languagesCsv: string;
}

const emptyForm: PartnerForm = {
  firstName: "",
  lastName: "",
  title: "MD",
  specialty: "Family Medicine",
  languagesCsv: "English",
  gender: "any",
  address: "",
  phone: "",
  fax: "",
  email: "",
  bio: "",
  photoUrl: "",
  acceptingNewPatients: true,
  borough: "Manhattan",
  isActive: true,
};

const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

function partnerToForm(p: DoctorPartner): PartnerForm {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.title,
    specialty: p.specialty,
    languagesCsv: (p.languages || []).join(", "),
    gender: p.gender,
    address: p.address || "",
    phone: p.phone || "",
    fax: p.fax || "",
    email: p.email || "",
    bio: p.bio || "",
    photoUrl: p.photoUrl || "",
    acceptingNewPatients: p.acceptingNewPatients,
    borough: p.borough || "Manhattan",
    isActive: p.isActive,
  };
}

function formToPayload(f: PartnerForm): InsertDoctorPartner {
  const languages = f.languagesCsv.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    firstName: f.firstName,
    lastName: f.lastName,
    title: f.title,
    specialty: f.specialty,
    languages: languages.length > 0 ? languages : ["English"],
    gender: f.gender,
    address: f.address || null,
    phone: f.phone || null,
    fax: f.fax || null,
    email: f.email || null,
    bio: f.bio || null,
    photoUrl: f.photoUrl || null,
    acceptingNewPatients: f.acceptingNewPatients,
    borough: f.borough || "Manhattan",
    isActive: f.isActive,
  };
}

function PhotoUploadField({
  value,
  onChange,
  firstName,
  lastName,
}: {
  value: string;
  onChange: (v: string) => void;
  firstName: string;
  lastName: string;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const initials = `${(firstName || "?")[0]}${(lastName || "?")[0]}`.toUpperCase();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const res = await apiRequest("GET", "/api/upload/url");
      const { uploadUrl } = await res.json();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Upload failed");
      const normalizeRes = await apiRequest("POST", "/api/admin/doctor-partners/photo", { uploadUrl });
      const { photoUrl } = await normalizeRes.json();
      onChange(photoUrl);
      toast({ title: "Photo uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="p-photo">Photo</Label>
      <div className="flex items-start gap-4">
        <Avatar className="h-20 w-20 shrink-0">
          {value && <AvatarImage src={value} alt="Doctor headshot preview" data-testid="img-partner-photo-preview" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => document.getElementById("p-photo-file")?.click()}
              data-testid="button-partner-photo-upload"
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {value ? "Replace photo" : "Upload photo"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={isUploading}
                data-testid="button-partner-photo-clear"
              >
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
            <input
              id="p-photo-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              data-testid="input-partner-photo-file"
            />
          </div>
          <Input
            id="p-photo"
            data-testid="input-partner-photoUrl"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Or paste a photo URL (https://...)"
          />
        </div>
      </div>
    </div>
  );
}

function PartnerFormDialog({
  open,
  onOpenChange,
  partner,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partner: DoctorPartner | null;
  onSubmit: (data: InsertDoctorPartner) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<PartnerForm>(emptyForm);

  const handleOpen = (v: boolean) => {
    if (v) setForm(partner ? partnerToForm(partner) : emptyForm);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-partner-dialog-title">
            {partner ? "Edit Doctor Partner" : "Add Doctor Partner"}
          </DialogTitle>
          <DialogDescription>
            Doctor partners appear in the public Find Your Doctor quiz at /find-doctor.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(formToPayload(form));
          }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="p-firstName">First Name *</Label>
              <Input
                id="p-firstName"
                data-testid="input-partner-firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-lastName">Last Name *</Label>
              <Input
                id="p-lastName"
                data-testid="input-partner-lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Select value={form.title} onValueChange={(v) => setForm({ ...form, title: v })}>
                <SelectTrigger data-testid="select-partner-title"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Specialty *</Label>
              <Select value={form.specialty} onValueChange={(v) => setForm({ ...form, specialty: v })}>
                <SelectTrigger data-testid="select-partner-specialty"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger data-testid="select-partner-gender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="any">Any / Unspecified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-borough">Borough</Label>
              <Select value={form.borough} onValueChange={(v) => setForm({ ...form, borough: v })}>
                <SelectTrigger data-testid="select-partner-borough"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOROUGHS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-langs">Languages (comma-separated)</Label>
            <Input
              id="p-langs"
              data-testid="input-partner-languages"
              value={form.languagesCsv}
              onChange={(e) => setForm({ ...form, languagesCsv: e.target.value })}
              placeholder={`e.g. ${LANGUAGES.slice(0, 3).join(", ")}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="p-phone">Phone</Label>
              <Input id="p-phone" data-testid="input-partner-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-fax">Fax</Label>
              <Input id="p-fax" data-testid="input-partner-fax" value={form.fax || ""} onChange={(e) => setForm({ ...form, fax: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" type="email" data-testid="input-partner-email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-address">Address</Label>
            <Input id="p-address" data-testid="input-partner-address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <PhotoUploadField
            value={form.photoUrl || ""}
            onChange={(v) => setForm({ ...form, photoUrl: v })}
            firstName={form.firstName}
            lastName={form.lastName}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="p-bio">Bio</Label>
            <Textarea
              id="p-bio"
              data-testid="input-partner-bio"
              value={form.bio || ""}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="resize-none"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="p-accepting"
                checked={form.acceptingNewPatients}
                onCheckedChange={(v) => setForm({ ...form, acceptingNewPatients: v })}
                data-testid="switch-partner-accepting"
              />
              <Label htmlFor="p-accepting">Accepting new patients</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="p-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                data-testid="switch-partner-active"
              />
              <Label htmlFor="p-active">Active (visible publicly)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-partner-cancel">Cancel</Button>
            <Button type="submit" disabled={isPending || !form.firstName || !form.lastName} data-testid="button-partner-save">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {partner ? "Update" : "Add Partner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DoctorPartnersAdmin() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<DoctorPartner | null>(null);
  const [deleting, setDeleting] = useState<DoctorPartner | null>(null);

  const { data: partners = [], isLoading, isError } = useQuery<DoctorPartner[]>({
    queryKey: ["/api/admin/doctor-partners"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertDoctorPartner) => apiRequest("POST", "/api/admin/doctor-partners", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctor-partners"] });
      toast({ title: "Doctor partner added" });
      setIsAddOpen(false);
    },
    onError: (error: Error) => toast({ title: "Failed to add partner", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: InsertDoctorPartner }) =>
      apiRequest("PATCH", `/api/admin/doctor-partners/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctor-partners"] });
      toast({ title: "Doctor partner updated" });
      setEditing(null);
    },
    onError: (error: Error) => toast({ title: "Failed to update partner", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/doctor-partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/doctor-partners"] });
      toast({ title: "Doctor partner deleted" });
      setDeleting(null);
    },
    onError: (error: Error) => toast({ title: "Failed to delete partner", description: error.message, variant: "destructive" }),
  });

  return (
    <AdminLayout title="Doctor Partners" backTo="/admin">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-partner-count">
              {partners.length} partner{partners.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-partner">
            <Plus className="mr-2 h-4 w-4" />Add Doctor Partner
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : isError ? (
              <div className="p-12 text-center text-sm text-destructive" role="alert">
                Could not load doctor partners. Refresh the page and try again.
              </div>
            ) : partners.length === 0 ? (
              <div className="p-12 text-center" data-testid="text-empty-partners">
                <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No doctor partners yet. Add one to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Specialty</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Office Address</TableHead>
                      <TableHead>Languages</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow key={p.id} data-testid={`row-partner-${p.id}`}>
                        <TableCell>
                          <Avatar className="h-10 w-10">
                            {p.photoUrl && <AvatarImage src={p.photoUrl} alt={`Dr. ${p.lastName}`} data-testid={`img-partner-photo-${p.id}`} />}
                            <AvatarFallback>{`${p.firstName[0]}${p.lastName[0]}`.toUpperCase()}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-partner-name-${p.id}`}>
                          Dr. {p.firstName} {p.lastName}, {p.title}
                        </TableCell>
                        <TableCell data-testid={`text-partner-specialty-${p.id}`}>{p.specialty}</TableCell>
                        <TableCell data-testid={`text-partner-phone-${p.id}`}>{p.phone || "Not available"}</TableCell>
                        <TableCell className="max-w-xs truncate" data-testid={`text-partner-address-${p.id}`}>{p.address || "Not available"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(p.languages || []).map((l) => (
                              <Badge key={l} variant="secondary" data-testid={`badge-partner-lang-${p.id}-${l}`}>{l}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{p.gender}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={p.isActive ? "default" : "secondary"} data-testid={`badge-partner-active-${p.id}`}>
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {p.acceptingNewPatients && (
                              <Badge variant="outline" data-testid={`badge-partner-accepting-${p.id}`}>Accepting</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setEditing(p)} data-testid={`button-edit-partner-${p.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} data-testid={`button-delete-partner-${p.id}`}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PartnerFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        partner={null}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
      <PartnerFormDialog
        open={!!editing}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        partner={editing}
        onSubmit={(data) => editing && updateMutation.mutate({ id: editing.id, data })}
        isPending={updateMutation.isPending}
      />
      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete doctor partner?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes Dr. {deleting?.firstName} {deleting?.lastName} from the public Find Your Doctor quiz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-partner">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete-partner"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
