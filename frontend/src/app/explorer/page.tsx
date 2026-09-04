'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  getExplorerStatus,
  listExplorerCredits,
  listExplorerProjects,
  explorerSearchPost,
} from '@/lib/api';
import { IndexerStatus, CreditSnapshot, ProjectSnapshot, ExplorerSearchResult } from '@/lib/types';
import {
  PremiumInput,
  Stat,
  Badge,
  GlassCard,
  Notice,
  EmptyState,
  Stagger,
  Rise,
  riseItem,
  pageVariants,
} from '@/components/design-system';
import { Globe2, Search, Loader2, Activity, Coins, Layers, Boxes } from 'lucide-react';
import { short } from '@/lib/format';

export default function ExplorerPage() {
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditSnapshot[]>([]);
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ExplorerSearchResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, p] = await Promise.all([
        getExplorerStatus().catch((e) => {
          setStatusErr(e?.message ?? 'Explorer status unavailable.');
          return null;
        }),
        listExplorerCredits({ limit: 12, sortBy: 'updatedAt', order: 'desc' }),
        listExplorerProjects({ limit: 12, sortBy: 'updatedAt', order: 'desc' }),
      ]);
      setStatus(s);
      setCredits(c.items);
      setProjects(p.items);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load explorer data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      setSearching(true);
      setError(null);
      setSearchResult(null);
      try {
        const res = await explorerSearchPost(q);
        setSearchResult(res);
      } catch (e: any) {
        setError(e?.message ?? 'Search failed.');
      } finally {
        setSearching(false);
      }
    },
    [query],
  );

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto w-full max-w-content px-4 pb-24 pt-28 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gradient shadow-glow">
            <Globe2 className="h-6 w-6" />
          </div>
          <div>
            <span className="chip mb-1 border border-white/10 bg-white/[0.05] text-content-faint">
              Stage 7 · Public Transparency Explorer
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-content">Transparency Explorer</h1>
            <p className="mt-1 text-sm text-content-muted">
              Verify the full lifecycle of any credit or project — registration through on-chain
              issuance, transfer, and retirement. No login required.
            </p>
          </div>
        </div>
        {status && (
          <span className={`chip border ${status.running ? 'border-accent-emerald/30 bg-accent-emerald/10 text-accent-emerald' : 'border-white/10 bg-white/[0.05] text-content-muted'}`}>
            <Activity className="h-3.5 w-3.5" /> Indexer {status.running ? 'live' : status.enabled ? 'idle' : 'disabled'} · {status.cluster}
          </span>
        )}
      </motion.div>

      {statusErr && (
        <div className="mb-5">
          <Notice tone="warning">{statusErr}</Notice>
        </div>
      )}

      <motion.form onSubmit={handleSearch} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass mb-8 flex gap-2 rounded-3xl p-3 shadow-float">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
          <PremiumInput
            wrapperClassName="w-full"
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by credit mint (base58) or project id (uuid)…"
            label=""
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="shrink-0 rounded-2xl bg-accent-gradient px-6 py-3 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 disabled:opacity-60"
        >
          {searching ? <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Searching…</> : 'Search'}
        </button>
      </motion.form>

      {searchResult && searchResult.kind === 'CREDIT' && searchResult.credit?.found && (
        <div className="mb-8 rounded-2xl border border-accent-violet/30 bg-accent-violet/10 px-4 py-3 text-sm text-content">
          Resolved to a credit:{' '}
          <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/credits/${searchResult.credit.credit!.creditId}`}>
            {short(searchResult.credit.credit!.creditId, 10)}
          </Link>
        </div>
      )}
      {searchResult && searchResult.kind === 'PROJECT' && searchResult.project?.found && (
        <div className="mb-8 rounded-2xl border border-accent-violet/30 bg-accent-violet/10 px-4 py-3 text-sm text-content">
          Resolved to a project:{' '}
          <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/projects/${searchResult.project.project!.projectId}`}>
            {short(searchResult.project.project!.projectId, 10)}
          </Link>
        </div>
      )}
      {searchResult && searchResult.kind === 'NONE' && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content-muted">
          No credit or project found for “{searchResult.query}”.
        </div>
      )}

      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {status && (
        <Stagger className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: <Coins className="h-4 w-4" />, label: 'Credits', value: status.creditCount },
            { icon: <Boxes className="h-4 w-4" />, label: 'Projects', value: status.projectCount },
            { icon: <Activity className="h-4 w-4" />, label: 'Events indexed', value: status.eventsIndexed },
            { icon: <Layers className="h-4 w-4" />, label: 'Txs processed', value: status.txsProcessed },
          ].map((s) => (
            <motion.div key={s.label} variants={riseItem}>
              <Stat label={s.label} value={s.value} />
            </motion.div>
          ))}
        </Stagger>
      )}

      <section className="mb-10">
        <Rise>
          <h2 className="mb-3 text-lg font-semibold text-content">Recent credits</h2>
        </Rise>
        {loading ? (
          <p className="text-sm text-content-faint">Loading…</p>
        ) : credits.length === 0 ? (
          <p className="text-sm text-content-faint">No credits indexed yet.</p>
        ) : (
          <GlassCard className="!p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-content-faint">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 font-semibold">Credit (mint)</th>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 text-right font-semibold">Minted</th>
                    <th className="px-4 py-3 text-right font-semibold">Retired</th>
                    <th className="px-4 py-3 text-right font-semibold">Circulating</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {credits.map((c) => (
                    <tr key={c.creditId} className="transition-colors hover:bg-white/[0.04]">
                      <td className="px-4 py-3">
                        <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/credits/${c.creditId}`}>
                          {short(c.creditId, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-content-muted">{c.projectName ?? short(c.projectId, 8) ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-content-muted">{c.totalMinted}</td>
                      <td className="px-4 py-3 text-right text-content-muted">{c.totalRetired}</td>
                      <td className="px-4 py-3 text-right text-content-muted">{c.circulatingSupply}</td>
                      <td className="px-4 py-3">
                        {c.fullyRetired ? (
                          <Badge tone="rose">FULLY RETIRED</Badge>
                        ) : (
                          <Badge tone="emerald">{c.reportStatus ?? 'ACTIVE'}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </section>

      <section>
        <Rise>
          <h2 className="mb-3 text-lg font-semibold text-content">Recent projects</h2>
        </Rise>
        {loading ? (
          <p className="text-sm text-content-faint">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-content-faint">No projects indexed yet.</p>
        ) : (
          <Stagger className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <motion.div key={p.projectId} variants={riseItem}>
                <Link
                  href={`/explorer/projects/${p.projectId}`}
                  className="group block rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 transition-all hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-content group-hover:text-gradient">{p.projectName ?? short(p.projectId, 8)}</span>
                    {p.status && <Badge tone="slate">{p.status}</Badge>}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-content-faint">
                    <span>Minted: <span className="font-semibold text-content-muted">{p.totalMinted}</span></span>
                    <span>Retired: <span className="font-semibold text-content-muted">{p.totalRetired}</span></span>
                    <span>Credits: <span className="font-semibold text-content-muted">{p.creditIds.length}</span></span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-content-faint">{short(p.projectId, 12)}</div>
                </Link>
              </motion.div>
            ))}
          </Stagger>
        )}
      </section>
    </motion.main>
  );
}
