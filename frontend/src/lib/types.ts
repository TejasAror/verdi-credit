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

// ---- Stage 6: Credit Retirement ----

export type RetirementReasonCategory =
  | 'NET_ZERO'
  | 'CORPORATE_ESG'
  | 'CARBON_OFFSET'
  | 'COMPLIANCE'
  | 'CUSTOM';

export type RetirementStatus = 'PENDING' | 'CONFIRMED' | 'CERTIFIED';

/** A credit holding the user owns and may retire. */
export interface Holding {
  id: string;
  projectId: string;
  tokenMint: string;
  projectName: string;
  projectType: ProjectType;
  methodology: string;
  vintage: number;
  availableBalance: number;
  totalRetired: number;
  walletAddress: string;
}

/** POST /retirements — request. */
export interface RetireCreditsRequest {
  holdingId: string;
  amount: number;
  reasonCategory: RetirementReasonCategory;
  reason: string;
  walletAddress?: string;
  organization?: string;
  /** Server-signed settlement: backend signs + submits the burn. */
  ownerSecret?: string;
  /** Client-signed settlement: an already-submitted on-chain burn signature. */
  txSignature?: string;
}

/** A single retirement record (GET /retirements[/:id]). */
export interface Retirement {
  id: string;
  retirementId: string;
  projectId: string;
  tokenMint: string;
  retiredAmount: number;
  retiredBy: string;
  walletAddress: string;
  reason: string;
  reasonCategory: RetirementReasonCategory;
  transactionSignature: string;
  certificateCid: string | null;
  certificateUrl: string | null;
  status: RetirementStatus;
  organization: string | null;
  projectName: string | null;
  methodology: string | null;
  vintage: number | null;
  explorerUrl: string | null;
  ipfsUrl: string | null;
  certificateId: string | null;
  verifyUrl: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /retirements — paged response. */
export interface RetirementHistoryResponse {
  items: Retirement[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
