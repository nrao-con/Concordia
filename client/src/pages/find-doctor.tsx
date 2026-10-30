import { useState, useId } from "react";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DoctorPartner } from "@shared/schema";
import {
  ArrowLeft,
  ArrowRight,
  Stethoscope,
  Globe,
  User,
  MapPin,
  Smartphone,
  Loader2,
  Search,
  CheckCircle2,
  Phone,
  Heart,
  Baby,
  Users,
  Activity,
  Accessibility,
  Sparkles,
  Languages,
  Building2,
  TreePine,
  Anchor,
  Compass,
  Trees,
  UserCircle2,
  Star,
  Quote,
  Sunrise,
  Sun,
  Sunset,
  Calendar,
  AlertCircle,
} from "lucide-react";

const DAY_OPTIONS = [
  { value: "Mon", label: "Mon" },
  { value: "Tue", label: "Tue" },
  { value: "Wed", label: "Wed" },
  { value: "Thu", label: "Thu" },
  { value: "Fri", label: "Fri" },
  { value: "Sat", label: "Sat" },
  { value: "Sun", label: "Sun" },
];

const TIME_OPTIONS = [
  { value: "Morning", label: "Morning", sublabel: "8 am to 12 pm", icon: <Sunrise className="h-4 w-4" /> },
  { value: "Afternoon", label: "Afternoon", sublabel: "12 to 5 pm", icon: <Sun className="h-4 w-4" /> },
  { value: "Evening", label: "Evening", sublabel: "5 to 8 pm", icon: <Sunset className="h-4 w-4" /> },
];

function buildPreferredTimeString(days: string[], times: string[]): string {
  if (days.length === 0 && times.length === 0) return "";
  const parts: string[] = [];
  if (times.length > 0) parts.push(times.join(", "));
  if (days.length > 0) {
    const allWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const allWeekend = ["Sat", "Sun"];
    const selectedSet = new Set(days);
    const allWeekdaysSelected = allWeekdays.every((d) => selectedSet.has(d));
    const allWeekendSelected = allWeekend.every((d) => selectedSet.has(d));
    let dayLabel = "";
    if (allWeekdaysSelected && allWeekendSelected) {
      dayLabel = "any day";
    } else if (allWeekdaysSelected) {
      dayLabel = "weekdays";
    } else if (allWeekendSelected) {
      dayLabel = "weekends";
    } else {
      dayLabel = days.join(", ");
    }
    parts.push(dayLabel);
  }
  return parts.join(" · ");
}

type QuizOption = { value: string; label: string; icon: React.ReactNode };

const SPECIALTY_OPTIONS: QuizOption[] = [
  { value: "Family Medicine", label: "Family Medicine", icon: <Users className="h-5 w-5" /> },
  { value: "Internal Medicine", label: "Internal Medicine", icon: <Stethoscope className="h-5 w-5" /> },
  { value: "Pediatrics", label: "Pediatrics", icon: <Baby className="h-5 w-5" /> },
  { value: "Cardiology", label: "Cardiology", icon: <Heart className="h-5 w-5" /> },
  { value: "Geriatrics", label: "Geriatrics", icon: <Accessibility className="h-5 w-5" /> },
  { value: "OB/GYN", label: "OB/GYN", icon: <Sparkles className="h-5 w-5" /> },
];

const LANGUAGE_OPTIONS: QuizOption[] = [
  { value: "English", label: "English", icon: <Languages className="h-5 w-5" /> },
  { value: "Spanish", label: "Spanish", icon: <Languages className="h-5 w-5" /> },
  { value: "Mandarin", label: "Mandarin", icon: <Languages className="h-5 w-5" /> },
  { value: "Russian", label: "Russian", icon: <Languages className="h-5 w-5" /> },
  { value: "Bengali", label: "Bengali", icon: <Languages className="h-5 w-5" /> },
];

const GENDER_OPTIONS: QuizOption[] = [
  { value: "female", label: "Female", icon: <UserCircle2 className="h-5 w-5" /> },
  { value: "male", label: "Male", icon: <UserCircle2 className="h-5 w-5" /> },
];

const BOROUGH_OPTIONS: QuizOption[] = [
  { value: "Manhattan", label: "Manhattan", icon: <Building2 className="h-5 w-5" /> },
  { value: "Brooklyn", label: "Brooklyn", icon: <TreePine className="h-5 w-5" /> },
  { value: "Queens", label: "Queens", icon: <Compass className="h-5 w-5" /> },
  { value: "Bronx", label: "Bronx", icon: <Trees className="h-5 w-5" /> },
  { value: "Staten Island", label: "Staten Island", icon: <Anchor className="h-5 w-5" /> },
];

