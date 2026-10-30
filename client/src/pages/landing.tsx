import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { SEO } from "@/components/seo";
import { Header } from "@/components/header";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MotionButton } from "@/components/motion-button";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PostSubmissionCTA } from "@/components/post-submission-cta";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence, useMotionValue, useScroll, useTransform, animate, useInView, useReducedMotion, type MotionValue } from "framer-motion";
import { PageTransition } from "@/components/page-transition";
import { useToast } from "@/hooks/use-toast";
import { TiltCard } from "@/components/tilt-card";
import { FiberPulse } from "@/components/fiber-pulse";
import { bubbleEntrance, bubbleStagger } from "@/lib/animations";
import { 
  Syringe, 
  MapPin, 
  Clock, 
  Phone, 
  Star,
  ShoppingBag,
  Pill,
  ArrowRight,
  CheckCircle,
  Heart,
  Shield,
  Truck,
  Box,
  User,
  RefreshCw,
  Gift,
  Sparkles,
  Smartphone,
  MessageCircle,
  Navigation,
  Award,
  Building2,
  Apple,
  PackageCheck,
  ShoppingCart,
  CircleCheckBig,
  PenLine,
  Home,
  BadgeDollarSign,
  ScanLine,
  Wallet,
  ClipboardList,
  TrendingDown,
  Users,
} from "lucide-react";
import { RxCategoryCarousel } from "@/components/rx-category-carousel";
import { AnimatedPen } from "@/components/animated-icons";
import pharmacistHelpingImage from "@assets/generated_images/pharmacist_helping_diverse_customers.png";
import { ScrollVideoHero } from "@/components/scroll-video-hero";
import concordiaCIcon from "@assets/concordia_c_icon.png";
import fluShotFamilyImage from "@assets/generated_images/flu_shot_real_family.png";
import blisterPersonImg from "@assets/generated_images/person_with_blister_pack.png";
import blisterPackImg from "@assets/generated_images/blister_pack_organizer.png";
import pharmacistHelpingPatientImage from "@assets/generated_images/pharmacist_helping_patient.png";
import otcProductsImage from "@assets/stock_images/over_the_counter_med_4a89198a.jpg";
import familyPharmacyImage from "@assets/generated_images/multigenerational_family_pharmacy_visit.png";


function CountUpNumber({ end, suffix = "", duration = 2, decimals = 0 }: { end: number; suffix?: string; duration?: number; decimals?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, end, { duration, ease: "easeOut" });
      const unsubscribe = count.on("change", (v) => {
        setDisplay(decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)));
      });
      return () => {
        controls.stop();
        unsubscribe();
      };
    }
  }, [isInView, end, duration, count, decimals]);

  return (
    <span ref={ref} data-testid={`count-up-${end}`}>
      {display}{suffix}
    </span>
  );
}

// Import transfer prescription images
import transferHelpImage from "@assets/generated_images/pharmacist_helping_patient_transfer_prescriptions.png";
import transferPhoneImage from "@assets/generated_images/pharmacist_transferring_prescriptions_by_phone.png";
import transferFamilyImage from "@assets/generated_images/family_receiving_transferred_prescriptions.png";
import pharmacistHelpingImageWebp from "@assets/generated_images/pharmacist_helping_diverse_customers.webp";
import blisterPackImgWebp from "@assets/generated_images/blister_pack_organizer.webp";
import pharmacistHelpingPatientImageWebp from "@assets/generated_images/pharmacist_helping_patient.webp";
import transferHelpImageWebp from "@assets/generated_images/pharmacist_helping_patient_transfer_prescriptions.webp";
import transferPhoneImageWebp from "@assets/generated_images/pharmacist_transferring_prescriptions_by_phone.webp";
import transferFamilyImageWebp from "@assets/generated_images/family_receiving_transferred_prescriptions.webp";

function ScrollRevealText({ text, className = "", as: Tag = "h2" }: { text: string; className?: string; as?: "h2" | "h3" | "p" | "span" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const isTouchDevice = useIsTouchDevice();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.9", "start 0.3"],
  });

  const words = text.split(" ");

  if (shouldReduceMotion || isTouchDevice) {
    return (
      <div ref={containerRef}>
        <Tag className={className}>{text}</Tag>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <Tag className={className}>
        {words.map((word, i) => {
          const start = i / words.length;
          const end = (i + 1) / words.length;
          return (
            <ScrollRevealWord key={i} word={word} progress={scrollYProgress} range={[start, end]} />
          );
        })}
      </Tag>
    </div>
  );
}

function ScrollRevealWord({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  const y = useTransform(progress, range, [4, 0]);
  return (
    <motion.span
      style={{ opacity, y }}
      className="inline-block mr-[0.3em] will-change-transform"
    >
      {word}
    </motion.span>
  );
}

const journeySteps = [
  {
    icon: RefreshCw,
    title: "Transfer",
    headline: "We Handle Everything",
    description: "Give us your pharmacy's name. We'll call them, transfer your prescriptions, and have everything ready, usually the same day.",
    color: "text-primary",
    bgColor: "bg-primary/15",
    borderColor: "border-primary/30",
  },
  {
    icon: Pill,
    title: "Fill",
    headline: "Verified by Licensed Pharmacists",
    description: "Every prescription is checked by a licensed pharmacist. We also confirm your insurance in real time, with no surprises at the counter.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    borderColor: "border-emerald-500/30",
  },
  {
    icon: Truck,
    title: "Deliver",
    headline: "To Your Door, Free",
    description: "Same-day delivery across all five NYC boroughs. Live GPS tracking through the ConcordiaCare app so you know exactly when we'll arrive.",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
    borderColor: "border-cyan-500/30",
  },
  {
    icon: Heart,
    title: "Care",
    headline: "A Pharmacy That Knows You",
    description: "Your dedicated team remembers your name, your medications, and your family. Refill reminders, wellness check-ins, and loyalty rewards, because you deserve more than a transaction.",
    color: "text-rose-400",
    bgColor: "bg-rose-500/15",
    borderColor: "border-rose-500/30",
  },
];

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const check = typeof window !== "undefined" && (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    );
    setIsTouch(!!check);
  }, []);
  return isTouch;
}

