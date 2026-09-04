/** Shared formatting + display helpers used across the redesigned UI. */

/** Truncate a long base58 id / signature for compact display. */
export function short(s: string | null | undefined, n = 6): string {
  if (!s) return '—';
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

/** Truncate the middle of a long string (keeps a readable prefix + suffix). */
export function mid(s: string | null | undefined, head = 8, tail = 6): string {
  if (!s) return '—';
  return s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export function formatDate(input: string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(input: string | number | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function formatTonnes(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString()} tCO₂e`;
}

/** Link to a Solana explorer tx for the configured cluster. */
export function solanaTxLink(signature: string | null | undefined, cluster = 'devnet'): string | null {
  if (!signature) return null;
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function ipfsLink(cid: string | null | undefined): string | null {
  if (!cid) return null;
  return `https://ipfs.io/ipfs/${cid}`;
}

/**
 * Derive the stable human-readable certificate id (e.g. VC-RET-XXXXXXX) from
 * a retirement id. Mirrors the backend rule so the QR verify page can show the
 * certificate id publicly without an auth-gated database lookup.
 */
export function certificateIdFromRetirementId(retirementId: string | null | undefined): string | null {
  if (!retirementId) return null;
  const suffix = retirementId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return suffix ? `VC-RET-${suffix}` : null;
}
