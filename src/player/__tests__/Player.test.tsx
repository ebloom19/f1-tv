import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Player, playerKindFor } from '../Player';
import { fixtureCatalogue } from '../../testing/fixtureCatalogue';
import type { SlotLease } from '../../provider/pool';

const lease: SlotLease = { accountIndex: 0, release: () => {} };
const noop = () => {};

function renderPlayer(channel: ReturnType<typeof fixtureCatalogue>['worldFeeds'][number] | undefined, mode?: 'auto' | 'vlc' | 'avplayer') {
  return render(
    <Player
      channel={channel}
      mode={mode}
      uri="http://example.test/live/u/p/1.m3u8"
      headers={{ 'User-Agent': 'Pitwall/1.0' }}
      muted={false}
      lease={lease}
      onPlaying={noop}
      onSlotBusy={noop}
      onFatal={noop}
      testID="video-x"
    />,
  );
}

describe('Player routing', () => {
  const cat = fixtureCatalogue();
  const hevc = cat.worldFeeds.find(c => c.streamId === 6862)!; // PPV| F1-TV → flagged HEVC-in-TS
  const h264 = cat.worldFeeds.find(c => c.streamId === 34209)!; // Sky Sports F1 FHD → H.264

  it('flags the expected feeds', () => {
    expect(hevc.appleVideoUnsupported).toBe(true);
    expect(h264.appleVideoUnsupported).toBeFalsy();
  });

  it('auto: HEVC feed → VLC, H.264 feed → AVPlayer (jest Platform.OS is ios)', () => {
    expect(playerKindFor(hevc, 'auto')).toBe('vlc');
    expect(playerKindFor(h264, 'auto')).toBe('avplayer');
    renderPlayer(hevc, 'auto');
    expect(screen.getByTestId('video-x').props.accessibilityLabel).toBe('vlc-player');
  });

  it('auto: H.264 feed renders the react-native-video player', () => {
    renderPlayer(h264, 'auto');
    expect(screen.getByTestId('video-x').props.accessibilityLabel).not.toBe('vlc-player');
  });

  it('vlc mode routes everything to VLC; avplayer mode never uses VLC', () => {
    expect(playerKindFor(h264, 'vlc')).toBe('vlc');
    expect(playerKindFor(hevc, 'avplayer')).toBe('avplayer');
    renderPlayer(h264, 'vlc');
    expect(screen.getByTestId('video-x').props.accessibilityLabel).toBe('vlc-player');
  });
});