const STEP_LABELS = ["Specialty", "Language", "Gender", "Location"];

interface MatchResponse {
  matches: DoctorPartner[];
  leadId: number;
  requestToken: string;
}

interface QuizAnswers {
  specialty: string;
  language: string;
  genderPreference: string;
  borough: string;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function FindDoctor() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [specialty, setSpecialty] = useState("");
  const [language, setLanguage] = useState("");
  const [genderPreference, setGenderPreference] = useState("");
  const [borough, setBorough] = useState("");
  const [matches, setMatches] = useState<DoctorPartner[] | null>(null);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [requestToken, setRequestToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<DoctorPartner | null>(null);
  const [showFullList, setShowFullList] = useState(false);

  const fullListQuery = useQuery<DoctorPartner[]>({
    queryKey: ["/api/doctor-partners"],
    enabled: showFullList,
  });

  const matchMutation = useMutation<MatchResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/find-doctor/match", {
        specialty,
        language,
        genderPreference,
        borough,
      });
      return (await res.json()) as MatchResponse;
    },
    onMutate: () => {
      setMatches(null);
      setStep(4);
    },
    onSuccess: (data) => {
      setMatches(data.matches || []);
      setLeadId(data.leadId);
      setRequestToken(data.requestToken);
    },
    onError: () => {
      setMatches(null);
    },
  });

  const selectMutation = useMutation<unknown, Error, { doctor: DoctorPartner }>({
    mutationFn: async ({ doctor }) => {
      if (leadId == null || !requestToken) {
        throw new Error("Your match session has expired. Please run the matching quiz again.");
      }
      const res = await apiRequest("POST", "/api/find-doctor/select", {
        leadId,
        requestToken,
        doctorId: doctor.id,
      });
      return await res.json();
    },
    onSuccess: (_, { doctor }) => {
      setSelected(doctor);
    },
    onError: (error) => {
      toast({
        title: "Doctor selection wasn't saved",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSelectDoctor = (doctor: DoctorPartner) => {
    selectMutation.mutate({ doctor });
  };

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  const restart = () => {
    setStep(0);
    setSpecialty("");
    setLanguage("");
    setGenderPreference("");
    setBorough("");
    setMatches(null);
    setLeadId(null);
    setRequestToken(null);
    setSelected(null);
    setShowFullList(false);
  };

  const submit = () => matchMutation.mutate();

  const answers: QuizAnswers = { specialty, language, genderPreference, borough };

  const inQuiz = !selected && !showFullList && step <= 3;
  const stepProgress = selected ? 100 : ((step + 1) / 5) * 100;
  const currentStepLabel = step <= 3 ? STEP_LABELS[step] : "Matches";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3" data-testid="text-find-doctor-title">
            Find Your Doctor
          </h1>
          <p className="text-muted-foreground text-lg">
            Answer four quick questions and we'll match you with a primary care provider in our network.
          </p>
        </div>

        {!selected && !showFullList && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
              <span data-testid="text-progress-step-label">
                {inQuiz ? `Step ${step + 1} of 4 · ${currentStepLabel}` : "Your matches"}
              </span>
              <span>{Math.round(stepProgress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-md overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${stepProgress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                data-testid="progress-quiz"
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!showFullList && step === 0 && (
            <QuizStep
              key="step-0"
              icon={<Stethoscope className="h-6 w-6" />}
              title="What kind of care are you looking for?"
              options={SPECIALTY_OPTIONS}
              value={specialty}
              onSelect={(v) => {
                setSpecialty(v);
                setTimeout(next, 200);
              }}
              testIdPrefix="specialty"
              skipLabel="I don't have a preference"
            />
          )}
          {!showFullList && step === 1 && (
            <QuizStep
              key="step-1"
              icon={<Globe className="h-6 w-6" />}
              title="Preferred language?"
              options={LANGUAGE_OPTIONS}
              value={language}
              onSelect={(v) => {
                setLanguage(v);
                setTimeout(next, 200);
              }}
              testIdPrefix="language"
              onBack={back}
              skipLabel="No language preference"
            />
          )}
          {!showFullList && step === 2 && (
            <QuizStep
              key="step-2"
              icon={<User className="h-6 w-6" />}
              title="Doctor gender preference?"
              options={GENDER_OPTIONS}
              value={genderPreference}
              onSelect={(v) => {
                setGenderPreference(v);
                setTimeout(next, 200);
              }}
              testIdPrefix="gender"
              onBack={back}
              skipLabel="No preference"
            />
          )}
          {!showFullList && step === 3 && (
            <QuizStep
              key="step-3"
              icon={<MapPin className="h-6 w-6" />}
              title="Which borough do you prefer?"
              options={BOROUGH_OPTIONS}
              value={borough}
              onSelect={(v) => {
                setBorough(v);
                setTimeout(submit, 200);
              }}
              testIdPrefix="borough"
              onBack={back}
              isLoading={matchMutation.isPending}
              skipLabel="Anywhere in NYC"
            />
          )}

          {!showFullList && step === 4 && !selected && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Search className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold" data-testid="text-results-heading">
                      {matchMutation.isPending
                        ? "Finding the best doctors for you…"
                        : matchMutation.isError
                          ? "We couldn't load your matches"
                        : matches && matches.length > 0
                          ? `${matches.length} doctor${matches.length !== 1 ? "s" : ""} matched`
                          : "No exact matches found"}
                    </h2>
                  </div>

                  {matchMutation.isPending && (
                    <div data-testid="state-results-loading">
                      <p className="text-sm text-muted-foreground mb-4">
                        Scanning our network for the best primary care providers near you…
                      </p>
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => <DoctorCardSkeleton key={i} />)}
                      </div>
                    </div>
                  )}

                  {matchMutation.isError && (
                    <div className="text-center py-8" data-testid="state-results-error">
                      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
                      <p className="text-muted-foreground mb-4">
                        Something interrupted the doctor search. Your answers are still saved.
                      </p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        <Button onClick={() => matchMutation.mutate()} data-testid="button-retry-doctor-match">
                          Try Again
                        </Button>
                        <Button variant="outline" onClick={restart}>Start Over</Button>
                      </div>
                    </div>
                  )}

                  {!matchMutation.isPending && !matchMutation.isError && matches && matches.length === 0 && (
                    <div className="text-center py-8" data-testid="text-no-matches">
                      <p className="text-muted-foreground mb-4">
                        We couldn't find a perfect match in our network. Try broadening your preferences or browse our full directory.
                      </p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        <Button onClick={restart} data-testid="button-restart-quiz">Start Over</Button>
                        <Button variant="outline" onClick={() => setShowFullList(true)} data-testid="button-browse-full-list-empty">
                          Browse full list
                        </Button>
                      </div>
                    </div>
                  )}

                  {!matchMutation.isPending && matches && matches.length > 0 && (
                    <div className="space-y-4">
                      {matches.map((doc) => (
                        <DoctorCard
                          key={doc.id}
                          doctor={doc}
                          answers={answers}
                          onSelect={() => onSelectDoctor(doc)}
                          isSelecting={selectMutation.isPending}
                        />
                      ))}
                      <div className="pt-4 flex flex-wrap gap-3 justify-between">
                        <Button variant="ghost" onClick={restart} data-testid="button-restart-from-results">
                          Start Over
                        </Button>
                        <Button variant="outline" onClick={() => setShowFullList(true)} data-testid="button-browse-full-list">
                          Browse full list
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {showFullList && !selected && (
            <motion.div
              key="full-list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Search className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold" data-testid="text-full-list-heading">
                      All partner doctors
                    </h2>
                  </div>
                  {fullListQuery.isLoading && (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => <DoctorCardSkeleton key={i} />)}
                    </div>
                  )}
                  {fullListQuery.isError && (
                    <div className="text-center py-8" data-testid="state-full-list-error">
                      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
                      <p className="text-muted-foreground mb-4">
                        We couldn't load the doctor directory.
                      </p>
                      <Button onClick={() => fullListQuery.refetch()} data-testid="button-retry-full-list">
                        Try Again
                      </Button>
                    </div>
                  )}
                  {fullListQuery.data && fullListQuery.data.length > 0 && (
                    <div className="space-y-4">
                      {fullListQuery.data.map((doc) => (
                        <DoctorCard
                          key={doc.id}
                          doctor={doc}
                          answers={answers}
                          onSelect={() => onSelectDoctor(doc)}
                          isSelecting={selectMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                  {!fullListQuery.isLoading && !fullListQuery.isError && fullListQuery.data?.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground" data-testid="state-full-list-empty">
                      No partner doctors are listed right now. Please check back soon.
                    </p>
                  )}
                  <div className="pt-4 flex justify-between">
                    <Button variant="ghost" onClick={() => setShowFullList(false)} data-testid="button-back-to-quiz">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to results
                    </Button>
                    <Button variant="ghost" onClick={restart} data-testid="button-restart-from-full-list">
                      Start Over
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {selected && (
            <motion.div
              key="handoff"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <AppHandoffCard
                doctor={selected}
                leadId={leadId}
                requestToken={requestToken}
                onBack={() => setSelected(null)}
                onRestart={restart}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <SiteFooter />
    </div>
  );
}

function QuizStep({
  icon,
  title,
  options,
  value,
  onSelect,
  testIdPrefix,
  onBack,
  isLoading,
  skipLabel,
}: {
  icon: React.ReactNode;
  title: string;
  options: QuizOption[];
  value: string;
  onSelect: (v: string) => void;
  testIdPrefix: string;
  onBack?: () => void;
  isLoading?: boolean;
  skipLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6 text-primary">
            {icon}
            <h2 className="text-2xl font-semibold" data-testid={`text-quiz-step-${testIdPrefix}`}>
              {title}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onSelect(opt.value)}
                  disabled={isLoading}
                  className={`flex items-center gap-3 w-full text-left p-4 min-h-[64px] rounded-md border transition-colors hover-elevate active-elevate-2 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid={`button-${testIdPrefix}-${opt.value}`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md shrink-0 ${
                    isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {opt.icon}
                  </span>
                  <span className="font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelect("any")}
              disabled={isLoading}
              data-testid={`button-${testIdPrefix}-skip`}
              className="text-muted-foreground"
            >
              {skipLabel}
            </Button>
          </div>

          {(onBack || isLoading) && (
            <div className="flex items-center justify-between pt-6">
              {onBack ? (
                <Button variant="ghost" onClick={onBack} disabled={isLoading} data-testid={`button-back-${testIdPrefix}`}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              ) : <div />}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding your matches...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function DoctorCardSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4 rounded-md border border-border" data-testid="skeleton-doctor-card">
      <Skeleton className="h-16 w-16 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <Skeleton className="h-9 w-20" />
    </div>
  );
}

function buildMatchTags(doctor: DoctorPartner, answers: QuizAnswers): string[] {
  const tags: string[] = [];
  if (answers.specialty && answers.specialty !== "any" && doctor.specialty === answers.specialty) {
    tags.push(answers.specialty);
  }
  if (
    answers.language &&
    answers.language !== "any" &&
    (doctor.languages || []).includes(answers.language)
  ) {
    tags.push(answers.language);
  }
  if (
    answers.genderPreference &&
    answers.genderPreference !== "any" &&
    doctor.gender?.toLowerCase() === answers.genderPreference.toLowerCase()
  ) {
    tags.push(answers.genderPreference === "female" ? "Female" : "Male");
  }
  if (answers.borough && answers.borough !== "any" && doctor.borough === answers.borough) {
    tags.push(answers.borough);
  }
  return tags;
}

function DoctorCard({
  doctor,
  answers,
  onSelect,
  isSelecting = false,
}: {
  doctor: DoctorPartner;
  answers: QuizAnswers;
  onSelect: () => void;
  isSelecting?: boolean;
}) {
  const initials = `${doctor.firstName[0]}${doctor.lastName[0]}`.toUpperCase();
  const matchTags = buildMatchTags(doctor, answers);

  return (
    <div
      className="flex items-start gap-4 p-4 rounded-md border border-border hover-elevate"
      data-testid={`card-doctor-${doctor.id}`}
    >
      <Avatar className="h-16 w-16 shrink-0">
        {doctor.photoUrl && <AvatarImage src={doctor.photoUrl} alt={`Dr. ${doctor.lastName}`} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-lg" data-testid={`text-doctor-name-${doctor.id}`}>
          Dr. {doctor.firstName} {doctor.lastName}, {doctor.title}
        </h3>
        <p className="text-sm text-muted-foreground">{doctor.specialty}</p>

        {doctor.rating && (
          <div className="flex items-center gap-1.5 mt-1 mb-2" data-testid={`rating-${doctor.id}`}>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const ratingNum = parseFloat(doctor.rating as string);
                const filled = star <= Math.round(ratingNum);
                return (
                  <Star
                    key={star}
                    className={`h-3.5 w-3.5 ${filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                  />
                );
              })}
            </div>
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400" data-testid={`text-rating-value-${doctor.id}`}>
              {parseFloat(doctor.rating as string).toFixed(1)}
            </span>
            {doctor.reviewCount > 0 && (
              <span className="text-xs text-muted-foreground" data-testid={`text-review-count-${doctor.id}`}>
                ({doctor.reviewCount} reviews)
              </span>
            )}
          </div>
        )}

        {matchTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3" data-testid={`match-tags-${doctor.id}`}>
            {matchTags.map((t) => (
              <Badge
                key={t}
                className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15"
                data-testid={`match-tag-${doctor.id}-${t}`}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t}
              </Badge>
            ))}
          </div>
        )}

        {doctor.bio && <p className="text-sm mb-2 line-clamp-2">{doctor.bio}</p>}

        {doctor.patientQuote && (
          <div className="flex items-start gap-1.5 mb-3 text-xs text-muted-foreground italic" data-testid={`quote-${doctor.id}`}>
            <Quote className="h-3 w-3 shrink-0 mt-0.5 text-primary/50" />
            <span className="line-clamp-2">{doctor.patientQuote}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="outline" data-testid={`badge-borough-${doctor.id}`}>
            <MapPin className="h-3 w-3 mr-1" />
            {doctor.borough}
          </Badge>
          {(doctor.languages || []).map((lang) => (
            <Badge key={lang} variant="secondary" data-testid={`badge-lang-${doctor.id}-${lang}`}>
              <Globe className="h-3 w-3 mr-1" />
              {lang}
            </Badge>
          ))}
          {doctor.acceptingNewPatients && (
            <Badge
              className="bg-emerald-500 text-white hover:bg-emerald-500 border-transparent"
              data-testid={`badge-accepting-${doctor.id}`}
            >
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Accepting new patients
            </Badge>
          )}
        </div>

        {doctor.address && (
          <p className="text-xs text-muted-foreground" data-testid={`text-doctor-address-${doctor.id}`}>
            {doctor.address}
          </p>
        )}
        {doctor.phone && (
          <p className="text-xs text-muted-foreground mt-1" data-testid={`text-doctor-phone-${doctor.id}`}>
            <a href={`tel:${doctor.phone}`} className="hover:text-primary">{doctor.phone}</a>
          </p>
        )}
      </div>
      <Button
        onClick={onSelect}
        disabled={isSelecting}
        data-testid={`button-select-doctor-${doctor.id}`}
      >
        {isSelecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Select
            <ArrowRight className="h-4 w-4 ml-1" />
          </>
        )}
      </Button>
    </div>
  );
}

function FloatingField({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  testId,
  error,
  optional,
  placeholder = " ",
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  testId: string;
  error?: string;
  optional?: boolean;
  placeholder?: string;
}) {
  const reactId = useId();
  const fieldId = id || reactId;
  return (
    <div className="grid gap-1">
      <div className="relative">
        <Input
          id={fieldId}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          data-testid={testId}
          aria-invalid={!!error}
          className="peer h-14 pt-5 pb-1"
        />
        <label
          htmlFor={fieldId}
          className="pointer-events-none absolute left-3 top-1.5 text-xs text-muted-foreground transition-all
            peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base
            peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary"
        >
          {label}
          {optional && <span className="ml-1 text-muted-foreground/70">(optional)</span>}
        </label>
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid={`${testId}-error`}>{error}</p>
      )}
    </div>
  );
}

function FloatingTextarea({
  id,
  label,
  value,
  onChange,
  testId,
  optional,
  rows = 3,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  testId: string;
  optional?: boolean;
  rows?: number;
}) {
  const reactId = useId();
  const fieldId = id || reactId;
  return (
    <div className="relative">
      <Textarea
        id={fieldId}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder=" "
        data-testid={testId}
        className="peer pt-6"
      />
      <label
        htmlFor={fieldId}
        className="pointer-events-none absolute left-3 top-1.5 text-xs text-muted-foreground transition-all
          peer-placeholder-shown:top-3 peer-placeholder-shown:text-base
          peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary"
      >
        {label}
        {optional && <span className="ml-1 text-muted-foreground/70">(optional)</span>}
      </label>
    </div>
  );
}

function AppHandoffCard({
  doctor,
  leadId,
  requestToken,
  onBack,
  onRestart,
}: {
  doctor: DoctorPartner;
  leadId: number | null;
  requestToken: string | null;
  onBack: () => void;
  onRestart: () => void;
}) {
  const { toast } = useToast();
  const baseUrl = (import.meta.env.VITE_CONCORDIA_CARE_APP_URL as string | undefined) || "";
  const appStoreUrl = "https://apps.apple.com/us/app/concordiacare/id6741450205";
  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.concordia.care";
  const initials = `${doctor.firstName[0]}${doctor.lastName[0]}`.toUpperCase();

  const [submitted, setSubmitted] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [patientNotes, setPatientNotes] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  const preferredTime = buildPreferredTimeString(selectedDays, selectedTimes);

  const toggleDay = (day: string) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  const toggleTime = (time: string) =>
    setSelectedTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time],
    );

  const requestMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/find-doctor/request", {
        leadId,
        requestToken,
        doctorId: doctor.id,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim(),
        preferredTime,
        preferredDays: selectedDays.length > 0 ? selectedDays : undefined,
        preferredTimesOfDay: selectedTimes.length > 0 ? selectedTimes : undefined,
        patientNotes: patientNotes.trim(),
      });
      return await res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "We couldn't submit your request. Please try again or call the office directly.",
        variant: "destructive",
      });
    },
  });

  const validate = () => {
    const next: { name?: string; phone?: string; email?: string } = {};
    if (!patientName.trim()) next.name = "Please enter your name.";
    const phoneDigits = patientPhone.replace(/\D/g, "");
    if (phoneDigits.length < 10) next.phone = "Please enter a 10-digit phone number.";
    if (patientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail.trim())) {
      next.email = "Please enter a valid email.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId || !requestToken) {
      toast({ title: "Session expired", description: "Please start the quiz again.", variant: "destructive" });
      return;
    }
    if (!validate()) return;
    requestMutation.mutate();
  };

  if (submitted) {
    const formattedPhone = formatPhone(patientPhone) || patientPhone;
    return (
      <Card data-testid="card-success">
        <CardContent className="p-6 md:p-10 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            className="flex justify-center mb-6"
          >
            <div className="h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center ring-4 ring-emerald-500/10">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            </div>
          </motion.div>

          <h2 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-request-confirmation-heading">
            You're all set, {patientName.split(" ")[0]}!
          </h2>
          <p className="text-muted-foreground text-lg mb-2 max-w-lg mx-auto" data-testid="text-request-confirmation-body">
            Dr. {doctor.lastName}'s office will reach out to you at{" "}
            <span className="font-semibold text-foreground">{formattedPhone}</span> within{" "}
            <span className="font-semibold text-foreground">24 business hours</span>
            {preferredTime ? <> around <span className="font-semibold text-foreground">{preferredTime}</span></> : null}.
          </p>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            No further action needed. Our pharmacy team will coordinate the handoff so your
            first appointment is smooth.
          </p>

          <div className="mb-8 p-4 rounded-md bg-muted/40 max-w-sm mx-auto text-left" data-testid="card-request-summary">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-12 w-12 shrink-0">
                {doctor.photoUrl && <AvatarImage src={doctor.photoUrl} alt={`Dr. ${doctor.lastName}`} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold" data-testid="text-summary-doctor-name">Dr. {doctor.firstName} {doctor.lastName}, {doctor.title}</p>
                <p className="text-sm text-muted-foreground" data-testid="text-summary-specialty-borough">{doctor.specialty} · {doctor.borough}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3 mt-1" data-testid="text-summary-schedule">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm">
                <span className="text-muted-foreground">Preferred schedule: </span>
                <span className="font-medium">
                  {preferredTime || "No preference. Office will arrange a time"}
                </span>
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-8 mt-2 max-w-sm mx-auto text-left">
            <PostSubmissionCTA confirmationMessage="Dr.'s office will be in touch within 24 hours. No further action needed.">
              <div className="text-sm space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Your Request</p>
                <p className="font-semibold">Dr. {doctor.firstName} {doctor.lastName}</p>
                <p className="text-muted-foreground">{doctor.specialty} · contact at {formattedPhone}</p>
              </div>
            </PostSubmissionCTA>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onRestart} data-testid="button-restart-after-request">
              Find another doctor
            </Button>
            {doctor.phone && (
              <p className="text-sm text-muted-foreground">
                Need to reach the office sooner?{" "}
                <a href={`tel:${doctor.phone}`} className="text-primary underline" data-testid="link-doctor-phone">
                  {doctor.phone}
                </a>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-3" data-testid="text-handoff-heading">Great choice!</h2>
          <div className="inline-flex items-center gap-3 mb-3 px-4 py-2 rounded-md bg-muted/40">
            <Avatar className="h-12 w-12">
              {doctor.photoUrl && <AvatarImage src={doctor.photoUrl} alt={`Dr. ${doctor.lastName}`} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-semibold">Dr. {doctor.firstName} {doctor.lastName}, {doctor.title}</p>
              <p className="text-sm text-muted-foreground">{doctor.specialty} · {doctor.borough}</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-md mx-auto">
            Share a few details and we'll have the office reach out to set up your first appointment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 max-w-xl mx-auto" noValidate>
          <FloatingField
            label="Full name"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            autoComplete="name"
            testId="input-patient-name"
            error={errors.name}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FloatingField
              label="Phone"
              value={patientPhone}
              onChange={(e) => setPatientPhone(formatPhone(e.target.value))}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              testId="input-patient-phone"
              error={errors.phone}
            />
            <FloatingField
              label="Email"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              testId="input-patient-email"
              error={errors.email}
              optional
            />
          </div>

          <div className="grid gap-3" data-testid="section-preferred-time">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Best time to reach you</span>
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </div>
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">Time of day</p>
              <div className="flex flex-wrap gap-2">
                {TIME_OPTIONS.map((opt) => {
                  const active = selectedTimes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleTime(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm transition-colors hover-elevate ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                      data-testid={`button-time-${opt.value}`}
                    >
                      {opt.icon}
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs opacity-70">{opt.sublabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">Days</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
                  const WEEKEND = ["Sat", "Sun"];
                  const allWeekdaysSelected = WEEKDAYS.every((d) => selectedDays.includes(d));
                  const allWeekendSelected = WEEKEND.every((d) => selectedDays.includes(d));
                  const toggleWeekdays = () => {
                    if (allWeekdaysSelected) {
                      setSelectedDays((prev) => prev.filter((d) => !WEEKDAYS.includes(d)));
                    } else {
                      setSelectedDays((prev) => [...new Set([...prev, ...WEEKDAYS])]);
                    }
                  };
                  const toggleWeekend = () => {
                    if (allWeekendSelected) {
                      setSelectedDays((prev) => prev.filter((d) => !WEEKEND.includes(d)));
                    } else {
                      setSelectedDays((prev) => [...new Set([...prev, ...WEEKEND])]);
                    }
                  };
                  return (
                    <>
                      <button
                        type="button"
                        onClick={toggleWeekdays}
                        className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors hover-elevate ${
                          allWeekdaysSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                        data-testid="button-day-shortcut-weekdays"
                      >
                        Weekdays
                      </button>
                      <button
                        type="button"
                        onClick={toggleWeekend}
                        className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors hover-elevate ${
                          allWeekendSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                        data-testid="button-day-shortcut-weekend"
                      >
                        Weekend
                      </button>
                      <div className="w-full h-px bg-border" />
                      {DAY_OPTIONS.map((opt) => {
                        const active = selectedDays.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleDay(opt.value)}
                            className={`min-w-[44px] px-3 py-1.5 rounded-md border text-sm font-medium transition-colors hover-elevate ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground"
                            }`}
                            data-testid={`button-day-${opt.value}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
            {preferredTime && (
              <p className="text-xs text-muted-foreground" data-testid="text-preferred-time-summary">
                <span className="font-medium text-foreground">{preferredTime}</span>. We'll pass this to the office
              </p>
            )}
          </div>

          <FloatingTextarea
            label="Anything else we should know?"
            value={patientNotes}
            onChange={(e) => setPatientNotes(e.target.value)}
            testId="input-patient-notes"
            optional
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={requestMutation.isPending}
              data-testid="button-handoff-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Choose another doctor
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={requestMutation.isPending}
              data-testid="button-submit-request"
            >
              {requestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send request
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </form>

        {doctor.phone && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Prefer to call? <a href={`tel:${doctor.phone}`} className="text-primary underline" data-testid="link-doctor-phone-form">
              <Phone className="h-3 w-3 inline mr-1" />
              {doctor.phone}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
