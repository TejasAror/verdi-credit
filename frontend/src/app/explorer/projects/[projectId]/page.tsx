'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getExplorerProject, getExplorerStatus } from '@/lib/api';
import { ProjectExplorerResult } from '@/lib/types';
import {
  Stat,
  Badge,
  PremiumTable,
  TableRow,
  Td,
  Timeline,
  Notice,
  Rise,
  riseItem,
  staggerContainer,
  pageVariants,
} from '@/components/design-system';
import { ArrowLeft, Loader2, Boxes, FileText, ShieldCheck } from 'lucide-react';
import { short, solanaTxLink, formatNumber, formatDateTime } from '@/lib/format';

export default function ProjectExplorerDetailPage() {
  const params = useParams();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;

  const [data, setData] = useState<ProjectExplorerResult | null>(null);
  const [cluster, setCluster] = useState('devnet');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getExplorerStatus().then((s) => setCluster(s.cluster)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExplorerProject(projectId);
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load project.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
        <p className="flex items-center gap-2 text-content-faint"><Loader2 className="h-4 w-4 animate-spin" /> Loading project…</p>
      </motion.main>
    );
  }

  if (error) {
    return (
      <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
        <Link href="/explorer" className="text-sm text-accent-pink hover:underline">← Back to Explorer</Link>
        <div className="mt-4"><Notice tone="error">{error}</Notice></div>
      </motion.main>
    );
  }

  if (!data || !data.found || !data.project) {
    return (
      <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
        <Link href="/explorer" className="text-sm text-accent-pink hover:underline">← Back to Explorer</Link>
        <p className="mt-4 text-content-muted">No project found for this id.</p>
      </motion.main>
    );
  }

  const p = data.project;

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
      <Link href="/explorer" className="text-sm text-accent-pink transition-colors hover:underline">
        <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to Explorer
      </Link>

      <Rise>
        <header className="mt-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-content">{p.projectName ?? short(p.projectId, 10)}</h1>
            {p.status && <Badge tone="slate">{p.status}</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs text-content-faint">{p.projectId}</p>
          <p className="mt-1 text-sm text-content-muted">
            {p.projectType ?? '—'} · {p.methodology ?? '—'}
            {p.expectedAnnualTonnes != null ? ` · ${formatNumber(p.expectedAnnualTonnes)} tCO₂e/yr expected` : ''}
          </p>
        </header>
      </Rise>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: 'Credits minted', value: formatNumber(p.totalMinted), accent: true },
          { label: 'Credits retired', value: formatNumber(p.totalRetired), accent: true },
          { label: 'Circulating', value: formatNumber(p.circulatingSupply), accent: true },
          { label: 'Batches', value: formatNumber(p.creditIds.length) },
        ].map((s) => (
          <motion.div key={s.label} variants={riseItem}>
            <Stat label={s.label} value={s.value} accent={s.accent} />
          </motion.div>
        ))}
      </motion.div>

      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Lifecycle">
        <Timeline
          events={data.lifecycle.map((ev) => {
            const link = ev.txSignature ? solanaTxLink(ev.txSignature, cluster) : ev.link ?? null;
            return {
              stage: ev.stage,
              title: ev.title,
              description: ev.description,
              timestamp: ev.timestamp ? formatDateTime(ev.timestamp) : undefined,
              link: link ? { href: link, label: short(ev.txSignature ?? ev.refId, 8) } : null,
            };
          })}
          empty="No lifecycle events yet."
        />
      </Section>

      <Section icon={<Boxes className="h-4 w-4" />} title={`Credits (${p.creditIds.length})`}>
        {data.credits.length === 0 ? (
          <p className="text-sm text-content-faint">No on-chain credits issued yet.</p>
        ) : (
          <PremiumTable head={['Mint', 'Minted', 'Retired', 'Circulating', 'Status']}>
            {data.credits.map((c) => (
              <TableRow key={c.creditId}>
                <Td>
                  <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/credits/${c.creditId}`}>
                    {short(c.creditId, 8)}
                  </Link>
                </Td>
                <Td className="text-content-muted">{c.totalMinted}</Td>
                <Td className="text-content-muted">{c.totalRetired}</Td>
                <Td className="text-content-muted">{c.circulatingSupply}</Td>
                <Td>
                  {c.fullyRetired ? (
                    <Badge tone="rose">RETIRED</Badge>
                  ) : (
                    <Badge tone="emerald">{c.reportStatus ?? 'ACTIVE'}</Badge>
                  )}
                </Td>
              </TableRow>
            ))}
          </PremiumTable>
        )}
      </Section>

      <Section icon={<FileText className="h-4 w-4" />} title="Evidence & verification">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-content">Evidence ({data.evidence.length})</h3>
            {data.evidence.length === 0 ? (
              <p className="text-sm text-content-faint">None.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.evidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <Badge tone="blue">{e.source}</Badge>
                    <a className="font-mono text-accent-pink hover:underline" href={e.ipfsUrl ?? `https://ipfs.io/ipfs/${e.cid}`} target="_blank" rel="noreferrer">
                      {short(e.cid, 10)} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-content">Verification reports ({data.verificationReports.length})</h3>
            {data.verificationReports.length === 0 ? (
              <p className="text-sm text-content-faint">None.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.verificationReports.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Badge tone="emerald">{v.status}</Badge>
                    <span className="text-content-muted">{v.verifiedTonnes} tCO₂e · conf {v.confidenceScore}</span>
                    <a className="font-mono text-accent-pink hover:underline" href={v.reportUrl ?? `https://ipfs.io/ipfs/${v.reportCid}`} target="_blank" rel="noreferrer">
                      {short(v.reportCid, 8)} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section title={`Retirements (${data.retirements.length})`}>
        {data.retirements.length === 0 ? (
          <p className="text-sm text-content-faint">None retired yet.</p>
        ) : (
          <PremiumTable head={['Credit', 'Owner', 'Amount', 'Tx']}>
            {data.retirements.map((r) => (
              <TableRow key={r.id}>
                <Td>
                  <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/credits/${r.mint}`}>
                    {short(r.mint, 8)}
                  </Link>
                </Td>
                <Td className="font-mono text-xs text-content-faint">{short(r.owner, 6)}</Td>
                <Td className="text-content">{r.amount}</Td>
                <Td>
                  <a className="font-mono text-accent-pink hover:underline" href={solanaTxLink(r.signature, cluster) ?? '#'} target="_blank" rel="noreferrer">
                    {short(r.signature, 8)} ↗
                  </a>
                </Td>
              </TableRow>
            ))}
          </PremiumTable>
        )}
      </Section>
    </motion.main>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-content">
        {icon && <span className="text-accent-violet">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
