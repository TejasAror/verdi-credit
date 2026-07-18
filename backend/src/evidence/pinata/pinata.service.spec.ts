import { PinataService } from './pinata.service';

describe('PinataService', () => {
  let pinata: PinataService;
  let fetchSpy: jest.SpyInstance;

  const okResponse = (body: unknown) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as Response);

  beforeEach(() => {
    pinata = new PinataService({
      get: (k: string) => (k === 'PINATA_JWT' ? 'test-jwt' : undefined),
    } as any);
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ IpfsHash: 'bafytestcid123', PinSize: 42 }),
      } as Response);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('pins JSON and builds a gateway URL', async () => {
    const res = await pinata.pinJson({ hello: 'world' }, 'my-evidence');
    expect(res.cid).toBe('bafytestcid123');
    expect(res.ipfsUrl).toBe('https://blush-decent-coyote-808.mypinata.cloud/ipfs/bafytestcid123');
    expect(res.size).toBe(42);
  });

  it('pins a file Buffer with its content type', async () => {
    const buf = Buffer.from('binary-bytes');
    const res = await pinata.pinFile(buf, 'plot.png', 'image/png');
    expect(res.cid).toBe('bafytestcid123');
    expect(res.ipfsUrl).toContain('/ipfs/bafytestcid123');
  });

  it('throws on a non-ok Pinata response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as Response);
    await expect(pinata.pinJson({ a: 1 })).rejects.toThrow(/pinJSON failed/);
  });

  it('uses the configured gateway when PINATA_GATEWAY is set', async () => {
    const gwPinata = new PinataService({
      get: (k: string) => (k === 'PINATA_JWT' ? 'j' : 'gateway.example.com'),
    } as any);
    const res = await gwPinata.pinJson({ a: 1 });
    expect(res.ipfsUrl).toBe('https://gateway.example.com/ipfs/bafytestcid123');
  });
});
