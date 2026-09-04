'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { riseItem, staggerContainer } from '@/components/animations/motion';

/* -------------------------------------------------------------------------- */
/*  PageHeader                                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  badge,
  title,
  subtitle,
  icon,
  actions,
}: {
  badge?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gradient shadow-glow">
            {icon}
          </div>
        )}
        <div>
          {badge && (
            <span className="chip mb-2 border border-white/10 bg-white/[0.05] text-content-faint">
              {badge}
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-content-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionTitle                                                               */
/* -------------------------------------------------------------------------- */

export function SectionTitle({ title, hint }: { title: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-content">{title}</h2>
      {hint && <span className="text-sm text-content-faint">{hint}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StatusBadge — project / listing / retirement statuses                     */
/* -------------------------------------------------------------------------- */

const STATUS_TONE: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  DRAFT: 'slate',
  PENDING_VERIFICATION: 'amber',
  VERIFIED: 'emerald',
  REJECTED: 'rose',
  RETIRED: 'slate',
  ACTIVE: 'emerald',
  SOLD: 'slate',
  CANCELLED: 'amber',
  CONFIRMED: 'cyan',
  CERTIFIED: 'emerald',
  PENDING: 'amber',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-content-faint">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-content">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KeyValue row (for detail-style definitions)                               */
/* -------------------------------------------------------------------------- */

export function KeyValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sm text-content-faint">{label}</span>
      <span
        className={cn(
          'text-right text-sm text-content',
          mono && 'break-all font-mono text-xs text-content-muted',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DefinitionList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-white/[0.06]">{children}</dl>;
}

/* -------------------------------------------------------------------------- */
/*  DataTable — glass table with sticky header                                */
/* -------------------------------------------------------------------------- */

export function DataTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02]', className)}>
      <div className="max-h-[70vh] overflow-auto scrollbar-premium">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-ink-800/90 backdrop-blur-xl">
            <tr className="text-left text-[11px] uppercase tracking-wide text-content-faint">
              {head.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function TableRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.tr
      variants={riseItem}
      className={cn('transition-colors duration-200 hover:bg-white/[0.04]', className)}
    >
      {children}
    </motion.tr>
  );
}

export function Td({ children, className, colSpan, rowSpan }: { children: React.ReactNode; className?: string; colSpan?: number; rowSpan?: number }) {
  return (
    <td colSpan={colSpan} rowSpan={rowSpan} className={cn('px-4 py-3 align-middle text-content-muted', className)}>
      {children}
    </td>
  );
}

export function Th({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <th colSpan={colSpan} className={cn('px-4 py-3 text-left text-[11px] uppercase tracking-wide text-content-faint', className)}>
      {children}
    </th>
  );
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className={className}>
      {children}
    </motion.div>
  );
}

export function Rise({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={riseItem} className={className}>
      {children}
    </motion.div>
  );
}

export function Notice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const map = {
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    success: 'border-accent-emerald/30 bg-accent-emerald/10 text-accent-emerald',
    warning: 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber',
  } as const;
  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm', map[tone])}>{children}</div>
  );
}
