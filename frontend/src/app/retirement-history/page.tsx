'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { listRetirements, viewRetirementCertificatePdf } from '@/lib/api';
import { Retirement, RetirementReasonCategory, RetirementStatus } from '@/lib/types';
import WalletButton from '@/components/WalletButton';
import {
  PremiumInput,
  Badge,
  GlowButton,
  KeyValue,
  DefinitionList,
  Notice,
  EmptyState,
  AppShell,
  PageHeader,
  Stagger,
  Rise,
  riseItem,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import { Flame, Search, Loader2, FileText } from 'lucide-react';
import { short, formatNumber, formatDateTime } from '@/lib/format';

const REASON_FILTERS: ('ALL' | RetirementReasonCategory)[] = [
  'ALL', 'NET_ZERO', 'CORPORATE_ESG', 'CARBON_OFFSET', 'COMPLIANCE', 'CUSTOM',
];
const STATUS_FILTERS: ('ALL' | RetirementStatus)[] = ['ALL', 'CONFIRMED', 'CERTIFIED', 'PENDING'];

export default function RetirementHistoryPage() {
  const { session, profile, token, loading } = useAuth();
  const [items, setItems] = useState<Retirement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [reasonCategory, setReasonCategory] = useState<'ALL' | RetirementReasonCategory>('ALL');
  const [status, setStatus] = useState<'ALL' | RetirementStatus>('ALL');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, reasonCategory, status]);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await listRetirements(token, {
        page,
        limit,
        search: debouncedSearch || undefined,
        reasonCategory: reasonCategory !== 'ALL' ? reasonCategory : undefined,
        status: status !== 'ALL' ? status : undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load retirement history.');
    } finally {
      setBusy(false);
    }
  }, [token, page, limit, debouncedSearch, reasonCategory, status]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  const isAdmin = profile?.role === 'ADMIN';

  if (loading) {
    return (
      <AppShell>
        <div className="glass animate-pulse rounded-3xl p-10 text-content-faint">Loading…</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell max="3xl">
        <EmptyState icon={<Flame className="h-6 w-6" />} title="Sign in required" description="Please sign in to view retirement history." />
      </AppShell>
    );
  }

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="Stage 6 · Retirement History"
        title="Retirement History"
        subtitle={`Every credit retirement you${isAdmin ? ' and all users' : ''} have made.`}
        icon={<Flame className="h-6 w-6" />}
        actions={<WalletButton />}
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}

      <Rise>
        <section className="glass mb-6 space-y-4 rounded-3xl p-5 shadow-float">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
              <PremiumInput
                wrapperClassName="w-full"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by reason, project, wallet, tx, or certificate id…"
                label=""
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((s) => (
                <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                  {s === 'ALL' ? 'All statuses' : s}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {REASON_FILTERS.map((r) => (
              <FilterChip key={r} active={reasonCategory === r} onClick={() => setReasonCategory(r)}>
                {r === 'ALL' ? 'All reasons' : r.replace('_', ' ')}
              </FilterChip>
            ))}
          </div>
        </section>
      </Rise>

      {busy ? (
        <p className="flex items-center gap-2 text-content-faint"><Loader2 className="h-4 w-4 animate-spin" /> Loading retirements…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Flame className="h-6 w-6" />}
          title="No retirements found"
          description="Try adjusting your filters or search."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-content-faint">
            {total} retirement{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </p>
          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <RetirementCard key={r.id} r={r} token={token} />
            ))}
          </Stagger>

          <div className="mt-8 flex items-center justify-center gap-2">
            <GlowButton variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </GlowButton>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center gap-2">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-content-faint">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
                      p === page ? 'bg-accent-gradient text-white shadow-glow' : 'border border-white/10 bg-white/[0.04] text-content-muted hover:bg-white/[0.08]'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <GlowButton variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </GlowButton>
          </div>
        </>
      )}
    </AppShell>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-accent-gradient text-white shadow-glow' : 'border border-white/10 bg-white/[0.04] text-content-muted hover:bg-white/[0.08]'
      }`}
    >
      {children}
    </button>
  );
}

function RetirementCard({ r, token }: { r: Retirement; token: string | null }) {
  const { toast } = useToast();
  const cidUrl = r.certificateCid ? `https://ipfs.io/ipfs/${r.certificateCid}` : null;
  const [pdfBusy, setPdfBusy] = useState(false);
  const statusTone = r.status === 'CERTIFIED' ? 'emerald' : r.status === 'CONFIRMED' ? 'cyan' : 'amber';

  const openPdf = async () => {
    if (!token) {
      toast({ title: 'Authentication required', description: 'Please sign in to view your certificate.', tone: 'error' });
      return;
    }
    setPdfBusy(true);
    try {
      await viewRetirementCertificatePdf(token, r.id, r.certificateId ?? r.retirementId);
    } catch (e) {
      toast({ title: 'Unable to open certificate', description: (e as Error).message, tone: 'error' });
    } finally {
      setPdfBusy(false);
    }
  };
  return (
    <motion.div variants={riseItem}>
      <div className="flex h-full flex-col rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-glass transition-all duration-500 ease-premium hover:-translate-y-1.5 hover:border-white/15 hover:bg-white/[0.05]">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-content">{r.projectName ?? 'Carbon Credit'}</p>
            <p className="text-xs text-content-faint">{r.certificateId ?? short(r.retirementId, 8)}</p>
          </div>
          <Badge tone={statusTone as any}>{r.status}</Badge>
        </div>

        <DefinitionList>
          <KeyValue label="Retired" value={`${formatNumber(r.retiredAmount)} tCO₂e`} />
          <KeyValue label="Reason" value={`${r.reason} (${r.reasonCategory})`} />
          <KeyValue label="Vintage" value={`${r.vintage ?? '—'}`} />
          <KeyValue label="Methodology" value={r.methodology ?? '—'} />
          <KeyValue label="When" value={formatDateTime(r.timestamp)} />
          <KeyValue label="Tx" value={short(r.transactionSignature, 6)} mono />
          {r.certificateCid && <KeyValue label="CID" value={short(r.certificateCid, 8)} mono />}
        </DefinitionList>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={openPdf}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-gradient px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Certificate PDF
          </button>
          {cidUrl && (
            <a href={cidUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-white/[0.08]">
              IPFS
            </a>
          )}
          {r.explorerUrl && (
            <a href={r.explorerUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-white/[0.08]">
              Solana Tx
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
