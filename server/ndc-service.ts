/**
 * NDC Drug Data Engine
 * Enriches prescription records with authoritative drug information
 * from OpenFDA's public NDC product API (no API key required).
 *
 * Cache strategy: 90-day TTL per NDC in drug_info_cache table.
 * Falls back gracefully if FDA is unreachable.
 */

import { storage } from "./storage";

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const FDA_NDC_URL = "https://api.fda.gov/drug/ndc.json";
const FDA_LABEL_URL = "https://api.fda.gov/drug/label.json";

export interface DrugInfo {
  ndc: string;
  brandName: string | null;
  genericName: string | null;
  labelerName: string | null;
  dosageFormName: string | null;
  routeName: string | null;
  strength: string | null;
  deaSchedule: string | null;
  productType: string | null;
  marketingStatus: string | null;
  substanceName: string | null;
  pharmClass: string | null;
  warnings: string[];
  inactiveIngredients: string[];
  packaging: { description: string; marketingStartDate?: string }[];
  source: "cache" | "fda" | "not_found";
  fetchedAt: Date;
}

// Normalize NDC to 11-digit format (OpenFDA prefers 11-digit with dashes)
export function normalizeNdc(ndc: string): string {
  const digits = ndc.replace(/\D/g, "");
  // Common NDC formats: 4-4-2, 5-3-2, 5-4-1 → normalize to 5-4-2 (11 digits)
  if (digits.length === 10) return digits.slice(0, 5) + "-" + digits.slice(5, 9) + "-" + digits.slice(9);
  if (digits.length === 11) return digits.slice(0, 5) + "-" + digits.slice(5, 9) + "-" + digits.slice(9);
  return ndc; // return as-is if we can't normalize
}

