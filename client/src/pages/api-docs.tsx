import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Lock,
  Users,
  Heart,
  Star,
  Pill,
  ShoppingCart,
  Package,
  Activity,
  ArrowLeft,
  BarChart3,
} from "lucide-react";
import { Link } from "wouter";

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    POST: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary/60",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    PATCH: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${colors[method] || "bg-muted text-muted-foreground"}`} data-testid={`badge-method-${method.toLowerCase()}`}>
      {method}
    </span>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-md border bg-muted/50 dark:bg-muted/20 my-2">
      {title && <div className="px-3 py-1.5 border-b text-xs font-medium text-muted-foreground">{title}</div>}
      <div className="flex items-start">
        <pre className="flex-1 p-3 text-xs overflow-x-auto"><code>{children}</code></pre>
        <Button
          size="icon"
          variant="ghost"
          className="m-1 h-7 w-7 shrink-0"
          onClick={handleCopy}
          data-testid="button-copy-code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover-elevate rounded px-2 py-1 w-full text-left"
        data-testid={`button-toggle-${title.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && <div className="ml-5 mt-1">{children}</div>}
    </div>
  );
}

interface EndpointProps {
  method: string;
  path: string;
  description: string;
  request?: string;
  response?: string;
  notes?: string[];
  queryParams?: string;
  exampleRequest?: string;
  exampleResponse?: string;
}

function Endpoint({ method, path, description, request, response, notes, queryParams, exampleRequest, exampleResponse }: EndpointProps) {
  return (
    <div className="border rounded-md p-4 mb-3" data-testid={`endpoint-${method.toLowerCase()}-${path.replace(/[/:]/g, "-")}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-semibold">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      {queryParams && (
        <div className="mb-2">
          <p className="text-xs font-medium mb-1">Query Parameters</p>
          <code className="text-xs bg-muted/50 dark:bg-muted/20 px-2 py-0.5 rounded">{queryParams}</code>
        </div>
      )}
      {request && (
        <div className="mb-2">
          <p className="text-xs font-medium mb-1">Request Body</p>
          <CodeBlock>{request}</CodeBlock>
        </div>
      )}
      {response && (
        <div className="mb-2">
          <p className="text-xs font-medium mb-1">Response</p>
          <CodeBlock>{response}</CodeBlock>
        </div>
      )}
      {notes && notes.length > 0 && (
        <div className="mt-2 space-y-1">
          {notes.map((note, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      )}
      {(exampleRequest || exampleResponse) && (
        <Collapsible title="Example">
          {exampleRequest && <CodeBlock title="Request">{exampleRequest}</CodeBlock>}
          {exampleResponse && <CodeBlock title="Response">{exampleResponse}</CodeBlock>}
        </Collapsible>
      )}
    </div>
  );
}

const sections = [
  { id: "auth", label: "Authentication", icon: Lock },
  { id: "matching", label: "Patient Matching", icon: Users },
  { id: "patients", label: "Patient Data", icon: Heart },
  { id: "loyalty", label: "Loyalty & Rewards", icon: Star },
  { id: "blister", label: "Blister Packs", icon: Pill },
  { id: "analytics", label: "Analytics & Insights", icon: BarChart3 },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "products", label: "Products", icon: Package },
  { id: "primerx", label: "PrimeRx Webhooks", icon: Activity },
  { id: "alerts", label: "Pharmacy Alerts", icon: Activity },
];

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState("auth");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-api-docs">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-page-title">ConcordiaCare External API</h1>
              <p className="text-xs text-muted-foreground">Integration Reference for App & Dashboard Teams</p>
            </div>
          </div>
          <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">v1.0</Badge>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        <nav className="hidden lg:block w-56 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r p-4 space-y-1" data-lenis-prevent data-testid="nav-sidebar">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`flex items-center gap-2 w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover-elevate"
              }`}
              data-testid={`nav-${s.id}`}
            >
              <s.icon className="h-3.5 w-3.5 shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-4 lg:p-6 space-y-8 pb-24" data-testid="content-main">

          <section id="auth">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-auth">
              <Lock className="h-5 w-5" /> Authentication
            </h2>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm mb-3">All external API endpoints require an API key sent via the <code className="bg-muted/50 dark:bg-muted/20 px-1 rounded text-xs">X-API-KEY</code> header.</p>
                <CodeBlock title="Required Header">{`X-API-KEY: <your-api-key>`}</CodeBlock>
                <p className="text-sm text-muted-foreground mt-3 mb-2">CORS is enabled for the following origins:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li><code className="text-xs">concordia-care.replit.app</code></li>
                  <li><code className="text-xs">pharmflows.com</code></li>
                </ul>
                <div className="mt-4 p-3 border rounded-md bg-muted/30 dark:bg-muted/10">
                  <p className="text-xs font-medium mb-1">Error Responses</p>
                  <p className="text-xs text-muted-foreground">Missing or invalid API key returns <code className="bg-muted/50 dark:bg-muted/20 px-1 rounded">401</code> with <code className="bg-muted/50 dark:bg-muted/20 px-1 rounded">{`{"message": "Invalid or missing API key"}`}</code></p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="matching">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-matching">
              <Users className="h-5 w-5" /> Patient Matching & Linking
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Match app users to existing pharmacy patient records using multi-field scoring, or explicitly link them by ID.</p>

            <Endpoint
              method="POST"
              path="/api/external/match-patient"
              description="Smart patient matching using scored multi-field comparison. Requires at least email or phone. Match score >= 2 required (out of 4: name, DOB, email, phone)."
              request={`{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "dateOfBirth": "string (optional, ISO date)",
  "email": "string (optional, but email or phone required)",
  "phoneNumber": "string (optional, but email or phone required)",
  "concordiaCareUserId": "string (optional, auto-links on match)"
}`}
              response={`// When matched (score >= 2):
{
  "matched": true,
  "matchScore": 3,
  "patient": {
    "id": "uuid",
    "primeRxPatientId": "PRX-1001",
    "concordiaCareUserId": "app-user-123",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "dateOfBirth": "ISO date",
    "gender": "string",
    "address": "string",
    "familyGroupId": "string | null",
    "familyMembers": [{ "id", "firstName", "lastName" }],
    "insurance": { "provider", "policyNumber", "groupNumber" },
    "allergies": "string",
    "medicalConditions": "string",
    "diagnosis": "string",
    "doctors": [{ "id", "firstName", "lastName", "specialty", "phone", "npi" }],
    "medications": [{ "name", "dosage", "frequency", "intakeTimes", "instructions" }],
    "prescriptions": [{ "id", "rxNumber", "medicationName", "dosage", "refillsRemaining", "status" }],
    "caregiver": { "id", "firstName", "lastName", "phone" } | null,
    "blisterPackStatus": "string | null",
    "loyalty": {
      "currentBalance": 0,
      "lifetimeEarned": 0,
      "lifetimeRedeemed": 0,
      "streaks": [{ "type", "currentCount", "bestCount" }]
    }
  }
}

