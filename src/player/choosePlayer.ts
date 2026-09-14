/**
 * Which native player handles a given feed.
 *
 * - AVPlayer (react-native-video on tvOS) is the native pipeline: lowest latency, adaptive HLS,
 *   system audio routing. But Apple's HLS refuses HEVC carried in MPEG-TS, which this provider
 *   uses for its F1-TV / UHD feeds — AVPlayer plays the audio over a black frame.
 * - VLC (react-native-vlc-media-player / TVVLCKit) demuxes the TS itself and hands HEVC to
 *   VideoToolbox, so those feeds render. It's heavier and a hair slower to start.
 * - Android's ExoPlayer plays HEVC-in-TS natively, so VLC is never needed there.
 *
 * `auto` gives each feed the best player that can actually show it. `vlc` forces VLC for
 * everything (one consistent path, immune to the HEVC name heuristic). `avplayer` disables VLC.
 */
export type PlayerMode = 'auto' | 'avplayer' | 'vlc';
export type PlayerKind = 'avplayer' | 'vlc';

export const DEFAULT_PLAYER_MODE: PlayerMode = 'auto';

export function parsePlayerMode(value: unknown): PlayerMode {
  return value === 'vlc' || value === 'avplayer' || value === 'auto' ? value : DEFAULT_PLAYER_MODE;
}

export function choosePlayer(
  mode: PlayerMode,
  platformOS: string,
  appleVideoUnsupported: boolean | undefined,
): PlayerKind {
  if (mode === 'vlc') {
    return 'vlc';
  }
  if (mode === 'avplayer') {
    return 'avplayer';
  }
  return platformOS === 'ios' && appleVideoUnsupported ? 'vlc' : 'avplayer';
}
