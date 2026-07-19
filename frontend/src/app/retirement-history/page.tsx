'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { listRetirements } from '@/lib/api';
import {
  Retirement,
  RetirementReasonCategory,
  RetirementStatus,
} from '@/lib/types';
import WalletButton from '@/components/WalletButton';

function short(s: string, n = 6) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

const REASON_FILTERS: ('ALL' | RetirementReasonCategory)[] = [
  'ALL',
  'NET_ZERO',
  'CORPORATE_ESG',
  'CARBON_OFFSET',
  'COMPLIANCE',
  'CUSTOM',
];

const STATUS_FILTERS: ('ALL' | RetirementStatus)[] = ['ALL', 'CONFIRMED', 'CERTIFIED', 'PENDING'];

export default function RetirementHistoryPage() {
  const { session, profile, token, signOut, loading } = useAuth();

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

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change.
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
    return <main className="mx-auto max-w-6xl px-6 py-16 text-slate-500">Loading…</main>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to view retirement history.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
            R
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Retirement History</h1>
            <p className="text-sm text-slate-500">
              Stage 6 — every credit retirement you{isAdmin ? ' and all users' : ''} have made.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <WalletButton />
          <Link
            href="/retire-credits"
            className="rounded-lg bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700"
          >
            Retire Credits
          </Link>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Filters */}
      <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reason, project, wallet, tx, or certificate id…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 sm:flex-1"
          />
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  status === s
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {s === 'ALL' ? 'All statuses' : s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {REASON_FILTERS.map((r) => (
            <button
              key={r}
              onClick={() => setReasonCategory(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                reasonCategory === r
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {r === 'ALL' ? 'All reasons' : r.replace('_', ' ')}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      {busy ? (
        <p className="text-slate-500">Loading retirements…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-500">No retirements found.</p>
          <Link
            href="/retire-credits"
            className="mt-3 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Retire your first credits
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">
            {total} retirement{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <RetirementCard key={r.id} r={r} />
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center gap-2">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-slate-400">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      p === page
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function RetirementCard({ r }: { r: Retirement }) {
  const cidUrl = r.certificateCid ? `https://ipfs.io/ipfs/${r.certificateCid}` : null;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-400 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{r.projectName ?? 'Carbon Credit'}</p>
          <p className="text-xs text-slate-400">{r.certificateId ?? short(r.retirementId, 8)}</p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row label="Retired" value={`${r.retiredAmount.toLocaleString()} tCO₂e`} />
        <Row label="Reason" value={`${r.reason} (${r.reasonCategory})`} />
        <Row label="Vintage" value={`${r.vintage ?? '—'}`} />
        <Row label="Methodology" value={r.methodology ?? '—'} />
        <Row label="When" value={new Date(r.timestamp).toLocaleString()} />
        <Row label="Tx" value={short(r.transactionSignature, 6)} mono />
        {r.certificateCid && <Row label="CID" value={short(r.certificateCid, 8)} mono />}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <a
          href={`/api/retirements/${r.id}/certificate`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          Certificate PDF
        </a>
        {cidUrl && (
          <a
            href={cidUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            IPFS
          </a>
        )}
        {r.explorerUrl && (
          <a
            href={r.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Solana Tx
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: RetirementStatus }) {
  const cls =
    status === 'CERTIFIED'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'CONFIRMED'
      ? 'bg-teal-50 text-teal-700'
      : 'bg-amber-50 text-amber-700';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
