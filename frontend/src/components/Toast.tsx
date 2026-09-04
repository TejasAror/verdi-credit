'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastCtx = React.createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-accent-emerald" />,
  error: <XCircle className="h-5 w-5 text-rose-400" />,
  warning: <AlertTriangle className="h-5 w-5 text-accent-amber" />,
  info: <Info className="h-5 w-5 text-accent-blue" />,
};

const ACCENT: Record<ToastTone, string> = {
  success: 'from-accent-emerald/30',
  error: 'from-rose-500/30',
  warning: 'from-accent-amber/30',
  info: 'from-accent-blue/30',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const remove = React.useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = React.useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => remove(id), 4800);
    },
    [remove],
  );

  const api: ToastContextValue = React.useMemo(
    () => ({
      toast: push,
      success: (title, description) => push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error' }),
      warning: (title, description) => push({ title, description, tone: 'warning' }),
      info: (title, description) => push({ title, description, tone: 'info' }),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-[min(92vw,360px)] flex-col gap-3">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto relative overflow-hidden rounded-2xl border border-white/10 bg-ink-800/80 p-4 shadow-float backdrop-blur-xl"
            >
              <div
                className={cn(
                  'pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-2xl',
                  ACCENT[t.tone],
                )}
              />
              <div className="relative flex items-start gap-3">
                <div className="mt-0.5">{ICONS[t.tone]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-content">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{t.description}</p>
                  )}
                </div>
                <button
                  onClick={() => remove(t.id)}
                  className="rounded-lg p-1 text-content-faint transition-colors hover:bg-white/10 hover:text-content"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