// When no match:
{ "matched": false }`}
              notes={[
                "Scoring: +1 for name match (case-insensitive), +1 for DOB match, +1 for email match, +1 for phone match",
                "If concordiaCareUserId is provided and a match is found, auto-links (unless already linked elsewhere)",
                "Returns 400 if neither email nor phone is provided"
              ]}
              exampleRequest={`{
  "firstName": "Maria",
  "lastName": "Santos",
  "email": "maria.santos@email.com",
  "dateOfBirth": "1985-03-15",
  "concordiaCareUserId": "app-user-maria-123"
}`}
            />

            <Endpoint
              method="POST"
              path="/api/external/link-patient"
              description="Explicitly link a ConcordiaCare app user ID to an existing pharmacy patient record."
              request={`{
  "concordiaCareUserId": "string (required)",
  "pharmacyPatientId": "string (required, user UUID)"
}`}
              response={`{
  "success": true,
  "message": "Patient linked to app user",
  "patientId": "uuid"
}`}
              notes={[
                "Returns 404 if patient not found",
                "Returns 400 if target account is not a patient role",
                "Returns 409 if concordiaCareUserId is already linked to a different patient",
              ]}
            />
          </section>

          <section id="patients">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-patients">
              <Heart className="h-5 w-5" /> Patient Data
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Retrieve full patient profiles including demographics, doctors, medications, prescriptions, and loyalty data.</p>

            <Endpoint
              method="GET"
              path="/api/external/patients"
              description="List all patients with full enriched profiles."
              response={`[
  {
    "id": "uuid",
    "primeRxPatientId": "string | null",
    "concordiaCareUserId": "string | null",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "dateOfBirth": "ISO date",
    "gender": "string",
    "address": "string",
    "insurance": { "provider", "policyNumber", "groupNumber" },
    "allergies": "string",
    "medicalConditions": "string",
    "diagnosis": "string",
    "familyGroupId": "string | null",
    "familyMembers": [{ "id", "firstName", "lastName" }],
    "doctors": [{ "id", "firstName", "lastName", "specialty", "phone", "npi" }],
    "medications": [...],
    "prescriptions": [{ "id", "rxNumber", "medicationName", "dosage", "refillsRemaining", "status" }],
    "caregiver": { "id", "firstName", "lastName", "phone" } | null,
    "blisterPackStatus": "string | null",
    "loyalty": {
      "currentBalance": 0,
      "lifetimeEarned": 0,
      "streaks": [{ "type", "currentCount" }]
    }
  }
]`}
            />

            <Endpoint
              method="GET"
              path="/api/external/patients/:id"
              description="Get a single patient's full profile with adherence stats and caregiver permissions."
              response={`{
  "id": "uuid",
  "primeRxPatientId": "string | null",
  "concordiaCareUserId": "string | null",
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "dateOfBirth": "ISO date",
  "gender": "string",
  "address": "string",
  "insurance": { "provider", "policyNumber", "groupNumber" },
  "allergies": "string",
  "medicalConditions": "string",
  "diagnosis": "string",
  "familyGroupId": "string | null",
  "familyMembers": [...],
  "doctors": [...],
  "medications": [...],
  "prescriptions": [...],
  "adherence": {
    "totalDoses": 0,
    "takenDoses": 0,
    "rate": null
  },
  "caregiver": {
    "id": 2,
    "firstName": "string",
    "lastName": "string",
    "phone": "string",
    "permissions": {
      "canManagePrescriptions": true,
      "canViewMedicalInfo": true,
      "canRequestRefills": true
    }
  } | null,
  "blisterPackStatus": "string | null",
  "loyalty": {
    "currentBalance": 0,
    "lifetimeEarned": 0,
    "lifetimeRedeemed": 0,
    "streaks": [{ "type", "currentCount", "bestCount" }]
  }
}`}
            />

            <Endpoint
              method="GET"
              path="/api/external/patients/updated-since/:timestamp"
              description="Get patients modified after a given timestamp (for delta sync). Returns a lightweight subset for efficient syncing."
              response={`[
  {
    "id": "uuid",
    "primeRxPatientId": "string | null",
    "firstName": "string",
    "lastName": "string",
    "phone": "string",
    "email": "string",
    "updatedAt": "ISO date"
  }
]`}
              notes={[
                "Timestamp parameter is a Unix epoch in milliseconds (e.g. 1710000000000)",
                "Returns a minimal patient summary (not the full enriched profile). Use GET /patients/:id for full details",
              ]}
            />
          </section>

          <section id="loyalty">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-loyalty">
              <Star className="h-5 w-5" /> Loyalty & Rewards
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Points wallet, transaction history, rewards catalog, and redemption.</p>

            <Endpoint
              method="GET"
              path="/api/external/patients/:id/wallet"
              description="Get the patient's points wallet balance and active streaks."
              response={`{
  "wallet": {
    "currentBalance": 250,
    "lifetimeEarned": 500,
    "lifetimeRedeemed": 200,
    "lifetimeExpired": 50,
    "dailyPointsEarned": 20,
    "weeklyPointsEarned": 120
  },
  "streaks": [
    {
      "type": "on_time_refill",
      "currentCount": 5,
      "bestCount": 8,
      "lastQualifyingActionAt": "ISO date"
    }
  ]
}`}
            />

            <Endpoint
              method="GET"
              path="/api/external/patients/:id/points-history"
              description="Get the patient's points transaction ledger."
              queryParams="?limit=50 (default 50)"
              response={`[
  {
    "id": 1,
    "actionType": "on_time_refill",
    "points": 50,
    "balanceAfter": 250,
    "description": "On-time refill bonus",
    "referenceType": "prescription",
    "referenceId": "rx-uuid",
    "createdAt": "ISO date"
  }
]`}
            />

            <Endpoint
              method="GET"
              path="/api/external/patients/:id/rewards"
              description="Get available rewards catalog with the patient's eligibility (can they afford it)."
              response={`{
  "currentBalance": 250,
  "availableRewards": [
    {
      "id": 1,
      "name": "Free Lip Balm",
      "description": "Redeem for a free lip balm",
      "pointsCost": 50,
      "rewardType": "product",
      "discountValue": 100,
      "discountType": "percentage",
      "canAfford": true
    }
  ],
  "allActiveRewards": [
    {
      "id": 1,
      "name": "Free Lip Balm",
      "description": "...",
      "pointsCost": 50,
      "rewardType": "product",
      "discountValue": 100,
      "discountType": "percentage"
    }
  ]
}`}
              notes={[
                "availableRewards: rewards the user qualifies for (includes canAfford flag)",
                "allActiveRewards: full catalog regardless of user eligibility",
              ]}
            />

            <Endpoint
              method="POST"
              path="/api/external/patients/:id/rewards/:rewardId/redeem"
              description="Redeem a reward for the patient. Deducts points and creates a redemption record."
              request={`{
  "orderId": "string (optional, link to an order)"
}`}
              response={`{
  "success": true,
  "redemption": {
    "id": 1,
    "userId": "uuid",
    "rewardId": 1,
    "pointsSpent": 50,
    "status": "redeemed",
    "createdAt": "ISO date"
  },
  "updatedBalance": 200
}`}
              notes={[
                "Returns 400 if the user cannot afford the reward",
                "Returns 400 with reason if the reward is not redeemable",
              ]}
            />

            <Endpoint
              method="GET"
              path="/api/external/earning-rules"
              description="Get all active earning rules. Use this for the 'Ways to Earn' display in the app."
              response={`[
  {
    "id": 1,
    "ruleKey": "on_time_refill",
    "actionType": "on_time_refill",
    "name": "On-Time Refill",
    "description": "Earn points for refilling on time",
    "basePoints": 50,
    "pointsPerDollar": null,
    "category": "adherence"
  }
]`}
              notes={[
                "No patient ID required. These are global rules.",
                "basePoints: flat points awarded per action",
                "pointsPerDollar: if set, points scale with purchase amount (e.g. OTC purchases)",
              ]}
            />
          </section>

          <section id="analytics">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-analytics">
              <BarChart3 className="h-5 w-5" /> Analytics & Insights
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Operational analytics for PharmFlow dashboard and per-patient behavioral insights for the ConcordiaCare app.
            </p>

            <Endpoint
              method="GET"
              path="/api/external/pharmflow/insights"
              description="PharmFlow operational analytics: order processing volume, delivery method breakdown, courier performance metrics, and pickup versus delivery rates."
              response={`{
  "processing": {
    "total": 42,
    "completed": 30,
    "pending": 5,
    "processing": 4,
    "cancelled": 3
  },
  "deliveryMethodBreakdown": [
    { "method": "pickup", "count": 20, "percentage": 48 },
    { "method": "delivery", "count": 22, "percentage": 52 }
  ],
  "courierBreakdown": [
    {
      "courier": "Burq",
      "count": 14,
      "percentage": 64,
      "avgDeliveryHours": 2.5,
      "successRate": 93
    },
    {
      "courier": "PKGSEND",
      "count": 8,
      "percentage": 36,
      "avgDeliveryHours": 4.1,
      "successRate": 88
    }
  ],
  "pickupVsDeliveryRate": {
    "pickup": 20,
    "delivery": 22,
    "pickupPercent": 48,
    "deliveryPercent": 52
  }
}`}
              notes={[
                "Aggregates data across all orders in the system",
                "avgDeliveryHours: average hours from order creation to actual delivery (null if no deliveries)",
                "successRate: percentage of delivered orders vs failed/returned (null if no terminal outcomes)",
                "Designed for the PharmFlow dashboard's analytics panels",
              ]}
            />

            <Endpoint
              method="GET"
              path="/api/external/patients/:id/insights"
              description="Per-patient behavioral analytics: order history, spending patterns, delivery preferences, and predicted delivery method."
              response={`{
  "patientId": "uuid",
  "firstName": "John",
  "lastName": "Doe",
  "totalOrders": 15,
  "totalSpending": 487.50,
  "monthlyAvgSpending": 81.25,
  "orderTypeBreakdown": [
    { "type": "prescription", "count": 10, "percentage": 67 },
    { "type": "OTC", "count": 3, "percentage": 20 },
    { "type": "mixed", "count": 2, "percentage": 13 }
  ],
  "deliveryMethodBreakdown": [
    { "method": "pickup", "count": 5, "percentage": 33 },
    { "method": "delivery", "count": 10, "percentage": 67 }
  ],
  "courierBreakdown": [
    { "courier": "Burq", "count": 7, "percentage": 70 },
    { "courier": "PKGSEND", "count": 3, "percentage": 30 }
  ],
  "predictedDeliveryPreference": "Burq (70%)",
  "recentOrders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-001",
      "type": "prescription",
      "total": "45.00",
      "deliveryMethod": "delivery",
      "courierPartner": "Burq",
      "status": "completed",
      "createdAt": "ISO date"
    }
  ]
}`}
              notes={[
                "Returns 404 if the patient ID does not exist",
                "predictedDeliveryPreference: majority delivery method from the last 10 orders (requires 3+ orders)",
                "recentOrders: last 5 orders for quick reference",
                "monthlyAvgSpending: calculated from total spending divided by months since first order",
                "Designed for ConcordiaCare app's patient profile and delivery predictions",
              ]}
            />
          </section>

          <section id="blister">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-blister">
              <Pill className="h-5 w-5" /> Blister Packs
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Medication blister pack data and dose log synchronization.</p>

            <Endpoint
              method="GET"
              path="/api/external/blister-packs"
              description="List all blister pack patients with their medication schedules."
              response={`[
  {
    "id": 1,
    "userId": "uuid",
    "firstName": "string",
    "lastName": "string",
    "status": "active",
    "medications": [
      {
        "name": "Metformin",
        "dosage": "500mg",
        "frequency": "twice daily",
        "intakeTimes": ["morning", "evening"],
        "instructions": "Take with meals"
      }
    ],
    "concordiaCareBlisterPackId": "string | null",
    "lastSyncedToApp": "ISO date | null"
  }
]`}
            />

            <Endpoint
              method="GET"
              path="/api/external/blister-packs/updated-since/:timestamp"
              description="Get blister pack patients modified since a given ISO timestamp (for delta sync)."
            />

            <Endpoint
              method="GET"
              path="/api/external/blister-packs/:id"
              description="Get a single blister pack patient by ID."
            />

            <Endpoint
              method="POST"
              path="/api/external/blister-pack-sync"
              description="Push dose logs, status updates, and medication changes from the app back to the website."
              request={`{
  "concordiaCareBlisterPackId": "string (required)",
  "status": "active | pending | paused | discontinued (optional)",
  "medications": [...] (optional, replaces medication list),
  "doseLog": [
    {
      "medicationName": "string",
      "timeSlot": "morning | afternoon | evening | night",
      "scheduledDate": "ISO date",
      "status": "taken | skipped | snoozed | missed (default: taken)",
      "takenAt": "ISO date (optional)",
      "notes": "string (optional)"
    }
  ]
}`}
              notes={[
                "concordiaCareBlisterPackId is required to identify the patient",
                "status, medications, and doseLog are all optional. Send only what changed.",
                "App status 'paused' maps to website 'on_hold'",
              ]}
            />
          </section>

          <section id="orders">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-orders">
              <ShoppingCart className="h-5 w-5" /> Orders
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Submit orders from the app and sync order status updates.</p>

            <Endpoint
              method="POST"
              path="/api/external/orders"
              description="Submit a pending collect-at-counter order from the app. Online card payments are currently unavailable; use paymentStatus=collect_at_counter for pickup orders."
              request={`{
  "customer": {
    "firstName": "string (required)",
    "lastName": "string (required)",
    "email": "string (optional)",
    "phone": "string (optional)",
    "userId": "string (optional, if already known)"
  },
  "items": [
    {
      "productId": "uuid (recommended for catalog stock tracking)",
      "productName": "string (optional)",
      "quantity": 1,
      "price": 9.99
    }
  ],
  "type": "otc | prescription | mixed (default: otc)",
   "deliveryMethod": "pickup (required for pay-at-counter; defaults to pickup)",
  "subtotal": "number or string (required)",
  "total": "number or string (required)",
  "status": "pending | processing | completed | cancelled (new orders normalize to pending)",
  "notes": "string (optional)",
  "paymentStatus": "collect_at_counter (default: collect_at_counter)"
}`}
              notes={[
                "Auto-matches customer by email or phone if userId not provided",
                "Creates a new patient account if no match found",
                "Order is tagged with source='app' for channel attribution",
              ]}
            />

            <Endpoint
              method="POST"
              path="/api/orders/sync"
              description="Upsert an order from the app using concordiaCareOrderId as the unique key. Creates new or updates existing."
              request={`{
  "concordiaCareOrderId": "number or string (required, unique key)",
  "patientName": "string (required)",
  "patientId": "string (optional)",
  "patientEmail": "string (optional)",
  "patientPhone": "string (optional)",
  "items": [
    {
      "productName": "string",
      "productType": "string (optional)",
      "quantity": 1
    }
  ],
  "orderType": "otc | prescription | mixed (default: otc)",
  "status": "preparing | received | verified | ready | picked_up | delivered | cancelled",
  "deliveryMethod": "string (optional)",
  "deliveryAddress": "string (optional)",
  "pickupSlot": "string (optional)",
  "estimatedReadyTime": "ISO date (optional)",
  "totalItems": "number (optional)",
  "createdAt": "ISO date (optional)"
}`}
              notes={[
                "Status mapping: preparing -> pending, received/verified -> processing, ready/picked_up/delivered -> completed, cancelled -> cancelled",
                "Raw app status stored in appStatus column alongside mapped website status",
                "If order exists (by concordiaCareOrderId), updates status and delivery info",
                "If new, creates the order and attempts to match patient by email/phone",
              ]}
            />

            <Endpoint
              method="GET"
              path="/api/external/orders"
              description="List all orders."
            />

            <Endpoint
              method="GET"
              path="/api/external/orders/since/:timestamp"
              description="Get orders created or updated since a Unix timestamp."
            />
          </section>

          <section id="products">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-products">
              <Package className="h-5 w-5" /> Products
            </h2>
            <p className="text-sm text-muted-foreground mb-4">OTC and grocery products available for display in the app.</p>

            <Endpoint
              method="GET"
              path="/api/products/app"
              description="Get all OTC products that are marked visible in the app (category != 'rx', showInApp = true)."
              response={`[
  {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "price": 9.99,
    "category": "otc | grocery | personal_care",
    "imageUrl": "string | null",
    "stock": 100,
    "ndcCode": "string | null"
  }
]`}
              notes={[
                "This endpoint does NOT require API key authentication",
                "Only returns products where showInApp is enabled by admin",
              ]}
            />
          </section>

          <section id="primerx">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-primerx">
              <Activity className="h-5 w-5" /> PrimeRx Webhooks
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Real-time patient data sync from PrimeRx pharmacy management system. These are typically called by PrimeRx or admin tools, not the app directly.</p>

            <Endpoint
              method="POST"
              path="/api/external/primerx/webhook"
              description="Receive real-time patient updates from PrimeRx. Accepts a single patient object or an array. Creates or updates patients, doctors, prescriptions, medications, family groups, and caregivers."
              request={`// Single patient or array of patients:
{
  "primeRxPatientId": "PRX-1001 (required)",
  "firstName": "string (required)",
  "lastName": "string (required)",
  "dateOfBirth": "ISO date (optional)",
  "gender": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "address": "string (optional)",
  "insurance": {
    "provider": "string",
    "policyNumber": "string",
    "groupNumber": "string"
  },
  "allergies": "string (optional)",
  "medicalConditions": "string (optional)",
  "diagnosis": "string (optional)",
  "doctors": [...],
  "medications": [...],
  "prescriptions": [...],
  "caregiver": { ... },
  "emergencyContact": { ... }
}`}
              response={`{
  "total": 1,
  "created": 1,
  "updated": 0,
  "failed": 0,
  "errors": []
}`}
              notes={[
                "Body can be a single patient object or an array of patient objects",
                "Auto-detects families by shared address hash (fam_ prefix)",
                "Upserts doctors by NPI or primeRxId",
                "Maps medications to blister pack JSONB format",
                "Creates prescriptions by rxNumber",
              ]}
            />
          </section>

          <section id="alerts">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2" data-testid="heading-alerts">
              <Activity className="h-5 w-5" /> Pharmacy Alerts
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Retrieve active pharmacy alerts for display in ConcordiaCare app notifications.</p>

            <Endpoint
              method="GET"
              path="/api/external/alerts"
              description="Get all currently active pharmacy alerts. Returns alerts sorted by creation date for display in the ConcordiaCare app."
              response={`[
  {
    "id": 1,
    "title": "Holiday Hours",
    "message": "Pharmacy will be closed Dec 25th",
    "type": "info",
    "priority": "normal",
    "createdAt": "2024-12-20T10:00:00Z",
    "expiresAt": "2024-12-26T00:00:00Z"
  }
]`}
              notes={[
                "Returns only active (non-expired, non-deactivated) alerts",
                "Alert types: info, warning, urgent, closure",
                "Priority levels: low, normal, high, critical",
                "Alerts are managed by admins via the PharmFlow dashboard",
              ]}
            />
          </section>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-sm">Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                For questions about these endpoints, error responses, or integration support, contact the Concordia Pharmacy development team. All endpoints return standard HTTP status codes (200 success, 400 bad request, 401 unauthorized, 404 not found, 409 conflict, 500 server error) with JSON error messages.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
