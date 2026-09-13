import type { StreamFormat, XtreamCredentials } from './types.ts';

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\//i;

/**
 * Canonicalises whatever the user typed for the panel address into `scheme://host[:port]`.
 * Accepts `host`, `http://host`, `http://host:80/`, `https://host:25460/some/path?x` …
 * Default ports (80 for http, 443 for https) are dropped; any path/query/fragment is stripped.
 */
export function normalizeBaseUrl(input: string): string {
  let s = (input ?? '').trim();
  if (!s) {
    return '';
  }
  if (!SCHEME_RE.test(s)) {
    s = 'http://' + s.replace(/^\/+/, '');
  }
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(s);
  if (!m) {
    return s;
  }
  const scheme = m[1].toLowerCase();
  let authority = m[2].toLowerCase();
  if ((scheme === 'http' && /:80$/.test(authority)) || (scheme === 'https' && /:443$/.test(authority))) {
    authority = authority.replace(/:\d+$/, '');
  }
  return `${scheme}://${authority}`;
}

/** `scheme://host[:port]` of any absolute URL ('' when the input is not absolute). */
export function originOf(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i.exec(url ?? '');
  return m ? m[1] : '';
}

function enc(v: string | number | boolean): string {
  return encodeURIComponent(String(v));
}

export function buildPlayerApiUrl(
  creds: XtreamCredentials,
  action?: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const base = normalizeBaseUrl(creds.baseUrl);
  const q: string[] = [`username=${enc(creds.username)}`, `password=${enc(creds.password)}`];
  if (action) {
    q.push(`action=${enc(action)}`);
  }
  if (params) {
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value !== undefined && value !== '') {
        q.push(`${enc(key)}=${enc(value)}`);
      }
    }
  }
  return `${base}/player_api.php?${q.join('&')}`;
}

export function buildStreamUrl(creds: XtreamCredentials, id: number, format: StreamFormat = 'm3u8'): string {
  const base = normalizeBaseUrl(creds.baseUrl);
  return `${base}/live/${enc(creds.username)}/${enc(creds.password)}/${id}.${format}`;
}

export interface M3uPlusEntry {
  name: string;
  url: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  /** Stream id when the URL follows the Xtream `/live/U/P/{id}.{ext}` shape. */
  streamId: number | null;
  duration: number;
}

/**
 * Bonus M3U-plus interop: parses one `#EXTINF:-1 tvg-id="…" … group-title="…",Name` line plus its URL line.
 */
export function parseM3uPlusLine(extinf: string, url: string): M3uPlusEntry {
  const line = (extinf ?? '').trim();
  const body = line.replace(/^#EXTINF:/i, '');
  const comma = body.indexOf(',');
  const attrsPart = comma >= 0 ? body.slice(0, comma) : body;
  const name = comma >= 0 ? body.slice(comma + 1).trim() : '';
  const durationMatch = /^(-?\d+(?:\.\d+)?)/.exec(attrsPart.trim());
  const duration = durationMatch ? Number(durationMatch[1]) : -1;
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrsPart)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  const trimmedUrl = (url ?? '').trim();
  const idMatch = /\/live\/[^/]+\/[^/]+\/(\d+)\.(?:m3u8|ts)(?:[?#].*)?$/i.exec(trimmedUrl);
  return {
    name: name || attrs['tvg-name'] || '',
    url: trimmedUrl,
    tvgId: attrs['tvg-id'] ?? '',
    tvgName: attrs['tvg-name'] ?? '',
    tvgLogo: attrs['tvg-logo'] ?? '',
    groupTitle: attrs['group-title'] ?? '',
    streamId: idMatch ? Number(idMatch[1]) : null,
    duration,
  };
}
