import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { PinataService } from '../evidence/pinata/pinata.service';

/** The fully-resolved data needed to render a Retirement Certificate. */
export interface CertificateData {
  /** Stable, human-readable certificate id (e.g. VC-RET-XXXXXXX). */
  certificateId: string;
  /** The retirement record id (uuid) — used as the verification handle. */
  retirementId: string;
  organization: string;
  projectName: string;
  projectId: string;
  methodology: string;
  vintage: number;
  tokenMint: string;
  retiredAmount: number;
  reason: string;
  reasonCategory: string;
  walletAddress: string;
  retiredBy: string;
  retiredByEmail?: string | null;
  transactionSignature: string;
  /**
   * IPFS CID of the certificate, when already known. A CID is the hash of the
   * certificate bytes, so it CANNOT be embedded inside the certificate itself
   * — this value is only used to enrich the verification URL (rid + cid) when
   * building a certificate AFTER the pin exists (e.g. regenerated downloads).
   */
  certificateCid?: string | null;
  timestamp: string;
}

/** Result of generating + pinning a certificate. */
export interface CertificateResult {
  cid: string;
  url: string;
  certificateId: string;
}

/**
 * CertificateGeneratorService — produces a professional, tamper-evident PDF
 * Retirement Certificate for a credit retirement and uploads it to Pinata/IPFS.
 *
 * The certificate contains:
 *   - a certificate id and the retirement id
 *   - organization, project, methodology, vintage, token mint, retired credits
 *   - the retirement reason and category
 *   - the blockchain transaction hash
 *   - an ISO timestamp and digital verification metadata
 *   - a QR code that resolves to the public verification URL for the retirement
 *
 * Only the returned IPFS CID is persisted by the caller (the PDF itself lives
 * off-chain on IPFS). The QR code encodes a public verification URL containing
 * the retirement id (+ the certificate CID when it is already known) so the
 * certificate can be independently verified by scanning it. Because the first
 * rendering happens BEFORE the file is pinned, the CID is never embedded inside
 * the certificate — the immutable retirement id is the canonical verification
 * handle.
 */
@Injectable()
export class CertificateGeneratorService {
  private readonly logger = new Logger(CertificateGeneratorService.name);
  private readonly frontendBase: string;

  constructor(
    private readonly config: ConfigService,
    private readonly pinata: PinataService,
  ) {
    this.frontendBase =
      this.config.get<string>('CERTIFICATE_VERIFY_BASE') ||
      this.config.get<string>('APP_FRONTEND_URL', 'http://localhost:3000');
  }

  /** Build the public verification URL encoded into the certificate QR code. */
  buildVerifyUrl(retirementId: string, certificateCid?: string | null): string {
    const base = this.frontendBase.replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('rid', retirementId);
    if (certificateCid) params.set('cid', certificateCid);
    return `${base}/retirement-history/verify?${params.toString()}`;
  }

  /**
   * Generate the certificate PDF, pin it to IPFS, and return the CID.
   */
  async generateAndPin(data: CertificateData): Promise<CertificateResult> {
    const pdf = await this.renderPdf(data);
    const cid = `${data.certificateId}-${data.retirementId}.pdf`;
    const buffer = await this.pdfToBuffer(pdf);

    const pin = await this.pinata.pinFile(buffer, cid, 'application/pdf');

    this.logger.log(
      `Retirement certificate ${data.certificateId} pinned to IPFS (cid=${pin.cid}).`,
    );

    return {
      cid: pin.cid,
      url: pin.ipfsUrl,
      certificateId: data.certificateId,
    };
  }

