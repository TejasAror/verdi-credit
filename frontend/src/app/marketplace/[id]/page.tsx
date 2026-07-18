'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { getListing, buyListing, cancelListing } from '@/lib/api';
import { Listing } from '@/lib/types';
import WalletButton from '@/components/WalletButton';

function short(s: string, n = 8) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

export default function CreditDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { session, token, signOut, loading } = useAuth();
  const { address, connected, signMessage } = useWallet();

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

  const isSeller =
    !!address && !!listing && address === listing.seller;
  const canBuy =
    !!listing &&
    listing.status === 'ACTIVE' &&
    connected &&
    !isSeller;
  const canCancel =
    !!listing && listing.status === 'ACTIVE' && isSeller;

  const handleBuy = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Authorize the purchase by signing a message with the connected wallet.
      await signMessage(
        `VerdiCred purchase authorization\nlisting:${listing.id}\ncredit:${listing.creditId}\nprice:${listing.price}`,
      );
      const updated = await buyListing(token, listing.id, address);
      setListing(updated);
      setNotice(
        `Purchase complete. Ownership transferred to your wallet (tx ${short(
          updated.txSignature ?? '',
        )}).`,
      );
    } catch (e: any) {
      setError(e?.message ?? 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  }, [token, listing, address, signMessage]);

  const handleCancel = useCallback(async () => {
    if (!token || !listing || !address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await cancelListing(token, listing.id, address);
      setListing(updated);
      setNotice('Listing cancelled.');
    } catch (e: any) {
      setError(e?.message ?? 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  }, [token, listing, address]);

  if (loading || pageLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-slate-500">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to view credit details.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-20">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'Listing not found.'}
        </p>
        <button
          onClick={() => router.push('/marketplace')}
          className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          ← Back to marketplace
        </button>
      </main>
    );
  }

  const statusColor =
    listing.status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700'
      : listing.status === 'SOLD'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-amber-50 text-amber-700';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/marketplace"
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Marketplace
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <WalletButton />
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {listing.projectName || 'Carbon Credit'}
              </h1>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
              >
                {listing.status}
              </span>
            </div>

            <Section title="Project">
              <Row label="Project name" value={listing.projectName ?? '—'} />
              <Row label="Project type" value={listing.projectType ?? '—'} />
              <Row label="Methodology" value={listing.methodology ?? '—'} />
              <Row
                label="Project ID"
                value={listing.projectId ? short(listing.projectId) : '—'}
                mono
              />
            </Section>

            <Section title="Verification">
              <Row
                label="Verified tonnes"
                value={
                  listing.verifiedTonnes != null
                    ? listing.verifiedTonnes.toLocaleString()
                    : '—'
                }
              />
              <Row label="Vintage" value={listing.vintage?.toString() ?? '—'} />
              <Row
                label="Report CID"
                value={listing.reportCid ?? '—'}
                mono
              />
            </Section>

            <Section title="Ownership">
              <Row label="Seller wallet" value={listing.seller} mono />
              <Row
                label="Buyer wallet"
                value={listing.buyer ?? '— (unsold)'}
                mono
              />
              <Row
                label="Credit ID (mint)"
                value={listing.creditId}
                mono
              />
              {listing.txSignature && (
                <Row
                  label="Settlement tx"
                  value={listing.txSignature}
                  mono
                />
              )}
              {listing.settledAt && (
                <Row
                  label="Settled at"
                  value={new Date(listing.settledAt).toLocaleString()}
                />
              )}
            </Section>
          </div>
        </div>

        {/* Pricing + actions */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-400">Price</p>
            <p className="text-3xl font-bold text-slate-900">
              ${listing.price.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {listing.amount} credit{listing.amount === 1 ? '' : 's'} ·{' '}
              {listing.amount > 0
                ? `$${(listing.price / listing.amount).toFixed(2)}/credit`
                : ''}
            </p>

            {!connected && listing.status === 'ACTIVE' && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Connect your Phantom wallet to buy or manage this listing.
              </p>
            )}

            {canBuy && (
              <button
                onClick={handleBuy}
                disabled={busy}
                className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? 'Processing…' : 'Buy now'}
              </button>
            )}

            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={busy}
                className="mt-3 w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                {busy ? 'Processing…' : 'Cancel listing'}
              </button>
            )}

            {isSeller && listing.status === 'ACTIVE' && (
              <p className="mt-3 text-center text-xs text-slate-400">
                You own this listing.
              </p>
            )}

            {listing.status !== 'ACTIVE' && (
              <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-center text-sm text-slate-600">
                This listing is {listing.status.toLowerCase()}.
              </p>
            )}

            {listing.explorerUrl && (
              <a
                href={listing.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block text-center text-xs font-medium text-brand-700 hover:underline"
              >
                View settlement on explorer →
              </a>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 py-4 first:border-t-0 first:pt-0">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
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
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={`text-right text-slate-800 ${
          mono ? 'break-all font-mono text-xs text-slate-500' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
