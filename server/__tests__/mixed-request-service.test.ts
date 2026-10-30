import { afterEach, describe, expect, it, vi } from "vitest";

const { submitPharmFlows, notifyStaffAppSale } = vi.hoisted(() => ({
  submitPharmFlows: vi.fn().mockResolvedValue({ submitted: true, response: {} }),
  notifyStaffAppSale: vi.fn().mockResolvedValue(true),
}));

vi.mock("../pharmflows-client", () => ({
  buildPharmFlowsRequest: (input: any) => input,
  submitPharmFlows,
}));
vi.mock("../staff-sync", () => ({ notifyStaffAppSale }));
vi.mock("../staff-catalog", () => ({ verifyStaffAvailability: vi.fn().mockResolvedValue(true) }));

import { processMixedRequest } from "../mixed-request-service";

const user = {
  id: "patient-1", firstName: "Ada", lastName: "Patient",
  dateOfBirth: "1980-01-02", phoneNumber: "555-0100", email: "ada@example.test",
};
const rx = { id: "rx-1", userId: "patient-1", medicationName: "Owned medicine", dosage: "10 mg", quantity: 1 };
const product = { id: "prod-1", name: "Soap", price: "4.50", requiresPrescription: false, inStock: true, stockQuantity: 5 };
const selection = {
  label: "1 Verified Street, New York, NY 10001", street: "1 Verified Street",
  city: "New York", state: "NY", zipCode: "10001", lat: 40, lon: -73,
};

function storage(overrides: Record<string, unknown> = {}) {
  return {
    getUser: vi.fn().mockResolvedValue(user),
    getPrescription: vi.fn().mockResolvedValue(rx),
    getProduct: vi.fn().mockResolvedValue(product),
    createOrder: vi.fn().mockResolvedValue({ id: "order-1" }),
    createOrderItem: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("processMixedRequest", () => {
  it("sends Rx-only requests only to PharmFlows", async () => {
    const result = await processMixedRequest("patient-1", {
      prescriptionIds: ["rx-1"], products: [], deliveryMethod: "pickup",
    }, storage(), "corr-rx");

    expect(result.ok).toBe(true);
    expect(submitPharmFlows).toHaveBeenCalledOnce();
    expect(notifyStaffAppSale).not.toHaveBeenCalled();
  });

  it("sends grocery-only requests only to staff", async () => {
    const result = await processMixedRequest("patient-1", {
      prescriptionIds: [], products: [{ productId: "prod-1", quantity: 2 }], deliveryMethod: "pickup",
    }, storage(), "corr-grocery");

    expect(result.ok).toBe(true);
    expect(submitPharmFlows).not.toHaveBeenCalled();
    expect(notifyStaffAppSale).toHaveBeenCalledOnce();
  });

  it("keeps mixed destination payloads separate while sharing correlation ID", async () => {
    await processMixedRequest("patient-1", {
      prescriptionIds: ["rx-1"], products: [{ productId: "prod-1", quantity: 1 }],
      deliveryMethod: "pickup",
    }, storage(), "corr-mixed");

    const pharmacy = submitPharmFlows.mock.calls[0][0];
    const staff = notifyStaffAppSale.mock.calls[0];
    expect(pharmacy.medications).toEqual([{ name: "Owned medicine", dosage: "10 mg", quantity: 1 }]);
    expect(pharmacy).not.toHaveProperty("products");
    expect(staff[2]).toMatchObject({ correlationId: "corr-mixed" });
    expect(staff[1]).toEqual([{ productId: "prod-1", quantity: 1 }]);
  });

  it("rejects foreign prescriptions before calling either integration", async () => {
    const result = await processMixedRequest("patient-1", {
      prescriptionIds: ["rx-1"], products: [{ productId: "prod-1", quantity: 1 }], deliveryMethod: "pickup",
    }, storage({ getPrescription: vi.fn().mockResolvedValue({ ...rx, userId: "other-patient" }) }), "corr-owner");

    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(submitPharmFlows).not.toHaveBeenCalled();
    expect(notifyStaffAppSale).not.toHaveBeenCalled();
  });

  it("requires DOB only for requests containing prescriptions", async () => {
    const noDob = { ...user, dateOfBirth: null };
    const s = storage({ getUser: vi.fn().mockResolvedValue(noDob) });
    const rxResult = await processMixedRequest("patient-1", {
      prescriptionIds: ["rx-1"], deliveryMethod: "pickup",
    }, s, "corr-dob-rx");
    expect(rxResult).toMatchObject({ ok: false, status: 422 });

    const otcResult = await processMixedRequest("patient-1", {
      products: [{ productId: "prod-1", quantity: 1 }], deliveryMethod: "pickup",
    }, s, "corr-dob-otc");
    expect(otcResult.ok).toBe(true);
  });

  it("passes only the verified formatted address downstream", async () => {
    await processMixedRequest("patient-1", {
      prescriptionIds: ["rx-1"], products: [{ productId: "prod-1", quantity: 1 }],
      deliveryMethod: "delivery", shippingAddress: "1 verified street, new york, ny 10001",
      shippingAddressUnit: "Apt 4B", shippingAddressVerification: selection,
    }, storage(), "corr-address");

    expect(submitPharmFlows.mock.calls[0][0].deliveryAddress)
      .toBe("1 Verified Street, New York, NY 10001, Apt 4B");
    expect(notifyStaffAppSale.mock.calls[0][2].shippingAddress)
      .toBe("1 Verified Street, New York, NY 10001, Apt 4B");
  });
});