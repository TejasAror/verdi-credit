'use client';

import { useWallet } from '@/lib/wallet-context';

function shortAddr(a: string, n = 4) {
  return a.length > n * 2 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

/**
 * WalletButton — connect / disconnect the Phantom wallet and show the address.
 * Reusable across the Marketplace and Credit Details pages.
 */
export default function WalletButton() {
  const { address, connected, connecting, connect, disconnect, error } =
    useWallet();

  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={address}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-mono text-xs text-emerald-800"
        >
          {shortAddr(address)}
        </span>
        <button
          onClick={disconnect}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
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
        className="rounded-lg bg-[#ab9ff2] px-4 py-1.5 text-sm font-semibold text-[#2a2438] transition hover:bg-[#9a8cf0] disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'Connect Phantom'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
