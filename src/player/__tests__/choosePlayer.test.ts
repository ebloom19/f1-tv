import { choosePlayer, parsePlayerMode } from '../choosePlayer';

describe('parsePlayerMode', () => {
  it('accepts the three modes and defaults everything else to auto', () => {
    expect(parsePlayerMode('vlc')).toBe('vlc');
    expect(parsePlayerMode('avplayer')).toBe('avplayer');
    expect(parsePlayerMode('auto')).toBe('auto');
    expect(parsePlayerMode(undefined)).toBe('auto');
    expect(parsePlayerMode('nonsense')).toBe('auto');
  });
});

describe('choosePlayer', () => {
  it('auto: VLC only for HEVC-in-TS feeds on Apple; AVPlayer/ExoPlayer otherwise', () => {
    expect(choosePlayer('auto', 'ios', true)).toBe('vlc');
    expect(choosePlayer('auto', 'ios', false)).toBe('avplayer');
    expect(choosePlayer('auto', 'ios', undefined)).toBe('avplayer');
    // Android's ExoPlayer plays HEVC-in-TS natively, so VLC is never chosen there.
    expect(choosePlayer('auto', 'android', true)).toBe('avplayer');
  });
  it('vlc forces VLC for everything; avplayer disables VLC even for HEVC', () => {
    expect(choosePlayer('vlc', 'ios', false)).toBe('vlc');
    expect(choosePlayer('vlc', 'android', false)).toBe('vlc');
    expect(choosePlayer('avplayer', 'ios', true)).toBe('avplayer');
  });
});
