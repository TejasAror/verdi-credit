'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import {
  getListing,
  buyListing,
  cancelListing,
  provisionSellerKey,
  confirmSellerKey,
  prepareDeposit,
  confirmDeposit,
} from '@/lib/api';
import { Listing } from '@/lib/types';
import WalletButton from '@/components/WalletButton';
import {
  Badge,
  GlowButton,
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
import { Store, Loader2, ArrowLeft, ExternalLink, ShieldCheck, Coins } from 'lucide-react';
import { short, formatNumber, solanaTxLink } from '@/lib/format';

export default function CreditDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { session, token, loading } = useAuth();
  const { address, connected, submitTransaction, signMessage } = useWallet();
  const { success, error: toastError } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setPageLoading(true);
    setError(null);
    try {
      const data = await getListing(token, id);
      setListing(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listing.');
    } finally {
      setPageLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  const isSeller = !!address && !!listing && address === listing.seller;
  const canBuy = !!listing && listing.status === 'ACTIVE' && connected && !isSeller;
  const canCancel = !!listing && listing.status === 'ACTIVE' && isSeller;

  /**
   * Design A server-settled purchase: the buyer's Phantom wallet is NOT asked to
   * sign anything — the backend signs the seller's `transferCredit` with the
   * seller's custody key and returns the confirmed signature.
   */
  const handleBuy = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await buyListing(token, listing.id, address);
      setListing(updated);
      const msg = `Purchase complete. Server-settled: credits transferred to your wallet (tx ${short(updated.txSignature ?? '', 8)}).`;
      setNotice(msg);
      success('Purchase complete', msg);
    } catch (e: any) {
      setError(e?.message ?? 'Purchase failed.');
      toastError('Purchase failed', e?.message);
    } finally {
      setBusy(false);
    }
  }, [token, listing, address, success, toastError]);

  /** Provision + confirm the server-side settlement (custody) key for the seller. */
  const setupSellerKey = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const key = await provisionSellerKey(token, address);
      const message =
        `VerdiCred Marketplace Settlement Key\n\nWallet: ${address}\n` +
        `Custody key: ${key.publicKey}\nTimestamp: ${Date.now()}\n\n` +
        'Sign to authorize VerdiCred to settle your listed carbon credits.';
      const signature = await signMessage(message);
      await confirmSellerKey(token, key.id, message, signature);
      success('Sales wallet ready', 'Settlement key confirmed. You can now deposit credits.');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to set up the sales wallet.');
      toastError('Sales wallet setup failed', e?.message);
    } finally {
      setBusy(false);
    }
  }, [token, listing, address, signMessage, success, toastError, load]);

  /** Deposit the listed credits into the custody ATA (one seller-signed transfer). */
  const handleDeposit = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const prepared = await prepareDeposit(token, listing.id);
      const txSignature = await submitTransaction(prepared.transaction);
      const check = await confirmDeposit(token, listing.id, txSignature);
      if (check.funded) {
        success('Deposit confirmed', 'Credits moved into your sales wallet. Buyers can now complete purchases.');
      } else {
        toastError('Deposit pending', `Custody balance ${check.custodyBalance}/${check.amount} — the transfer may still be confirming.`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Deposit failed.');
      toastError('Deposit failed', e?.message);
    } finally {
      setBusy(false);
    }
  }, [token, listing, address, submitTransaction, success, toastError, load]);

  const handleCancel = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await cancelListing(token, listing.id, address);
      setListing(updated);
      setNotice('Listing cancelled.');
      success('Listing cancelled');
    } catch (e: any) {
      setError(e?.message ?? 'Cancel failed.');
      toastError('Cancel failed', e?.message);
    } finally {
      setBusy(false);
    }
  }, [token, listing, address, success, toastError]);

  if (loading || pageLoading) {
    return (
      <AppShell>
        <div className="glass animate-pulse rounded-3xl p-10 text-content-faint">Loading…</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell max="3xl">
        <EmptyState icon={<Store className="h-6 w-6" />} title="Sign in required" description="Please sign in to view credit details." />
      </AppShell>
    );
  }

  if (!listing) {
    return (
      <AppShell max="4xl">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="mt-4">
          <GlowButton variant="secondary" onClick={() => router.push('/marketplace')}>
            <ArrowLeft className="h-4 w-4" /> Back to marketplace
          </GlowButton>
        </div>
      </AppShell>
    );
  }

  const statusTone = listing.status === 'ACTIVE' ? 'emerald' : listing.status === 'SOLD' ? 'slate' : 'amber';

  return (
    <AppShell max="4xl">
      <Rise>
        <Link href="/marketplace" className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-faint transition-colors hover:text-content">
          <ArrowLeft className="h-4 w-4" /> Marketplace
        </Link>
      </Rise>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mt-4"><Notice tone="success">{notice}</Notice></div>}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-6 lg:col-span-2"
        >
          <motion.div variants={riseItem} className="glass rounded-3xl p-6 shadow-float">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-content">{listing.projectName || 'Carbon Credit'}</h1>
              <Badge tone={statusTone as any}>{listing.status}</Badge>
            </div>

            <Section title="Project">
              <KeyValue label="Project name" value={listing.projectName ?? '—'} />
              <KeyValue label="Project type" value={listing.projectType ?? '—'} />
              <KeyValue label="Methodology" value={listing.methodology ?? '—'} />
              <KeyValue label="Project ID" value={short(listing.projectId, 8)} mono />
            </Section>
            <Section title="Verification">
              <KeyValue label="Verified tonnes" value={listing.verifiedTonnes != null ? formatNumber(listing.verifiedTonnes) : '—'} />
              <KeyValue label="Vintage" value={`${listing.vintage ?? '—'}`} />
              <KeyValue label="Report CID" value={short(listing.reportCid, 8)} mono />
            </Section>
            <Section title="Ownership">
              <KeyValue label="Seller wallet" value={listing.seller} mono />
              <KeyValue label="Buyer wallet" value={listing.buyer ?? '— (unsold)'} mono />
              <KeyValue label="Credit ID (mint)" value={listing.creditId} mono />
              {listing.txSignature && <KeyValue label="Settlement tx" value={short(listing.txSignature, 8)} mono />}
              {listing.settledAt && <KeyValue label="Settled at" value={new Date(listing.settledAt).toLocaleString()} />}
            </Section>
          </motion.div>
        </motion.div>

        <aside className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl p-6 shadow-float"
          >
            <p className="text-sm text-content-faint">Price</p>
            <p className="text-3xl font-bold text-content">${formatNumber(listing.price)}</p>
            <p className="mt-1 text-sm text-content-muted">
              {listing.amount} credit{listing.amount === 1 ? '' : 's'} ·{' '}
              {listing.amount > 0 ? `$${(listing.price / listing.amount).toFixed(2)}/credit` : ''}
            </p>

            {!connected && listing.status === 'ACTIVE' && (
              <p className="mt-4 rounded-2xl border border-accent-amber/30 bg-accent-amber/10 px-3 py-2.5 text-sm text-accent-amber">
                Connect your Phantom wallet to buy or manage this listing.
              </p>
            )}

            {canBuy && (
              <GlowButton onClick={handleBuy} disabled={busy} className="mt-4 w-full">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : 'Buy now'}
              </GlowButton>
            )}

            {canCancel && (
              <GlowButton onClick={handleCancel} disabled={busy} variant="outline" className="mt-3 w-full !border-rose-500/30 !text-rose-300 hover:!bg-rose-500/10">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : 'Cancel listing'}
              </GlowButton>
            )}

            {isSeller && listing.status === 'ACTIVE' && (
              <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-content">Seller sales wallet</p>
                <p className="text-xs leading-relaxed text-content-faint">
                  Buyers purchase server-side through a dedicated settlement wallet, so you do
                  not need to be online. Set it up, then deposit the listed credits once.
                </p>

                {!listing.sellerKeyReady ? (
                  <GlowButton onClick={setupSellerKey} disabled={busy || !connected} className="w-full text-sm">
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</> : (<><ShieldCheck className="h-4 w-4" /> Set up sales wallet</>)}
                  </GlowButton>
                ) : (
                  <>
                    {listing.custodyAta && <KeyValue label="Sales wallet (ATA)" value={short(listing.custodyAta, 14)} mono />}
                    <KeyValue
                      label="Deposited"
                      value={listing.custodyFunded ? `${listing.amount}/${listing.amount} credits funded` : 'not yet funded'}
                    />
                    {!listing.custodyFunded && (
                      <GlowButton onClick={handleDeposit} disabled={busy || !connected} className="w-full text-sm">
                        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Depositing…</> : (<><Coins className="h-4 w-4" /> Deposit credits to sales wallet</>)}
                      </GlowButton>
                    )}
                    {listing.custodyFunded && (
                      <p className="text-center text-xs text-emerald-300">Ready — buyers can complete purchases.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {listing.status !== 'ACTIVE' && (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-sm text-content-muted">
                This listing is {listing.status.toLowerCase()}.
              </p>
            )}

            {listing.explorerUrl && (
              <a href={listing.explorerUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-accent-pink hover:underline">
                View settlement on explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="mt-3"><WalletButton /></div>
          </motion.div>
        </aside>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 py-4 first:border-t-0 first:pt-0">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-content-faint">{title}</h2>
      <DefinitionList>{children}</DefinitionList>
    </div>
  );
}
