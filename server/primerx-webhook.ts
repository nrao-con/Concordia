export interface PrimeRxPayload {
  Event: string;
  PatientNo?: number | string;
  FirstName?: string;
  LastName?: string;
  MiddleInitials?: string;
  DateOfBirth?: string;
  Sex?: string;
  PhoneNo?: string;
  MobileNo?: string;
  WorkPhoneNo?: string;
  Email?: string;
  Language?: string;
  MRN?: string;
  ChartNo?: string;
  PreferredDeliveryMethod?: string;
  SmokerCode?: string;
  PregnancyCode?: string;
  Address?: Record<string, string>[] | Record<string, string>;
  Insurance?: Record<string, string>[];
  Allergies?: { Name: string }[];
  Diagnosis?: { DiagName?: string; DiagCode?: string }[];
  RxNo?: number | string;
  RefillNo?: number;
  AuthRefills?: number;
  DaysSupply?: number;
  DateFilled?: string;
  DateOrdered?: string;
  Status?: string;
  QtyOrdered?: number;
  QtyDispensed?: number;
  QtyRemaining?: number;
  Sig?: string;
  PickedUp?: string;
  RxOriginCode?: string;
  RxOriginDescription?: string;
  DeliveryMethod?: string;
  TotalRxAmount?: number;
  PrimaryInsurancePaid?: number;
  SecondaryInsurancePaid?: number;
  TertiaryInsurancePaid?: number;
  PatientCopay?: number;
  BillType?: string;
  QueueName?: string;
  Patient?: Record<string, unknown>;
  Prescriber?: Record<string, unknown>;
  Drug?: Record<string, unknown>;
  QueueParams?: Array<{ FromQueueName?: string; ToQueueName?: string; InstanceId?: string | number; [key: string]: unknown }>;
  ScriptCoParams?: Array<{ rx_no?: string | number; [key: string]: unknown }>;
}

export interface ExtractedPatient {
  primeRxPatientId: string;
  firstName: string;
  lastName: string;
  middleInitial: string;
  dateOfBirth: Date | null;
  gender: string;
  phone: string;
  mobileNo: string;
  workPhone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  mrn?: string;
  chartNo?: string;
  language?: string;
  preferredDeliveryMethod?: string;
  smokerCode?: string;
  pregnancyCode?: string;
  insurance?: { provider: string; policyNumber: string; groupNumber: string; binNo: string; pcn: string } | null;
  insuranceList?: { provider: string; policyNumber: string; groupNumber: string; binNo: string; pcn: string; isPrimary: boolean }[];
  allergies?: string[];
  diagnosis?: string[];
}

export interface ExtractedPrescriber {
  primeRxId: string;
  firstName: string;
  lastName: string;
  phone: string;
  fax: string;
  email: string;
  npi: string;
  deaNumber: string;
  licenseNumber: string;
  medicaidProvNo: string;
  address: string;
}

export interface ExtractedDrug {
  ndc: string;
  drugName: string;
  strength: string;
  strengthUnit: string;
  form: string;
  manufacturer: string;
  lotNo: string;
  expiryDate: Date | null;
  specificProductId?: number;
  drugClass: string;
}

export interface ExtractedRxData {
  rxNumber: string;
  refillNo: number;
  authRefills: number;
  daysSupply: number;
  dateFilled: Date | null;
  dateOrdered: Date | null;
  status: string;
  qtyOrdered: number;
  qtyDispensed: number;
  qtyRemaining: number;
  sig: string;
  pickedUp: string;
  rxOriginCode: string;
  rxOriginDescription: string;
  deliveryMethod: string;
  totalRxAmount: number;
  primaryInsurancePaid: number;
  secondaryInsurancePaid: number;
  tertiaryInsurancePaid: number;
  patientCopay: number;
  billType: string;
  queueName: string;
  lotNo: string;
  drugExpiryDate: Date | null;
  drugClass: string;
}

