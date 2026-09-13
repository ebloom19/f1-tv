/*
 * Real-provider connection report.
 *   npm run probe            (uses XTREAM_DNS1 / XTREAM_USERNAME / XTREAM_PASSWORD, else src/config/env.generated.ts)
 * Runs under Node 22 with --experimental-strip-types, hence the explicit .ts import extensions and
 * erasable-only TypeScript syntax. Never prints credentials or tokens.
 */
import { XtreamClient, XtreamError } from '../src/provider/xtream/index.ts';
import type { PlaylistProbe, XtreamCredentials } from '../src/provider/xtream/index.ts';
import { buildCatalogue } from '../src/catalogue/index.ts';
import type { F1Channel } from '../src/catalogue/index.ts';
import { getConfiguredCredentials } from '../src/config/env.ts';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
};

function resolveCredentials(): XtreamCredentials | null {
  const env = process.env;
  if (env.XTREAM_USERNAME && env.XTREAM_PASSWORD && env.XTREAM_DNS1) {
    return {
      baseUrl: env.XTREAM_DNS1,
      username: env.XTREAM_USERNAME,
      password: env.XTREAM_PASSWORD,
      label: env.XTREAM_LABEL || 'env',
    };
  }
  return getConfiguredCredentials();
}

function redactor(creds: XtreamCredentials): (s: string) => string {
  const secrets = [creds.username, creds.password].filter(s => s.length > 0);
  return (s: string): string => {
    let out = s;
    for (const secret of secrets) {
      out = out.split(secret).join('***');
      out = out.split(encodeURIComponent(secret)).join('***');
    }
    // Edge tokens are long opaque path segments / query values.
    out = out.replace(/token=[^&\s]+/g, 'token=***').replace(/\/hlsr\/[^/]+\//g, '/hlsr/***/');
    return out;
  };
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'never';
}

function describeProbe(p: PlaylistProbe, redact: (s: string) => string): string {
  switch (p.status) {
    case 'ok':
      return (
        `ok — ${p.segments} segment(s), target duration ${p.targetDuration}s, edge ${redact(p.edgeUrl)}\n` +
        `      first segment: ${redact(p.firstSegmentUrl)}`
      );
    case 'slot_busy':
      return `slot_busy (HTTP ${p.httpStatus}) — all connections in use`;
    case 'offline':
      return `offline (HTTP ${p.httpStatus}) — channel not currently streaming`;
    default:
      return `error${p.httpStatus ? ` (HTTP ${p.httpStatus})` : ''} — ${redact(p.message)}`;
  }
}

function fmtChannel(ch: F1Channel, redact: (s: string) => string): string {
  const lang = ch.language ? ` ${ch.language}` : '';
  return `#${ch.streamId}  rank ${String(ch.rank).padStart(3)}  ${ch.label.padEnd(24)} [${ch.source}${lang} ${ch.quality}]  "${redact(ch.rawName)}"`;
}

async function main(): Promise<void> {
  const creds = resolveCredentials();
  if (!creds) {
    console.error('No credentials: set XTREAM_DNS1, XTREAM_USERNAME and XTREAM_PASSWORD (or run `npm run gen-env`).');
    process.exitCode = 2;
    return;
  }
  const redact = redactor(creds);
  const client = new XtreamClient(creds, { userAgent: 'Pitwall/1.0 (AppleTV; tvOS)', timeoutMs: 20000 });

  console.log('Pitwall — Xtream probe');
  console.log(`line: ${creds.label ?? 'default'}  panel: ${redact(client.baseUrl)}`);
  console.log('');

  const t0 = Date.now();
  const account = await client.authenticate();
  const ui = account.userInfo;
  console.log('Account');
  console.log(`  status:          ${ui.status}  (auth ${ui.auth}, trial ${ui.is_trial})`);
  console.log(`  max connections: ${account.maxConnections}  (active now: ${ui.active_cons})`);
  console.log(`  expires:         ${fmtDate(account.expiresAt)}`);
  console.log(`  output formats:  ${(ui.allowed_output_formats ?? []).join(', ')}`);
  console.log(`  server:          ${account.serverInfo.server_protocol}://${redact(account.serverInfo.url)}:${account.serverInfo.port}  tz ${account.serverInfo.timezone}`);
  console.log(`  auth round-trip: ${Date.now() - t0} ms`);
  console.log('');

  const [categories, streams] = await Promise.all([client.getLiveCategories(), client.getLiveStreams()]);
  const f1Cats = categories.filter(c => /F1|FORMULA|SPORT/i.test(c.category_name));
  console.log(`Live categories: ${categories.length} (F1/sport-looking: ${f1Cats.map(c => `${c.category_id} "${c.category_name}"`).join(', ') || 'none'})`);
  console.log(`Live streams:    ${streams.length}`);
  console.log('');

  const cat = buildCatalogue(streams, categories);
  console.log(`World feeds (${cat.worldFeeds.length})`);
  for (const ch of cat.worldFeeds) {
    console.log(`  ${fmtChannel(ch, redact)}${cat.defaultWorldFeed && ch.streamId === cat.defaultWorldFeed.streamId ? '  <- default' : ''}`);
  }
  console.log('');
  console.log(`Drivers (${cat.drivers.length})`);
  for (const d of cat.drivers) {
    const alts = d.alternates.length ? `  alt: ${d.alternates.map(a => `${a.source}#${a.streamId}`).join(', ')}` : '';
    console.log(`  ${d.abbr}  ${d.fullName.padEnd(22)} ${d.team.padEnd(16)} ${d.teamId.padEnd(12)} ${d.color}  primary ${d.primary.source}#${d.primary.streamId}${alts}`);
  }
  console.log('');
  console.log(`Data channels (${cat.data.length})`);
  for (const ch of cat.data) {
    console.log(`  ${ch.kind.padEnd(8)} ${fmtChannel(ch, redact)}`);
  }
  console.log('');
  console.log(`Hidden: ${cat.hidden.length}  (DE| legacy cams, APPLE TV nn, [BK] backups, TEMPORERY, spare mirrors)`);
  console.log('');

  if (!cat.defaultWorldFeed) {
    console.log('No default world feed found — nothing to probe.');
    process.exitCode = 1;
    return;
  }
  const wf = cat.defaultWorldFeed;
  console.log(`Probing default world feed #${wf.streamId} "${redact(wf.rawName)}" …`);
  const t1 = Date.now();
  const probe = await client.probePlaylist(wf.streamId);
  console.log(`  ${describeProbe(probe, redact)}  (${Date.now() - t1} ms)`);

  const abbrArg = process.argv.find(a => /^--onboard=/.test(a));
  if (abbrArg) {
    const abbr = abbrArg.slice('--onboard='.length).toUpperCase();
    const driver = cat.drivers.find(d => d.abbr === abbr);
    if (!driver) {
      console.log(`  no driver ${abbr} in catalogue`);
    } else {
      console.log(`Waiting 6 s for the slot to free, then probing ${abbr} onboard #${driver.primary.streamId} …`);
      await new Promise<void>(resolve => setTimeout(resolve, 6000));
      const p2 = await client.probePlaylist(driver.primary.streamId);
      console.log(`  ${describeProbe(p2, redact)}`);
    }
  }
}

main().catch((err: unknown) => {
  if (err instanceof XtreamError) {
    console.error(`Probe failed [${err.code}${err.httpStatus ? ` HTTP ${err.httpStatus}` : ''}]: ${err.message}`);
  } else {
    console.error('Probe failed:', err instanceof Error ? err.message : String(err));
  }
  process.exitCode = 1;
});
