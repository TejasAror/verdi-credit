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

/** GET /carbon-credits/config — the configured on-chain deployment. */
export interface CarbonCreditConfig {
  programId: string;
  cluster: string;
  creditMint: string | null;
  onChainEnabled: boolean;
}

/** A decoded CreditBatch PDA (on-chain issuance ledger). */
export interface CreditBatchView {
  /** The CreditBatch PDA itself. */
  batchPda: string;
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
  custodyPublicKey?: string | null;
  custodyAta?: string | null;
  custodyFunded?: boolean | null;
  sellerKeyReady?: boolean | null;
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

/** A provisioned server-side settlement (custody) key (public fields only). */
export interface SellerKey {
  id: string;
  walletAddress: string;
  publicKey: string;
  ata: string;
  custodyAta: string;
  status: 'ACTIVE' | 'REVOKED';
  confirmed: boolean;
  createdAt: string;
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

// ---- Stage 7: Public Transparency Explorer (no auth required) ----

export type ExplorerLifecycleStage =
  | 'PROJECT_REGISTERED'
  | 'EVIDENCE_UPLOADED'
  | 'AI_VERIFIED'
  | 'CREDIT_ISSUED'
  | 'TRANSFERRED'
  | 'RETIRED';

export interface ExplorerLifecycleEvent {
  stage: ExplorerLifecycleStage;
  title: string;
  description?: string | null;
  timestamp?: string | null;
  txSignature?: string | null;
  refId?: string | null;
  link?: string | null;
}

export interface CreditSnapshot {
  creditId: string;
  projectId: string | null;
  projectName: string | null;
  projectType: string | null;
  methodology: string | null;
  vintage: number | null;
  totalMinted: number;
  totalRetired: number;
  circulatingSupply: number;
  currentOwner: string | null;
  reportStatus: string | null;
  reportCid: string | null;
  evidenceCids: string[] | null;
  transferCount: number;
  fullyRetired: boolean;
  lastSignature: string | null;
  lastSlot: string | null;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndexedEvent {
  id: string;
  eventType: string;
  signature: string;
  eventIndex: number;
  slot: string;
  blockTime: string | null;
  programId: string;
  mint: string | null;
  projectId: string | null;
  accounts: Record<string, string> | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OwnershipTransfer {
  id: string;
  mint: string;
  fromWallet: string;
  toWallet: string;
  amount: number;
  signature: string;
  slot: string;
  blockTime: string | null;
  seq: number;
  createdAt: string;
}

export interface ExplorerTransaction {
  signature: string;
  mint: string | null;
  kind: string;
  summary: string | null;
  signer: string | null;
  slot: string;
  blockTime: string | null;
  instructionCount: number;
  success: boolean;
  createdAt: string;
}

export interface IndexedRetirement {
  id: string;
  retirementRecord: string;
  owner: string;
  mint: string;
  batch: string;
  amount: number;
  reason: string | null;
  reportRef: string | null;
  signature: string;
  slot: string;
  blockTime: string | null;
  totalRetired: number;
  createdAt: string;
}

export interface ProjectSnapshot {
  projectId: string;
  ownerId: string | null;
  projectName: string | null;
  projectType: string | null;
  methodology: string | null;
  expectedAnnualTonnes: number | null;
  status: string | null;
  creditIds: string[];
  totalMinted: number;
  totalRetired: number;
  circulatingSupply: number;
  evidenceCount: number;
  verificationCount: number;
  retirementCount: number;
  lastSignature: string | null;
  lastSlot: string | null;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRef {
  id: string;
  source: string;
  status: string;
  cid: string;
  ipfsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

/** Full evidence record as returned by GET /projects/:id/evidence and POST /evidence/upload. */
export interface Evidence {
  id: string;
  projectId: string;
  source: string;
  status: string;
  cid: string;
  ipfsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceSource =
  | 'SENTINEL2'
  | 'LANDSAT'
  | 'NASA_EARTHDATA'
  | 'OPENWEATHER'
  | 'GEO_UPLOAD';

export type EvidenceStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/** Allowed evidence sources + the source that requires a file upload. */
export const EVIDENCE_SOURCES: EvidenceSource[] = [
  'SENTINEL2',
  'LANDSAT',
  'NASA_EARTHDATA',
  'OPENWEATHER',
  'GEO_UPLOAD',
];

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  SENTINEL2: 'Sentinel-2',
  LANDSAT: 'Landsat',
  NASA_EARTHDATA: 'NASA Earthdata',
  OPENWEATHER: 'OpenWeather',
  GEO_UPLOAD: 'Geo Upload (file)',
};

/** MIME types accepted by POST /evidence/upload (10MB cap, set server-side). */
export const EVIDENCE_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/json',
];

export const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface VerificationReportRef {
  id: string;
  verifiedTonnes: number;
  confidenceScore: number;
  status: string;
  reportCid: string;
  reportUrl: string | null;
  ndviScore: number | null;
  createdAt: string;
}

/** Full verification report as returned by GET /verification/project/:id/latest
 *  and POST /verification/:projectId/verify. */
export interface VerificationReport {
  id: string;
  projectId: string;
  projectName: string;
  verifiedTonnes: number;
  confidenceScore: number;
  status: ProjectStatus;
  reportCid: string;
  reportUrl: string | null;
  ndviScore: number | null;
  anomalyCount: number;
  anomalies: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    refs?: string[];
  }>;
  createdAt: string;
  /** Full structured result (ndvi, carbon, anomalies, evidence, methodology, notes). */
  metadata?: Record<string, unknown> | null;
}

export interface CreditExplorerResult {
  found: boolean;
  credit: CreditSnapshot | null;
  lifecycle: ExplorerLifecycleEvent[];
  events: IndexedEvent[];
  ownershipHistory: OwnershipTransfer[];
  transactions: ExplorerTransaction[];
  retirements: IndexedRetirement[];
  evidence: EvidenceRef[];
  verificationReports: VerificationReportRef[];
}

export interface ProjectExplorerResult {
  found: boolean;
  project: ProjectSnapshot | null;
  lifecycle: ExplorerLifecycleEvent[];
  credits: CreditSnapshot[];
  evidence: EvidenceRef[];
  verificationReports: VerificationReportRef[];
  retirements: IndexedRetirement[];
}

export interface IndexerStatus {
  enabled: boolean;
  running: boolean;
  cluster: string;
  programId: string;
  lastSlot: string;
  lastSignature: string | null;
  eventsIndexed: string;
  txsProcessed: string;
  lastPolledAt: string | null;
  lastBackfillAt: string | null;
  isBackfilling: boolean;
  creditCount: number;
  projectCount: number;
}

export type ExplorerSearchKind = 'CREDIT' | 'PROJECT' | 'NONE';

export interface ExplorerSearchResult {
  kind: ExplorerSearchKind;
  query: string;
  credit: CreditExplorerResult | null;
  project: ProjectExplorerResult | null;
}

export interface ExplorerPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ExplorerPageQuery {
  page?: number;
  limit?: number;
  q?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  projectId?: string;
  status?: string;
}

