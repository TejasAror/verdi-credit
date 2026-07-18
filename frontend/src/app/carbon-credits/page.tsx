'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  checkEligible,
  issueCredits,
  getBatches,
  getRetirements,
} from '@/lib/api';
import {
  CreditBatchView,
  EligibleResponse,
  IssueCreditResponse,
  RetirementView,
} from '@/lib/types';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

const MONO =
  'font-mono text-xs break-all text-slate-500';

function short(s: string, n = 8) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

export default function CarbonCreditsPage() {
  const { session, profile, token, signOut, loading } = useAuth();

  // Eligibility / issue
  const [projectId, setProjectId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [vintage, setVintage] = useState('');
  const [eligible, setEligible] = useState<EligibleResponse | null>(null);
  const [issueResult, setIssueResult] = useState<IssueCreditResponse | null>(null);
  const [ccBusy, setCcBusy] = useState(false);
  const [ccError, setCcError] = useState<string | null>(null);
  const [ccNote, setCcNote] = useState<string | null>(null);

  // Audit
  const [mint, setMint] = useState('');
  const [batches, setBatches] = useState<CreditBatchView[] | null>(null);
  const [retirements, setRetirements] = useState<RetirementView[] | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const canIssue = profile?.role === 'AUDITOR' || profile?.role === 'ADMIN';

  const handleCheck = useCallback(async () => {
    if (!token || !projectId) return;
    setCcBusy(true);
    setCcError(null);
    setIssueResult(null);
    try {
      const data = await checkEligible(token, projectId);
      setEligible(data);
    } catch (e: any) {
      setCcError(e?.message ?? 'Eligibility check failed.');
      setEligible(null);
    } finally {
      setCcBusy(false);
    }
  }, [token, projectId]);

  const handleIssue = useCallback(async () => {
    if (!token || !canIssue) return;
    setCcBusy(true);
    setCcError(null);
    setCcNote(null);
    try {
      const payload: {
        projectId: string;
        recipient: string;
        vintage?: number;
      } = { projectId, recipient };
      if (vintage.trim()) payload.vintage = Number(vintage);
      const data = await issueCredits(token, payload);
      setIssueResult(data);
      setCcNote(`Issued ${data.amount} credits (tx ${short(data.txSignature)}).`);
    } catch (e: any) {
      setCcError(e?.message ?? 'Issuance failed.');
    } finally {
      setCcBusy(false);
    }
  }, [token, canIssue, projectId, recipient, vintage]);

  const handleAudit = useCallback(async () => {
    if (!token || !mint) return;
    setAuditBusy(true);
    setAuditError(null);
    try {
      const [b, r] = await Promise.all([
        getBatches(token, mint),
        getRetirements(token, mint),
      ]);
      setBatches(b);
      setRetirements(r);
    } catch (e: any) {
      setAuditError(e?.message ?? 'Audit read failed.');
      setBatches(null);
      setRetirements(null);
    } finally {
      setAuditBusy(false);
    }
  }, [token, mint]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 text-slate-500">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to access carbon credits.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (!canIssue) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">
            Auditor or Admin access required
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            Your role is <strong>{profile?.role}</strong>. Only AUDITOR or ADMIN
            accounts can issue carbon credits. You can still view the audit ledgers
            below.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
            C
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Carbon Credits
            </h1>
            <p className="text-sm text-slate-500">
              Stage 4 — issue 1 credit per verified tonne of CO₂.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{profile?.email}</span>
          <Link
            href="/developer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Projects
          </Link>
          <Link
            href="/marketplace"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Marketplace
          </Link>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {ccError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {ccError}
        </p>
      )}
      {ccNote && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {ccNote}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Eligibility + Issue */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Check eligibility &amp; issue
            </h2>
            <p className="text-sm text-slate-500">
              Reads the latest Stage 3 report and mints floor(verifiedTonnes)
              credits.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Project ID
            </label>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="project uuid"
              className={inputClass}
            />
            <button
              onClick={handleCheck}
              disabled={ccBusy || !projectId}
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
            >
              {ccBusy ? 'Checking…' : 'Check eligibility'}
            </button>
          </div>

          {eligible && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <Row label="Status" value={eligible.status} />
              <Row label="Methodology" value={eligible.methodology || '—'} />
              <Row
                label="Verified tonnes"
                value={eligible.verifiedTonnes.toLocaleString()}
              />
              <Row
                label="Credits to mint (1:1)"
                value={`${eligible.amount ?? Math.floor(eligible.verifiedTonnes)}`}
              />
              <Row label="Confidence" value={`${eligible.confidenceScore}`} />
              <Row
                label="Report CID"
                value={eligible.reportCid}
                mono
              />
              <Row label="Eligible" value={eligible.eligible ? 'YES' : 'NO'} />
            </div>
          )}

          {eligible?.eligible && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Recipient wallet (base58)
                </label>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Recipient Solana wallet address"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Vintage (optional)
                </label>
                <input
                  value={vintage}
                  onChange={(e) => setVintage(e.target.value)}
                  placeholder="Defaults to verification year"
                  type="number"
                  min={1}
                  className={inputClass}
                />
              </div>
              <button
                onClick={handleIssue}
                disabled={ccBusy || !recipient}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {ccBusy ? 'Issuing…' : 'Issue credits'}
              </button>
            </div>
          )}

          {issueResult && (
            <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <Row label="Amount" value={`${issueResult.amount}`} />
              <Row label="Vintage" value={`${issueResult.vintage}`} />
              <Row label="Mint" value={issueResult.mint} mono />
              <Row label="Batch PDA" value={issueResult.batchPda} mono />
              <Row label="Tx signature" value={issueResult.txSignature} mono />
            </div>
          )}
        </section>

        {/* Audit */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              On-chain audit
            </h2>
            <p className="text-sm text-slate-500">
              Read the issuance and retirement ledgers for a credit mint.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Credit mint address
            </label>
            <input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              placeholder="Credit mint (base58)"
              className={inputClass}
            />
            <button
              onClick={handleAudit}
              disabled={auditBusy || !mint}
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
            >
              {auditBusy ? 'Loading…' : 'Load ledgers'}
            </button>
          </div>

          {auditError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {auditError}
            </p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Issuance batches
            </h3>
            {batches && batches.length > 0 ? (
              <div className="space-y-2">
                {batches.map((b) => (
                  <div
                    key={b.mint + b.projectId + b.vintage}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                  >
                    <Row label="Project" value={b.projectId} />
                    <Row label="Vintage" value={`${b.vintage}`} />
                    <Row label="Methodology" value={b.methodology || '—'} />
                    <Row
                      label="Minted / Retired"
                      value={`${b.totalMinted} / ${b.totalRetired}`}
                    />
                    <Row label="Report CID" value={b.reportCid} mono />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {batches ? 'No batches found for this mint.' : 'Not loaded.'}
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Retirements
            </h3>
            {retirements && retirements.length > 0 ? (
              <div className="space-y-2">
                {retirements.map((r, i) => (
                  <div
                    key={r.batch + i}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                  >
                    <Row label="Amount" value={`${r.amount}`} />
                    <Row label="Reason" value={r.reason || '—'} />
                    <Row label="Owner" value={short(r.owner)} mono />
                    <Row
                      label="When"
                      value={new Date(r.timestamp * 1000).toLocaleString()}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {retirements ? 'No retirements recorded.' : 'Not loaded.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`text-right text-slate-800 ${mono ? MONO : ''}`}>
        {value}
      </span>
    </div>
  );
}
