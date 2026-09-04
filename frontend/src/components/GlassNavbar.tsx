'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Leaf,
  Coins,
  Store,
  Flame,
  Globe2,
  Shield,
  LogOut,
  User2,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { cn } from '@/lib/cn';
import { short } from '@/lib/format';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  auth?: boolean;
  roles?: string[];
}

const NAV: NavItem[] = [
  { href: '/developer', label: 'Projects', icon: <LayoutDashboard className="h-4 w-4" />, auth: true, roles: ['DEVELOPER', 'ADMIN'] },
  { href: '/carbon-credits', label: 'Credits', icon: <Coins className="h-4 w-4" />, auth: true, roles: ['AUDITOR', 'ADMIN'] },
  { href: '/marketplace', label: 'Marketplace', icon: <Store className="h-4 w-4" />, auth: true },
  { href: '/retire-credits', label: 'Retire', icon: <Flame className="h-4 w-4" />, auth: true },
  { href: '/retirement-history', label: 'History', icon: <Leaf className="h-4 w-4" />, auth: true },
  { href: '/explorer', label: 'Explorer', icon: <Globe2 className="h-4 w-4" /> },
  { href: '/admin', label: 'Admin', icon: <Shield className="h-4 w-4" />, auth: true, roles: ['ADMIN'] },
];

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-gradient shadow-glow transition-transform duration-300 group-hover:scale-105">
        <span className="text-lg font-black text-white">V</span>
        <span className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
      <span className="text-[15px] font-bold tracking-tight text-content">
        Verdi<span className="text-gradient">Cred</span>
      </span>
    </Link>
  );
}

function WalletPill() {
  const { address, connected, connecting, connect, disconnect } = useWallet();
  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={address}
          className="hidden items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1.5 font-mono text-[11px] text-accent-cyan sm:inline-flex"
        >
          <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-accent-cyan" />
          {short(address)}
        </span>
        <button
          onClick={() => disconnect()}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-content-muted transition-colors hover:border-white/20 hover:text-content"
        >
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => connect().catch(() => undefined)}
      disabled={connecting}
      className="rounded-full bg-accent-gradient px-4 py-1.5 text-xs font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60"
    >
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}

export function GlassNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);

  const visible = NAV.filter((item) => {
    if (!item.auth) return true;
    if (!session) return false;
    if (item.roles && profile && !item.roles.includes(profile.role)) return false;
    return true;
  });

  // avoid highlighting admin when not an admin etc.
  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'));

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav className="glass flex w-full max-w-content items-center justify-between gap-4 rounded-full px-4 py-2.5 shadow-float">
          <Logo />

          {/* Desktop pills */}
          <div className="relative hidden items-center gap-1 lg:flex">
            {visible.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-300',
                    active ? 'text-content' : 'text-content-faint hover:text-content',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/[0.08]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className={cn(active && 'text-gradient')}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5">
            <WalletPill />
            {session && profile ? (
              <div className="relative">
                <button
                  onClick={() => setUserOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 transition-colors hover:border-white/20"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-gradient text-xs font-bold text-white">
                    {(profile.fullName || profile.email || 'U').charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden text-xs font-medium text-content sm:block">
                    {profile.role}
                  </span>
                </button>
                {userOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-white/10 bg-ink-800/90 p-2 shadow-float backdrop-blur-xl"
                  >
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold text-content">
                        {profile.fullName || profile.email}
                      </p>
                      <p className="text-xs text-content-faint">{profile.email}</p>
                    </div>
                    <div className="my-1 h-px bg-white/10" />
                    <Link
                      href="/developer"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-content-muted transition-colors hover:bg-white/[0.06] hover:text-content"
                    >
                      <User2 className="h-4 w-4" /> Dashboard
                    </Link>
                    <button
                      onClick={() => {
                        setUserOpen(false);
                        signOut().then(() => router.push('/'));
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </motion.div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-content transition-colors hover:border-white/20"
              >
                Sign in
              </Link>
            )}

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-content lg:hidden"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile sheet */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="glass mx-4 mt-24 space-y-1 rounded-3xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-white/[0.08] text-content'
                    : 'text-content-muted hover:bg-white/[0.04] hover:text-content',
                )}
              >
                {item.icon}
                {item.label}
                <ChevronRight className="ml-auto h-4 w-4 opacity-40" />
              </Link>
            ))}
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
