/*
 * Real-provider tests. Skipped unless XTREAM_USERNAME is set (see scripts/gen-env.js for the variables).
 * Run: XTREAM_DNS1=… XTREAM_USERNAME=… XTREAM_PASSWORD=… npx jest __tests__/integration --runInBand
 * The account is expected to have max_connections = 1 (the concurrency test skips itself otherwise).
 */
import { XtreamClient, withSlotRetry } from '../../src/provider/xtream/index.ts';
import type { PlaylistProbe, XtreamAccount } from '../../src/provider/xtream/index.ts';
import { buildCatalogue } from '../../src/catalogue/index.ts';
import type { F1Catalogue } from '../../src/catalogue/index.ts';

declare const process: { env: Record<string, string | undefined> };

const live = process.env.XTREAM_USERNAME ? describe : describe.skip;
const UA = 'Pitwall/1.0 (AppleTV; tvOS)';
const SLOT_FREE_MS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface StreamBody {
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null;
}

/** Reads the first chunk of a response body, then cancels the download. */
async function readFirstChunk(res: Response): Promise<Uint8Array> {
  const body = (res as unknown as StreamBody).body;
  if (!body) {
    return new Uint8Array(await res.arrayBuffer());
  }
  const reader = body.getReader();
  const { value } = await reader.read();
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  return value ?? new Uint8Array(0);
}

/**
 * Earlier activity on the line (a previous test run, `npm run probe`, a player) can hold the single slot
 * for up to a minute or more, so wait until the stream probes ok before relying on it. Same-stream
 * re-requests never count as a second connection, which makes this safe to poll.
 */
async function waitForSlot(client: XtreamClient, streamId: number, maxMs = 150000): Promise<PlaylistProbe> {
  const started = Date.now();
  let probe = await client.probePlaylist(streamId);
  while (probe.status === 'slot_busy' && Date.now() - started < maxMs) {
    await sleep(5000);
    probe = await client.probePlaylist(streamId);
  }
  const waited = Date.now() - started;
  if (waited > 1000) {
    console.log(`waited ${(waited / 1000).toFixed(0)} s for the slot to free before probing #${streamId} (${probe.status})`);
  }
  return probe;
}

function okProbe(p: PlaylistProbe): Extract<PlaylistProbe, { status: 'ok' }> {
  if (p.status !== 'ok') {
    throw new Error(`expected ok probe, got ${JSON.stringify(p)}`);
  }
  return p;
}

