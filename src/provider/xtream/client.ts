import type {
  PlaylistProbe,
  StreamFormat,
  XtreamAccount,
  XtreamAuthResponse,
  XtreamCredentials,
  XtreamLiveCategory,
  XtreamLiveStream,
} from './types.ts';
import { XtreamError, isXtreamError } from './errors.ts';
import { buildPlayerApiUrl, buildStreamUrl, normalizeBaseUrl, originOf } from './urls.ts';
import { parseHls, resolveSegmentUrl } from './playlist.ts';

export const DEFAULT_USER_AGENT = 'Pitwall/1.0 (AppleTV; tvOS)';
export const DEFAULT_TIMEOUT_MS = 15000;

export interface XtreamClientOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

type FetchLike = typeof fetch;

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

/**
 * Classifies the response of a `/live/U/P/{id}.m3u8` request (after redirects), per the facts in SPEC.md:
 *  - 401 (panel) / 403 (edge)                                   → slot_busy (max_connections exhausted)
 *  - 200 whose content-type lacks "mpegurl" or body lacks #EXTM3U → offline (panel answers 200 + empty text/html)
 *  - 200 + real playlist                                          → ok (segment count, target duration, edge origin, first segment URL)
 *  - anything else                                                → error
 */
export function classifyPlaylistResponse(
  httpStatus: number,
  contentType: string,
  body: string,
  finalUrl: string,
): PlaylistProbe {
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: 'slot_busy', httpStatus };
  }
  if (httpStatus === 200) {
    const ct = (contentType ?? '').toLowerCase();
    const text = body ?? '';
    if (!ct.includes('mpegurl') || !text.includes('#EXTM3U')) {
      return { status: 'offline', httpStatus };
    }
    const parsed = parseHls(text);
    const edgeUrl = originOf(finalUrl);
    const first = parsed.segments.length > 0 ? parsed.segments[0] : '';
    return {
      status: 'ok',
      segments: parsed.segments.length,
      targetDuration: parsed.targetDuration,
      edgeUrl,
      firstSegmentUrl: first ? resolveSegmentUrl(finalUrl, first) : '',
    };
  }
  if (httpStatus === 503) {
    return { status: 'error', httpStatus, message: 'HTTP 503 — the panel refused the request (User-Agent blocked?)' };
  }
  return { status: 'error', httpStatus, message: `HTTP ${httpStatus}` };
}

