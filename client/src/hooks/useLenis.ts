import { useEffect, useRef } from "react";
import Lenis from "lenis";

let globalLenis: Lenis | null = null;

export function useLenis(enabled = true) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (globalLenis) {
        globalLenis.destroy();
        globalLenis = null;
      }
      lenisRef.current = null;
      return;
    }

    if (globalLenis) {
      lenisRef.current = globalLenis;
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      infinite: false,
    });

    globalLenis = lenis;
    lenisRef.current = lenis;

    let rafId: number;
    let destroyed = false;

    function raf(time: number) {
      if (destroyed) return;
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      lenis.destroy();
      globalLenis = null;
      lenisRef.current = null;
    };
  }, [enabled]);

  return lenisRef;
}

export function getLenis() {
  return globalLenis;
}
