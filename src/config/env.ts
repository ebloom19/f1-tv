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
}

/** The generated (git-ignored) environment, with every field coerced to a string. */
export function getConfiguredEnv(): ConfiguredEnv {
  const e = ENV as Partial<ConfiguredEnv>;
  return {
    baseUrl: String(e.baseUrl ?? ''),
    username: String(e.username ?? ''),
    password: String(e.password ?? ''),
    m3u: String(e.m3u ?? ''),
    label: String(e.label ?? 'My line'),
    player: parsePlayerMode(e.player),
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

/** Player mode from the generated env (`PITWALL_PLAYER`): auto | vlc | avplayer. */
export function getPlayerMode(): PlayerMode {
  return getConfiguredEnv().player;
}
