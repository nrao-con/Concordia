/**
 * Pure helper functions for PA analytics computation.
 * Extracted from DatabaseStorage.getPaAnalytics() so they can be unit-tested
 * independently of the database.
 */

/**
 * Compute approval/denial rates against RESOLVED decisions only.
 * Drafts, pending, RFIs, in-progress, and cancelled PAs are excluded from
 * the denominator — they have not received a payer decision yet.
 *
 * @param approved  count of approved PAs
 * @param denied    count of denied PAs
 * @returns         { approvalRate, denialRate, resolved } — rates as integer %
 */
export function computeDecisionRates(
  approved: number,
  denied: number
): { approvalRate: number; denialRate: number; resolved: number } {
  const resolved = approved + denied;
  if (resolved === 0) return { approvalRate: 0, denialRate: 0, resolved: 0 };
  return {
    approvalRate: Math.round((approved / resolved) * 100),
    denialRate: Math.round((denied / resolved) * 100),
    resolved,
  };
}

/**
 * Build a guaranteed 6-month monthly series (oldest → newest), zero-filling
 * any months that have no data.
 *
 * @param submittedMap  month → count, from submitted_at grouping
 * @param approvedMap   month → count, from response_received_at + approved
 * @param deniedMap     month → count, from response_received_at + denied
 * @param referenceDate reference date for computing the 6-month window (defaults to now)
 */
export function buildMonthlySeries(
  submittedMap: Map<string, number>,
  approvedMap: Map<string, number>,
  deniedMap: Map<string, number>,
  referenceDate: Date = new Date()
): Array<{ month: string; submitted: number; approved: number; denied: number; total: number }> {
  const sixMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    sixMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return sixMonths.map((month) => {
    const submitted = submittedMap.get(month) ?? 0;
    return {
      month,
      submitted,
      approved: approvedMap.get(month) ?? 0,
      denied: deniedMap.get(month) ?? 0,
      total: submitted,
    };
  });
}

/**
 * Compute per-payer or per-medication approval rate against resolved decisions.
 */
export function computeItemRate(approved: number, denied: number): number {
  const resolved = approved + denied;
  return resolved > 0 ? Math.round((approved / resolved) * 100) : 0;
}
