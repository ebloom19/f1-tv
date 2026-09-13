import type { XtreamLiveCategory, XtreamLiveStream } from '../provider/xtream/types.ts';
import type { DriverEntry, F1Catalogue, F1Channel } from './types.ts';
import { classifyStream } from './classify.ts';
import { byRankThenId, rankChannel } from './rank.ts';
import { teamOrderIndex } from './teams.ts';

/**
 * Builds the F1 catalogue from the raw Xtream live-stream list.
 * `categories` is accepted for parity with the API (and future category-based hints) but classification
 * is name-driven: the panel's category names are not reliable (F1 lives in "VIP | F1 and MotoGP").
 */
export function buildCatalogue(streams: XtreamLiveStream[], _categories: XtreamLiveCategory[] = []): F1Catalogue {
  const channels: F1Channel[] = [];
  const seen = new Set<number>();
  for (const stream of streams ?? []) {
    if (!stream || typeof stream.stream_id !== 'number' || seen.has(stream.stream_id)) {
      continue;
    }
    const ch = classifyStream(stream);
    if (!ch) {
      continue;
    }
    seen.add(stream.stream_id);
    ch.rank = rankChannel(ch);
    channels.push(ch);
  }

  const worldFeeds = channels.filter(c => c.kind === 'world').sort(byRankThenId);
  const defaultWorldFeed = worldFeeds.length ? worldFeeds[0] : null;

  // One DriverEntry per abbreviation: best-ranked (PPV) is primary, the rest (UK) are alternates.
  const byAbbr = new Map<string, F1Channel[]>();
  for (const ch of channels) {
    if (ch.kind !== 'onboard' || !ch.driver) {
      continue;
    }
    const list = byAbbr.get(ch.driver.abbr) ?? [];
    list.push(ch);
    byAbbr.set(ch.driver.abbr, list);
  }
  const drivers: DriverEntry[] = [];
  for (const list of byAbbr.values()) {
    list.sort(byRankThenId);
    const primary = list[0];
    const ref = primary.driver!;
    drivers.push({ ...ref, primary, alternates: list.slice(1) });
  }
  drivers.sort((a, b) => teamOrderIndex(a.teamId) - teamOrderIndex(b.teamId) || a.abbr.localeCompare(b.abbr));

  // Data / tracker: best of each kind is exposed; spare mirrors go to hidden.
  const hidden: F1Channel[] = channels.filter(c => c.kind === 'hidden');
  const data: F1Channel[] = [];
  for (const kind of ['data', 'tracker'] as const) {
    const list = channels.filter(c => c.kind === kind).sort(byRankThenId);
    if (list.length) {
      data.push(list[0]);
      for (const extra of list.slice(1)) {
        hidden.push({ ...extra, kind: 'hidden' });
      }
    }
  }
  hidden.sort(byRankThenId);

  return { worldFeeds, defaultWorldFeed, drivers, data, hidden, fetchedAt: Date.now() };
}

export function findDriver(catalogue: F1Catalogue, abbr: string): DriverEntry | undefined {
  const key = (abbr ?? '').toUpperCase();
  return catalogue.drivers.find(d => d.abbr === key);
}

export function findChannel(catalogue: F1Catalogue, streamId: number): F1Channel | undefined {
  for (const ch of catalogue.worldFeeds) {
    if (ch.streamId === streamId) {
      return ch;
    }
  }
  for (const d of catalogue.drivers) {
    if (d.primary.streamId === streamId) {
      return d.primary;
    }
    const alt = d.alternates.find(a => a.streamId === streamId);
    if (alt) {
      return alt;
    }
  }
  return catalogue.data.find(c => c.streamId === streamId) ?? catalogue.hidden.find(c => c.streamId === streamId);
}
