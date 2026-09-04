'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Leaf, Coins, Store, Flame, Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { GlassNavbar } from '@/components/GlassNavbar';
import { Rise, riseItem, staggerContainer } from '@/components/design-system';

const STAGES = [
  { icon: <Leaf className="h-5 w-5" />, title: 'Project Registration', desc: 'Onboard carbon projects with validated geo-polygons & methodology.' },
  { icon: <Sparkles className="h-5 w-5" />, title: 'Evidence Upload', desc: 'Attach verifiable satellite & sensor evidence pinned to IPFS.' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: 'AI Verification', desc: 'Automated NDVI, anomaly & carbon estimation with confidence scoring.' },
  { icon: <Coins className="h-5 w-5" />, title: 'Credit Issuance', desc: 'Mint 1 on-chain credit per verified tonne of CO₂ via Solana.' },
  { icon: <Store className="h-5 w-5" />, title: 'Marketplace', desc: 'List, discover and trade verified credits with wallet-settled transfers.' },
  { icon: <Flame className="h-5 w-5" />, title: 'Retirement', desc: 'Permanently retire credits and mint immutable IPFS certificates.' },
];

const STATS = [
  { label: 'Tonnes verified', value: '1.2M+' },
  { label: 'Credits issued', value: '980K' },
  { label: 'Projects', value: '340' },
  { label: 'Retirements', value: '12.4K' },
];

export default function HomePage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-content px-4 pb-24 sm:px-6">
      <GlassNavbar />

      {/* Hero */}
      <section className="relative flex flex-col items-center pt-36 text-center">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="chip mb-6 border border-white/10 bg-white/[0.05] text-content-muted"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent-violet" /> Stage 7 · Public Transparency Explorer live
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-content sm:text-6xl md:text-7xl"
        >
          Trusted carbon credits,
          <span className="text-gradient"> verified on-chain.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 max-w-2xl text-lg text-content-muted"
        >
          VerdiCred eliminates fraud, double-counting, and greenwashing by linking real-world
          sequestration to traceable, immutable on-chain credits — from registration to retirement.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href="/login">
            <Button size="lg">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/explorer">
            <Button size="lg" variant="secondary">
              <Globe2 className="h-4 w-4 text-accent-cyan" /> Explore transparency
            </Button>
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {STATS.map((s) => (
            <motion.div
              key={s.label}
              variants={riseItem}
              className="glass rounded-2xl px-4 py-5"
            >
              <p className="text-2xl font-bold text-gradient">{s.value}</p>
              <p className="mt-1 text-xs text-content-faint">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Stages */}
      <section className="mt-28">
        <Rise>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-content">The full lifecycle</h2>
            <p className="mt-2 text-content-muted">
              Seven stages, one transparent pipeline — every step independently auditable.
            </p>
          </div>
        </Rise>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {STAGES.map((stage, i) => (
            <motion.div
              key={stage.title}
              variants={riseItem}
              className="group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6 transition-all duration-500 ease-premium hover:-translate-y-1.5 hover:border-white/15 hover:bg-white/[0.05]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent-gradient-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gradient">
                  {stage.icon}
                </div>
                <span className="text-xs font-semibold text-content-faint">STAGE {i + 1}</span>
              </div>
              <h3 className="relative mt-4 text-lg font-semibold text-content">{stage.title}</h3>
              <p className="relative mt-1.5 text-sm text-content-muted">{stage.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative mt-24 overflow-hidden rounded-4xl border border-white/10 bg-white/[0.03] p-10 text-center sm:p-16"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-gradient opacity-25 blur-3xl" />
        <h2 className="relative text-3xl font-bold text-content sm:text-4xl">
          Bring integrity to every credit
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-content-muted">
          Sign in to register projects, issue credits, trade on the marketplace, and retire with
          provable impact.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/developer">
            <Button size="lg">Developer Dashboard</Button>
          </Link>
          <Link href="/marketplace">
            <Button size="lg" variant="secondary">
              <Store className="h-4 w-4 text-accent-violet" /> Marketplace
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
