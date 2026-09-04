'use client';

/**
 * VerdiCred Design System — single import surface.
 *
 * Every Stage 1–7 page pulls its building blocks from here so the visual
 * language stays 100% consistent. Re-exports the canonical implementations and
 * aliases the requested component names (GlassCard, GlowButton, PremiumInput,
 * PremiumNavbar, PremiumTable, MetricCard, Timeline, Modal, Toast, Cursor,
 * FloatingLabelInput) onto them.
 */

// Layout / chrome
export { GlassNavbar as PremiumNavbar } from '@/components/GlassNavbar';
export { AmbientBackground } from '@/components/AmbientBackground';
export { AppShell } from '@/components/AppShell';
export { CustomCursor as Cursor } from '@/components/CustomCursor';

// Surfaces
export { Card as GlassCard, GlowCard, MetricCard, Stat, Skeleton, Badge } from '@/components/ui';
export { Modal, Timeline } from '@/components/design-system-primitives';

// Buttons
export { Button as GlowButton, Button } from '@/components/ui';

// Inputs
export { Input as PremiumInput, Input as FloatingLabelInput, Textarea, Select } from '@/components/ui';

// Data display
export {
  DataTable as PremiumTable,
  TableRow,
  Td,
  Th,
  PageHeader,
  SectionTitle,
  StatusBadge,
  EmptyState,
  KeyValue,
  DefinitionList,
  Stagger,
  Rise,
  Notice,
} from '@/components/parts';

// Motion
export {
  motion,
  PageTransition,
  pageVariants,
  staggerContainer,
  riseItem,
} from '@/components/animations/motion';

// Toast
export { ToastProvider, useToast } from '@/components/Toast';

// Helpers
export { cn } from '@/lib/cn';
export * from '@/lib/format';
