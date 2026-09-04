'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getExplorerCredit, getExplorerStatus } from '@/lib/api';
import { CreditExplorerResult } from '@/lib/types';
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
import { ArrowLeft, Loader2, FileText, ShieldCheck } from 'lucide-react';
import { short, solanaTxLink, formatDateTime, formatNumber } from '@/lib/format';

export default function CreditExplorerDetailPage() {
  const params = useParams();
  const creditId = Array.isArray(params.creditId) ? params.creditId[0] : params.creditId;

  const [data, setData] = useState<CreditExplorerResult | null>(null);
  const [cluster, setCluster] = useState('devnet');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getExplorerStatus().then((s) => setCluster(s.cluster)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!creditId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExplorerCredit(creditId);
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load credit.');
    } finally {
      setLoading(false);
    }
  }, [creditId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
        <p className="flex items-center gap-2 text-content-faint"><Loader2 className="h-4 w-4 animate-spin" /> Loading credit…</p>
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

  if (!data || !data.found || !data.credit) {
    return (
      <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
        <Link href="/explorer" className="text-sm text-accent-pink hover:underline">← Back to Explorer</Link>
        <p className="mt-4 text-content-muted">No credit found for this mint.</p>
      </motion.main>
    );
  }

  const c = data.credit;

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" className="mx-auto max-w-content px-4 pb-24 pt-28 sm:px-6">
      <Link href="/explorer" className="text-sm text-accent-pink transition-colors hover:underline">
        <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to Explorer
      </Link>

      <Rise>
        <header className="mt-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-content">Credit {short(c.creditId, 10)}</h1>
            {c.fullyRetired ? (
              <Badge tone="rose">FULLY RETIRED</Badge>
            ) : (
              <Badge tone="emerald">{c.reportStatus ?? 'ACTIVE'}</Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-content-faint">{c.creditId}</p>
          {c.projectId && (
            <p className="mt-1 text-sm text-content-muted">
              Project:{' '}
              <Link className="font-mono text-accent-pink hover:underline" href={`/explorer/projects/${c.projectId}`}>
                {short(c.projectId, 10)}
              </Link>{' '}
              {c.projectName ?? ''}
            </p>
          )}
        </header>
      </Rise>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: 'Total minted', value: formatNumber(c.totalMinted), accent: true },
          { label: 'Total retired', value: formatNumber(c.totalRetired), accent: true },
          { label: 'Circulating', value: formatNumber(c.circulatingSupply), accent: true },
          { label: 'Transfers', value: formatNumber(c.transferCount) },
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

      <Section icon={<ArrowLeft className="h-4 w-4" />} title="Ownership history">
        <PremiumTable head={['From', 'To', 'Amount', 'Tx']}>
          {data.ownershipHistory.length === 0 ? (
            <TableRow>
              <Td colSpan={4} className="text-center">No transfers recorded.</Td>
            </TableRow>
          ) : (
            data.ownershipHistory.map((t, i) => (
              <TableRow key={i}>
                <Td className="font-mono text-xs text-content-faint">{short(t.fromWallet, 6)}</Td>
                <Td className="font-mono text-xs text-content-faint">{short(t.toWallet, 6)}</Td>
                <Td className="text-content">{t.amount}</Td>
                <Td>
                  <a className="font-mono text-accent-pink hover:underline" href={solanaTxLink(t.signature, cluster) ?? '#'} target="_blank" rel="noreferrer">
                    {short(t.signature, 8)} ↗
                  </a>
                </Td>
              </TableRow>
            ))
          )}
        </PremiumTable>
      </Section>

      <Section title="Retirements">
        <PremiumTable head={['Owner', 'Amount', 'Reason', 'Tx']}>
          {data.retirements.length === 0 ? (
            <TableRow>
              <Td colSpan={4} className="text-center">None retired yet.</Td>
            </TableRow>
          ) : (
            data.retirements.map((r, i) => (
              <TableRow key={i}>
                <Td className="font-mono text-xs text-content-faint">{short(r.owner, 6)}</Td>
                <Td className="text-content">{r.amount}</Td>
                <Td className="text-content-muted">{r.reason ?? '—'}</Td>
                <Td>
                  <a className="font-mono text-accent-pink hover:underline" href={solanaTxLink(r.signature, cluster) ?? '#'} target="_blank" rel="noreferrer">
                    {short(r.signature, 8)} ↗
                  </a>
                </Td>
              </TableRow>
            ))
          )}
        </PremiumTable>
      </Section>

      <Section title="On-chain events">
        <PremiumTable head={['Type', 'Slot', 'Tx']}>
          {data.events.length === 0 ? (
            <TableRow>
              <Td colSpan={3} className="text-center">No events indexed.</Td>
            </TableRow>
          ) : (
            data.events.map((e, i) => (
              <TableRow key={i}>
                <Td><Badge tone="slate">{e.eventType}</Badge></Td>
                <Td className="font-mono text-xs text-content-faint">{e.slot}</Td>
                <Td>
                  <a className="font-mono text-accent-pink hover:underline" href={solanaTxLink(e.signature, cluster) ?? '#'} target="_blank" rel="noreferrer">
                    {short(e.signature, 8)} ↗
                  </a>
                </Td>
              </TableRow>
            ))
          )}
        </PremiumTable>
      </Section>

      <Section icon={<FileText className="h-4 w-4" />} title="Evidence & verification">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-content">Evidence</h3>
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
            <h3 className="mb-2 text-sm font-semibold text-content">Verification reports</h3>
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
