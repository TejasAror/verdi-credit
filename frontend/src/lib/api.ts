import { API_BASE_URL } from './supabase';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Calls the VerdiCred backend with the Supabase access token attached.
 * Returns parsed JSON or throws with the server error message.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (body && (body as any).message) ||
      (body && (body as any).error) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

/**
 * Uploads a file + metadata as multipart/form-data to the evidence endpoint.
 * Unlike apiFetch, this does NOT set a JSON Content-Type — the browser
 * sets the multipart boundary automatically so the backend's FileInterceptor
 * can parse the `file` part.
 */
export async function uploadEvidence(
  token: string,
  form: FormData,
): Promise<import('./types').Evidence> {
  const res = await fetch(`${API_BASE_URL}/evidence/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (body && (body as any).message) ||
      (body && (body as any).error) ||
      `Upload failed with status ${res.status}`;
    throw new Error(message);
  }

  return body as import('./types').Evidence;
}

// ---- Project detail + evidence (Stage 1-2) ----

/** GET /projects — any authenticated user. Used to populate the issuer selector. */
export function listProjects(token: string) {
  return apiFetch<import('./types').Project[]>(`/projects`, { token });
}

/** GET /projects/:id — any authenticated user (used by the detail page). */
export function getProject(token: string, id: string) {
  return apiFetch<import('./types').Project>(
    `/projects/${encodeURIComponent(id)}`,
    { token },
  );
}

/** GET /projects/:id/evidence — any authenticated user (read-only access). */
export function listEvidence(token: string, projectId: string) {
  return apiFetch<import('./types').Evidence[]>(
    `/projects/${encodeURIComponent(projectId)}/evidence`,
    { token },
  );
}

// ---- Stage 3: AI Verification (orchestrator) ----

/** GET /verification/project/:id/latest — latest report for a project (any authenticated user).
 *  Throws (404) when no report exists yet; callers treat that as NOT_STARTED. */
export function getLatestVerification(token: string, projectId: string) {
  return apiFetch<import('./types').VerificationReport>(
    `/verification/project/${encodeURIComponent(projectId)}/latest`,
    { token },
  );
}

/** POST /verification/:projectId/verify — run the full pipeline (Developer/Auditor/Admin).
 *  Returns the freshly created report. */
export function runVerification(
  token: string,
  projectId: string,
  note?: string,
) {
  return apiFetch<import('./types').VerificationReport>(
    `/verification/${encodeURIComponent(projectId)}/verify`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(note ? { note } : {}),
    },
  );
}

// ---- Auth endpoints ----

/** POST /auth/link-wallet — link Phantom wallet to authenticated user. */
export function linkWallet(
  token: string,
  walletAddress: string,
  signature: string,
  message: string,
) {
  return apiFetch<{ id: string; walletAddress: string; email: string | null; role: string }>(
    '/auth/link-wallet',
    {
      method: 'POST',
      token,
      body: JSON.stringify({ walletAddress, signature, message }),
    },
  );
}

/** POST /auth/profile — provision / fetch the VerdiCred profile for the auth user. */
export function provisionProfile(token: string) {
  return apiFetch<import('./types').VerdiCredUser>('/auth/profile', {
    method: 'POST',
    token,
  });
}

/** GET /auth/me — get the current authenticated profile. */
export function getProfile(token: string) {
  return apiFetch<import('./types').VerdiCredUser>('/auth/me', { token });
}

/** GET /admin/users — list all users (Admin only). */
export function listUsers(token: string) {
  return apiFetch<import('./types').VerdiCredUser[]>('/admin/users', { token });
}

export function listAuditLogs(token: string) {
  return apiFetch<import('./types').AuditLogEntry[]>('/admin/audit-logs', {
    token,
  });
}

export function changeUserRole(
  token: string,
  userId: string,
  role: import('./types').Role,
  reason?: string,
) {
  return apiFetch<import('./types').RoleChangeResult>(
    `/admin/users/${userId}/role`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ role, reason }),
    },
  );
}

// ---- Carbon Credits (Stage 4) ----

/** GET /carbon-credits/eligible/:projectId — any authenticated user. */
export function checkEligible(token: string, projectId: string) {
  return apiFetch<import('./types').EligibleResponse>(
    `/carbon-credits/eligible/${encodeURIComponent(projectId)}`,
    { token },
  );
}

/** POST /carbon-credits/issue — AUDITOR / ADMIN only. */
export function issueCredits(token: string, dto: import('./types').IssueCreditRequest) {
  return apiFetch<import('./types').IssueCreditResponse>('/carbon-credits/issue', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

/** GET /carbon-credits/:mint/batches — on-chain issuance ledger. */
export function getBatches(token: string, mint: string) {
  return apiFetch<import('./types').CreditBatchView[]>(
    `/carbon-credits/${encodeURIComponent(mint)}/batches`,
    { token },
  );
}

/** GET /carbon-credits/:mint/project/:projectId/batches — project-scoped ledger. */
export function getProjectBatches(token: string, mint: string, projectId: string) {
  return apiFetch<import('./types').CreditBatchView[]>(
    `/carbon-credits/${encodeURIComponent(mint)}/project/${encodeURIComponent(projectId)}/batches`,
    { token },
  );
}

/** GET /carbon-credits/:mint/retirements — on-chain retirement ledger. */
export function getRetirements(token: string, mint: string) {
  return apiFetch<import('./types').RetirementView[]>(
    `/carbon-credits/${encodeURIComponent(mint)}/retirements`,
    { token },
  );
}

/** GET /carbon-credits/:mint/project/:projectId/retirements — project-scoped retirements. */
export function getProjectRetirements(token: string, mint: string, projectId: string) {
  return apiFetch<import('./types').RetirementView[]>(
    `/carbon-credits/${encodeURIComponent(mint)}/project/${encodeURIComponent(projectId)}/retirements`,
    { token },
  );
}

/** GET /carbon-credits/config — configured program id + credit mint. */
export function getCarbonConfig(token: string) {
  return apiFetch<import('./types').CarbonCreditConfig>('/carbon-credits/config', {
    token,
  });
}

// ---- Marketplace (Stage 5) ----

/** GET /marketplace/listings — all ACTIVE listings. */
export function listActiveListings(token: string) {
  return apiFetch<import('./types').Listing[]>('/marketplace/listings', {
    token,
  });
}

/** GET /marketplace/listings/:id — single listing detail. */
export function getListing(token: string, id: string) {
  return apiFetch<import('./types').Listing>(
    `/marketplace/listings/${encodeURIComponent(id)}`,
    { token },
  );
}

/** POST /marketplace/listings — create a listing (owner only). */
export function createListing(
  token: string,
  dto: import('./types').CreateListingRequest,
) {
  return apiFetch<import('./types').Listing>('/marketplace/listings', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

/** POST /marketplace/listings/:id/buy — purchase a listing (server-or-client settlement). */
export function buyListing(token: string, id: string, buyer: string, extra?: { sellerSecret?: string; txSignature?: string }) {
  return apiFetch<import('./types').Listing>(
    `/marketplace/listings/${encodeURIComponent(id)}/buy`,
    { method: 'POST', token, body: JSON.stringify({ buyer, ...extra }) },
  );
}

// ---- Stage 5b: Server-side settlement (Design A) ----

/**
 * POST /marketplace/seller-keys — provision a server-side settlement (custody)
 * key for the seller's linked wallet. Returns only the public key + ATA; the
 * secret is encrypted at rest and never leaves the backend.
 */
export function provisionSellerKey(token: string, walletAddress: string) {
  return apiFetch<import('./types').SellerKey>('/marketplace/seller-keys', {
    method: 'POST',
    token,
    body: JSON.stringify({ walletAddress }),
  });
}

/** POST /marketplace/seller-keys/:id/confirm — confirm custody with a wallet signature. */
export function confirmSellerKey(token: string, id: string, message: string, signature: string) {
  return apiFetch<import('./types').SellerKey>(
    `/marketplace/seller-keys/${encodeURIComponent(id)}/confirm`,
    { method: 'POST', token, body: JSON.stringify({ message, signature }) },
  );
}

/** GET /marketplace/seller-keys — list the caller's settlement keys. */
export function listSellerKeys(token: string) {
  return apiFetch<import('./types').SellerKey[]>('/marketplace/seller-keys', { token });
}

/** DELETE /marketplace/seller-keys/:id — revoke a settlement key. */
export function revokeSellerKey(token: string, id: string) {
  return apiFetch<import('./types').SellerKey>(
    `/marketplace/seller-keys/${encodeURIComponent(id)}`,
    { method: 'DELETE', token },
  );
}

/**
 * POST /marketplace/listings/:id/deposit-prepare — build a seller-signed
 * `transferCredit` deposit into the custody ATA (seller signs once with
 * Phantom, then confirms with depositConfirm).
 */
export function prepareDeposit(token: string, id: string) {
  return apiFetch<{ transaction: string; seller: string; listingId: string; amount: number; custodyPublicKey: string; custodyAta: string }>(
    `/marketplace/listings/${encodeURIComponent(id)}/deposit-prepare`,
    { method: 'POST', token },
  );
}

/** POST /marketplace/listings/:id/deposit-confirm — verify the deposit landed. */
export function confirmDeposit(token: string, id: string, txSignature: string) {
  return apiFetch<{ funded: boolean; custodyBalance: number; amount: number }>(
    `/marketplace/listings/${encodeURIComponent(id)}/deposit-confirm`,
    { method: 'POST', token, body: JSON.stringify({ txSignature }) },
  );
}

/** POST /marketplace/listings/:id/buy-prepare — build a seller-signed transfer tx (client-signed flow). */
export function prepareBuyListing(token: string, id: string, buyer: string) {
  return apiFetch<{ transaction: string; seller: string; listingId: string; amount: number }>(
    `/marketplace/listings/${encodeURIComponent(id)}/buy-prepare`,
    { method: 'POST', token, body: JSON.stringify({ buyer }) },
  );
}

/** POST /marketplace/listings/:id/cancel — cancel a listing (owner only). */
export function cancelListing(token: string, id: string, seller: string) {
  return apiFetch<import('./types').Listing>(
    `/marketplace/listings/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', token, body: JSON.stringify({ seller }) },
  );
}

