import type { Transition, Variants } from "motion/react";

export const IMPACT_EASE = [0.22, 1, 0.36, 1] as const;

const itemTransition: Transition = {
  duration: 0.56,
  ease: IMPACT_EASE,
};

export const impactPageVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: IMPACT_EASE,
      when: "beforeChildren",
      staggerChildren: 0.11,
      delayChildren: 0.04,
    },
  },
};

export const impactSectionVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.03,
    },
  },
};

export const impactItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.975,
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: itemTransition,
  },
};

export const impactHeroVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -30,
    y: 20,
  },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: itemTransition,
  },
};

export const impactPanelVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 30,
    y: 20,
  },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: itemTransition,
  },
};
