import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useTransform,
  useMotionValue,
  motion,
  useReducedMotion,
} from "framer-motion";
import { MotionButton } from "@/components/motion-button";
import { AnimatedTruck } from "@/components/animated-icons";
import { Syringe, ShoppingBag, ArrowRight, Shield, Heart, User, RefreshCw } from "lucide-react";
import { getLenis } from "@/hooks/useLenis";
import { useAuth } from "@/hooks/useAuth";

export function ScrollVideoHero() {
  const { isSignedIn } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [truckDriving, setTruckDriving] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const useAutoPlay = true;

  // ── Force video to load and show frame 0 on mount ────────────────────────────
  // Only needed in scroll-scrub mode. In autoplay mode the browser handles it.
  useEffect(() => {
    if (useAutoPlay) return;
    const video = videoRef.current;
    if (!video) return;

    const showFirstFrame = () => {
      video.pause();
      video.currentTime = 0;
    };

    if (video.readyState >= 2) {
      showFirstFrame();
    } else {
      video.addEventListener("loadeddata", showFirstFrame, { once: true });
    }
  }, []);

  // Raw scroll progress 0→1, calculated directly from the container's
  // bounding rect — bypasses Framer Motion useScroll entirely so it
  // works regardless of DOM nesting, sticky parents, or overflow ancestors.
  const rawProgress  = useMotionValue(0);
  // Lerped version drives both video currentTime and text opacity — always in sync.
  const lerpProgress = useMotionValue(0);

  // ── Scroll listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect  = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      const p = Math.max(0, Math.min(-rect.top / total, 1));
      rawProgress.set(p);
    };

    window.addEventListener("scroll", update, { passive: true });
    const lenis = getLenis();
    lenis?.on("scroll", update);
    update(); // seed on mount
    return () => {
      window.removeEventListener("scroll", update);
      lenis?.off("scroll", update);
    };
  }, [rawProgress]);

  // ── RAF lerp loop — always runs so text phases animate on scroll ────────────
  // Video currentTime is only scrubbed in manual (non-autoplay) mode.
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const target  = rawProgress.get();
      const current = lerpProgress.get();
      // 12% per frame @60 fps → cinematic, responsive, never overshoots
      const next    = current + (target - current) * 0.12;
      lerpProgress.set(next);

      if (!useAutoPlay) {
        const video = videoRef.current;
        if (video && video.duration && !isNaN(video.duration) && video.readyState >= 2) {
          video.currentTime = Math.max(0, Math.min(next * video.duration, video.duration));
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [rawProgress, lerpProgress]);

  // ── Text transforms — same lerpProgress as video → perfect sync ─────────────
  // Three phases spread evenly across 300vh scroll (0 → 1)
  // Phase 1: visible on load, fades out 0.18→0.30
  const phase1Opacity = useTransform(lerpProgress, [0.18, 0.30], [1, 0]);

  // Phase 2: fades in 0.27→0.40, holds, fades out 0.55→0.65
  const phase2Opacity = useTransform(lerpProgress, [0.27, 0.40, 0.55, 0.65], [0, 1, 1, 0]);
  const phase2Y       = useTransform(lerpProgress, [0.27, 0.40], [28, 0]);

  // Phase 3: fades in 0.62→0.74, holds, fades out 0.88→0.97
  const phase3Opacity = useTransform(lerpProgress, [0.62, 0.74, 0.88, 0.97], [0, 1, 1, 0]);
  const phase3Y       = useTransform(lerpProgress, [0.62, 0.74], [28, 0]);
  // Invisible absolute phases must not intercept taps meant for the visible phase.
  const phase1PointerEvents = useTransform(lerpProgress, (p) => p < 0.28 ? "auto" : "none");
  const phase2PointerEvents = useTransform(lerpProgress, (p) => p >= 0.28 && p < 0.66 ? "auto" : "none");
  const phase3PointerEvents = useTransform(lerpProgress, (p) => p >= 0.66 ? "auto" : "none");

  // Hint disappears on first scroll (raw, instant)
  const hintOpacity = useTransform(rawProgress, [0, 0.04], [1, 0]);

  return (
    <div ref={containerRef} style={{ height: isMobile ? "100vh" : "300vh", position: "relative" }}>

      {/* Sticky fullscreen stage */}
      <div
        className="sticky top-0 overflow-hidden"
        style={{ height: "100vh", width: "100vw", background: "hsl(222 47% 4%)" }}
      >

        {/* Full-screen background — video on desktop, static gradient + ambient orbs on mobile */}
        {isMobile ? (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(135deg, hsl(220 30% 10%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)",
              }}
            />
          </>
        ) : (
          <video
            ref={videoRef}
            src="/videos/hero-bg.mp4"
            className="absolute inset-0 pointer-events-none"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              filter: "brightness(1.15) contrast(1.05) saturate(1.1)",
            }}
            muted
            playsInline
            preload="auto"
            autoPlay={useAutoPlay}
            loop={useAutoPlay}
            data-testid="video-hero-pill-bottle"
          />
        )}

        {/* Left vignette — text legibility */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.58) 40%, rgba(0,0,0,0.08) 66%, transparent 100%)",
          }}
        />
        {/* Bottom vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 30%)",
          }}
        />

        {/* Phase 1 — visible on load, fades out on scroll */}
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: isMobile ? "5%" : "10%",
            width: isMobile ? "min(90%, 420px)" : "clamp(280px, 38vw, 560px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            opacity: phase1Opacity,
            pointerEvents: phase1PointerEvents,
          }}
        >
          <h1
            className="font-bold leading-tight text-white"
            style={{ fontSize: "clamp(2.2rem, 4.2vw, 3.75rem)", marginBottom: "1.2rem" }}
            data-testid="text-hero-headline"
          >
            Your Trusted{" "}
            <span style={{ color: "hsl(var(--primary))" }}>Healthcare</span>{" "}
            Partner
          </h1>

          <p
            className="text-white/70"
            style={{
              fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
              lineHeight: 1.65,
              marginBottom: "2rem",
              maxWidth: "36ch",
            }}
            data-testid="text-hero-subtitle"
          >
            Professional pharmaceutical care for your whole family. From
            toddlers to grandparents, we're here to keep everyone healthy.
          </p>

          <div className="flex flex-wrap gap-3">
             <Link href="/schedule-flu-shot">
              <MotionButton
                size="lg"
                variant="outline"
                className="gap-2 backdrop-blur-sm border-white/50 text-white bg-white/10"
                data-testid="button-schedule-flu-shot"
              >
                <Syringe className="h-5 w-5" />
                Schedule Flu Shot
              </MotionButton>
            </Link>
            <Link href="/shop">
              <MotionButton
                size="lg"
                variant="outline"
                className="gap-2 backdrop-blur-sm border-white/50 text-white bg-white/10"
                data-testid="button-shop-otc-hero"
              >
                <ShoppingBag className="h-5 w-5" />
                Shop OTC Products
              </MotionButton>
            </Link>
            {isSignedIn ? (
              <Link href="/profile">
                <MotionButton size="lg" className="gap-2" data-testid="button-become-patient-hero">
                  <User className="h-5 w-5" />
                  My Profile
                </MotionButton>
              </Link>
            ) : (
             <Link href="/signup">
                <MotionButton size="lg" className="gap-2" data-testid="button-become-patient-hero">
                  Become a Patient
                  <ArrowRight className="h-5 w-5" />
                </MotionButton>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Phase 2 — fades in mid-scroll */}
        <motion.div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "10%",
            width: "clamp(280px, 38vw, 560px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            opacity: phase2Opacity,
            y: phase2Y,
            pointerEvents: phase2PointerEvents,
          }}
        >
          <h2
            className="font-bold leading-tight text-white"
            style={{ fontSize: "clamp(2.2rem, 4.2vw, 3.75rem)", marginBottom: "1.2rem" }}
          >
            Every Dose.{" "}
            <span style={{ color: "hsl(var(--primary))" }}>Perfectly</span>{" "}
            Prepared.
          </h2>

          <p
            className="text-white/70"
            style={{
              fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
              lineHeight: 1.65,
              marginBottom: "2rem",
              maxWidth: "32ch",
            }}
          >
            From our pharmacy to your door. We track, pack, and deliver every
            prescription with precision and care.
          </p>

          <div className="flex flex-wrap gap-3">
               <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-3 py-1.5 rounded-md border border-white/10">
              <Shield className="h-4 w-4 text-primary" />
              <span>50,000+ Patients</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-3 py-1.5 rounded-md border border-white/10 backdrop-blur-sm">
              <Heart className="h-4 w-4 text-primary" />
              <span>Family Owned</span>
            </div>
            <div
              className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-3 py-1.5 rounded-md border border-white/10 backdrop-blur-sm cursor-pointer"
              onClick={() => setTruckDriving(true)}
              data-testid="badge-free-delivery"
            >
              <AnimatedTruck
                className="h-4 w-4 text-primary"
                driveAway={truckDriving}
                onDriveComplete={() => setTruckDriving(false)}
              />
              <span>Free Delivery</span>
            </div>
          </div>
        </motion.div>

        {/* Phase 3 — fades in late-scroll */}
        <motion.div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "10%",
            width: "clamp(280px, 38vw, 560px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            opacity: phase3Opacity,
            y: phase3Y,
            pointerEvents: phase3PointerEvents,
          }}
        >
          <h2
            className="font-bold leading-tight text-white"
            style={{ fontSize: "clamp(2.2rem, 4.2vw, 3.75rem)", marginBottom: "1.2rem" }}
          >
            Refills Made{" "}
            <span style={{ color: "hsl(var(--primary))" }}>Effortless.</span>
          </h2>

          <p
            className="text-white/70"
            style={{
              fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
              lineHeight: 1.65,
              marginBottom: "2rem",
              maxWidth: "32ch",
            }}
          >
            One tap in the app. We handle the rest: refilled, packaged,
            and at your door before you run out.
          </p>

          <div className="flex flex-wrap gap-3">
            {isSignedIn ? (
              <Link href="/profile">
                <MotionButton size="lg" className="gap-2" data-testid="button-start-refills">
                  <RefreshCw className="h-5 w-5" />
                  Refill My Prescriptions
                </MotionButton>
              </Link>
            ) : (
             <Link href="/signup">
                <MotionButton size="lg" className="gap-2" data-testid="button-start-refills">
                  <ArrowRight className="h-5 w-5" />
                  Get Started Today
                </MotionButton>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1.5"
          style={{ opacity: hintOpacity }}
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        >
          <span className="text-[10px] text-white/35 uppercase tracking-[0.2em]">Scroll</span>
          <div className="w-px h-9 bg-gradient-to-b from-white/25 to-transparent" />
        </motion.div>

      </div>
    </div>
  );
}
