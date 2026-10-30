/**
 * PA Turnaround & Approval Analytics Dashboard
 * Gives leadership and clinic partners visibility into PA program ROI:
 * turnaround times, approval/denial rates, payer breakdowns, medication volume,
 * monthly trends, and staff-time savings.
 */

import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, Cell,
} from "recharts";
import {
  BarChart3, Clock, CheckCircle2, XCircle, Gavel, Sparkles,
  TrendingUp, Building2, Pill, Timer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaAnalytics {
  headline: {
    totalThisMonth: number;
    avgTatHours: number | null;
    approvalRate: number;
    denialRate: number;
    appealSuccessRate: number;
    timeSavedHours: number;
    aiGeneratedCount: number;
  };
  monthly: Array<{
    month: string;
    submitted: number;
    approved: number;
    denied: number;
    total: number;
  }>;
  payerBreakdown: Array<{
    payer: string;
    total: number;
    approved: number;
    denied: number;
    approvalRate: number;
    avgTatHours: number | null;
    commonDenialReason: string | null;
  }>;
  medicationBreakdown: Array<{
    medicationName: string;
    total: number;
    approved: number;
    denied: number;
    approvalRate: number;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatTat(hours: number | null): string {
  if (hours == null) return "Not available";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function rateColor(rate: number): string {
  if (rate >= 70) return "text-emerald-600";
  if (rate >= 40) return "text-amber-600";
  return "text-red-600";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${color} bg-opacity-10`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
            {sub && <p className="text-xs text-muted-foreground opacity-70 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-4">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = {
  submitted: "#6366f1",
  approved: "#10b981",
  denied: "#ef4444",
  total: "#94a3b8",
};

const MED_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff", "#818cf8", "#4f46e5", "#4338ca"];

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPaAnalytics() {
  const { data, isLoading, isError } = useQuery<PaAnalytics>({
    queryKey: ["/api/admin/pa-analytics"],
    staleTime: 5 * 60_000, // 5-minute cache — analytics don't need real-time refresh
  });

  const h = data?.headline;

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            PA Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Turnaround times, approval rates, payer performance, and staff-time savings from the AI-assisted PA engine.
          </p>
        </div>

        {/* ── Headline metric cards ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load analytics. Please try again.</p>
        ) : h ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              icon={TrendingUp}
              label="Submitted this month"
              value={String(h.totalThisMonth)}
              sub={`${h.aiGeneratedCount} AI-generated total`}
              color="text-primary"
            />
            <MetricCard
              icon={Timer}
              label="Avg turnaround"
              value={formatTat(h.avgTatHours)}
              sub="submission → decision"
              color="text-blue-600"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Approval rate"
              value={`${h.approvalRate}%`}
              sub="of resolved decisions"
              color="text-emerald-600"
            />
            <MetricCard
              icon={XCircle}
              label="Denial rate"
              value={`${h.denialRate}%`}
              sub="of resolved decisions"
              color="text-red-600"
            />
            <MetricCard
              icon={Gavel}
              label="Appeal success"
              value={`${h.appealSuccessRate}%`}
              sub="of appeals → approved"
              color="text-purple-600"
            />
            <MetricCard
              icon={Sparkles}
              label="Staff time saved"
              value={`${h.timeSavedHours}h`}
              sub="vs. manual PA (45 min/PA)"
              color="text-amber-600"
            />
          </div>
        ) : null}

        {/* ── Monthly trend chart ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Monthly PA Activity: last 6 months (submitted by submission date; approved or denied by decision date)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.monthly.length ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                No data yet. PAs will appear here once submitted.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.monthly.map(m => ({ ...m, month: formatMonth(m.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={CHART_COLORS.total} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="submitted" name="Submitted" stroke={CHART_COLORS.submitted} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="approved" name="Approved" stroke={CHART_COLORS.approved} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="denied" name="Denied" stroke={CHART_COLORS.denied} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Bottom row: payer table + medication chart ── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Payer breakdown table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Payer Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !data?.payerBreakdown.length ? (
                <p className="p-4 text-sm text-muted-foreground">No payer data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payer</TableHead>
                        <TableHead className="text-right">PAs</TableHead>
                        <TableHead className="text-right">Approval</TableHead>
                        <TableHead className="text-right">Avg TAT</TableHead>
                        <TableHead>Top Denial Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payerBreakdown.map((row) => (
                        <TableRow key={row.payer}>
                          <TableCell className="font-medium text-sm max-w-[140px] truncate" title={row.payer}>
                            {row.payer}
                          </TableCell>
                          <TableCell className="text-right text-sm">{row.total}</TableCell>
                          <TableCell className="text-right">
                            <span className={`text-sm font-semibold ${rateColor(row.approvalRate)}`}>
                              {row.approvalRate}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatTat(row.avgTatHours)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px]">
                            {row.commonDenialReason ? (
                              <span className="line-clamp-2" title={row.commonDenialReason}>
                                {row.commonDenialReason.slice(0, 80)}{row.commonDenialReason.length > 80 ? "…" : ""}
                              </span>
                            ) : (
                              <span className="italic">Not available</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Medication volume bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Pill className="h-4 w-4 text-muted-foreground" />
                Top 10 Medications by PA Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !data?.medicationBreakdown.length ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No medication data yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.medicationBreakdown.map(m => ({
                        ...m,
                        name: m.medicationName.length > 18
                          ? m.medicationName.slice(0, 16) + "…"
                          : m.medicationName,
                      }))}
                      layout="vertical"
                      margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(value, name) => [value, name === "approved" ? "Approved" : name === "denied" ? "Denied" : "Other"]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="approved" name="Approved" stackId="a" fill={CHART_COLORS.approved} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="denied" name="Denied" stackId="a" fill={CHART_COLORS.denied} radius={[0, 0, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Approval rate legend strip */}
                  <div className="rounded-lg border divide-y">
                    {data.medicationBreakdown.slice(0, 5).map((med, i) => (
                      <div key={med.medicationName} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: MED_COLORS[i] }} />
                          <span className="text-xs text-muted-foreground truncate" title={med.medicationName}>
                            {med.medicationName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-muted-foreground">{med.total} PAs</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${med.approvalRate >= 70 ? "border-emerald-300 text-emerald-700 bg-emerald-50" : med.approvalRate >= 40 ? "border-amber-300 text-amber-700 bg-amber-50" : "border-red-300 text-red-700 bg-red-50"}`}
                          >
                            {med.approvalRate}% approved
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Insights footer ── */}
        {h && h.aiGeneratedCount > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4 px-5">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-primary">PA Engine Impact Summary</p>
                  <p className="text-sm text-muted-foreground">
                    {h.aiGeneratedCount} prior authorization{h.aiGeneratedCount !== 1 ? "s" : ""} generated automatically,
                    saving an estimated <span className="font-medium text-foreground">{h.timeSavedHours} hours</span> of staff time
                    ({Math.round(h.timeSavedHours / 8)} days) compared to manual drafting at 45 min/PA.
                    {h.avgTatHours != null && (
                      <> Average payer turnaround: <span className="font-medium text-foreground">{formatTat(h.avgTatHours)}</span>.</>
                    )}
                    {" "}Approval rate: <span className={`font-medium ${rateColor(h.approvalRate)}`}>{h.approvalRate}%</span>.
                    {h.appealSuccessRate > 0 && (
                      <> Appeal success rate: <span className="font-medium text-purple-700">{h.appealSuccessRate}%</span>.</>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
