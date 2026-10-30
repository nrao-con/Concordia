import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { MotionButton } from "@/components/motion-button";
import { Badge } from "@/components/ui/badge";
import { dismantlingStaggerGrid, dismantlingCardEntrance, dismantlingSectionEntrance } from "@/lib/animations";
import { AnimatedSearch } from "@/components/animated-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SpecialtyMedication } from "@shared/schema";
import {
  Search,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  Pill,
  Brain,
  Bone,
  Sparkles,
  Shield,
  Activity,
  Microscope,
  Layers,
  ChevronLeft,
  X,
  Upload,
  Phone,
  Mail,
  User,
  Stethoscope,
  HeartHandshake,
  Database,
  Lock,
  BarChart3,
  Handshake,
  ShieldCheck,
  FlaskConical,
  Eye,
  AlertTriangle,
  Syringe,
  Thermometer,
  Calendar,
  BookOpen,
  FlaskRound,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { LucideIcon } from "lucide-react";

function getMedDisplayName(med: SpecialtyMedication): { primary: string; secondary: string | null } {
  if (med.isComboProtocol) {
    return { primary: med.name, secondary: med.comboComponents || null };
  }
  const brand = med.brandName?.trim();
  const generic = med.genericName?.trim();
  if (brand && generic && brand.toLowerCase() !== generic.toLowerCase()) {
    return { primary: brand, secondary: generic };
  }
  if (brand) {
    return { primary: brand, secondary: null };
  }
  if (generic) {
    return { primary: generic, secondary: null };
  }
  return { primary: med.name, secondary: null };
}

const CATEGORY_MAP: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  oncology_colorectal: { label: "Oncology (Colorectal)", icon: Microscope, color: "text-red-400" },
  psychology: { label: "Psychology & Behavioral Health", icon: Brain, color: "text-purple-400" },
  rheumatology: { label: "Rheumatology", icon: Bone, color: "text-primary" },
  dermatology: { label: "Dermatology", icon: Sparkles, color: "text-amber-400" },
  hepatitis: { label: "Hepatitis B & C", icon: Shield, color: "text-green-400" },
  multiple_sclerosis: { label: "Multiple Sclerosis", icon: Activity, color: "text-cyan-400" },
  general_oncology: { label: "Oncology (General)", icon: Pill, color: "text-rose-400" },
};


const BIOPHARMA_PILLARS = [
  {
    icon: FlaskConical,
    title: "Custom Process Flows",
    description: "We build our dispensing workflow around your drug, not the other way around. From REMS programs to specialty handling protocols, we adapt to your product requirements.",
  },
  {
    icon: Lock,
    title: "Limited Distribution Excellence",
    description: "Exclusive NY partner for rare-disease and orphan-drug therapies. White-glove patient onboarding and adherence management for limited-distribution networks.",
  },
  {
    icon: Eye,
    title: "Data Transparency",
    description: "Partner Portal access for real-time dispensing visibility, patient adherence metrics, and territory performance reporting. Data you can act on.",
  },
];

