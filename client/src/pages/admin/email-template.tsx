import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, RotateCcw, Eye, Send, Clock, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TestEmailLog {
  id: number;
  recipient: string;
  sentByEmail: string | null;
  sentAt: string;
}

interface EmailTemplate {
  subject: string;
  responseTime: string;
  footerNote: string;
  greeting: string;
}

const DEFAULTS: EmailTemplate = {
  subject: "Your ConcordiaCare doctor request was received",
  responseTime: "24 business hours",
  footerNote:
    "This is an automated confirmation from ConcordiaCare. Please do not reply to this email.",
  greeting: "Hi",
};

function buildPreviewHtml(subject: string, responseTime: string, footerNote: string, greeting: string): string {
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!);

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <div style="background:#f0f0f0;padding:10px 16px;border-radius:8px 8px 0 0;border:1px solid #ddd;border-bottom:none;">
        <span style="font-size:12px;color:#888;">Subject:&nbsp;</span><strong style="font-size:13px;color:#333;">${escapeHtml(subject)}</strong>
      </div>
      <div style="background:#1a6b5c;padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Your Doctor Request Was Received</h1>
      </div>
      <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none;">
        <p style="margin-top:0;">${escapeHtml(greeting)} Jane,</p>
        <p>Thank you for submitting your doctor introduction request through ConcordiaCare. We have received your information and our team will be in touch within <strong>${escapeHtml(responseTime)}</strong>.</p>
        <h2 style="font-size:16px;margin-bottom:8px;color:#1a6b5c;">Your Request Summary</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;width:40%;">Doctor</td>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">Dr. Sarah Chen</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Specialty</td>
            <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">Family Medicine</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;">Location</td>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">Brooklyn</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Preferred Schedule</td>
            <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">Morning · Monday, Wednesday</td>
          </tr>
        </table>
        <p style="margin-top:24px;">If you have any questions, please don't hesitate to contact us.</p>
        <p style="margin-bottom:0;color:#777;font-size:12px;">${escapeHtml(footerNote)}</p>
      </div>
    </div>
  `;
}

export default function EmailTemplatePage() {
  const { toast } = useToast();
  const [form, setForm] = useState<EmailTemplate>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testSource, setTestSource] = useState<"draft" | "saved">("draft");
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const { data: template, isLoading, isError: templateError } = useQuery<EmailTemplate>({
    queryKey: ["/api/admin/email-template"],
  });

  const { data: testLogs, isLoading: logsLoading, isError: logsError } = useQuery<TestEmailLog[]>({
    queryKey: ["/api/admin/email-template/test-logs"],
  });

  useEffect(() => {
    if (template) {
      setForm(template);
      setIsDirty(false);
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async (data: EmailTemplate) => {
      const res = await apiRequest("PUT", "/api/admin/email-template", data);
      return res.json() as Promise<EmailTemplate>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["/api/admin/email-template"], saved);
      setIsDirty(false);
      toast({ title: "Email template saved", description: "Changes will apply to all future confirmation emails." });
    },
    onError: (err: any) => {
      toast({ title: "Error saving template", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const source = testSource === "saved" ? (template ?? DEFAULTS) : form;
      const res = await apiRequest("POST", "/api/admin/email-template/test", {
        recipient: testRecipient.trim(),
        subject: source.subject || DEFAULTS.subject,
        responseTime: source.responseTime || DEFAULTS.responseTime,
        footerNote: source.footerNote || DEFAULTS.footerNote,
        greeting: source.greeting || DEFAULTS.greeting,
      });
      return res.json();
    },
    onSuccess: () => {
      setTestDialogOpen(false);
      setTestRecipient("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-template/test-logs"] });
      toast({ title: "Test email sent", description: `A preview email was sent to ${testRecipient.trim()}.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send test email", description: err.message, variant: "destructive" });
    },
  });

  const clearAllLogsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/admin/email-template/test-logs");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-template/test-logs"] });
      toast({ title: "History cleared", description: "All test email log entries have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to clear history", description: err.message, variant: "destructive" });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (id: number) => {
      setDeletingLogId(id);
      await apiRequest("DELETE", `/api/admin/email-template/test-logs/${id}`);
    },
    onSuccess: () => {
      setDeletingLogId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-template/test-logs"] });
    },
    onError: (err: any) => {
      setDeletingLogId(null);
      toast({ title: "Failed to delete log entry", description: err.message, variant: "destructive" });
    },
  });

  const handleChange = (field: keyof EmailTemplate, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setIsDirty(true);
  };

  const handleReset = () => {
    setForm(template ?? DEFAULTS);
    setIsDirty(false);
  };

  const handleSave = () => {
    if (!form.subject.trim() || !form.responseTime.trim() || !form.footerNote.trim() || !form.greeting.trim()) {
      toast({
        title: "Missing information",
        description: "Subject, response time, footer note, and greeting must all contain text.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(form);
  };

  const handleOpenTestDialog = () => {
    setTestRecipient("");
    setTestSource("draft");
    setTestDialogOpen(true);
  };

  return (
    <AdminLayout title="Patient Confirmation Email" backTo="/admin/notification-settings">
      <div className="p-6 space-y-6">
        <p className="text-muted-foreground">
          Customize the copy in the automatic confirmation email sent to patients after they submit a doctor introduction request. Changes take effect immediately for all future emails.
        </p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Edit panel */}
          <Card>
            <CardHeader>
              <CardTitle>Template fields</CardTitle>
              <CardDescription>Edit the editable portions of the email body.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {templateError && (
                    <p className="text-sm text-destructive" role="alert">
                      Could not load the saved template. Changes may overwrite existing settings; refresh before saving.
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="input-greeting">Greeting line</Label>
                    <p className="text-xs text-muted-foreground">
                      Opens the email body, e.g. "<strong>{(form.greeting || DEFAULTS.greeting).slice(0, 30)}</strong> Jane,". Use any word or short phrase.
                    </p>
                    <Input
                      id="input-greeting"
                      data-testid="input-greeting"
                      value={form.greeting}
                      onChange={(e) => handleChange("greeting", e.target.value)}
                      placeholder="e.g. Hi, Dear, Hello, Welcome back"
                      maxLength={50}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {(form.greeting || "").length}/50
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="input-subject">Subject line</Label>
                    <p className="text-xs text-muted-foreground">
                      The email subject patients see in their inbox.
                    </p>
                    <Input
                      id="input-subject"
                      data-testid="input-subject"
                      value={form.subject}
                      onChange={(e) => handleChange("subject", e.target.value)}
                      placeholder="e.g. Your ConcordiaCare doctor request was received"
                      maxLength={200}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {form.subject.length}/200
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="input-response-time">Response time promise</Label>
                    <p className="text-xs text-muted-foreground">
                      Appears in the sentence "our team will be in touch within&nbsp;<strong>…</strong>".
                    </p>
                    <Input
                      id="input-response-time"
                      data-testid="input-response-time"
                      value={form.responseTime}
                      onChange={(e) => handleChange("responseTime", e.target.value)}
                      placeholder="e.g. 24 business hours"
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="textarea-footer-note">Footer note</Label>
                    <p className="text-xs text-muted-foreground">
                      Small grey text at the bottom of the email (do-not-reply notice, etc.).
                    </p>
                    <Textarea
                      id="textarea-footer-note"
                      data-testid="textarea-footer-note"
                      value={form.footerNote}
                      onChange={(e) => handleChange("footerNote", e.target.value)}
                      placeholder="e.g. This is an automated confirmation from ConcordiaCare…"
                      maxLength={500}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {form.footerNote.length}/500
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      onClick={handleSave}
                      disabled={saveMutation.isPending || !isDirty || templateError}
                      data-testid="button-save-template"
                    >
                      {saveMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save changes
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={!isDirty || saveMutation.isPending || templateError}
                      data-testid="button-reset-template"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Discard
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleOpenTestDialog}
                      disabled={saveMutation.isPending}
                      data-testid="button-send-test-email"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send test email
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Live preview panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Live preview
              </CardTitle>
              <CardDescription>
                This is how the email will look to patients. Sample data is used for the request summary.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-md border bg-white p-2 overflow-auto"
                data-testid="email-preview"
                style={{ maxHeight: "600px" }}
                dangerouslySetInnerHTML={{
                  __html: buildPreviewHtml(form.subject || DEFAULTS.subject, form.responseTime || DEFAULTS.responseTime, form.footerNote || DEFAULTS.footerNote, form.greeting || DEFAULTS.greeting),
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent test sends */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent test sends
              </CardTitle>
              <CardDescription>
                The last 10 test emails sent from this panel (auto-cleared after 30 days).
              </CardDescription>
            </div>
            {testLogs && testLogs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearAllLogsMutation.isPending}
                data-testid="button-clear-all-logs"
              >
                {clearAllLogsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Clear all
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            ) : logsError ? (
              <p className="py-2 text-sm text-destructive" role="alert">
                Could not load test email history. Refresh the page and try again.
              </p>
            ) : !testLogs || testLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2" data-testid="text-no-test-logs">
                No test emails have been sent yet.
              </p>
            ) : (
              <ul className="divide-y text-sm" data-testid="list-test-email-logs">
                {testLogs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`row-test-log-${log.id}`}>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium" data-testid={`text-log-recipient-${log.id}`}>{log.recipient}</span>
                      <span className="text-muted-foreground text-xs" data-testid={`text-log-meta-${log.id}`}>
                        {log.sentByEmail ? `by ${log.sentByEmail} · ` : ""}
                        {new Date(log.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`button-delete-log-${log.id}`}
                      onClick={() => deleteLogMutation.mutate(log.id)}
                      disabled={deletingLogId === log.id}
                      aria-label="Delete log entry"
                    >
                      {deletingLogId === log.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all test email history?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <strong>{testLogs?.length ?? 0} {testLogs?.length === 1 ? "entry" : "entries"}</strong>.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmClearOpen(false)}
              disabled={clearAllLogsMutation.isPending}
              data-testid="button-cancel-clear-logs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllLogsMutation.mutate(undefined, {
                  onSettled: () => setConfirmClearOpen(false),
                });
              }}
              disabled={clearAllLogsMutation.isPending}
              data-testid="button-confirm-clear-logs"
            >
              {clearAllLogsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete all"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>
              Enter a recipient address. We'll send the selected version with sample data so you can check how it looks in your inbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Version to send</Label>
              <div className="flex gap-2" data-testid="toggle-test-source">
                <Button
                  type="button"
                  variant="outline"
                  className={`flex-1 toggle-elevate${testSource === "draft" ? " toggle-elevated" : ""}`}
                  onClick={() => setTestSource("draft")}
                  data-testid="button-test-source-draft"
                >
                  Current draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`flex-1 toggle-elevate${testSource === "saved" ? " toggle-elevated" : ""}${!template ? " opacity-50" : ""}`}
                  onClick={() => { if (template) setTestSource("saved"); }}
                  disabled={!template}
                  data-testid="button-test-source-saved"
                >
                  Saved version
                </Button>
              </div>
              {testSource === "draft" && isDirty && (
                <p className="text-xs text-muted-foreground" data-testid="text-draft-unsaved-note">
                  Your draft has unsaved changes. This test will reflect those edits.
                </p>
              )}
              {testSource === "saved" && (
                <p className="text-xs text-muted-foreground" data-testid="text-saved-note">
                  Using the last saved version. Any unsaved edits will be ignored.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-test-recipient">Recipient email address</Label>
              <Input
                id="input-test-recipient"
                data-testid="input-test-recipient"
                type="email"
                placeholder="you@example.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && testRecipient.trim() && !testMutation.isPending) {
                    testMutation.mutate();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTestDialogOpen(false)}
              disabled={testMutation.isPending}
              data-testid="button-cancel-test-email"
            >
              Cancel
            </Button>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={!testRecipient.trim() || testMutation.isPending}
              data-testid="button-confirm-send-test-email"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
