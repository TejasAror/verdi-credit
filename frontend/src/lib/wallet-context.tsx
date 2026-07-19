'use client';

/**
 * WalletContext — Phantom wallet integration via Solana Wallet Adapter.
 *
 * Wraps `@solana/wallet-adapter-phantom`'s `PhantomWalletAdapter` in a small
 * React context exposing exactly what the marketplace UI needs:
 *   - connect() / disconnect()
 *   - the connected public key (base58 address)
 *   - connecting / connected flags
 *   - signMessage() to authorize purchases (proves wallet control)
 *
 * We deliberately keep this thin (rather than pulling the full
 * @solana/wallet-adapter-react ConnectionProvider tree). Settlement is now LIVE
 * on Devnet: the backend builds owner-signed `transferCredit` / `retireCredit`
 * transactions and this adapter signs + submits them via `submitTransaction`,
 * so credits are moved on-chain by the owner's own wallet (client-signed flow).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { Connection, VersionedTransaction, Transaction } from '@solana/web3.js';

/** Solana cluster the frontend submits prepared transactions to. */
const SOLANA_CLUSTER = 'devnet';
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

interface WalletContextValue {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  installed: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  /**
   * Sign (by the connected wallet) and submit a base64-encoded transaction
   * returned by the backend (retirement burn / marketplace transfer), and
   * return the resulting on-chain signature. Used by the client-signed
   * settlement flow so credits are moved by the owner's wallet, not the server.
   */
  submitTransaction: (base64: string) => Promise<string>;
  error: string | null;
}

const WalletCtx = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => new PhantomWalletAdapter(), []);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Phantom injects `window.phantom.solana`; the adapter reports readiness.
    const check = () => {
      const ready =
        adapter.readyState === 'Installed' || adapter.readyState === 'Loadable';
      setInstalled(ready);
    };
    check();
    adapter.on('readyStateChange', check);

    const onConnect = () => setAddress(adapter.publicKey?.toBase58() ?? null);
    const onDisconnect = () => setAddress(null);
    adapter.on('connect', onConnect);
    adapter.on('disconnect', onDisconnect);

    // Reflect an already-connected session.
    if (adapter.connected && adapter.publicKey) {
      setAddress(adapter.publicKey.toBase58());
    }

    return () => {
      adapter.off('readyStateChange', check);
      adapter.off('connect', onConnect);
      adapter.off('disconnect', onDisconnect);
    };
  }, [adapter]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (adapter.readyState !== 'Installed' && adapter.readyState !== 'Loadable') {
        window.open('https://phantom.app/', '_blank');
        throw new Error('Phantom wallet is not installed.');
      }
      await adapter.connect();
      setAddress(adapter.publicKey?.toBase58() ?? null);
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to connect wallet.');
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    try {
      await adapter.disconnect();
    } finally {
      setAddress(null);
    }
  }, [adapter]);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!adapter.connected) throw new Error('Wallet not connected.');
      if (!adapter.signMessage) {
        throw new Error('This wallet does not support message signing.');
      }
      const bytes = new TextEncoder().encode(message);
      const sig = await adapter.signMessage(bytes);
      // base64-encode the signature bytes for transport.
      return btoa(String.fromCharCode(...sig));
    },
    [adapter],
  );

  const submitTransaction = useCallback(
    async (base64: string): Promise<string> => {
      if (!adapter.connected) throw new Error('Wallet not connected.');
      const buf = Buffer.from(base64, 'base64');
      // Anchor 0.32 emits VersionedTransactions; fall back to legacy.
      const tx = buf[0] === 0x80
        ? VersionedTransaction.deserialize(buf)
        : Transaction.from(buf);
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      // Phantom's sendTransaction signs with the connected wallet then submits.
      return adapter.sendTransaction(tx, connection, {
        preflightCommitment: 'confirmed',
      });
    },
    [adapter],
  );

  const value: WalletContextValue = {
    address,
    connected: !!address,
    connecting,
    installed,
    connect,
    disconnect,
    signMessage,
    submitTransaction,
    error,
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (ctx === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}