function PharmacyJourney() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="py-20 clinical-section-alt" data-testid="pharmacy-journey-section">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <p
            className="text-sm uppercase tracking-widest text-primary mb-3"
            data-testid="text-journey-label"
          >
            Your Pharmacy Journey
          </p>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Sound familiar?{" "}
            <span className="text-primary">Here&apos;s what happens</span>{" "}
            when you switch.
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 max-w-6xl mx-auto">
          {journeySteps.map((step, i) => {
            const imageOnTop = i % 2 === 1;

            const visualZone = (
              <div
                className={`flex-[3] relative flex flex-col items-center justify-center gap-4 py-8 ${
                  imageOnTop ? "rounded-t-xl" : "rounded-b-xl"
                }`}
              >
                <div className={`absolute inset-0 ${step.bgColor} opacity-80 ${imageOnTop ? "rounded-t-xl" : "rounded-b-xl"}`} />
                <div
                  className="absolute inset-0"
                  style={{
                    background: imageOnTop
                      ? "linear-gradient(to bottom, transparent 60%, rgba(15,23,42,0.6) 100%)"
                      : "linear-gradient(to top, transparent 60%, rgba(15,23,42,0.6) 100%)",
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div
                    className={`h-20 w-20 md:h-24 md:w-24 rounded-2xl ${step.bgColor} border ${step.borderColor} flex items-center justify-center`}
                    style={{ boxShadow: "0 12px 28px rgba(0,0,0,0.28)" }}
                  >
                    <step.icon className={`h-10 w-10 md:h-12 md:w-12 ${step.color}`} />
                  </div>
                  <span
                    className={`text-xs font-bold uppercase tracking-widest ${step.color}`}
                    data-testid={`text-journey-step-${i}`}
                  >
                    {step.title}
                  </span>
                </div>
              </div>
            );

            const textZone = (
              <div className="flex-[2] p-5 md:p-6 flex flex-col justify-center">
                <span className={`text-[10px] uppercase tracking-widest ${step.color} mb-1.5 opacity-50`}>
                  Step {i + 1}
                </span>
                <h3 className="text-sm md:text-base font-bold text-white mb-2 leading-snug">
                  {step.headline}
                </h3>
                <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            );

            const cardInner = (
              <div className="surface-lift flex flex-col overflow-hidden bg-slate-900/70 h-full min-h-[420px] md:min-h-[500px]">
                {imageOnTop ? (
                  <>
                    {visualZone}
                    {textZone}
                  </>
                ) : (
                  <>
                    {textZone}
                    {visualZone}
                  </>
                )}
              </div>
            );

            if (shouldReduceMotion) {
              return <div key={i} className="h-full">{cardInner}</div>;
            }

            return (
              <motion.div
                key={i}
                className="h-full"
                initial={{ opacity: 0, y: 48 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{
                  delay: i * 0.12,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {cardInner}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScrollSection({ children, className = "", id, style: extraStyle }: { children: React.ReactNode; className?: string; id?: string; style?: React.CSSProperties }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <section id={id} className={`relative ${className}`} style={extraStyle}>
        {children}
      </section>
    );
  }

  return (
    <motion.section
      id={id}
      className={`relative ${className}`}
      style={extraStyle}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
    >
      {children}
    </motion.section>
  );
}



const smsMessages = [
  { from: "patient", text: "Hey, I need my medications" },
  { from: "pharmacy", text: "Hello! Good morning. Absolutely. Delivery or pickup?" },
  { from: "patient", text: "Pickup please" },
  { from: "pharmacy", text: "Done! Ready in 15 min. See you soon." },
  { from: "patient", text: "thank you you guys are the best!" },
  { from: "pharmacy", text: "You're welcome." },
];

function MockupPhone({ shouldReduceMotion, messages = smsMessages }: { shouldReduceMotion: boolean; messages?: { from: string; text: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.4 });
  const [playKey, setPlayKey] = useState(0);

  const handleHover = () => { setPlayKey((k) => k + 1); };

  const show = shouldReduceMotion || isInView;
  const hiddenVariant = { opacity: 0, y: 12 };
  const visibleVariant = (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const, delay: shouldReduceMotion ? 0 : delay },
  });

  return (
    <div
      ref={ref}
      className="relative flex justify-center cursor-pointer"
      onMouseEnter={handleHover}
      data-testid="mockup-phone-hover"
    >
      <div className="relative w-64" data-testid="mockup-phone">
        <div className="rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden shadow-2xl shadow-primary/10 aspect-[9/19.5] flex flex-col">
          <motion.div
            key={`header-${playKey}`}
            initial={shouldReduceMotion ? false : hiddenVariant}
            animate={show ? visibleVariant(0) : hiddenVariant}
            className="bg-gradient-to-r from-primary/30 to-emerald-500/20 px-4 pt-6 pb-3 border-b border-slate-700/50"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <img src={concordiaCIcon} alt="Concordia" className="h-6 w-6 object-contain" loading="lazy" decoding="async" width="24" height="24" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-tight">Concordia Pharmacy</p>
                <p className="text-[10px] text-emerald-400">● Online</p>
              </div>
            </div>
          </motion.div>
          <div className="p-3 space-y-2 flex-1 flex flex-col">
            {messages.map((msg, i) => (
              <motion.div
                key={`msg-${playKey}-${i}`}
                initial={shouldReduceMotion ? false : hiddenVariant}
                animate={show ? visibleVariant(0.3 + i * 0.55) : hiddenVariant}
                className={`flex ${msg.from === "patient" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 text-xs leading-relaxed ${
                    msg.from === "patient"
                      ? "bg-primary text-white rounded-2xl rounded-br-md"
                      : "bg-slate-700/80 text-slate-200 rounded-2xl rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeliveryFlowScreen({ step, shouldReduceMotion }: { step: number; shouldReduceMotion: boolean }) {
  return (
    <AnimatePresence mode="wait">
      {step === 0 && (
        <motion.div
          key="step-meds"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="p-4 flex-1 flex flex-col"
        >
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">Your Cart</p>
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/20 rounded-lg p-3">
              <Pill className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white font-medium">Lisinopril 10mg</p>
                <p className="text-[10px] text-slate-300">30-day supply</p>
              </div>
              <CheckCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/20 rounded-lg p-3">
              <Pill className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white font-medium">Metformin 500mg</p>
                <p className="text-[10px] text-slate-300">90-day supply</p>
              </div>
              <CheckCircle className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="bg-primary rounded-lg py-3 text-center mt-4">
            <p className="text-sm font-semibold text-white">Add Groceries</p>
          </div>
        </motion.div>
      )}

      {step === 1 && (
        <motion.div
          key="step-groceries"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="p-4 flex-1 flex flex-col"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Your Cart</p>
            <span className="text-[10px] text-primary">4 items</span>
          </div>
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/20 rounded-lg p-3">
              <Pill className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-xs text-white flex-1">2 Medications</p>
              <CheckCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <Apple className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white font-medium">Fresh Produce</p>
                <p className="text-[10px] text-slate-300">Bananas, spinach</p>
              </div>
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <ShoppingBag className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white font-medium">Vitamin D3</p>
                <p className="text-[10px] text-slate-300">Daily supplement</p>
              </div>
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="bg-emerald-600 rounded-lg py-3 text-center mt-4">
            <p className="text-sm font-semibold text-white">Checkout</p>
          </div>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div
          key="step-packed"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.35 }}
          className="p-4 flex-1 flex flex-col items-center justify-center"
        >
          <motion.div
            initial={shouldReduceMotion ? false : { scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.15 }}
          >
            <div className="h-20 w-20 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
              <PackageCheck className="h-10 w-10 text-amber-400" />
            </div>
          </motion.div>
          <p className="text-base font-semibold text-white mb-1">Order Packed</p>
          <p className="text-[11px] text-slate-400 text-center mb-4">All items verified & sealed</p>
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2 text-[11px]">
              <Pill className="h-3.5 w-3.5 text-primary" />
              <span className="text-slate-300">2 medications</span>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-300">2 grocery items</span>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
            </div>
          </div>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div
          key="step-deliver"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="p-4 flex-1 flex flex-col"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">En Route</p>
            <span className="text-[11px] text-cyan-400">12 min</span>
          </div>
          <div className="surface-lift relative bg-slate-800/60 p-4 mb-4 flex-1">
            <div className="grid grid-cols-6 grid-rows-6 gap-px opacity-20 h-full">
              {[...Array(36)].map((_, i) => (
                <div key={i} className="border border-slate-600/30 rounded-sm" />
              ))}
            </div>
            <div className="absolute inset-4 flex items-center">
              <motion.div
                className="flex items-center"
                initial={shouldReduceMotion ? false : { x: 0 }}
                animate={{ x: [0, 140, 140] }}
                transition={{ duration: 2.5, ease: "easeInOut", times: [0, 0.7, 1] }}
              >
                <div className="h-8 w-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-cyan-400" />
                </div>
              </motion.div>
            </div>
            <div className="absolute right-5 top-1/2 -translate-y-1/2">
              <div className="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <Home className="h-3.5 w-3.5 text-emerald-400" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                initial={{ width: "10%" }}
                animate={{ width: "85%" }}
                transition={{ duration: 2, ease: "easeOut", delay: 0.3 }}
              />
            </div>
            <Navigation className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">898 East Tremont Ave, Bronx</p>
        </motion.div>
      )}

      {step === 4 && (
        <motion.div
          key="step-sign"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="p-4 flex-1 flex flex-col items-center justify-center"
        >
          <div className="h-16 w-16 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mb-4">
            <PenLine className="h-8 w-8 text-violet-400" />
          </div>
          <p className="text-base font-semibold text-white mb-1">Sign to Confirm</p>
          <p className="text-[11px] text-slate-400 text-center mb-5">Your delivery has arrived</p>
          <div className="surface-lift w-full bg-slate-800/60 border-dashed border-slate-600/50 h-20 flex items-center justify-center mb-4 relative overflow-hidden">
            <motion.svg
              viewBox="0 0 120 30"
              className="w-28 h-10"
            >
              <motion.path
                d="M10 20 Q20 5 35 18 Q50 30 60 12 Q70 0 80 15 Q90 28 110 8"
                fill="none"
                stroke="rgba(167,139,250,0.7)"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
              />
            </motion.svg>
          </div>
          <motion.div
            className="bg-violet-600 rounded-lg py-3 px-8 text-center w-full"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3, duration: 0.3 }}
          >
            <p className="text-sm font-semibold text-white">Confirm Receipt</p>
          </motion.div>
        </motion.div>
      )}

      {step >= 5 && (
        <motion.div
          key="step-done"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.4 }}
          className="p-4 flex-1 flex flex-col items-center justify-center"
        >
          <motion.div
            initial={shouldReduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.15 }}
          >
            <div className="h-24 w-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mb-5">
              <CircleCheckBig className="h-12 w-12 text-emerald-400" />
            </div>
          </motion.div>
          <motion.p
            className="text-xl font-bold text-emerald-300 mb-2"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            All Done!
          </motion.p>
          <motion.p
            className="text-[11px] text-slate-400 text-center mb-3"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Thanks for choosing Concordia
          </motion.p>
          <motion.div
            className="flex items-center gap-3 text-[10px] text-slate-300"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
          >
            <span className="flex items-center gap-1"><Pill className="h-3 w-3" /> 2 meds</span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> 2 items</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const STEP_DURATIONS = [2000, 2000, 1800, 3000, 2200, 3000];

function DeliveryFlowMockup({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [playKey, setPlayKey] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSequence = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentStep(0);
    let step = 0;
    const advance = () => {
      step++;
      if (step < STEP_DURATIONS.length) {
        setCurrentStep(step);
        timerRef.current = setTimeout(advance, STEP_DURATIONS[step]);
      }
    };
    timerRef.current = setTimeout(advance, STEP_DURATIONS[0]);
  }, []);

  useEffect(() => {
    if (isInView && currentStep === -1) {
      startSequence();
    }
  }, [isInView, currentStep, startSequence]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleHover = () => {
    setPlayKey((k) => k + 1);
    startSequence();
  };

  const show = shouldReduceMotion || isInView;

  return (
    <div
      ref={ref}
      className="flex justify-center cursor-pointer"
      onMouseEnter={handleHover}
      data-testid="delivery-flow-hover"
    >
      <div className="relative w-64">
        <div className="rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden shadow-2xl shadow-primary/10 aspect-[9/19.5] flex flex-col">
          <motion.div
            key={`df-header-${playKey}`}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0, transition: { duration: 0.35, delay: 0 } } : { opacity: 0, y: 10 }}
            className="bg-gradient-to-r from-primary/30 to-primary/20 px-4 pt-6 pb-3 border-b border-slate-700/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <img src={concordiaCIcon} alt="ConcordiaCare" className="h-6 w-6 object-contain" loading="lazy" decoding="async" width="24" height="24" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white leading-tight">ConcordiaCare</p>
                  <p className="text-[10px] text-primary/70">Your Order</p>
                </div>
              </div>
              <div className="flex gap-1">
                {STEP_DURATIONS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 w-3 rounded-full transition-colors duration-300 ${
                      i <= currentStep ? "bg-primary" : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          <div className="flex-1 flex flex-col">
            {currentStep >= 0 && (
              <DeliveryFlowScreen step={currentStep} shouldReduceMotion={shouldReduceMotion} />
            )}
            {currentStep === -1 && (
              <div className="p-4 flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ShoppingCart className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-[11px] text-slate-300">Hover to start</p>
                </div>
              </div>
            )}
          </div>

          <motion.div
            key={`df-footer-${playKey}`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={show ? { opacity: 1, transition: { delay: 0.2, duration: 0.3 } } : { opacity: 0 }}
            className="px-4 pb-5 flex justify-around border-t border-slate-700/40 pt-3 mt-auto"
          >
            <div className="text-center">
              <ShoppingCart className="h-4 w-4 text-primary mx-auto" />
              <p className="text-[9px] text-slate-300 mt-1">Order</p>
            </div>
            <div className="text-center">
              <Truck className="h-4 w-4 text-slate-300 mx-auto" />
              <p className="text-[9px] text-slate-300 mt-1">Track</p>
            </div>
            <div className="text-center">
              <MessageCircle className="h-4 w-4 text-slate-300 mx-auto" />
              <p className="text-[9px] text-slate-300 mt-1">Chat</p>
            </div>
            <div className="text-center">
              <User className="h-4 w-4 text-slate-300 mx-auto" />
              <p className="text-[9px] text-slate-300 mt-1">Profile</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const shouldReduceMotion = useReducedMotion();
  const { isSignedIn } = useAuth();


  // Handle redirect after login
  useEffect(() => {
    const redirectPath = sessionStorage.getItem("redirectAfterLogin");
    if (redirectPath) {
      setLocation(redirectPath);
    }
  }, [setLocation]);


  // Blister pack enrollment state
  const [blisterDialogOpen, setBlisterDialogOpen] = useState(false);
  const [currentBlisterImage, setCurrentBlisterImage] = useState(0);
  const blisterImages = [blisterPersonImg, blisterPackImg, blisterPersonImg];
  const [blisterForm, setBlisterForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    insuranceNumber: "",
    previousPharmacyName: "",
    previousPharmacyPhone: "",
    isNewPatient: false,
  });

  // Transfer image carousel
  const [currentTransferImage, setCurrentTransferImage] = useState(0);
  const transferImages = [transferHelpImage, transferPhoneImage, transferFamilyImage];
  const transferImagesWebp = [transferHelpImageWebp, transferPhoneImageWebp, transferFamilyImageWebp];

  // Auto-rotate transfer images
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTransferImage((prev) => (prev + 1) % transferImages.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [transferImages.length]);


  // Blister pack enrollment mutation
  const blisterEnrollMutation = useMutation({
    mutationFn: async (data: typeof blisterForm) => {
      const response = await apiRequest("POST", "/api/blister-pack-enrollment", data);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Enrollment Submitted",
        description: `Your enrollment request has been received! Reference: ${data.referenceNumber || "BL" + Date.now()}. We'll contact you within 24 hours.`,
      });
      setBlisterDialogOpen(false);
      setBlisterForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        insuranceNumber: "",
        previousPharmacyName: "",
        previousPharmacyPhone: "",
        isNewPatient: false,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "Failed to submit enrollment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Insurance Help dialog
  const [insuranceHelpOpen, setInsuranceHelpOpen] = useState(false);
  const [insuranceHelpSuccess, setInsuranceHelpSuccess] = useState(false);
  const [insuranceHelpForm, setInsuranceHelpForm] = useState({ name: "", email: "", phone: "", message: "" });
  const insuranceHelpMutation = useMutation({
    mutationFn: async (data: typeof insuranceHelpForm) => {
      const response = await apiRequest("POST", "/api/insurance-help", data);
      return await response.json();
    },
    onSuccess: () => {
      setInsuranceHelpSuccess(true);
      setInsuranceHelpForm({ name: "", email: "", phone: "", message: "" });
    },
    onError: () => {
      toast({ title: "Submission Failed", description: "Please try again or call us at (718) 328-2833.", variant: "destructive" });
    },
  });

  // Prescription Transfer state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"form_submission" | "click_to_call" | null>(null);
  const [transferForm, setTransferForm] = useState({
    contactName: "",
    phoneNumber: "",
    email: "",
    previousPharmacyName: "",
    previousPharmacyPhone: "",
    previousPharmacyAddress: "",
  });

  useEffect(() => {
    const openTransferForm = () => {
      setTransferMode("form_submission");
      setTransferDialogOpen(true);
      window.history.replaceState({}, "", `${window.location.pathname}#transfer-section`);
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get("transfer") === "form") openTransferForm();
    window.addEventListener("concordia:open-transfer", openTransferForm);
    return () => window.removeEventListener("concordia:open-transfer", openTransferForm);
  }, []);
  
  // Prescription transfer mutation
  const transferMutation = useMutation({
    mutationFn: async (data: typeof transferForm & { mode: "form_submission" | "click_to_call" }) => {
      const response = await apiRequest("POST", "/api/transfer-request", {
        contactName: data.contactName,
        phoneNumber: data.phoneNumber,
        email: data.email || null,
        mode: data.mode,
        previousPharmacyName: data.previousPharmacyName || null,
        previousPharmacyPhone: data.previousPharmacyPhone || null,
        previousPharmacyAddress: data.previousPharmacyAddress || null,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Transfer Request Submitted",
        description: `Your prescription transfer request has been received! Earn 500 Wellness Points when your transfer completes. They unlock after your first fill.`,
      });
      setTransferDialogOpen(false);
      setTransferMode(null);
      setTransferForm({
        contactName: "",
        phoneNumber: "",
        email: "",
        previousPharmacyName: "",
        previousPharmacyPhone: "",
        previousPharmacyAddress: "",
      });
      // Invalidate admin transfer requests list
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transfer-requests"] });
    },
    onError: (error: any) => {
      toast({
        title: "Transfer Request Failed",
        description: error.message || "Failed to submit transfer request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const allReviews = [
    {
      name: "Kalel Aguirre",
      rating: 5,
      text: "Best pharmacy in NYC, hands down. The staff is friendly and reliable.",
      date: "3 days ago"
    },
    {
      name: "Jazmine Lu",
      rating: 5,
      text: "One of the best pharmacies in the area. I send my clients there to get their medication and they love it. Plus they deliver. Staff are friendly and provide great customer service.",
      date: "1 week ago"
    },
    {
      name: "Gerardo Aguilera",
      rating: 5,
      text: "Best pharmacy in town. Great people. You are not their customers. You are their family.",
      date: "5 days ago"
    },
    {
      name: "Carmen Rivera",
      rating: 5,
      text: "I have been going there since they first opened up. Love it. Great service, awesome experience, everyone is wonderful.",
      date: "2 days ago"
    },
    {
      name: "Elliot Babilonia",
      rating: 5,
      text: "Me and my family have been going to this pharmacy for many years. I've been picking up my medication from Concordia for around 2½ years now and the service has always been outstanding.",
      date: "4 days ago"
    },
    {
      name: "Linda Thompson",
      rating: 5,
      text: "The staff took the time to explain all my medications and potential interactions. This level of care is rare!",
      date: "1 week ago"
    },
    {
      name: "Michael Pustilnik",
      rating: 5,
      text: "This is a small but efficient pharmacy. They get the job done. I have visited them at least a dozen times and they have made no mistakes so far.",
      date: "6 days ago"
    },
    {
      name: "Robert Kim",
      rating: 5,
      text: "Free delivery saved me during my recovery. The staff even called to check on me. Truly exceptional service!",
      date: "3 days ago"
    },
    {
      name: "Tushar Dholariya",
      rating: 5,
      text: "Best pharmacy I have ever visited. Very friendly staff. Anyone can walk in to get a consultation from the pharmacist. I will go to this pharmacy for my whole life.",
      date: "2 weeks ago"
    },
    {
      name: "David Escobar",
      rating: 5,
      text: "I was Concordia's first customer years ago. They have prospered and I'm so happy for them. Thank you for the service you provide.",
      date: "1 week ago"
    },
    {
      name: "Angela Williams",
      rating: 5,
      text: "Been coming here for years. They know me by name and always go above and beyond for my family.",
      date: "5 days ago"
    },
    {
      name: "Minister Michael",
      rating: 5,
      text: "Concordia Pharmacy is one of the friendliest places to do business with. Truly a community pharmacy.",
      date: "2 weeks ago"
    },
  ];

  const totalReviewPages = Math.ceil(allReviews.length / 3);
  const [reviewPage, setReviewPage] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setReviewPage((p) => (p + 1) % totalReviewPages);
    }, 3000);
    return () => clearInterval(timer);
  }, [totalReviewPages]);
  const visibleReviews = allReviews.slice(reviewPage * 3, reviewPage * 3 + 3);

  return (
    <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO
        title="Home"
        description="Concordia Pharmacy is your trusted Bronx pharmacy. Free same-day delivery, prescription transfers, blister packs, flu shots, and specialty medications. 898 East Tremont Ave."
        path="/"
      />
      <Header landingCtas />

      {/* Hero */}
      <ScrollVideoHero />


      {/* Why Us Strip */}
      <ScrollSection className="py-16">
        <div className="concordia-container">
          <div className="concordia-section-heading mb-10">
            <ScrollRevealText text="Why Concordia?" className="text-3xl font-bold text-white mb-3" as="h2" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="text-slate-400 max-w-xl mx-auto"
            >
              We know switching pharmacies feels like a hassle. Here&apos;s why thousands of NYC families made the move and never looked back.
            </motion.p>
          </div>
          <div className="concordia-split max-w-5xl mx-auto items-stretch">
            {/* Photo column */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative rounded-xl overflow-hidden h-80 md:h-full min-h-[320px]"
            >
              <picture>
                <img
                  src="/images/pharmacy-grandma-consult.png"
                  alt="Pharmacist helping grandmother and grandchild at Concordia Pharmacy"
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                  decoding="async"
                  width="488"
                  height="352"
                />
              </picture>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-sm">"Best pharmacy in NYC"</p>
                <p className="text-slate-300 text-xs mt-0.5">Thousands of NYC families</p>
              </div>
            </motion.div>
            {/* Cards column */}
            <div className="flex flex-col gap-5">
              {[
                {
                  icon: Heart,
                  q: "Is it really free?",
                  a: "Yes, completely free. No enrollment fees, no monthly charges, and no subscription. Membership is yours the moment you fill your first prescription with us.",
                },
                {
                  icon: Truck,
                  q: "Do you deliver to me?",
                  a: "Free same-day delivery across all five NYC boroughs. 92% of orders are out the door within 2 hours. Live GPS tracking through the ConcordiaCare app.",
                },
                {
                  icon: Shield,
                  q: "What about my insurance?",
                  a: "We work with virtually every major plan, including Medicaid, Medicare, and most commercial insurance. We verify your coverage before you come in, so there are no surprises at the counter.",
                  cta: { label: "Get Insurance Help", action: () => { setInsuranceHelpOpen(true); setInsuranceHelpSuccess(false); } },
                },
                {
                  icon: Users,
                  q: "Can I manage my whole family?",
                  a: "Yes, one account covers everyone. Add your kids, partner, or parents in minutes. All prescriptions are tracked, refilled, and delivered together. One less thing to juggle.",
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 300, damping: 26, delay: i * 0.08 }}
                >
                  <Card className="clinical-glass">
                    <CardContent className="pt-5 pb-5 flex gap-4">
                      <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary mb-1 italic">&ldquo;{item.q}&rdquo;</p>
                        <p className="text-sm text-slate-300 leading-relaxed">{item.a}</p>
                        {"cta" in item && item.cta && (
                          <button
                            onClick={item.cta.action}
                            className="mt-2 text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                            data-testid="button-insurance-help-open"
                          >
                            {item.cta.label}
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* Insurance Help Dialog */}
      <Dialog open={insuranceHelpOpen} onOpenChange={(o) => { setInsuranceHelpOpen(o); if (!o) setInsuranceHelpSuccess(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insurance Help Request</DialogTitle>
            <DialogDescription>
              Our team will review your coverage and follow up within one business day.
            </DialogDescription>
          </DialogHeader>
          {insuranceHelpSuccess ? (
            <PostSubmissionCTA confirmationMessage="We received your request and will be in touch within one business day.">
              <div className="text-sm space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Your Request</p>
                <p className="font-medium">{insuranceHelpForm.name || "Submitted"}</p>
              </div>
            </PostSubmissionCTA>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); insuranceHelpMutation.mutate(insuranceHelpForm); }}
              data-testid="form-insurance-help"
            >
              <div className="space-y-2">
                <Label htmlFor="ins-name">Full Name *</Label>
                <Input id="ins-name" required value={insuranceHelpForm.name} onChange={(e) => setInsuranceHelpForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" data-testid="input-insurance-help-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ins-phone">Phone</Label>
                  <Input id="ins-phone" type="tel" value={insuranceHelpForm.phone} onChange={(e) => setInsuranceHelpForm(f => ({ ...f, phone: e.target.value }))} placeholder="(718) 000-0000" data-testid="input-insurance-help-phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ins-email">Email</Label>
                  <Input id="ins-email" type="email" value={insuranceHelpForm.email} onChange={(e) => setInsuranceHelpForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" data-testid="input-insurance-help-email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ins-msg">What do you need help with? *</Label>
                <Textarea id="ins-msg" required value={insuranceHelpForm.message} onChange={(e) => setInsuranceHelpForm(f => ({ ...f, message: e.target.value }))} placeholder="Describe your insurance question or concern..." rows={3} data-testid="input-insurance-help-message" />
              </div>
              <button
                type="submit"
                disabled={insuranceHelpMutation.isPending}
                className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                data-testid="button-insurance-help-submit"
              >
                {insuranceHelpMutation.isPending ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Free Membership Section */}
      <ScrollSection className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-950/20 pointer-events-none" />
        <div className="relative concordia-container">
          <div className="max-w-5xl mx-auto">
            <div className="concordia-split">
              <div>
                <Badge variant="secondary" className="w-fit mb-6 bg-emerald-500/15 text-emerald-300 border-0">
                  <Smartphone className="h-3 w-3 mr-1" />
                  Free Membership
                </Badge>
                <ScrollRevealText
                  text="One Tap. Meds Ready. Pick Up on Your Way Home."
                  className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight"
                />
                <p className="text-lg text-slate-200 mb-8">
                  As a Concordia member, refilling is as easy as opening the ConcordiaCare app and tapping &ldquo;Refill.&rdquo;
              We&apos;ll have everything ready when you swing by. Membership is completely free. Just fill your prescriptions with us.
                </p>
                <div className="space-y-4 mb-8">
                  {[
                    { step: "1", text: "Become a Concordia member. It's free." },
                    { step: "2", text: "Request refills through the ConcordiaCare app" },
                    { step: "3", text: "Pick up on your way home, or we deliver" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <span className="text-sm font-bold text-emerald-400">{item.step}</span>
                      </div>
                      <p className="text-slate-300 pt-1">{item.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {isSignedIn ? (
                    <Link href="/profile">
                      <MotionButton size="lg" className="gap-2" data-testid="button-become-member">
                        <User className="h-5 w-5" />
                        View My Profile
                      </MotionButton>
                    </Link>
                  ) : (
                    <Link href="/signup">
                      <MotionButton size="lg" className="gap-2" data-testid="button-become-member">
                        <Heart className="h-5 w-5" />
                        Become a Member. It&apos;s Free
                      </MotionButton>
                    </Link>
                  )}
                  <a href="tel:+17183282833">
                    <MotionButton size="lg" variant="outline" className="gap-2 backdrop-blur-sm border-white/40 text-white" data-testid="button-call-help">
                      <Phone className="h-5 w-5" />
                      Call Us. We&apos;ll Help You
                    </MotionButton>
                  </a>
                </div>
              </div>
              <MockupPhone shouldReduceMotion={!!shouldReduceMotion} />
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* Pharmacy Journey */}
      <PharmacyJourney />

      {/* Inline CTA 1 */}
      <ScrollSection className="py-12 clinical-section-alt">
        <div className="concordia-container text-center">
          <p className="text-lg text-slate-300 mb-6">
            {isSignedIn
              ? "Browse our full selection of over-the-counter products. Delivered free."
              : "Ready to make the switch? It takes 2 minutes and we handle everything."}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {isSignedIn ? (
              <Link href="/shop">
                <MotionButton size="lg" className="gap-2" data-testid="button-become-member">
                  <ShoppingBag className="h-5 w-5" />
                  Shop OTC Products
                </MotionButton>
              </Link>
            ) : (
                    <Link href="/signup">
                <MotionButton size="lg" className="gap-2" data-testid="button-become-member">
                  <Heart className="h-5 w-5" />
                  Join Concordia. It&apos;s Free
                </MotionButton>
              </Link>
            )}
            <a href="tel:+17183282833">
              <MotionButton size="lg" variant="outline" className="gap-2 backdrop-blur-sm border-white/40 text-white" data-testid="button-inline-cta1-call">
                <Phone className="h-5 w-5" />
                Call (718) 328-2833
              </MotionButton>
            </a>
          </div>
        </div>
      </ScrollSection>

      {/* Prescription Transfer Section */}
      <ScrollSection id="transfer-section" className="py-16">
        <div className="container mx-auto px-4">
            <div className="rounded-2xl">
            <Card className="overflow-hidden clinical-card-dark border-0">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative bg-gradient-to-br from-primary/5 to-primary/10 hidden md:block min-h-[420px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentTransferImage}
                      style={{ opacity: 0 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeInOut" }}
                      className="absolute inset-0"
                    >
                      <picture>
                        <source srcSet={transferImagesWebp[currentTransferImage]} type="image/webp" />
                        <img
                          src={transferImages[currentTransferImage]}
                          alt="Prescription transfer service"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          width="1024"
                          height="1024"
                          data-testid={`landing-img-transfer-${currentTransferImage}`}
                        />
                      </picture>
                    </motion.div>
                  </AnimatePresence>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2" role="tablist" aria-label="Transfer service images">
                    {transferImages.map((_, index) => (
                      <MotionButton
                        key={index}
                        variant="ghost"
                        onClick={() => setCurrentTransferImage(index)}
                        aria-label={`Show image ${index + 1} of ${transferImages.length}`}
                        aria-selected={index === currentTransferImage}
                        role="tab"
                        className={`h-2 w-2 min-h-0 p-0 rounded-full no-default-hover-elevate ${
                          index === currentTransferImage
                            ? "bg-primary w-4"
                            : "bg-primary/30 hover:bg-primary/50"
                        }`}
                        data-testid={`landing-transfer-dot-${index}`}
                      />
                    ))}
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, type: "spring" }}
                    className="absolute top-4 right-4"
                  >
                    <Badge className="bg-primary text-white px-3 py-1 text-sm flex items-center gap-2 shadow-lg border-0">
                      <Gift className="h-4 w-4" />
                      +1000 Points
                    </Badge>
                  </motion.div>
                </div>

                <div className="p-8 flex flex-col justify-center text-center md:text-left">
                  <div className="flex flex-col items-center gap-3 mb-4 md:flex-row md:items-center">
                    <div className="p-3 bg-primary/15 rounded-full">
                      <RefreshCw className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold text-white">Transfer Your Prescriptions</h3>
                      <p className="text-slate-400">Switch to Concordia in minutes</p>
                    </div>
                  </div>
                  <p className="text-slate-400 mb-6">
                    Easily transfer your prescriptions from any pharmacy. We&apos;ll handle all the paperwork
                    and get your medications ready for pickup or delivery.
                  </p>
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6 flex items-center gap-3">
                    <Sparkles className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-white">Earn 1000 Loyalty Points</p>
                      <p className="text-sm text-slate-400">When your prescription transfer is complete</p>
                    </div>
                  </div>
                  <motion.div
                    className="grid gap-3 mb-6"
                    initial={shouldReduceMotion ? "visible" : "hidden"}
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.1 }}
                    variants={shouldReduceMotion ? undefined : bubbleStagger}
                  >
                    <motion.div variants={bubbleEntrance}>
                      <MotionButton
                        variant="outline"
                        className="justify-start h-auto py-3 px-4 w-full no-default-hover-elevate border-white/30 text-white"
                        onClick={() => {
                          setTransferMode("form_submission");
                          setTransferDialogOpen(true);
                        }}
                        data-testid="landing-button-transfer-text"
                      >
                        <AnimatedPen className="h-5 w-5 mr-3 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-white">Enter Prescription Details</p>
                          <p className="text-xs text-slate-400">Type in your pharmacy info</p>
                        </div>
                      </MotionButton>
                    </motion.div>
                    <motion.div variants={bubbleEntrance}>
                      <a
                        href="tel:+17185857600"
                        className="flex items-center justify-start h-auto py-3 px-4 border border-white/30 rounded-md hover-elevate text-white"
                        onClick={() => setTransferMode("click_to_call")}
                        data-testid="landing-button-transfer-call"
                      >
                        <Phone className="h-5 w-5 mr-3 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-white">Call to Transfer</p>
                          <p className="text-xs text-slate-400">Speak with our team directly</p>
                        </div>
                      </a>
                    </motion.div>
                  </motion.div>
                  <p className="text-xs text-slate-300 text-center">
                    Transfers can be completed in as little as 5 minutes. We&apos;ll notify you when your medications are ready.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </ScrollSection>

      {/* Prescription Savings Teaser */}
      <ScrollSection className="py-20 clinical-section-alt overflow-hidden">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left — photo card */}
            <motion.div
              className="relative"
              initial={shouldReduceMotion ? false : { opacity: 0, x: -32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Ambient glow */}
              <div
                className="absolute pointer-events-none rounded-full"
                style={{ width: 380, height: 380, left: "10%", top: "10%", background: "hsl(215 55% 55% / 0.04)", zIndex: 0 }}
                aria-hidden="true"
              />
              <div className="flex items-center justify-center relative">
                <picture>
                  <source srcSet="/images/rx-savings-landing-consult.webp" type="image/webp" />
                  <img
                    src="/images/rx-savings-landing-consult.png"
                    alt="Pharmacist with a happy patient"
                    className="w-full h-auto object-contain"
                    style={{
                      maxHeight: 400,
                      filter: "brightness(1.02) saturate(1.08)",
                    }}
                    loading="lazy"
                    decoding="async"
                    width="1254"
                    height="1254"
                  />
                </picture>
              </div>
              {/* Pull-quote + badge below image */}
              <div className="flex items-start justify-between gap-4 px-1 mt-1">
                <p className="text-sm text-slate-400 leading-relaxed italic">
                  &ldquo;Our pharmacist checks every savings program so you never have to.&rdquo;
                </p>
                <div className="flex-shrink-0 bg-emerald-500/20 border border-emerald-400/30 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-emerald-300">Up to 80% off</span>
                </div>
              </div>
            </motion.div>

            {/* Right — content */}
            <div>
              {/* Badge */}
              <motion.div
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-5"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5 }}
              >
                <BadgeDollarSign className="h-3.5 w-3.5" />
                Prescription Savings Guarantee
              </motion.div>

              {/* Heading — word-by-word scroll scrub like every other section */}
              <ScrollRevealText
                text="The Best Price, Every Time"
                className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight"
                as="h2"
              />

              {/* Body */}
              <motion.p
                className="text-slate-400 text-sm sm:text-base mb-8 leading-relaxed"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: 0.18 }}
              >
                We automatically compare your insurance against all manufacturer coupons and
                discount programs at every fill, so you never overpay. No apps. No effort.
              </motion.p>

              {/* Vertical step list */}
              <div className="space-y-4 mb-8">
                {([
                  { num: "01", icon: ClipboardList, label: "Bring Us Your Rx",    desc: "Drop off, e-script, or fax. We accept everything." },
                  { num: "02", icon: ScanLine,      label: "We Scan for Savings", desc: "Instant comparison against 300+ discount programs" },
                  { num: "03", icon: Wallet,        label: "You Pay the Lowest",  desc: "Guaranteed best price, applied automatically" },
                ] as const).map((step, i) => (
                  <motion.div
                    key={step.label}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
                      <step.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.label}</p>
                      <p className="text-xs text-slate-500">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: 0.18 }}
              >
                <Link href="/rx-savings" data-testid="link-rx-savings-learn-more">
                  <MotionButton className="gap-2">
                    See How We Save You Money
                    <ArrowRight className="h-4 w-4" />
                  </MotionButton>
                </Link>
              </motion.div>
            </div>

          </div>
        </div>
      </ScrollSection>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-lenis-prevent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Transfer Your Prescriptions
            </DialogTitle>
            <DialogDescription>
              {transferMode === "form_submission" && "Enter your current pharmacy details and we'll handle the rest."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!transferForm.contactName.trim()) {
                toast({ title: "Name Required", description: "Please enter your full name.", variant: "destructive" });
                return;
              }
              if (!transferForm.phoneNumber.trim() || transferForm.phoneNumber.replace(/\D/g, '').length < 10) {
                toast({ title: "Valid Phone Required", description: "Please enter a valid phone number with at least 10 digits.", variant: "destructive" });
                return;
              }
              if (transferMode === "form_submission" && !transferForm.previousPharmacyName.trim()) {
                toast({ title: "Pharmacy Name Required", description: "Please enter your current pharmacy name.", variant: "destructive" });
                return;
              }
              transferMutation.mutate({ ...transferForm, mode: transferMode || "form_submission" });
            }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-4">
              <h4 className="font-medium text-sm border-b pb-2">Your Contact Information</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="transfer-name">Full Name *</Label>
                  <Input
                    id="transfer-name"
                    placeholder="Your full name"
                    value={transferForm.contactName}
                    onChange={(e) => setTransferForm({ ...transferForm, contactName: e.target.value })}
                    data-testid="landing-input-transfer-name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-phone">Phone Number *</Label>
                  <Input
                    id="transfer-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={transferForm.phoneNumber}
                    onChange={(e) => setTransferForm({ ...transferForm, phoneNumber: e.target.value })}
                    data-testid="landing-input-transfer-phone"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-email">Email (optional)</Label>
                <Input
                  id="transfer-email"
                  type="email"
                  placeholder="your@email.com"
                  value={transferForm.email}
                  onChange={(e) => setTransferForm({ ...transferForm, email: e.target.value })}
                  data-testid="landing-input-transfer-email"
                />
              </div>
            </div>

            {transferMode === "form_submission" && (
              <div className="space-y-4">
                <h4 className="font-medium text-sm border-b pb-2">Current Pharmacy Information</h4>
                <div className="space-y-2">
                  <Label htmlFor="transfer-pharmacy-name">Pharmacy Name *</Label>
                  <Input
                    id="transfer-pharmacy-name"
                    placeholder="CVS, Walgreens, etc."
                    value={transferForm.previousPharmacyName}
                    onChange={(e) => setTransferForm({ ...transferForm, previousPharmacyName: e.target.value })}
                    data-testid="landing-input-transfer-pharmacy-name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-pharmacy-phone">Pharmacy Phone</Label>
                  <Input
                    id="transfer-pharmacy-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={transferForm.previousPharmacyPhone}
                    onChange={(e) => setTransferForm({ ...transferForm, previousPharmacyPhone: e.target.value })}
                    data-testid="landing-input-transfer-pharmacy-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-pharmacy-address">Pharmacy Address</Label>
                  <Input
                    id="transfer-pharmacy-address"
                    placeholder="Street address"
                    value={transferForm.previousPharmacyAddress}
                    onChange={(e) => setTransferForm({ ...transferForm, previousPharmacyAddress: e.target.value })}
                    data-testid="landing-input-transfer-pharmacy-address"
                  />
                </div>
              </div>
            )}

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary flex-shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-medium text-primary">500 Wellness Points</span>
                {" "}will unlock after your first fill when your transfer is complete!
              </p>
            </div>

            <MotionButton
              type="submit"
              className="w-full"
              disabled={transferMutation.isPending}
              data-testid="landing-button-submit-transfer"
            >
              {transferMutation.isPending ? (
                <FiberPulse text="Submitting..." className="py-0" />
              ) : (
                "Submit Transfer Request"
              )}
            </MotionButton>
          </form>

          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground mb-2">Prefer to speak with someone?</p>
            <a
              href="tel:+17185857600"
              className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
              data-testid="landing-link-transfer-call"
            >
              <Phone className="h-4 w-4" />
              Call us at (718) 585-7600
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Services Grid */}
      <ScrollSection className="py-16 clinical-section-alt">
        <div className="concordia-container">
          <div className="concordia-section-heading mb-10">
            <ScrollRevealText text="Everything Your Family Needs" className="text-3xl font-bold text-white mb-3" as="h2" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="text-slate-400 max-w-xl mx-auto"
            >One pharmacy. Every service. No runaround.</motion.p>
          </div>
          <div className="concordia-card-grid concordia-card-grid-4">
            {/* Flu Shots */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 280, damping: 26 }} className="glow-card">
              <Link href="/schedule-flu-shot">
                <Card className="clinical-glass overflow-hidden h-full hover-elevate cursor-pointer" data-testid="button-schedule-now">
                  <div className="relative h-40 sm:h-52 overflow-hidden">
                    <picture>
                      <source srcSet="/images/pharmacy-vaccine.webp" type="image/webp" />
                      <img src="/images/pharmacy-vaccine.jpg" alt="Pharmacist administering flu shot" className="w-full h-full object-cover object-top" loading="lazy" decoding="async" width="488" height="352" data-testid="img-flu-shot-family" />
                    </picture>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                    <div className="card-icon-badge absolute bottom-3 left-3 h-8 w-8 rounded-lg bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
                      <Syringe className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <CardContent className="pt-4 pb-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white mb-1">Flu Shots</h3>
                    <p className="text-sm text-slate-400 mb-4 flex-1">Walk-ins welcome. All ages, most insurance accepted.</p>
                    <span className="text-xs text-primary font-semibold flex items-center gap-1" data-testid="button-book-flu-shot">
                      Book Your Flu Shot <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Blister Packs */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.06 }} className="glow-card">
              <button className="w-full text-left h-full" onClick={() => setBlisterDialogOpen(true)} data-testid="landing-button-enroll-blister-pack">
                <Card className="clinical-glass overflow-hidden h-full hover-elevate cursor-pointer">
                  <div className="relative h-40 sm:h-52 overflow-hidden">
                    <picture>
                      <source srcSet={blisterPackImgWebp} type="image/webp" />
                      <img src={blisterPackImg} alt="Blister pack service" className="w-full h-full object-cover" loading="lazy" decoding="async" width="1024" height="1024" />
                    </picture>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                    <div className="card-icon-badge absolute bottom-3 left-3 h-8 w-8 rounded-lg bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
                      <Box className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <CardContent className="pt-4 pb-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white mb-1">Blister Packs</h3>
                    <p className="text-sm text-slate-400 mb-4 flex-1">Meds pre-sorted by day and time. Free delivery.</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-primary font-semibold flex items-center gap-1">
                        Enroll Free <ArrowRight className="h-3 w-3" />
                      </span>
                      <span className="text-slate-600 text-xs">or</span>
                      <a href="tel:+17185857600" className="text-xs text-slate-400 hover:text-primary transition-colors" data-testid="landing-link-call-blister" onClick={(e) => e.stopPropagation()}>Call us</a>
                    </div>
                  </CardContent>
                </Card>
              </button>
            </motion.div>

            {/* Specialty Meds */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.12 }} className="glow-card">
              <Link href="/specialty">
                <Card className="clinical-glass overflow-hidden h-full hover-elevate cursor-pointer" data-testid="card-service-specialty">
                  <div className="relative h-40 sm:h-52 overflow-hidden">
                    <picture>
                      <source srcSet={pharmacistHelpingPatientImageWebp} type="image/webp" />
                      <img src={pharmacistHelpingPatientImage} alt="Specialty medications" className="w-full h-full object-cover" loading="lazy" decoding="async" width="1024" height="1024" />
                    </picture>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                    <div className="card-icon-badge absolute bottom-3 left-3 h-8 w-8 rounded-lg bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
                      <Pill className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <CardContent className="pt-4 pb-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white mb-1">Specialty Meds</h3>
                    <p className="text-sm text-slate-400 mb-4 flex-1">Hard-to-find medications and e-script fulfillment.</p>
                    <span className="text-xs text-primary font-semibold flex items-center gap-1">
                      Request Fulfillment <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* OTC & Groceries */}
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.18 }} className="glow-card">
              <div data-testid="otc-groceries-scene">
                <Link href="/shop">
                  <Card className="clinical-glass overflow-hidden h-full hover-elevate cursor-pointer" data-testid="button-shop-otc-section">
                    <div className="relative h-40 sm:h-52 overflow-hidden">
                      <picture>
                        <source srcSet="/images/pharmacy-couple-shopping.webp" type="image/webp" />
                        <img src="/images/pharmacy-couple-shopping.jpg" alt="Couple shopping at Concordia Pharmacy" className="w-full h-full object-cover object-[center_20%]" loading="lazy" decoding="async" width="505" height="725" />
                      </picture>
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                      <div className="card-icon-badge absolute bottom-3 left-3 h-8 w-8 rounded-lg bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <CardContent className="pt-4 pb-5 flex flex-col flex-1">
                      <h3 className="font-bold text-white mb-1">OTC & Groceries</h3>
                      <p className="text-sm text-slate-400 mb-4 flex-1">Shop everyday health essentials online or in-store.</p>
                      <span className="text-xs text-primary font-semibold flex items-center gap-1">
                        Browse Products <ArrowRight className="h-3 w-3" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </ScrollSection>

      {/* Specialty & LTC Services */}
      <ScrollSection className="py-20 clinical-section-alt">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <ScrollRevealText text="Specialized Pharmacy Services" className="text-3xl md:text-4xl font-bold text-white mb-4" as="h2" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="text-lg text-slate-400 max-w-2xl mx-auto"
            >
              Beyond everyday prescriptions. Advanced pharmaceutical care for complex conditions and healthcare facilities.
            </motion.p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="glow-card"
            >
              <TiltCard className="group h-full" data-testid="card-specialty-cta">
                <Card className="clinical-glass hover-elevate h-full">
                  <CardContent className="p-8">
                    <Link href="/specialty">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-300 text-sm mb-5 hover-elevate cursor-pointer">
                        <Pill className="h-3.5 w-3.5" />
                        Specialty Pharmacy
                      </div>
                    </Link>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      Where Breakthrough Science Meets{" "}
                      <span className="text-primary">Patient Access</span>
                    </h3>
                    <p className="text-slate-400 mb-5 leading-relaxed">
                      80+ specialty medications across oncology, rheumatology, behavioral health, and rare disease. Real-time PrimeRx sync and cold-chain biologics handling.
                    </p>
                    <div className="flex flex-wrap gap-3 mb-6">
                      {["Real-Time Sync", "Cold-Chain Ready", "HIPAA Compliant"].map((tag) => (
                        <span key={tag} className="text-xs text-slate-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">{tag}</span>
                      ))}
                    </div>
                    <Link href="/specialty">
                      <MotionButton className="gap-2" data-testid="button-specialty-landing-cta">
                        <Pill className="h-4 w-4" />
                        Explore Specialty Hub
                        <ArrowRight className="h-4 w-4" />
                      </MotionButton>
                    </Link>
                  </CardContent>
                </Card>
              </TiltCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
              className="glow-card"
            >
              <TiltCard className="group h-full" data-testid="card-ltc-cta">
                <Card className="clinical-glass hover-elevate h-full">
                  <CardContent className="p-8">
                    <Link href="/ltc-partnership">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary/90 text-sm mb-5 hover-elevate cursor-pointer">
                        <Building2 className="h-3.5 w-3.5" />
                        Long-Term Care
                      </div>
                    </Link>
                    <h3 className="text-2xl font-bold text-white mb-3">LTC Facility Partnership</h3>
                    <p className="text-slate-400 mb-5 leading-relaxed">
                      Custom delivery, blister packaging, regulatory compliance, and collaborative care for nursing homes and assisted living facilities across New York State.
                    </p>
                    <div className="flex flex-wrap gap-3 mb-6">
                      {["Custom Delivery", "Blister Packaging", "Compliance Ready"].map((tag) => (
                        <span key={tag} className="text-xs text-slate-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">{tag}</span>
                      ))}
                    </div>
                    <Link href="/ltc-partnership">
                      <MotionButton className="gap-2" data-testid="button-ltc-landing-cta">
                        <Building2 className="h-4 w-4" />
                        Learn About LTC Partnership
                        <ArrowRight className="h-4 w-4" />
                      </MotionButton>
                    </Link>
                  </CardContent>
                </Card>
              </TiltCard>
            </motion.div>
          </div>
        </div>
      </ScrollSection>

      {/* Rx Categories Carousel */}
      <ScrollSection className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <ScrollRevealText text="Prescription Categories We Carry" className="text-3xl md:text-4xl font-bold text-white mb-4" as="h2" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="text-lg text-slate-200 max-w-2xl mx-auto"
            >
              Have your doctor send your prescription to Concordia Pharmacy. We stock the latest treatments across these specialties.
            </motion.p>
          </div>
          <RxCategoryCarousel />
          <p className="text-center text-xs text-slate-300 mt-6 max-w-xl mx-auto">
            All prescription medications require a valid prescription. Ask your provider to send your RX to Concordia Pharmacy, or call us at{" "}
            <a href="tel:+17183282833" className="text-primary/80 hover:text-primary">(718) 328-2833</a> to transfer.
          </p>
        </div>
      </ScrollSection>

      {/* OTC + Everyday Essentials */}
      <ScrollSection className="py-20 clinical-section-alt">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1" data-testid="otc-groceries-scene">
                <DeliveryFlowMockup shouldReduceMotion={!!shouldReduceMotion} />
              </div>

              <div className="order-1 md:order-2">
                <Badge variant="secondary" className="w-fit mb-6 bg-amber-500/15 text-amber-300 border-0">
                  <ShoppingBag className="h-3 w-3 mr-1" />
                  OTC + Everyday Essentials
                </Badge>
                <ScrollRevealText
                  text="Meds & Everyday Essentials, One Stop"
                  className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight"
                />
                <p className="text-lg text-slate-200 mb-6">
                  From vitamins and allergy relief to first aid and daily essentials. Pick up everything
                  you need alongside your prescriptions. No extra trips.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Pill, label: "Pain Relief" },
                    { icon: Shield, label: "Allergy Meds" },
                    { icon: Heart, label: "Vitamins" },
                    { icon: Syringe, label: "First Aid" },
                  ].map(({ icon: Icon, label }) => (
                    <Link href="/shop" key={label}>
                      <div className="flex items-center gap-2 p-3 rounded-md border border-white/20 bg-white/[0.06] hover-elevate cursor-pointer">
                        <Icon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        <span className="text-sm text-slate-200">{label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link href="/shop">
                  <MotionButton size="lg" className="gap-2" data-testid="button-shop-otc-section">
                    <ShoppingBag className="h-5 w-5" />
                    Browse OTC Products
                    <ArrowRight className="h-5 w-5" />
                  </MotionButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* Blister Pack Dialog — standalone */}
      <Dialog open={blisterDialogOpen} onOpenChange={setBlisterDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-lenis-prevent>
          <DialogHeader>
            <DialogTitle>Enroll in Blister Pack Program</DialogTitle>
            <DialogDescription>
              Fill out the form below to enroll in our free blister pack program.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!blisterForm.name.trim()) {
                toast({ title: "Name Required", description: "Please enter your full name.", variant: "destructive" });
                return;
              }
              if (!blisterForm.phone.trim() || blisterForm.phone.replace(/\D/g, '').length < 10) {
                toast({ title: "Valid Phone Required", description: "Please enter a valid phone number with at least 10 digits.", variant: "destructive" });
                return;
              }
              if (blisterForm.isNewPatient && !blisterForm.previousPharmacyName.trim()) {
                toast({ title: "Previous Pharmacy Required", description: "Please enter your previous pharmacy name for transfer.", variant: "destructive" });
                return;
              }
              blisterEnrollMutation.mutate(blisterForm);
            }}
            className="space-y-4 mt-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="landing-blister-name">Full Name *</Label>
                <Input
                  id="landing-blister-name"
                  data-testid="landing-input-blister-name"
                  placeholder="Your full name"
                  value={blisterForm.name}
                  onChange={(e) => setBlisterForm({ ...blisterForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="landing-blister-phone">Phone Number *</Label>
                <Input
                  id="landing-blister-phone"
                  type="tel"
                  data-testid="landing-input-blister-phone"
                  placeholder="(555) 123-4567"
                  value={blisterForm.phone}
                  onChange={(e) => setBlisterForm({ ...blisterForm, phone: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="landing-blister-email">Email</Label>
              <Input
                id="landing-blister-email"
                type="email"
                data-testid="landing-input-blister-email"
                placeholder="your@email.com"
                value={blisterForm.email}
                onChange={(e) => setBlisterForm({ ...blisterForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="landing-blister-address">Address</Label>
              <Input
                id="landing-blister-address"
                data-testid="landing-input-blister-address"
                placeholder="Your address for delivery"
                value={blisterForm.address}
                onChange={(e) => setBlisterForm({ ...blisterForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="landing-blister-insurance">Insurance Number</Label>
              <Input
                id="landing-blister-insurance"
                data-testid="landing-input-blister-insurance"
                placeholder="Your insurance policy number"
                value={blisterForm.insuranceNumber}
                onChange={(e) => setBlisterForm({ ...blisterForm, insuranceNumber: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="landing-new-patient"
                checked={blisterForm.isNewPatient}
                onCheckedChange={(checked) =>
                  setBlisterForm({ ...blisterForm, isNewPatient: checked as boolean })
                }
                data-testid="landing-checkbox-new-patient"
              />
              <Label htmlFor="landing-new-patient" className="text-sm font-normal cursor-pointer">
                I&apos;m a new patient (transferring from another pharmacy)
              </Label>
            </div>
            {blisterForm.isNewPatient && (
              <div className="space-y-4 pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  Please provide your previous pharmacy details so we can transfer your prescriptions:
                </p>
                <div className="space-y-2">
                  <Label htmlFor="landing-prev-pharmacy">Previous Pharmacy Name *</Label>
                  <Input
                    id="landing-prev-pharmacy"
                    data-testid="landing-input-previous-pharmacy"
                    placeholder="Name of your previous pharmacy"
                    value={blisterForm.previousPharmacyName}
                    onChange={(e) => setBlisterForm({ ...blisterForm, previousPharmacyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landing-prev-pharmacy-phone">Previous Pharmacy Phone</Label>
                  <Input
                    id="landing-prev-pharmacy-phone"
                    type="tel"
                    data-testid="landing-input-previous-pharmacy-phone"
                    placeholder="(555) 123-4567"
                    value={blisterForm.previousPharmacyPhone}
                    onChange={(e) => setBlisterForm({ ...blisterForm, previousPharmacyPhone: e.target.value })}
                  />
                </div>
              </div>
            )}
            <MotionButton
              type="submit"
              className="w-full"
              disabled={blisterEnrollMutation.isPending}
              data-testid="landing-button-submit-blister"
            >
              {blisterEnrollMutation.isPending ? "Submitting..." : "Submit Enrollment"}
            </MotionButton>
          </form>
          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground mb-2">Prefer to speak with someone?</p>
            <a
              href="tel:+17185857600"
              className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
              data-testid="landing-link-blister-call"
            >
              <Phone className="h-4 w-4" />
              Call us at (718) 585-7600
            </a>
            {/* Image tracking elements for test automation */}
            <span className="sr-only" aria-hidden="true">
              <span data-testid={`landing-img-blister-${currentBlisterImage}`} />
              {blisterImages.map((_, index) => (
                <span
                  key={index}
                  data-testid={`landing-blister-dot-${index}`}
                  onClick={() => setCurrentBlisterImage(index)}
                />
              ))}
            </span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline CTA 2 */}
      <ScrollSection className="py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-base text-slate-400 mb-4">Questions? Our team is available Monday to Saturday. No bots.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {isSignedIn ? (
              <Link href="/profile">
                <MotionButton size="lg" className="gap-2" data-testid="button-inline-cta2-signup">
                  <RefreshCw className="h-5 w-5" />
                  Manage My Prescriptions
                </MotionButton>
              </Link>
            ) : (
              <Link href="/signup">
                <MotionButton size="lg" className="gap-2" data-testid="button-inline-cta2-signup">
                  <Heart className="h-5 w-5" />
                  Join Concordia. It&apos;s Free
                </MotionButton>
              </Link>
            )}
            <a href="tel:+17183282833">
              <MotionButton size="lg" variant="outline" className="gap-2 backdrop-blur-sm border-white/40 text-white" data-testid="button-inline-cta2-call">
                <Phone className="h-5 w-5" />
                Call (718) 328-2833
              </MotionButton>
            </a>
          </div>
        </div>
      </ScrollSection>

      {/* Wellness Zone Preview */}
      <ScrollSection className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <Badge variant="secondary" className="w-fit mb-4 bg-emerald-500/15 text-emerald-300 border-0">
                  <Home className="h-3 w-3 mr-1" />
                  Wellness Zone
                </Badge>
                <ScrollRevealText text="Health Tips & Guides" className="text-3xl md:text-4xl font-bold text-white mb-2" as="h2" />
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: 0.18 }}
                  className="text-slate-400 max-w-lg"
                >
                  Curated health articles from the CDC, NIH, and our own clinical team.
                </motion.p>
              </div>
              <Link href="/wellness">
                <MotionButton variant="outline" className="gap-2 shrink-0 border-white/40 text-white" data-testid="button-wellness-landing-cta">
                  <Sparkles className="h-4 w-4" />
                  Browse Wellness Zone
                  <ArrowRight className="h-4 w-4" />
                </MotionButton>
              </Link>
            </div>

            {/* Category tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: "Allergy Season",  desc: "Managing pollen & dust", color: "text-emerald-200", bg: "bg-slate-700/40" },
                { label: "Heart Health",    desc: "BP and cholesterol",      color: "text-rose-200",    bg: "bg-slate-700/40" },
                { label: "Pharmacy Tips",   desc: "From r/pharmacy & more",  color: "text-amber-200",   bg: "bg-slate-700/40" },
                { label: "Skin & Beauty",   desc: "Sunscreen, moisturizer",  color: "text-purple-200",  bg: "bg-slate-700/40" },
              ].map((t) => (
                <Link href="/wellness" key={t.label}>
                  <div className={`flex flex-col gap-1 p-4 rounded-xl border border-white/[0.07] ${t.bg} hover-elevate cursor-pointer`}
                    data-testid={`tile-landing-wellness-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <p className={`text-sm font-semibold ${t.color}`}>{t.label}</p>
                    <p className="text-xs text-slate-400">{t.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Source strip */}
            <div className="flex flex-wrap gap-2 items-center pt-4 border-t border-white/[0.06]">
              <span className="text-xs text-slate-500 mr-1">Powered by:</span>
              {[
                { label: "CDC",         color: "text-emerald-200 bg-emerald-200/[0.07] border-emerald-200/15" },
                { label: "NIH",         color: "text-primary/80  bg-primary/[0.07]     border-primary/15"     },
                { label: "NPR Health",  color: "text-sky-200     bg-sky-200/[0.07]     border-sky-200/15"     },
                { label: "WHO",         color: "text-purple-200  bg-purple-200/[0.07]  border-purple-200/15"  },
              ].map(({ label, color }) => (
                <span key={label} className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded px-1.5 py-0.5 ${color}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* ConcordiaCare App Section */}
      <ScrollSection className="py-20 clinical-section-alt">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="secondary" className="w-fit mb-6 bg-primary/15 text-primary/70 border-0">
                  <Smartphone className="h-3 w-3 mr-1" />
                  Free for Every Patient
                </Badge>
                <ScrollRevealText text="The ConcordiaCare App" className="text-2xl lg:text-3xl font-bold mb-4 text-white" as="h3" />
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: 0.18 }}
                  className="text-slate-400 mb-6"
                >
                  The ConcordiaCare app puts your entire pharmacy in the palm of your hand. Refills,
                  delivery tracking, loyalty rewards, and secure messaging with our team.
                </motion.p>
                <ul className="space-y-3 mb-6">
                  {[
                    "Refill prescriptions with one tap",
                    "Real-time delivery tracking with live GPS",
                    "Earn and redeem loyalty rewards",
                    "Secure messaging with our team",
                    "Full medication history at your fingertips",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {isSignedIn ? (
                  <Link href="/profile">
                    <MotionButton
                      size="lg"
                      className="gap-2 w-full sm:w-auto"
                      data-testid="button-become-patient"
                    >
                      <User className="h-5 w-5" />
                      Go to My Profile
                    </MotionButton>
                  </Link>
                ) : (
                  <MotionButton
                    size="lg"
                    className="gap-2 w-full sm:w-auto"
                    data-testid="button-become-patient"
                    onClick={() => {
                      const el = document.getElementById("transfer-section");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <Heart className="h-5 w-5" />
                    Become a Patient
                  </MotionButton>
                )}
              </div>

              <div className="flex justify-center" data-testid="delivery-flow-hover">
                <div className="relative w-64">
                  <div className="rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden shadow-2xl shadow-primary/10 aspect-[9/19.5] flex flex-col">
                    <div className="bg-gradient-to-r from-primary/30 to-primary/20 px-4 pt-6 pb-4 text-center border-b border-slate-700/50">
                      <div className="h-16 w-16 rounded-full bg-primary/20 border border-primary/30 mx-auto mb-3 flex items-center justify-center">
                        <img src={concordiaCIcon} alt="ConcordiaCare" className="h-10 w-10 object-contain" loading="lazy" decoding="async" width="40" height="40" />
                      </div>
                      <p className="text-sm font-semibold text-white">ConcordiaCare</p>
                      <p className="text-[10px] text-primary/70">Your Health Hub</p>
                    </div>
                    <div className="p-4 space-y-3.5 flex-1">
                      <div className="bg-slate-800/80 rounded-lg p-3.5 border border-slate-700/40">
                        <div className="flex items-center justify-between gap-1 mb-2.5">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Quick Refill</span>
                          <div className="h-2 w-2 rounded-full bg-emerald-400" />
                        </div>
                        <div className="bg-primary rounded-lg py-2.5 text-center">
                          <p className="text-xs font-medium text-white">Refill Lisinopril 10mg</p>
                        </div>
                      </div>
                      <div className="bg-slate-800/80 rounded-lg p-3.5 border border-slate-700/40">
                        <div className="flex items-center justify-between gap-1 mb-2.5">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Delivery</span>
                          <Navigation className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full w-3/4 bg-gradient-to-r from-primary to-emerald-400 rounded-full" />
                          </div>
                          <span className="text-[11px] text-emerald-400 font-medium">12 min</span>
                        </div>
                      </div>
                      <div className="bg-slate-800/80 rounded-lg p-3.5 border border-slate-700/40">
                        <div className="flex items-center justify-between gap-1">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Rewards</span>
                            <p className="text-base font-bold text-primary">2,450 pts</p>
                          </div>
                          <Award className="h-6 w-6 text-amber-400" />
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-5 flex justify-around border-t border-slate-700/40 pt-3 mt-auto">
                      <div className="text-center">
                        <Pill className="h-4 w-4 text-primary mx-auto" />
                        <p className="text-[9px] text-slate-300 mt-1">Meds</p>
                      </div>
                      <div className="text-center">
                        <Truck className="h-4 w-4 text-slate-300 mx-auto" />
                        <p className="text-[9px] text-slate-300 mt-1">Track</p>
                      </div>
                      <div className="text-center">
                        <MessageCircle className="h-4 w-4 text-slate-300 mx-auto" />
                        <p className="text-[9px] text-slate-300 mt-1">Chat</p>
                      </div>
                      <div className="text-center">
                        <User className="h-4 w-4 text-slate-300 mx-auto" />
                        <p className="text-[9px] text-slate-300 mt-1">Profile</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* Location & Contact */}
      <ScrollSection className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <ScrollRevealText text="Find Us" className="text-3xl font-bold mb-2 text-white" as="h3" />
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="text-slate-400"
            >Your neighborhood pharmacy in New York City</motion.p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { key: "location", delay: 0, content: (
                <TiltCard className="group h-full" data-testid="card-location">
                  <Card className="clinical-glass h-full">
                    <CardHeader className="flex flex-row items-center gap-4 flex-wrap">
                      <MapPin className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle className="text-white">Visit Us</CardTitle>
                        <CardDescription className="text-slate-400">Our Location</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <a
                        href="https://maps.google.com/?q=898+East+Tremont+Ave,+Bronx,+NY+10460"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:text-primary transition-colors"
                        data-testid="link-address-map"
                      >
                        <p className="font-medium text-slate-200 hover:underline">898 East Tremont Ave</p>
                        <p className="text-slate-400">Bronx, NY 10460</p>
                        <p className="text-xs text-primary mt-2 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Tap to open in Maps
                        </p>
                      </a>
                    </CardContent>
                  </Card>
                </TiltCard>
              )},
              { key: "hours", delay: 0.15, content: (
                <TiltCard className="group h-full" data-testid="card-hours">
                  <Card className="clinical-glass h-full">
                    <CardHeader className="flex flex-row items-center gap-4 flex-wrap">
                      <Clock className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle className="text-white">Hours</CardTitle>
                        <CardDescription className="text-slate-400">We&apos;re Here for You</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="flex justify-between gap-4">
                        <span className="text-slate-400">Mon-Fri:</span>
                        <span className="font-medium text-slate-200">9:00 AM - 7:00 PM</span>
                      </p>
                      <p className="flex justify-between gap-4">
                        <span className="text-slate-400">Saturday:</span>
                        <span className="font-medium text-slate-200">10:00 AM - 3:00 PM</span>
                      </p>
                      <p className="flex justify-between gap-4">
                        <span className="text-slate-400">Sunday:</span>
                        <span className="font-medium text-red-400">Closed</span>
                      </p>
                    </CardContent>
                  </Card>
                </TiltCard>
              )},
              { key: "contact", delay: 0.3, content: (
                <TiltCard className="group h-full" data-testid="card-contact">
                  <Card className="clinical-glass h-full">
                    <CardHeader className="flex flex-row items-center gap-4 flex-wrap">
                      <Phone className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle className="text-white">Contact</CardTitle>
                        <CardDescription className="text-slate-400">Call or Text Us</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <a href="tel:+17183282833" className="text-2xl font-bold text-primary hover:underline">
                        (718) 328-2833
                      </a>
                      <p className="text-sm text-slate-400 mt-2">Available during business hours</p>
                    </CardContent>
                  </Card>
                </TiltCard>
              )},
            ].map(({ key, delay, content }) => (
              <motion.div
                key={key}
                initial={shouldReduceMotion ? undefined : { y: 30 }}
                whileInView={shouldReduceMotion ? undefined : { y: 0 }}
                viewport={{ once: true }}
                transition={{ delay, duration: 0.5, ease: "easeOut" }}
              >
                {content}
              </motion.div>
            ))}
          </div>
        </div>
      </ScrollSection>

      {/* Proof Strip — Stats + Auto-Rotating Reviews */}
      <ScrollSection className="py-14 clinical-section-alt">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-center mb-12">
            {([
              { end: 300, suffix: "+",  label: "Savings Programs We Search", testId: "stat-years-proof",    duration: 2,   decimals: 0 },
              { end: 35,  suffix: "K+", label: "Patients & Counting",        testId: "stat-patients-proof", duration: 2,   decimals: 0 },
              { end: 4.9, suffix: " / 5", label: "Average Rating",             testId: "stat-rating-proof",   duration: 1.5, decimals: 1 },
              { end: 0,   suffix: "$",  label: "Delivery Cost: Always Free", testId: "stat-delivery-proof", duration: 2,   decimals: 0 },
            ]).map((stat, i) => (
              <motion.div
                key={stat.testId}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={shouldReduceMotion ? undefined : { type: "spring", stiffness: 300, damping: 24, delay: i * 0.08 }}
              >
                <p className="text-4xl font-bold vitality-glow-soft" data-testid={stat.testId}>
                  <CountUpNumber end={stat.end} suffix={stat.suffix} duration={stat.duration} decimals={stat.decimals} />
                </p>
                <p className="text-sm text-slate-400 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
          {/* Auto-rotating reviews — cycles every 3 s */}
          <AnimatePresence mode="wait">
            <motion.div
              key={reviewPage}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 md:overflow-visible md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:max-w-5xl md:mx-auto scrollbar-hide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              {visibleReviews.map((review, i) => (
                <motion.div
                  key={review.name}
                  className="snap-center shrink-0 w-[82vw] sm:w-72 md:w-auto md:shrink"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26, delay: i * 0.06 }}
                  data-testid={`review-${reviewPage}-${i}`}
                >
                  <Card className="clinical-glass h-full">
                    <CardContent className="pt-6">
                      <div className="flex gap-1 mb-3">
                        {[...Array(5)].map((_, j) => (
                          <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                        ))}
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed mb-4">&ldquo;{review.text}&rdquo;</p>
                      <p className="text-xs text-slate-500 font-medium">{review.name}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollSection>

      {/* Final CTA */}
      <ScrollSection className="py-20 relative overflow-hidden clinical-cta-bg">
        <div className="absolute inset-0 opacity-[0.06]">
          <picture>
            <source srcSet={pharmacistHelpingImageWebp} type="image/webp" />
            <img
              src={pharmacistHelpingImage}
              alt="Staff helping customer"
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              width="1408"
              height="768"
            />
          </picture>
        </div>
        <div className="relative container mx-auto px-4">
          <div className="text-center text-white max-w-3xl mx-auto">
            <ScrollRevealText
              text={isSignedIn ? "Your pharmacy is here for you." : "Your family deserves better care."}
              as="h3"
              className="text-4xl lg:text-5xl font-bold mb-6"
            />
            <p className="text-xl mb-8 text-white/70">
              {isSignedIn
                ? "Your prescriptions, rewards, and wellness hub are all in one place."
                : "Switching takes 2 minutes and it\u2019s completely free. We handle the transfer, the paperwork, and the delivery. You just show up."}
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              {isSignedIn ? (
                <>
                  <Link href="/profile">
                    <MotionButton size="lg" className="gap-2" data-testid="button-register-now">
                      <User className="h-5 w-5" />
                      Go to My Profile
                    </MotionButton>
                  </Link>
                  <Link href="/shop">
                    <MotionButton size="lg" variant="outline" className="gap-2 backdrop-blur-sm border-white/40 text-white" data-testid="button-final-cta-shop">
                      <ShoppingBag className="h-5 w-5" />
                      Shop OTC Products
                    </MotionButton>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup">
                    <MotionButton size="lg" className="gap-2" data-testid="button-register-now">
                      Join Concordia. It&apos;s Free
                      <ArrowRight className="h-5 w-5" />
                    </MotionButton>
                  </Link>
                  <a href="tel:+17183282833">
                    <MotionButton size="lg" variant="outline" className="gap-2 backdrop-blur-sm border-white/40 text-white" data-testid="button-final-cta-call">
                      <Phone className="h-5 w-5" />
                      Call (718) 328-2833
                    </MotionButton>
                  </a>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 mt-12 pt-8 border-t border-white/10">
              <div>
                <p className="text-5xl md:text-6xl font-bold vitality-glow-soft" data-testid="stat-years"><CountUpNumber end={5} suffix="" /></p>
                <p className="text-white/60 text-sm">NYC Boroughs We Serve</p>
              </div>
              <div>
                <p className="text-5xl md:text-6xl font-bold vitality-glow-soft" data-testid="stat-patients"><CountUpNumber end={35} suffix="K+" /></p>
                <p className="text-white/60 text-sm">Happy Patients</p>
              </div>
              <div>
                <p className="text-5xl md:text-6xl font-bold vitality-glow-soft" data-testid="stat-rating"><CountUpNumber end={4.9} suffix="" duration={1.5} decimals={1} /></p>
                <p className="text-white/60 text-sm">Star Rating</p>
              </div>
            </div>
          </div>
        </div>
      </ScrollSection>

      <SiteFooter />
    </PageTransition>
  );
}
