import type { XtreamLiveStream } from '../provider/xtream/types.ts';
import type { DriverRef, F1Channel, Language } from './types.ts';
import { matchTeamId, teamColor } from './teams.ts';
import {
  isF1Name,
  isSeparatorName,
  lastNameOf,
  parseDriverName,
  parseLanguage,
  parseQuality,
  stripSourcePrefix,
} from './parse.ts';

export function driverRefFrom(fullName: string, team: string, abbr: string): DriverRef {
  const teamId = matchTeamId(team);
  return { abbr, fullName, lastName: lastNameOf(fullName), team, teamId, color: teamColor(teamId) };
}

/**
 * Turns one Xtream live stream into an F1Channel, or null when it is not F1 at all
 * (MotoGP, TT Races, football, account info, `✦●✦` separators …) and must not enter the catalogue.
 * The returned channel's `rank` is 0; `rankChannel` (rank.ts) assigns the real one.
 */
export function classifyStream(stream: XtreamLiveStream): F1Channel | null {
  const rawName = stream.name ?? '';
  if (isSeparatorName(rawName)) {
    return null;
  }
  const { source, name } = stripSourcePrefix(rawName);
  // Legacy `DE| VER VERSTAPPEN | RED BULL (CAM)` onboards never say "F1" but belong to the F1 block → hidden.
  const legacyDeCam = source === 'DE' && /\(CAM\)/i.test(name);
  if (!isF1Name(name) && !legacyDeCam) {
    return null;
  }
  const upper = name.toUpperCase();
  const base = {
    streamId: stream.stream_id,
    rawName,
    categoryId: String(stream.category_id ?? ''),
    rank: 0,
  };
  const hidden = (label: string): F1Channel => ({
    ...base,
    kind: 'hidden',
    label,
    source,
    quality: parseQuality(name),
  });

  // Legacy 2023 `DE| … (CAM)` lineup and its F1TV PRO mirrors: dead → hidden.
  if (source === 'DE') {
    return hidden(name);
  }
  if (/APPLE\s*TV\s*F1/i.test(name)) {
    return hidden(name);
  }
  if (/\[BK\]/i.test(name)) {
    return hidden(name);
  }
  if (/TEMPORER?ARY|TEMPORERY/i.test(name)) {
    return hidden(name);
  }

  const driver = parseDriverName(name);
  if (driver) {
    const ref = driverRefFrom(driver.fullName, driver.team, driver.abbr);
    return {
      ...base,
      kind: 'onboard',
      label: `${ref.abbr} · ${ref.lastName}`,
      source,
      quality: 'UNKNOWN',
      driver: ref,
    };
  }

  if (/F1[\s-]*DATA\b/i.test(name) || /\bDATA\b/i.test(name)) {
    return { ...base, kind: 'data', label: 'F1 Data', source, quality: parseQuality(name) };
  }
  if (/TRACKER/i.test(name)) {
    return { ...base, kind: 'tracker', label: 'F1 Tracker', source, quality: parseQuality(name) };
  }

  if (/SKY\s*SPORTS?\s*F1/i.test(name)) {
    const quality = parseQuality(name);
    const suffix = quality === 'UNKNOWN' ? '' : ` ${quality === '50FPS' ? '50 FPS' : quality}`;
    return {
      ...base,
      kind: 'world',
      label: `Sky Sports F1${suffix}`,
      source: 'SKY',
      quality,
      language: 'EN',
    };
  }
  if (/F1[\s-]*INTERNATIONAL/i.test(name)) {
    const language: Language | undefined = parseLanguage(name);
    return {
      ...base,
      kind: 'world',
      label: `F1 International${language ? ` ${language}` : ''}`,
      source,
      quality: parseQuality(name),
      language,
    };
  }
  if (/FORMULA\s*1/i.test(upper)) {
    const quality = parseQuality(name);
    return {
      ...base,
      kind: 'world',
      label: `Formula 1${quality === 'UNKNOWN' ? '' : ` ${quality}`}`,
      source,
      quality,
      language: 'EN',
    };
  }
  if (/^F1[\s-]*TV\b/i.test(name) || /\bF1[\s-]*TV\b/i.test(name)) {
    return {
      ...base,
      kind: 'world',
      label: 'F1 TV',
      source,
      quality: parseQuality(name),
      language: 'EN',
    };
  }

  // Mentions F1 but matches no known shape: keep it visible in `hidden` for diagnostics.
  return hidden(name);
}
