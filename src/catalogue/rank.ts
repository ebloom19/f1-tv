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
export function rankChannel(ch: F1Channel): number {
  const name = ch.rawName.toUpperCase();
  switch (ch.kind) {
    case 'world': {
      if (ch.source === 'SKY') {
        return 3 + SKY_QUALITY_RANK[ch.quality];
      }
      const penalty = sourcePenalty(ch.source);
      if (/INTERNATIONAL/.test(name)) {
        const lang = ch.language;
        if (lang === 'EN') {
          return 2 + penalty;
        }
        return 20 + (lang ? LANGUAGE_RANK[lang] : 5) + penalty;
      }
      if (/FORMULA\s*1/.test(name)) {
        return 1 + penalty;
      }
      if (/F1[\s-]*TV/.test(name)) {
        return 0 + penalty;
      }
      return 40 + penalty;
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