live('Xtream live provider', () => {
  const client = new XtreamClient(
    {
      baseUrl: process.env.XTREAM_DNS1 ?? '',
      username: process.env.XTREAM_USERNAME ?? '',
      password: process.env.XTREAM_PASSWORD ?? '',
      label: 'integration',
    },
    { userAgent: UA, timeoutMs: 30000 },
  );
  let account: XtreamAccount;
  let catalogue: F1Catalogue;

  afterAll(async () => {
    // Leave the slot free for whoever runs next.
    await sleep(SLOT_FREE_MS);
  }, SLOT_FREE_MS + 5000);

  test(
    'authenticate ok with maxConnections >= 1',
    async () => {
      account = await client.authenticate();
      expect(account.userInfo.auth).toBe(1);
      expect(account.userInfo.status).toBe('Active');
      expect(account.maxConnections).toBeGreaterThanOrEqual(1);
      expect(account.userInfo.allowed_output_formats).toContain('m3u8');
    },
    30000,
  );

  test(
    'catalogue has >= 18 drivers and a default world feed',
    async () => {
      const [categories, streams] = await Promise.all([client.getLiveCategories(), client.getLiveStreams()]);
      expect(categories.length).toBeGreaterThan(0);
      expect(streams.length).toBeGreaterThan(20);
      catalogue = buildCatalogue(streams, categories);
      expect(catalogue.drivers.length).toBeGreaterThanOrEqual(18);
      expect(catalogue.defaultWorldFeed).not.toBeNull();
      expect(catalogue.drivers.every(d => d.teamId !== 'unknown')).toBe(true);
    },
    60000,
  );

  test(
    'default world feed playlist is ok and its first segment is MPEG-TS',
    async () => {
      const wf = catalogue.defaultWorldFeed!;
      const probe = okProbe(await waitForSlot(client, wf.streamId));
      expect(probe.segments).toBeGreaterThan(0);
      expect(probe.targetDuration).toBeGreaterThan(0);
      expect(probe.edgeUrl).toMatch(/^https?:\/\//);
      expect(probe.firstSegmentUrl.startsWith(probe.edgeUrl)).toBe(true);

      // The edge ignores Range (answers 200 with the whole ~9 MB segment), so read only the first chunk
      // and cancel: a fully downloaded segment keeps the slot busy for ~40 s afterwards.
      const res = await fetch(probe.firstSegmentUrl, {
        headers: { ...client.streamHeaders(), Range: 'bytes=0-4000' },
      });
      expect([200, 206]).toContain(res.status);
      const bytes = await readFirstChunk(res);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes[0]).toBe(0x47); // MPEG-TS sync byte
      await sleep(SLOT_FREE_MS);
    },
    240000,
  );

  test(
    'a second concurrent stream is slot_busy while the slot is occupied, then frees again',
    async () => {
      const ver = catalogue.drivers.find(d => d.abbr === 'VER') ?? catalogue.drivers[0];
      const wf = catalogue.defaultWorldFeed!;
      if (account.maxConnections > 1) {
        console.log(`skipping concurrency assertions: account allows ${account.maxConnections} connections`);
        return;
      }
      const world = okProbe(await waitForSlot(client, wf.streamId));
      // Occupy the single slot like a player would: keep segment traffic flowing. The panel registers the
      // session asynchronously (a few seconds after traffic starts), so probe VER every 2 s for up to 16 s.
      let stop = false;
      let downloaded = 0;
      const loader = (async () => {
        // Throttled: a real player pulls ~1 segment per target duration; hammering the edge at full
        // bandwidth makes the panel hold the session much longer afterwards.
        while (!stop) {
          const r = await fetch(world.firstSegmentUrl, { headers: client.streamHeaders() });
          downloaded += (await r.arrayBuffer()).byteLength;
          for (let i = 0; i < 6 && !stop; i++) {
            await sleep(500);
          }
        }
      })();
      let busy: PlaylistProbe | null = null;
      const loadStarted = Date.now();
      for (let attempt = 0; attempt < 8 && !busy; attempt++) {
        await sleep(2000);
        const p = await client.probePlaylist(ver.primary.streamId);
        if (p.status === 'slot_busy') {
          busy = p;
          console.log(`VER slot_busy observed ${((Date.now() - loadStarted) / 1000).toFixed(1)} s into the world-feed load`);
        }
      }
      stop = true;
      await loader;
      console.log(`world-feed load stopped after ${(downloaded / 1e6).toFixed(1)} MB`);
      if (!busy) {
        console.log(
          'concurrency not observed: the panel did not register the world-feed session within 16 s of traffic ' +
            '(its connection accounting is asynchronous) — skipping the slot_busy assertion',
        );
        return;
      }
      expect(busy.status).toBe('slot_busy');
      expect([401, 403]).toContain(busy.httpStatus);

      // Release lag is variable (5–25 s after a cancelled download, 40–60 s after full segments): allow 120 s.
      const started = Date.now();
      let retries = 0;
      const ok = await withSlotRetry(() => client.requirePlaylist(ver.primary.streamId), {
        attempts: 80,
        delayMs: 1500,
        onRetry: () => {
          retries += 1;
        },
      });
      const freedAfterMs = Date.now() - started;
      console.log(`VER onboard free again after ${(freedAfterMs / 1000).toFixed(1)} s (${retries} retries)`);
      expect(ok.status).toBe('ok');
      expect(ok.firstSegmentUrl).toMatch(/^https?:\/\//);
    },
    300000,
  );
});
