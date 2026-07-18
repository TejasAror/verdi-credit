import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { VerificationResult, Anomaly } from '../verification.types';

type PdfDoc = PDFDocument;

/**
 * ReportGeneratorService
 * -----------------------
 * Renders a {@link VerificationResult} into a PDF Buffer using pdfkit (pure
 * JS, no native deps). This is the ONLY place that knows about the PDF
 * renderer — swapping to an HTML→PDF tool later won't touch the orchestrator,
 * API, DB, or IPFS steps.
 *
 * The PDF contains: header, project details, evidence summary, NDVI results,
 * estimated carbon, anomaly findings, and the confidence/status verdict.
 */
@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  async generatePdf(result: VerificationResult): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        this.render(result, doc);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private render(r: VerificationResult, doc: PdfDoc): void {
    const GREEN: [number, number, number] = [0x1f, 0x6f, 0x3c];
    const GREY: [number, number, number] = [0x55, 0x55, 0x55];

    // ---- Header ----
    doc.fillColor(...GREEN).fontSize(20).font('Helvetica-Bold')
      .text('VerdiCred Verification Report', { align: 'left' });
    doc.fillColor(...GREY).fontSize(10).font('Helvetica')
      .text(`Report generated: ${new Date().toISOString()}`, { align: 'left' });
    doc.fontSize(10).text(`Report id: ${r.projectId}`);
    doc.moveDown();

    // ---- Project details ----
    this.section(doc, '1. Project Details');
    this.kv(doc, [
      ['Project name', r.projectName],
      ['Project type', r.projectType],
      ['Methodology', r.methodology],
      ['Declared annual tonnes', `${r.expectedAnnualTonnes} t CO2e`],
      ['Polygon area', `${r.areaHa} ha`],
      ['Evidence items', `${r.evidence.length}`],
      ['Verification status', r.status],
    ]);

    // ---- Evidence summary ----
    this.section(doc, '2. Evidence Summary');
    const bySource = new Map<string, number>();
    for (const e of r.evidence) {
      bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
    }
    if (bySource.size === 0) {
      doc.font('Helvetica').fontSize(10).text('No evidence supplied.');
    } else {
      this.kv(
        doc,
        [...bySource.entries()].map(([s, n]) => [`Source: ${s}`, `${n} item(s)`]),
      );
    }
    doc.moveDown();

    // ---- NDVI results ----
    this.section(doc, '3. NDVI / Vegetation Health');
    this.kv(doc, [
      ['Mean NDVI', `${r.ndvi.mean}`],
      ['Median NDVI', `${r.ndvi.median}`],
      ['Min / Max', `${r.ndvi.min} / ${r.ndvi.max}`],
      ['Std dev', `${r.ndvi.stdDev}`],
      ['Sample count', `${r.ndvi.sampleCount}`],
      ['Health class', r.ndvi.health],
    ]);
    if (r.ndvi.perSource.length > 0) {
      doc.moveDown(0.5).fontSize(9).font('Helvetica-Oblique')
        .text('Per-source NDVI: ' +
          r.ndvi.perSource.map((p) => `${p.source}=${p.mean} (n=${p.count})`).join(', '));
    }
    doc.moveDown();

    // ---- Estimated carbon ----
    this.section(doc, '4. Estimated Carbon Sequestration');
    this.kv(doc, [
      ['Area', `${r.carbon.areaHa} ha`],
      ['Sequestration factor', `${r.carbon.sequestrationFactorTonnesPerHa} t/ha/yr`],
      ['Estimated tonnes', `${r.carbon.estimatedTonnes} t CO2e`],
    ]);
    doc.moveDown(0.5).fontSize(9).font('Helvetica-Oblique').text(r.carbon.method);
    doc.moveDown();

    // ---- Anomaly findings ----
    this.section(doc, '5. Anomaly Findings');
    if (r.anomalies.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(...GREEN)
        .text('No anomalies detected.');
      doc.fillColor('black');
    } else {
      this.anomalyTable(doc, r.anomalies);
    }
    doc.moveDown();

    // ---- Confidence & status ----
    this.section(doc, '6. Confidence & Verification Status');
    doc.font('Helvetica-Bold').fontSize(14)
      .text(`Confidence score: ${r.confidenceScore} / 100`);
    doc.fontSize(12).fillColor(...GREEN)
      .text(`Final status: ${r.status}`);
    doc.fillColor('black').moveDown(0.5);
    if (r.notes.length > 0) {
      doc.fontSize(9).font('Helvetica-Oblique')
        .text('Rationale:\n- ' + r.notes.join('\n- '));
    }

    // ---- Footer ----
    doc.moveDown(2).fontSize(8).fillColor(...GREY)
      .text('VerdiCred AI Verification Engine — Stage 3 (mock algorithms). ' +
        'Generated automatically from aggregated project evidence.', { align: 'center' });
  }

  private section(doc: PdfDoc, title: string): void {
    doc.moveDown(0.5).fontSize(13).font('Helvetica-Bold')
      .fillColor(0x14, 0x5a, 0x32).text(title);
    doc.fillColor('black');
    doc.moveDown(0.2);
  }

  private kv(doc: PdfDoc, pairs: [string, string | number][]): void {
    doc.font('Helvetica').fontSize(10);
    for (const [k, v] of pairs) {
      doc.text(`${k}: `, { continued: true, width: 220 })
        .font('Helvetica-Bold').text(`${v}`, { continued: false });
      doc.font('Helvetica');
    }
    doc.moveDown(0.5);
  }

  private anomalyTable(doc: PdfDoc, anomalies: Anomaly[]): void {
    doc.font('Helvetica').fontSize(10);
    for (const a of anomalies) {
      const color: [number, number, number] =
        a.severity === 'HIGH'
          ? [0xb0, 0x00, 0x20]
          : a.severity === 'MEDIUM'
          ? [0xb5, 0x6a, 0x00]
          : [0x55, 0x55, 0x55];
      doc.font('Helvetica-Bold').fillColor(...color)
        .text(`[${a.severity}] ${a.type}`);
      doc.fillColor('black').font('Helvetica')
        .text(`   ${a.message}`);
      doc.moveDown(0.2);
    }
  }
}
