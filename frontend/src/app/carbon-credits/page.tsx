'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import {
  listProjects,
  checkEligible,
  issueCredits,
  getBatches,
  getRetirements,
  getProjectBatches,
  getProjectRetirements,
  getCarbonConfig,
} from '@/lib/api';
import {
  CreditBatchView,
  EligibleResponse,
  IssueCreditResponse,
  Project,
  ProjectStatus,
  RetirementView,
} from '@/lib/types';
import {
  PremiumInput,
  GlowButton,
  Badge,
  KeyValue,
  DefinitionList,
  Notice,
  EmptyState,
  AppShell,
  PageHeader,
  Rise,
  riseItem,
  staggerContainer,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import {
  Coins,
  Loader2,
  CheckCircle2,
  ScrollText,
  Flame,
  AlertTriangle,
  ExternalLink,
  Search,
  Copy,
  Check,
  Sparkles,
  BadgeCheck,
  Wallet,
  Lock,
} from 'lucide-react';
import { formatNumber, short, solanaTxLink } from '@/lib/format';

const ISSUE_STEPS = [
  'Eligibility Check',
  'Preparing Transaction',
  'Wallet Signature',
  'Sending Transaction',
  'Confirming on Solana Devnet',
  'Credits Issued',
];

const STATUS_TONE: Record<ProjectStatus, Parameters<typeof Badge>[0]['tone']> = {
  DRAFT: 'slate',
  PENDING_VERIFICATION: 'amber',
  VERIFIED: 'emerald',
  REJECTED: 'rose',
  RETIRED: 'slate',
};

const accountExplorer = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;

export default function CarbonCreditsPage() {
  const { session, profile, token, loading } = useAuth();
  const { address: walletAddress } = useWallet();
  const { success, error: toastError } = useToast();

  const canIssue = profile?.role === 'AUDITOR' || profile?.role === 'ADMIN';

  /* ---- project selector ---- */
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState('');

  /* ---- selected project + eligibility ---- */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eligible, setEligible] = useState<EligibleResponse | null>(null);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);

  const [recipient, setRecipient] = useState('');
  const [vintage, setVintage] = useState('');

  /* ---- issuance flow ---- */
  const [issueResult, setIssueResult] = useState<IssueCreditResponse | null>(null);
  const [issueState, setIssueState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [activeStep, setActiveStep] = useState(0);
  const [issueError, setIssueError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Guards the audit against stale responses when switching projects quickly. */
  const auditProjectRef = useRef<string | null>(null);

  /* ---- audit ledger (auto-loaded after issuance) ---- */
  const [configuredMint, setConfiguredMint] = useState<string | null>(null);
  const [mint, setMint] = useState('');
  const [batches, setBatches] = useState<CreditBatchView[] | null>(null);
  const [retirements, setRetirements] = useState<RetirementView[] | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  /* Resolve the configured credit mint so the audit never needs a hardcoded address. */
  useEffect(() => {
    if (!token) return;
    getCarbonConfig(token)
      .then((cfg) => {
        if (cfg.creditMint) {
          setConfiguredMint(cfg.creditMint);
          setMint((prev) => prev || cfg.creditMint!);
        }
      })
      .catch(() => undefined);
  }, [token]);

  const clearStepTimer = () => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  };

  /* Load the project list for the issuer selector. */
  const loadProjects = useCallback(async () => {
    if (!token) return;
    setProjectsLoading(true);
    try {
      const list = await listProjects(token);
      setProjects(list);
    } catch (e: any) {
      toastError('Failed to load projects', e?.message);
    } finally {
      setProjectsLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    if (session && token && canIssue) loadProjects();
  }, [session, token, canIssue, loadProjects]);

  /* When the connected wallet changes, default the recipient to it. */
  useEffect(() => {
    if (walletAddress && !recipient) setRecipient(walletAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  /* Auto-link wallet to VerdiCred account when connected and authenticated. */
  const { linkWallet } = useWallet();
  const [walletLinked, setWalletLinked] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);

  useEffect(() => {
    if (walletAddress && token && session && !walletLinked && !linkingWallet) {
      let cancelled = false;
      setLinkingWallet(true);
      linkWallet(token)
        .then(() => {
          if (!cancelled) {
            setWalletLinked(true);
          }
        })
        .catch((e) => {
          console.warn('Auto wallet link failed:', e?.message);
        })
        .finally(() => {
          if (!cancelled) setLinkingWallet(false);
        });
      return () => {
        cancelled = true;
      };
    }
    // Reset when wallet disconnects
    if (!walletAddress) {
      setWalletLinked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, token, session, linkWallet, walletLinked, linkingWallet]);

  const refreshProjectAudit = useCallback(
    async (projectId: string | null, theMint: string | null) => {
      if (!token || !projectId) return;
      auditProjectRef.current = projectId;
      const targetMint = theMint || mint || configuredMint;
      if (!targetMint) {
        setBatches(null);
        setRetirements(null);
        setAuditError('No credit mint configured. Cannot load on-chain ledgers.');
        return;
      }
      setAuditBusy(true);
      setAuditError(null);
      try {
        const [b, r] = await Promise.all([
          getProjectBatches(token, targetMint, projectId),
          getProjectRetirements(token, targetMint, projectId),
        ]);
        // Ignore a stale response from a project the user has already switched away from.
        if (auditProjectRef.current !== projectId) return;
        setBatches(b);
        setRetirements(r);
      } catch (e: any) {
        if (auditProjectRef.current !== projectId) return;
        setAuditError(e?.message ?? 'Could not load on-chain ledger.');
      } finally {
        if (auditProjectRef.current === projectId) setAuditBusy(false);
      }
    },
    [token, mint, configuredMint],
  );

  const selectProject = useCallback(
    async (id: string) => {
      if (!token) return;
      // Clear any previous project's audit + issue state so a stale batch from
      // Project A is never shown for Project B.
      setSelectedId(id);
      setBatches(null);
      setRetirements(null);
      setAuditError(null);
      setIssueResult(null);
      setIssueState('idle');
      setActiveStep(0);
      setIssueError(null);
      setEligible(null);
      setEligibleLoading(true);
      setEligibleError(null);
      try {
        const data = await checkEligible(token, id);
        setEligible(data);
        setActiveStep(0); // step 0 (Eligibility Check) now complete
      } catch (e: any) {
        setEligibleError(e?.message ?? 'Eligibility check failed.');
        toastError('Eligibility check failed', e?.message);
      } finally {
        setEligibleLoading(false);
      }
      // Dynamically load this project's on-chain ledger against the configured
      // credit mint (if available). This runs even if the project has not issued
      // yet — the API returns the project's batches (empty if none issued).
      await refreshProjectAudit(id, configuredMint);
    },
    [token, toastError, configuredMint, refreshProjectAudit],
  );

  const refreshAfterIssue = useCallback(
    async (result: IssueCreditResponse) => {
      // Re-check eligibility for the selected project + load the newly minted
      // project's on-chain ledgers so issuance history appears immediately.
      setMint(result.mint);
      await refreshProjectAudit(result.projectId, result.mint);
      if (selectedId) {
        checkEligible(token!, selectedId).then(setEligible).catch(() => undefined);
      }
    },
    [token, selectedId, refreshProjectAudit],
  );

  const handleIssue = useCallback(async () => {
    if (!token || !canIssue || !selectedId || !eligible?.eligible) return;
    clearStepTimer();
    setIssueState('running');
    setIssueError(null);
    setIssueResult(null);
    setActiveStep(1);

    // Visual progression through the server-side pipeline stages. The final
    // "Credits Issued" step only completes on the REAL backend response.
    stepTimer.current = setInterval(() => {
      setActiveStep((s) => (s < 4 ? s + 1 : s));
    }, 850);

    try {
      const payload: { projectId: string; recipient: string; vintage?: number } = {
        projectId: selectedId,
        recipient,
      };
      if (vintage.trim()) payload.vintage = Number(vintage);
      const data = await issueCredits(token, payload);
      clearStepTimer();
      setActiveStep(6); // all steps done
      setIssueState('success');
      setIssueResult(data);
      success('Credits issued', `Minted ${data.amount} credits on Solana Devnet.`);
      await refreshAfterIssue(data);
    } catch (e: any) {
      clearStepTimer();
      setIssueState('error');
      setIssueError(e?.message ?? 'Issuance failed.');
      toastError('Issuance failed', e?.message);
    }
  }, [token, canIssue, selectedId, eligible, recipient, vintage, success, toastError, refreshAfterIssue]);

  useEffect(() => clearStepTimer, []);

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
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Sign in required"
          description="Please sign in to access carbon credits."
        />
      </AppShell>
    );
  }

  if (!canIssue) {
    return (
      <AppShell max="3xl">
        <Notice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-content">Auditor or Admin access required</p>
              <p className="mt-1 text-content-muted">
                Your role is <strong>{profile?.role}</strong>. Only AUDITOR or ADMIN accounts can
                issue carbon credits. You can still view the on-chain audit ledgers below.
              </p>
            </div>
          </div>
        </Notice>
        <div className="mt-6">
          <AuditSection
            mint={mint}
            setMint={setMint}
            onAudit={async () => {
              if (!token) return;
              const targetMint = mint || configuredMint;
              if (!targetMint) {
                setAuditError('No credit mint configured. Enter a mint above or select a project.');
                return;
              }
              setAuditBusy(true);
              setAuditError(null);
              try {
                const [b, r] = await Promise.all([getBatches(token, targetMint), getRetirements(token, targetMint)]);
                setBatches(b);
                setRetirements(r);
              } catch (e: any) {
                setAuditError(e?.message ?? 'Audit read failed.');
              } finally {
                setAuditBusy(false);
              }
            }}
            busy={auditBusy}
            error={auditError}
            batches={batches}
            retirements={retirements}
          />
        </div>
      </AppShell>
    );
  }

  const filtered = projects.filter((p) =>
    p.projectName.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="Stage 4 · Carbon Credit Issuance"
        title="Carbon Credits"
        subtitle="Issue 1 credit per verified tonne of CO₂ on Solana Devnet."
        icon={<Coins className="h-6 w-6" />}
      />

      {issueError && issueState === 'error' && (
        <div className="mb-5">
          <Notice tone="error">{issueError}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Issuance workflow */}
        <motion.section
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="glass relative overflow-hidden rounded-3xl p-6 shadow-float"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent-gradient-soft blur-3xl" />
          <motion.div variants={riseItem} className="relative mb-5">
            <h2 className="text-lg font-semibold text-content">Issue credits</h2>
            <p className="text-sm text-content-muted">
              Select a VERIFIED project to mint its on-chain carbon credits.
            </p>
          </motion.div>

          <motion.div variants={riseItem} className="relative space-y-4">
            {/* Searchable project selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">
                Project
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-content outline-none transition-all focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15"
                />
              </div>
            </div>

            <div className="scrollbar-premium max-h-64 space-y-2 overflow-auto pr-1">
              {projectsLoading ? (
                <p className="px-1 py-3 text-sm text-content-faint">Loading projects…</p>
              ) : filtered.length === 0 ? (
                <p className="px-1 py-3 text-sm text-content-faint">No projects found.</p>
              ) : (
                filtered.map((p) => {
                  const isVerified = p.status === 'VERIFIED';
                  const isSelected = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!isVerified}
                      onClick={() => isVerified && selectProject(p.id)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                        isSelected
                          ? 'border-accent-violet/50 bg-accent-violet/10'
                          : isVerified
                            ? 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                            : 'cursor-not-allowed border-white/[0.06] bg-white/[0.01] opacity-60',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-content">{p.projectName}</p>
                        <p className="text-xs text-content-faint">
                          {formatNumber(p.expectedAnnualTonnes)} t/yr expected
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isVerified && <Lock className="h-3.5 w-3.5 text-content-faint" />}
                        <Badge tone={STATUS_TONE[p.status]}>{p.status.replace('_', ' ')}</Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {!filtered.some((p) => p.status === 'VERIFIED') && !projectsLoading && (
              <p className="text-xs text-content-faint">
                Only projects with a VERIFIED Stage 3 report can be issued. Run verification on a
                project first, then return here.
              </p>
            )}

            {/* Eligibility + issuance detail */}
            {eligibleLoading && (
              <p className="flex items-center gap-2 text-sm text-content-faint">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…
              </p>
            )}

            {eligibleError && <Notice tone="error">{eligibleError}</Notice>}

            {eligible && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge tone={eligible.eligible ? 'emerald' : 'rose'}>
                    {eligible.eligible ? (
                      <>
                        <CheckCircle2 className="mr-1 h-3 w-3" /> ELIGIBLE
                      </>
                    ) : (
                      'NOT ELIGIBLE'
                    )}
                  </Badge>
                  <span className="text-xs text-content-faint">Status: {eligible.status}</span>
                </div>

                <DefinitionList>
                  <KeyValue label="Project" value={selectedProject?.projectName ?? eligible.projectId} />
                  <KeyValue label="Methodology" value={eligible.methodology || '—'} />
                  <KeyValue label="Confidence" value={`${eligible.confidenceScore}`} />
                  <KeyValue label="Verified tonnes" value={formatNumber(eligible.verifiedTonnes)} />
                  <KeyValue
                    label="Credits to mint (1:1)"
                    value={`${eligible.amount ?? Math.floor(eligible.verifiedTonnes)}`}
                  />
                  <KeyValue label="Report CID" value={short(eligible.reportCid, 10)} mono />
                </DefinitionList>

                {eligible.eligible ? (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <PremiumInput
                      label="Recipient wallet (base58)"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Wallet that will receive the credits"
                    />
                    <p className="text-xs text-content-faint">
                      The recipient wallet must be linked to a VerdiCred user (connect it in the
                      app first).
                    </p>
                    <PremiumInput
                      label="Vintage (optional)"
                      type="number"
                      min={1}
                      value={vintage}
                      onChange={(e) => setVintage(e.target.value)}
                      placeholder="Defaults to verification year"
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-content-muted">
                    {eligible.message || 'Latest report is not VERIFIED; issuance blocked.'}
                  </p>
                )}
              </div>
            )}

            {/* Issue CTA + progress */}
            {eligible?.eligible && (
              <div className="space-y-4">
                <GlowButton
                  onClick={handleIssue}
                  disabled={issueState === 'running' || !recipient}
                  className="w-full"
                >
                  {issueState === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Issuing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Issue Carbon Credits
                    </>
                  )}
                </GlowButton>

                {(issueState === 'running' || issueState === 'success' || issueState === 'error') && (
                  <ol className="space-y-2">
                    {ISSUE_STEPS.map((label, i) => (
                      <StepRow
                        key={label}
                        label={label}
                        state={
                          issueState === 'success'
                            ? 'done'
                            : i === 0 && eligible
                              ? 'done'
                              : i < activeStep
                                ? 'done'
                                : i === activeStep && issueState === 'running'
                                  ? 'active'
                                  : i === activeStep && issueState === 'error'
                                    ? 'error'
                                    : 'pending'
                        }
                      />
                    ))}
                  </ol>
                )}
              </div>
            )}

            {/* On-chain result */}
            {issueResult && issueState === 'success' && (
              <div className="mt-4 rounded-2xl border border-accent-emerald/25 bg-accent-emerald/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-accent-emerald">
                  <BadgeCheck className="h-5 w-5" />
                  <span className="text-sm font-semibold">
                    Issued {issueResult.amount} credits (vintage {issueResult.vintage})
                  </span>
                </div>
                <DefinitionList>
                  <ResultRow label="Mint address" value={issueResult.mint} explorer={accountExplorer(issueResult.mint)} />
                  <ResultRow label="Batch PDA" value={issueResult.batchPda} explorer={accountExplorer(issueResult.batchPda)} />
                  <ResultRow
                    label="Transaction"
                    value={issueResult.txSignature}
                    explorer={solanaTxLink(issueResult.txSignature, 'devnet') ?? undefined}
                  />
                  <ResultRow label="Owner wallet" value={recipient} />
                  <ResultRow label="Project" value={issueResult.projectId} />
                </DefinitionList>
                {batches && batches.length > 0 && batches[0].createdAt && (
                  <p className="mt-2 text-xs text-content-faint">
                    Issuance time: {new Date(batches[0].createdAt * 1000).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.section>

        {/* On-chain audit */}
        <AuditSection
          mint={mint}
          setMint={setMint}
          onAudit={async () => {
            if (!token || !selectedId) {
              setAuditError(selectedId ? 'Not authenticated.' : 'Select a project to load its on-chain ledger.');
              return;
            }
            await refreshProjectAudit(selectedId, mint || configuredMint);
          }}
          busy={auditBusy}
          error={auditError}
          batches={batches}
          retirements={retirements}
        />
      </div>
    </AppShell>
  );
}

/* A single step in the issuance progress flow. */
function StepRow({ label, state }: { label: string; state: 'done' | 'active' | 'error' | 'pending' }) {
  const tone =
    state === 'done'
      ? 'text-accent-emerald'
      : state === 'active'
        ? 'text-accent-violet'
        : state === 'error'
          ? 'text-rose-300'
          : 'text-content-faint';
  return (
    <li className="flex items-center gap-3">
      <span className={`flex h-5 w-5 items-center justify-center ${tone}`}>
        {state === 'done' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : state === 'active' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'error' ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
        )}
      </span>
      <span className={`text-sm ${tone}`}>{label}</span>
    </li>
  );
}

/* A result row with copy + explorer actions. */
function ResultRow({ label, value, explorer }: { label: string; value: string; explorer?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-content-faint">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs text-content-muted">{short(value, 10)}</span>
        <button
          onClick={copy}
          title="Copy"
          className="shrink-0 text-content-faint transition-colors hover:text-content"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-accent-emerald" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        {explorer && (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            title="View on Solana Explorer"
            className="shrink-0 text-content-faint transition-colors hover:text-accent-violet"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </dd>
    </div>
  );
}

function AuditSection({
  mint,
  setMint,
  onAudit,
  busy,
  error,
  batches,
  retirements,
}: {
  mint: string;
  setMint: (v: string) => void;
  onAudit: () => void;
  busy: boolean;
  error: string | null;
  batches: CreditBatchView[] | null;
  retirements: RetirementView[] | null;
}) {
  return (
    <motion.section
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="glass relative overflow-hidden rounded-3xl p-6 shadow-float"
    >
      <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-accent-cyan/20 blur-3xl" />
      <motion.div variants={riseItem} className="relative mb-5">
        <h2 className="text-lg font-semibold text-content">On-chain audit</h2>
        <p className="text-sm text-content-muted">
          Read the issuance and retirement ledgers for a credit mint.
        </p>
      </motion.div>

      <motion.div variants={riseItem} className="relative space-y-4">
        <PremiumInput
          label="Credit mint address"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Credit mint (base58)"
        />
        <GlowButton onClick={onAudit} disabled={busy || !mint} variant="secondary" className="w-full">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </>
          ) : (
            'Load ledgers'
          )}
        </GlowButton>

        {error && <Notice tone="error">{error}</Notice>}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-content">
            <ScrollText className="h-4 w-4 text-accent-cyan" /> Issuance batches
          </h3>
          {batches && batches.length > 0 ? (
            <div className="space-y-2">
              {batches.map((b) => (
                <div key={b.batchPda || b.mint + b.projectId + b.vintage} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                  <DefinitionList>
                    <KeyValue label="Project" value={short(b.projectId, 8) || 'Not available'} mono />
                    <KeyValue label="Vintage" value={b.vintage != null ? `${b.vintage}` : 'Not available'} />
                    <KeyValue label="Methodology" value={b.methodology || 'Not available'} />
                    <KeyValue label="Minted / Retired" value={`${b.totalMinted ?? 0} / ${b.totalRetired ?? 0}`} />
                    <KeyValue label="Report CID" value={b.reportCid ? short(b.reportCid, 8) : 'Not available'} mono />
                    <KeyValue label="Batch PDA" value={b.batchPda ? short(b.batchPda, 10) : 'Not available'} mono />
                  </DefinitionList>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-content-faint">
              {batches ? 'No batches found for this project/mint.' : 'Not loaded.'}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-content">
            <Flame className="h-4 w-4 text-accent-pink" /> Retirements
          </h3>
          {retirements && retirements.length > 0 ? (
            <div className="space-y-2">
              {retirements.map((r, i) => (
                <div key={r.batch + i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                  <DefinitionList>
                    <KeyValue label="Amount" value={`${r.amount}`} />
                    <KeyValue label="Reason" value={r.reason || '—'} />
                    <KeyValue label="Owner" value={short(r.owner)} mono />
                    <KeyValue label="When" value={new Date(r.timestamp * 1000).toLocaleString()} />
                  </DefinitionList>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-content-faint">{retirements ? 'No retirements recorded.' : 'Not loaded.'}</p>
          )}
        </div>
      </motion.div>
    </motion.section>
  );
}
