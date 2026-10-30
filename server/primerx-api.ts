interface PrimeRxApiConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  memberId: string;
  pharmacyNpi: string;
}

interface ClientIdentifier {
  ClientId: string;
  MemberId: string;
  IdentifierType: number;
  Identifier: string;
}

interface PrimeRxApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface PatientProfileResponse {
  PatientNo: number;
  FirstName: string;
  LastName: string;
  MiddleInitials: string;
  DateOfBirth: string;
  Sex: string;
  Phone: string;
  MobileNo: string;
  WorkPhoneNo: string;
  Email: string;
  Language: string;
  MRN: string;
  ChartNo: string;
  Address: { StreetLine1: string; StreetLine2: string; City: string; State: string; ZipCode: string; IsPrimary: string }[];
  Insurance: { InsCode: string; InsuranceID: string; GroupNumber: string; BinNo: string; PCN: string; IsPrimary: string }[];
  Allergies: { Name: string }[];
  Diagnosis: { DiagName: string; DiagCode: string }[];
}

interface SearchPatientResult {
  PatientNo: number;
  FirstName: string;
  LastName: string;
  DateOfBirth: string;
  Phone: string;
  Email: string;
}

interface PrescriptionDetailResponse {
  RxNo: number;
  RefillNo: number;
  AuthRefills: number;
  DaysSupply: number;
  DateFilled: string;
  DateOrdered: string;
  Status: string;
  QtyOrdered: number;
  QtyDispensed: number;
  QtyRemaining: number;
  Sig: string;
  Drug: { NDC: string; DrugName: string; Form: string; Strength: string };
  Prescriber: { PresNo: number; FirstName: string; LastName: string; NPINo: string };
  Patient: { PatientNo: number; FirstName: string; LastName: string };
}

interface RefillRequest {
  RxNo: number;
  RefillNo: number;
}

interface ChangeQueueRequest {
  RxNo: number;
  RefillNo: number;
  FromQueueName: string;
  ToQueueName: string;
  ExternalData?: string;
}

interface InsuranceRecord {
  InsCode: string;
  InsuranceID: string;
  GroupNumber: string;
  BinNo: string;
  PCN: string;
  IsPrimary: string;
  BillingSequence: number;
}

export class PrimeRxApiClient {
  private config: PrimeRxApiConfig;
  private clientIdentifier: ClientIdentifier;
  private tokenCache: TokenCache | null = null;
  private tokenRefreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.config = {
      baseUrl: process.env.PRIMERX_API_URL || "",
      clientId: process.env.PRIMERX_CLIENT_ID || "",
      clientSecret: process.env.PRIMERX_CLIENT_SECRET || "",
      memberId: process.env.PRIMERX_MEMBER_ID || "",
      pharmacyNpi: process.env.PRIMERX_PHARMACY_NPI || "",
    };

