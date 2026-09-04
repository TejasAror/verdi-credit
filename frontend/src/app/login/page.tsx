'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Leaf, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { GlassNavbar } from '@/components/GlassNavbar';

export default function LoginPage() {
  const { signIn, signUp, session, loading, profile } = useAuth();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session && profile?.role) {
      router.push('/developer');
    }
  }, [loading, session, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        success('Welcome back', 'Signing you in…');
      } else {
        await signUp(email, password);
        success('Account created', 'Check your inbox to confirm your email.');
      }
      router.push('/developer');
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed.');
      toastError('Authentication failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-content px-4 sm:px-6">
      <GlassNavbar />
      <div className="grid min-h-screen grid-cols-1 items-center gap-10 pt-28 lg:grid-cols-2">
        {/* Left: brand pitch */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:block"
        >
          <Link href="/" className="mb-10 inline-flex items-center gap-1.5 text-sm text-content-faint transition-colors hover:text-content">
            <ArrowLeft className="h-4 w-4" /> Back to VerdiCred
          </Link>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-content">
            Carbon markets,
            <br />
            <span className="text-gradient">finally trustworthy.</span>
          </h1>
          <p className="mt-5 max-w-md text-content-muted">
            VerdiCred links real-world sequestration to immutable on-chain credits. Sign in to
            register projects, issue credits, and prove impact.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { icon: <Leaf className="h-5 w-5" />, t: 'AI-verified evidence', d: 'NDVI, anomalies & carbon estimation.' },
              { icon: <CoinsIcon />, t: '1:1 on-chain credits', d: 'One credit per verified tonne of CO₂.' },
              { icon: <ShieldCheck className="h-5 w-5" />, t: 'Provable retirement', d: 'Immutable IPFS certificates.' },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gradient">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-content">{f.t}</p>
                  <p className="text-sm text-content-faint">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: auth card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-full max-w-md"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent-gradient opacity-30 blur-3xl" />
          <div className="glass relative rounded-4xl p-8 shadow-float">
            <div className="mb-6 flex items-center justify-center lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-gradient text-xl font-black text-white shadow-glow">
                V
              </div>
            </div>
            <h1 className="text-2xl font-bold text-content">
              {mode === 'signin' ? 'Sign in' : 'Create your account'}
            </h1>
            <p className="mt-1.5 text-sm text-content-muted">
              {mode === 'signin'
                ? 'Access your VerdiCred workspace.'
                : 'New accounts default to the BUYER role; an admin promotes you to DEVELOPER.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Input
                label="Password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {error && (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} size="lg" className="w-full">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Please wait…
                  </>
                ) : mode === 'signin' ? (
                  'Sign in'
                ) : (
                  'Sign up'
                )}
              </Button>
            </form>

            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="mt-5 w-full text-center text-sm text-content-faint transition-colors hover:text-content"
            >
              {mode === 'signin' ? (
                <>
                  Need an account? <span className="font-semibold text-accent-pink">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="font-semibold text-accent-pink">Sign in</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function CoinsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="8" r="5" />
      <path d="M14.5 9a5 5 0 1 0 0 10" />
      <path d="M8 13c1.5 0 3-2 3-5s-1.5-5-3-5" opacity="0.5" />
    </svg>
  );
}
