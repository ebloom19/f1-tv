import { ENV } from './env.generated.ts';
import type { XtreamCredentials } from '../provider/xtream/types.ts';
import { normalizeBaseUrl } from '../provider/xtream/urls.ts';

export interface ConfiguredEnv {
  baseUrl: string;
  username: string;
  password: string;
  m3u: string;
  label: string;
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
