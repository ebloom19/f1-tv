import { classifyPlaylistResponse } from '../client.ts';

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...p: string[]): string };
const PLAYLIST = fs.readFileSync(path.join(__dirname, '../../../../__tests__/fixtures/playlist-6844.m3u8'), 'utf8');
const EDGE = 'http://10005055.t04m.cc/live/USER/PASS/6844.m3u8?token=x';

describe('classifyPlaylistResponse', () => {
  test('401 (panel) → slot_busy', () => {
    expect(classifyPlaylistResponse(401, 'text/html', '', 'http://panel/live/U/P/6844.m3u8')).toEqual({
      status: 'slot_busy',
      httpStatus: 401,
    });
  });
  test('403 (edge) → slot_busy', () => {
    expect(classifyPlaylistResponse(403, '', '', EDGE)).toEqual({ status: 'slot_busy', httpStatus: 403 });
  });
  test('200 text/html empty body → offline', () => {
    expect(classifyPlaylistResponse(200, 'text/html', '', EDGE)).toEqual({ status: 'offline', httpStatus: 200 });
  });
  test('200 mpegurl content-type but no #EXTM3U → offline', () => {
    expect(classifyPlaylistResponse(200, 'application/x-mpegurl', 'nope', EDGE).status).toBe('offline');
  });
  test('200 + real playlist → ok with 2 segments and resolved first segment', () => {
    const p = classifyPlaylistResponse(200, 'application/x-mpegurl', PLAYLIST, EDGE);
    expect(p.status).toBe('ok');
    if (p.status !== 'ok') {
      throw new Error('unreachable');
    }
    expect(p.segments).toBe(2);
    expect(p.targetDuration).toBe(11);
    expect(p.edgeUrl).toBe('http://10005055.t04m.cc');
    expect(p.firstSegmentUrl.startsWith('http://10005055.t04m.cc/hlsr/')).toBe(true);
    expect(p.firstSegmentUrl.endsWith('/6844_0.ts')).toBe(true);
  });
  test('vnd.apple.mpegurl is accepted too', () => {
    expect(classifyPlaylistResponse(200, 'application/vnd.apple.mpegurl; charset=utf-8', PLAYLIST, EDGE).status).toBe('ok');
  });
  test('503 → error mentioning the User-Agent', () => {
    const p = classifyPlaylistResponse(503, '', '', EDGE);
    expect(p.status).toBe('error');
    if (p.status === 'error') {
      expect(p.httpStatus).toBe(503);
      expect(p.message).toMatch(/User-Agent/);
    }
  });
  test('other statuses → error', () => {
    expect(classifyPlaylistResponse(404, '', '', EDGE)).toEqual({ status: 'error', httpStatus: 404, message: 'HTTP 404' });
  });
});
