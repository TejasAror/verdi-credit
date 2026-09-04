'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { listHoldings, retireCredits, prepareRetirement, viewRetirementCertificatePdf } from '@/lib/api';
import { Holding, Retirement, RetirementReasonCategory } from '@/lib/types';
import WalletButton from '@/components/WalletButton';
import {
  PremiumInput,
  Badge,
  GlowButton,
  KeyValue,
  DefinitionList,
  Notice,
  EmptyState,
  Modal,
  AppShell,
  PageHeader,
  Rise,
  riseItem,
  staggerContainer,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import { Flame, Loader2, CheckCircle2, ShieldAlert, ArrowRight, AlertTriangle, FileText } from 'lucide-react';
import { short, formatNumber } from '@/lib/format';

const REASON_OPTIONS: { value: RetirementReasonCategory; label: string; hint: string }[] = [
  { value: 'NET_ZERO', label: 'Net Zero', hint: 'Toward a net-zero emissions commitment' },
  { value: 'CORPORATE_ESG', label: 'Corporate ESG', hint: 'ESG reporting / sustainability goals' },
  { value: 'CARBON_OFFSET', label: 'Carbon Offset', hint: 'Offset operational emissions' },
  { value: 'COMPLIANCE', label: 'Compliance', hint: 'Regulatory / mandated retirement' },
  { value: 'CUSTOM', label: 'Custom', hint: 'Provide your own retirement statement' },
];

type Phase = 'idle' | 'validating' | 'retiring' | 'certifying' | 'done' | 'error';

export default function RetireCreditsPage() {
  const { session, profile, token, loading } = useAuth();
  const { address, connected, submitTransaction } = useWallet();
  const { success, error: toastError } = useToast();

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
      if (data.length > 0 && !selectedHoldingId) setSelectedHoldingId(data[0].id);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load your holdings.');
      setLoadState('error');
    }
  }, [token, selectedHoldingId]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  const selectedHolding = useMemo(() => holdings.find((h) => h.id === selectedHoldingId) ?? null, [holdings, selectedHoldingId]);
  const amountNum = Number(amount);
  const balance = selectedHolding?.availableBalance ?? 0;
  const validation = useMemo(() => {
    const problems: string[] = [];
    if (!selectedHolding) problems.push('Select a credit holding to retire from.');
    if (!amount || Number.isNaN(amountNum)) problems.push('Enter a retirement amount.');
    else if (amountNum <= 0) problems.push('Amount must be greater than zero.');
    else if (amountNum > balance) problems.push(`Amount exceeds your available balance (${formatNumber(balance)}).`);
    if (!reason.trim()) problems.push('A retirement reason is required.');
    if (reasonCategory === 'CUSTOM' && reason.trim().length < 4) problems.push('Provide a descriptive custom retirement reason.');
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
      await new Promise((r) => setTimeout(r, 350));
      setResult(retired);
      setPhase('done');
      setPhaseMsg('Retirement complete. Your certificate is on IPFS.');
      success('Credits retired', `${retired.retiredAmount.toLocaleString()} credits permanently removed.`);
      await load();
    } catch (e: any) {
      setPhase('error');
      setError(e?.message ?? 'Retirement failed.');
      toastError('Retirement failed', e?.message);
      setPhaseMsg(null);
    }
  };

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
        <EmptyState icon={<Flame className="h-6 w-6" />} title="Sign in required" description="Please sign in to retire credits." />
      </AppShell>
    );
  }

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="Stage 6 · Credit Retirement"
        title="Retire Credits"
        subtitle="Permanently retire carbon credits you own."
        icon={<Flame className="h-6 w-6" />}
        actions={<WalletButton />}
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}

      {phase === 'done' && result ? (
        <SuccessCard result={result} token={token} onAnother={() => { setResult(null); setPhase('idle'); setAmount(''); setReason(''); }} />
      ) : phase === 'validating' || phase === 'retiring' || phase === 'certifying' ? (
        <ProgressCard phase={phase} msg={phaseMsg} />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <motion.section
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="glass space-y-5 rounded-3xl p-6 shadow-float lg:col-span-3"
          >
            <motion.h2 variants={riseItem} className="text-lg font-semibold text-content">Retire from your holdings</motion.h2>

            {loadState === 'loading' && <p className="text-sm text-content-faint">Loading your holdings…</p>}
            {loadState === 'error' && <Notice tone="error">{loadError}</Notice>}
            {loadState === 'empty' && (
              <EmptyState
                icon={<Flame className="h-6 w-6" />}
                title="No available holdings"
                description="You have no available credit holdings to retire."
                action={
                  <Link href="/marketplace">
                    <GlowButton variant="secondary">Browse marketplace</GlowButton>
                  </Link>
                }
              />
            )}

            {loadState === 'ready' && (
              <>
                <motion.div variants={riseItem}>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">Credit holding</label>
                  <select
                    value={selectedHoldingId}
                    onChange={(e) => setSelectedHoldingId(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content outline-none transition-all focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15"
                  >
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id} className="bg-ink-800">
                        {h.projectName} — {h.vintage} ({h.methodology}) · {formatNumber(h.availableBalance)} avail
                      </option>
                    ))}
                  </select>
                </motion.div>

                {selectedHolding && (
                  <motion.div variants={riseItem} className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                    <Info label="Project" value={selectedHolding.projectName} />
                    <Info label="Vintage" value={`${selectedHolding.vintage}`} />
                    <Info label="Methodology" value={selectedHolding.methodology} />
                    <Info label="Project type" value={selectedHolding.projectType} />
                    <Info label="Available balance" value={`${formatNumber(selectedHolding.availableBalance)} credits`} />
                    <Info label="Token mint" value={short(selectedHolding.tokenMint, 5)} mono />
                  </motion.div>
                )}

                <motion.div variants={riseItem}>
                  <PremiumInput
                    label="Amount to retire (credits)"
                    type="number"
                    min={1}
                    max={balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Up to ${formatNumber(balance)}`}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setAmount(String(Math.max(1, Math.floor(balance / 2))))} className="text-xs font-semibold text-accent-violet hover:underline">Half</button>
                    <button type="button" onClick={() => setAmount(String(balance))} className="text-xs font-semibold text-accent-violet hover:underline">Max</button>
                  </div>
                </motion.div>

                <motion.div variants={riseItem}>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-content-faint">Retirement reason</label>
                  <div className="flex flex-wrap gap-2">
                    {REASON_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setReasonCategory(opt.value)}
                        title={opt.hint}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                          reasonCategory === opt.value
                            ? 'bg-accent-gradient text-white shadow-glow'
                            : 'border border-white/10 bg-white/[0.04] text-content-muted hover:bg-white/[0.08]'
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
                    placeholder={reasonCategory === 'CUSTOM' ? 'Describe why you are retiring these credits…' : `e.g. ${REASON_OPTIONS.find((r) => r.value === reasonCategory)?.hint}…`}
                    className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content outline-none transition-all focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15"
                  />
                </motion.div>

                <motion.div variants={riseItem}>
                  <PremiumInput
                    label="Organization (optional)"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Shown on the certificate"
                  />
                </motion.div>

                {!connected && (
                  <Notice tone="warning">
                    Connect your Phantom wallet — the connected address authorizes the retirement and
                    must match the holding wallet.
                  </Notice>
                )}

                {validation.length > 0 && (
                  <ul className="space-y-1 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {validation.map((v) => (
                      <li key={v}>• {v}</li>
                    ))}
                  </ul>
                )}

                <GlowButton onClick={openConfirm} disabled={!canSubmit} className="w-full">
                  <Flame className="h-4 w-4" /> Retire credits
                </GlowButton>
              </>
            )}
          </motion.section>

          <aside className="glass space-y-4 rounded-3xl p-6 shadow-float lg:col-span-2">
            <h3 className="text-sm font-semibold text-content">What happens on retirement</h3>
            <ol className="space-y-3 text-sm text-content-muted">
              <li>1. We verify you own the credits and have enough balance.</li>
              <li>2. The Solana retirement (burn) instruction permanently removes them.</li>
              <li>3. An immutable retirement record is written and your balance updates.</li>
              <li>4. A PDF Retirement Certificate is generated and pinned to IPFS.</li>
              <li>5. Retired credits can never be transferred or listed again.</li>
            </ol>
            <div className="rounded-2xl border border-accent-pink/20 bg-accent-pink/10 p-3 text-xs text-accent-pink">
              <ShieldAlert className="mr-1 inline h-4 w-4" />
              Retired credits are burned on-chain and recorded immutably — this action is irreversible.
            </div>
          </aside>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm retirement"
        description="This action is permanent. Retired credits can never be recovered."
        size="sm"
        footer={
          <>
            <GlowButton variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Cancel
            </GlowButton>
            <GlowButton className="flex-1" onClick={doRetire}>
              <Flame className="h-4 w-4" /> Confirm &amp; retire
            </GlowButton>
          </>
        }
      >
        {selectedHolding && (
          <DefinitionList>
            <KeyValue label="Project" value={selectedHolding.projectName} />
            <KeyValue label="Amount" value={`${formatNumber(amountNum)} credits`} />
            <KeyValue label="Reason" value={`${reason} (${reasonCategory})`} />
            <KeyValue label="Wallet" value={short(address, 5)} mono />
          </DefinitionList>
        )}
      </Modal>
    </AppShell>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-content-faint">{label}</p>
      <p className={`text-content ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
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
    <section className="glass rounded-3xl p-8 shadow-float">
      <h2 className="text-lg font-semibold text-content">Processing retirement…</h2>
      <div className="mt-6 space-y-3">
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-accent-gradient text-white' : active ? 'animate-pulse bg-accent-pink/20 text-accent-pink' : 'bg-white/[0.06] text-content-faint'
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={active ? 'font-medium text-content' : 'text-content-faint'}>{s.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-content-faint">{msg}</p>
    </section>
  );
}

function SuccessCard({ result, token, onAnother }: { result: Retirement; token: string | null; onAnother: () => void }) {
  const { toast } = useToast();
  const cidUrl = result.certificateCid ? `https://ipfs.io/ipfs/${result.certificateCid}` : null;
  const [pdfBusy, setPdfBusy] = useState(false);

  const openPdf = async () => {
    if (!token) {
      toast({ title: 'Authentication required', description: 'Please sign in to view your certificate.', tone: 'error' });
      return;
    }
    setPdfBusy(true);
    try {
      await viewRetirementCertificatePdf(token, result.id, result.certificateId ?? result.retirementId);
    } catch (e) {
      toast({ title: 'Unable to open certificate', description: (e as Error).message, tone: 'error' });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-3xl p-8 text-center shadow-float"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald/20 text-accent-emerald">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-content">Credits retired successfully</h2>
        <p className="text-sm text-content-muted">
          {formatNumber(result.retiredAmount)} credits permanently removed from circulation.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 sm:grid-cols-2">
        <Detail label="Certificate ID" value={result.certificateId ?? '—'} mono />
        <Detail label="Retirement ID" value={short(result.retirementId, 8)} mono />
        <Detail label="Project" value={result.projectName ?? '—'} />
        <Detail label="Methodology" value={result.methodology ?? '—'} />
        <Detail label="Vintage" value={`${result.vintage ?? '—'}`} />
        <Detail label="Retired credits" value={`${formatNumber(result.retiredAmount)} tCO₂e`} />
        <Detail label="Reason" value={`${result.reason} (${result.reasonCategory})`} />
        <Detail label="Status" value={result.status} />
        <Detail label="Tx signature" value={short(result.transactionSignature, 8)} mono />
        <Detail label="Certificate CID" value={result.certificateCid ? short(result.certificateCid, 10) : 'pending'} mono />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={openPdf}
          disabled={pdfBusy}
          className="inline-flex items-center gap-2 rounded-2xl bg-accent-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          View / Download Certificate (PDF)
        </button>
        {cidUrl && (
          <a href={cidUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-white/[0.08]">
            Open on IPFS
          </a>
        )}
        {result.explorerUrl && (
          <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-white/[0.08]">
            Solana Transaction
          </a>
        )}
        <Link href="/retirement-history">
          <GlowButton variant="secondary"><ArrowRight className="h-4 w-4" /> View in History</GlowButton>
        </Link>
        <GlowButton variant="ghost" onClick={onAnother}>Retire more</GlowButton>
      </div>
    </section>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-content-faint">{label}</p>
      <p className={`break-words ${mono ? 'font-mono text-xs text-content-muted' : 'text-sm text-content'}`}>{value}</p>
    </div>
  );
}
