import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { SupabaseService } from './supabase/supabase.service';
import { PinataService } from './evidence/pinata/pinata.service';
import { UsersService } from './users/users.service';
import { Role } from '@prisma/client';

const DEV_ID = 'e2e-flow-verify-dev';

@Module({})
class TestAppModule extends AppModule {}

describe('VerdiCred flow verification (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let createdProjectId: string | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue({
        auth: {
          getUser: async (_token: string) => ({
            data: {
              user: { id: DEV_ID, email: 'dev-flow@verdicred.test' },
            },
            error: null,
          }),
        },
      })
      .overrideProvider(PinataService)
      .useValue({
        pinFile: async () => 'bafytestcid-file',
        pinJson: async () => 'bafytestcid-json',
      })
      .overrideProvider(UsersService)
      .useValue({
        ensureUser: async (claim: any) => ({
          id: claim.supabaseId,
          supabaseId: claim.supabaseId,
          email: claim.email,
          role: Role.DEVELOPER,
        }),
        findBySupabaseId: async (id: string) => ({
          id,
          supabaseId: id,
          role: Role.DEVELOPER,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new (require('@nestjs/common').ValidationPipe)({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = { Authorization: 'Bearer test-token' };

  it('GET /api/projects/:id works (404 for unknown, 200 after create)', async () => {
    const unknown = await fetch(`${baseUrl}/api/projects/does-not-exist`, { headers });
    expect(unknown.status).toBe(404);

    // create a project via the same authed user
    const polygon = JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    });
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: 'FlowVerify Project',
        projectType: 'REFORESTATION',
        methodology: 'VM0034',
        expectedAnnualTonnes: 1200,
        geoPolygon: polygon,
      }),
    });
    expect(createRes.status).toBe(201);
    const project = await createRes.json();
    expect(project.id).toBeDefined();
    createdProjectId = project.id;

    const getRes = await fetch(`${baseUrl}/api/projects/${project.id}`, { headers });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(project.id);
    expect(fetched.projectName).toBe('FlowVerify Project');
  });

  it('GET /api/projects/:id/evidence loads (empty list)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${createdProjectId}/evidence`, { headers });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
  });

  it('POST /api/evidence/upload succeeds with multipart FormData (no manual Content-Type)', async () => {
    const form = new FormData();
    form.append('projectId', createdProjectId as string);
    form.append('source', 'GEO_UPLOAD');
    form.append('latitude', '-3.4653');
    form.append('longitude', '-62.2159');
    form.append('note', 'Flow verification upload');
    const file = new File([Buffer.from('fake-png-bytes')], 'plot-a.png', {
      type: 'image/png',
    });
    form.append('file', file);

    // Do NOT set Content-Type — Node's fetch sets the multipart boundary.
    const res = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers,
      body: form as any,
    });
    expect(res.status).toBe(201);
    const ev = await res.json();
    expect(ev.id).toBeDefined();
    expect(ev.projectId).toBe(createdProjectId);
    expect(ev.cid).toBeDefined();
    expect(ev.status).toBeDefined();
  });

  it('GET /api/projects/:id/evidence now returns the uploaded record', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${createdProjectId}/evidence`, { headers });
    expect(res.status).toBe(200);
    const list = (await res.json()) as any[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].source).toBe('GEO_UPLOAD');
  });
});
