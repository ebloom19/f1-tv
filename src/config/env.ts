import { ENV } from './env.generated.ts';
import type { XtreamCredentials } from '../provider/xtream/types.ts';
import { normalizeBaseUrl } from '../provider/xtream/urls.ts';
import { parsePlayerMode } from '../player/choosePlayer.ts';
import type { PlayerMode } from '../player/choosePlayer.ts';

export interface ConfiguredEnv {
  baseUrl: string;
  username: string;
  password: string;
  m3u: string;
  label: string;
  player: PlayerMode;
  /** VLC network buffer in ms (`PITWALL_VLC_CACHING_MS`). */
  vlcCachingMs: number;
}

export const DEFAULT_VLC_CACHING_MS = 3000;

/** Clamps `PITWALL_VLC_CACHING_MS` to a sane live range; anything unparsable falls back to the default. */
export function parseVlcCachingMs(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) {
    return DEFAULT_VLC_CACHING_MS;
  }
  return Math.min(15000, Math.max(300, Math.round(n)));
}

/** The generated (git-ignored) environment, with every field coerced to a string. */
export function getConfiguredEnv(): ConfiguredEnv {
  const e = ENV as Partial<Record<keyof ConfiguredEnv, unknown>>;
  return {
    baseUrl: String(e.baseUrl ?? ''),
    username: String(e.username ?? ''),
    password: String(e.password ?? ''),
    m3u: String(e.m3u ?? ''),
    label: String(e.label ?? 'My line'),
    player: parsePlayerMode(e.player),
    vlcCachingMs: parseVlcCachingMs(e.vlcCachingMs),
  };
}

/** Credentials baked in at build time, or null when no username was configured. */
export function getConfiguredCredentials(): XtreamCredentials | null {
  const e = getConfiguredEnv();
  if (!e.username.trim()) {
    return null;
  }
  return {
    baseUrl: normalizeBaseUrl(e.baseUrl),
    username: e.username.trim(),
    password: e.password,
    label: e.label || 'My line',
  };
}

/** VLC network buffer from the generated env (`PITWALL_VLC_CACHING_MS`), default 3000 ms. */
export function getVlcCachingMs(): number {
  return getConfiguredEnv().vlcCachingMs;
}

/** Player mode from the generated env (`PITWALL_PLAYER`): auto | vlc | avplayer. */
export function getPlayerMode(): PlayerMode {
  return getConfiguredEnv().player;
}
