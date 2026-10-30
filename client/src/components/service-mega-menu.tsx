import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MotionButton } from "@/components/motion-button";
import {
  Pill,
  Building2,
  Search,
  FileText,
  Stethoscope,
  Truck,
  ClipboardCheck,
  Package,
  HeartHandshake,
  ArrowRight,
  X,
  type LucideIcon,
} from "lucide-react";

interface ProcessStep {
  icon: LucideIcon;
  label: string;
  description: string;
}

interface MegaMenuConfig {
  triggerIcon: LucideIcon;
  triggerLabel: string;
  tagline: string;
  subtitle: string;
  accentColor: string;
  accentRgb: string;
  steps: ProcessStep[];
  ctaLabel: string;
  ctaHref: string;
  testIdPrefix: string;
}

const specialtyConfig: MegaMenuConfig = {
  triggerIcon: Pill,
  triggerLabel: "Specialty",
  tagline: "80+ Specialty Medications",
  subtitle: "Oncology, Rheumatology, Dermatology, and more. Coordinated by our clinical pharmacists for complex conditions requiring specialized care.",
  accentColor: "purple",
  accentRgb: "168, 85, 247",
  steps: [
    { icon: Search, label: "Search & Discover", description: "Browse our full specialty database by condition, category, or medication name" },
    { icon: FileText, label: "Request Fulfillment", description: "Submit your prescription details securely through our HIPAA-compliant portal" },
    { icon: Stethoscope, label: "Clinical Review", description: "Our pharmacists verify, coordinate prior auth, and contact your prescriber" },
    { icon: Truck, label: "Delivery Coordination", description: "Temperature-controlled delivery right to your door with tracking updates" },
  ],
  ctaLabel: "Browse Specialty Medications",
  ctaHref: "/specialty",
  testIdPrefix: "mega-specialty",
};

const ltcConfig: MegaMenuConfig = {
  triggerIcon: Building2,
  triggerLabel: "LTC",
  tagline: "Long-Term Care Partnership",
  subtitle: "Custom pharmacy solutions for New York's nursing homes, assisted living, memory care, and rehabilitation facilities. Built for compliance and resident safety.",
  accentColor: "blue",
  accentRgb: "59, 130, 246",
  steps: [
    { icon: ClipboardCheck, label: "Submit Inquiry", description: "Tell us about your facility, bed count, and current pharmacy challenges" },
    { icon: HeartHandshake, label: "Tailored Onboarding", description: "We design a custom partnership plan aligned with your operations" },
    { icon: Package, label: "Custom Packaging", description: "Blister packs, unit-dose packaging, and compliance aids for every resident" },
    { icon: Stethoscope, label: "Ongoing Clinical Care", description: "24/7 pharmacist access, med reviews, and regulatory support" },
  ],
  ctaLabel: "Learn About LTC Partnership",
  ctaHref: "/ltc-partnership",
  testIdPrefix: "mega-ltc",
};

const STEP_EXIT_DIRECTIONS = [
  { x: -220, y: -80, rotate: -18 },
  { x: -80, y: 160, rotate: 12 },
  { x: 80, y: -140, rotate: -10 },
  { x: 240, y: 100, rotate: 16 },
];

const HEADER_EXIT = { x: -60, y: -120, rotate: -8 };
const CTA_EXIT = { x: 120, y: -80, rotate: 10 };
const DISMANTLE_DURATION = 0.45;

