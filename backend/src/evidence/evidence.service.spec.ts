import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, EvidenceSource, EvidenceStatus, AuditLogAction } from '@prisma/client';
import { EvidenceService } from './evidence.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PinataService } from './pinata/pinata.service';
import { AdapterRegistryService } from './adapters/adapter-registry.service';
import { Sentinel2Adapter } from './adapters/sentinel2.adapter';
import { GeoUploadAdapter } from './adapters/geo-upload.adapter';
import { AdapterContext } from './adapters/evidence-adapter.interface';

describe('EvidenceService', () => {
  let service: EvidenceService;
  let prisma: any;
  let users: any;
  let audit: any;
  let pinata: any;
  let adapters: any;

  const actorDev = { id: 'dev-1', role: Role.DEVELOPER, supabaseId: 'sb-dev' };
  const actorAdmin = { id: 'admin-1', role: Role.ADMIN, supabaseId: 'sb-admin' };
  const actorBuyer = { id: 'buyer-1', role: Role.BUYER, supabaseId: 'sb-buyer' };

  const project = (ownerId: string) => ({ id: 'proj-1', ownerId });

  beforeEach(async () => {
    prisma = {
      project: { findUnique: jest.fn() },
      evidence: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };
    users = { findBySupabaseId: jest.fn() };
    audit = { recordEvidenceAction: jest.fn().mockResolvedValue({}) };
    pinata = {
      pinFile: jest.fn().mockResolvedValue({ cid: 'cid-file', ipfsUrl: 'http://gw/ipfs/cid-file' }),
      pinJson: jest.fn().mockResolvedValue({ cid: 'cid-json', ipfsUrl: 'http://gw/ipfs/cid-json' }),
    };
    adapters = {
      get: jest.fn().mockReturnValue(new Sentinel2Adapter()),
    };

    service = new EvidenceService(
      prisma,
      users,
      audit,
      pinata,
      adapters,
    );
  });

  describe('upload', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.SENTINEL2 },
          projectId: 'proj-1',
          actorId: actorDev.id,
          actorRole: Role.DEVELOPER,
          supabaseId: actorDev.supabaseId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets a DEVELOPER upload only to a project they own', async () => {
      prisma.project.findUnique.mockResolvedValue(project('someone-else'));
      users.findBySupabaseId.mockResolvedValue({ id: actorDev.id });
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.SENTINEL2 },
          projectId: 'proj-1',
          actorId: actorDev.id,
          actorRole: Role.DEVELOPER,
          supabaseId: actorDev.supabaseId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an ADMIN upload to any project and pins + audits', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      users.findBySupabaseId.mockResolvedValue({ id: actorAdmin.id });
      const created = { id: 'ev-1', cid: 'cid-json' };
      prisma.evidence.create.mockResolvedValue(created);

      const result = await service.upload({
        dto: { projectId: 'proj-1', source: EvidenceSource.SENTINEL2, latitude: -3.4, longitude: -62.2 },
        projectId: 'proj-1',
        actorId: actorAdmin.id,
        actorRole: Role.ADMIN,
        supabaseId: actorAdmin.supabaseId,
      });

      expect(result).toBe(created);
      expect(pinata.pinJson).toHaveBeenCalled();
      expect(audit.recordEvidenceAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditLogAction.EVIDENCE_UPLOADED, evidenceId: 'ev-1' }),
      );
    });

    it('rejects GEO_UPLOAD without a file', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      users.findBySupabaseId.mockResolvedValue({ id: actorDev.id });
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.GEO_UPLOAD, latitude: -3.4, longitude: -62.2 },
          projectId: 'proj-1',
          actorId: actorDev.id,
          actorRole: Role.DEVELOPER,
          supabaseId: actorDev.supabaseId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects GEO_UPLOAD when the mime type is unsupported', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      users.findBySupabaseId.mockResolvedValue({ id: actorDev.id });
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.GEO_UPLOAD, latitude: -3.4, longitude: -62.2 },
          projectId: 'proj-1',
          actorId: actorDev.id,
          actorRole: Role.DEVELOPER,
          supabaseId: actorDev.supabaseId,
          file: { buffer: Buffer.from('x'), filename: 'a.txt', mimeType: 'text/plain' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an out-of-range latitude', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      users.findBySupabaseId.mockResolvedValue({ id: actorDev.id });
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.SENTINEL2, latitude: 120, longitude: 0 },
          projectId: 'proj-1',
          actorId: actorDev.id,
          actorRole: Role.DEVELOPER,
          supabaseId: actorDev.supabaseId,
        }),
      ).rejects.toThrow(/latitude must be between/);
    });

    it('blocks BUYER from uploading', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      users.findBySupabaseId.mockResolvedValue({ id: actorBuyer.id });
      await expect(
        service.upload({
          dto: { projectId: 'proj-1', source: EvidenceSource.SENTINEL2 },
          projectId: 'proj-1',
          actorId: actorBuyer.id,
          actorRole: Role.BUYER,
          supabaseId: actorBuyer.supabaseId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getById', () => {
    it('audits an AUDITOR view', async () => {
      prisma.evidence.findUnique.mockResolvedValue({ id: 'ev-1' });
      await service.getById('ev-1', 'aud-1', Role.AUDITOR);
      expect(audit.recordEvidenceAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditLogAction.EVIDENCE_VIEWED, evidenceId: 'ev-1' }),
      );
    });

    it('does not audit a DEVELOPER view', async () => {
      prisma.evidence.findUnique.mockResolvedValue({ id: 'ev-1' });
      await service.getById('ev-1', 'dev-1', Role.DEVELOPER);
      expect(audit.recordEvidenceAction).not.toHaveBeenCalled();
    });

    it('throws when the evidence is missing', async () => {
      prisma.evidence.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing', 'dev-1', Role.DEVELOPER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes and audits an EVIDENCE_DELETED entry', async () => {
      prisma.evidence.findUnique.mockResolvedValue({ id: 'ev-1', cid: 'cid-x' });
      prisma.evidence.delete.mockResolvedValue({});
      const res = await service.remove('ev-1', 'admin-1');
      expect(res).toEqual({ id: 'ev-1', deleted: true });
      expect(audit.recordEvidenceAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditLogAction.EVIDENCE_DELETED, evidenceId: 'ev-1' }),
      );
    });
  });

  describe('listByProject', () => {
    it('throws when project not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.listByProject('nope', Role.AUDITOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns evidence ordered newest-first', async () => {
      prisma.project.findUnique.mockResolvedValue(project('dev-1'));
      prisma.evidence.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
      const res = await service.listByProject('proj-1', Role.BUYER);
      expect(res).toHaveLength(2);
    });
  });
});
