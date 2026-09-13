import { XtreamClient, withSlotRetry } from '../client.ts';
import { XtreamError } from '../errors.ts';
import authFixture from '../../../../__tests__/fixtures/xtream-auth.json';
import streamsFixture from '../../../../__tests__/fixtures/xtream-live-streams.f1.json';
import categoriesFixture from '../../../../__tests__/fixtures/xtream-live-categories.json';

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...p: string[]): string };
const PLAYLIST = fs.readFileSync(path.join(__dirname, '../../../../__tests__/fixtures/playlist-6844.m3u8'), 'utf8');

const creds = { baseUrl: 'http://panel.example.com:80/', username: 'USER', password: 'PASS' };

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body?: string; headers?: Record<string, string>; url?: string },
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, init });
    const r = handler(url, init);
    const res = new Response(r.body ?? '', { status: r.status, headers: r.headers ?? {} });
    if (r.url) {
      Object.defineProperty(res, 'url', { value: r.url });
    }
    return Promise.resolve(res);
  }) as typeof fetch;
  return { fetch: f, calls };
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const h = init?.headers as Record<string, string> | undefined;
  return h?.[name];
}

describe('XtreamClient.authenticate', () => {
  test('parses the fixture, sends the User-Agent header, normalises the base URL', async () => {
    const m = mockFetch(() => ({ status: 200, body: JSON.stringify(authFixture), headers: { 'content-type': 'application/json' } }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    const account = await client.authenticate();
    expect(account.maxConnections).toBe(1);
    expect(account.userInfo.status).toBe('Active');
    expect(account.userInfo.allowed_output_formats).toEqual(['m3u8', 'ts']);
    expect(account.expiresAt).toEqual(new Date(1815050267 * 1000));
    expect(account.credentials.baseUrl).toBe('http://panel.example.com');
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].url).toBe('http://panel.example.com/player_api.php?username=USER&password=PASS');
    expect(headerOf(m.calls[0].init, 'User-Agent')).toBe('Pitwall/1.0 (AppleTV; tvOS)');
  });

  test('custom userAgent is used for API and stream headers', async () => {
    const m = mockFetch(() => ({ status: 200, body: JSON.stringify(authFixture) }));
    const client = new XtreamClient(creds, { fetch: m.fetch, userAgent: 'Pitwall/1.0 (AndroidTV)' });
    await client.authenticate();
    expect(headerOf(m.calls[0].init, 'User-Agent')).toBe('Pitwall/1.0 (AndroidTV)');
    expect(client.streamHeaders()).toEqual({ 'User-Agent': 'Pitwall/1.0 (AndroidTV)' });
  });

  test('auth !== 1 → AUTH_FAILED', async () => {
    const body = { user_info: { ...authFixture.user_info, auth: 0, message: 'Wrong password' }, server_info: authFixture.server_info };
    const m = mockFetch(() => ({ status: 200, body: JSON.stringify(body) }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    await expect(client.authenticate()).rejects.toMatchObject({ name: 'XtreamError', code: 'AUTH_FAILED' });
  });

  test('503 → BLOCKED', async () => {
    const m = mockFetch(() => ({ status: 503, body: '' }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    await expect(client.authenticate()).rejects.toMatchObject({ code: 'BLOCKED', httpStatus: 503 });
  });

  test('non-JSON → PARSE', async () => {
    const m = mockFetch(() => ({ status: 200, body: '<html>' }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    await expect(client.authenticate()).rejects.toMatchObject({ code: 'PARSE' });
  });

  test('network failure → NETWORK', async () => {
    const f = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const client = new XtreamClient(creds, { fetch: f });
    await expect(client.authenticate()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('XtreamClient lists', () => {
  test('getLiveCategories / getLiveStreams build the right URLs', async () => {
    const m = mockFetch(url => ({
      status: 200,
      body: JSON.stringify(url.includes('get_live_categories') ? categoriesFixture : streamsFixture),
    }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    const cats = await client.getLiveCategories();
    expect(cats.find(c => c.category_id === '430')?.category_name).toBe('VIP | F1 and MotoGP');
    const streams = await client.getLiveStreams('430');
    expect(streams.length).toBeGreaterThan(100);
    expect(m.calls[0].url).toContain('&action=get_live_categories');
    expect(m.calls[1].url).toContain('&action=get_live_streams&category_id=430');
  });
  test('non-array → PARSE', async () => {
    const m = mockFetch(() => ({ status: 200, body: '{}' }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    await expect(client.getLiveStreams()).rejects.toMatchObject({ code: 'PARSE' });
  });
});

describe('XtreamClient.streamUrl', () => {
  test('m3u8 by default, ts on request', () => {
    const client = new XtreamClient(creds);
    expect(client.streamUrl(6844)).toBe('http://panel.example.com/live/USER/PASS/6844.m3u8');
    expect(client.streamUrl(6844, 'ts')).toBe('http://panel.example.com/live/USER/PASS/6844.ts');
  });
});

describe('XtreamClient.probePlaylist', () => {
  const EDGE = 'http://10005055.t04m.cc/live/USER/PASS/6844.m3u8?token=x';
  test('ok after redirect (final URL from response.url)', async () => {
    const m = mockFetch(() => ({ status: 200, body: PLAYLIST, headers: { 'content-type': 'application/x-mpegurl' }, url: EDGE }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    const p = await client.probePlaylist(6844);
    expect(p).toMatchObject({ status: 'ok', segments: 2, targetDuration: 11, edgeUrl: 'http://10005055.t04m.cc' });
    expect(m.calls[0].url).toBe('http://panel.example.com/live/USER/PASS/6844.m3u8');
    expect(headerOf(m.calls[0].init, 'User-Agent')).toBe('Pitwall/1.0 (AppleTV; tvOS)');
  });
  test('401 → slot_busy', async () => {
    const m = mockFetch(() => ({ status: 401, body: '' }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    expect(await client.probePlaylist(6844)).toEqual({ status: 'slot_busy', httpStatus: 401 });
  });
  test('200 text/html → offline', async () => {
    const m = mockFetch(() => ({ status: 200, body: '', headers: { 'content-type': 'text/html' } }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    expect(await client.probePlaylist(6844)).toEqual({ status: 'offline', httpStatus: 200 });
  });
  test('network failure → error (never throws)', async () => {
    const f = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const client = new XtreamClient(creds, { fetch: f });
    expect(await client.probePlaylist(6844)).toMatchObject({ status: 'error' });
  });
  test('requirePlaylist throws SLOT_BUSY / OFFLINE', async () => {
    let status = 401;
    const m = mockFetch(() => ({ status, body: '', headers: { 'content-type': 'text/html' } }));
    const client = new XtreamClient(creds, { fetch: m.fetch });
    await expect(client.requirePlaylist(6844)).rejects.toMatchObject({ code: 'SLOT_BUSY', httpStatus: 401 });
    status = 200;
    await expect(client.requirePlaylist(6844)).rejects.toMatchObject({ code: 'OFFLINE' });
  });
});

describe('withSlotRetry', () => {
  test('retries SLOT_BUSY then succeeds', async () => {
    let n = 0;
    const retries: number[] = [];
    const result = await withSlotRetry(
      async () => {
        n += 1;
        if (n < 3) {
          throw new XtreamError('SLOT_BUSY', 'busy', 401);
        }
        return 'played';
      },
      { attempts: 5, delayMs: 1, onRetry: a => retries.push(a) },
    );
    expect(result).toBe('played');
    expect(n).toBe(3);
    expect(retries).toEqual([1, 2]);
  });
  test('does not retry other codes', async () => {
    let n = 0;
    await expect(
      withSlotRetry(async () => {
        n += 1;
        throw new XtreamError('OFFLINE', 'off', 200);
      }, { attempts: 5, delayMs: 1 }),
    ).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(n).toBe(1);
  });
  test('gives up after `attempts` and rethrows the last SLOT_BUSY', async () => {
    let n = 0;
    await expect(
      withSlotRetry(async () => {
        n += 1;
        throw new XtreamError('SLOT_BUSY', 'busy ' + n, 403);
      }, { attempts: 3, delayMs: 1 }),
    ).rejects.toMatchObject({ code: 'SLOT_BUSY', message: 'busy 3' });
    expect(n).toBe(3);
  });
});
