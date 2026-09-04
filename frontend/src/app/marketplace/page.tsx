'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { listActiveListings, createListing } from '@/lib/api';
import { Listing, CreateListingRequest } from '@/lib/types';
import WalletButton from '@/components/WalletButton';
import {
  PremiumInput,
  GlowButton,
  Badge,
  Notice,
  EmptyState,
  AppShell,
  PageHeader,
  Stagger,
  Rise,
  riseItem,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import { Store, Plus, Loader2, ArrowRight, Leaf, Coins, Layers, CalendarRange } from 'lucide-react';
import { short, formatNumber } from '@/lib/format';

export default function MarketplacePage() {
  const { session, profile, token, loading } = useAuth();
  const { address, connected } = useWallet();
  const { success, error: toastError } = useToast();

  const [listings, setListings] = useState<Listing[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState<CreateListingRequest>({ creditId: '', seller: '', price: 0, amount: 1 });
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
      toastError('Failed to load listings', e?.message);
    } finally {
      setListLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    if (session && token) load();
  }, [session, token, load]);

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
      const payload: CreateListingRequest = { ...form, seller: address, price: Number(form.price), amount: Number(form.amount) || 1 };
      const created = await createListing(token, payload);
      setNotice(`Listing created (${short(created.id)}).`);
      success('Listing created', `Credit ${short(created.creditId)} is now live.`);
      setShowCreate(false);
      setForm({ creditId: '', seller: address, price: 0, amount: 1 });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create listing.');
      toastError('Failed to create listing', e?.message);
    } finally {
      setCreating(false);
    }
  }, [token, connected, address, form, load, success, toastError]);

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
        <EmptyState icon={<Store className="h-6 w-6" />} title="Sign in required" description="Please sign in to access the marketplace." />
      </AppShell>
    );
  }

  const canList = profile?.role === 'DEVELOPER' || profile?.role === 'BUYER' || profile?.role === 'ADMIN';

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="Stage 5 · Marketplace"
        title="Marketplace"
        subtitle="Browse, list, and buy verified carbon credits."
        icon={<Store className="h-6 w-6" />}
        actions={<WalletButton />}
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {notice && <div className="mb-5"><Notice tone="success">{notice}</Notice></div>}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content">
          Active listings <span className="text-sm font-normal text-content-faint">({listings.length})</span>
        </h2>
        {canList && (
          <GlowButton size="sm" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? 'Close' : <><Plus className="h-4 w-4" /> New listing</>}
          </GlowButton>
        )}
      </div>

      {showCreate && canList && (
        <motion.section
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="glass mb-8 overflow-hidden rounded-3xl p-6 shadow-float"
        >
          <h3 className="mb-4 text-base font-semibold text-content">List a carbon credit</h3>
          {!connected && (
            <p className="mb-4 rounded-2xl border border-accent-amber/30 bg-accent-amber/10 px-4 py-2.5 text-sm text-accent-amber">
              Connect your Phantom wallet — the connected address is used as the seller and must own
              the credit.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PremiumInput
              label="Credit ID (mint, base58)"
              value={form.creditId}
              onChange={(e) => setForm({ ...form, creditId: e.target.value })}
              placeholder="Credit mint address"
            />
            <PremiumInput
              label="Seller wallet"
              value={form.seller}
              readOnly
              placeholder="Connect wallet"
              className="font-mono text-xs"
            />
            <PremiumInput
              label="Price (USDC)"
              type="number"
              min={0}
              step="0.01"
              value={form.price || ''}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
            <PremiumInput
              label="Amount (credits)"
              type="number"
              min={1}
              value={form.amount || 1}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
            <PremiumInput
              label="Project name (optional)"
              value={form.projectName ?? ''}
              onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            />
            <PremiumInput
              label="Methodology (optional)"
              value={form.methodology ?? ''}
              onChange={(e) => setForm({ ...form, methodology: e.target.value })}
              placeholder="e.g. VM0036"
            />
          </div>
          <GlowButton
            onClick={handleCreate}
            disabled={creating || !form.creditId || !form.price || !connected}
            className="mt-5 w-full sm:w-auto"
          >
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : 'Create listing'}
          </GlowButton>
        </motion.section>
      )}

      {listLoading ? (
        <p className="text-content-faint">Loading listings…</p>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="No active listings yet"
          description={canList ? 'Be the first to list a verified carbon credit.' : undefined}
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </Stagger>
      )}
    </AppShell>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <motion.div variants={riseItem}>
      <Link
        href={`/marketplace/${listing.id}`}
        className="group flex h-full flex-col rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-glass transition-all duration-500 ease-premium hover:-translate-y-1.5 hover:border-white/15 hover:bg-white/[0.05]"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-content transition-colors group-hover:text-gradient">
            {listing.projectName || 'Carbon Credit'}
          </h3>
          <Badge tone="emerald">{listing.status}</Badge>
        </div>
        <div className="flex-1 space-y-1.5 text-sm">
          <Meta icon={<Layers className="h-3.5 w-3.5" />} label="Type" value={listing.projectType ?? '—'} />
          <Meta icon={<Leaf className="h-3.5 w-3.5" />} label="Methodology" value={listing.methodology ?? '—'} />
          <Meta icon={<CalendarRange className="h-3.5 w-3.5" />} label="Vintage" value={`${listing.vintage ?? '—'}`} />
          <Meta icon={<Coins className="h-3.5 w-3.5" />} label="Amount" value={`${listing.amount} credits`} />
          <div className="flex items-center justify-between">
            <span className="text-content-faint">Credit ID</span>
            <span className="font-mono text-xs text-content-faint">{short(listing.creditId)}</span>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
          <div>
            <p className="text-xs text-content-faint">Price</p>
            <p className="text-xl font-bold text-content">${formatNumber(listing.price)}</p>
          </div>
          <span className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-content-muted transition-colors group-hover:border-accent-pink/30 group-hover:text-accent-pink">
            View <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-content-faint">
        {icon} {label}
      </span>
      <span className="text-content">{value}</span>
    </div>
  );
}
