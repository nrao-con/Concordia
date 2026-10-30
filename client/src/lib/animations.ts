import type { Variants, Transition } from "framer-motion";

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const springBounce: Transition = {
  type: "spring",
  stiffness: 100,
  damping: 15,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
};

export const tactileSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 20,
};

export const buttonTap = {
  scale: 0.97,
  transition: { type: "spring", stiffness: 300, damping: 20 } as Transition,
};

export const buttonHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 400, damping: 25 } as Transition,
};

export const cardEntranceVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 24 },
  },
};

export const staggerGrid: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

export const heroStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

export const countUp = (end: number, duration: number = 2) => ({
  initial: { count: 0 },
  animate: {
    count: end,
    transition: { duration, ease: "easeOut" },
  },
});

export const floatingAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 4,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

export const pulseGlow = {
  boxShadow: [
    "0 0 0 0 hsl(var(--primary) / 0)",
    "0 0 10px 2px hsl(var(--primary) / 0.12)",
    "0 0 0 0 hsl(var(--primary) / 0)",
  ],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

export const wiggle = {
  rotate: [0, -10, 10, -5, 5, 0],
  transition: {
    duration: 0.5,
    ease: "easeInOut",
  },
};

const DISMANTLE_EASE = [0.4, 0, 0.6, 1] as const;
const DISMANTLE_DURATION = 0.45;

const CARD_ENTRY_DIRECTIONS = [
  { x: -28, y: 18, rotate: -2.5 },
  { x: 28, y: 18, rotate: 2.5 },
  { x: -20, y: 30, rotate: -1.5 },
  { x: 20, y: 30, rotate: 1.5 },
];

const CARD_EXIT_DIRECTIONS = [
  { x: -180, y: -60, rotate: -14 },
  { x: 180, y: -80, rotate: 14 },
  { x: -100, y: 120, rotate: -10 },
  { x: 100, y: 100, rotate: 10 },
];

export function dismantlingCardEntrance(index: number): Variants {
  const entry = CARD_ENTRY_DIRECTIONS[index % CARD_ENTRY_DIRECTIONS.length];
  return {
    hidden: {
      opacity: 0,
      x: entry.x,
      y: entry.y,
      rotate: entry.rotate,
      scale: 0.88,
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 220,
        damping: 22,
        mass: 0.8,
      },
    },
    exit: {
      opacity: 0,
      x: CARD_EXIT_DIRECTIONS[index % CARD_EXIT_DIRECTIONS.length].x,
      y: CARD_EXIT_DIRECTIONS[index % CARD_EXIT_DIRECTIONS.length].y,
      rotate: CARD_EXIT_DIRECTIONS[index % CARD_EXIT_DIRECTIONS.length].rotate,
      scale: 0.7,
      transition: {
        duration: DISMANTLE_DURATION,
        ease: DISMANTLE_EASE,
        delay: index * 0.04,
      },
    },
  };
}

export const dismantlingStaggerGrid: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

export const overlayContentSpring: Transition = {
  type: "spring",
  stiffness: 350,
  damping: 26,
  mass: 0.8,
};

export const toastEntranceSpring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

export const successEntrance: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const successIconSpring: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 15,
};

export const stepSlide: Variants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export const stepSlideTransition: Transition = {
  duration: 0.25,
};

export const loadingOverlaySpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 25,
};

export const dismantlingSectionEntrance: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    x: -60,
    y: -40,
    rotate: -6,
    transition: {
      duration: DISMANTLE_DURATION,
      ease: DISMANTLE_EASE,
    },
  },
};

export const bouncyBubbleSpring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 15,
};

export const bubbleEntrance: Variants = {
  hidden: { scale: 0.8, y: 20 },
  visible: {
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 15,
    },
  },
};

export const bubbleStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};
