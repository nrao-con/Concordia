import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import type { DoctorMatchLead, DoctorPartner } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, TrendingUp, Languages, MapPin, Mail, Phone, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const DAYS_WINDOW = 30;

function formatPref(value: string) {
  if (!value) return "Not available";
  const v = value.toLowerCase();
  if (v === "any" || v === "no_preference") return "Any";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function topCounts(items: string[], limit = 5): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const raw of items) {
    const key = (raw || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function AggCard({ title, icon: Icon, rows, testId }: {
  title: string;
  icon: typeof TrendingUp;
  rows: Array<{ key: string; count: number }>;
  testId: string;
}) {
  const max = rows[0]?.count || 1;
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data in the last {DAYS_WINDOW} days.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="space-y-1" data-testid={`${testId}-row-${r.key}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.key}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DoctorMatchLeadsAdmin() {
  const isMobile = useIsMobile();
  const { data: leads = [], isLoading } = useQuery<DoctorMatchLead[]>({
    queryKey: ["/api/admin/doctor-match-leads"],
  });
  const { data: partners = [] } = useQuery<DoctorPartner[]>({
    queryKey: ["/api/admin/doctor-partners"],
  });

  const partnerById = useMemo(() => {
    const m = new Map<number, DoctorPartner>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  const recent = useMemo(() => {
    const cutoff = Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000;
    return leads.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  }, [leads]);

  const topSpecialties = useMemo(() => topCounts(recent.map((l) => l.specialty)), [recent]);
  const topLanguages = useMemo(() => topCounts(recent.map((l) => l.language)), [recent]);
  const topBoroughs = useMemo(() => topCounts(recent.map((l) => l.borough)), [recent]);

  const [showOnlyRequests, setShowOnlyRequests] = useState(false);

  const sortedLeads = useMemo(() => {
    const filtered = showOnlyRequests ? leads.filter((l) => !!l.requestedAt) : leads;
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [leads, showOnlyRequests]);

  const requestCount = useMemo(() => leads.filter((l) => !!l.requestedAt).length, [leads]);

  return (
    <AdminLayout title="Doctor Match Leads" backTo="/admin">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-leads-count">
              {leads.length} total submission{leads.length !== 1 ? "s" : ""} · {recent.length} in last {DAYS_WINDOW} days · {requestCount} appointment request{requestCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={showOnlyRequests ? "default" : "outline"}
              onClick={() => setShowOnlyRequests((v) => !v)}
              data-testid="button-toggle-requests-only"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {showOnlyRequests ? "Showing requests only" : "Show requests only"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <AggCard title={`Top Specialties (${DAYS_WINDOW}d)`} icon={TrendingUp} rows={topSpecialties} testId="card-top-specialties" />
          <AggCard title={`Top Languages (${DAYS_WINDOW}d)`} icon={Languages} rows={topLanguages} testId="card-top-languages" />
          <AggCard title={`Top Boroughs (${DAYS_WINDOW}d)`} icon={MapPin} rows={topBoroughs} testId="card-top-boroughs" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : sortedLeads.length === 0 ? (
              <div className="p-12 text-center" data-testid="text-empty-leads">
                <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No quiz submissions yet.</p>
              </div>
            ) : (
              isMobile ? (
                /* Mobile card view */
                <div className="divide-y">
                  {sortedLeads.map((l) => {
                    const selected = l.selectedDoctorId ? partnerById.get(l.selectedDoctorId) : null;
                    const isRequest = !!l.requestedAt;
                    return (
                      <div key={l.id} className="p-4 space-y-3" data-testid={`row-lead-${l.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium" data-testid={`text-lead-patient-${l.id}`}>
                              {l.patientName || <span className="text-muted-foreground">Anonymous</span>}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-lead-when-${l.id}`}>
                              {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1" data-testid={`text-lead-status-${l.id}`}>
                            {isRequest ? (
                              <Badge variant="default" className="whitespace-nowrap">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Requested
                              </Badge>
                            ) : (
                              <Badge variant="outline">Quiz only</Badge>
                            )}
                            {l.source === "app" && (
                              <Badge variant="secondary" className="text-xs w-fit bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" data-testid={`badge-source-app-${l.id}`}>
                                App
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1" data-testid={`text-lead-contact-${l.id}`}>
                          {l.patientPhone && (
                            <a href={`tel:${l.patientPhone}`} className="flex items-center gap-2 text-sm py-1">
                              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                              {l.patientPhone}
                            </a>
                          )}
                          {l.patientEmail && (
                            <a href={`mailto:${l.patientEmail}`} className="flex items-center gap-2 text-sm py-1 break-all">
                              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                              {l.patientEmail}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" data-testid={`text-lead-specialty-${l.id}`}>{l.specialty}</Badge>
                          <span className="text-sm text-muted-foreground" data-testid={`text-lead-borough-${l.id}`}>
                            <MapPin className="inline h-3 w-3 mr-0.5" />{formatPref(l.borough)}
                          </span>
                          <span className="text-sm text-muted-foreground" data-testid={`text-lead-language-${l.id}`}>
                            {l.language}
                          </span>
                        </div>
                        {l.preferredTime && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1" data-testid={`text-lead-preferred-${l.id}`}>
                            <Clock className="h-3 w-3" />
                            {l.preferredTime}
                          </p>
                        )}
                        {l.patientNotes && (
                          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-lead-notes-${l.id}`}>
                            {l.patientNotes}
                          </p>
                        )}
                        {selected && (
                          <div className="flex items-center gap-2 pt-1" data-testid={`text-lead-selected-${l.id}`}>
                            <Avatar className="h-7 w-7">
                              {selected.photoUrl && (
                                <AvatarImage src={selected.photoUrl} alt={`Dr. ${selected.lastName}`} />
                              )}
                              <AvatarFallback>
                                {`${selected.firstName[0]}${selected.lastName[0]}`.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">Dr. {selected.firstName} {selected.lastName}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              ) : (
                /* Desktop table view */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Preferred time</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Specialty</TableHead>
                        <TableHead>Language</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Borough</TableHead>
                        <TableHead>Selected Doctor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLeads.map((l) => {
                        const selected = l.selectedDoctorId ? partnerById.get(l.selectedDoctorId) : null;
                        const isRequest = !!l.requestedAt;
                        return (
                          <TableRow key={l.id} data-testid={`row-lead-${l.id}`}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-lead-when-${l.id}`}>
                              {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}
                            </TableCell>
                            <TableCell data-testid={`text-lead-status-${l.id}`}>
                              <div className="flex flex-col gap-1">
                                {isRequest ? (
                                  <Badge variant="default" className="whitespace-nowrap">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Requested {formatDistanceToNow(new Date(l.requestedAt as unknown as string), { addSuffix: true })}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Quiz only</Badge>
                                )}
                                {l.source === "app" && (
                                  <Badge variant="secondary" className="text-xs w-fit bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" data-testid={`badge-source-app-${l.id}`}>
                                    App
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell data-testid={`text-lead-patient-${l.id}`}>
                              {l.patientName || <span className="text-muted-foreground">Not available</span>}
                            </TableCell>
                            <TableCell data-testid={`text-lead-contact-${l.id}`}>
                              {l.patientPhone || l.patientEmail ? (
                                <div className="space-y-0.5 text-sm">
                                  {l.patientPhone && (
                                    <a href={`tel:${l.patientPhone}`} className="flex items-center gap-1 hover:text-primary">
                                      <Phone className="h-3 w-3" />
                                      {l.patientPhone}
                                    </a>
                                  )}
                                  {l.patientEmail && (
                                    <a href={`mailto:${l.patientEmail}`} className="flex items-center gap-1 hover:text-primary break-all">
                                      <Mail className="h-3 w-3" />
                                      {l.patientEmail}
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Not available</span>
                              )}
                            </TableCell>
                            <TableCell data-testid={`text-lead-preferred-${l.id}`}>
                              {l.preferredTime ? (
                                <span className="flex items-center gap-1 text-sm">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {l.preferredTime}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not available</span>
                              )}
                            </TableCell>
                            <TableCell data-testid={`text-lead-notes-${l.id}`} className="max-w-xs">
                              {l.patientNotes ? (
                                <span className="text-sm line-clamp-3" title={l.patientNotes}>{l.patientNotes}</span>
                              ) : (
                                <span className="text-muted-foreground">Not available</span>
                              )}
                            </TableCell>
                            <TableCell data-testid={`text-lead-specialty-${l.id}`}>
                              <Badge variant="secondary">{l.specialty}</Badge>
                            </TableCell>
                            <TableCell data-testid={`text-lead-language-${l.id}`}>{l.language}</TableCell>
                            <TableCell className="capitalize" data-testid={`text-lead-gender-${l.id}`}>
                              {formatPref(l.genderPreference)}
                            </TableCell>
                            <TableCell data-testid={`text-lead-borough-${l.id}`}>{formatPref(l.borough)}</TableCell>
                            <TableCell data-testid={`text-lead-selected-${l.id}`}>
                              {selected ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-8 w-8">
                                    {selected.photoUrl && (
                                      <AvatarImage
                                        src={selected.photoUrl}
                                        alt={`Dr. ${selected.lastName}`}
                                        data-testid={`img-lead-selected-photo-${l.id}`}
                                      />
                                    )}
                                    <AvatarFallback>
                                      {`${selected.firstName[0]}${selected.lastName[0]}`.toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{`Dr. ${selected.firstName} ${selected.lastName}, ${selected.title}`}</span>
                                </div>
                              ) : l.selectedDoctorId ? (
                                `#${l.selectedDoctorId}`
                              ) : (
                                <span className="text-muted-foreground">Not available</span>
                              )}
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
      </div>
    </AdminLayout>
  );
}