function NYMapBackground() {
  const dots = useMemo(() => {
    const positions = [
      { x: 58, y: 72, delay: 0, size: 3 },
      { x: 62, y: 68, delay: 0.5, size: 2.5 },
      { x: 55, y: 75, delay: 1.2, size: 2 },
      { x: 65, y: 65, delay: 0.8, size: 2 },
      { x: 50, y: 60, delay: 1.5, size: 2.5 },
      { x: 45, y: 50, delay: 2, size: 2 },
      { x: 52, y: 45, delay: 0.3, size: 2 },
      { x: 60, y: 40, delay: 1.8, size: 2.5 },
      { x: 40, y: 35, delay: 1, size: 2 },
      { x: 55, y: 30, delay: 0.7, size: 2 },
      { x: 48, y: 55, delay: 1.4, size: 3 },
      { x: 42, y: 42, delay: 2.2, size: 2 },
      { x: 35, y: 48, delay: 0.6, size: 2.5 },
      { x: 68, y: 60, delay: 1.1, size: 2 },
      { x: 38, y: 30, delay: 1.9, size: 2 },
    ];
    return positions;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-20">
        <svg viewBox="0 0 100 100" className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-15" preserveAspectRatio="xMidYMid meet">
          <path
            d="M35,15 L42,12 L50,14 L58,10 L65,13 L70,18 L72,25 L68,32 L70,40 L73,48 L70,55 L72,62 L68,70 L65,75 L60,78 L55,80 L50,78 L45,80 L40,75 L35,70 L32,60 L30,50 L32,40 L30,30 L33,22 Z"
            fill="none"
            stroke="hsl(var(--primary) / 0.3)"
            strokeWidth="0.5"
          />
          <path
            d="M37,18 L43,15 L49,17 L56,13 L63,16 L67,20 L69,27 L66,34 L68,42 L70,49 L68,56 L69,63 L66,69 L63,73 L59,76 L54,77 L50,76 L46,77 L42,73 L37,68 L34,58 L33,50 L34,42 L33,32 L35,24 Z"
            fill="hsl(var(--primary) / 0.03)"
            stroke="hsl(var(--primary) / 0.12)"
            strokeWidth="0.3"
          />
        </svg>
      </div>

      {dots.map((dot, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            opacity: 0.32,
          }}
        >
        </div>
      ))}
    </div>
  );
}