function ProcessOverlay({ config, onClose, onNavigate }: { config: MegaMenuConfig; onClose: () => void; onNavigate: () => void }) {
  const TriggerIcon = config.triggerIcon;
  const [activeStep, setActiveStep] = useState(-1);
  const [dismantling, setDismantling] = useState(false);
  const dismantlingRef = useRef(false);
  const dismantleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDismantle = useCallback(() => {
    if (dismantlingRef.current) return;
    dismantlingRef.current = true;
    setDismantling(true);
    onNavigate();
    dismantleTimerRef.current = setTimeout(() => {
      onClose();
    }, (DISMANTLE_DURATION + 0.15) * 1000);
  }, [onClose, onNavigate]);

  useEffect(() => {
    return () => {
      if (dismantleTimerRef.current) clearTimeout(dismantleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerDismantle();
    };
    const handleWheel = () => {
      triggerDismantle();
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (!e.touches?.length) return;
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches?.length) return;
      const delta = Math.abs(e.touches[0].clientY - touchStartY);
      if (delta > 10) triggerDismantle();
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("wheel", handleWheel, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.body.style.overflow = "";
    };
  }, [triggerDismantle]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    config.steps.forEach((_, i) => {
      timers.push(setTimeout(() => setActiveStep(i), 500 + i * 400));
    });
    return () => timers.forEach(clearTimeout);
  }, [config.steps]);

  const headerVariants = {
    visible: { opacity: 1, x: 0, y: 0, rotate: 0 },
    hidden: {
      opacity: 0,
      x: HEADER_EXIT.x,
      y: HEADER_EXIT.y,
      rotate: HEADER_EXIT.rotate,
      transition: { duration: DISMANTLE_DURATION, ease: [0.4, 0, 0.6, 1] },
    },
  };

  const ctaVariants = {
    visible: { opacity: 1, x: 0, y: 0, rotate: 0 },
    hidden: {
      opacity: 0,
      x: CTA_EXIT.x,
      y: CTA_EXIT.y,
      rotate: CTA_EXIT.rotate,
      transition: { duration: DISMANTLE_DURATION, ease: [0.4, 0, 0.6, 1], delay: 0.03 },
    },
  };

  const getStepVariants = (i: number) => {
    const dir = STEP_EXIT_DIRECTIONS[i % STEP_EXIT_DIRECTIONS.length];
    return {
      visible: { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 },
      hidden: {
        opacity: 0,
        x: dir.x,
        y: dir.y,
        rotate: dir.rotate,
        scale: 0.7,
        transition: { duration: DISMANTLE_DURATION, ease: [0.4, 0, 0.6, 1], delay: i * 0.04 },
      },
    };
  };

  const handleBackdropClick = () => {
    triggerDismantle();
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: dismantling ? 0 : 1 }}
      transition={{ duration: dismantling ? DISMANTLE_DURATION + 0.1 : 0.35, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] flex items-start justify-center"
      style={{ background: "rgba(2, 6, 18, 0.96)" }}
      onClick={handleBackdropClick}
      data-testid={`overlay-${config.testIdPrefix}`}
    >
      <motion.div
        initial={{ opacity: 0, y: -60, scale: 0.95 }}
        animate={{ opacity: dismantling ? 0 : 1, y: dismantling ? -40 : 0, scale: dismantling ? 0.97 : 1 }}
        transition={{ duration: dismantling ? DISMANTLE_DURATION : 0.5, ease: dismantling ? [0.4, 0, 0.6, 1] : [0.16, 1, 0.3, 1] }}
        className="w-full max-w-5xl mx-4 mt-16 md:mt-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative rounded-md overflow-hidden"
          style={{
            background: "rgba(15, 23, 42, 0.95)",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none rounded-md"
            style={{
              border: `1px solid rgba(${config.accentRgb}, 0.2)`,
            }}
          />

          <motion.div
            className="absolute top-0 left-0 right-0 h-[2px] origin-left"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(${config.accentRgb}, 0.8), rgba(${config.accentRgb}, 0.4), transparent)`,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          />

          <div className="relative z-10 p-8 md:p-12">
            <motion.div
              variants={headerVariants}
              initial="visible"
              animate={dismantling ? "hidden" : "visible"}
              className="flex items-start justify-between gap-4 mb-10"
            >
              <div className="flex-1">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-3 mb-5"
                >
                  <div
                    className="relative w-10 h-10 rounded-md flex items-center justify-center"
                    style={{ background: `rgba(${config.accentRgb}, 0.15)` }}
                  >
                    <TriggerIcon className="h-5 w-5" style={{ color: `rgba(${config.accentRgb}, 0.9)` }} />
                    <div
                      className="absolute inset-0 rounded-md"
                      style={{ border: `1px solid rgba(${config.accentRgb}, 0.3)` }}
                    />
                  </div>
                  <div>
                    <span
                      className="text-xs font-semibold tracking-widest uppercase"
                      style={{ color: `rgba(${config.accentRgb}, 0.7)` }}
                    >
                      {config.tagline}
                    </span>
                  </div>
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.5 }}
                  className="text-2xl md:text-3xl font-bold text-white mb-3"
                  data-testid={`${config.testIdPrefix}-title`}
                >
                  How It Works
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.4 }}
                  className="text-slate-400 text-base leading-relaxed max-w-lg"
                >
                  {config.subtitle}
                </motion.p>
              </div>

              <motion.div
                variants={ctaVariants}
                initial="visible"
                animate={dismantling ? "hidden" : "visible"}
                className="flex items-center gap-3 shrink-0"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                >
                  <Link href={config.ctaHref} onClick={triggerDismantle}>
                    <MotionButton size="lg" className="gap-2" data-testid={`button-${config.testIdPrefix}-cta`}>
                      {config.ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </MotionButton>
                  </Link>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <MotionButton
                    variant="ghost"
                    size="icon"
                    onClick={triggerDismantle}
                    className="text-slate-300"
                    data-testid={`button-${config.testIdPrefix}-close`}
                  >
                    <X className="h-5 w-5" />
                  </MotionButton>
                </motion.div>
              </motion.div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-0 relative">
              {config.steps.map((step, i) => {
                const StepIcon = step.icon;
                const isRevealed = i <= activeStep;
                const isActive = i === activeStep;
                const stepVariants = getStepVariants(i);

                return (
                  <motion.div
                    key={step.label}
                    variants={stepVariants}
                    initial="visible"
                    animate={dismantling ? "hidden" : "visible"}
                    className="relative flex flex-col items-center text-center"
                    data-testid={`${config.testIdPrefix}-step-${i}`}
                  >
                    {i < config.steps.length - 1 && (
                      <motion.div
                        className="hidden md:block absolute top-8 left-[calc(50%+32px)] h-[2px] origin-left"
                        style={{
                          width: "calc(100% - 64px)",
                          background: `linear-gradient(90deg, rgba(${config.accentRgb}, 0.4), rgba(${config.accentRgb}, 0.08))`,
                        }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: isRevealed ? 1 : 0 }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}

                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: isRevealed ? 1 : 0,
                        opacity: isRevealed ? 1 : 0,
                      }}
                      transition={{
                        duration: 0.5,
                        type: "spring",
                        stiffness: 200,
                        damping: 15,
                      }}
                      className="relative z-10 w-16 h-16 rounded-md flex items-center justify-center mb-4"
                      style={{
                        background: `rgba(${config.accentRgb}, ${isActive ? 0.2 : 0.1})`,
                        boxShadow: "none",
                        border: `1px solid rgba(${config.accentRgb}, ${isActive ? 0.4 : 0.15})`,
                        transition: "box-shadow 0.4s ease, background 0.4s ease, border-color 0.4s ease",
                      }}
                    >
                      <StepIcon className="h-7 w-7" style={{ color: `rgba(${config.accentRgb}, 0.9)` }} />

                      <motion.span
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          background: isRevealed
                            ? `rgba(${config.accentRgb}, 0.25)`
                            : "rgba(255,255,255,0.05)",
                          color: isRevealed
                            ? `rgba(${config.accentRgb}, 0.9)`
                            : "rgba(255,255,255,0.3)",
                          border: `1px solid rgba(${config.accentRgb}, ${isRevealed ? 0.4 : 0.1})`,
                        }}
                        initial={{ scale: 0 }}
                        animate={{ scale: isRevealed ? 1 : 0 }}
                        transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
                      >
                        {i + 1}
                      </motion.span>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{
                        opacity: isRevealed ? 1 : 0,
                        y: isRevealed ? 0 : 15,
                      }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <h4 className="text-base font-semibold text-white mb-2">{step.label}</h4>
                      <p className="text-sm text-slate-400 leading-relaxed max-w-[200px] mx-auto">{step.description}</p>
                    </motion.div>

                    {i < config.steps.length - 1 && (
                      <motion.div
                        className="md:hidden w-[2px] h-8 my-4 origin-top"
                        style={{
                          background: `linear-gradient(180deg, rgba(${config.accentRgb}, 0.4), rgba(${config.accentRgb}, 0.08))`,
                        }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: isRevealed ? 1 : 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: dismantling ? 0 : 1 }}
              transition={{ delay: dismantling ? 0 : 2.5, duration: dismantling ? 0.15 : 0.5 }}
              className="mt-10 pt-6 border-t border-white/5 flex items-center justify-center"
            >
              <p className="text-xs text-slate-300">
                Press <kbd className="px-1.5 py-0.5 rounded-sm border border-slate-600 bg-slate-800 text-slate-400 text-[10px] mx-1">ESC</kbd> or scroll to close
              </p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function GlowTrigger({ config, currentLocation }: { config: MegaMenuConfig; currentLocation?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
  const isActive = currentLocation === config.ctaHref;
  const TriggerIcon = config.triggerIcon;
  const reducedMotion = useReducedMotion();

  const closeMenu = useCallback(() => setIsOpen(false), []);

  const navigateToPage = useCallback(() => {
    if (currentLocation !== config.ctaHref) {
      navigate(config.ctaHref);
    }
  }, [currentLocation, config.ctaHref, navigate]);

  return (
    <div className="hidden md:block">
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        className={`relative group flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer text-white/90 hover:text-white border border-transparent ${reducedMotion ? "" : "transition-all duration-300"}`}
        style={{
          background: isOpen || isActive ? `rgba(${config.accentRgb}, 0.15)` : "transparent",
          boxShadow: "none",
          borderColor: isOpen || isActive ? `rgba(${config.accentRgb}, 0.4)` : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isOpen && !isActive) {
            e.currentTarget.style.borderColor = `rgba(${config.accentRgb}, 0.35)`;
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen && !isActive) {
            e.currentTarget.style.borderColor = "transparent";
          }
        }}
        data-testid={`button-nav-${config.testIdPrefix}`}
        aria-expanded={isOpen}
        aria-label={`${config.triggerLabel}: ${config.tagline}`}
      >
        <TriggerIcon className="h-4 w-4" />
        <span>{config.triggerLabel}</span>

        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: `rgba(${config.accentRgb}, 0.6)` }}
        />
      </motion.button>

      <AnimatePresence>
        {isOpen && <ProcessOverlay config={config} onClose={closeMenu} onNavigate={navigateToPage} />}
      </AnimatePresence>
    </div>
  );
}

export function SpecialtyMegaMenu({ currentLocation }: { currentLocation: string }) {
  return <GlowTrigger config={specialtyConfig} currentLocation={currentLocation} />;
}

export function LtcMegaMenu({ currentLocation }: { currentLocation: string }) {
  return <GlowTrigger config={ltcConfig} currentLocation={currentLocation} />;
}
