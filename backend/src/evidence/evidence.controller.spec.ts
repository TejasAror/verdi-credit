import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

describe('EvidenceController', () => {
  let controller: EvidenceController;
  let service: any;

  const actorDev = { id: 'dev-1', role: Role.DEVELOPER, supabaseId: 'sb-dev' };
  const actorAdmin = { id: 'admin-1', role: Role.ADMIN, supabaseId: 'sb-admin' };

  beforeEach(async () => {
    service = {
      upload: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      listByProject: jest.fn().mockResolvedValue([{ id: 'ev-1' }]),
      getById: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'ev-1', deleted: true }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EvidenceController],
      providers: [{ provide: EvidenceService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EvidenceController);
  });

  it('upload — forwards the DTO + actor to the service and returns the result', async () => {
    const file = { buffer: Buffer.from('x'), originalname: 'a.png', mimetype: 'image/png' } as any;
    const dto = { projectId: 'p1', source: 'GEO_UPLOAD' } as any;
    const res = await controller.upload(file, dto, actorDev as any);
    expect(res).toEqual({ id: 'ev-1' });
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        dto,
        projectId: 'p1',
        actorId: 'dev-1',
        actorRole: Role.DEVELOPER,
        file: { buffer: file.buffer, filename: 'a.png', mimeType: 'image/png' },
      }),
    );
  });

  it('upload — passes undefined file when none supplied', async () => {
    const dto = { projectId: 'p1', source: 'SENTINEL2' } as any;
    await controller.upload(undefined, dto, actorAdmin as any);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ file: undefined }),
    );
  });

  it('getById is delegated to the service', async () => {
    const res = await controller.getById('ev-1', { id: 'dev-1', role: Role.DEVELOPER } as any);
    expect(res).toEqual({ id: 'ev-1' });
    expect(service.getById).toHaveBeenCalledWith('ev-1', 'dev-1', Role.DEVELOPER);
  });

  it('remove is delegated to the service (Admin only — enforced by @Roles guard)', async () => {
    const res = await controller.remove('ev-1', { id: 'admin-1' } as any);
    expect(res).toEqual({ id: 'ev-1', deleted: true });
    expect(service.remove).toHaveBeenCalledWith('ev-1', 'admin-1');
  });
});
