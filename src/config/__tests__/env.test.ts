import { DEFAULT_VLC_CACHING_MS, parseVlcCachingMs } from '../env';

describe('parseVlcCachingMs', () => {
  it('reads the generated string, clamps to a live-safe range, and falls back on junk', () => {
    expect(parseVlcCachingMs('3000')).toBe(3000);
    expect(parseVlcCachingMs(4500)).toBe(4500);
    expect(parseVlcCachingMs('50')).toBe(300);
    expect(parseVlcCachingMs('99999')).toBe(15000);
    expect(parseVlcCachingMs('abc')).toBe(DEFAULT_VLC_CACHING_MS);
    expect(parseVlcCachingMs(undefined)).toBe(DEFAULT_VLC_CACHING_MS);
  });
});
