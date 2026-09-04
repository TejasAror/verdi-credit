'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { Ripple } from '@/components/animations/Ripple';

/* -------------------------------------------------------------------------- */
/*  Button                                                                     */
/* -------------------------------------------------------------------------- */

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl text-sm font-semibold tracking-tight transition-all duration-300 ease-premium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet/70 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-accent-gradient text-white shadow-glow hover:shadow-[0_0_46px_-6px_rgba(155,107,255,0.75)] hover:-translate-y-0.5',
        secondary:
          'glass text-content hover:bg-white/[0.09] hover:border-white/20 hover:-translate-y-0.5',
        ghost:
          'text-content-muted hover:text-content hover:bg-white/[0.06]',
        danger:
          'bg-gradient-to-br from-rose-500/90 to-red-600/90 text-white shadow-[0_0_30px_-8px_rgba(244,63,94,0.7)] hover:-translate-y-0.5 hover:from-rose-500 hover:to-red-600',
        outline:
          'border border-white/15 text-content bg-white/[0.02] hover:bg-white/[0.07] hover:border-white/25',
      },
      size: {
        sm: 'px-3.5 py-2 text-xs',
        md: 'px-5 py-2.5',
        lg: 'px-6 py-3 text-[15px]',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  ripple?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ripple = true, children, onClick, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={onClick}
        {...props}
      >
        {ripple && <Ripple />}
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      </button>
    );
  },
);
Button.displayName = 'Button';

/* -------------------------------------------------------------------------- */
/*  Card / Glass                                                               */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        'glass rounded-3xl p-6',
        hover &&
          'transition-all duration-300 ease-premium hover:-translate-y-1 hover:border-white/20 hover:shadow-float',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** A panel that reveals an accent gradient glow on hover. */
export function GlowCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6 transition-all duration-500 ease-premium hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.05]',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute -inset-px rounded-3xl bg-accent-gradient-soft opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Input (floating label + animated focus)                                   */
/* -------------------------------------------------------------------------- */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Class applied to the outer wrapper (when you need to size/position the field). */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, id, wrapperClassName, ...props }, ref) => {
    const innerId = id ?? React.useId();
    const hasLabel = !!label && label.length > 0;
    return (
      <div className={cn('relative', wrapperClassName)}>
        <input
          ref={ref}
          id={innerId}
          placeholder={hasLabel ? ' ' : props.placeholder ?? ''}
          className={cn(
            'peer w-full rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-content outline-none transition-all duration-300',
            hasLabel
              ? 'px-4 pb-2 pt-6'
              : 'px-4 py-3',
            'hover:border-white/20 focus:border-accent-violet/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-accent-violet/15',
            className,
          )}
          {...props}
        />
        {hasLabel && (
          <label
            htmlFor={innerId}
            className="pointer-events-none absolute left-4 top-4 z-10 origin-left text-sm text-content-faint transition-all duration-300 peer-focus:-translate-y-2.5 peer-focus:scale-[0.78] peer-focus:text-accent-violet peer-[:not(:placeholder-shown)]:-translate-y-2.5 peer-[:not(:placeholder-shown)]:scale-[0.78]"
          >
            {label}
          </label>
        )}
        {hint && <p className="mt-1.5 text-xs text-content-faint">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, id, rows = 3, ...props }, ref) => {
    const innerId = id ?? React.useId();
    return (
      <div className="relative">
        <textarea
          ref={ref}
          id={innerId}
          placeholder=" "
          rows={rows}
          className={cn(
            'peer w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 pb-2 pt-6 text-sm text-content outline-none transition-all duration-300',
            'hover:border-white/20 focus:border-accent-violet/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-accent-violet/15',
            className,
          )}
          {...props}
        />
        {label && (
          <label
            htmlFor={innerId}
            className="pointer-events-none absolute left-4 top-4 z-10 origin-left text-sm text-content-faint transition-all duration-300 peer-focus:-translate-y-2.5 peer-focus:scale-[0.78] peer-focus:text-accent-violet peer-[:not(:placeholder-shown)]:-translate-y-2.5 peer-[:not(:placeholder-shown)]:scale-[0.78]"
          >
            {label}
          </label>
        )}
        {hint && <p className="mt-1.5 text-xs text-content-faint">{hint}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    const innerId = id ?? React.useId();
    return (
      <div className="relative">
        <select
          ref={ref}
          id={innerId}
          className={cn(
            'w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content outline-none transition-all duration-300',
            'hover:border-white/20 focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label && (
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">
            {label}
          </label>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';

/* -------------------------------------------------------------------------- */
/*  Badge                                                                      */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva('chip', {
  variants: {
    tone: {
      neutral: 'bg-white/[0.06] text-content-muted border border-white/10',
      blue: 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25',
      violet: 'bg-accent-violet/15 text-accent-violet border border-accent-violet/25',
      pink: 'bg-accent-pink/15 text-accent-pink border border-accent-pink/25',
      cyan: 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25',
      emerald: 'bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/25',
      amber: 'bg-accent-amber/15 text-accent-amber border border-accent-amber/25',
      rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
      slate: 'bg-slate-500/15 text-slate-300 border border-slate-500/25',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/*  Skeleton (shimmer)                                                        */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-white/[0.05]',
        className,
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat / MetricCard                                                          */
/* -------------------------------------------------------------------------- */

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
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-faint">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          accent ? 'text-gradient' : 'text-content',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  delta,
  tone = 'violet',
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: { value: string; positive?: boolean };
  tone?: 'violet' | 'blue' | 'pink' | 'emerald' | 'amber' | 'cyan';
  className?: string;
}) {
  const glow: Record<string, string> = {
    violet: 'from-accent-violet/25',
    blue: 'from-accent-blue/25',
    pink: 'from-accent-pink/25',
    emerald: 'from-accent-emerald/25',
    amber: 'from-accent-amber/25',
    cyan: 'from-accent-cyan/25',
  };
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 transition-all duration-500 ease-premium hover:-translate-y-1 hover:border-white/15',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
          glow[tone],
        )}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-content-faint">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-content tabular-nums">
            {value}
          </p>
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-content-muted">
            {icon}
          </div>
        )}
      </div>
      {delta && (
        <p
          className={cn(
            'relative mt-3 inline-flex items-center gap-1 text-xs font-semibold',
            delta.positive ? 'text-accent-emerald' : 'text-rose-300',
          )}
        >
          {delta.positive ? '▲' : '▼'} {delta.value}
        </p>
      )}
    </div>
  );
}
