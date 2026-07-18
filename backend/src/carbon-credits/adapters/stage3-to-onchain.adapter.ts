import { Injectable } from '@nestjs/common';

/**
 * Adapter that maps a Stage 3 `VerificationReport` onto the exact set of
 * arguments the on-chain `mintCredit` instruction expects.
 *
 * The on-chain program is *stateless* about verification — it cannot read the
 * SQL DB or IPFS. The backend is the bridge: it reads Stage 3, validates the
 * report, and submits a signed `mintCredit` as the Oracle Authority. This
 * adapter captures that canonical mapping (see STAGE4 docs §3).
 */

/** Shape of the Stage 3 verification report summary returned by VerificationService. */
export interface VerificationReportSummary {
  id: string;
  projectId: string;
  projectName: string;
  verifiedTonnes: number;
  confidenceScore: number;
  status: string; // ProjectStatus string: 'VERIFIED' | 'PENDING_VERIFICATION' | 'REJECTED'
  reportCid: string;
  reportUrl: string | null;
  ndviScore: number | null;
  createdAt: string;
  /** Full structured result (ndvi, carbon, anomalies, evidence). */
  metadata?: {
    methodology?: string;
    evidence?: { id: string; cid: string; source: string }[];
    [k: string]: unknown;
  } | null;
}

/** The arguments required by the on-chain `mintCredit` instruction. */
export interface MintCreditArgs {
  projectId: string;
  vintage: number;
  methodology: string;
  evidenceCids: string[];
  reportCid: string;
  /** Discriminant produced by the program's `ReportStatus` enum (0..2). */
  reportStatus: { pendingVerification: Record<string, never> } | { verified: Record<string, never> } | { rejected: Record<string, never> };
  /** Floored verified tonnes — strictly 1 credit = 1 verified tonne. */
  verifiedTonnesScaled: number;
}

/** Report status strings that the program will accept for issuance. */
export const VERIFIED_STATUS = 'VERIFIED';
export const PENDING_STATUS = 'PENDING_VERIFICATION';
export const REJECTED_STATUS = 'REJECTED';

@Injectable()
export class Stage3ToOnchainAdapter {
  /**
   * Map a Stage 3 verification report to on-chain `mintCredit` args.
   *
   * The 1:1 rule is enforced here: `amount = Math.floor(verifiedTonnes)`.
   * The on-chain program re-derives the same value, so over-issuance is
   * impossible even if the backend is compromised.
   *
   * @param report  the latest Stage 3 verification report
   * @param vintage optional vintage override; defaults to the report's year
   */
  toMintArgs(report: VerificationReportSummary, vintage?: number): MintCreditArgs {
    const project_id = report.projectId;
    const report_status = this.toReportStatusEnum(report.status);
    const vintageYear =
      vintage && vintage >= 1 && vintage <= 9999
        ? vintage
        : new Date(report.createdAt).getUTCFullYear();

    const methodology = report.metadata?.methodology ?? '';

    // evidenceCID list — first evidence item's IPFS CID, with fallback to any cid.
    const evidence = report.metadata?.evidence ?? [];
    const evidence_cids = evidence
      .map((e) => e?.cid)
      .filter((c): c is string => typeof c === 'string' && c.length > 0);

    const amount = Math.floor(report.verifiedTonnes);

    return {
      projectId: project_id,
      vintage: vintageYear,
      methodology,
      evidenceCids: evidence_cids,
      reportCid: report.reportCid,
      reportStatus: report_status,
      verifiedTonnesScaled: amount,
    };
  }

  /** Whether a report may be used to mint credits (on-chain gate mirrored off-chain). */
  isEligible(report: VerificationReportSummary): boolean {
    return report.status === VERIFIED_STATUS;
  }

  private toReportStatusEnum(status: string): MintCreditArgs['reportStatus'] {
    switch (status) {
      case VERIFIED_STATUS:
        return { verified: {} };
      case PENDING_STATUS:
        return { pendingVerification: {} };
      case REJECTED_STATUS:
        return { rejected: {} };
      default:
        // Unknown statuses are never eligible; treat as rejected so the chain blocks them.
        return { rejected: {} };
    }
  }
}
