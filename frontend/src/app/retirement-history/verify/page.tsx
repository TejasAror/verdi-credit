'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AppShell,
  PageHeader,
  Badge,
  Notice,
  EmptyState,
  KeyValue,
  DefinitionList,
  GlowButton,
  Rise,
} from '@/components/design-system';
import {
  ShieldCheck,
  ShieldQuestion,
  Loader2,
  FileText,
  ExternalLink,
  ArrowRight,
  ScanLine,
} from 'lucide-react';
import { certificateIdFromRetirementId } from '@/lib/format';

function VerifyPageInner() {
  const params = useSearchParams();
  const rid = params.get('rid');
  const cid = params.get('cid');

  const certificateId = certificateIdFromRetirementId(rid);
  const ipfsUrl = cid ? `https://ipfs.io/ipfs/${cid}` : null;

  const [checking, setChecking] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkIpfs = useCallback(async () => {
    if (!cid) return;
    setChecking(true);
    setError(null);
    setReachable(null);
    try {
      const res = await fetch(`https://ipfs.io/ipfs/${cid}`, { cache: 'no-store' });
      if (!res.ok) {
        setReachable(false);
        setError(`The IPFS gateway could not retrieve the certificate (HTTP ${res.status}).`);
        return;
      }
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('application/pdf')) {
        setReachable(false);
        setError(`The content at this CID is not a PDF (got "${type}").`);
        return;
      }
      setReachable(true);
    } catch {
      setReachable(false);
      setError('The IPFS gateway could not reach the certificate. It may be pinning, or the CID is invalid.');
    } finally {
      setChecking(false);
    }
  }, [cid]);

  useEffect(() => {
    if (cid) void checkIpfs();
  }, [cid, checkIpfs]);

  return (
    <AppShell max="4xl">
      <PageHeader
        badge="Scan-to-Verify"
        title="Certificate Verification"
        subtitle="Verify a VerdiCred retirement certificate from its public QR code."
        icon={<ScanLine className="h-6 w-6" />}
      />

      {!rid ? (
        <Rise>
          <EmptyState
            icon={<ShieldQuestion className="h-6 w-6" />}
            title="Missing retirement reference"
            description="This verification link is incomplete. Scan a full certificate QR code, or open a certificate's verification URL."
            action={
              <Link href="/retirement-history">
                <GlowButton variant="secondary">View retirements</GlowButton>
              </Link>
            }
          />
        </Rise>
      ) : (
        <Rise>
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <div className="glass rounded-3xl border border-white/[0.07] p-6 shadow-float">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-content">Retirement Certificate</h2>
                  <p className="text-sm text-content-muted">
                    {certificateId ?? 'Unrecognized certificate reference'}
                  </p>
                </div>
                {reachable === true ? (
                  <Badge tone="emerald">Certificate found</Badge>
                ) : reachable === false ? (
                  <Badge tone="amber">Not reachable</Badge>
                ) : cid ? (
                  <Badge tone="cyan">Checking IPFS…</Badge>
                ) : (
                  <Badge tone="cyan">Reference valid</Badge>
                )}
              </div>

              {cid && (
                <div className="mb-5">
                  {checking ? (
                    <Notice tone="warning">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking the certificate on IPFS…
                      </span>
                    </Notice>
                  ) : reachable === true ? (
                    <Notice tone="success">
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" /> The certificate file was found on
                        IPFS. The CID is content-addressed: its exact bytes cannot be altered without
                        changing the reference link.
                      </span>
                    </Notice>
                  ) : reachable === false ? (
                    <Notice tone="error">{error}</Notice>
                  ) : null}
                </div>
              )}

              {!cid && !checking && (
                <div className="mb-5">
                  <Notice tone="warning">
                    The certificate reference ID is valid. For privacy, the certificate PDF itself is
                    only shared from the retireer&apos;s account; a scanned QR printed on a certificate
                    that was pinned before its CID was known uses this ID-only reference.
                  </Notice>
                </div>
              )}

              <DefinitionList>
                <KeyValue label="Retirement ID" value={rid} mono />
                {certificateId && <KeyValue label="Certificate ID" value={certificateId} mono />}
                {cid && <KeyValue label="Certificate CID" value={cid} mono />}
              </DefinitionList>
            </div>

            <div className="flex flex-wrap gap-3">
              {ipfsUrl && (
                <a
                  href={ipfsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5"
                >
                  <FileText className="h-4 w-4" /> Open certificate PDF
                </a>
              )}
              {cid && !reachable && (
                <GlowButton variant="secondary" onClick={() => void checkIpfs()} disabled={checking}>
                  <Loader2 className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Re-check IPFS
                </GlowButton>
              )}
              <a
                href="https://explorer.solana.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-white/[0.08]"
              >
                <ExternalLink className="h-4 w-4" /> Solana explorer
              </a>
              <Link href="/retirement-history">
                <GlowButton variant="ghost">
                  <ArrowRight className="h-4 w-4" /> My retirements
                </GlowButton>
              </Link>
            </div>
          </motion.section>
        </Rise>
      )}
    </AppShell>
  );
}

export default function VerifyCertificatePage() {
  return (
    <Suspense
      fallback={
        <AppShell max="4xl">
          <div className="flex items-center gap-2 text-sm text-content-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Resolving certificate reference…
          </div>
        </AppShell>
      }
    >
      <VerifyPageInner />
    </Suspense>
  );
}