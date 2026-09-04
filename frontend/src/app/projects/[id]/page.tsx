'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  ApiError,
  checkEligible,
  getProject,
  listEvidence,
  uploadEvidence,
  getLatestVerification,
  runVerification,
} from '@/lib/api';
import { EligibleResponse, Evidence, EvidenceSource, EvidenceStatus, Project, VerificationReport } from '@/lib/types';
import {
  PremiumInput,
  Select,
  GlowButton,
  Badge,
  GlassCard,
  StatusBadge,
  Notice,
  EmptyState,
  KeyValue,
  DefinitionList,
  Modal,
  AppShell,
  PageHeader,
  Rise,
  riseItem as RiseItem,
  Stagger,
  staggerContainer,
  PremiumTable,
  TableRow,
  Td,
  Th,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import {
  FolderOpen,
  ArrowLeft,
  UploadCloud,
  FileText,
  MapPin,
  Loader2,
  Coins,
  Leaf,
  Layers,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Sparkles,
  FileDown,
  ShieldCheck,
} from 'lucide-react';
import {
  short,
  formatDate,
  formatDateTime,
  formatNumber,
  ipfsLink,
} from '@/lib/format';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_SOURCE_LABELS,
  EVIDENCE_ALLOWED_MIME,
  EVIDENCE_MAX_FILE_BYTES,
} from '@/lib/types';

const TYPE_TONE: Record<Project['projectType'], string> = {
  REFORESTATION: 'text-accent-emerald',
  SOIL_CARBON: 'text-accent-amber',
  RENEWABLE_ENERGY: 'text-accent-cyan',
};

const SOURCE_TONE: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  SENTINEL2: 'blue',
  LANDSAT: 'cyan',
  NASA_EARTHDATA: 'violet',
  OPENWEATHER: 'emerald',
  GEO_UPLOAD: 'pink',
};

