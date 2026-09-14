import React from 'react';
import { Platform } from 'react-native';
import type { F1Channel } from '../catalogue/types';
import { getPlayerMode } from '../config/env';
import { choosePlayer } from './choosePlayer';
import type { PlayerKind, PlayerMode } from './choosePlayer';
import { StreamPlayer } from './StreamPlayer';
import type { StreamPlayerProps } from './StreamPlayer';
import { VlcStreamPlayer } from './VlcStreamPlayer';

export interface PlayerProps extends StreamPlayerProps {
  /** The catalogue channel being played; drives the AVPlayer/VLC choice in `auto` mode. */
  channel?: F1Channel;
  /** Override the configured mode (tests, or a future settings toggle). */
  mode?: PlayerMode;
}

/** Which player `Player` will use for this channel under the configured (or given) mode. */
export function playerKindFor(channel: F1Channel | undefined, mode: PlayerMode = getPlayerMode()): PlayerKind {
  return choosePlayer(mode, Platform.OS, channel?.appleVideoUnsupported);
}

/** Routes a stream to AVPlayer (react-native-video) or VLC based on codec support and player mode. */
export function Player({ channel, mode, ...rest }: PlayerProps) {
  const kind = playerKindFor(channel, mode ?? getPlayerMode());
  return kind === 'vlc' ? <VlcStreamPlayer {...rest} /> : <StreamPlayer {...rest} />;
}

export default Player;
