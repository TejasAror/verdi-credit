import { API_BASE_URL } from './supabase';

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
    throw new Error(message);
  }

  return body as T;
}

// ---- Admin endpoints ----

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

/** GET /carbon-credits/:mint/retirements — on-chain retirement ledger. */
export function getRetirements(token: string, mint: string) {
  return apiFetch<import('./types').RetirementView[]>(
    `/carbon-credits/${encodeURIComponent(mint)}/retirements`,
    { token },
  );
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

/** POST /marketplace/listings/:id/buy — purchase a listing. */
export function buyListing(token: string, id: string, buyer: string) {
  return apiFetch<import('./types').Listing>(
    `/marketplace/listings/${encodeURIComponent(id)}/buy`,
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
