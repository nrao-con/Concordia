export interface VerifiedAddressSelectionInput {
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lon: number;
  osmType?: string;
  osmId?: number;
}

export type AddressVerificationResult =
  | { valid: true }
  | { valid: false; message: string };

const INVALID_ADDRESS_MESSAGE =
  "Please select a valid delivery address from the map suggestions.";

export function formatDeliveryAddress(
  streetAddress: string | null | undefined,
  apartmentUnit: string | null | undefined
): string | null {
  const street = streetAddress?.trim();
  if (!street) return null;
  const unit = apartmentUnit?.trim();
  return unit ? `${street}, ${unit}` : street;
}

const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\da-z]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeState(value: string): string {
  const trimmed = value.trim();
  return (
    STATE_NAME_TO_ABBR[trimmed] ||
    (trimmed.length === 2 ? trimmed.toUpperCase() : "")
  );
}

function parseReverseAddress(address: Record<string, unknown>) {
  const houseNumber = typeof address.house_number === "string" ? address.house_number : "";
  const road =
    (typeof address.road === "string" && address.road) ||
    (typeof address.pedestrian === "string" && address.pedestrian) ||
    (typeof address.footway === "string" && address.footway) ||
    "";
  const street = [houseNumber, road].filter(Boolean).join(" ");
  const city =
    (typeof address.city === "string" && address.city) ||
    (typeof address.town === "string" && address.town) ||
    (typeof address.village === "string" && address.village) ||
    (typeof address.hamlet === "string" && address.hamlet) ||
    (typeof address.suburb === "string" && address.suburb) ||
    (typeof address.county === "string" && address.county) ||
    "";
  const state = typeof address.state === "string" ? address.state : "";
  const zipCode =
    typeof address.postcode === "string"
      ? address.postcode.replace(/[^0-9]/g, "").slice(0, 5)
      : "";

  return { street, city, state, zipCode };
}

export function validateAddressSelection(
  shippingAddress: string | null | undefined,
  selection: VerifiedAddressSelectionInput | null | undefined
): AddressVerificationResult {
  if (!shippingAddress?.trim() || !selection) {
    return { valid: false, message: INVALID_ADDRESS_MESSAGE };
  }

  if (
    !selection.label?.trim() ||
    !selection.street?.trim() ||
    !selection.city?.trim() ||
    !selection.state?.trim() ||
    !selection.zipCode?.trim() ||
    !Number.isFinite(selection.lat) ||
    !Number.isFinite(selection.lon) ||
    selection.lat < -90 ||
    selection.lat > 90 ||
    selection.lon < -180 ||
    selection.lon > 180
  ) {
    return { valid: false, message: INVALID_ADDRESS_MESSAGE };
  }

  if (normalize(shippingAddress) !== normalize(selection.label)) {
    return { valid: false, message: INVALID_ADDRESS_MESSAGE };
  }

  return { valid: true };
}

/**
 * Re-check the selected map result from the server. The browser-provided
 * selection is not trusted: the selected label is searched again and its
 * structured fields are compared before an order is allowed.
 *
 * A forward search is intentional. Nominatim coordinates for a search result
 * can land on a road or building centroid, so reverse-geocoding those
 * coordinates may return a neighboring house number.
 */
export async function verifyDeliveryAddress(
  shippingAddress: string | null | undefined,
  selection: VerifiedAddressSelectionInput | null | undefined
): Promise<AddressVerificationResult> {
  const shapeResult = validateAddressSelection(shippingAddress, selection);
  if (!shapeResult.valid || !selection) return shapeResult;

  const params = new URLSearchParams({
    q: selection.label,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    limit: "10",
  });

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "ConcordiaPharmacyCheckout/1.0 (delivery address verification)",
        },
      }
    );

    if (!response.ok) return { valid: false, message: INVALID_ADDRESS_MESSAGE };

    const results = (await response.json()) as Array<{
      address?: Record<string, unknown>;
    }>;
    if (!Array.isArray(results)) {
      return { valid: false, message: INVALID_ADDRESS_MESSAGE };
    }

    const matchingResult = results.some((result) => {
      if (!result.address) return false;
      const countryCode =
        typeof result.address.country_code === "string"
          ? result.address.country_code.toLowerCase()
          : "";
      const parsed = parseReverseAddress(result.address);

      return (
        countryCode === "us" &&
        normalize(parsed.street) === normalize(selection.street) &&
        normalize(parsed.city) === normalize(selection.city) &&
        normalizeState(parsed.state) === normalizeState(selection.state) &&
        normalize(parsed.zipCode) === normalize(selection.zipCode)
      );
    });

    return matchingResult
      ? { valid: true }
      : { valid: false, message: INVALID_ADDRESS_MESSAGE };
  } catch {
    // Do not fall back to accepting manual text if the verification provider
    // is unavailable. Delivery orders must remain safe and deterministic.
    return { valid: false, message: INVALID_ADDRESS_MESSAGE };
  }
}