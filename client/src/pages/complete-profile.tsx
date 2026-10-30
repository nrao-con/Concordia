import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuthBridge } from "@/contexts/authBridge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageTransition } from "@/components/page-transition";
import { SEO } from "@/components/seo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AddressFields, EMPTY_ADDRESS, toAddressString } from "@/components/address-fields";
import type { AddressValue } from "@/components/address-fields";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ClipboardList, ChevronRight, Smartphone, ExternalLink } from "lucide-react";
import { formatPhoneNumber } from "@/lib/input-helpers";
import type { User } from "@shared/schema";

const STEPS = ["Personal", "Insurance", "Attendant"] as const;
type Step = (typeof STEPS)[number];

export default function CompleteProfile() {
  const [, setLocation] = useLocation();
  const { clerkUser } = useAuthBridge();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("Personal");
  const [addressParts, setAddressParts] = useState<AddressValue>(EMPTY_ADDRESS);
  const [showAppDownload, setShowAppDownload] = useState(false);

  const { data: existingUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phoneNumber: "",
    insuranceProvider: "",
    insurancePolicyNumber: "",
    insuranceGroupNumber: "",
    prescriptionInfo: "",
    hasAttendant: false,
    attendantFirstName: "",
    attendantLastName: "",
    attendantPhone: "",
    attendantEmail: "",
    attendantRelationship: "",
    attendantAgency: "",
  });

  useEffect(() => {
    if (!existingUser && !clerkUser) return;
    const existingDob = existingUser?.dateOfBirth
      ? new Date(existingUser.dateOfBirth).toISOString().split("T")[0]
      : "";
    setForm((previous) => ({
      ...previous,
      firstName: previous.firstName || existingUser?.firstName || clerkUser?.firstName || "",
      lastName: previous.lastName || existingUser?.lastName || clerkUser?.lastName || "",
      dateOfBirth: previous.dateOfBirth || existingDob,
      phoneNumber: previous.phoneNumber || existingUser?.phoneNumber || "",
      insuranceProvider: previous.insuranceProvider || existingUser?.insuranceProvider || "",
      insurancePolicyNumber: previous.insurancePolicyNumber || existingUser?.insurancePolicyNumber || "",
      insuranceGroupNumber: previous.insuranceGroupNumber || existingUser?.insuranceGroupNumber || "",
      prescriptionInfo: previous.prescriptionInfo || existingUser?.medicalConditions || "",
    }));
  }, [existingUser, clerkUser]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateMutation = useMutation({
    mutationFn: async (payload: object) => {
      return apiRequest("PATCH", "/api/profile", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const handleFinish = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setStep("Personal");
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Enter the patient's legal first and last name before saving.",
      });
      return;
    }
    const profilePayload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth || undefined,
      phoneNumber: form.phoneNumber || undefined,
      address: toAddressString(addressParts) || undefined,
      insuranceProvider: form.insuranceProvider || undefined,
      insurancePolicyNumber: form.insurancePolicyNumber || undefined,
      insuranceGroupNumber: form.insuranceGroupNumber || undefined,
      prescriptionInfo: form.prescriptionInfo || undefined,
    };

    try {
      await updateMutation.mutateAsync(profilePayload);

      // If the patient has an attendant/caregiver, register them separately
      if (form.hasAttendant && form.attendantFirstName && form.attendantLastName && form.attendantPhone) {
        // Use the local DB user id (not the Clerk id) — /api/attendants links by users.id
        const userId = existingUser?.id;
        try {
          await apiRequest("POST", "/api/attendants", {
            firstName: form.attendantFirstName,
            lastName: form.attendantLastName,
            phoneNumber: form.attendantPhone,
            email: form.attendantEmail || undefined,
            agencyName: form.attendantAgency || undefined,
            relationshipType: form.attendantRelationship || "home_health_aide",
            patientId: userId,
          });
        } catch {
          toast({
            variant: "destructive",
            title: "Profile saved, but caregiver was not added",
            description: "Please add the caregiver again from your profile so the pharmacy receives their information.",
          });
          setLocation("/profile");
          return;
        }
      }

      toast({ title: "Profile complete!", description: "Welcome to Concordia Pharmacy." });
      setShowAppDownload(true);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save profile. You can update it later from your profile page." });
      setLocation("/profile");
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showAppDownload) {
    return (
      <PageTransition>
        <SEO title="Get the ConcordiaCare App | Concordia Pharmacy" description="Open the ConcordiaCare web app to manage your prescriptions on the go." />
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
              <Smartphone className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground text-center">You're all set!</h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Your profile is ready. Open the ConcordiaCare app to track your prescriptions, request refills, and chat with our pharmacy team from your phone.
            </p>
          </div>

          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Open the ConcordiaCare App
              </CardTitle>
              <CardDescription>Works on any phone. No app store needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="https://concordia-care.replit.app/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-concordiacare-app"
              >
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Open ConcordiaCare
                  </span>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </Button>
              </a>
              <div className="pt-2 border-t">
                <Button
                  className="w-full"
                  onClick={() => setLocation("/profile")}
                  data-testid="button-continue-to-profile"
                >
                  Continue to My Profile
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                You can also find the app link on your profile page anytime.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <PageTransition>
      <SEO title="Complete Your Profile | Concordia Pharmacy" description="Set up your pharmacy profile to get started." />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20">
            <ClipboardList className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complete Your Profile</h1>
          <p className="text-sm text-muted-foreground">
            Hi{clerkUser?.firstName ? `, ${clerkUser.firstName}` : ""}! Just a few more details.
          </p>
          <div className="flex gap-2 mt-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 w-16 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </div>

        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-lg">{step}</CardTitle>
            <CardDescription>
              {step === "Personal" && "Basic information for your patient record"}
              {step === "Insurance" && "Insurance details speed up your first prescription fill"}
              {step === "Attendant" && "Let us know if a caregiver helps manage your medications"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "Personal" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="firstName">Legal First Name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      data-testid="input-first-name"
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lastName">Legal Last Name</Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      data-testid="input-last-name"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    data-testid="input-dob"
                    value={form.dateOfBirth}
                    onChange={(e) => update("dateOfBirth", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    data-testid="input-phone"
                    value={form.phoneNumber}
                    onChange={(e) => update("phoneNumber", formatPhoneNumber(e.target.value))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Home Address</Label>
                  <AddressFields value={addressParts} onChange={setAddressParts} />
                  {existingUser?.address && !toAddressString(addressParts) && (
                    <p className="text-xs text-muted-foreground">
                      Current address remains on file unless you select a replacement address.
                    </p>
                  )}
                </div>
              </>
            )}

            {step === "Insurance" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="insProvider">Insurance Provider</Label>
                  <Input
                    id="insProvider"
                    placeholder="e.g. Blue Cross Blue Shield"
                    data-testid="input-insurance-provider"
                    value={form.insuranceProvider}
                    onChange={(e) => update("insuranceProvider", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="insPolicy">Policy / Member ID</Label>
                  <Input
                    id="insPolicy"
                    placeholder="Policy number"
                    data-testid="input-insurance-policy"
                    value={form.insurancePolicyNumber}
                    onChange={(e) => update("insurancePolicyNumber", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="insGroup">Group Number</Label>
                  <Input
                    id="insGroup"
                    placeholder="Group number (optional)"
                    data-testid="input-insurance-group"
                    value={form.insuranceGroupNumber}
                    onChange={(e) => update("insuranceGroupNumber", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rxInfo">Current Medications (optional)</Label>
                  <Textarea
                    id="rxInfo"
                    placeholder="List any current prescriptions you'd like us to transfer…"
                    data-testid="input-rx-info"
                    value={form.prescriptionInfo}
                    onChange={(e) => update("prescriptionInfo", e.target.value)}
                  />
                </div>
              </>
            )}

            {step === "Attendant" && (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="hasAttendant"
                    data-testid="checkbox-has-attendant"
                    checked={form.hasAttendant}
                    onCheckedChange={(v) => update("hasAttendant", !!v)}
                  />
                  <Label htmlFor="hasAttendant" className="cursor-pointer">
                    I have a home attendant or caregiver
                  </Label>
                </div>

                {form.hasAttendant && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="attFirst">First Name</Label>
                        <Input
                          id="attFirst"
                          data-testid="input-attendant-first"
                          value={form.attendantFirstName}
                          onChange={(e) => update("attendantFirstName", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="attLast">Last Name</Label>
                        <Input
                          id="attLast"
                          data-testid="input-attendant-last"
                          value={form.attendantLastName}
                          onChange={(e) => update("attendantLastName", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="attPhone">Phone</Label>
                      <Input
                        id="attPhone"
                        type="tel"
                        placeholder="(555) 555-5555"
                        data-testid="input-attendant-phone"
                        value={form.attendantPhone}
                        onChange={(e) => update("attendantPhone", formatPhoneNumber(e.target.value))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="attEmail">Email (optional)</Label>
                      <Input
                        id="attEmail"
                        type="email"
                        data-testid="input-attendant-email"
                        value={form.attendantEmail}
                        onChange={(e) => update("attendantEmail", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="attRel">Relationship (optional)</Label>
                      <Input
                        id="attRel"
                        placeholder="e.g. Daughter, Home Health Aide"
                        data-testid="input-attendant-relationship"
                        value={form.attendantRelationship}
                        onChange={(e) => update("attendantRelationship", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="attAgency">Agency (optional)</Label>
                      <Input
                        id="attAgency"
                        placeholder="Agency or organization name"
                        data-testid="input-attendant-agency"
                        value={form.attendantAgency}
                        onChange={(e) => update("attendantAgency", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between pt-2">
              {stepIndex > 0 ? (
                <Button variant="ghost" onClick={() => setStep(STEPS[stepIndex - 1])}>
                  Back
                </Button>
              ) : (
                <div />
              )}

              {stepIndex < STEPS.length - 1 ? (
                <Button
                  data-testid="button-next-step"
                  onClick={() => setStep(STEPS[stepIndex + 1])}
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  data-testid="button-finish-profile"
                  onClick={handleFinish}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Finish
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center pt-1">
              You can update all of this later from your profile page.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
