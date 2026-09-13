/**
 * Maps multiview `SourceId`s onto catalogue channels and rail chips.
 */
import type { DriverEntry, F1Catalogue, F1Channel } from '../catalogue/types';
import { TEAM_COLORS } from '../catalogue/teams';
import { makeSourceId, parseSourceId } from '../multiview/types';
import type { SourceId } from '../multiview/types';

export type SourceGroup = 'world' | 'driver' | 'data';

export interface ResolvedSource {
  id: SourceId;
  group: SourceGroup;
  channel: F1Channel;
  streamId: number;
  /** Short code for chips and tile headers: driver abbr, or e.g. "TV" / "DATA". */
  abbr: string;
  /** Secondary line: driver last name or the channel label. */
  name: string;
  /** Header suffix used on tiles: ONBOARD / WORLD FEED / DATA. */
  kindLabel: string;
  color: string;
  driver?: DriverEntry;
}

const NEUTRAL = TEAM_COLORS.unknown;

function worldAbbr(ch: F1Channel): string {
  const label = ch.label.toUpperCase();
  if (label.includes('UHD')) {
    return 'UHD';
  }
  if (label.includes('SKY')) {
    return 'SKY';
  }
  if (ch.language && ch.language !== 'EN') {
    return ch.language;
  }
  return 'TV';
}

function dataAbbr(ch: F1Channel): string {
  return ch.kind === 'tracker' ? 'TRK' : 'DATA';
}

export function worldSource(ch: F1Channel): ResolvedSource {
  return {
    id: makeSourceId('world', ch.streamId),
    group: 'world',
    channel: ch,
    streamId: ch.streamId,
    abbr: worldAbbr(ch),
    name: ch.label,
    kindLabel: 'WORLD FEED',
    color: NEUTRAL,
  };
}

export function driverSource(d: DriverEntry): ResolvedSource {
  return {
    id: makeSourceId('driver', d.abbr),
    group: 'driver',
    channel: d.primary,
    streamId: d.primary.streamId,
    abbr: d.abbr,
    name: d.lastName,
    kindLabel: 'ONBOARD',
    color: d.color,
    driver: d,
  };
}

export function dataSource(ch: F1Channel): ResolvedSource {
  return {
    id: makeSourceId('data', ch.streamId),
    group: 'data',
    channel: ch,
    streamId: ch.streamId,
    abbr: dataAbbr(ch),
    name: ch.label,
    kindLabel: ch.kind === 'tracker' ? 'TRACKER' : 'DATA',
    color: NEUTRAL,
  };
}

/** Resolve a `SourceId` against the catalogue, or null when it no longer exists. */
export function resolveSource(catalogue: F1Catalogue, id: SourceId): ResolvedSource | null {
  const { kind, key } = parseSourceId(id);
  if (kind === 'driver') {
    const abbr = key.toUpperCase();
    const d = catalogue.drivers.find(x => x.abbr === abbr);
    return d ? driverSource(d) : null;
  }
  const streamId = Number(key);
  if (!Number.isFinite(streamId)) {
    return null;
  }
  if (kind === 'world') {
    const ch = catalogue.worldFeeds.find(x => x.streamId === streamId);
    return ch ? worldSource(ch) : null;
  }
  const dch = catalogue.data.find(x => x.streamId === streamId);
  if (dch) {
    return dataSource(dch);
  }
  // Tolerate a `data:` id that actually points at a world feed.
  const wch = catalogue.worldFeeds.find(x => x.streamId === streamId);
  return wch ? worldSource(wch) : null;
}

/** Rail order: world feeds first, then drivers grouped by team, then data/tracker screens. */
export function railSources(catalogue: F1Catalogue): ResolvedSource[] {
  return [
    ...catalogue.worldFeeds.map(worldSource),
    ...catalogue.drivers.map(driverSource),
    ...catalogue.data.map(dataSource),
  ];
}

export function defaultMainSource(catalogue: F1Catalogue): SourceId | null {
  if (catalogue.defaultWorldFeed) {
    return makeSourceId('world', catalogue.defaultWorldFeed.streamId);
  }
  if (catalogue.drivers.length) {
    return makeSourceId('driver', catalogue.drivers[0].abbr);
  }
  return null;
}
