'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import {
  listHoldings,
  retireCredits,
  prepareRetirement,
} from '@/lib/api';
import {
  Holding,
  Retirement,
  RetirementReasonCategory,
} from '@/lib/types';
import WalletButton from '@/components/WalletButton';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

const REASON_OPTIONS: { value: RetirementReasonCategory; label: string; hint: string }[] = [
  { value: 'NET_ZERO', label: 'Net Zero', hint: 'Toward a net-zero emissions commitment' },
  { value: 'CORPORATE_ESG', label: 'Corporate ESG', hint: 'ESG reporting / sustainability goals' },
  { value: 'CARBON_OFFSET', label: 'Carbon Offset', hint: 'Offset operational emissions' },
  { value: 'COMPLIANCE', label: 'Compliance', hint: 'Regulatory / mandated retirement' },
  { value: 'CUSTOM', label: 'Custom', hint: 'Provide your own retirement statement' },
];

function short(s: string, n = 6) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

type Phase = 'idle' | 'validating' | 'retiring' | 'certifying' | 'done' | 'error';

export default function RetireCreditsPage() {
  const { session, profile, token, signOut, loading } = useAuth();
  const { address, connected, submitTransaction } = useWallet();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedHoldingId, setSelectedHoldingId] = useState('');
  const [amount, setAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState<RetirementReasonCategory>('NET_ZERO');
  const [reason, setReason] = useState('');
  const [organization, setOrganization] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [phaseMsg, setPhaseMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Retirement | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadState('loading');
    setLoadError(null);
    try {
      const data = await listHoldings(token);
      setHoldings(data);
      setLoadState(data.length === 0 ? 'empty' : 'ready');
      if (data.length > 0 && !selectedHoldingId) {
        setSelectedHoldingId(data[0].id);
      }
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load your holdings.');
      setLoadState('error');
    }
  }, [token, selectedHoldingId]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  const selectedHolding = useMemo(
    () => holdings.find((h) => h.id === selectedHoldingId) ?? null,
    [holdings, selectedHoldingId],
  );

  const amountNum = Number(amount);
  const balance = selectedHolding?.availableBalance ?? 0;
  const validation = useMemo(() => {
    const problems: string[] = [];
    if (!selectedHolding) problems.push('Select a credit holding to retire from.');
    if (!amount || Number.isNaN(amountNum)) problems.push('Enter a retirement amount.');
    else if (amountNum <= 0) problems.push('Amount must be greater than zero.');
    else if (amountNum > balance)
      problems.push(`Amount exceeds your available balance (${balance.toLocaleString()}).`);
    if (!reason.trim()) problems.push('A retirement reason is required.');
    if (reasonCategory === 'CUSTOM' && reason.trim().length < 4)
      problems.push('Provide a descriptive custom retirement reason.');
    return problems;
  }, [selectedHolding, amount, amountNum, balance, reason, reasonCategory]);

  const canSubmit = validation.length === 0 && connected;

  const openConfirm = () => {
    setError(null);
    setConfirmOpen(true);
  };

  const doRetire = async () => {
    if (!token || !selectedHolding || !canSubmit) return;
    setConfirmOpen(false);
    setPhase('validating');
    setPhaseMsg('Validating ownership and available balance…');
    setError(null);
    try {
      setPhase('retiring');
      setPhaseMsg('Submitting the on-chain retirement (burn) transaction…');
      // Client-signed settlement: ask the backend for a ready-to-sign burn tx,
      // have the owner's Phantom wallet sign + submit it, then record the
      // returned signature with the backend.
      const prepared = await prepareRetirement(token, {
        holdingId: selectedHolding.id,
        amount: amountNum,
        reasonCategory,
        reason: reason.trim(),
        walletAddress: address ?? undefined,
        organization: organization.trim() || undefined,
      });
      const txSignature = await submitTransaction(prepared.transaction);
      const retired = await retireCredits(token, {
        holdingId: selectedHolding.id,
        amount: amountNum,
        reasonCategory,
        reason: reason.trim(),
        walletAddress: address ?? undefined,
        organization: organization.trim() || undefined,
        txSignature,
      });
      setPhase('certifying');
      setPhaseMsg('Generating and pinning your PDF Retirement Certificate to IPFS…');
      // The backend already certifies synchronously; small delay for UX.
      await new Promise((r) => setTimeout(r, 350));
      setResult(retired);
      setPhase('done');
      setPhaseMsg('Retirement complete. Your certificate is on IPFS.');
      await load();
    } catch (e: any) {
      setPhase('error');
      setError(e?.message ?? 'Retirement failed.');
      setPhaseMsg(null);
    }
  };

  if (loading) {
    return <main className="mx-auto max-w-6xl px-6 py-16 text-slate-500">Loading…</main>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to retire credits.</p>
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
            <h1 className="text-xl font-bold text-slate-900">Retire Credits</h1>
            <p className="text-sm text-slate-500">
              Stage 6 — permanently retire carbon credits you own.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <WalletButton />
          <Link
            href="/retirement-history"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            History
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

      {phase === 'done' && result ? (
        <SuccessCard result={result} onAnother={() => { setResult(null); setPhase('idle'); setAmount(''); setReason(''); }} />
      ) : phase === 'validating' || phase === 'retiring' || phase === 'certifying' ? (
        <ProgressCard phase={phase} msg={phaseMsg} />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Form */}
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <h2 className="text-lg font-semibold text-slate-900">Retire from your holdings</h2>

            {loadState === 'loading' && <p className="text-sm text-slate-500">Loading your holdings…</p>}
            {loadState === 'error' && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
            )}
            {loadState === 'empty' && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-slate-600">You have no available credit holdings to retire.</p>
                <Link
                  href="/marketplace"
                  className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Browse marketplace
                </Link>
              </div>
            )}

            {loadState === 'ready' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Credit holding
                  </label>
                  <select
                    value={selectedHoldingId}
                    onChange={(e) => setSelectedHoldingId(e.target.value)}
                    className={inputClass}
                  >
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.projectName} — {h.vintage} ({h.methodology}) · {h.availableBalance.toLocaleString()} avail
                      </option>
                    ))}
                  </select>
                </div>

                {selectedHolding && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <Info label="Project" value={selectedHolding.projectName} />
                    <Info label="Vintage" value={`${selectedHolding.vintage}`} />
                    <Info label="Methodology" value={selectedHolding.methodology} />
                    <Info label="Project type" value={selectedHolding.projectType} />
                    <Info label="Available balance" value={`${selectedHolding.availableBalance.toLocaleString()} credits`} />
                    <Info label="Token mint" value={short(selectedHolding.tokenMint, 5)} mono />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Amount to retire (credits)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Up to ${balance.toLocaleString()}`}
                    className={inputClass}
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.max(1, Math.floor(balance / 2))))}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Half
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount(String(balance))}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Max
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Retirement reason
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REASON_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setReasonCategory(opt.value)}
                        title={opt.hint}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          reasonCategory === opt.value
                            ? 'bg-teal-600 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder={
                      reasonCategory === 'CUSTOM'
                        ? 'Describe why you are retiring these credits…'
                        : `e.g. ${REASON_OPTIONS.find((r) => r.value === reasonCategory)?.hint}…`
                    }
                    className={`${inputClass} mt-2 resize-none`}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Organization (optional)
                  </label>
                  <input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Shown on the certificate"
                    className={inputClass}
                  />
                </div>

                {!connected && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Connect your Phantom wallet — the connected address authorizes the
                    retirement and must match the holding wallet.
                  </p>
                )}

                {validation.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {validation.map((v) => (
                      <li key={v}>• {v}</li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={openConfirm}
                  disabled={!canSubmit}
                  className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                >
                  Retire credits
                </button>
              </>
            )}
          </section>

          {/* Side panel */}
          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-900">What happens on retirement</h3>
            <ol className="space-y-3 text-sm text-slate-600">
              <li>1. We verify you own the credits and have enough balance.</li>
              <li>2. The Solana retirement (burn) instruction permanently removes them.</li>
              <li>3. An immutable retirement record is written and your balance updates.</li>
              <li>4. A PDF Retirement Certificate is generated and pinned to IPFS.</li>
              <li>5. Retired credits can never be transferred or listed again.</li>
            </ol>
            <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
              Retired credits are burned on-chain and recorded immutably — this action is
              irreversible.
            </div>
          </aside>
        </div>
      )}

      {confirmOpen && selectedHolding && (
        <ConfirmModal
          holding={selectedHolding}
          amount={amountNum}
          reasonCategory={reasonCategory}
          reason={reason}
          wallet={address}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doRetire}
        />
      )}
    </main>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}

function ProgressCard({ phase, msg }: { phase: Phase; msg: string | null }) {
  const steps: { key: Phase; label: string }[] = [
    { key: 'validating', label: 'Validate' },
    { key: 'retiring', label: 'Retire on-chain' },
    { key: 'certifying', label: 'Issue certificate' },
  ];
  const order: Phase[] = ['validating', 'retiring', 'certifying'];
  const activeIdx = order.indexOf(phase);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Processing retirement…</h2>
      <div className="mt-6 space-y-3">
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-teal-600 text-white'
                    : active
                    ? 'bg-teal-100 text-teal-700 animate-pulse'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active ? 'font-medium text-slate-900' : 'text-slate-500'}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-slate-500">{msg}</p>
    </section>
  );
}

function SuccessCard({ result, onAnother }: { result: Retirement; onAnother: () => void }) {
  const cidUrl = result.certificateCid
    ? `https://ipfs.io/ipfs/${result.certificateCid}`
    : null;
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-3 text-lg font-bold text-emerald-900">Credits retired successfully</h2>
        <p className="text-sm text-emerald-800">
          {result.retiredAmount.toLocaleString()} credits permanently removed from circulation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <Detail label="Certificate ID" value={result.certificateId ?? '—'} mono />
        <Detail label="Retirement ID" value={short(result.retirementId, 8)} mono />
        <Detail label="Project" value={result.projectName ?? '—'} />
        <Detail label="Methodology" value={result.methodology ?? '—'} />
        <Detail label="Vintage" value={`${result.vintage ?? '—'}`} />
        <Detail label="Retired credits" value={`${result.retiredAmount.toLocaleString()} tCO₂e`} />
        <Detail label="Reason" value={`${result.reason} (${result.reasonCategory})`} />
        <Detail label="Status" value={result.status} />
        <Detail label="Tx signature" value={short(result.transactionSignature, 8)} mono />
        <Detail label="Certificate CID" value={result.certificateCid ? short(result.certificateCid, 10) : 'pending'} mono />
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/retirements/${result.id}/certificate`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          View / Download Certificate (PDF)
        </a>
        {cidUrl && (
          <a
            href={cidUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Open on IPFS
          </a>
        )}
        {result.explorerUrl && (
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Solana Transaction
          </a>
        )}
        <Link
          href="/retirement-history"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          View in History
        </Link>
        <button
          onClick={onAnother}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Retire more
        </button>
      </div>
    </section>
  );
}

function ConfirmModal({
  holding,
  amount,
  reasonCategory,
  reason,
  wallet,
  onCancel,
  onConfirm,
}: {
  holding: Holding;
  amount: number;
  reasonCategory: RetirementReasonCategory;
  reason: string;
  wallet?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Confirm retirement</h3>
        <p className="mt-1 text-sm text-slate-500">
          This action is permanent. Retired credits can never be recovered.
        </p>
        <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
          <ConfirmRow label="Project" value={holding.projectName} />
          <ConfirmRow label="Amount" value={`${amount.toLocaleString()} credits`} />
          <ConfirmRow label="Reason" value={`${reason} (${reasonCategory})`} />
          <ConfirmRow label="Wallet" value={wallet ? short(wallet, 5) : '—'} mono />
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Confirm &amp; retire
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`break-words text-slate-800 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  );
}