const EVIDENCE_STATUS_TONE: Record<EvidenceStatus, Parameters<typeof Badge>[0]['tone']> = {
  PENDING: 'amber',
  VERIFIED: 'emerald',
  REJECTED: 'rose',
};

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session, profile, token, loading } = useAuth();
  const { success, error: toastError } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [verification, setVerification] = useState<VerificationReport | null>(null);
  const [issuance, setIssuance] = useState<EligibleResponse | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [issuanceLoading, setIssuanceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const canUpload =
    profile?.role === 'DEVELOPER' || profile?.role === 'ADMIN';
  // Verification may be run by Developer (own project), Auditor, or Admin.
  const canVerify =
    profile?.role === 'DEVELOPER' || profile?.role === 'AUDITOR' || profile?.role === 'ADMIN';
  const canIssue = profile?.role === 'AUDITOR' || profile?.role === 'ADMIN';

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setPageLoading(true);
    setError(null);
    setEvidenceError(null);
    setVerificationError(null);
    setIssuanceError(null);
    setEvidence([]);
    setVerification(null);
    setIssuance(null);
    try {
      const p = await getProject(token, projectId);
      setProject(p);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load project.');
      toastError('Failed to load project', e?.message);
      setPageLoading(false);
      return;
    }

    setPageLoading(false);
    setEvidenceLoading(true);
    setVerificationLoading(true);
    setIssuanceLoading(true);

    const [evResult, verificationResult, issuanceResult] = await Promise.allSettled([
      listEvidence(token, projectId),
      getLatestVerification(token, projectId),
      checkEligible(token, projectId),
    ]);

    if (evResult.status === 'fulfilled') {
      setEvidence(evResult.value);
    } else if (isNotFound(evResult.reason)) {
      setEvidence([]);
    } else {
      setEvidenceError(evResult.reason?.message ?? 'Failed to load evidence.');
    }
    setEvidenceLoading(false);

    if (verificationResult.status === 'fulfilled') {
      setVerification(verificationResult.value);
    } else if (isNotFound(verificationResult.reason)) {
      setVerification(null);
    } else {
      setVerificationError(verificationResult.reason?.message ?? 'Failed to load verification report.');
    }
    setVerificationLoading(false);

    if (issuanceResult.status === 'fulfilled') {
      setIssuance(issuanceResult.value);
    } else if (isNotFound(issuanceResult.reason)) {
      setIssuance(null);
    } else {
      setIssuanceError(issuanceResult.reason?.message ?? 'Failed to load issuance data.');
    }
    setIssuanceLoading(false);
  }, [token, projectId, toastError]);

  const refreshEvidence = useCallback(async () => {
    if (!token || !projectId) return;
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const ev = await listEvidence(token, projectId);
      setEvidence(ev);
    } catch (e: any) {
      if (isNotFound(e)) {
        setEvidence([]);
      } else {
        setEvidenceError(e?.message ?? 'Failed to load evidence.');
      }
    } finally {
      setEvidenceLoading(false);
    }
  }, [token, projectId]);

  const refreshVerificationAndIssuance = useCallback(async () => {
    if (!token || !projectId) return;
    setVerificationLoading(true);
    setIssuanceLoading(true);
    setVerificationError(null);
    setIssuanceError(null);

    const [verificationResult, issuanceResult] = await Promise.allSettled([
      getLatestVerification(token, projectId),
      checkEligible(token, projectId),
    ]);

    if (verificationResult.status === 'fulfilled') {
      setVerification(verificationResult.value);
    } else if (isNotFound(verificationResult.reason)) {
      setVerification(null);
    } else {
      setVerificationError(verificationResult.reason?.message ?? 'Failed to load verification report.');
    }
    setVerificationLoading(false);

    if (issuanceResult.status === 'fulfilled') {
      setIssuance(issuanceResult.value);
    } else if (isNotFound(issuanceResult.reason)) {
      setIssuance(null);
    } else {
      setIssuanceError(issuanceResult.reason?.message ?? 'Failed to load issuance data.');
    }
    setIssuanceLoading(false);
  }, [token, projectId]);

  const refreshProject = useCallback(async () => {
    if (!token || !projectId) return;
    try {
      setProject(await getProject(token, projectId));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to refresh project.');
    }
  }, [token, projectId]);

  // Refresh everything the detail page shows without letting child resources fail the page.
  const refreshData = useCallback(async () => {
    await Promise.all([refreshProject(), refreshEvidence(), refreshVerificationAndIssuance()]);
  }, [refreshProject, refreshEvidence, refreshVerificationAndIssuance]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  const runVerify = useCallback(async () => {
    if (!token || !projectId || verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      await runVerification(token, projectId);
      success('Verification complete', 'The AI report has been generated and pinned to IPFS.');
      // Pull the fresh project + report so the new state shows immediately.
      await refreshData();
    } catch (e: any) {
      setVerifyError(e?.message ?? 'Verification failed.');
      toastError('Verification failed', e?.message);
    } finally {
      setVerifyBusy(false);
    }
  }, [token, projectId, verifyBusy, refreshData, success, toastError]);

  if (loading || pageLoading) {
    return (
      <AppShell>
        <div className="glass animate-pulse rounded-3xl p-10 text-content-faint">Loading project…</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell max="3xl">
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="Sign in required"
          description="Please sign in to view project details."
        />
      </AppShell>
    );
  }

  if (error && !project) {
    return (
      <AppShell max="4xl">
        <Rise>
          <Link
            href="/developer"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-faint transition-colors hover:text-content"
          >
            <ArrowLeft className="h-4 w-4" /> Back to projects
          </Link>
        </Rise>
        <Notice tone="error">{error}</Notice>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell max="4xl">
        <Rise>
          <Link
            href="/developer"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-faint transition-colors hover:text-content"
          >
            <ArrowLeft className="h-4 w-4" /> Back to projects
          </Link>
        </Rise>
        <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="Project not found" />
      </AppShell>
    );
  }

  return (
    <AppShell max="6xl">
      <Rise>
        <Link
          href="/developer"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-faint transition-colors hover:text-content"
        >
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Link>
      </Rise>

      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <PageHeader
        title={project.projectName}
        subtitle={`${project.projectType.replace('_', ' ')} · ${project.methodology}`}
        icon={<FolderOpen className="h-6 w-6" />}
        badge="Stage 1 · Project Detail"
        actions={
          canUpload ? (
            <UploadEvidenceButton
              token={token!}
              projectId={project.id}
              onUploaded={refreshEvidence}
            />
          ) : undefined
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <motion.div variants={RiseItem}>
          <GlassCard className="!p-5">
            <p className="text-xs uppercase tracking-wide text-content-faint">Status</p>
            <div className="mt-2">
              <StatusBadge status={project.status} />
            </div>
          </GlassCard>
        </motion.div>
        <motion.div variants={RiseItem}>
          <GlassCard className="!p-5">
            <p className="text-xs uppercase tracking-wide text-content-faint">Type</p>
            <p className={`mt-2 font-semibold ${TYPE_TONE[project.projectType]}`}>
              {project.projectType.replace('_', ' ')}
            </p>
          </GlassCard>
        </motion.div>
        <motion.div variants={RiseItem}>
          <GlassCard className="!p-5">
            <p className="text-xs uppercase tracking-wide text-content-faint">Expected / yr</p>
            <p className="mt-2 text-xl font-bold text-content tabular-nums">
              {formatNumber(project.expectedAnnualTonnes)}
              <span className="ml-1 text-xs font-normal text-content-faint">tCO₂e</span>
            </p>
          </GlassCard>
        </motion.div>
        <motion.div variants={RiseItem}>
          <GlassCard className="!p-5">
            <p className="text-xs uppercase tracking-wide text-content-faint">Registered</p>
            <p className="mt-2 text-sm font-semibold text-content">
              {formatDate(project.createdAt)}
            </p>
          </GlassCard>
        </motion.div>
      </motion.div>

      <section className="mb-10">
        <Rise>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-content">
            <MapPin className="h-5 w-5 text-accent-pink" /> Geo Polygon
          </h2>
        </Rise>
        <GlassCard className="!p-5">
          <GeoPolygonView geoPolygon={project.geoPolygon} />
        </GlassCard>
      </section>

      <section className="mb-10">
        <Rise>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-content">
              <Layers className="h-5 w-5 text-accent-violet" /> Evidence
              <span className="text-sm font-normal text-content-faint">
                ({evidence.length})
              </span>
            </h2>
            {canUpload && (
              <UploadEvidenceButton
                token={token!}
                projectId={project.id}
                onUploaded={refreshEvidence}
                compact
              />
            )}
          </div>
        </Rise>

        {evidenceError && (
          <div className="mb-4">
            <Notice tone="error">{evidenceError}</Notice>
          </div>
        )}

        {evidenceLoading ? (
          <p className="text-sm text-content-faint">Loading evidence…</p>
        ) : evidence.length === 0 ? (
          <EmptyState
            icon={<UploadCloud className="h-6 w-6" />}
            title="No evidence yet"
            description={
              canUpload
                ? 'Upload satellite, sensor, or field evidence to support verification.'
                : 'This project has no evidence records.'
            }
            action={
              canUpload ? (
                <UploadEvidenceButton
                  token={token!}
                  projectId={project.id}
                  onUploaded={refreshEvidence}
                />
              ) : undefined
            }
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {evidence.map((ev) => (
              <EvidenceCard key={ev.id} ev={ev} />
            ))}
          </Stagger>
        )}
      </section>

      <section className="mb-10">
        <Rise>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-content">
              <Sparkles className="h-5 w-5 text-accent-violet" /> AI Verification
            </h2>
            {verification && (
              <StatusBadge status={verification.status} />
            )}
          </div>
        </Rise>
        {verificationLoading ? (
          <GlassCard className="!p-5">
            <p className="flex items-center gap-2 text-sm text-content-faint">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading verification…
            </p>
          </GlassCard>
        ) : (
          <VerificationSection
            verification={verification}
            canVerify={canVerify}
            busy={verifyBusy}
            error={verifyError ?? verificationError}
            onRun={runVerify}
          />
        )}
      </section>

      <section className="mb-10">
        <Rise>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-content">
            <Coins className="h-5 w-5 text-accent-amber" /> Carbon Credit Issuance
          </h2>
        </Rise>
        <IssuanceSection
          issuance={issuance}
          loading={issuanceLoading}
          error={issuanceError}
          canIssue={canIssue}
        />
      </section>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Carbon credit issuance section                                     */
/* ------------------------------------------------------------------ */

function IssuanceSection({
  issuance,
  loading,
  error,
  canIssue,
}: {
  issuance: EligibleResponse | null;
  loading: boolean;
  error: string | null;
  canIssue: boolean;
}) {
  if (loading) {
    return (
      <GlassCard className="!p-5">
        <p className="flex items-center gap-2 text-sm text-content-faint">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading issuance data…
        </p>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="!p-5">
        <Notice tone="error">{error}</Notice>
      </GlassCard>
    );
  }

  if (!issuance) {
    return (
      <EmptyState
        icon={<Coins className="h-6 w-6" />}
        title="No issuance data yet"
        description="Carbon credits become available after this project has a VERIFIED Stage 3 report."
      />
    );
  }

  const creditsToMint = issuance.amount ?? Math.floor(issuance.verifiedTonnes);

  return (
    <GlassCard className="!p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-content">Stage 4 issuance readiness</p>
          <p className="text-xs text-content-faint">{issuance.message ?? 'Latest verification report evaluated.'}</p>
        </div>
        <Badge tone={issuance.eligible ? 'emerald' : 'amber'}>
          {issuance.eligible ? 'Eligible' : 'Blocked'}
        </Badge>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCell label="Report status" value={issuance.status.replace('_', ' ')} />
        <MetricCell label="Confidence" value={`${issuance.confidenceScore}%`} tone={confidenceTone(issuance.confidenceScore)} />
        <MetricCell label="Verified t/yr" value={formatNumber(issuance.verifiedTonnes)} accent />
        <MetricCell label="Credits to mint" value={formatNumber(creditsToMint)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {issuance.reportCid && (
          <a
            href={ipfsLink(issuance.reportCid) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.02] px-5 py-2.5 text-sm font-semibold text-content transition-colors hover:border-white/25 hover:bg-white/[0.07]"
          >
            <ExternalLink className="h-4 w-4" /> View report proof
          </a>
        )}
        {canIssue ? (
          <Link
            href="/carbon-credits"
            className={[
              'inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-300',
              issuance.eligible
                ? 'bg-accent-gradient text-white shadow-glow hover:-translate-y-0.5'
                : 'border border-white/15 bg-white/[0.02] text-content-faint',
            ].join(' ')}
          >
            <Coins className="h-4 w-4" /> Issue Carbon Credits
          </Link>
        ) : (
          <p className="text-xs text-content-faint">Auditor or Admin access is required to issue credits.</p>
        )}
      </div>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence card                                                          */
/* ------------------------------------------------------------------ */

function EvidenceCard({ ev }: { ev: Evidence }) {
  const meta = (ev.metadata ?? {}) as { note?: string };
  const note = meta.note;
  return (
    <motion.div variants={RiseItem}>
      <div className="glass flex h-full flex-col rounded-3xl p-5 shadow-glass transition-all duration-500 ease-premium hover:-translate-y-1.5 hover:border-white/15">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={SOURCE_TONE[ev.source] ?? 'slate'}>{ev.source}</Badge>
            <Badge tone={EVIDENCE_STATUS_TONE[ev.status as EvidenceStatus] ?? 'slate'}>
              {ev.status}
            </Badge>
          </div>
          <FileText className="h-4 w-4 text-content-faint" />
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-content-faint">CID</dt>
            <dd className="font-mono text-xs text-content-muted">{short(ev.cid, 10)}</dd>
          </div>
          {ev.latitude != null && ev.longitude != null && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-faint">Coordinates</dt>
              <dd className="font-mono text-xs text-content-muted">
                {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}
              </dd>
            </div>
          )}
          {ev.timestamp && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-faint">Captured</dt>
              <dd className="text-xs text-content-muted">{formatDateTime(ev.timestamp)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-content-faint">Uploaded</dt>
            <dd className="text-xs text-content-muted">{formatDate(ev.createdAt)}</dd>
          </div>
        </dl>

        {note && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-content-muted">
            {note}
          </p>
        )}

        {ev.ipfsUrl && (
          <a
            href={ev.ipfsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-pink transition-colors hover:underline"
          >
            View on IPFS <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI Verification section                                            */
/* ------------------------------------------------------------------ */

type VerifyState = 'NOT_STARTED' | 'PROCESSING' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

const VERDICT_META: Record<VerifyState, { tone: Parameters<typeof Badge>[0]['tone']; label: string; blurb: string }> = {
  NOT_STARTED: {
    tone: 'slate',
    label: 'Not verified',
    blurb: 'Run the AI verification pipeline to aggregate evidence, score NDVI/carbon, detect anomalies, and generate a signed PDF report.',
  },
  PROCESSING: {
    tone: 'blue',
    label: 'Processing',
    blurb: 'The verification pipeline is running — aggregating evidence, computing NDVI, estimating carbon, scanning for anomalies, and generating the report.',
  },
  PENDING_VERIFICATION: {
    tone: 'amber',
    label: 'Pending verification',
    blurb: 'The pipeline ran but the confidence score is below the VERIFIED threshold. A human auditor should review before credits are issued.',
  },
  VERIFIED: {
    tone: 'emerald',
    label: 'Verified',
    blurb: 'The project passed the AI confidence threshold. Carbon credits may be issued against the verified tonnes.',
  },
  REJECTED: {
    tone: 'rose',
    label: 'Rejected',
    blurb: 'The pipeline found disqualifying signals (e.g. duplicate CID) or a confidence score below the reject threshold.',
  },
};

function confidenceTone(score: number): Parameters<typeof Badge>[0]['tone'] {
  if (score >= 70) return 'emerald';
  if (score >= 40) return 'amber';
  return 'rose';
}

function VerificationSection({
  verification,
  canVerify,
  busy,
  error,
  onRun,
}: {
  verification: VerificationReport | null;
  canVerify: boolean;
  busy: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const meta = (verification?.metadata ?? {}) as {
    notes?: string[];
    ndvi?: { mean?: number; health?: string };
    carbon?: { estimatedTonnes?: number; areaHa?: number; method?: string };
    evidence?: unknown[];
    expectedAnnualTonnes?: number;
  };

  const state: VerifyState = verification
    ? (verification.status as VerifyState)
    : 'NOT_STARTED';
  const info = VERDICT_META[state];

  const estimatedTonnes =
    verification?.metadata && typeof meta.carbon?.estimatedTonnes === 'number'
      ? meta.carbon.estimatedTonnes
      : null;
  const evidenceCount = Array.isArray(meta.evidence) ? meta.evidence.length : null;
  const notes: string[] = Array.isArray(meta.notes) ? meta.notes : [];

  return (
    <GlassCard className="!p-0">
      {/* Header band */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-violet">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-content">Verification report</p>
            <p className="text-xs text-content-faint">
              {verification ? `Run ${formatDateTime(verification.createdAt)}` : 'Stage 3 AI pipeline'}
            </p>
          </div>
        </div>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>

      <div className="px-5 py-5">
        {/* NOT_STARTED */}
        {state === 'NOT_STARTED' && (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-content-muted">{info.blurb}</p>
            {canVerify ? (
              <GlowButton onClick={onRun} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running verification…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Run Verification
                  </>
                )}
              </GlowButton>
            ) : (
              <p className="text-xs text-content-faint">
                Only Developer, Auditor, or Admin roles can run verification.
              </p>
            )}
          </div>
        )}

        {/* PROCESSING (should be brief, but handled for completeness) */}
        {state === 'PROCESSING' && (
          <div className="flex items-center gap-3 text-sm text-content-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {info.blurb}
          </div>
        )}

        {/* Results */}
        {verification && state !== 'NOT_STARTED' && state !== 'PROCESSING' && (
          <>
            <p className="mb-5 text-sm text-content-muted">{info.blurb}</p>

            {/* Key metrics */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCell label="Confidence" value={`${verification.confidenceScore}%`} tone={confidenceTone(verification.confidenceScore)} />
              <MetricCell label="NDVI score" value={verification.ndviScore != null ? verification.ndviScore.toFixed(3) : '—'} />
              <MetricCell label="Estimated t/yr" value={estimatedTonnes != null ? formatNumber(estimatedTonnes) : '—'} />
              <MetricCell label="Verified t/yr" value={formatNumber(verification.verifiedTonnes)} accent />
              <MetricCell label="Evidence" value={evidenceCount != null ? String(evidenceCount) : String(verification.metadata ? '—' : 0)} />
              <MetricCell label="Anomalies" value={String(verification.anomalyCount)} tone={verification.anomalyCount > 0 ? 'rose' : 'emerald'} />
              <MetricCell label="Expected t/yr" value={formatNumber(meta.expectedAnnualTonnes ?? null)} />
              <MetricCell label="Report CID" value={short(verification.reportCid, 5)} />
            </div>

            {/* Recommendation + business rules */}
            {notes.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  How the score was derived
                </p>
                <ul className="space-y-1.5">
                  {notes.map((n, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-content-muted"
                    >
                      <span className="mt-0.5 text-accent-violet">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Anomaly list */}
            {verification.anomalies.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-faint">
                  Anomalies detected
                </p>
                <div className="space-y-2">
                  {verification.anomalies.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <Badge tone={a.severity === 'HIGH' ? 'rose' : a.severity === 'MEDIUM' ? 'amber' : 'slate'}>
                        {a.severity}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-content">{a.type}</p>
                        <p className="text-xs text-content-faint">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report actions */}
            <div className="flex flex-wrap items-center gap-3">
              {verification.reportUrl && (
                <a
                  href={verification.reportUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5"
                >
                  <FileDown className="h-4 w-4" /> Download AI Report
                </a>
              )}
              {verification.reportCid && (
                <a
                  href={ipfsLink(verification.reportCid) ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.02] px-5 py-2.5 text-sm font-semibold text-content transition-colors hover:border-white/25 hover:bg-white/[0.07]"
                >
                  <ExternalLink className="h-4 w-4" /> View on IPFS
                </a>
              )}
              {canVerify && (
                <GlowButton variant="secondary" onClick={onRun} disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Re-running…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Re-run verification
                    </>
                  )}
                </GlowButton>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function MetricCell({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: Parameters<typeof Badge>[0]['tone'];
  accent?: boolean;
}) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-content-faint">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${accent ? 'text-gradient' : 'text-content'}`}>
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UploadEvidenceButton({
  token,
  projectId,
  onUploaded,
  compact,
}: {
  token: string;
  projectId: string;
  onUploaded: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GlowButton size={compact ? 'sm' : 'md'} variant="secondary" onClick={() => setOpen(true)}>
        <UploadCloud className="h-4 w-4" /> Upload Evidence
      </GlowButton>
      <UploadEvidenceModal
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        projectId={projectId}
        onUploaded={onUploaded}
      />
    </>
  );
}

function UploadEvidenceModal({
  open,
  onClose,
  token,
  projectId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  projectId: string;
  onUploaded: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [source, setSource] = useState<EvidenceSource>('GEO_UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const needsFile = source === 'GEO_UPLOAD';

  const reset = () => {
    setSource('GEO_UPLOAD');
    setFile(null);
    setLatitude('');
    setLongitude('');
    setTimestamp('');
    setNote('');
    setLocalError(null);
  };

  const handleSubmit = async () => {
    setLocalError(null);

    if (needsFile && !file) {
      setLocalError('GEO_UPLOAD requires a file (PNG, JPG, PDF, or JSON, ≤10MB).');
      return;
    }
    if (needsFile) {
      if (!EVIDENCE_ALLOWED_MIME.includes(file!.type as any)) {
        setLocalError(`Unsupported file type "${file!.type}".`);
        return;
      }
      if (file!.size > EVIDENCE_MAX_FILE_BYTES) {
        setLocalError('File exceeds the 10MB limit.');
        return;
      }
      if (!latitude || !longitude) {
        setLocalError('GEO_UPLOAD requires latitude and longitude.');
        return;
      }
    }

    const form = new FormData();
    form.append('projectId', projectId);
    form.append('source', source);
    if (file) form.append('file', file);
    if (latitude.trim()) form.append('latitude', latitude.trim());
    if (longitude.trim()) form.append('longitude', longitude.trim());
    if (timestamp.trim()) form.append('timestamp', timestamp.trim());
    if (note.trim()) form.append('note', note.trim());

    setBusy(true);
    try {
      await uploadEvidence(token, form);
      success('Evidence uploaded', 'Pinned to IPFS and recorded.');
      reset();
      onClose();
      onUploaded();
    } catch (e: any) {
      setLocalError(e?.message ?? 'Upload failed.');
      toastError('Upload failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload Evidence"
      description="Pin verifiable evidence to IPFS for this project."
      size="lg"
      footer={
        <>
          <GlowButton variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </GlowButton>
          <GlowButton className="flex-1" onClick={handleSubmit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              'Upload'
            )}
          </GlowButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">
            Source
          </label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as EvidenceSource)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content outline-none transition-all focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15"
          >
            {EVIDENCE_SOURCES.map((s) => (
              <option key={s} value={s} className="bg-ink-800">
                {EVIDENCE_SOURCE_LABELS[s]}
                {s === 'GEO_UPLOAD' ? ' (file)' : ' (remote)'}
              </option>
            ))}
          </select>
        </div>

        {needsFile && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">
              File (PNG / JPG / PDF / JSON, ≤10MB)
            </label>
            <input
              type="file"
              accept={EVIDENCE_ALLOWED_MIME.join(',')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-content-muted file:mr-4 file:rounded-full file:border-0 file:bg-accent-gradient file:px-4 file:py-1.5 file:text-white file:shadow-glow hover:border-white/25"
            />
            {file && (
              <p className="mt-2 text-xs text-content-faint">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
        )}

        {needsFile && (
          <div className="grid grid-cols-2 gap-4">
            <PremiumInput
              label="Latitude (-90..90)"
              type="number"
              step="0.0001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-3.4653"
            />
            <PremiumInput
              label="Longitude (-180..180)"
              type="number"
              step="0.0001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-62.2159"
            />
          </div>
        )}

        <PremiumInput
          label="Capture timestamp (optional, ISO-8601)"
          type="datetime-local"
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
        />

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-faint">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Field photo of planted saplings, plot A…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-content outline-none transition-all focus:border-accent-violet/60 focus:ring-4 focus:ring-accent-violet/15"
          />
        </div>

        {localError && <Notice tone="error">{localError}</Notice>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Geo polygon readout                                                */
/* ------------------------------------------------------------------ */

function GeoPolygonView({ geoPolygon }: { geoPolygon: unknown }) {
  let coords: [number, number][] = [];
  let summary = '';
  try {
    const parsed = typeof geoPolygon === 'string' ? JSON.parse(geoPolygon) : geoPolygon;
    const ring = parsed?.coordinates?.[0] ?? [];
    coords = ring.filter((p: unknown) => Array.isArray(p) && p.length >= 2) as [number, number][];
    if (coords.length > 0) {
      const lats = coords.map((c) => c[1]);
      const lngs = coords.map((c) => c[0]);
      const fmt = (n: number) => n.toFixed(4);
      summary = `${fmt(Math.min(...lats))}…${fmt(Math.max(...lats))} lat · ${fmt(Math.min(...lngs))}…${fmt(Math.max(...lngs))} lng`;
    }
  } catch {
    /* ignore */
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-pink">
          <MapPin className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-content">
            {coords.length} vertices
          </p>
          <p className="font-mono text-xs text-content-faint">
            {summary || 'Polygon (GeoJSON)'}
          </p>
        </div>
      </div>
      <pre className="scrollbar-premium mt-4 max-h-56 overflow-auto rounded-2xl border border-white/10 bg-ink-950/60 p-4 font-mono text-[11px] leading-relaxed text-content-muted">
        {JSON.stringify(
          typeof geoPolygon === 'string' ? safeParse(geoPolygon) : geoPolygon,
          null,
          2,
        )}
      </pre>
    </div>
  );
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
