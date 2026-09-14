import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import {
  VlcStreamPlayer,
  VLC_SLOT_BUSY_MAX_ATTEMPTS,
  VLC_SLOT_BUSY_RETRY_MS,
  VLC_START_RETRY_MAX,
  VLC_START_TIMEOUT_MS,
  vlcBadgeText,
  vlcInitOptions,
} from '../VlcStreamPlayer';
import type { SlotLease } from '../../provider/pool';

const lease: SlotLease = { accountIndex: 0, release: () => {} };
const headers = { 'User-Agent': 'Pitwall/1.0 (AppleTV; tvOS)' };

describe('vlcInitOptions', () => {
  it('passes the User-Agent to libvlc, a deep live buffer and stream-clock trust', () => {
    const opts = vlcInitOptions(headers);
    expect(opts[0]).toBe('--http-user-agent=Pitwall/1.0 (AppleTV; tvOS)');
    expect(opts).toContain('--network-caching=3000');
    expect(opts).toContain('--clock-jitter=0');
    expect(opts).toContain('--clock-synchro=0');
  });

  it('takes the buffer depth from PITWALL_VLC_CACHING_MS', () => {
    expect(vlcInitOptions(headers, { cachingMs: 4500 })).toContain('--network-caching=4500');
  });
});

describe('VlcStreamPlayer', () => {
  afterEach(() => {
    jest.useRealTimers();
    globalThis.__videoAutoLoad = true;
  });

  it('reports playing when VLC starts', () => {
    const onPlaying = jest.fn();
    render(
      <VlcStreamPlayer uri="http://x/ok.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={onPlaying} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('v').props.accessibilityLabel).toBe('vlc-player');
  });

  it('classifies a 401 as slot busy, retries after 1.5 s, and gives up after the budget', async () => {
    jest.useFakeTimers();
    const onSlotBusy = jest.fn();
    const onFatal = jest.fn();
    const classify = jest.fn().mockResolvedValue('slot_busy' as const);
    render(
      <VlcStreamPlayer uri="http://x/simulate-401.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={onSlotBusy} onFatal={onFatal} classify={classify} testID="v" />,
    );
    // first error → classify → slot_busy → attempt 1
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onSlotBusy).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('v-waiting')).toBeTruthy();
    // exhaust the retry budget: each timer tick remounts, which errors again → next attempt
    for (let n = 2; n <= VLC_SLOT_BUSY_MAX_ATTEMPTS + 1; n += 1) {
      await act(async () => { jest.advanceTimersByTime(VLC_SLOT_BUSY_RETRY_MS); await Promise.resolve(); await Promise.resolve(); });
    }
    expect(onSlotBusy).toHaveBeenCalledTimes(VLC_SLOT_BUSY_MAX_ATTEMPTS);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatch(/No free connection/);
  });

  it('treats a non-401 error as fatal without retrying', async () => {
    const onFatal = jest.fn();
    const onSlotBusy = jest.fn();
    const classify = jest.fn().mockResolvedValue('other' as const);
    render(
      <VlcStreamPlayer uri="http://x/simulate-fatal.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={onSlotBusy} onFatal={onFatal} classify={classify} testID="v" />,
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onSlotBusy).not.toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('v-fatal')).toBeTruthy();
  });

  it('explains itself instead of a silent black frame when the native module is missing', () => {
    const onFatal = jest.fn();
    render(
      <VlcStreamPlayer uri="http://x/ok.m3u8" headers={headers} muted={false} lease={lease} nativeAvailable={false}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={onFatal} testID="v" />,
    );
    expect(screen.getByTestId('v-no-native')).toBeTruthy();
    expect(screen.queryByTestId('v')).toBeNull();
    expect(onFatal).toHaveBeenCalledWith(expect.stringMatching(/native module/));
  });

  it('shows a VLC badge so the active player is visible', () => {
    render(
      <VlcStreamPlayer uri="http://x/ok.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(screen.getByTestId('v-vlc-badge')).toBeTruthy();
  });

  it('shows the no-connection fallback when there is no lease', () => {
    render(
      <VlcStreamPlayer uri="http://x/ok.m3u8" headers={headers} muted={false} lease={null}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(screen.getByTestId('v-fallback')).toBeTruthy();
  });

  it('tells you what VLC is doing while the picture is still black', () => {
    globalThis.__videoAutoLoad = false;
    render(
      <VlcStreamPlayer uri="http://x/live/u/p/1.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(screen.getByText('VLC · opening')).toBeTruthy();
  });

  it('shows the decoded picture size once VLC is playing, and resets when the feed changes', () => {
    const utils = render(
      <VlcStreamPlayer uri="http://x/live/u/p/1.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(screen.getByText('VLC')).toBeTruthy();
    globalThis.__videoAutoLoad = false;
    utils.rerender(
      <VlcStreamPlayer uri="http://x/live/u/p/2.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={jest.fn()} testID="v" />,
    );
    expect(screen.getByText('VLC · opening')).toBeTruthy();
  });

  it('start watchdog: remounts alternating HLS and TS, then gives up naming the last state', () => {
    jest.useFakeTimers();
    globalThis.__videoAutoLoad = false;
    const onFatal = jest.fn();
    render(
      <VlcStreamPlayer uri="http://x/live/u/p/1223445.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={onFatal} testID="v" />,
    );
    expect(screen.getByTestId('v').props.source.uri).toBe('http://x/live/u/p/1223445.m3u8');
    act(() => { jest.advanceTimersByTime(VLC_START_TIMEOUT_MS); });
    expect(screen.getByTestId('v').props.source.uri).toBe('http://x/live/u/p/1223445.ts');
    expect(screen.getByText('VLC · opening · retry 1 (ts)')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(VLC_START_TIMEOUT_MS); });
    expect(screen.getByTestId('v').props.source.uri).toBe('http://x/live/u/p/1223445.m3u8');
    for (let n = 2; n <= VLC_START_RETRY_MAX; n += 1) {
      act(() => { jest.advanceTimersByTime(VLC_START_TIMEOUT_MS); });
    }
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatch(/never started \(last state: opening\)/);
    expect(screen.getByTestId('v-fatal')).toBeTruthy();
    // no further remounts once fatal
    act(() => { jest.advanceTimersByTime(VLC_START_TIMEOUT_MS * 2); });
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('the watchdog stands down once VLC is playing', () => {
    jest.useFakeTimers();
    const onFatal = jest.fn();
    render(
      <VlcStreamPlayer uri="http://x/live/u/p/1.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={onFatal} testID="v" />,
    );
    act(() => { jest.advanceTimersByTime(VLC_START_TIMEOUT_MS * (VLC_START_RETRY_MAX + 2)); });
    expect(onFatal).not.toHaveBeenCalled();
    expect(screen.getByTestId('v').props.source.uri).toBe('http://x/live/u/p/1.m3u8');
  });

  it('a stop before playing is a failure: classified against the playlist, fatal when not slot-busy', async () => {
    const onFatal = jest.fn();
    const classify = jest.fn().mockResolvedValue('other' as const);
    render(
      <VlcStreamPlayer uri="http://x/live/u/p/simulate-stopped.m3u8" headers={headers} muted={false} lease={lease}
        onPlaying={jest.fn()} onSlotBusy={jest.fn()} onFatal={onFatal} classify={classify} testID="v" />,
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(classify).toHaveBeenCalledWith('http://x/live/u/p/simulate-stopped.m3u8', headers);
    expect(onFatal).toHaveBeenCalledWith(expect.stringMatching(/could not play this stream \(stopped\)/));
    expect(screen.getByText('VLC · stopped')).toBeTruthy();
  });
});

describe('vlcBadgeText', () => {
  it('reads as state, then size, then retry', () => {
    expect(vlcBadgeText('waiting', 0, null)).toBe('VLC · loading');
    expect(vlcBadgeText('buffering', 1, null)).toBe('VLC · buffering · retry 1 (ts)');
    expect(vlcBadgeText('playing', 0, { width: 3840, height: 2160 })).toBe('VLC · 3840×2160');
    expect(vlcBadgeText('playing', 2, null)).toBe('VLC · retry 2 (m3u8)');
  });
});