export function parsePrimeRxDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const match1 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (match1) {
    const [, month, day, year, hours, minutes, seconds, ampm] = match1;
    let h = parseInt(hours, 10);
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && h < 12) h += 12;
      if (ampm.toUpperCase() === "AM" && h === 12) h = 0;
    }
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minutes), parseInt(seconds));
  }
  const match2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match2) {
    const [, month, day, year] = match2;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function extractAddress(addr: unknown): { address: string; city: string; state: string; zipCode: string } {
  if (!addr) return { address: "", city: "", state: "", zipCode: "" };
  if (Array.isArray(addr)) {
    const primary = addr.find((a: Record<string, string>) => a.IsPrimary === "Y") || addr[0];
    if (!primary) return { address: "", city: "", state: "", zipCode: "" };
    return {
      address: [primary.StreetLine1, primary.StreetLine2].filter(Boolean).join(", "),
      city: primary.City || "",
      state: primary.State || "",
      zipCode: primary.ZipCode || "",
    };
  }
  const obj = addr as Record<string, string>;
  return {
    address: [obj.StreetLine1, obj.StreetLine2].filter(Boolean).join(", "),
    city: obj.City || "",
    state: obj.State || "",
    zipCode: obj.ZipCode || "",
  };
}

function requiredPrimeRxIdentifier(value: unknown): string {
  const identifier = value == null ? "" : String(value).trim();
  if (!identifier || identifier === "undefined" || identifier === "null") {
    throw new Error("Missing PrimeRx identifier");
  }
  return identifier;
}

export function extractPatientFromEvent(payload: PrimeRxPayload): ExtractedPatient | null {
  const isPatientEvent = payload.Event === "PatientCreated" || payload.Event === "PatientInfoUpdated";
  if (isPatientEvent) {
    const addr = extractAddress(payload.Address);
    return {
      primeRxPatientId: requiredPrimeRxIdentifier(payload.PatientNo),
      firstName: payload.FirstName || "",
      lastName: payload.LastName || "",
      middleInitial: payload.MiddleInitials || "",
      dateOfBirth: parsePrimeRxDate(payload.DateOfBirth),
      gender: payload.Sex || "",
      phone: payload.PhoneNo || payload.MobileNo || "",
      mobileNo: payload.MobileNo || "",
      workPhone: payload.WorkPhoneNo || "",
      email: payload.Email || "",
      address: addr.address,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zipCode,
      mrn: payload.MRN || "",
      chartNo: payload.ChartNo || "",
      language: payload.Language || "",
      preferredDeliveryMethod: payload.PreferredDeliveryMethod || "",
      smokerCode: payload.SmokerCode || "",
      pregnancyCode: payload.PregnancyCode || "",
      insurance: extractInsurance(payload.Insurance),
      insuranceList: extractInsuranceList(payload.Insurance),
      allergies: extractAllergies(payload.Allergies),
      diagnosis: extractDiagnosis(payload.Diagnosis),
    };
  }

  if (payload.Patient) {
    const p = payload.Patient as Record<string, unknown>;
    const addr = extractAddress(p.Address);
    return {
      primeRxPatientId: requiredPrimeRxIdentifier(p.PatientNo),
      firstName: String(p.FirstName || ""),
      lastName: String(p.LastName || ""),
      middleInitial: String(p.MiddleInitials || ""),
      dateOfBirth: parsePrimeRxDate(p.DOB as string || p.DateOfBirth as string),
      gender: String(p.Gender || p.Sex || ""),
      phone: String(p.Phone || p.MobileNo || ""),
      mobileNo: String(p.MobileNo || ""),
      workPhone: String(p.WorkPhone || ""),
      email: String(p.Email || ""),
      address: addr.address,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zipCode,
      language: String(p.Language || ""),
    };
  }
  return null;
}

function extractInsurance(ins: Record<string, string>[] | undefined): { provider: string; policyNumber: string; groupNumber: string; binNo: string; pcn: string } | null {
  if (!ins || !Array.isArray(ins) || ins.length === 0) return null;
  const primary = ins.find((i) => i.IsPrimary === "Y") || ins[0];
  return {
    provider: primary.InsCode || "",
    policyNumber: primary.InsuranceID || "",
    groupNumber: primary.GroupNumber || "",
    binNo: primary.BinNo || "",
    pcn: primary.PCN || "",
  };
}

function extractInsuranceList(ins: Record<string, string>[] | undefined): { provider: string; policyNumber: string; groupNumber: string; binNo: string; pcn: string; isPrimary: boolean }[] {
  if (!ins || !Array.isArray(ins) || ins.length === 0) return [];
  return ins.map((i) => ({
    provider: i.InsCode || "",
    policyNumber: i.InsuranceID || "",
    groupNumber: i.GroupNumber || "",
    binNo: i.BinNo || "",
    pcn: i.PCN || "",
    isPrimary: i.IsPrimary === "Y",
  }));
}

function extractAllergies(allergies: { Name: string }[] | undefined): string[] {
  if (!allergies || !Array.isArray(allergies)) return [];
  return allergies
    .filter((a) => a.Name && a.Name !== "No Known Allergies")
    .map((a) => a.Name);
}

function extractDiagnosis(diag: { DiagName?: string; DiagCode?: string }[] | undefined): string[] {
  if (!diag || !Array.isArray(diag)) return [];
  return diag
    .filter((d) => d.DiagName || d.DiagCode)
    .map((d) => d.DiagName ? `${d.DiagName} (${d.DiagCode || ""})` : (d.DiagCode || ""));
}

export function extractPrescriberFromEvent(payload: PrimeRxPayload): ExtractedPrescriber | null {
  const prescriber = payload.Prescriber as Record<string, unknown> | undefined;
  if (!prescriber) return null;
  const addr = extractAddress(prescriber.Address);
  return {
    primeRxId: String(prescriber.PresNo || ""),
    firstName: String(prescriber.FirstName || ""),
    lastName: String(prescriber.LastName || ""),
    phone: String(prescriber.Phone || ""),
    fax: String(prescriber.FaxNo || ""),
    email: String(prescriber.Email || ""),
    npi: String(prescriber.NPINo || ""),
    deaNumber: String(prescriber.DEARegNo || ""),
    licenseNumber: String(prescriber.LicenseNo || ""),
    medicaidProvNo: String(prescriber.MedicaidProvNo || ""),
    address: [addr.address, addr.city, addr.state, addr.zipCode].filter(Boolean).join(", "),
  };
}

export function extractDrugFromEvent(payload: PrimeRxPayload): ExtractedDrug | null {
  const drug = payload.Drug as Record<string, string | number | undefined> | undefined;
  if (!drug) return null;
  return {
    ndc: String(drug.NDC || ""),
    drugName: String(drug.DrugName || ""),
    strength: String(drug.Strong || drug.Strength || ""),
    strengthUnit: String(drug.StrengthUM || ""),
    form: String(drug.Form || ""),
    manufacturer: String(drug.ManufacturerName || ""),
    lotNo: String(drug.LotNo || ""),
    expiryDate: parsePrimeRxDate(drug.ExpiryDate as string | undefined),
    specificProductId: drug.SpecificProductID as number | undefined,
    drugClass: String(drug.Class || ""),
  };
}

export function extractRxDataFromEvent(payload: PrimeRxPayload): ExtractedRxData {
  return {
    rxNumber: requiredPrimeRxIdentifier(payload.RxNo),
    refillNo: payload.RefillNo ?? 0,
    authRefills: payload.AuthRefills ?? 0,
    daysSupply: payload.DaysSupply ?? 0,
    dateFilled: parsePrimeRxDate(payload.DateFilled),
    dateOrdered: parsePrimeRxDate(payload.DateOrdered),
    status: payload.Status || "",
    qtyOrdered: payload.QtyOrdered ?? 0,
    qtyDispensed: payload.QtyDispensed ?? 0,
    qtyRemaining: payload.QtyRemaining ?? 0,
    sig: payload.Sig || "",
    pickedUp: payload.PickedUp || "N",
    rxOriginCode: payload.RxOriginCode || "",
    rxOriginDescription: payload.RxOriginDescription || "",
    deliveryMethod: payload.DeliveryMethod || "",
    totalRxAmount: payload.TotalRxAmount ?? 0,
    primaryInsurancePaid: payload.PrimaryInsurancePaid ?? 0,
    secondaryInsurancePaid: payload.SecondaryInsurancePaid ?? 0,
    tertiaryInsurancePaid: payload.TertiaryInsurancePaid ?? 0,
    patientCopay: payload.PatientCopay ?? 0,
    billType: payload.BillType || "",
    queueName: payload.QueueName || "",
    lotNo: String((payload.Drug as Record<string, unknown>)?.LotNo || ""),
    drugExpiryDate: parsePrimeRxDate((payload.Drug as Record<string, unknown>)?.ExpiryDate as string | undefined),
    drugClass: String((payload.Drug as Record<string, unknown>)?.Class || ""),
  };
}

const PRIMERX_EVENT_TO_WORKFLOW: Record<string, string> = {
  RxSaved: "received",
  RxBilled: "billed",
  LabelPrinted: "label_printed",
  DPVDone: "dpv_verified",
  RphVDone: "rph_verified",
  RxDelivery: "ready_for_delivery",
  RxShipped: "out_for_delivery",
  RxFiled: "filed",
  RxReversed: "reversed",
  RxTransmissionRejected: "rejected",
  RxDeleted: "reversed",
};

export function mapEventToWorkflowStatus(event: string): string {
  return PRIMERX_EVENT_TO_WORKFLOW[event] || "received";
}

export function extractWorkflowTransition(payload: PrimeRxPayload): { rxNo: string; fromQueue: string; toQueue: string } | null {
  if (payload.Event !== "WorkFlowQueueChanged" && payload.Event !== "WorkflowTransition") return null;

  if (payload.QueueParams && Array.isArray(payload.QueueParams) && payload.QueueParams.length > 0) {
    const qp = payload.QueueParams[0];
    return {
      rxNo: String(payload.ScriptCoParams?.[0]?.rx_no || qp.InstanceId || ""),
      fromQueue: qp.FromQueueName || "",
      toQueue: qp.ToQueueName || "",
    };
  }

  if (payload.RxNo) {
    return {
      rxNo: String(payload.RxNo),
      fromQueue: "",
      toQueue: payload.QueueName || "",
    };
  }
  return null;
}

export const PRIMERX_EVENT_TYPES = [
  "PatientCreated",
  "PatientInfoUpdated",
  "RxSaved",
  "RxBilled",
  "RxDelivery",
  "RxShipped",
  "RxFiled",
  "RxReversed",
  "RxTransmissionRejected",
  "RxDeleted",
  "LabelPrinted",
  "DPVDone",
  "RphVDone",
  "WorkflowTransition",
  "WorkFlowQueueChanged",
] as const;

export function isPrimeRxNativePayload(body: unknown): body is PrimeRxPayload {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return typeof candidate.Event === "string" && (PRIMERX_EVENT_TYPES as readonly string[]).includes(candidate.Event);
}

export function isPatientEvent(event: string): boolean {
  return event === "PatientCreated" || event === "PatientInfoUpdated";
}

export function isRxEvent(event: string): boolean {
  return [
    "RxSaved", "RxBilled", "RxDelivery", "RxShipped", "RxFiled",
    "RxReversed", "RxTransmissionRejected", "RxDeleted",
    "LabelPrinted", "DPVDone", "RphVDone",
  ].includes(event);
}

export function isWorkflowEvent(event: string): boolean {
  return event === "WorkflowTransition" || event === "WorkFlowQueueChanged";
}
