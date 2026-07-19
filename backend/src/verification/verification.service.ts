import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { PinataService } from '../evidence/pinata/pinata.service';
import { NdviService } from './services/ndvi.service';
import { CarbonEstimationService } from './services/carbon-estimation.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ReportGeneratorService } from './report/report-generator.service';
import {
  Anomaly,
  AnomalySeverity,
  EvidenceItem,
  VerificationResult,
} from './verification.types';
import { clamp, polygonAreaHa } from './services/verification.utils';

export interface VerifyInput {
  projectId: string;
  actorId: string;
  actorRole: Role;
  note?: string;
}

export interface VerificationReportResponse {
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
  anomalies: Anomaly[];
  createdAt: string;
  /** Full structured result (ndvi, carbon, anomalies, evidence, methodology) — present on fresh responses. */
  metadata?: Record<string, unknown> | null;
}

/**
 * VerificationService — the Stage 3 orchestrator.
 *
 * Runs the full pipeline end-to-end:
 *   Project → Evidence Aggregation → NDVIService → CarbonEstimationService
 *   → AnomalyDetectionService → Confidence Score → PDF Report → IPFS Upload
 *   → VerificationReport persisted → (project.status advanced).
 *
 * Returns the CID + verification metadata to the API layer.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  // Confidence-score penalties by severity.
  private readonly PENALTY = { HIGH: 25, MEDIUM: 12, LOW: 5 } as const;
  private readonly SCORE_FLOOR = 0;
  private readonly SCORE_CEIL = 100;
  private readonly VERIFIED_THRESHOLD = 70;
  private readonly REJECT_THRESHOLD = 40;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly pinata: PinataService,
    private readonly ndvi: NdviService,
    private readonly carbon: CarbonEstimationService,
    private readonly anomaly: AnomalyDetectionService,
    private readonly report: ReportGeneratorService,
  ) { }

  /** Runs the verification pipeline for a project and persists the report. */
  async verify(input: VerifyInput): Promise<VerificationReportResponse> {
    const { projectId, actorId, actorRole } = input;

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }

    // RBAC: DEVELOPER only on own projects; AUDITOR/ADMIN anywhere; others blocked.
    const isOwner = project.ownerId === actorId;
    if (actorRole === Role.DEVELOPER && !isOwner) {
      throw new ForbiddenException('You can only verify your own projects.');
    }
    if (
      actorRole !== Role.DEVELOPER &&
      actorRole !== Role.AUDITOR &&
      actorRole !== Role.ADMIN
    ) {
      throw new ForbiddenException('Your role cannot run verification.');
    }

    // 1. Aggregate evidence.
    const evidenceRows = await this.evidence.listByProject(projectId, actorRole);
    const evidenceItems: EvidenceItem[] = evidenceRows.map((e) => ({
      id: e.id,
      source: e.source,
      cid: e.cid,
      latitude: e.latitude,
      longitude: e.longitude,
      timestamp: e.timestamp,
      metadata: e.metadata as Record<string, unknown> | null,
    }));

    const areaHa = polygonAreaHa(project.geoPolygon);

    // 2. NDVI → 3. Carbon → 4. Anomalies.
    const ndvi = this.ndvi.compute(projectId, project.projectType, evidenceItems);
    const carbon = this.carbon.estimate(
      projectId,
      project.projectType,
      project.geoPolygon,
      project.expectedAnnualTonnes,
      ndvi,
    );
    const { anomalies } = this.anomaly.detect({
      projectId,
      projectType: project.projectType,
      expectedAnnualTonnes: project.expectedAnnualTonnes,
      geoPolygon: project.geoPolygon,
      evidence: evidenceItems,
      ndvi,
      carbon,
    });

    // 5. Confidence score + status.
    const { confidenceScore, status, notes } = this.scoreConfidence(
      anomalies,
      evidenceItems.length,
      ndvi.mean,
    );

    const result: VerificationResult = {
      projectId,
      projectName: project.projectName,
      projectType: project.projectType,
      methodology: project.methodology,
      expectedAnnualTonnes: project.expectedAnnualTonnes,
      areaHa,
      evidence: evidenceItems,
      ndvi,
      carbon,
      anomalies,
      confidenceScore,
      status,
      verifiedTonnes: project.expectedAnnualTonnes,
      notes,
    };

    if (input.note) {
      result.notes.push(`Operator note: ${input.note}`);
    }

    // 6. PDF → 7. IPFS pin.
    const pdfBuffer = await this.report.generatePdf(result);
    const pin = await this.pinata.pinFile(
      pdfBuffer,
      `verification-${projectId}.pdf`,
      'application/pdf',
    );

    // 8. Persist the verification report.
    const saved = await this.prisma.verificationReport.create({
      data: {
        projectId,
        verifiedTonnes: result.verifiedTonnes,
        confidenceScore: result.confidenceScore,
        status,
        reportCid: pin.cid,
        reportUrl: pin.ipfsUrl,
        ndviScore: ndvi.mean,
        anomalies: anomalies as unknown as object,
        metadata: result as unknown as object,
      },
    });

    // Advance the project's verification status to reflect the outcome.
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status },
    });

    this.logger.log(
      `Verification ${saved.id} for project ${projectId}: ` +
      `tonnes=${result.verifiedTonnes}, confidence=${confidenceScore}, status=${status}, cid=${pin.cid}`,
    );

    return this.toResponse(saved, project.projectName, anomalies);
  }

  /** Lists all verification reports for a project (newest first). */
  async listByProject(projectId: string): Promise<VerificationReportResponse[]> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }
    const reports = await this.prisma.verificationReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    const name = project.projectName;
    return reports.map((r) =>
      this.toResponse(r, name, (r.anomalies as unknown as Anomaly[]) ?? []),
    );
  }

  /** The most recent verification report for a project. */
  async latestForProject(projectId: string): Promise<VerificationReportResponse> {
    const list = await this.listByProject(projectId);
    if (list.length === 0) {
      throw new NotFoundException(`No verification report found for project "${projectId}".`);
    }
    return list[0];
  }

  /** A single verification report by id. */
  async getById(id: string): Promise<VerificationReportResponse> {
    const report = await this.prisma.verificationReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Verification report "${id}" not found.`);
    }
    const project = await this.prisma.project.findUnique({
      where: { id: report.projectId },
    });
    return this.toResponse(report, project?.projectName ?? '', (report.anomalies as unknown as Anomaly[]) ?? []);
  }

  // ---- internals ----

  private scoreConfidence(
    anomalies: Anomaly[],
    evidenceCount: number,
    ndviMean: number,
  ): { confidenceScore: number; status: ProjectStatus; notes: string[] } {
    let score = 100;
    const notes: string[] = [];

    for (const a of anomalies) {
      const p = this.PENALTY[a.severity as AnomalySeverity] ?? 0;
      score -= p;
      notes.push(`−${p}: ${a.type} (${a.severity}).`);
    }

    // Evidence coverage bonus.
    const coverageBonus = Math.min(10, evidenceCount);
    score += coverageBonus;
    notes.push(`+${coverageBonus}: evidence coverage (${evidenceCount} item(s)).`);

    // NDVI plausibility: reward plausible vegetation, penalize implausible.
    if (ndviMean >= 0.3 && ndviMean <= 0.8) {
      score += 5;
      notes.push('+5: NDVI within plausible 0.3–0.8 range.');
    } else {
      score -= 10;
      notes.push('−10: NDVI outside plausible 0.3–0.8 range.');
    }

    score = Math.round(clamp(score, this.SCORE_FLOOR, this.SCORE_CEIL));

    // Status derivation — Stage 3 §4.4.
    // A duplicate CID is a hard fail regardless of the numeric score; otherwise
    // the thresholds decide VERIFIED vs PENDING_VERIFICATION vs REJECTED.
    const hasDuplicateCid = anomalies.some((a) => a.type === 'DUPLICATE_CID');
    let status: ProjectStatus;
    if (hasDuplicateCid || score < this.REJECT_THRESHOLD) {
      status = ProjectStatus.REJECTED;
      notes.push(
        `Status REJECTED (${hasDuplicateCid ? 'duplicate CID present' : `score ${score} < ${this.REJECT_THRESHOLD}`}).`,
      );
    } else if (score >= this.VERIFIED_THRESHOLD) {
      status = ProjectStatus.VERIFIED;
      notes.push(`Status VERIFIED (score ${score} ≥ ${this.VERIFIED_THRESHOLD}).`);
    } else {
      status = ProjectStatus.PENDING_VERIFICATION;
      notes.push(
        `Status PENDING_VERIFICATION (${this.REJECT_THRESHOLD} ≤ score ${score} < ${this.VERIFIED_THRESHOLD}).`,
      );
    }

    return { confidenceScore: score, status, notes };
  }

  private toResponse(
    r: {
      id: string;
      projectId: string;
      verifiedTonnes: number;
      confidenceScore: number;
      status: ProjectStatus;
      reportCid: string;
      reportUrl: string | null;
      ndviScore: number | null;
      createdAt: Date;
    },
    projectName: string,
    anomalies: Anomaly[],
  ): VerificationReportResponse {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName,
      verifiedTonnes: r.verifiedTonnes,
      confidenceScore: r.confidenceScore,
      status: r.status,
      reportCid: r.reportCid,
      reportUrl: r.reportUrl,
      ndviScore: r.ndviScore,
      anomalyCount: anomalies.length,
      anomalies,
      createdAt: r.createdAt.toISOString(),
      metadata: (r as { metadata?: Record<string, unknown> | null }).metadata ?? null,
    };
  }
}
