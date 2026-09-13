import type { XtreamAccount, XtreamCredentials } from '../provider/xtream/types';

export const FAKE_CREDS: XtreamCredentials = {
  baseUrl: 'http://panel.test',
  username: 'USER',
  password: 'PASS',
  label: 'Test line',
};

/** A fake, already-authenticated Xtream account (no network involved). */
export function fakeAccount(maxConnections = 1, creds: Partial<XtreamCredentials> = {}): XtreamAccount {
  return {
    credentials: { ...FAKE_CREDS, ...creds },
    userInfo: {
      auth: 1,
      status: 'Active',
      exp_date: '1815050267',
      is_trial: '0',
      active_cons: '0',
      created_at: '1783514267',
      max_connections: String(maxConnections),
      allowed_output_formats: ['m3u8', 'ts'],
    },
    serverInfo: {
      url: 'panel.test',
      port: '80',
      https_port: '443',
      server_protocol: 'http',
      timezone: 'UTC',
      timestamp_now: 1789291439,
      time_now: '2026-09-13 09:23:59',
    },
    maxConnections,
    expiresAt: new Date(1815050267 * 1000),
  };
}
