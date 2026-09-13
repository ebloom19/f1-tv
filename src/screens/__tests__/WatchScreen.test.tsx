import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, TVEventControl } from 'react-native';
import Video from 'react-native-video';
import { ConnectionPool } from '../../provider/pool';
import { TOAST_NO_ROOM } from '../../multiview/reducer';
import { WatchScreen } from '../WatchScreen';
import { fixtureCatalogue } from '../../testing/fixtureCatalogue';
import { fakeAccount } from '../../testing/fakeAccount';

const catalogue = fixtureCatalogue();
const WORLD = 'world:6862';

type VideoProps = { testID?: string; muted?: boolean; source?: { uri?: string; headers?: Record<string, string> } };

function videos(): VideoProps[] {
  return screen.UNSAFE_getAllByType(Video as unknown as React.ComponentType<VideoProps>).map(i => i.props);
}

function unmutedIds(): string[] {
  return videos()
    .filter(v => v.muted === false)
    .map(v => v.testID ?? '');
}

function renderWatch(budget: number, initialMain = WORLD, initialDocked?: string[]) {
  const pool = new ConnectionPool([fakeAccount(budget)]);
  const onExit = jest.fn();
  const utils = render(
    <WatchScreen pool={pool} catalogue={catalogue} initialMain={initialMain} initialDocked={initialDocked} onExit={onExit} />,
  );
  return { ...utils, pool, onExit };
}

const tv = (eventType: string) =>
  act(() => {
    globalThis.emitTVEvent({ eventType });
  });