  /** Render the certificate PDF document (used for both IPFS pin + download). */
  async renderPdf(data: CertificateData): Promise<InstanceType<typeof PDFDocument>> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `VerdiCred Retirement Certificate ${data.certificateId}`,
        Author: 'VerdiCred',
        Subject: 'Carbon Credit Retirement Certificate',
      },
    });

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 112;

    // ---- Header band ----
    doc.rect(0, 0, pageWidth, 92).fill('#0f766e');
    doc
      .fillColor('#ffffff')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('VerdiCred', 56, 28);
    doc
      .fontSize(12)
      .font('Helvetica')
      .text('Carbon Credit Retirement Certificate', 56, 56);
    doc
      .fontSize(9)
      .text('Trusted digital carbon credit verification', pageWidth - 220, 38, {
        width: 164,
        align: 'right',
      });
    doc.moveDown(2.2);

    // ---- Certificate ID badge ----
    doc
      .fillColor('#0f766e')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`Certificate ID: ${data.certificateId}`, { align: 'right' });
    doc
      .fillColor('#64748b')
      .fontSize(9)
      .font('Helvetica')
      .text(`Issued: ${data.timestamp}`, { align: 'right' });
    doc.moveDown(0.6);

    // ---- Title ----
    doc
      .fillColor('#0f172a')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('This certifies the permanent retirement of carbon credits', {
        align: 'left',
      });
    doc.moveDown(0.4);

    // ---- Hero retired amount ----
    doc
      .fillColor('#0f766e')
      .fontSize(34)
      .font('Helvetica-Bold')
      .text(`${data.retiredAmount.toLocaleString()} tCO₂e`, {
        align: 'left',
      });
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .font('Helvetica')
      .text('Retired credits (permanently removed from circulation)', {
        align: 'left',
      });
    doc.moveDown(0.8);

    // ---- Detail table ----
    const rows: [string, string][] = [
      ['Organization', data.organization || '—'],
      ['Project', data.projectName || '—'],
      ['Project ID', data.projectId],
      ['Methodology', data.methodology || '—'],
      ['Vintage', String(data.vintage)],
      ['Token Mint', data.tokenMint],
      ['Retirement Reason', `${data.reason} (${data.reasonCategory})`],
      [
        'Retired By',
        `${data.retiredBy}${data.retiredByEmail ? ` (${data.retiredByEmail})` : ''}`,
      ],
      ['Wallet Address', data.walletAddress],
      ['Blockchain Tx', data.transactionSignature],
    ];

    const rowH = 26;
    let y = doc.y;
    rows.forEach(([label, value], i) => {
      if (i % 2 === 0) {
        doc.roundedRect(56, y - 4, contentWidth, rowH + 2, 4).fill('#f1f5f9');
      }
      doc
        .fillColor('#475569')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(label, 66, y, { width: 150 });
      doc
        .fillColor('#0f172a')
        .fontSize(9)
        .font('Helvetica')
        .text(value, 220, y, { width: contentWidth - 170 });
      y += rowH;
    });
    doc.y = y + 16;

    // ---- Verification metadata block ----
    doc
      .fillColor('#0f172a')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Digital Verification Metadata');
    doc.moveDown(0.2);
    const meta: [string, string][] = [
      ['Retirement ID', data.retirementId],
      ['Verification URL', this.buildVerifyUrl(data.retirementId, data.certificateCid)],
    ];
    meta.forEach(([label, value]) => {
      doc
        .fillColor('#475569')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(label, { width: 120 });
      doc
        .fillColor('#0f172a')
        .fontSize(8)
        .font('Helvetica')
        .text(value, { width: contentWidth });
      doc.moveDown(0.2);
    });
    doc.moveDown(0.6);

    // ---- QR code + footer ----
    const qrUrl = this.buildVerifyUrl(data.retirementId, data.certificateCid);
    const qrSize = 96;
    const qrY = doc.page.height - 56 - qrSize - 28;
    try {
      const qrSvg = await QRCode.toString(qrUrl, {
        type: 'svg',
        margin: 1,
        width: qrSize * 4,
      });
      // SVG string rendered as an image via a data URI.
      doc.image(Buffer.from(qrSvg), 56, qrY, {
        width: qrSize,
        height: qrSize,
      });
    } catch (err) {
      this.logger.warn(`Failed to render QR code: ${(err as Error).message}`);
    }
    doc
      .fillColor('#64748b')
      .fontSize(8)
      .font('Helvetica')
      .text('Scan to verify this certificate on VerdiCred', 56, qrY + qrSize + 4, {
        width: qrSize + 20,
      });

    // Footer notice (right side).
    doc
      .fillColor('#94a3b8')
      .fontSize(8)
      .font('Helvetica')
      .text(
        'This certificate is generated by VerdiCred upon on-chain retirement. ' +
          'Retired credits are burned and can never re-enter circulation. ' +
          'Stored immutably on IPFS.',
        pageWidth - 320,
        qrY,
        { width: 264, align: 'right' },
      );

    doc.end();
    return doc;
  }

  /** Collect a PDFKit stream into a Buffer. */
  pdfToBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));
    });
  }
}
