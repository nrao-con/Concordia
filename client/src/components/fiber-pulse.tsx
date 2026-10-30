import { motion, useReducedMotion } from "framer-motion";

interface FiberPulseProps {
  className?: string;
  text?: string;
}

export function FiberPulse({ className = "", text = "Syncing..." }: FiberPulseProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      data-testid="fiber-pulse-loader"
      role="status"
      aria-live="polite"
    >
      <div className="relative w-24 h-1 rounded-full overflow-hidden bg-white/10 shrink-0">
        {prefersReducedMotion ? (
          <div className="absolute inset-0 bg-primary/60 rounded-full" />
        ) : (
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-primary/70"
            animate={{ left: ["-33%", "100%"] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </div>
      {text && <span className="text-xs text-slate-300 tracking-wider uppercase whitespace-nowrap">{text}</span>}
    </div>
  );
}
