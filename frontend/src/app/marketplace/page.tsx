'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { listActiveListings, createListing } from '@/lib/api';
import { Listing, CreateListingRequest } from '@/lib/types';
import WalletButton from '@/components/WalletButton';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

function short(s: string, n = 6) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

export default function MarketplacePage() {
  const { session, profile, token, signOut, loading } = useAuth();
  const { address, connected } = useWallet();

  const [listings, setListings] = useState<Listing[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // create form
  const [form, setForm] = useState<CreateListingRequest>({
    creditId: '',
    seller: '',
    price: 0,
    amount: 1,
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setError(null);
    try {
      const data = await listActiveListings(token);
      setListings(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listings.');
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

  // keep the seller field synced to the connected wallet
  useEffect(() => {
    if (address) setForm((f) => ({ ...f, seller: address }));
  }, [address]);

  const handleCreate = useCallback(async () => {
    if (!token) return;
    if (!connected || !address) {
      setError('Connect your Phantom wallet to create a listing.');
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const payload: CreateListingRequest = {
        ...form,
        seller: address,
        price: Number(form.price),
        amount: Number(form.amount) || 1,
      };
      const created = await createListing(token, payload);
      setNotice(`Listing created (${short(created.id)}).`);
      setShowCreate(false);
      setForm({ creditId: '', seller: address, price: 0, amount: 1 });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create listing.');
    } finally {
      setCreating(false);
    }
  }, [token, connected, address, form, load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 text-slate-500">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to access the marketplace.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const canList =
    profile?.role === 'DEVELOPER' ||
    profile?.role === 'BUYER' ||
    profile?.role === 'ADMIN';

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            M
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Marketplace</h1>
            <p className="text-sm text-slate-500">
              Stage 5 — browse, list, and buy verified carbon credits.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <WalletButton />
          <Link
            href="/carbon-credits"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Credits
          </Link>
          <Link
            href="/developer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Projects
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
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Active listings{' '}
          <span className="text-sm font-normal text-slate-400">
            ({listings.length})
          </span>
        </h2>
        {canList && (
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {showCreate ? 'Close' : '+ New listing'}
          </button>
        )}
      </div>

      {showCreate && canList && (
        <section className="mb-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">
            List a carbon credit
          </h3>
          {!connected && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Connect your Phantom wallet — the connected address is used as the
              seller and must own the credit.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Credit ID (mint, base58)
              </label>
              <input
                value={form.creditId}
                onChange={(e) => setForm({ ...form, creditId: e.target.value })}
                placeholder="Credit mint address"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Seller wallet
              </label>
              <input
                value={form.seller}
                readOnly
                placeholder="Connect wallet"
                className={`${inputClass} bg-slate-50 font-mono text-xs`}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Price (USDC)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price || ''}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Amount (credits)
              </label>
              <input
                type="number"
                min={1}
                value={form.amount || 1}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Project name (optional)
              </label>
              <input
                value={form.projectName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, projectName: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Methodology (optional)
              </label>
              <input
                value={form.methodology ?? ''}
                onChange={(e) =>
                  setForm({ ...form, methodology: e.target.value })
                }
                placeholder="e.g. VM0036"
                className={inputClass}
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !form.creditId || !form.price || !connected}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
          >
            {creating ? 'Creating…' : 'Create listing'}
          </button>
        </section>
      )}

      {listLoading ? (
        <p className="text-slate-500">Loading listings…</p>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-500">No active listings yet.</p>
          {canList && (
            <p className="mt-1 text-sm text-slate-400">
              Be the first to list a verified carbon credit.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </main>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900 group-hover:text-brand-700">
          {listing.projectName || 'Carbon Credit'}
        </h3>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          {listing.status}
        </span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Type</dt>
          <dd className="text-slate-800">{listing.projectType ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Methodology</dt>
          <dd className="text-slate-800">{listing.methodology ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Vintage</dt>
          <dd className="text-slate-800">{listing.vintage ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Amount</dt>
          <dd className="text-slate-800">{listing.amount} credits</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Credit ID</dt>
          <dd className="font-mono text-xs text-slate-500">
            {short(listing.creditId)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
        <div>
          <p className="text-xs text-slate-400">Price</p>
          <p className="text-xl font-bold text-slate-900">
            ${listing.price.toLocaleString()}
          </p>
        </div>
        <span className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 group-hover:bg-brand-600 group-hover:text-white">
          View →
        </span>
      </div>
    </Link>
  );
}