describe('WatchScreen', () => {
  afterEach(() => {
    globalThis.__videoAutoLoad = true;
    jest.useRealTimers();
  });

  describe('budget 3 (trio)', () => {
    it('docks two onboards, swaps main, cycles audio, hides the rail and exits releasing leases', () => {
      const { pool, onExit } = renderWatch(3);

      // Rail is open on entry with the world feed as main; one lease in use.
      expect(screen.getByTestId('rail')).toBeTruthy();
      expect(screen.getByTestId(`video-${WORLD}`)).toBeTruthy();
      expect(pool.inUse).toBe(1);
      expect(screen.getByTestId('empty-slot-0')).toBeTruthy();
      expect(screen.getAllByText('Add a driver')).toHaveLength(2);

      fireEvent.press(screen.getByTestId('chip-driver:NOR'));
      fireEvent.press(screen.getByTestId('chip-driver:VER'));

      expect(screen.getByTestId('tile-driver:NOR')).toBeTruthy();
      expect(screen.getByTestId('tile-driver:VER')).toBeTruthy();
      expect(screen.getByTestId('video-driver:NOR')).toBeTruthy();
      expect(screen.getByTestId('video-driver:VER')).toBeTruthy();
      expect(screen.getByTestId(`video-${WORLD}`)).toBeTruthy();
      expect(pool.inUse).toBe(3);

      // Stream URLs come from the pool's client, with the explicit User-Agent header.
      const ver = videos().find(v => v.testID === 'video-driver:VER');
      expect(ver?.source?.uri).toBe('http://panel.test/live/USER/PASS/6844.m3u8');
      expect(ver?.source?.headers?.['User-Agent']).toMatch(/^Pitwall\//);

      // Exactly one unmuted player: the main (audio defaults to main).
      expect(videos()).toHaveLength(3);
      expect(unmutedIds()).toEqual([`video-${WORLD}`]);
      expect(screen.getByTestId('main-audio')).toBeTruthy();

      // Tile Select → VER becomes main, the world feed moves into VER's old tile.
      fireEvent.press(screen.getByTestId('tile-driver:VER'));
      expect(screen.getByTestId('video-driver:VER')).toBeTruthy();
      expect(screen.getByTestId(`tile-${WORLD}`)).toBeTruthy();
      expect(screen.getByTestId('tile-driver:NOR')).toBeTruthy();
      expect(screen.queryByTestId('tile-driver:VER')).toBeNull();
      const main = videos().find(v => v.testID === 'video-driver:VER');
      expect(main?.source?.uri).toBe('http://panel.test/live/USER/PASS/6844.m3u8');
      expect(pool.inUse).toBe(3);
      // Audio followed the world feed into its tile.
      expect(unmutedIds()).toEqual([`video-${WORLD}`]);
      expect(screen.getByTestId(`tile-${WORLD}-audio`)).toBeTruthy();
      expect(screen.queryByTestId('main-audio')).toBeNull();

      // Play/Pause cycles audio: [main VER, NOR, world] → after world comes VER (main).
      tv('playPause');
      expect(unmutedIds()).toEqual(['video-driver:VER']);
      expect(screen.getByTestId('main-audio')).toBeTruthy();
      expect(screen.queryByTestId(`tile-${WORLD}-audio`)).toBeNull();
      tv('playPause');
      expect(unmutedIds()).toEqual(['video-driver:NOR']);
      expect(screen.getByTestId('tile-driver:NOR-audio')).toBeTruthy();

      // Menu with the rail open hides the rail.
      expect(screen.getByTestId('rail')).toBeTruthy();
      tv('menu');
      expect(screen.queryByTestId('rail')).toBeNull();
      expect(onExit).not.toHaveBeenCalled();

      // Menu again leaves the screen and releases every lease.
      tv('menu');
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(pool.inUse).toBe(0);
    });

    it('enables the tvOS menu key while mounted and disables it on unmount', () => {
      const enable = TVEventControl.enableTVMenuKey as jest.Mock;
      const disable = TVEventControl.disableTVMenuKey as jest.Mock;
      enable.mockClear();
      disable.mockClear();
      const { unmount, pool } = renderWatch(3);
      expect(enable).toHaveBeenCalledTimes(1);
      expect(disable).not.toHaveBeenCalled();
      unmount();
      expect(disable).toHaveBeenCalledTimes(1);
      expect(pool.inUse).toBe(0);
    });

    it('d-pad events reopen the rail, which auto-hides after 6 s while a video is playing', () => {
      jest.useFakeTimers();
      renderWatch(3);
      expect(screen.getByTestId('rail')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(6000);
      });
      expect(screen.queryByTestId('rail')).toBeNull();

      tv('down');
      expect(screen.getByTestId('rail')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      // Another d-pad press restarts the timer.
      tv('left');
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('rail')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.queryByTestId('rail')).toBeNull();
    });

    it('ignores Android key-up events and handles the hardware back button', () => {
      const handlers: Array<() => boolean | null | undefined> = [];
      const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
        handlers.push(handler);
        return {
          remove: () => {
            const i = handlers.indexOf(handler);
            if (i >= 0) {
              handlers.splice(i, 1);
            }
          },
        };
      });
      try {
        const { onExit, unmount } = renderWatch(3);
        expect(handlers).toHaveLength(1);
        act(() => {
          globalThis.emitTVEvent({ eventType: 'menu', eventKeyAction: 1 });
        });
        expect(screen.getByTestId('rail')).toBeTruthy();

        const pressBack = () =>
          act(() => {
            handlers.forEach(h => expect(h()).toBe(true));
          });
        pressBack();
        expect(screen.queryByTestId('rail')).toBeNull();
        pressBack();
        expect(onExit).toHaveBeenCalledTimes(1);
        unmount();
        expect(handlers).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    });

    it('tile long-press opens a menu with Audio here / Make main / Remove', () => {
      const { pool } = renderWatch(3, WORLD, ['driver:NOR', 'driver:VER']);
      expect(pool.inUse).toBe(3);

      fireEvent(screen.getByTestId('tile-driver:VER'), 'longPress');
      expect(screen.getByTestId('tile-menu')).toBeTruthy();
      fireEvent.press(screen.getByTestId('tile-menu-audio'));
      expect(screen.queryByTestId('tile-menu')).toBeNull();
      expect(unmutedIds()).toEqual(['video-driver:VER']);

      // Menu key closes the overlay before touching the rail.
      fireEvent(screen.getByTestId('tile-driver:NOR'), 'longPress');
      tv('menu');
      expect(screen.queryByTestId('tile-menu')).toBeNull();
      expect(screen.getByTestId('rail')).toBeTruthy();

      fireEvent(screen.getByTestId('tile-driver:NOR'), 'longPress');
      fireEvent.press(screen.getByTestId('tile-menu-main'));
      expect(screen.getByTestId('video-driver:NOR')).toBeTruthy();
      expect(screen.getByTestId(`tile-${WORLD}`)).toBeTruthy();

      fireEvent(screen.getByTestId('tile-driver:VER'), 'longPress');
      fireEvent.press(screen.getByTestId('tile-menu-remove'));
      expect(screen.queryByTestId('tile-driver:VER')).toBeNull();
      expect(screen.queryByTestId('video-driver:VER')).toBeNull();
      expect(pool.inUse).toBe(2);
      // Audio fell back to main when its source was removed.
      expect(unmutedIds()).toEqual(['video-driver:NOR']);
      expect(screen.getByTestId('empty-slot-1')).toBeTruthy();
      expect(screen.getByText('Add a driver')).toBeTruthy();
    });
  });

  describe('budget 1 (solo)', () => {
    it('switches the main feed in place and shows the Switching overlay until the stream loads', () => {
      globalThis.__videoAutoLoad = false;
      const { pool } = renderWatch(1);

      expect(screen.getByText('1 connection · Select switches the feed')).toBeTruthy();
      expect(videos()).toHaveLength(1);
      expect(videos()[0].source?.uri).toBe('http://panel.test/live/USER/PASS/6862.m3u8');
      expect(pool.inUse).toBe(1);
      expect(screen.queryByTestId('switch-overlay')).toBeNull();

      // Locked slots explain the connection budget.
      expect(screen.getByTestId('empty-slot-0')).toBeTruthy();
      expect(screen.getByText('Needs connection 2 · your line allows 1')).toBeTruthy();
      expect(screen.getByText('Needs connection 3 · your line allows 1')).toBeTruthy();

      fireEvent.press(screen.getByTestId('chip-driver:VER'));

      // No tiles, single player, new uri, overlay visible while waiting for onLoad.
      expect(screen.queryByTestId('tile-driver:VER')).toBeNull();
      expect(videos()).toHaveLength(1);
      expect(videos()[0].testID).toBe('video-driver:VER');
      expect(videos()[0].source?.uri).toBe('http://panel.test/live/USER/PASS/6844.m3u8');
      expect(videos()[0].muted).toBe(false);
      expect(screen.getByTestId('switch-overlay')).toBeTruthy();
      expect(screen.getByText('Switching to VER…')).toBeTruthy();
      expect(pool.inUse).toBe(1);

      // The player reports playback → SWITCH_DONE.
      const inst = screen.UNSAFE_getAllByType(Video as unknown as React.ComponentType<{ onLoad?: (e: unknown) => void }>)[0];
      act(() => {
        inst.props.onLoad?.({ duration: 0 });
      });
      expect(screen.queryByTestId('switch-overlay')).toBeNull();
    });

    it('starts on a driver feed when the hub asked for one', () => {
      renderWatch(1, 'driver:NOR');
      expect(videos()).toHaveLength(1);
      expect(videos()[0].testID).toBe('video-driver:NOR');
      expect(screen.queryByTestId('switch-overlay')).toBeNull();
    });
  });

  describe('budget 2 (duo)', () => {
    it('shows a toast when the single tile is taken and lets long-press replace it', () => {
      const { pool } = renderWatch(2);
      fireEvent.press(screen.getByTestId('chip-driver:NOR'));
      expect(screen.getByTestId('tile-driver:NOR')).toBeTruthy();
      expect(pool.inUse).toBe(2);
      expect(screen.getByText('Needs connection 3 · your line allows 2')).toBeTruthy();

      fireEvent.press(screen.getByTestId('chip-driver:VER'));
      expect(screen.queryByTestId('tile-driver:VER')).toBeNull();
      expect(screen.getByTestId('toast')).toBeTruthy();
      expect(screen.getByText(TOAST_NO_ROOM)).toBeTruthy();
      expect(screen.getByText('Long-press to replace')).toBeTruthy();

      fireEvent(screen.getByTestId('chip-driver:VER'), 'longPress');
      expect(screen.getByTestId('tile-driver:VER')).toBeTruthy();
      expect(screen.queryByTestId('tile-driver:NOR')).toBeNull();
      expect(pool.inUse).toBe(2);
      expect(videos().map(v => v.testID).sort()).toEqual(['video-driver:VER', `video-${WORLD}`].sort());
    });

    it('selecting the main feed again only toasts', () => {
      renderWatch(2);
      fireEvent.press(screen.getByTestId(`chip-${WORLD}`));
      expect(screen.getByText('Already on the main screen')).toBeTruthy();
      expect(videos()).toHaveLength(1);
    });
  });
});
