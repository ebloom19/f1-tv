import type { Language, Quality, SourceTag } from './types.ts';

export interface ParsedDriverName {
  fullName: string;
  team: string;
  abbr: string;
}

export interface StrippedName {
  source: SourceTag;
  name: string;
}

const PREFIX_RE = /^\s*(PPV|UK|DE)\s*\|\s*/i;

/** Splits `PPV| F1-TV` into `{ source: 'PPV', name: 'F1-TV' }`. Unknown prefixes → source OTHER, name untouched. */
export function stripSourcePrefix(rawName: string): StrippedName {
  const raw = rawName ?? '';
  const m = PREFIX_RE.exec(raw);
  if (!m) {
    return { source: 'OTHER', name: raw.trim() };
  }
  const tag = m[1].toUpperCase() as 'PPV' | 'UK' | 'DE';
  return { source: tag, name: raw.slice(m[0].length).trim() };
}

const DRIVER_RE = /^F1\s+([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([A-Z]{2,4})\s*$/;

/**
 * Parses the stable onboard pattern `F1 {Full Name} | {Team} | {ABBR}`; a `PPV| ` / `UK| ` prefix is
 * tolerated. Returns null for anything else.
 */
export function parseDriverName(name: string): ParsedDriverName | null {
  const { name: stripped } = stripSourcePrefix(name ?? '');
  const m = DRIVER_RE.exec(stripped);
  if (!m) {
    return null;
  }
  const fullName = m[1].replace(/\s+/g, ' ').trim();
  const team = m[2].replace(/\s+/g, ' ').trim();
  const abbr = m[3].toUpperCase();
  if (!fullName || !team) {
    return null;
  }
  return { fullName, team, abbr };
}

export function lastNameOf(fullName: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Quality token from a channel name suffix (FHD / HEVC / 50 FPS / UHD / HD / SD). */
export function parseQuality(name: string): Quality {
  const n = (name ?? '').toUpperCase();
  if (/\b(UHD|4K)\b/.test(n)) {
    return 'UHD';
  }
  if (/\bFHD\b/.test(n)) {
    return 'FHD';
  }
  if (/\bHEVC\b/.test(n)) {
    return 'HEVC';
  }
  if (/\b50\s*FPS\b/.test(n)) {
    return '50FPS';
  }
  if (/\bHD\b/.test(n)) {
    return 'HD';
  }
  if (/\bSD\b/.test(n)) {
    return 'SD';
  }
  return 'UNKNOWN';
}

const LANG_MAP: Record<string, Language> = {
  UK: 'EN',
  EN: 'EN',
  GB: 'EN',
  ENG: 'EN',
  ES: 'ES',
  SP: 'ES',
  FR: 'FR',
  DE: 'DE',
  IT: 'IT',
};

/** Language from an `F1-INTERNATIONAL xx` style suffix; undefined when absent/unknown. */
export function parseLanguage(name: string): Language | undefined {
  const m = /INTERNATIONAL[\s-]+([A-Z]{2,3})\b/i.exec(name ?? '');
  if (!m) {
    return undefined;
  }
  return LANG_MAP[m[1].toUpperCase()];
}

/** `✦●✦ … ✦●✦` group separators the panel injects into the stream list. */
export function isSeparatorName(name: string): boolean {
  const n = (name ?? '').trim();
  return n.includes('✦') || n.includes('●') || /^[^A-Za-z0-9]*$/.test(n);
}

/** Only names mentioning F1 / Formula are candidates for the catalogue. */
export function isF1Name(name: string): boolean {
  return /F1|FORMULA/i.test(name ?? '');
}
