import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Syringe, ShieldCheck, Ticket, CalendarDays, Clock, FileText, Info, LogIn, AlertTriangle, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { FluShotAppointment, InsuranceAssistanceRequest } from "@shared/schema";

type FetchState<T> =
  | { kind: "unauthenticated" }
  | { kind: "error" }
  | { kind: "ok"; data: T };

async function fetchTickets<T>(path: string): Promise<FetchState<T>> {
  const res = await fetch(path, { credentials: "include" });
  if (res.status === 401) return { kind: "unauthenticated" };
  if (!res.ok) return { kind: "error" };
  return { kind: "ok", data: await res.json() };
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
    case "approved":
      return "default";
    case "scheduled":
    case "pending":
      return "secondary";
    case "cancelled":
    case "no_show":
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "no_show":
      return "No Show";
    case "in_progress":
      return "In Progress";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "Not available";
  const d = new Date(date);
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface FluShotCardProps {
  appt: FluShotAppointment;
}

function FluShotCard({ appt }: FluShotCardProps) {
  return (
    <Card data-testid={`card-flu-shot-${appt.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Syringe className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <CardTitle className="text-base">{appt.fluShotType}</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Ticket #{appt.ticketNumber}
            </CardDescription>
          </div>
        </div>
        <Badge
          variant={statusVariant(appt.status)}
          data-testid={`status-flu-shot-${appt.id}`}
        >
          {statusLabel(appt.status)}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span>{formatDate(appt.scheduledDate)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{appt.scheduledTime}</span>
        </div>
        {appt.notes && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{appt.notes}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface InsuranceCardProps {
  req: InsuranceAssistanceRequest;
}

function InsuranceCard({ req }: InsuranceCardProps) {
  return (
    <Card data-testid={`card-insurance-${req.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <CardTitle className="text-base">Insurance Help Request</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Ticket #{req.ticketNumber}
            </CardDescription>
          </div>
        </div>
        <Badge
          variant={statusVariant(req.status)}
          data-testid={`status-insurance-${req.id}`}
        >
          {statusLabel(req.status)}
        </Badge>
      </CardHeader>
      {(req.adminNotes || req.message) && (
        <CardContent className="flex flex-col gap-2 pt-0">
          {req.message && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-3">{req.message}</span>
            </div>
          )}
          {req.adminNotes && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium text-foreground">Pharmacy note: </span>
              <span className="text-muted-foreground">{req.adminNotes}</span>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2"
      data-testid={`empty-${label}`}
    >
      <Ticket className="h-7 w-7 opacity-40" />
      <p className="text-sm">No {label} found for your account.</p>
    </div>
  );
}

type TicketLookupResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error" }
  | { kind: "found_flu"; appt: FluShotAppointment }
  | { kind: "found_insurance"; req: InsuranceAssistanceRequest };

function TicketNumberLookup() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TicketLookupResult>({ kind: "idle" });

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setResult({ kind: "loading" });

    try {
      const upper = trimmed.toUpperCase();
      const isFlu = upper.startsWith("FLU");
      const isIns = upper.startsWith("INS");

      let found = false;

      if (isFlu || (!isFlu && !isIns)) {
        const fluRes = await fetch(`/api/patient/flu-shots?ticketNumber=${encodeURIComponent(upper)}`, { credentials: "include" });
        if (fluRes.ok) {
          const data = await fluRes.json();
          if (Array.isArray(data) && data.length > 0) {
            setResult({ kind: "found_flu", appt: data[0] });
            found = true;
          }
        } else if (fluRes.status !== 404) {
          setResult({ kind: "error" });
          return;
        }
      }

      if (!found && (isIns || (!isFlu && !isIns))) {
        const insRes = await fetch(`/api/patient/insurance-requests?ticketNumber=${encodeURIComponent(upper)}`, { credentials: "include" });
        if (insRes.ok) {
          const data = await insRes.json();
          if (Array.isArray(data) && data.length > 0) {
            setResult({ kind: "found_insurance", req: data[0] });
            found = true;
          }
        } else if (insRes.status !== 404) {
          setResult({ kind: "error" });
          return;
        }
      }

      if (!found) {
        setResult({ kind: "not_found" });
      }
    } catch {
      setResult({ kind: "error" });
    }
  }

  function handleClear() {
    setInput("");
    setResult({ kind: "idle" });
  }

  return (
    <Card data-testid="card-ticket-number-lookup">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          Look up by ticket number
        </CardTitle>
        <CardDescription className="text-xs">
          Enter a ticket number from your confirmation (e.g. FLU-1234 or INS-5678).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleLookup} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-number-input" className="text-sm">Ticket number</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                id="ticket-number-input"
                data-testid="input-ticket-number"
                placeholder="e.g. FLU-1234 or INS-5678"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 min-w-0"
                autoComplete="off"
              />
              <Button
                type="submit"
                data-testid="button-lookup-ticket"
                disabled={result.kind === "loading" || !input.trim()}
              >
                {result.kind === "loading" ? "Searching…" : "Look up"}
              </Button>
              {result.kind !== "idle" && result.kind !== "loading" && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="button-clear-lookup"
                  onClick={handleClear}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </form>

        {result.kind === "not_found" && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="text-lookup-not-found"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            No ticket found with that number. Please double-check and try again.
          </div>
        )}

        {result.kind === "error" && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="text-lookup-error"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            Something went wrong. Please try again.
          </div>
        )}

        {result.kind === "found_flu" && (
          <div data-testid="result-flu-shot-lookup">
            <FluShotCard appt={result.appt} />
          </div>
        )}

        {result.kind === "found_insurance" && (
          <div data-testid="result-insurance-lookup">
            <InsuranceCard req={result.req} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyTickets() {
  const { isLoading: authLoading } = useAuth();

  const {
    data: fluState,
    isLoading: fluLoading,
  } = useQuery<FetchState<FluShotAppointment[]>>({
    queryKey: ["/api/patient/flu-shots"],
    queryFn: () => fetchTickets<FluShotAppointment[]>("/api/patient/flu-shots"),
    enabled: !authLoading,
    retry: false,
  });

  const {
    data: insState,
    isLoading: insLoading,
  } = useQuery<FetchState<InsuranceAssistanceRequest[]>>({
    queryKey: ["/api/patient/insurance-requests"],
    queryFn: () => fetchTickets<InsuranceAssistanceRequest[]>("/api/patient/insurance-requests"),
    enabled: !authLoading,
    retry: false,
  });

  const isLoading = authLoading || fluLoading || insLoading;
  const isUnauthenticated = !isLoading && fluState?.kind === "unauthenticated";
  const hasError = !isLoading && !isUnauthenticated && (fluState?.kind === "error" || insState?.kind === "error");
  const fluShots = fluState?.kind === "ok" ? fluState.data : null;
  const insuranceRequests = insState?.kind === "ok" ? insState.data : null;

  return (
    <PageTransition>
      <SEO
        title="My Tickets | Concordia Pharmacy"
        description="View your flu shot appointments and insurance help request history."
      />
      <Header />
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-2">
            <Ticket className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">My Tickets</h1>
          </div>
          <p className="text-muted-foreground text-sm mb-8">
            Your flu shot appointments and insurance help requests, newest first.
          </p>

          {isLoading && (
            <div className="flex flex-col gap-3" data-testid="loading-tickets">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-20" />
                </Card>
              ))}
            </div>
          )}

          {!isLoading && isUnauthenticated && (
            <div className="flex flex-col gap-4">
              <Card data-testid="card-sign-in-prompt">
                <CardHeader>
                  <CardTitle className="text-base">Sign in to view your tickets</CardTitle>
                  <CardDescription>
                    Log in to your ConcordiaCare account to see all your flu shot appointments and insurance help requests.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/signup">
                    <Button data-testid="button-sign-in">
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign in
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or look up by ticket number</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <TicketNumberLookup />
            </div>
          )}

          {!isLoading && hasError && (
            <Card data-testid="card-error-state">
              <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
                <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                <span className="text-sm">
                  Something went wrong loading your tickets. Please try refreshing the page.
                </span>
              </CardContent>
            </Card>
          )}

          {!isLoading && !isUnauthenticated && !hasError && (
            <>
              <section className="mb-8" data-testid="section-flu-shots">
                <div className="flex items-center gap-2 mb-3">
                  <Syringe className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                    Flu Shot Appointments
                  </h2>
                </div>
                {fluShots && fluShots.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {fluShots.map((appt) => (
                      <FluShotCard key={appt.id} appt={appt} />
                    ))}
                  </div>
                ) : (
                  <EmptyState label="flu shot appointments" />
                )}
              </section>

              <section className="mb-8" data-testid="section-insurance-requests">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                    Insurance Help Requests
                  </h2>
                </div>
                {insuranceRequests && insuranceRequests.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {insuranceRequests.map((req) => (
                      <InsuranceCard key={req.id} req={req} />
                    ))}
                  </div>
                ) : (
                  <EmptyState label="insurance help requests" />
                )}
              </section>

              <section data-testid="section-ticket-lookup">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">look up another ticket</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <TicketNumberLookup />
              </section>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </PageTransition>
  );
}
