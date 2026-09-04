'use client';

import { useWallet } from '@/lib/wallet-context';
import { short } from '@/lib/format';

/**
 * WalletButton — connect / disconnect the Phantom wallet and show the address.
 * Reusable across the Marketplace and Credit Details pages.
 */
export default function WalletButton() {
  const { address, connected, connecting, connect, disconnect, error } = useWallet();

  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={address}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1.5 font-mono text-[11px] text-accent-cyan"
        >
          <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-accent-cyan" />
          {short(address)}
        </span>
        <button
          onClick={disconnect}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:border-white/20 hover:text-content"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => connect().catch(() => undefined)}
        disabled={connecting}
        className="rounded-full bg-accent-gradient px-4 py-1.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'Connect Phantom'}
      </button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
