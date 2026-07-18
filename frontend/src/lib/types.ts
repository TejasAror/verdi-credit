export type ProjectType = 'REFORESTATION' | 'SOIL_CARBON' | 'RENEWABLE_ENERGY';
export type ProjectStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'RETIRED';
export type Role = 'DEVELOPER' | 'BUYER' | 'AUDITOR' | 'ADMIN';
export type AuditLogAction = 'ROLE_CHANGED' | 'ROLE_PROMOTED' | 'ROLE_DEMOTED';

export interface Project {
  id: string;
  ownerId: string;
  projectName: string;
  projectType: ProjectType;
  methodology: string;
  expectedAnnualTonnes: number;
  geoPolygon: unknown;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VerdiCredUser {
  id: string;
  email?: string | null;
  role: Role;
  createdAt?: string;
  supabaseId?: string;
  fullName?: string | null;
  updatedAt?: string;
}

export interface RoleChangeResult {
  id: string;
  email: string | null;
  role: Role;
  previousRole: Role;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  targetId: string;
  action: AuditLogAction;
  previousRole: Role;
  newRole: Role;
  reason: string | null;
  createdAt: string;
  actor?: VerdiCredUser;
  target?: VerdiCredUser;
}

export const ALL_ROLES: Role[] = ['BUYER', 'DEVELOPER', 'AUDITOR', 'ADMIN'];

// ---- Stage 4: Carbon Credits (on-chain issuance) ----

/** GET /carbon-credits/eligible/:projectId */
export interface EligibleResponse {
  eligible: boolean;
  projectId: string;
  verifiedTonnes: number;
  reportCid: string;
  evidenceCid?: string | null;
  evidenceCids?: string[];
  methodology: string;
  status: string;
  confidenceScore: number;
  /** Credits that would be minted = floor(verifiedTonnes). */
  amount?: number;
  message?: string;
}

/** POST /carbon-credits/issue — request */
export interface IssueCreditRequest {
  projectId: string;
  /** Recipient wallet (base58) that will receive the minted credits. */
  recipient: string;
  /** Optional vintage override; defaults to the verification year. */
  vintage?: number;
}

/** POST /carbon-credits/issue — response */
export interface IssueCreditResponse {
  txSignature: string;
  batchPda: string;
  mint: string;
  amount: number;
  projectId: string;
  vintage: number;
}

/** A decoded CreditBatch PDA (on-chain issuance ledger). */
export interface CreditBatchView {
  mint: string;
  authority: string;
  projectId: string;
  vintage: number;
  methodology: string;
  evidenceCid: string;
  reportCid: string;
  evidenceCids: string[];
  reportStatus: string;
  verifiedTonnesScaled: number;
  totalMinted: number;
  totalRetired: number;
  retirementCount: number;
  createdAt: number;
}

/** A decoded RetirementRecord PDA (on-chain retirement ledger). */
export interface RetirementView {
  owner: string;
  mint: string;
  batch: string;
  amount: number;
  reason: string;
  reportRef: string;
  timestamp: number;
}

// ---- Stage 5: Marketplace ----

export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED';

/** A marketplace listing (GET /marketplace/listings[/:id]). */
export interface Listing {
  id: string;
  creditId: string;
  seller: string;
  buyer: string | null;
  price: number;
  amount: number;
  status: ListingStatus;
  projectId: string | null;
  projectName: string | null;
  projectType: ProjectType | null;
  methodology: string | null;
  vintage: number | null;
  verifiedTonnes: number | null;
  reportCid: string | null;
  txSignature: string | null;
  explorerUrl?: string | null;
  settledAt: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

/** POST /marketplace/listings — request. */
export interface CreateListingRequest {
  creditId: string;
  seller: string;
  price: number;
  amount?: number;
  projectId?: string;
  projectName?: string;
  projectType?: ProjectType;
  methodology?: string;
  vintage?: number;
  verifiedTonnes?: number;
  reportCid?: string;
}
