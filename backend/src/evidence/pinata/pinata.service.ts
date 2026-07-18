import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PinResult {
  cid: string; // IPFS CID (IpfsHash)
  ipfsUrl: string; // Gateway URL for retrieval
  size?: number;
}

/**
 * Pinata IPFS integration.
 *
 * Pins raw evidence payloads (files or JSON) to IPFS via Pinata and returns
 * the resulting CID. Only public, server-side credentials (PINATA_JWT) are
 * used — never exposed to the browser.
 *
 * API reference (Pinata v3-compatible):
 *  - pin JSON:  POST /pinning/pinJSONToIPFS
 *  - pin file:  POST /pinning/pinFileToIPFS  (multipart, field name "file")
 */
@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private readonly baseUrl = 'https://api.pinata.cloud';
  private readonly jwt: string;
  private readonly gateway: string;

  constructor(private readonly configService: ConfigService) {
    this.jwt = this.configService.get<string>('PINATA_JWT') ?? '';
    this.gateway =
      this.configService.get<string>('PINATA_GATEWAY') ??
      'blush-decent-coyote-808.mypinata.cloud';

    if (!this.jwt) {
      // Non-fatal: uploads will fail clearly if used without a key.
      this.logger.warn('PINATA_JWT is not set; IPFS pinning will fail.');
    }
  }

  /** Pins an arbitrary JSON object to IPFS. */
  async pinJson(payload: unknown, name?: string): Promise<PinResult> {
    const res = await fetch(`${this.baseUrl}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pinataContent: payload, pinataMetadata: name ? { name } : undefined }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata pinJSON failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { IpfsHash: string; PinSize?: number };
    return {
      cid: data.IpfsHash,
      ipfsUrl: this.buildUrl(data.IpfsHash),
      size: data.PinSize,
    };
  }

  /** Pins a raw file (Buffer) to IPFS with its content type. */
  async pinFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
  ): Promise<PinResult> {
    const form = new FormData();
    // Node 18+ supports the Blob/File constructors used by FormData.
    const file = new File([new Uint8Array(buffer)], filename, { type: contentType });
    form.append('file', file);

    const res = await fetch(`${this.baseUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata pinFile failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { IpfsHash: string; PinSize?: number };
    return {
      cid: data.IpfsHash,
      ipfsUrl: this.buildUrl(data.IpfsHash),
      size: data.PinSize,
    };
  }

  private buildUrl(cid: string): string {
    const gw = this.gateway.replace(/\/$/, '');
    return `https://${gw}/ipfs/${cid}`;
  }
}
