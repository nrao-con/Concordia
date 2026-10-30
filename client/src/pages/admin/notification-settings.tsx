import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, Loader2, Mail, MessageSquare, Bell } from "lucide-react";
import type { NotificationRecipient, NotificationSetting } from "@shared/schema";

const NOTIFICATION_TYPES = [
  {
    value: "doctor_intro_request",
    label: "Doctor intro requests",
    description:
      "Sent when a patient submits a doctor intro request from the public Find a Doctor flow.",
  },
  {
    value: "transfer_request",
    label: "Prescription transfer requests",
    description:
      "Sent when a patient submits a prescription transfer request from the website.",
  },
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number]["value"];

const CC_SETTING_KEY = "doctor_intro_cc_doctor_office";

type Channel = "email" | "sms";

const emptyForm = {
  channel: "email" as Channel,
  label: "",
  address: "",
  isActive: true,
};

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRecipient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [notificationType, setNotificationType] =
    useState<NotificationType>("doctor_intro_request");

  const activeType =
    NOTIFICATION_TYPES.find((t) => t.value === notificationType) ?? NOTIFICATION_TYPES[0];

  const { data: recipients, isLoading, isError: recipientsError } = useQuery<NotificationRecipient[]>({
    queryKey: ["/api/admin/notification-recipients", { type: notificationType }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/notification-recipients?type=${encodeURIComponent(notificationType)}`,
      );
      return res.json();
    },
  });

  const { data: ccSetting, isLoading: ccSettingLoading, isError: ccSettingError } = useQuery<NotificationSetting | null>({
    queryKey: ["/api/admin/notification-settings", CC_SETTING_KEY],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/notification-settings/${CC_SETTING_KEY}`);
      return res.json();
    },
  });

  const ccDoctorOffice = ccSetting?.settingValue === "true";

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await apiRequest("POST", "/api/admin/notification-recipients", {
        notificationType,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-recipients"] });
      setIsAddOpen(false);
      setForm(emptyForm);
      toast({ title: "Recipient added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<typeof emptyForm>) => {
      const res = await apiRequest("PATCH", `/api/admin/notification-recipients/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-recipients"] });
      setEditing(null);
      setForm(emptyForm);
      toast({ title: "Recipient updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/notification-recipients/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-recipients"] });
      toast({ title: "Recipient removed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const ccMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await apiRequest("PUT", `/api/admin/notification-settings/${CC_SETTING_KEY}`, {
        value: value ? "true" : "false",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-settings", CC_SETTING_KEY] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleEditClick = (r: NotificationRecipient) => {
    setEditing(r);
    setForm({
      channel: r.channel as Channel,
      label: r.label ?? "",
      address: r.address,
      isActive: r.isActive,
    });
  };

  return (
    <AdminLayout title="Notification Settings" backTo="/admin">
      <div className="space-y-6 p-6">
        <p className="text-muted-foreground">
          Choose who gets notified for each kind of patient-facing request submitted through the website.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Notification type</CardTitle>
            <CardDescription>{activeType.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={notificationType}
              onValueChange={(v) => setNotificationType(v as NotificationType)}
            >
              <SelectTrigger
                className="max-w-md"
                data-testid="select-notification-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {notificationType === "doctor_intro_request" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Doctor's office CC
              </CardTitle>
              <CardDescription>
                When enabled, the selected doctor's office is also notified for each new request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="cc-doctor-office" className="text-sm">
                  CC the chosen doctor's office on each request
                </Label>
                <Switch
                  id="cc-doctor-office"
                  checked={ccDoctorOffice}
                  onCheckedChange={(v) => ccMutation.mutate(v)}
                  disabled={ccMutation.isPending || ccSettingLoading || ccSettingError}
                  data-testid="switch-cc-doctor-office"
                />
              </div>
              {ccSettingError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  Could not load this notification setting. Refresh the page before changing it.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>{activeType.label} recipients</CardTitle>
                <CardDescription>
                  {recipients?.length || 0} recipient{recipients?.length !== 1 ? "s" : ""} configured
                </CardDescription>
              </div>
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-recipient">
                    <Plus className="mr-2 h-4 w-4" />
                    Add recipient
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createMutation.mutate(form);
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>Add notification recipient</DialogTitle>
                      <DialogDescription>
                        They'll be notified for every new {activeType.label.toLowerCase()}.
                      </DialogDescription>
                    </DialogHeader>
                    <RecipientFormFields form={form} setForm={setForm} idPrefix="add" />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsAddOpen(false);
                          setForm(emptyForm);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createMutation.isPending}
                        data-testid="button-submit-add-recipient"
                      >
                        {createMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          "Add recipient"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : recipientsError ? (
              <div className="py-8 text-center text-sm text-destructive" role="alert">
                Could not load notification recipients. Refresh the page and try again.
              </div>
            ) : recipients && recipients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.id} data-testid={`row-recipient-${r.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {r.channel === "email" ? (
                            <Mail className="h-3 w-3" />
                          ) : (
                            <MessageSquare className="h-3 w-3" />
                          )}
                          {r.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.label || "Not available"}</TableCell>
                      <TableCell data-testid={`text-address-${r.id}`}>{r.address}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.isActive}
                          onCheckedChange={(v) =>
                            updateMutation.mutate({ id: r.id, isActive: v })
                          }
                          disabled={updateMutation.isPending}
                          data-testid={`switch-active-${r.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClick(r)}
                            data-testid={`button-edit-recipient-${r.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(r.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-recipient-${r.id}`}
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
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No recipients configured yet</p>
                <p className="text-sm">
                  Falling back to <code>PHARMACY_TEAM_EMAIL</code> environment variable.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editing) return;
                updateMutation.mutate({ id: editing.id, ...form });
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit recipient</DialogTitle>
                <DialogDescription>Update notification recipient details.</DialogDescription>
              </DialogHeader>
              <RecipientFormFields form={form} setForm={setForm} idPrefix="edit" />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-submit-edit-recipient"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
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

function RecipientFormFields({
  form,
  setForm,
  idPrefix,
}: {
  form: typeof emptyForm;
  setForm: (updater: (f: typeof emptyForm) => typeof emptyForm) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-channel`}>Channel</Label>
        <Select
          value={form.channel}
          onValueChange={(v) => setForm((f) => ({ ...f, channel: v as Channel }))}
        >
          <SelectTrigger id={`${idPrefix}-channel`} data-testid={`select-channel-${idPrefix}`}>
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-label`}>Label (optional)</Label>
        <Input
          id={`${idPrefix}-label`}
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="e.g. Pharmacy team"
          data-testid={`input-label-${idPrefix}`}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address`}>
          {form.channel === "email" ? "Email address" : "Phone number"}
        </Label>
        <Input
          id={`${idPrefix}-address`}
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          required
          type={form.channel === "email" ? "email" : "tel"}
          placeholder={form.channel === "email" ? "team@pharmacy.com" : "+15551234567"}
          data-testid={`input-address-${idPrefix}`}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-active`}>Active</Label>
        <Switch
          id={`${idPrefix}-active`}
          checked={form.isActive}
          onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          data-testid={`switch-form-active-${idPrefix}`}
        />
      </div>
    </div>
  );
}
