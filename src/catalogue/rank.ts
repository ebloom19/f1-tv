import type { F1Channel, Language, Quality, SourceTag } from './types.ts';

const SKY_QUALITY_RANK: Record<Quality, number> = {
  FHD: 0,
  HEVC: 1,
  '50FPS': 2,
  HD: 3,
  SD: 4,
  UHD: 5, // last: it answered 401 on the real panel
  UNKNOWN: 6,
};

const LANGUAGE_RANK: Record<Language, number> = { EN: 0, ES: 1, FR: 2, DE: 3, IT: 4 };

function sourcePenalty(source: SourceTag): number {
  switch (source) {
    case 'PPV':
      return 0;
    case 'SKY':
      return 0;
    case 'UK':
      return 10;
    case 'OTHER':
      return 15;
    case 'DE':
      return 50;
    default:
      return 15;
  }
}

/**
 * Lower is better. World feeds:
 *   PPV| F1-TV (0) → PPV| FORMULA 1 UHD (1) → PPV| F1-INTERNATIONAL UK (2)
 *   → Sky Sports F1 FHD (3) > HEVC (4) > 50FPS (5) > HD (6) > SD (7) > UHD (8)
 *   → UK| mirrors (+10) → other languages (20+) → unrecognised (40+).
 */
/**
 * Heuristic: is this feed HEVC carried in MPEG-TS? Apple's HLS can't play that (black video, audio
 * only), though Android can. Matches every stream probed on the real panel: the "UHD" feeds and the
 * bare "F1-TV" world brand are HEVC; "Sky Sports F1", "F1-INTERNATIONAL" and "F1TV PRO" are H.264.
 */
export function likelyHevcInTs(ch: F1Channel): boolean {
  const name = ch.rawName.toUpperCase();
  if (/\bUHD\b/.test(name) || ch.quality === 'UHD') {
    return true;
  }
  if (ch.kind === 'world' && /F1[\s-]*TV/.test(name) && !/PRO|INTERNATIONAL|DATA|TRACKER/.test(name)) {
    return true;
  }
  return false;
}

/** Feeds Apple can't play are pushed to the back of their group so the default pick is playable. */
const APPLE_UNSUPPORTED_PENALTY = 100;

export function rankChannel(ch: F1Channel): number {
  const name = ch.rawName.toUpperCase();
  const applePenalty = likelyHevcInTs(ch) ? APPLE_UNSUPPORTED_PENALTY : 0;
  switch (ch.kind) {
    case 'world': {
      if (ch.source === 'SKY') {
        return 3 + SKY_QUALITY_RANK[ch.quality] + applePenalty;
      }
      const penalty = sourcePenalty(ch.source);
      if (/INTERNATIONAL/.test(name)) {
        const lang = ch.language;
        if (lang === 'EN') {
          return 2 + penalty + applePenalty;
        }
        return 20 + (lang ? LANGUAGE_RANK[lang] : 5) + penalty + applePenalty;
      }
      if (/FORMULA\s*1/.test(name)) {
        return 1 + penalty + applePenalty;
      }
      if (/F1[\s-]*TV/.test(name)) {
        return 0 + penalty + applePenalty;
      }
      return 40 + penalty + applePenalty;
    }
    case 'onboard':
      return sourcePenalty(ch.source);
    case 'data':
    case 'tracker':
      return sourcePenalty(ch.source);
    case 'hidden':
    default:
      return 100 + sourcePenalty(ch.source);
  }
}

export function byRankThenId(a: F1Channel, b: F1Channel): number {
  return a.rank - b.rank || a.streamId - b.streamId;
}
