import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDeliveryAddress,
  validateAddressSelection,
  verifyDeliveryAddress,
  type VerifiedAddressSelectionInput,
} from "../address-verification";

const selection: VerifiedAddressSelectionInput = {
  label: "898 East Tremont Avenue, New York, NY 10460",
  street: "898 East Tremont Avenue",
  city: "New York",
  state: "NY",
  zipCode: "10460",
  lat: 40.842,
  lon: -73.884,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateAddressSelection", () => {
  it("appends an optional apartment or unit without changing the verified street", () => {
    expect(formatDeliveryAddress(selection.label, "Apt 4B")).toBe(
      "898 East Tremont Avenue, New York, NY 10460, Apt 4B"
    );
    expect(formatDeliveryAddress(selection.label, "  ")).toBe(selection.label);
  });

  it("rejects missing selection data", () => {
    expect(
      validateAddressSelection("123 Fake Street, Bronx, NY 10451", undefined).valid
    ).toBe(false);
  });

  it("rejects text that does not match the selected map result", () => {
    expect(
      validateAddressSelection("123 Fake Street, Bronx, NY 10451", selection).valid
    ).toBe(false);
  });

  it("rejects an incomplete selected result without a ZIP code", () => {
    expect(
      validateAddressSelection(selection.label, { ...selection, zipCode: "" }).valid
    ).toBe(false);
  });
});

describe("verifyDeliveryAddress", () => {
  it("accepts a matching US map-search result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            address: {
              house_number: "898",
              road: "East Tremont Avenue",
              city: "New York",
              state: "New York",
              postcode: "10460",
              country_code: "us",
            },
          },
        ],
      })
    );

    const result = await verifyDeliveryAddress(selection.label, selection);
    expect(result.valid).toBe(true);
  });

  it("rejects a search result for a different address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            address: {
              house_number: "1",
              road: "Broadway",
              city: "New York",
              state: "New York",
              postcode: "10004",
              country_code: "us",
            },
          },
        ],
      })
    );

    const result = await verifyDeliveryAddress(selection.label, selection);
    expect(result.valid).toBe(false);
  });

  it("fails closed when the map provider is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await verifyDeliveryAddress(selection.label, selection);
    expect(result.valid).toBe(false);
  });
});