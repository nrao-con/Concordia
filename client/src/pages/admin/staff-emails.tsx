import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Mail, Loader2, UserCheck, UserX, Shield } from "lucide-react";
import { format } from "date-fns";
import type { StaffEmail } from "@shared/schema";

type StaffRole = "staff" | "manager" | "pharmacist" | "technician" | "admin";

const roleLabels: Record<StaffRole, string> = {
  staff: "Staff",
  manager: "Manager",
  pharmacist: "Pharmacist",
  technician: "Technician",
  admin: "Admin",
};

const roleBadgeVariants: Record<StaffRole, "default" | "secondary" | "outline"> = {
  staff: "outline",
  manager: "secondary",
  pharmacist: "secondary",
  technician: "outline",
  admin: "default",
};

export default function StaffEmails() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffEmail | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "staff" as StaffRole,
    isActive: true,
  });

  const { data: staffList, isLoading, isError } = useQuery<StaffEmail[]>({
    queryKey: ["/api/admin/staff-emails"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/admin/staff-emails", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-emails"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: "Directory entry added",
        description: "This does not grant sign-in access",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add staff member",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<StaffEmail> & { id: number }) => {
      const response = await apiRequest("PATCH", `/api/admin/staff-emails/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-emails"] });
      setEditingStaff(null);
      resetForm();
      toast({
        title: "Staff Updated",
        description: "Staff member information updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update staff member",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/staff-emails/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-emails"] });
      toast({
        title: "Directory entry removed",
        description: "This does not revoke sign-in access",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove staff member",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      email: "",
      firstName: "",
      lastName: "",
      role: "staff",
      isActive: true,
    });
  };

  const handleEditClick = (staff: StaffEmail) => {
    setEditingStaff(staff);
    setFormData({
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role as StaffRole,
      isActive: staff.isActive,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    updateMutation.mutate({
      id: editingStaff.id,
      ...formData,
    });
  };

  const handleToggleActive = (staff: StaffEmail) => {
    updateMutation.mutate({
      id: staff.id,
      isActive: !staff.isActive,
    });
  };

  return (
    <AdminLayout title="Staff Contact Directory" backTo="/admin">
    <div className="space-y-6 p-6">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>This list does not control account access</AlertTitle>
        <AlertDescription>
          Staff sign in through Clerk. Adding, disabling, changing a role, or removing a contact here does not grant or revoke website, ConcordiaCare, or staff-app access. Do not use this list to remove someone&apos;s access.
        </AlertDescription>
      </Alert>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            Keep staff contact details for the pharmacy. This is not a sign-in or permissions list.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-staff">
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAddSubmit}>
              <DialogHeader>
                <DialogTitle>Add Staff Contact</DialogTitle>
                <DialogDescription>
                  Add a staff contact. This does not create a sign-in account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData((f) => ({ ...f, firstName: e.target.value }))}
                      required
                      data-testid="input-staff-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData((f) => ({ ...f, lastName: e.target.value }))}
                      required
                      data-testid="input-staff-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                    required
                    data-testid="input-staff-email-form"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData((f) => ({ ...f, role: v as StaffRole }))}
                  >
                    <SelectTrigger data-testid="select-staff-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="technician">Technician</SelectItem>
                      <SelectItem value="pharmacist">Pharmacist</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="isActive">Active</Label>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(v) => setFormData((f) => ({ ...f, isActive: v }))}
                    data-testid="switch-staff-active"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-add-staff">
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Staff"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Contacts</CardTitle>
          <CardDescription>
            {staffList?.length || 0} contact{staffList?.length !== 1 ? "s" : ""} listed. Directory status is not account access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive" role="alert">
              Could not load staff contacts. Refresh the page and try again.
            </div>
          ) : staffList && staffList.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Directory role (not access)</TableHead>
                  <TableHead>Directory status</TableHead>
                  <TableHead>Legacy OTP login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map((staff) => (
                  <TableRow key={staff.id} data-testid={`row-staff-${staff.id}`}>
                    <TableCell className="font-medium">
                      {staff.firstName} {staff.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {staff.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariants[staff.role as StaffRole]}>
                        {roleLabels[staff.role as StaffRole] || staff.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(staff)}
                        className="gap-1"
                        data-testid={`button-toggle-active-${staff.id}`}
                      >
                        {staff.isActive ? (
                          <>
                            <UserCheck className="h-4 w-4 text-green-600" />
                            <span className="text-green-600">Listed</span>
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Unlisted</span>
                          </>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {staff.lastLoginAt
                        ? format(new Date(staff.lastLoginAt), "MMM d, yyyy h:mm a")
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(staff)}
                          data-testid={`button-edit-staff-${staff.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(staff.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-staff-${staff.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No staff members registered yet</p>
              <p className="text-sm">Add a staff contact to the directory</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingStaff} onOpenChange={(open) => !open && setEditingStaff(null)}>
        <DialogContent>
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Staff Member</DialogTitle>
              <DialogDescription>Update staff member information</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">First Name</Label>
                  <Input
                    id="edit-firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData((f) => ({ ...f, firstName: e.target.value }))}
                    required
                    data-testid="input-edit-staff-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastName">Last Name</Label>
                  <Input
                    id="edit-lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData((f) => ({ ...f, lastName: e.target.value }))}
                    required
                    data-testid="input-edit-staff-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email Address</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  required
                  data-testid="input-edit-staff-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData((f) => ({ ...f, role: v as StaffRole }))}
                >
                  <SelectTrigger data-testid="select-edit-staff-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="pharmacist">Pharmacist</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-isActive">Listed in directory</Label>
                <Switch
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(v) => setFormData((f) => ({ ...f, isActive: v }))}
                  data-testid="switch-edit-staff-active"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingStaff(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit-staff">
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
