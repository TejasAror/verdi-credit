'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/* -------------------------------------------------------------------------- */
/*  Timeline — vertical interactive timeline (used for lifecycle on Stage 7)   */
/* -------------------------------------------------------------------------- */

export interface TimelineEvent {
  stage?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  timestamp?: React.ReactNode;
  link?: { href: string; label: string } | null;
  icon?: React.ReactNode;
}

export function Timeline({
  events,
  empty,
}: {
  events: TimelineEvent[];
  empty?: React.ReactNode;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-content-faint">{empty ?? 'No events yet.'}</p>;
  }
  return (
    <ol className="relative space-y-6 border-l border-white/10 pl-6">
      {events.map((ev, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: i * 0.05 }}
          className="relative"
        >
          <span className="absolute -left-[1.95rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-ink-900 bg-accent-gradient shadow-glow" />
          <span className="absolute -left-[1.95rem] top-1 h-4 w-4 animate-ping-soft rounded-full bg-accent-violet/60" />
          <div className="flex flex-wrap items-center gap-2">
            {ev.stage && <span className="chip border border-white/10 bg-white/[0.05] text-content-muted">{ev.stage.replace(/_/g, ' ')}</span>}
            <span className="text-sm font-semibold text-content">{ev.title}</span>
          </div>
          {ev.description && <p className="mt-1 text-sm text-content-muted">{ev.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-content-faint">
            {ev.timestamp && <span>{ev.timestamp}</span>}
            {ev.link && (
              <a
                href={ev.link.href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent-pink transition-colors hover:text-accent-pink/80"
              >
                {ev.link.label} ↗
              </a>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal — premium glass modal with backdrop blur + spring transition          */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'glass-strong relative w-full rounded-4xl p-7 shadow-float',
              sizeClass,
            )}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-content-faint transition-colors hover:bg-white/10 hover:text-content"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {title && <h3 className="text-lg font-semibold text-content">{title}</h3>}
            {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
            {children && <div className="mt-5">{children}</div>}
            {footer && <div className="mt-6 flex gap-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