export default function Specialty() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAvailability, setSelectedAvailability] = useState<string>("all");
  const [fulfillmentMed, setFulfillmentMed] = useState<SpecialtyMedication | null>(null);
  const [fulfillSuccessData, setFulfillSuccessData] = useState<{ medName: string } | null>(null);
  const [detailMed, setDetailMed] = useState<SpecialtyMedication | null>(null);

  const [formData, setFormData] = useState({
    patientName: "",
    phone: "",
    email: "",
    prescriberName: "",
    requestType: "new_prescription" as "new_prescription" | "transfer" | "e_script",
    notes: "",
  });
  const { toast } = useToast();

  const { data: medications = [], isLoading } = useQuery<SpecialtyMedication[]>({
    queryKey: ["/api/specialty-medications"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/specialty-fulfillment-requests", data);
      return res.json();
    },
    onSuccess: () => {
      const medName = fulfillmentMed?.name ?? "";
      queryClient.invalidateQueries({ queryKey: ["/api/specialty-fulfillment-requests/mine"] });
      setFulfillSuccessData({ medName });
      setFulfillmentMed(null);
      setFormData({ patientName: "", phone: "", email: "", prescriberName: "", requestType: "new_prescription", notes: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit request. Please try again.", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = medications;
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.genericName && m.genericName.toLowerCase().includes(q)) ||
        (m.brandName && m.brandName.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== "all") {
      result = result.filter(m => m.category === selectedCategory);
    }
    if (selectedAvailability !== "all") {
      result = result.filter(m => m.availabilityStatus === selectedAvailability);
    }
    return result;
  }, [medications, searchQuery, selectedCategory, selectedAvailability]);

  const regularMeds = filtered.filter(m => !m.isComboProtocol);
  const comboProtocols = filtered.filter(m => m.isComboProtocol);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, SpecialtyMedication[]> = {};
    regularMeds.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return groups;
  }, [regularMeds]);

  const handleSubmitFulfillment = useCallback(() => {
    if (!fulfillmentMed) return;
    if (!formData.patientName || !formData.phone || !formData.prescriberName) {
      toast({ title: "Required Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    submitMutation.mutate({
      medicationId: fulfillmentMed.id,
      medicationName: fulfillmentMed.name,
      ...formData,
    });
  }, [fulfillmentMed, formData, submitMutation, toast]);

  const suggestions = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return medications.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.genericName && m.genericName.toLowerCase().includes(q)) ||
      (m.brandName && m.brandName.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [medications, searchQuery]);

  const openFulfillment = useCallback((med: SpecialtyMedication, isConsultation?: boolean) => {
    setFulfillmentMed(med);
    setFormData(d => ({
      ...d,
      notes: isConsultation ? "Requesting clinical consultation regarding this therapy." : "",
    }));
  }, []);

  const scrollToVault = () => {
    document.getElementById("medication-vault")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToContact = () => {
    document.getElementById("dual-track-cta")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PageTransition className="specialty-light-page min-h-screen" style={{ background: "hsl(204 35% 97%)" }}>
      <SEO
        title="Specialty Medications"
        description="Concordia Pharmacy's specialty pharmacy services. Expert support for complex medications including oncology, HIV, hepatitis, autoimmune, and rare disease therapies."
        path="/specialty"
      />
      <Header />
      <AnimatePresence>
        {searchFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <section className="relative py-20 sm:py-28 overflow-hidden">
        <NYMapBackground />
         <div className="absolute inset-0 specialty-hero-wash" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="text-center"
          >
            <Badge variant="outline" className="mb-5 border-primary/30 text-primary/70 bg-primary/10">
              <Database className="h-3 w-3 mr-1" />
              Biopharma Launchpad
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight" data-testid="text-specialty-title">
              Concordia: Where Breakthrough
              <br />
               <span className="text-primary">
                Science Meets Patient Access
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-200 max-w-3xl mx-auto mb-8">
              The last mile for complex therapies. From cold-chain biologics to limited-distribution orphan drugs, Concordia is the clinical infrastructure that connects manufacturers to patients across New York.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <MotionButton size="lg" className="gap-2" onClick={scrollToContact} data-testid="button-partner-with-us">
                <Handshake className="h-4 w-4" />
                Partner With Us
              </MotionButton>
              <MotionButton variant="outline" size="lg" className="gap-2 backdrop-blur-sm" onClick={scrollToVault} data-testid="button-explore-pipeline">
                <FlaskConical className="h-4 w-4" />
                Explore our 2026 Pipeline Solutions
              </MotionButton>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center justify-center p-5 rounded-full bg-gradient-to-br from-primary/20 to-emerald-500/10 border border-white/[0.06] mb-7">
              <HeartHandshake className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-5 leading-tight" data-testid="text-support-heading">
              No Matter What,<br className="hidden sm:block" /> We're Here to Help
            </h2>
            <p className="text-slate-200 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Whether it's a hard-to-find specialty medication, navigating insurance, or coordinating with your provider, our team is ready to support you every step of the way.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-14"
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true, amount: 0.15 }}
            variants={dismantlingStaggerGrid}
          >
            {[
              { icon: Pill, label: "Hard-to-Find Medications", desc: "Access to specialty and rare medications through our extensive sourcing network.", color: "text-primary", bg: "bg-primary/10" },
              { icon: ShieldCheck, label: "Insurance Navigation", desc: "Prior authorizations, copay assistance, and benefits investigation handled for you.", color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: Stethoscope, label: "Provider Coordination", desc: "Direct communication with your doctors to ensure seamless, uninterrupted care.", color: "text-violet-400", bg: "bg-violet-500/10" },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div key={item.label} variants={dismantlingCardEntrance(idx)}>
                  <Card className="h-full border-white/[0.06] bg-white/[0.02] backdrop-blur-sm text-center" data-testid={`card-support-pillar-${idx}`}>
                    <CardContent className="p-6 sm:p-8 flex flex-col items-center">
                      <div className={`p-3 rounded-lg ${item.bg} ${item.color} mb-4`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-base font-semibold text-white mb-2">{item.label}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center"
          >
            <p className="text-slate-300 text-base mb-6">
              Concordia Pharmacy has been serving New York communities for years. Your health is our priority, and no request is too complex.
            </p>
            <MotionButton size="lg" className="gap-2" onClick={scrollToContact} data-testid="button-here-to-help-cta">
              <Phone className="h-4 w-4" />
              Talk to Our Team
            </MotionButton>
          </motion.div>
        </div>
      </section>

      <section id="medication-vault" className="clinical-section-alt py-16 sm:py-20 border-t border-white/5 relative z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary/70 bg-primary/10">
              <Lock className="h-3 w-3 mr-1" />
              Medication Vault
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-vault-heading">
              Medication Vault
            </h2>
            <p className="text-slate-200 text-lg max-w-2xl mx-auto">
              Search our 2026 Specialty Formulary. Browse by brand, generic, or condition.
            </p>
            <p className="text-primary/70 text-sm mt-3">
              Don't see what you need? Let us know. We'll find it for you.
            </p>
          </motion.div>

          <div className="max-w-2xl mx-auto relative mb-8">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                <AnimatedSearch className="h-5 w-5 text-slate-400" isFocused={searchFocused} />
              </span>
              <Input
                aria-label="Search specialty medications"
                placeholder="Search by brand, generic, or condition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="pl-12 h-12 text-base bg-white/5 border-white/10 text-white placeholder:text-slate-300 focus:border-primary"
                data-testid="input-specialty-search"
              />
              {searchQuery && (
                <MotionButton
                  variant="ghost"
                  size="icon"
                  aria-label="Clear medication search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8"
                  data-testid="button-clear-search"
                >
                  <X aria-hidden="true" className="h-4 w-4 text-slate-400" />
                </MotionButton>
              )}
            </div>

            <AnimatePresence>
              {suggestions.length > 0 && searchQuery.length >= 2 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                   className="absolute z-50 w-full mt-2 rounded-lg border border-white/10 bg-white shadow-2xl overflow-hidden"
                >
                  {suggestions.map((med) => {
                    const display = getMedDisplayName(med);
                    return (
                      <MotionButton
                        key={med.id}
                        variant="ghost"
                        className="w-full h-auto px-4 py-3 text-left no-default-hover-elevate flex items-center justify-between gap-3 rounded-none"
                        onClick={() => {
                          setSearchQuery(display.primary);
                        }}
                        data-testid={`suggestion-med-${med.id}`}
                      >
                        <div>
                          <p className="text-sm text-white font-medium">{display.primary}</p>
                          {display.secondary && <p className="text-xs text-slate-400">{display.secondary}</p>}
                        </div>
                        {med.availabilityStatus === "available" ? (
                          <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 shrink-0 text-xs">
                            In-Stock
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-primary/30 text-primary/70 bg-primary/10 shrink-0 text-xs">
                            Specialty Hub
                          </Badge>
                        )}
                      </MotionButton>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white" data-testid="select-category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_MAP).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAvailability} onValueChange={setSelectedAvailability}>
              <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white" data-testid="select-availability">
                <SelectValue placeholder="All Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Availability</SelectItem>
                <SelectItem value="available">In-Stock</SelectItem>
                <SelectItem value="specialty_request">Specialty Hub</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
                <p className="text-sm text-slate-400" data-testid="text-result-count">
                  {filtered.length} medication{filtered.length !== 1 ? "s" : ""} found
                </p>
                <Link href="/">
                  <MotionButton variant="ghost" size="sm" className="text-slate-400 gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    Back to Home
                  </MotionButton>
                </Link>
              </div>

              {comboProtocols.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Layers className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold text-white" data-testid="text-combo-protocols-heading">Common Protocols</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {comboProtocols.map((proto) => {
                      const protoDisplay = getMedDisplayName(proto);
                      return (
                      <Card
                        key={proto.id}
                        className="clinical-card-dark hover-elevate cursor-pointer"
                        data-testid={`card-combo-${proto.id}`}
                        onClick={() => setDetailMed(proto)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-white text-sm">{protoDisplay.primary}</h4>
                            <Badge variant="outline" className="border-primary/30 text-primary/70 bg-primary/10 shrink-0 text-xs">
                              Protocol
                            </Badge>
                          </div>
                          {protoDisplay.secondary && (
                            <p className="text-xs text-slate-400 mb-2">{protoDisplay.secondary}</p>
                          )}
                          {proto.description && (
                            <p className="text-xs text-slate-300 line-clamp-2 mb-2">{proto.description}</p>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <MotionButton
                              size="sm"
                              variant="outline"
                              className="w-full gap-1"
                              onClick={(e) => { e.stopPropagation(); setDetailMed(proto); }}
                              aria-label={`View details for ${protoDisplay.primary}`}
                              data-testid={`button-details-combo-${proto.id}`}
                            >
                              <Eye className="h-3 w-3" />
                              View Details
                            </MotionButton>
                            <MotionButton
                              size="sm"
                              className="w-full gap-1"
                              onClick={(e) => { e.stopPropagation(); openFulfillment(proto); }}
                              data-testid={`button-request-combo-${proto.id}`}
                            >
                              <FileText className="h-3 w-3" />
                              Request This Medication
                            </MotionButton>
                            <MotionButton
                              size="sm"
                              variant="ghost"
                              className="w-full text-emerald-400 gap-1"
                              onClick={(e) => { e.stopPropagation(); openFulfillment(proto, true); }}
                              data-testid={`button-consult-combo-${proto.id}`}
                            >
                              <Stethoscope className="h-3 w-3" />
                              Ask a Pharmacist
                            </MotionButton>
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {Object.entries(groupedByCategory).map(([category, meds]) => {
                const catInfo = CATEGORY_MAP[category];
                if (!catInfo) return null;
                const CatIcon = catInfo.icon;
                return (
                  <div key={category} className="mb-10">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <CatIcon className={`h-5 w-5 ${catInfo.color}`} />
                      <h3 className="text-xl font-semibold text-white" data-testid={`text-category-${category}`}>{catInfo.label}</h3>
                      <Badge variant="outline" className="border-white/10 text-slate-400">{meds.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {meds.map((med) => {
                        const display = getMedDisplayName(med);
                        return (
                        <Card
                          key={med.id}
                          className="clinical-card-dark hover-elevate cursor-pointer"
                          data-testid={`card-med-${med.id}`}
                          onClick={() => setDetailMed(med)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-white">{display.primary}</h4>
                              {med.availabilityStatus === "available" ? (
                                <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 shrink-0 text-xs">
                                  In-Stock
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-primary/30 text-primary/70 bg-primary/10 shrink-0 text-xs">
                                  Specialty Hub
                                </Badge>
                              )}
                            </div>
                            {display.secondary && (
                              <p className="text-xs text-slate-400 mb-1">{display.secondary}</p>
                            )}
                            {med.subcategory && (
                              <p className="text-xs text-slate-300 mb-2">{med.subcategory}</p>
                            )}
                            {med.description && (
                              <p className="text-xs text-slate-300 line-clamp-2 mb-3">{med.description}</p>
                            )}
                            <div className="flex flex-col gap-1.5">
                              <MotionButton
                                size="sm"
                                variant="outline"
                                className="w-full gap-1"
                                onClick={(e) => { e.stopPropagation(); setDetailMed(med); }}
                                aria-label={`View details for ${display.primary}`}
                                data-testid={`button-details-med-${med.id}`}
                              >
                                <Eye className="h-3 w-3" />
                                View Details
                              </MotionButton>
                              <MotionButton
                                size="sm"
                                className="w-full gap-1"
                                onClick={(e) => { e.stopPropagation(); openFulfillment(med); }}
                                data-testid={`button-request-med-${med.id}`}
                              >
                                <FileText className="h-3 w-3" />
                                Request This Medication
                                <ArrowRight className="h-3 w-3" />
                              </MotionButton>
                              <MotionButton
                                size="sm"
                                variant="ghost"
                                className="w-full text-emerald-400 gap-1"
                                onClick={(e) => { e.stopPropagation(); openFulfillment(med, true); }}
                                data-testid={`button-consult-med-${med.id}`}
                              >
                                <Stethoscope className="h-3 w-3" />
                                Ask a Pharmacist
                              </MotionButton>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="text-center py-16">
                  <Search className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-200 mb-2">No medications found</h3>
                  <p className="text-sm text-slate-300">Try adjusting your search or filters.</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="clinical-section-alt py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4 border-purple-500/30 text-purple-300 bg-purple-500/10">
              <BarChart3 className="h-3 w-3 mr-1" />
              For Manufacturers
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-biopharma-heading">
              Biopharma Strategic Partnership
            </h2>
            <p className="text-slate-200 text-lg max-w-2xl mx-auto">
              Purpose-built pharmacy operations for manufacturers launching specialty therapies in the New York market.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10"
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true, amount: 0.1 }}
            variants={dismantlingStaggerGrid}
          >
            {BIOPHARMA_PILLARS.map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <motion.div
                  key={pillar.title}
                  variants={dismantlingCardEntrance(idx)}
                >
                  <Card className="h-full border-white/8 bg-white/[0.03] backdrop-blur-sm hover-elevate" data-testid={`card-biopharma-pillar-${idx}`}>
                    <CardContent className="p-6 text-center">
                      <div className="inline-flex p-3 rounded-lg bg-purple-500/10 text-purple-400 mb-4">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{pillar.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{pillar.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          <div className="text-center">
            <MotionButton size="lg" className="gap-2" onClick={scrollToContact} data-testid="button-biopharma-cta">
              <Handshake className="h-4 w-4" />
              Schedule a Capabilities Briefing
              <ArrowRight className="h-4 w-4" />
            </MotionButton>
          </div>
        </div>
      </section>

      <section id="dual-track-cta" className="py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            variants={dismantlingSectionEntrance}
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-cta-heading">
              Ready to Get Started?
            </h2>
            <p className="text-slate-200 text-lg max-w-xl mx-auto">
              Whether you are a provider seeking specialty fulfillment or a manufacturer exploring distribution, we are here.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            initial="hidden"
            whileInView="visible"
            exit="exit"
            viewport={{ once: true, amount: 0.1 }}
            variants={dismantlingStaggerGrid}
          >
            <motion.div variants={dismantlingCardEntrance(0)}>
              <Card className="h-full border-white/8 bg-white/[0.03] backdrop-blur-sm" data-testid="card-cta-providers">
                <CardContent className="p-6 sm:p-8 flex flex-col h-full">
                  <div className="inline-flex p-3 rounded-lg bg-primary/10 text-primary mb-4 self-start">
                    <Stethoscope className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Providers & Patients</h3>
                  <p className="text-sm text-slate-400 mb-6 flex-1">
                    Transfer an existing specialty prescription or request a new specialty medication. Our clinical team handles prior authorization, benefits investigation, and coordination with your prescriber.
                  </p>
                  <MotionButton
                    size="lg"
                    className="w-full gap-2"
                    onClick={() => setFulfillmentMed({ id: 0, name: "General Specialty Request", genericName: null, brandName: null, manufacturer: null, category: "general_oncology", subcategory: null, availabilityStatus: "specialty_request", isComboProtocol: false, comboComponents: null } as SpecialtyMedication)}
                    data-testid="button-cta-provider-request"
                  >
                    <FileText className="h-4 w-4" />
                    Start a Transfer or Request a Specialty Med
                  </MotionButton>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={dismantlingCardEntrance(1)}>
              <Card className="h-full border-white/8 bg-white/[0.03] backdrop-blur-sm" data-testid="card-cta-biopharma">
                <CardContent className="p-6 sm:p-8 flex flex-col h-full">
                  <div className="inline-flex p-3 rounded-lg bg-purple-500/10 text-purple-400 mb-4 self-start">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Biopharma & Vendors</h3>
                  <p className="text-sm text-slate-400 mb-6 flex-1">
                    Explore a distribution partnership with Concordia. Schedule a capabilities briefing to learn how our clinical infrastructure, cold-chain logistics, and NY market reach can accelerate your product launch.
                  </p>
                  <a href="mailto:partnerships@concordiapharmacy.com?subject=Partnership%20Capabilities%20Briefing%20Request">
                    <MotionButton size="lg" variant="outline" className="w-full gap-2 backdrop-blur-sm" data-testid="button-cta-biopharma-briefing">
                      <Mail className="h-4 w-4" />
                      Schedule a Partnership Capabilities Briefing
                    </MotionButton>
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <SiteFooter />

      <Dialog open={!!detailMed} onOpenChange={(open) => !open && setDetailMed(null)}>
         <DialogContent className="specialty-dialog sm:max-w-2xl bg-white border-slate-200 text-slate-900 p-0 max-h-[85vh] overflow-hidden" data-testid="dialog-med-detail">
          <ScrollArea className="max-h-[85vh]" data-lenis-prevent>
            <div className="p-6">
              <DialogHeader className="mb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const detailDisplay = detailMed ? getMedDisplayName(detailMed) : null;
                      return (
                        <>
                          <DialogTitle className="text-white text-xl mb-1" data-testid="text-detail-title">
                            {detailDisplay?.primary || detailMed?.name}
                          </DialogTitle>
                          <DialogDescription className="text-slate-400 text-sm">
                            {detailDisplay?.secondary && <span>{detailDisplay.secondary}</span>}
                            {detailMed?.manufacturer && <span className="text-slate-300"> · {detailMed.manufacturer}</span>}
                          </DialogDescription>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {detailMed?.isComboProtocol && (
                      <Badge variant="outline" className="border-primary/30 text-primary/70 bg-primary/10 text-xs">
                        <Layers className="h-3 w-3 mr-1" />
                        Protocol
                      </Badge>
                    )}
                    {detailMed?.availabilityStatus === "available" ? (
                      <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-xs">
                        In-Stock
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-primary/30 text-primary/70 bg-primary/10 text-xs">
                        Specialty Hub
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="mb-4 p-3 rounded-lg border border-white/8 bg-white/[0.02]" data-testid="detail-disclaimer">
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300">For reference only.</span> This information is not medical advice. Always speak with your pharmacist or doctor before starting, changing, or stopping any medication.
                </p>
              </div>

              {detailMed?.blackBoxWarning && (
                <div className="mb-5 p-3 rounded-lg border border-red-500/30 bg-red-500/5" data-testid="detail-black-box-warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">Important Safety Warning</p>
                      <p className="text-xs text-red-300/80 leading-relaxed">
                        {detailMed.blackBoxWarningText || "This medication carries an FDA Black Box Warning. Talk to your pharmacist or doctor before taking this medication."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {detailMed?.description && (
                <div className="mb-5" data-testid="detail-description">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-white">What It's Used For</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{detailMed.description}</p>
                </div>
              )}

              {detailMed?.isComboProtocol && detailMed?.comboComponents && (
                <div className="mb-5" data-testid="detail-combo-components">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-white">Medications in This Protocol</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{detailMed.comboComponents}</p>
                </div>
              )}

              {detailMed?.mechanismOfAction && (
                <div className="mb-5" data-testid="detail-moa">
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskRound className="h-4 w-4 text-purple-400" />
                    <h4 className="text-sm font-semibold text-white">How It Works in Your Body</h4>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{detailMed.mechanismOfAction}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {detailMed?.administrationRoute && (
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5" data-testid="detail-admin-route">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Syringe className="h-3.5 w-3.5 text-cyan-400" />
                      <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">How It's Given</h5>
                    </div>
                    <p className="text-sm text-slate-400">{detailMed.administrationRoute}</p>
                  </div>
                )}

                {detailMed?.typicalDosing && (
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5" data-testid="detail-dosing">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Pill className="h-3.5 w-3.5 text-emerald-400" />
                      <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Typical Dose</h5>
                    </div>
                    <p className="text-sm text-slate-400">{detailMed.typicalDosing}</p>
                    <p className="text-xs text-slate-500 mt-1.5">Your doctor or pharmacist will confirm your exact dose.</p>
                  </div>
                )}

                {detailMed?.storageRequirements && (
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5" data-testid="detail-storage">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                      <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">How to Store It</h5>
                    </div>
                    <p className="text-sm text-slate-400">{detailMed.storageRequirements}</p>
                  </div>
                )}

                {detailMed?.fdaApprovalYear && (
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5" data-testid="detail-fda-year">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">FDA Approved Since</h5>
                    </div>
                    <p className="text-sm text-slate-400">{detailMed.fdaApprovalYear}</p>
                  </div>
                )}
              </div>

              {detailMed?.commonSideEffects && detailMed.commonSideEffects.length > 0 && (
                <div className="mb-5" data-testid="detail-side-effects">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-white">Common Side Effects</h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailMed.commonSideEffects.map((se, i) => (
                      <Badge key={i} variant="outline" className="border-white/10 text-slate-400 bg-white/[0.03] text-xs font-normal">
                        {se}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">If you experience any of these, contact your pharmacist or doctor.</p>
                </div>
              )}

              <div className="my-4 h-px bg-white/5" />

              <div className="flex flex-col sm:flex-row gap-2">
                <MotionButton
                  className="flex-1 gap-1"
                  onClick={() => {
                    const med = detailMed;
                    setDetailMed(null);
                    if (med) openFulfillment(med);
                  }}
                  data-testid="button-detail-fulfillment"
                >
                  <FileText className="h-4 w-4" />
                  Request This Medication
                  <ArrowRight className="h-4 w-4" />
                </MotionButton>
                <MotionButton
                  variant="outline"
                  className="flex-1 gap-1 backdrop-blur-sm"
                  onClick={() => {
                    const med = detailMed;
                    setDetailMed(null);
                    if (med) openFulfillment(med, true);
                  }}
                  data-testid="button-detail-consultation"
                >
                  <Stethoscope className="h-4 w-4" />
                  Ask a Pharmacist
                </MotionButton>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!fulfillmentMed || !!fulfillSuccessData}
        onOpenChange={(open) => { if (!open) { setFulfillmentMed(null); setFulfillSuccessData(null); } }}
      >
         <DialogContent className="specialty-dialog sm:max-w-lg bg-white border-slate-200 text-slate-900">
          {fulfillSuccessData ? (
            <PostSubmissionCTA
              confirmationMessage={`Your fulfillment request for ${fulfillSuccessData.medName || "this medication"} has been submitted. Our clinical team will be in touch shortly.`}
            />
          ) : (
          <>
          {(() => {
            const fulfillDisplay = fulfillmentMed ? getMedDisplayName(fulfillmentMed) : null;
            return (
              <DialogHeader>
                <DialogTitle className="text-white" data-testid="text-fulfillment-title">Request Fulfillment</DialogTitle>
                <DialogDescription className="text-slate-400">
                  {fulfillDisplay?.primary || ""}
                  {fulfillDisplay?.secondary && (
                    <span className="text-slate-300"> ({fulfillDisplay.secondary})</span>
                  )}
                </DialogDescription>
              </DialogHeader>
            );
          })()}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">
                <User className="h-3 w-3 inline mr-1" />
                Patient Name *
              </Label>
              <Input
                value={formData.patientName}
                onChange={(e) => setFormData(d => ({ ...d, patientName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
                placeholder="Full name"
                data-testid="input-patient-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300">
                  <Phone className="h-3 w-3 inline mr-1" />
                  Phone *
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData(d => ({ ...d, phone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="(555) 555-5555"
                  data-testid="input-patient-phone"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">
                  <Mail className="h-3 w-3 inline mr-1" />
                  Email
                </Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData(d => ({ ...d, email: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="email@example.com"
                  data-testid="input-patient-email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">
                <Stethoscope className="h-3 w-3 inline mr-1" />
                Prescriber Name *
              </Label>
              <Input
                value={formData.prescriberName}
                onChange={(e) => setFormData(d => ({ ...d, prescriberName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
                placeholder="Dr. Last Name"
                data-testid="input-prescriber-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Request Type *</Label>
              <Select
                value={formData.requestType}
                onValueChange={(v) => setFormData(d => ({ ...d, requestType: v as "new_prescription" | "transfer" | "e_script" }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-request-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_prescription">
                    <div className="flex items-center gap-2">
                      <Upload className="h-3 w-3" />
                      New Prescription (Upload Image)
                    </div>
                  </SelectItem>
                  <SelectItem value="transfer">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3" />
                      Transfer from Pharmacy
                    </div>
                  </SelectItem>
                  <SelectItem value="e_script">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      Doctor to Send E-Script
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Additional Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(d => ({ ...d, notes: e.target.value }))}
                className="bg-white/5 border-white/10 text-white resize-none"
                placeholder="Any additional information..."
                rows={3}
                data-testid="input-notes"
              />
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                Our clinical team will review your request and contact you or your prescriber to finalize fulfillment. All information is handled in accordance with HIPAA regulations.
              </p>
            </div>

            <MotionButton
              className="w-full"
              onClick={handleSubmitFulfillment}
              disabled={submitMutation.isPending}
              data-testid="button-submit-fulfillment"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Request"}
            </MotionButton>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