export interface SlotRetryOptions {
  attempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying only when it throws an XtreamError with code SLOT_BUSY.
 * Defaults: 8 attempts, 1.5 s apart (≈12 s total — a slot frees ≈5 s after the last segment request).
 * `onRetry(n)` is called before the n-th retry (1-based).
 */
export async function withSlotRetry<T>(fn: () => Promise<T>, opts: SlotRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 8);
  const delayMs = Math.max(0, opts.delayMs ?? 1500);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isXtreamError(err, 'SLOT_BUSY') || attempt === attempts) {
        throw err;
      }
      lastError = err;
      opts.onRetry?.(attempt);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export class XtreamClient {
  readonly credentials: XtreamCredentials;
  readonly userAgent: string;
  readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike | undefined;

  constructor(creds: XtreamCredentials, opts: XtreamClientOptions = {}) {
    this.credentials = { ...creds, baseUrl: normalizeBaseUrl(creds.baseUrl) };
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetch;
  }

  get baseUrl(): string {
    return this.credentials.baseUrl;
  }

  /** Headers to send on every request, API and video alike. The panel 503s on curl's default UA. */
  streamHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent };
  }

  streamUrl(streamId: number, format: StreamFormat = 'm3u8'): string {
    return buildStreamUrl(this.credentials, streamId, format);
  }

  private doFetch(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
    const f: FetchLike = this.fetchImpl ?? fetch;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    const init: RequestInit = {
      method: 'GET',
      headers: { ...this.streamHeaders(), ...(extraHeaders ?? {}) },
    };
    if (controller) {
      init.signal = controller.signal;
    }
    return Promise.resolve()
      .then(() => f(url, init))
      .finally(() => {
        if (timer !== null) {
          clearTimeout(timer);
        }
      });
  }

  private async apiRequest(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.doFetch(url);
    } catch (err) {
      throw new XtreamError('NETWORK', `Network error: ${errorMessage(err)}`);
    }
    if (res.status === 503) {
      throw new XtreamError('BLOCKED', 'The panel refused the request (HTTP 503) — check the User-Agent', 503);
    }
    if (res.status === 401 || res.status === 403) {
      throw new XtreamError('AUTH_FAILED', `The panel rejected the credentials (HTTP ${res.status})`, res.status);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new XtreamError('HTTP', `HTTP ${res.status} from ${url.split('?')[0]}`, res.status);
    }
    return res;
  }

  private async apiJson<T>(action?: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = buildPlayerApiUrl(this.credentials, action, params);
    const res = await this.apiRequest(url);
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw new XtreamError('NETWORK', `Could not read response: ${errorMessage(err)}`, res.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new XtreamError('PARSE', `Panel returned non-JSON for ${action ?? 'auth'}`, res.status);
    }
  }

  /** Throws XtreamError('AUTH_FAILED') when `user_info.auth !== 1`. */
  async authenticate(): Promise<XtreamAccount> {
    const data = await this.apiJson<Partial<XtreamAuthResponse> | null>();
    if (!data || typeof data !== 'object' || !data.user_info || typeof data.user_info !== 'object') {
      throw new XtreamError('PARSE', 'Panel response has no user_info');
    }
    const userInfo = data.user_info;
    if (toInt(userInfo.auth, 0) !== 1) {
      const why = userInfo.message ? `: ${userInfo.message}` : '';
      throw new XtreamError('AUTH_FAILED', `Authentication failed${why}`);
    }
    const serverInfo = data.server_info ?? {
      url: '',
      port: '',
      https_port: '',
      server_protocol: '',
      timezone: '',
      timestamp_now: 0,
      time_now: '',
    };
    const maxConnections = Math.max(1, toInt(userInfo.max_connections, 1));
    const exp = toInt(userInfo.exp_date, 0);
    const expiresAt = exp > 0 ? new Date(exp * 1000) : null;
    return { credentials: this.credentials, userInfo, serverInfo, maxConnections, expiresAt };
  }

  async getLiveCategories(): Promise<XtreamLiveCategory[]> {
    const data = await this.apiJson<unknown>('get_live_categories');
    if (!Array.isArray(data)) {
      throw new XtreamError('PARSE', 'get_live_categories did not return an array');
    }
    return data as XtreamLiveCategory[];
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamLiveStream[]> {
    const data = await this.apiJson<unknown>('get_live_streams', categoryId ? { category_id: categoryId } : undefined);
    if (!Array.isArray(data)) {
      throw new XtreamError('PARSE', 'get_live_streams did not return an array');
    }
    return data as XtreamLiveStream[];
  }

  /**
   * GETs the stream's m3u8 (following the 302 to the tokenised edge) and classifies the answer.
   * Never throws: network failures become `{ status: 'error' }`.
   * Note: the request itself occupies the account's slot for ≈5 s.
   */
  async probePlaylist(streamId: number): Promise<PlaylistProbe> {
    const url = this.streamUrl(streamId, 'm3u8');
    let res: Response;
    try {
      res = await this.doFetch(url);
    } catch (err) {
      return { status: 'error', message: `Network error: ${errorMessage(err)}` };
    }
    const contentType = res.headers?.get('content-type') ?? '';
    let body = '';
    if (res.status === 200) {
      try {
        body = await res.text();
      } catch (err) {
        return { status: 'error', httpStatus: res.status, message: `Could not read playlist: ${errorMessage(err)}` };
      }
    } else {
      // Drain/cancel the body so the connection is released promptly.
      try {
        await res.text();
      } catch {
        // ignore
      }
    }
    const finalUrl = res.url || url;
    return classifyPlaylistResponse(res.status, contentType, body, finalUrl);
  }

  /**
   * Like probePlaylist but throws an XtreamError instead of returning a non-ok probe,
   * so it composes with `withSlotRetry`.
   */
  async requirePlaylist(streamId: number): Promise<Extract<PlaylistProbe, { status: 'ok' }>> {
    const probe = await this.probePlaylist(streamId);
    switch (probe.status) {
      case 'ok':
        return probe;
      case 'slot_busy':
        throw new XtreamError('SLOT_BUSY', `Stream ${streamId}: all connections in use (HTTP ${probe.httpStatus})`, probe.httpStatus);
      case 'offline':
        throw new XtreamError('OFFLINE', `Stream ${streamId} is offline (HTTP ${probe.httpStatus})`, probe.httpStatus);
      default:
        throw new XtreamError(probe.httpStatus ? 'HTTP' : 'NETWORK', probe.message, probe.httpStatus);
    }
  }
}
