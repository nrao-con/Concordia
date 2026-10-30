import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { SEO } from "@/components/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, IdCard, Phone, Mail, MapPin, Shield, LogIn, Copy, Check, Smartphone, ArrowRight, RefreshCw, Bell, Pill, ClipboardList, Clock3, CircleCheck, CircleAlert, XCircle } from "lucide-react";
import { Link, useLocation } from "wouter";

const APP_URL = "https://concordia-care.replit.app/";

type SpecialtyRequest = {
  id: number;
  medicationName: string;
  requestType: "new_prescription" | "transfer" | "e_script";
  status: "pending" | "in_review" | "contacted" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

const requestTypeLabels: Record<SpecialtyRequest["requestType"], string> = {
  new_prescription: "New prescription",
  transfer: "Prescription transfer",
  e_script: "Electronic prescription",
};

const statusLabels: Record<SpecialtyRequest["status"], string> = {
  pending: "Received",
  in_review: "Being reviewed",
  contacted: "Contacted by our team",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatRequestDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusTone(status: SpecialtyRequest["status"]) {
  if (status === "completed") return "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300";
  if (status === "cancelled") return "border-destructive/25 bg-destructive/10 text-destructive";
  if (status === "contacted") return "border-primary/25 bg-primary/10 text-primary";
  return "border-amber-600/25 bg-amber-600/10 text-amber-800 dark:text-amber-300";
}

function StatusIcon({ status }: { status: SpecialtyRequest["status"] }) {
  if (status === "completed") return <CircleCheck className="h-3.5 w-3.5" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5" />;
  if (status === "contacted") return <CircleAlert className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

function SpecialtyRequests() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SpecialtyRequest[] | { requests?: SpecialtyRequest[] }>({
    queryKey: ["/api/specialty-fulfillment-requests/mine"],
    refetchInterval: 30_000,
  });

  const requests: SpecialtyRequest[] = Array.isArray(data) ? data : (data?.requests ?? []);

  return (
    <Card className="concordia-card overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-primary/[0.035] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              My Specialty Requests
            </CardTitle>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Follow requests you have sent to our specialty team. A status shows where our staff is in the process; it does not confirm medication availability or clinical approval.
            </p>
          </div>
          <Link href="/specialty" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
            New request
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-5" aria-label="Loading specialty requests">
            {[1, 2].map((item) => (
              <div key={item} className="animate-pulse rounded-lg border border-border/70 p-4">
                <div className="h-4 w-2/5 rounded bg-muted" />
                <div className="mt-3 h-3 w-3/5 rounded bg-muted" />
                <div className="mt-4 h-3 w-1/4 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">We couldn't load your requests.</p>
              <p className="mt-1 text-sm text-muted-foreground">Please try again. Your profile information is still available.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Try again
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-center sm:p-8">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-3 text-sm font-medium">No specialty requests yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              When you need help with a complex therapy, your request and its staff-confirmed progress will appear here.
            </p>
            <Link
              href="/specialty"
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start a specialty request
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {requests.map((request) => (
              <div key={request.id} className="p-5 transition-colors hover:bg-muted/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{request.medicationName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{requestTypeLabels[request.requestType] ?? "Specialty request"}</p>
                  </div>
                  <Badge variant="outline" className={`w-fit gap-1.5 whitespace-nowrap ${statusTone(request.status)}`}>
                    <StatusIcon status={request.status} />
                    {statusLabels[request.status] ?? "Status updated"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Request started {formatRequestDate(request.createdAt)}</span>
                  <span>Last updated {formatRequestDate(request.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border/70 bg-muted/20 px-5 py-3.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Our team will confirm next steps with you. This tracker does not indicate that a medication is in stock, approved, or ready to dispense.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { user, isAuthenticated, isAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Admins don't belong on the patient profile — send them straight to the dashboard
  useEffect(() => {
    if (!isLoading && isAdmin) {
      setLocation("/admin");
    }
  }, [isAdmin, isLoading, setLocation]);

  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [syncingApp, setSyncingApp] = useState(false);
  const [appSyncMessage, setAppSyncMessage] = useState<string | null>(null);

  const concordiaId = (user as any)?.concordiaId as string | null | undefined;

  function handleCopyId() {
    if (!concordiaId) return;
    navigator.clipboard.writeText(concordiaId).then(() => {
      setCopied(true);
      toast({ title: "Copied!", description: `${concordiaId} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleOpenApp() {
    // Reserve the new tab synchronously so the browser does not treat the
    // eventual navigation (after the sync request) as a popup.
    const appWindow = window.open("about:blank", "_blank");
    setSyncingApp(true);
    setAppSyncMessage(null);
    try {
      const response = await fetch("/api/profile/sync-concordia-care", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "queued") {
        setAppSyncMessage("Your profile sync is queued. You can still open ConcordiaCare now.");
      } else if (!response.ok || result.status === "conflict") {
        setAppSyncMessage(result.message || "Profile sync could not be completed. You can still open ConcordiaCare.");
      } else {
        setAppSyncMessage("Your profile is up to date in ConcordiaCare.");
      }
      const destination = appWindow || window.open(APP_URL, "_blank");
      if (destination) {
        destination.location.href = APP_URL;
        destination.focus();
      }
    } catch {
      setAppSyncMessage("Profile sync is unavailable right now. You can still open ConcordiaCare.");
      const destination = appWindow || window.open(APP_URL, "_blank");
      if (destination) {
        destination.location.href = APP_URL;
        destination.focus();
      }
    } finally {
      setSyncingApp(false);
    }
  }

  const fullName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Patient"
    : "";

  return (
    <PageTransition>
      <SEO
        title="My Profile | Concordia Pharmacy"
        description="View and manage your Concordia Pharmacy patient profile."
      />
      <Header />
      <main className="min-h-screen bg-background py-12">
        <div className="container mx-auto max-w-2xl px-4 space-y-6">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading…</div>
          ) : !isAuthenticated ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <LogIn className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground text-center">
                  Please sign in to view your profile.
                </p>
                <Link href="/signup">
                  <Button data-testid="button-profile-signin">Sign In</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Profile header */}
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 py-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    {(user as any)?.profileImageUrl ? (
                      <img
                        src={(user as any).profileImageUrl}
                        alt={fullName}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-7 w-7 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold truncate" data-testid="text-profile-name">{fullName}</h1>
                    {user?.email && (
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                  <Link href="/complete-profile">
                    <Button variant="outline" size="sm" data-testid="button-edit-profile">
                      Edit Profile
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <SpecialtyRequests />

              {/* Get the App — always visible when signed in */}
              <div className="rounded-xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                <div className="p-5 flex flex-wrap gap-4 items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
                    <Smartphone className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground" data-testid="text-profile-app-title">
                      ConcordiaCare App
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Already use ConcordiaCare? Open it to continue. A current
                      session on this device will remain signed in.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={handleOpenApp}
                    disabled={syncingApp}
                    data-testid="button-profile-get-app"
                  >
                    {syncingApp ? "Syncing…" : "Open App"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {appSyncMessage && (
                  <p className="border-t border-primary/10 px-5 py-2.5 text-xs text-muted-foreground" role="status">
                    {appSyncMessage}
                  </p>
                )}
                <div className="border-t border-primary/10 px-5 py-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {[
                    { icon: Pill, label: "Track prescriptions" },
                    { icon: RefreshCw, label: "Request refills" },
                    { icon: Bell, label: "Refill reminders" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3 text-primary/70 shrink-0" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Your Patient ID — most prominent patient-facing display of concordiaId */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <IdCard className="h-4 w-4 text-primary" />
                    Your Patient ID
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {concordiaId ? (
                    <>
                      <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-3">
                        <span
                          className="flex-1 font-mono text-2xl font-semibold tracking-wider text-foreground"
                          data-testid="text-profile-concordia-id"
                        >
                          {concordiaId}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleCopyId}
                          data-testid="button-copy-concordia-id"
                          aria-label="Copy patient ID"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This is your permanent Concordia Pharmacy patient ID. Use it when contacting
                        the pharmacy, picking up prescriptions, or referencing your account.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Your patient ID is being assigned. Please check back shortly.
                    </p>
                  )}
                </CardContent>
              </Card>

              {((user as any)?.allergies || (user as any)?.medicalConditions) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Pill className="h-4 w-4 text-primary" />
                      Health Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {(user as any)?.allergies && (
                      <div>
                        <p className="font-medium">Allergies</p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{(user as any).allergies}</p>
                      </div>
                    )}
                    {(user as any)?.medicalConditions && (
                      <div>
                        <p className="font-medium">Medication and health notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{(user as any).medicalConditions}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      These are patient-provided notes. Pharmacy-verified prescriptions are managed separately.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Contact info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4 text-primary" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user?.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span data-testid="text-profile-email">{user.email}</span>
                    </div>
                  )}
                  {(user as any)?.phoneNumber && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span data-testid="text-profile-phone">{(user as any).phoneNumber}</span>
                    </div>
                  )}
                  {(user as any)?.address && (
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span data-testid="text-profile-address">{(user as any).address}</span>
                    </div>
                  )}
                  {(user as any)?.verifiedDeliveryAddress && (
                    <div className="ml-7 text-xs text-muted-foreground" data-testid="text-profile-verified-address">
                      Verified delivery address: {(user as any).verifiedDeliveryAddress.label}
                    </div>
                  )}
                  {!user?.email && !(user as any)?.phoneNumber && (
                    <p className="text-sm text-muted-foreground">No contact details on file.</p>
                  )}
                </CardContent>
              </Card>

              {/* Insurance info */}
              {((user as any)?.insuranceProvider || (user as any)?.insurancePolicyNumber) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield className="h-4 w-4 text-primary" />
                      Insurance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(user as any)?.insuranceProvider && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Provider</span>
                        <span data-testid="text-profile-insurance-provider">{(user as any).insuranceProvider}</span>
                      </div>
                    )}
                    {(user as any)?.insurancePolicyNumber && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Policy #</span>
                        <span className="font-mono" data-testid="text-profile-policy-number">{(user as any).insurancePolicyNumber}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Loyalty */}
              {(user as any)?.loyaltyPoints != null && (
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <span className="text-sm text-muted-foreground">Loyalty Points</span>
                    <Badge variant="secondary" data-testid="badge-profile-loyalty-points">
                      {(user as any).loyaltyPoints} pts
                    </Badge>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </PageTransition>
  );
}
