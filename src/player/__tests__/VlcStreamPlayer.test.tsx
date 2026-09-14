import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { VlcStreamPlayer, VLC_SLOT_BUSY_MAX_ATTEMPTS, VLC_SLOT_BUSY_RETRY_MS, vlcInitOptions } from '../VlcStreamPlayer';
import type { SlotLease } from '../../provider/pool';

const lease: SlotLease = { accountIndex: 0, release: () => {} };
const headers = { 'User-Agent': 'Pitwall/1.0 (AppleTV; tvOS)' };

describe('vlcInitOptions', () => {
  it('passes the User-Agent to libvlc and a live-friendly cache', () => {
    const opts = vlcInitOptions(headers);
    expect(opts[0]).toBe('--http-user-agent=Pitwall/1.0 (AppleTV; tvOS)');
    expect(opts).toContain('--network-caching=1500');
  });
});

describe('VlcStreamPlayer', () => {
  afterEach(() => jest.useRealTimers());

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
});
