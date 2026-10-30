import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Star, ArrowRight, Pill, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LeadStatusCard } from "@/components/lead-status-card";

interface WellnessUpsellProps {
  prefillName?: string;
  prefillPhone?: string;
  prefillEmail?: string;
  prefillDob?: string;
  sourceAction: string;
}

function WellnessPulse() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-20 h-20 rounded-full border border-primary/30 bg-primary/5 flex items-center justify-center overflow-hidden">
        <svg
          viewBox="0 0 80 40"
          className="w-14 h-7"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M0 20 L12 20 L18 20 L24 8 L30 32 L36 4 L42 36 L48 12 L54 20 L60 20 L68 20 L80 20"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

const benefitItems = [
  {
    icon: Star,
    iconColor: "text-yellow-500",
    title: "500 Wellness Points ($5 Credit)",
    desc: "Credited to your account once approved",
  },
  {
    icon: Pill,
    iconColor: "text-green-500",
    title: "Free 30-Day Wellness Pack",
    desc: "Multivitamins included for patients with 10+ daily meds",
  },
  {
    icon: Sparkles,
    iconColor: "text-primary",
    title: "ConcordiaCare App Access",
    desc: "Manage prescriptions, track deliveries, earn rewards",
  },
];

export function WellnessUpsell({ prefillName, prefillPhone, prefillEmail, prefillDob, sourceAction }: WellnessUpsellProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"offer" | "form" | "submitted">("offer");
  const [leadId, setLeadId] = useState<number | null>(null);
  const [statusToken, setStatusToken] = useState<string>("");
  const [qualifies, setQualifies] = useState(false);

  const [leadType, setLeadType] = useState<"transfer" | "new_script">("transfer");
  const [contactName, setContactName] = useState(prefillName || "");
  const [phone, setPhone] = useState(prefillPhone || "");
  const [email, setEmail] = useState(prefillEmail || "");
  const [dateOfBirth, setDateOfBirth] = useState(prefillDob || "");
  const [pharmacyName, setPharmacyName] = useState("");
  const [doctorInfo, setDoctorInfo] = useState("");
  const [medCount, setMedCount] = useState<string>("");
  const [consent, setConsent] = useState(false);

  const captureMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/leads/capture", {
        contactName,
        phone,
        email: email || undefined,
        dateOfBirth: dateOfBirth || undefined,
        leadType,
        previousPharmacyName: leadType === "transfer" ? pharmacyName : undefined,
        doctorInfo: leadType === "new_script" ? doctorInfo : undefined,
        medicationCount: parseInt(medCount) || 0,
        sourceAction,
        authorizationConsent: consent,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLeadId(data.leadId);
      setStatusToken(data.statusToken || "");
      setQualifies(data.qualifiesForWellnessPack);
      setStep("submitted");
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "Please try again or call us directly.",
        variant: "destructive",
      });
    },
  });

  if (step === "submitted" && leadId) {
    return <LeadStatusCard leadId={leadId} statusToken={statusToken} contactName={contactName} phone={phone} qualifiesForWellnessPack={qualifies} />;
  }

  if (step === "offer") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="rounded-md" data-testid="card-wellness-upsell">
          <CardHeader className="text-center pb-3">
            <div className="flex justify-center mb-3">
              <WellnessPulse />
            </div>
            <CardTitle className="text-xl">Join the ConcordiaCare Family</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Transfer your prescriptions and unlock exclusive benefits
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {benefitItems.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.15 }}
                  className="flex items-start gap-3 p-3 rounded-md bg-background/60 border"
                >
                  <item.icon className={`h-5 w-5 ${item.iconColor} mt-0.5 flex-shrink-0`} />
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={() => setStep("form")}
              data-testid="button-start-transfer"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              The ConcordiaCare App is a dedicated tool for our prescription patients
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="rounded-md" data-testid="card-wellness-form">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Transfer Your Care</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tell us a bit about yourself and we'll handle the rest
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={leadType}
            onValueChange={(v) => setLeadType(v as "transfer" | "new_script")}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="transfer" id="lt-transfer" />
              <Label htmlFor="lt-transfer" className="text-sm cursor-pointer">Transfer from another pharmacy</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new_script" id="lt-new" />
              <Label htmlFor="lt-new" className="text-sm cursor-pointer">New prescription</Label>
            </div>
          </RadioGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uw-name" className="text-sm">Full Name *</Label>
              <Input
                id="uw-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Doe"
                className="laser-input"
                data-testid="input-lead-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw-phone" className="text-sm">Phone Number *</Label>
              <Input
                id="uw-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="laser-input"
                data-testid="input-lead-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw-email" className="text-sm">Email</Label>
              <Input
                id="uw-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="laser-input"
                data-testid="input-lead-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uw-dob" className="text-sm">Date of Birth</Label>
              <Input
                id="uw-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="laser-input"
                data-testid="input-lead-dob"
              />
            </div>
          </div>

          {leadType === "transfer" ? (
            <div className="space-y-1.5">
              <Label htmlFor="uw-pharmacy" className="text-sm">Current Pharmacy Name *</Label>
              <Input
                id="uw-pharmacy"
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder="e.g. CVS, Walgreens, Rite Aid..."
                className="laser-input"
                data-testid="input-lead-pharmacy"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="uw-doctor" className="text-sm">Doctor Name / Info</Label>
              <Input
                id="uw-doctor"
                value={doctorInfo}
                onChange={(e) => setDoctorInfo(e.target.value)}
                placeholder="Doctor's name or office"
                className="laser-input"
                data-testid="input-lead-doctor"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="uw-medcount" className="text-sm">How many daily maintenance medications do you take?</Label>
            <Input
              id="uw-medcount"
              type="number"
              min="0"
              value={medCount}
              onChange={(e) => setMedCount(e.target.value)}
              placeholder="e.g. 5"
              className="laser-input"
              data-testid="input-lead-medcount"
            />
            <AnimatePresence>
              {parseInt(medCount) >= 10 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <Badge variant="secondary" className="mt-1 bg-slate-800 text-slate-200 border border-slate-500/40">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 mr-1 flex-shrink-0" fill="currentColor" aria-hidden="true" focusable="false">
                      <path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5V1z" />
                    </svg>
                    Platinum Status Detected. Free Wellness Pack Included
                  </Badge>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="uw-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              data-testid="checkbox-lead-consent"
            />
            <Label htmlFor="uw-consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
              I agree to transfer my care to ConcordiaCare and authorize our team to contact my current pharmacy on my behalf.
            </Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("offer")} data-testid="button-lead-back">
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!contactName || !phone || !consent || captureMutation.isPending || (leadType === "transfer" && !pharmacyName)}
              onClick={() => captureMutation.mutate()}
              data-testid="button-lead-submit"
            >
              {captureMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
