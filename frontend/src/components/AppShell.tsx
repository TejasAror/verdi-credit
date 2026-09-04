'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { pageVariants } from '@/components/animations/motion';
import { GlassNavbar } from '@/components/GlassNavbar';

/**
 * AppShell — wraps authenticated/primary pages with the floating navbar and a
 * consistent centered, max-w-content layout with generous top padding so the
 * fixed navbar never overlaps content.
 */
export function AppShell({
  children,
  max = 'content',
}: {
  children: ReactNode;
  max?: 'content' | '5xl' | '3xl' | '6xl' | '4xl';
}) {
  const maxClass =
    max === 'content'
      ? 'max-w-content'
      : max === '4xl'
        ? 'max-w-4xl'
        : max === '5xl'
          ? 'max-w-5xl'
          : max === '3xl'
            ? 'max-w-3xl'
            : 'max-w-6xl';

  return (
    <>
      <GlassNavbar />
      <motion.main
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className={`mx-auto w-full ${maxClass} px-4 pb-24 pt-28 sm:px-6`}
      >
        {children}
      </motion.main>
    </>
  );
}