async function fetchFromOpenFDA(ndc: string): Promise<DrugInfo | null> {
  const normalized = normalizeNdc(ndc);

  try {
    // Query NDC product database
    const ndcRes = await fetch(
      `${FDA_NDC_URL}?search=product_ndc:"${encodeURIComponent(normalized)}"&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!ndcRes.ok && ndcRes.status !== 404) {
      // Try without dashes
      const bare = ndc.replace(/\D/g, "");
      const retry = await fetch(
        `${FDA_NDC_URL}?search=product_ndc:"${bare.slice(0,5)}-${bare.slice(5,9)}-${bare.slice(9)}"&limit=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!retry.ok) return null;
    }

    const ndcData = ndcRes.ok ? await ndcRes.json() : null;
    const product = ndcData?.results?.[0];

    if (!product) {
      // Try label search as fallback
      const labelRes = await fetch(
        `${FDA_LABEL_URL}?search=openfda.product_ndc:"${encodeURIComponent(normalized)}"&limit=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!labelRes.ok) return null;
      const labelData = await labelRes.json();
      const label = labelData?.results?.[0];
      if (!label) return null;

      return {
        ndc,
        brandName: label.openfda?.brand_name?.[0] ?? null,
        genericName: label.openfda?.generic_name?.[0] ?? null,
        labelerName: label.openfda?.manufacturer_name?.[0] ?? null,
        dosageFormName: label.openfda?.dosage_form?.[0] ?? null,
        routeName: label.openfda?.route?.[0] ?? null,
        strength: null,
        deaSchedule: label.openfda?.substance_name ? null : null,
        productType: null,
        marketingStatus: null,
        substanceName: label.openfda?.substance_name?.join("; ") ?? null,
        pharmClass: label.openfda?.pharm_class_epc?.join("; ") ?? null,
        warnings: extractWarnings(label),
        inactiveIngredients: [],
        packaging: [],
        source: "fda",
        fetchedAt: new Date(),
      };
    }

    // Also fetch label for warnings / pharm class
    let warnings: string[] = [];
    let pharmClass = product.pharm_class?.join("; ") ?? null;
    try {
      const labelRes = await fetch(
        `${FDA_LABEL_URL}?search=openfda.product_ndc:"${encodeURIComponent(normalized)}"&limit=1`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (labelRes.ok) {
        const labelData = await labelRes.json();
        const label = labelData?.results?.[0];
        if (label) {
          warnings = extractWarnings(label);
          if (!pharmClass && label.openfda?.pharm_class_epc) {
            pharmClass = label.openfda.pharm_class_epc.join("; ");
          }
        }
      }
    } catch {
      // label fetch is best-effort
    }

    return {
      ndc,
      brandName: product.brand_name ?? null,
      genericName: product.generic_name ?? null,
      labelerName: product.labeler_name ?? null,
      dosageFormName: product.dosage_form ?? null,
      routeName: product.route?.join(", ") ?? null,
      strength: product.active_ingredients
        ?.map((ai: { name: string; strength: string }) => `${ai.name} ${ai.strength}`)
        .join("; ") ?? null,
      deaSchedule: product.dea_schedule ?? null,
      productType: product.product_type ?? null,
      marketingStatus: product.marketing_status ?? null,
      substanceName: product.active_ingredients?.map((ai: { name: string }) => ai.name).join("; ") ?? null,
      pharmClass,
      warnings,
      inactiveIngredients: product.inactive_ingredients?.map((ii: { name: string }) => ii.name) ?? [],
      packaging: (product.packaging ?? []).map((p: { description: string; marketing_start_date?: string }) => ({
        description: p.description,
        marketingStartDate: p.marketing_start_date,
      })),
      source: "fda",
      fetchedAt: new Date(),
    };
  } catch (err) {
    console.error(`[NDC] OpenFDA fetch failed for ${ndc}:`, err);
    return null;
  }
}

function extractWarnings(label: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const sections = [
    "boxed_warning",
    "warnings_and_cautions",
    "warnings",
    "contraindications",
  ] as const;

  for (const section of sections) {
    const val = (label as Record<string, unknown[]>)[section];
    if (Array.isArray(val) && val.length > 0) {
      const text = String(val[0]).substring(0, 500).replace(/\s+/g, " ").trim();
      if (text) warnings.push(text);
    }
  }
  return warnings;
}

/**
 * Look up drug info by NDC. Checks cache first, then OpenFDA.
 * Never throws — returns null if the drug cannot be found.
 */
export async function getDrugInfoByNdc(ndc: string): Promise<DrugInfo | null> {
  if (!ndc) return null;

  // 1. Check cache
  const cached = await storage.getDrugInfoCache(ndc);
  if (cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return {
        ndc,
        brandName: cached.brandName,
        genericName: cached.genericName,
        labelerName: cached.labelerName,
        dosageFormName: cached.dosageFormName,
        routeName: cached.routeName,
        strength: cached.strength,
        deaSchedule: cached.deaSchedule,
        productType: cached.productType,
        marketingStatus: cached.marketingStatus,
        substanceName: cached.substanceName,
        pharmClass: cached.pharmClass,
        warnings: (cached.warningsJson as string[]) ?? [],
        inactiveIngredients: (cached.inactiveIngredients as string[]) ?? [],
        packaging: (cached.packagingJson as { description: string; marketingStartDate?: string }[]) ?? [],
        source: "cache",
        fetchedAt: new Date(cached.fetchedAt),
      };
    }
  }

  // 2. Fetch from OpenFDA
  const info = await fetchFromOpenFDA(ndc);
  if (!info) return null;

  // 3. Persist to cache
  try {
    await storage.upsertDrugInfoCache({
      ndc,
      brandName: info.brandName,
      genericName: info.genericName,
      labelerName: info.labelerName,
      dosageFormName: info.dosageFormName,
      routeName: info.routeName,
      strength: info.strength,
      deaSchedule: info.deaSchedule,
      productType: info.productType,
      marketingStatus: info.marketingStatus,
      substanceName: info.substanceName,
      pharmClass: info.pharmClass,
      warningsJson: info.warnings,
      inactiveIngredients: info.inactiveIngredients,
      packagingJson: info.packaging,
      rawFdaJson: null,
    });
  } catch (err) {
    console.error("[NDC] Failed to cache drug info:", err);
  }

  return info;
}

/**
 * Batch enrich a list of NDCs — runs lookups concurrently (max 5 at a time).
 */
export async function batchEnrichNdcs(
  ndcs: string[]
): Promise<Map<string, DrugInfo>> {
  const unique = Array.from(new Set(ndcs.filter(Boolean)));
  const results = new Map<string, DrugInfo>();

  const CONCURRENCY = 5;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((ndc) => getDrugInfoByNdc(ndc)));
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value) {
        results.set(batch[idx], r.value);
      }
    });
  }
  return results;
}
