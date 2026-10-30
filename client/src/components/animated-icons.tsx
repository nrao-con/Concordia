import { motion, useReducedMotion } from "framer-motion";
import { useState, useEffect, type ComponentType } from "react";

interface AnimatedTruckProps {
  className?: string;
  driveAway?: boolean;
  onDriveComplete?: () => void;
}

export function AnimatedTruck({ className = "h-4 w-4 text-primary", driveAway = false, onDriveComplete }: AnimatedTruckProps) {
  useEffect(() => {
    if (driveAway) onDriveComplete?.();
  }, [driveAway, onDriveComplete]);

  return (
    <span className="inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </svg>
    </span>
  );
}

interface AnimatedSearchProps {
  className?: string;
  isFocused?: boolean;
}

export function AnimatedSearch({ className = "h-5 w-5 text-slate-400" }: AnimatedSearchProps) {
  return (
    <span className="inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </span>
  );
}

interface AnimatedPenProps {
  className?: string;
}

export function AnimatedPen({ className = "h-5 w-5 text-primary" }: AnimatedPenProps) {
  return (
    <span className="inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </span>
  );
}

interface PillCheckMorphProps {
  isAvailable: boolean;
  className?: string;
}

export function PillCheckMorph({ isAvailable, className = "h-3 w-3" }: PillCheckMorphProps) {
  const shouldReduceMotion = useReducedMotion();
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (isAvailable && !shouldReduceMotion) {
      const t = setTimeout(() => setShowCheck(true), 80);
      return () => clearTimeout(t);
    }
    setShowCheck(isAvailable);
  }, [isAvailable, shouldReduceMotion]);

  if (shouldReduceMotion) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {isAvailable ? (
          <polyline points="4 12 9.5 17.5 20 6" />
        ) : (
          <rect x="8" y="2" width="8" height="20" rx="4" />
        )}
      </svg>
    );
  }

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      initial={isAvailable ? { scale: 0.4, opacity: 0, rotate: -10 } : false}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.6, 1] }}
    >
      {showCheck ? (
        <>
          <motion.line
            x1="4" y1="12" x2="9.5" y2="17.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.6, 1] }}
          />
          <motion.line
            x1="9.5" y1="17.5" x2="20" y2="6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.22, delay: 0.15, ease: [0.4, 0, 0.6, 1] }}
          />
        </>
      ) : (
        <motion.rect
          x="8" y="2" width="8" height="20" rx="4"
          initial={{ pathLength: 1 }}
          animate={
            isAvailable
              ? { pathLength: 0, opacity: 0, scale: 0.4 }
              : { pathLength: 1, opacity: 1 }
          }
          transition={{ duration: 0.22, ease: [0.4, 0, 0.6, 1] }}
        />
      )}
    </motion.svg>
  );
}

interface HeartbeatPulseProps {
  className?: string;
  IconComponent?: ComponentType<{ className?: string }>;
}

export function HeartbeatPulse({ className = "h-1.5 w-1.5", IconComponent }: HeartbeatPulseProps) {
  if (IconComponent) {
    return (
      <span className="inline-flex">
        <IconComponent className={className} />
      </span>
    );
  }

  return <span className={`rounded-full bg-emerald-400 ${className}`} />;
}
