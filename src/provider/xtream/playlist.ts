import { originOf } from './urls.ts';

export interface ParsedHls {
  segments: string[];
  targetDuration: number;
  mediaSequence: number;
  /** True when the body carries an #EXTM3U header. */
  isPlaylist: boolean;
  /** True when this is a master/variant playlist (#EXT-X-STREAM-INF) rather than a media playlist. */
  isMaster: boolean;
}

/**
 * Minimal HLS media-playlist parser: collects segment URIs (any non-comment, non-empty line),
 * the target duration and the media sequence number.
 */
export function parseHls(body: string): ParsedHls {
  const lines = (body ?? '').split(/\r?\n/);
  const segments: string[] = [];
  let targetDuration = 0;
  let mediaSequence = 0;
  let isPlaylist = false;
  let isMaster = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('#')) {
      if (line.startsWith('#EXTM3U')) {
        isPlaylist = true;
      } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = Number(line.slice('#EXT-X-TARGETDURATION:'.length)) || 0;
      } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        mediaSequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)) || 0;
      } else if (line.startsWith('#EXT-X-STREAM-INF')) {
        isMaster = true;
      }
      continue;
    }
    segments.push(line);
  }
  return { segments, targetDuration, mediaSequence, isPlaylist, isMaster };
}

/**
 * Resolves a segment URI from a playlist against the URL the playlist was served from.
 * Implemented by hand (no `URL`) because React Native's URL polyfill cannot resolve relative references.
 *  - absolute (`http://…`)            → unchanged
 *  - protocol-relative (`//host/x`)   → scheme of edgeUrl + reference
 *  - root-relative (`/hlsr/…`)        → origin of edgeUrl + reference
 *  - relative (`seg_0.ts`)            → directory of edgeUrl + reference
 */
export function resolveSegmentUrl(edgeUrl: string, relative: string): string {
  const ref = (relative ?? '').trim();
  const base = (edgeUrl ?? '').trim();
  if (!ref) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) {
    return ref;
  }
  const origin = originOf(base);
  if (!origin) {
    return ref;
  }
  if (ref.startsWith('//')) {
    const scheme = origin.slice(0, origin.indexOf(':'));
    return `${scheme}:${ref}`;
  }
  if (ref.startsWith('/')) {
    return origin + ref;
  }
  // Directory of the base path, without query/fragment.
  const pathStart = origin.length;
  const rest = base.slice(pathStart).replace(/[?#].*$/, '');
  const dir = rest.includes('/') ? rest.slice(0, rest.lastIndexOf('/') + 1) : '/';
  return origin + (dir.startsWith('/') ? dir : '/' + dir) + ref;
}
