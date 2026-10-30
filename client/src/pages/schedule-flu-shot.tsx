import { useState, useEffect } from "react";
import { appointmentDeliverySummary } from "@shared/flu-shot-notifications";
import { Link, useLocation } from "wouter";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { SEO } from "@/components/seo";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { successIconSpring, stepSlideTransition, loadingOverlaySpring } from "@/lib/animations";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Syringe, ArrowLeft, Calendar as CalendarIcon, Clock, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatPhoneNumber } from "@/lib/input-helpers";
import { WellnessUpsell } from "@/components/wellness-upsell";

export default function ScheduleFluShot() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  
  const [step, setStep] = useState<"patient-type" | "details" | "calendar" | "time" | "confirm">("patient-type");
  const [isExistingPatient, setIsExistingPatient] = useState<boolean | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string>("");
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string>>({});
  
  // Form data for new patients
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    address: "",
    insuranceProvider: "",
    insurancePolicyNumber: "",
    fluShotType: "Standard Flu Vaccine",
    notes: "",
  });

  // Handle redirect after login for existing patients
  useEffect(() => {
    if (authLoading) return;
    
    const wasExistingPatient = sessionStorage.getItem("fluShotExistingPatient");
    
    if (wasExistingPatient === "true" && isAuthenticated && user) {
      // Clear the flag
      sessionStorage.removeItem("fluShotExistingPatient");
      sessionStorage.removeItem("redirectAfterLogin");
      
      // Set existing patient flag and pre-fill form
      setIsExistingPatient(true);
      const dob = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "";
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        dateOfBirth: dob,
        address: user.address || "",
        insuranceProvider: user.insuranceProvider || "",
        insurancePolicyNumber: user.insurancePolicyNumber || "",
        fluShotType: "Standard Flu Vaccine",
        notes: "",
      });
      
      // Skip to details step to verify/complete info
      setStep("details");
      
      toast({
        title: "Welcome back!",
        description: "Your information has been pre-filled. Please verify and continue.",
      });
    }
  }, [authLoading, isAuthenticated, user, toast]);

  // Available time slots
  const timeSlots = [
    "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
    "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM"
  ];

  // Flu shot types
  const fluShotTypes = [
    "Standard Flu Vaccine",
    "High-Dose Flu Vaccine (65+)",
    "Flu Shot for Children",
    "Preservative-Free Flu Vaccine"
  ];

  const bookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/flu-shot-appointments", data);
      return await response.json();
    },
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || "");
      setShowSuccessDialog(true);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to schedule flu shot appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePatientTypeSelection = (isExisting: boolean) => {
    setIsExistingPatient(isExisting);
    
    if (isExisting) {
      // If existing patient and not logged in, prompt to login
      if (!isAuthenticated) {
        toast({
          title: "Login Required",
          description: "Please log in to continue scheduling your flu shot.",
        });
        // Store redirect intent in sessionStorage so we can return after login
        sessionStorage.setItem("redirectAfterLogin", "/schedule-flu-shot");
        sessionStorage.setItem("fluShotExistingPatient", "true");
        window.location.href = "/login";
        return;
      }
      
      // If logged in, pre-fill form with user data and go to details for confirmation
      if (user) {
        const dob = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "";
        setFormData({
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          email: user.email || "",
          phoneNumber: user.phoneNumber || "",
          dateOfBirth: dob,
          address: user.address || "",
          insuranceProvider: user.insuranceProvider || "",
          insurancePolicyNumber: user.insurancePolicyNumber || "",
          fluShotType: "Standard Flu Vaccine",
          notes: "",
        });
      }
      
      // Go to details step so user can verify/complete their info before scheduling
      setStep("details");
    } else {
      // New patient, go to details form
      setStep("details");
    }
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const phoneDigits = formData.phoneNumber.replace(/\D/g, "");

    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";
    if (phoneDigits && phoneDigits.length !== 10) errors.phoneNumber = "Enter a valid 10-digit phone number";
    if (!formData.email.trim() && !phoneDigits) errors.email = "Enter an email address or phone number for appointment updates";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Enter a valid email address";
    }
    if (!fluShotTypes.includes(formData.fluShotType)) {
      errors.fluShotType = "Choose a vaccine type";
    }

    setDetailsErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "Check your information",
        description: "Please correct the highlighted fields before continuing.",
        variant: "destructive",
      });
      return;
    }

    setStep("calendar");
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      setStep("time");
    }
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setStep("confirm");
  };

  const handleConfirmBooking = () => {
    if (!selectedDate || !selectedTime) return;

    const appointmentData = {
      ...formData,
      scheduledDate: selectedDate.toISOString(),
      scheduledTime: selectedTime,
      isExistingPatient: isExistingPatient || false,
      userId: isAuthenticated && user ? user.id : null,
    };

    bookingMutation.mutate(appointmentData);
  };

  const handleBackToLanding = () => {
    setShowSuccessDialog(false);
    setLocation("/");
  };

  return (
    <PageTransition className="min-h-[100dvh] overflow-x-hidden clinical-hero-bg clinical-dark-page schedule-flu-shot-page">
      <SEO
        title="Schedule a Flu Shot"
        description="Schedule your flu shot at Concordia Pharmacy. Walk-ins welcome. No appointment needed for most vaccines. Quick, convenient immunization services in the Bronx."
        path="/schedule-flu-shot"
      />
      {/* Header */}
      {!showSuccessDialog && <header className="border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl" style={{ background: "rgba(15, 23, 42, 0.95)" }}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2 text-slate-300" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Syringe className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg text-white">Schedule Flu Shot</span>
          </div>
        </div>
      </header>}

      {!showSuccessDialog && <main className="container mx-auto px-4 pt-8 pb-28 sm:py-8 md:py-12 max-w-4xl">
        {/* Progress Steps */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-8 md:mb-12" aria-label="Scheduling progress">
          <Badge variant={step === "patient-type" ? "default" : "outline"}>1. Patient Type</Badge>
          <Badge variant={step === "details" ? "default" : "outline"}>2. Details</Badge>
          <Badge variant={step === "calendar" || step === "time" || step === "confirm" ? "default" : "outline"}>
            3. Schedule
          </Badge>
        </div>

        <AnimatePresence mode="wait">
        {/* Step 1: Patient Type Selection */}
        {step === "patient-type" && (
          <motion.div key="step-patient-type" initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }} transition={prefersReducedMotion ? { duration: 0 } : stepSlideTransition}>
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">Are you a Concordia Pharmacy patient?</CardTitle>
              <CardDescription>Select your patient status to continue</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6 pt-6">
              <Card 
                className="hover-elevate cursor-pointer border-2 hover:border-primary transition-colors"
                onClick={() => handlePatientTypeSelection(true)}
                data-testid="card-existing-patient"
              >
                <CardHeader className="text-center">
                  <Check className="h-12 w-12 text-primary mx-auto mb-4" />
                  <CardTitle>Yes, I'm a Patient</CardTitle>
                  <CardDescription>I already have an account with Concordia Pharmacy</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button className="w-full" data-testid="button-existing-patient">
                    Login & Schedule
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="hover-elevate cursor-pointer border-2 hover:border-primary transition-colors"
                onClick={() => handlePatientTypeSelection(false)}
                data-testid="card-new-patient"
              >
                <CardHeader className="text-center">
                  <Syringe className="h-12 w-12 text-primary mx-auto mb-4" />
                  <CardTitle>No, I'm New</CardTitle>
                  <CardDescription>I want to schedule a flu shot and become a patient</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button className="w-full" data-testid="button-new-patient">
                    Continue as New Patient
                  </Button>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Step 2: Details Form */}
        {step === "details" && (
          <motion.div key="step-details" initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }} transition={prefersReducedMotion ? { duration: 0 } : stepSlideTransition}>
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>{isExistingPatient ? "Verify Your Information" : "Your Information"}</CardTitle>
              <CardDescription>
                {isExistingPatient 
                  ? "We've pre-filled your information. Please verify and complete any missing details."
                  : "Please provide your details to schedule your flu shot"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDetailsSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => {
                        setFormData({ ...formData, firstName: e.target.value });
                        setDetailsErrors((current) => ({ ...current, firstName: "" }));
                      }}
                      aria-invalid={!!detailsErrors.firstName}
                      required
                      data-testid="input-first-name"
                    />
                    {detailsErrors.firstName && <p className="text-xs text-destructive">{detailsErrors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => {
                        setFormData({ ...formData, lastName: e.target.value });
                        setDetailsErrors((current) => ({ ...current, lastName: "" }));
                      }}
                      aria-invalid={!!detailsErrors.lastName}
                      required
                      data-testid="input-last-name"
                    />
                    {detailsErrors.lastName && <p className="text-xs text-destructive">{detailsErrors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter an email address, phone number, or both for your confirmation and status updates.
                    After a completed visit, we will also invite you to share feedback. Text message and data rates may apply.
                  </p>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setDetailsErrors((current) => ({ ...current, email: "" }));
                    }}
                    aria-invalid={!!detailsErrors.email}
                    placeholder="For confirmation and appointment updates"
                    data-testid="input-email"
                  />
                  {detailsErrors.email && <p className="text-xs text-destructive">{detailsErrors.email}</p>}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => {
                        setFormData({ ...formData, phoneNumber: formatPhoneNumber(e.target.value) });
                        setDetailsErrors((current) => ({ ...current, phoneNumber: "" }));
                      }}
                      aria-invalid={!!detailsErrors.phoneNumber}
                      placeholder="10-digit phone number"
                      maxLength={10}
                      inputMode="numeric"
                      data-testid="input-phone"
                    />
                    {detailsErrors.phoneNumber && <p className="text-xs text-destructive">{detailsErrors.phoneNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      data-testid="input-dob"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-address"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                    <Input
                      id="insuranceProvider"
                      value={formData.insuranceProvider}
                      onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })}
                      placeholder="e.g., Blue Cross, Aetna"
                      data-testid="input-insurance-provider"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurancePolicyNumber">Policy Number</Label>
                    <Input
                      id="insurancePolicyNumber"
                      value={formData.insurancePolicyNumber}
                      onChange={(e) => setFormData({ ...formData, insurancePolicyNumber: e.target.value })}
                      data-testid="input-policy-number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fluShotType">Flu Shot Type</Label>
                  <RadioGroup
                    value={formData.fluShotType}
                    onValueChange={(value) => setFormData({ ...formData, fluShotType: value })}
                  >
                    {fluShotTypes.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <RadioGroupItem value={type} id={type} data-testid={`radio-${type.toLowerCase().replace(/\s+/g, '-')}`} />
                        <Label htmlFor={type} className="font-normal cursor-pointer min-w-0 break-words">{type}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("patient-type")}
                    data-testid="button-back-patient-type"
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="button-continue-calendar">
                    Continue to Calendar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Step 3: Calendar Selection */}
        {step === "calendar" && (
          <motion.div key="step-calendar" initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }} transition={prefersReducedMotion ? { duration: 0 } : stepSlideTransition}>
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center gap-2 justify-center">
                <CalendarIcon className="h-6 w-6" />
                Select a Date
              </CardTitle>
              <CardDescription>Choose your preferred date for the flu shot</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date < new Date() || date.getDay() === 0} // Disable past dates and Sundays
                className="rounded-md border"
                data-testid="calendar-date-picker"
              />
            </CardContent>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => setStep(isExistingPatient ? "patient-type" : "details")}
                className="w-full"
                data-testid="button-back-details"
              >
                Back
              </Button>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Step 4: Time Selection */}
        {step === "time" && selectedDate && (
          <motion.div key="step-time" initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }} transition={prefersReducedMotion ? { duration: 0 } : stepSlideTransition}>
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center gap-2 justify-center">
                <Clock className="h-6 w-6" />
                Select a Time
              </CardTitle>
              <CardDescription>
                Available times for {selectedDate.toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {timeSlots.map((time) => (
                  <Button
                    key={time}
                    variant="outline"
                    onClick={() => handleTimeSelect(time)}
                    className="h-auto py-3"
                    data-testid={`button-time-${time.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {time}
                  </Button>
                ))}
              </div>
            </CardContent>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => setStep("calendar")}
                className="w-full"
                data-testid="button-back-calendar"
              >
                Back to Calendar
              </Button>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Step 5: Confirmation */}
        {step === "confirm" && selectedDate && selectedTime && (
          <motion.div key="step-confirm" className="relative" initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 }} transition={prefersReducedMotion ? { duration: 0 } : stepSlideTransition}>
          <AnimatePresence>
            {bookingMutation.isPending && (
              <motion.div
                key="booking-loading-overlay"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25 }}
              >
                <motion.div
                  className="flex flex-col items-center gap-4"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : loadingOverlaySpring}
                >
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                  <p className="text-lg font-medium">Booking your appointment...</p>
                  <p className="text-sm text-muted-foreground">Please wait while we confirm your slot</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Confirm Your Appointment</CardTitle>
              <CardDescription>Please review your flu shot appointment details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 p-6 rounded-lg space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{formData.firstName} {formData.lastName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium break-words">{formData.email || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{formData.phoneNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Patient Type</p>
                    <p className="font-medium">{isExistingPatient ? "Existing Patient" : "New Patient"}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-medium text-lg">{selectedDate.toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Time</p>
                      <p className="font-medium text-lg">{selectedTime}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground">Flu Shot Type</p>
                   <p className="font-medium break-words">{formData.fluShotType}</p>
                </div>

                {formData.insuranceProvider && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground">Insurance</p>
                    <p className="font-medium">{formData.insuranceProvider}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("time")}
                  data-testid="button-back-time"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmBooking}
                  disabled={bookingMutation.isPending}
                  className="flex-1"
                  data-testid="button-confirm-booking"
                >
                  {bookingMutation.isPending ? "Booking..." : "Confirm Appointment"}
                </Button>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        )}
        </AnimatePresence>
      </main>}

      <AnimatePresence>
        {showSuccessDialog && (
          <motion.div
            className="relative min-h-[100dvh] overflow-x-hidden clinical-hero-bg clinical-dark-page"
            data-testid="dialog-success"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
          >
            <header className="border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl" style={{ background: "rgba(15, 23, 42, 0.85)" }}>
              <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
                <Link href="/">
                  <Button variant="ghost" className="gap-2 text-slate-300" data-testid="button-back-home-header">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Home
                  </Button>
                </Link>
                <div className="flex items-center gap-2">
                  <Syringe className="h-6 w-6 text-primary" />
                  <span className="font-bold text-base sm:text-lg text-white text-right">Flu Shot Booked</span>
                </div>
              </div>
            </header>
            <main className="container mx-auto px-4 pt-8 pb-28 sm:py-10 md:py-12">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_2px_minmax(0,1fr)] gap-6 max-w-5xl mx-auto items-start">
                <Card className="rounded-md">
                  <CardHeader className="text-center">
                    <motion.div
                      className="flex justify-center mb-4"
                      initial={prefersReducedMotion ? false : { scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { ...successIconSpring, delay: 0.2 }}
                    >
                      <div className="rounded-full bg-primary/10 p-4">
                        <Check className="h-12 w-12 text-primary" />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
                    >
                      <CardTitle className="text-2xl">Appointment Confirmed!</CardTitle>
                      <CardDescription className="text-base pt-2">
                        Your flu shot appointment has been successfully scheduled for{" "}
                        <strong>{selectedDate?.toLocaleDateString()}</strong> at{" "}
                        <strong>{selectedTime}</strong>.
                      </CardDescription>
                    </motion.div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {ticketNumber && (
                      <motion.div
                        className="bg-primary/5 border border-primary/20 p-6 rounded-md text-center"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, delay: 0.45 }}
                      >
                        <p className="text-sm text-muted-foreground mb-2">Your Ticket Number</p>
                        <code className="block max-w-full break-all text-xl sm:text-2xl font-mono font-bold text-primary" data-testid="text-ticket-number">
                          {ticketNumber}
                        </code>
                        <p className="text-xs text-muted-foreground mt-2">
                          Please save this number and present it at your appointment
                        </p>
                      </motion.div>
                    )}

                    <motion.div
                      className="bg-muted/50 p-4 rounded-md text-sm space-y-2"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, delay: 0.55 }}
                    >
                      <p className="font-medium">What's Next?</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li data-testid="appointment-notification-summary">{appointmentDeliverySummary(bookingMutation.data?.notificationDelivery)}</li>
                        <li>Keep this ticket number for your appointment</li>
                        <li>Bring your insurance card if applicable</li>
                        <li>Arrive 5 minutes early for check-in</li>
                        <li>Present your ticket number at check-in</li>
                        <li>Our team will administer your flu shot</li>
                      </ul>
                    </motion.div>

                    <motion.div
                      className="pt-2"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, delay: 0.65 }}
                    >
                      <PostSubmissionCTA confirmationMessage="Your appointment is locked in. We'll see you soon!">
                        {ticketNumber && (
                          <div className="text-sm space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Your Booking</p>
                            <p className="font-mono font-bold text-primary text-lg" data-testid="text-ticket-cta">{ticketNumber}</p>
                            {selectedDate && <p className="text-muted-foreground">{selectedDate.toLocaleDateString()} at {selectedTime}</p>}
                          </div>
                        )}
                      </PostSubmissionCTA>
                    </motion.div>
                  </CardContent>
                </Card>

                <div className="neon-divider self-stretch hidden lg:block" aria-hidden="true" />

                <div>
                  <WellnessUpsell
                    prefillName={`${formData.firstName} ${formData.lastName}`.trim()}
                    prefillPhone={formData.phoneNumber}
                    prefillEmail={formData.email}
                    prefillDob={formData.dateOfBirth}
                    sourceAction="flu_shot_booking"
                  />
                </div>
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
