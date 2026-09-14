/**
 * Pitwall dark theme. Designed for 10-ft viewing: large type, high contrast.
 */
export const colors = {
  bg: '#06080C',
  panel: '#131720',
  panel2: '#1B2029',
  line: '#2A3040',
  ink: '#E8EAF0',
  ink2: '#AEB5C4',
  ink3: '#7C8493',
  accent: '#D40000',
  live: '#FF2D2D',
  ok: '#3DD68C',
  warn: '#F2B95F',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(6, 8, 12, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  /** Text/UI safe inset inside bands (SPEC: 48 px on the 1920 canvas). */
  band: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  /** Driver abbreviations use the heaviest weight available. */
  abbrWeight: '900' as const,
  titleWeight: '800' as const,
  bodyWeight: '500' as const,
  size: {
    xs: 14,
    sm: 18,
    md: 22,
    lg: 28,
    xl: 40,
    hero: 56,
  },
} as const;

export const focus = {
  scale: 1.08,
  borderWidth: 3,
  borderColor: colors.white,
} as const;

export const timing = {
  railAutoHideMs: 6000,
  toastMs: 2500,
  slotRetryMs: 1500,
  slotRetryMax: 20, // 20 × 1.5 s = 30 s; the panel frees a slot 0–5 s after a paced player stops, up to ~25 s after a burst
  vlcStartTimeoutMs: 15000, // VLC must report Playing within this, else the player is remounted (HLS ⇄ TS)
  vlcStartRetryMax: 3, // remounts before giving up with the last VLC state on screen
} as const;

export type Colors = typeof colors;
