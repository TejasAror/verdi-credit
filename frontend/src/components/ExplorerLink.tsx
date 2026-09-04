'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { short, solanaTxLink as txLink } from '@/lib/format';

export { short, solanaTxLink } from '@/lib/format';

/** Uniform mono chip for ids. */
export function Mono({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('font-mono text-xs text-content-faint', className)}>{children}</span>;
}

/** A small labelled stat tile (glass). */
export function Stat({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('glass rounded-2xl px-4 py-3.5', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-faint">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', accent ? 'text-gradient' : 'text-content')}>
        {value}
      </div>
    </div>
  );
}

const STAGE_TONE: Record<string, string> = {
  PROJECT_REGISTERED: 'slate',
  EVIDENCE_UPLOADED: 'blue',
  AI_VERIFIED: 'emerald',
  CREDIT_ISSUED: 'violet',
  TRANSFERRED: 'amber',
  RETIRED: 'rose',
};

/** A lifecycle stage badge with stage-specific color. */
export function StageBadge({ stage }: { stage: string }) {
  const tone =
    STAGE_TONE[stage] ??
    (stage.includes('RETIRE')
      ? 'rose'
      : stage.includes('TRANSFER')
        ? 'amber'
        : stage.includes('ISSUE')
          ? 'violet'
          : stage.includes('VERIF')
            ? 'emerald'
            : stage.includes('EVIDENCE') || stage.includes('UPLOAD')
              ? 'blue'
              : 'slate');
  const toneClass: Record<string, string> = {
    slate: 'bg-white/[0.06] text-content-muted border-white/10',
    blue: 'bg-accent-blue/15 text-accent-blue border-accent-blue/25',
    emerald: 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/25',
    violet: 'bg-accent-violet/15 text-accent-violet border-accent-violet/25',
    amber: 'bg-accent-amber/15 text-accent-amber border-accent-amber/25',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  };
  return (
    <span className={cn('chip border', toneClass[tone])}>{stage.replace(/_/g, ' ')}</span>
  );
}

export function ExplorerNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm font-medium text-accent-pink transition-colors hover:text-accent-pink/80">
      {label}
    </Link>
  );
}