    this.clientIdentifier = {
      ClientId: this.config.clientId,
      MemberId: this.config.memberId,
      IdentifierType: 2,
      Identifier: this.config.pharmacyNpi,
    };
  }

  isConfigured(): boolean {
    return !!(this.config.baseUrl && this.config.clientId && this.config.clientSecret && this.config.memberId && this.config.pharmacyNpi);
  }

  private isTokenValid(): boolean {
    if (!this.tokenCache) return false;
    return Date.now() < this.tokenCache.expiresAt - 60000;
  }

  private async acquireToken(): Promise<string | null> {
    if (this.isTokenValid()) {
      return this.tokenCache!.token;
    }

    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this._fetchToken();
    try {
      return await this.tokenRefreshPromise;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  private async _fetchToken(): Promise<string | null> {
    const url = `${this.config.baseUrl}/api/GateKeeper/CreateToken`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ClientId: this.config.clientId,
          ClientSecret: this.config.clientSecret,
          MemberId: this.config.memberId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PrimeRx GateKeeper] CreateToken failed (${response.status}):`, errorText);
        return null;
      }

      const data = await response.json() as Record<string, unknown>;
      const token = (data.Token || data.token || data.access_token) as string | undefined;
      if (!token) {
        console.error("[PrimeRx GateKeeper] CreateToken response missing token field:", JSON.stringify(data));
        return null;
      }

      let expiresInMs = 3600000;
      const expiresIn = data.ExpiresIn || data.expires_in || data.expiresIn;
      if (typeof expiresIn === "number") {
        expiresInMs = expiresIn * 1000;
      }

      this.tokenCache = {
        token,
        expiresAt: Date.now() + expiresInMs,
      };

      console.log(`[PrimeRx GateKeeper] Token acquired, expires in ${Math.round(expiresInMs / 1000)}s`);
      return token;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrimeRx GateKeeper] CreateToken error:", message);
      return null;
    }
  }

  private async makeRequest<T>(endpoint: string, body: Record<string, unknown>, allowAuthRetry = true): Promise<PrimeRxApiResponse<T>> {
    if (!this.isConfigured()) {
      return { success: false, error: "PrimeRx API not configured. Set PRIMERX_API_URL, PRIMERX_CLIENT_ID, PRIMERX_CLIENT_SECRET, PRIMERX_MEMBER_ID, and PRIMERX_PHARMACY_NPI." };
    }

    const token = await this.acquireToken();
    if (!token) {
      return { success: false, error: "Failed to acquire PrimeRx API token via GateKeeper" };
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestBody = {
      ...body,
      ClientIdentifier: this.clientIdentifier,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        if (!allowAuthRetry) {
          // PrimeRx has no proven idempotency contract for refill mutations.
          return { success: false, error: "PrimeRx API authentication failed", statusCode: 401 };
        }
        this.tokenCache = null;
        const refreshedToken = await this.acquireToken();
        if (!refreshedToken) {
          return { success: false, error: "Failed to refresh PrimeRx API token", statusCode: 401 };
        }
        const retryResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${refreshedToken}`,
          },
          body: JSON.stringify(requestBody),
        });
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text();
          return { success: false, error: `HTTP ${retryResponse.status}: ${errorText}`, statusCode: retryResponse.status };
        }
        return { success: true, data: await retryResponse.json() as T };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PrimeRx API] ${endpoint} failed (${response.status}):`, errorText);
        return { success: false, error: `HTTP ${response.status}: ${errorText}`, statusCode: response.status };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PrimeRx API] ${endpoint} error:`, message);
      return { success: false, error: message };
    }
  }

  async getPatientProfile(patientNo: number): Promise<PrimeRxApiResponse<PatientProfileResponse>> {
    return this.makeRequest<PatientProfileResponse>("/api/Patient/Profile", {
      PatientNo: patientNo,
    });
  }

  async searchPatient(firstName: string, lastName: string): Promise<PrimeRxApiResponse<SearchPatientResult[]>> {
    return this.makeRequest<SearchPatientResult[]>("/api/Patient/Search", {
      FirstName: firstName,
      LastName: lastName,
    });
  }

  async searchPatientByPhone(phoneNumber: string): Promise<PrimeRxApiResponse<SearchPatientResult[]>> {
    return this.makeRequest<SearchPatientResult[]>("/api/Patient/SearchByPhoneNumber", {
      PhoneNumber: phoneNumber,
    });
  }

  async searchPatientByDOB(dateOfBirth: string): Promise<PrimeRxApiResponse<SearchPatientResult[]>> {
    return this.makeRequest<SearchPatientResult[]>("/api/Patient/SearchByDOB", {
      DateOfBirth: dateOfBirth,
    });
  }

  async getPrescriptionDetail(rxNo: number, refillNo: number): Promise<PrimeRxApiResponse<PrescriptionDetailResponse>> {
    return this.makeRequest<PrescriptionDetailResponse>("/api/Prescription/Detail", {
      RxNo: rxNo,
      RefillNo: refillNo,
    });
  }

  async requestRefill(rxList: RefillRequest[]): Promise<PrimeRxApiResponse<{ Success: boolean; Message: string }>> {
    return this.makeRequest("/api/Prescription/Refill", {
      RxList: rxList,
    }, false);
  }

  async updatePrescriptionNotes(rxNo: number, refillNo: number, notes: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/Prescription/Update", {
      RxNo: rxNo,
      RefillNo: refillNo,
      Notes: notes,
    });
  }

  async changeWorkflowQueue(params: ChangeQueueRequest): Promise<PrimeRxApiResponse<{ Success: boolean; Message: string }>> {
    return this.makeRequest("/api/WorkFlow/ChangeQueue", {
      RxInformation: [{
        RxNo: params.RxNo,
        RefillNo: params.RefillNo,
      }],
      FromQueueName: params.FromQueueName,
      ToQueueName: params.ToQueueName,
      ExternalData: params.ExternalData || "",
    });
  }

  async getPatientInsurances(patientNo: number): Promise<PrimeRxApiResponse<InsuranceRecord[]>> {
    return this.makeRequest<InsuranceRecord[]>("/api/PatientInsurance/Insurances", {
      PatientNo: patientNo,
    });
  }

  async getPatientAddresses(patientNo: number): Promise<PrimeRxApiResponse<{ Id: number; StreetLine1: string; StreetLine2: string; City: string; State: string; ZipCode: string; IsPrimary: string; IsActive: boolean }[]>> {
    return this.makeRequest("/api/PatientAddress/Addresses", {
      PatientNo: patientNo,
    });
  }

  async createPatient(patientData: {
    FirstName: string;
    LastName: string;
    DateOfBirth: string;
    Sex: string;
    Phone?: string;
    MobileNo?: string;
    Email?: string;
    Address?: { StreetLine1: string; StreetLine2?: string; City: string; State: string; ZipCode: string };
  }): Promise<PrimeRxApiResponse<{ PatientNo: number; Success: boolean }>> {
    return this.makeRequest("/api/Patient/Create", patientData);
  }

  async updatePatient(patientNo: number, updates: Record<string, unknown>): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/Patient/Update", {
      PatientNo: patientNo,
      ...updates,
    });
  }

  async searchPatientByExternalId(externalId: string): Promise<PrimeRxApiResponse<SearchPatientResult[]>> {
    return this.makeRequest<SearchPatientResult[]>("/api/Patient/SearchByExternalId", {
      ExternalId: externalId,
    });
  }

  async searchPatientByInsurance(params: {
    FirstName: string;
    LastName: string;
    DateOfBirth: string;
    InsuranceID: string;
  }): Promise<PrimeRxApiResponse<SearchPatientResult[]>> {
    return this.makeRequest<SearchPatientResult[]>("/api/Patient/SearchPatientByInsurance", params);
  }

  async getPrescriptionDetailByPrescriberOrder(prescriberOrderNumber: string): Promise<PrimeRxApiResponse<PrescriptionDetailResponse>> {
    return this.makeRequest<PrescriptionDetailResponse>("/api/Prescription/DetailByPrescriberOrderNumber", {
      PrescriberOrderNumber: prescriberOrderNumber,
    });
  }

  async updatePrescriptionFollowUpTag(rxNo: number, refillNo: number, tagName: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/Prescription/UpdateFollowUpTag", {
      RxNo: rxNo,
      RefillNo: refillNo,
      TagName: tagName,
    });
  }

  async getFollowUpTags(): Promise<PrimeRxApiResponse<{ Tags: { Id: number; Name: string }[] }>> {
    return this.makeRequest("/api/FollowUp/GetTags", {});
  }

  async createPatientInsurance(params: {
    PatientNo: number;
    InsCode: string;
    InsuranceID: string;
    GroupNumber?: string;
    BinNo?: string;
    PCN?: string;
    BillingSequence?: number;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientInsurance/Create", params);
  }

  async updatePatientInsurance(params: {
    PatientNo: number;
    InsCode: string;
    InsuranceID: string;
    GroupNumber?: string;
    BinNo?: string;
    PCN?: string;
    BillingSequence?: number;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientInsurance/Update", params);
  }

  async createPatientAddress(params: {
    PatientNo: number;
    StreetLine1: string;
    StreetLine2?: string;
    City: string;
    State: string;
    ZipCode: string;
    AddressType?: number;
  }): Promise<PrimeRxApiResponse<{ Success: boolean; Id: number }>> {
    return this.makeRequest("/api/PatientAddress/Create", params);
  }

  async updatePatientAddress(params: {
    Id: number;
    PatientNo: number;
    StreetLine1: string;
    StreetLine2?: string;
    City: string;
    State: string;
    ZipCode: string;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientAddress/Update", params);
  }

  async addPatientAllergy(patientNo: number, allergyName: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientAllergy/Add", {
      PatientNo: patientNo,
      AllergyName: allergyName,
    });
  }

  async deletePatientAllergy(patientNo: number, allergyName: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientAllergy/Delete", {
      PatientNo: patientNo,
      AllergyName: allergyName,
    });
  }

  async processPatientExternalAllergies(patientNo: number, allergies: { AllergyName: string; ActionType: number }[]): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientAllergy/Process", {
      PatientNo: patientNo,
      Allergies: allergies,
    });
  }

  async addPatientDiagnosis(patientNo: number, diagnosisCode: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientDiagnosis/Add", {
      PatientNo: patientNo,
      DiagnosisCode: diagnosisCode,
    });
  }

  async deletePatientDiagnosis(patientNo: number, diagnosisCode: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientDiagnosis/Delete", {
      PatientNo: patientNo,
      DiagnosisCode: diagnosisCode,
    });
  }

  async getPatientDiagnosis(patientNo: number, diagnosisCode: string): Promise<PrimeRxApiResponse<{ DiagName: string; DiagCode: string }>> {
    return this.makeRequest("/api/PatientDiagnosis/Get", {
      PatientNo: patientNo,
      DiagnosisCode: diagnosisCode,
    });
  }

  async createPatientExternalProfile(params: {
    PatientNo: number;
    ExternalId: string;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientExternalProfile/Create", params);
  }

  async deletePatientExternalProfile(params: {
    PatientNo: number;
    ExternalId: string;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/PatientExternalProfile/Delete", params);
  }

  async getPatientExternalProfile(patientNo: number): Promise<PrimeRxApiResponse<{ ExternalId: string; PatientNo: number }>> {
    return this.makeRequest("/api/PatientExternalProfile/Profile", {
      PatientNo: patientNo,
    });
  }

  async addUpdateDeliveryOrder(params: {
    RxNo: number;
    RefillNo: number;
    DeliveryMethod: string;
    DeliveryAddress?: {
      StreetLine1: string;
      StreetLine2?: string;
      City: string;
      State: string;
      ZipCode: string;
    };
    ExternalData?: string;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/Delivery/AddUpdateDeliveryOrder", params);
  }

  async createDocument(params: {
    PatientNo: number;
    DocumentName: string;
    FileData: string;
    FileFormat: string;
  }): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/Document/Create", params);
  }

  async searchDiagnosis(searchTerm: string): Promise<PrimeRxApiResponse<{ DiagName: string; DiagCode: string }[]>> {
    return this.makeRequest("/api/Diagnosis/Search", {
      SearchTerm: searchTerm,
    });
  }

  async searchAllergy(allergyName: string): Promise<PrimeRxApiResponse<{ Name: string; Id: number }[]>> {
    return this.makeRequest("/api/Allergy/Search", {
      AllergyName: allergyName,
    });
  }

  async ppaRequest(ndcList: string[]): Promise<PrimeRxApiResponse<{ Available: boolean; NDC: string }[]>> {
    return this.makeRequest("/api/PPA/PPARequest", {
      NDCList: ndcList,
    });
  }

  async updateBatchStatus(batchId: number, status: string): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/BatchManagement/UpdateBatchStatus", {
      BatchId: batchId,
      Status: status,
    });
  }

  async addUpdateBatch(params: Record<string, unknown>): Promise<PrimeRxApiResponse<{ Success: boolean; BatchId: number }>> {
    return this.makeRequest("/api/BatchManagement/AddUpdateBatch", params);
  }

  async markIntakeBatchAsProcessed(batchId: number): Promise<PrimeRxApiResponse<{ Success: boolean }>> {
    return this.makeRequest("/api/BatchManagement/MarkIntakeBatchAsProcessed", {
      BatchId: batchId,
    });
  }

  getConfigStatus(): { configured: boolean; missing: string[] } {
    const required: Record<string, string> = {
      PRIMERX_API_URL: this.config.baseUrl,
      PRIMERX_CLIENT_ID: this.config.clientId,
      PRIMERX_CLIENT_SECRET: this.config.clientSecret,
      PRIMERX_MEMBER_ID: this.config.memberId,
      PRIMERX_PHARMACY_NPI: this.config.pharmacyNpi,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    return { configured: missing.length === 0, missing };
  }

  async healthCheck(): Promise<PrimeRxApiResponse<{ Status: string }>> {
    if (!this.config.baseUrl) {
      return { success: false, error: "PrimeRx API URL not configured" };
    }

    const token = await this.acquireToken();
    if (!token) {
      return { success: false, error: "Failed to acquire token for health check" };
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/HealthCheck`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      return { success: response.ok, data: { Status: response.ok ? "OK" : "Error" }, statusCode: response.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

export const primeRxApi = new PrimeRxApiClient();
