import { parseHls, resolveSegmentUrl } from '../playlist.ts';

declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs') as { readFileSync(p: string, enc: string): string };
const path = require('path') as { join(...p: string[]): string };
const FIXTURE = fs.readFileSync(path.join(__dirname, '../../../../__tests__/fixtures/playlist-6844.m3u8'), 'utf8');

describe('parseHls', () => {
  test('parses the real 6844 playlist', () => {
    const p = parseHls(FIXTURE);
    expect(p.isPlaylist).toBe(true);
    expect(p.isMaster).toBe(false);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatch(/^\/hlsr\/.+\/USER\/PASS\/6844\/[0-9a-f]{32}\/6844_0\.ts$/);
    expect(p.targetDuration).toBe(11);
    expect(p.mediaSequence).toBe(0);
  });
  test('handles empty / non-playlist bodies', () => {
    expect(parseHls('')).toEqual({ segments: [], targetDuration: 0, mediaSequence: 0, isPlaylist: false, isMaster: false });
    expect(parseHls('<html></html>').isPlaylist).toBe(false);
  });
  test('detects master playlists and CRLF', () => {
    const p = parseHls('#EXTM3U\r\n#EXT-X-STREAM-INF:BANDWIDTH=1\r\nvariant.m3u8\r\n');
    expect(p.isMaster).toBe(true);
    expect(p.segments).toEqual(['variant.m3u8']);
  });
});

describe('resolveSegmentUrl', () => {
  const edge = 'http://10005055.t04m.cc/live/USER/PASS/6844.m3u8?token=abc';
  test('root-relative', () => {
    expect(resolveSegmentUrl(edge, '/hlsr/t/USER/PASS/6844/h/6844_0.ts')).toBe(
      'http://10005055.t04m.cc/hlsr/t/USER/PASS/6844/h/6844_0.ts',
    );
  });
  test('relative to directory', () => {
    expect(resolveSegmentUrl(edge, 'seg_1.ts')).toBe('http://10005055.t04m.cc/live/USER/PASS/seg_1.ts');
    expect(resolveSegmentUrl('http://host', 'seg_1.ts')).toBe('http://host/seg_1.ts');
  });
  test('absolute and protocol-relative', () => {
    expect(resolveSegmentUrl(edge, 'https://cdn/x.ts')).toBe('https://cdn/x.ts');
    expect(resolveSegmentUrl(edge, '//cdn/x.ts')).toBe('http://cdn/x.ts');
  });
  test('empty reference', () => {
    expect(resolveSegmentUrl(edge, '')).toBe('');
  });
});
