'use client';

import { motion, type Variants } from 'framer-motion';

/** Page-level transition wrapper (fade + rise). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 16, filter: 'blur(6px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  exit: { opacity: 0, y: -12, filter: 'blur(6px)', transition: { duration: 0.3 } },
};

/** Container that staggers its direct children. */
export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

/** Item that rises into view; pair with staggerContainer. */
export const riseItem: Variants = {
  initial: { opacity: 0, y: 18 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  );
}

export { motion };