// ---- Credit Retirement (Stage 6) ----

/** GET /retirements/holdings — owned holdings available to retire. */
export function listHoldings(token: string) {
  return apiFetch<import('./types').Holding[]>('/retirements/holdings', { token });
}

/** POST /retirements/prepare — build an owner-signed burn tx (client-signed flow). */
export function prepareRetirement(token: string, dto: import('./types').RetireCreditsRequest) {
  return apiFetch<{ transaction: string; owner: string; holdingId: string; amount: number }>(
    '/retirements/prepare',
    { method: 'POST', token, body: JSON.stringify(dto) },
  );
}

/** POST /retirements — retire owned credits. */
export function retireCredits(token: string, dto: import('./types').RetireCreditsRequest) {
  return apiFetch<import('./types').Retirement>('/retirements', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

/** GET /retirements — paged, searchable, filterable retirement history. */
export function listRetirements(
  token: string,
  params: Record<string, string | number | undefined> = {},
) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  const q = qs.toString();
  return apiFetch<import('./types').RetirementHistoryResponse>(
    `/retirements${q ? `?${q}` : ''}`,
    { token },
  );
}

/** GET /retirements/:id — single retirement detail. */
export function getRetirement(token: string, id: string) {
  return apiFetch<import('./types').Retirement>(
    `/retirements/${encodeURIComponent(id)}`,
    { token },
  );
}

/**
 * GET /retirements/:id/certificate — fetch the Retirement Certificate PDF
 * from the backend API (port 3001). The backend is auth-gated on the Supabase
 * JWT, which a plain <a href> cannot attach, so the bytes are fetched here with
 * the Authorization header and returned as a Blob for the caller to open /
 * download locally.
 */
export async function fetchCertificatePdf(token: string, id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/retirements/${encodeURIComponent(id)}/certificate`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await res.json() : await res.text();
    const message =
      (body && (body as any).message) ||
      (body && (body as any).error) ||
      `Certificate fetch failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return res.blob();
}

/**
 * Opens (and lets the browser offer a download for) a certificate PDF by
 * fetching it through the authenticated backend API and materializing it as a
 * local object URL. Throws on network / auth / server errors.
 */
export async function viewRetirementCertificatePdf(
  token: string,
  id: string,
  displayId = id,
): Promise<void> {
  const blob = await fetchCertificatePdf(token, id);
  const url = URL.createObjectURL(blob);
  if (typeof window === 'undefined') {
    URL.revokeObjectURL(url);
    throw new Error('Certificate can only be viewed in the browser.');
  }
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  anchor.download = `retirement-certificate-${displayId}.pdf`;
  anchor.style.display = 'none';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ---- Stage 7: Public Transparency Explorer (no auth required) ----

/**
 * Calls a PUBLIC explorer endpoint. These routes are `@Public()` on the
 * backend, so no Supabase token is required — anyone can verify the full
 * lifecycle of a credit or project transparently.
 */
export async function explorerFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      (body && (body as any).message) ||
      (body && (body as any).error) ||
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

/** GET /explorer/health — indexer + explorer status. */
export function getExplorerStatus() {
  return explorerFetch<import('./types').IndexerStatus>('/explorer/health');
}

/** GET /explorer/search?q=… — unified credit/project lookup. */
export function explorerSearch(q: string) {
  return explorerFetch<import('./types').ExplorerSearchResult>(
    `/explorer/search?q=${encodeURIComponent(q)}`,
  );
}

/** POST /explorer/search — body { query }. */
export function explorerSearchPost(query: string) {
  return explorerFetch<import('./types').ExplorerSearchResult>('/explorer/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

/** GET /explorer/credits — paged, searchable, sortable credit list. */
export function listExplorerCredits(params: import('./types').ExplorerPageQuery = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  const q = qs.toString();
  return explorerFetch<import('./types').ExplorerPage<import('./types').CreditSnapshot>>(
    `/explorer/credits${q ? `?${q}` : ''}`,
  );
}

/** GET /explorer/credits/:creditId — full credit lifecycle. */
export function getExplorerCredit(creditId: string) {
  return explorerFetch<import('./types').CreditExplorerResult>(
    `/explorer/credits/${encodeURIComponent(creditId)}`,
  );
}

/** GET /explorer/projects — paged, searchable, sortable project list. */
export function listExplorerProjects(params: import('./types').ExplorerPageQuery = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  const q = qs.toString();
  return explorerFetch<import('./types').ExplorerPage<import('./types').ProjectSnapshot>>(
    `/explorer/projects${q ? `?${q}` : ''}`,
  );
}

/** GET /explorer/projects/:projectId — full project lifecycle. */
export function getExplorerProject(projectId: string) {
  return explorerFetch<import('./types').ProjectExplorerResult>(
    `/explorer/projects/${encodeURIComponent(projectId)}`,
  );
}
