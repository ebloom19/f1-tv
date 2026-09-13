import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { StreamPlayer, SLOT_BUSY_MAX_ATTEMPTS, SLOT_BUSY_RETRY_MS, describeVideoError, isSlotBusyError } from '../StreamPlayer';

const lease = { accountIndex: 0, release: jest.fn() };
const headers = { 'User-Agent': 'Pitwall/1.0 (AppleTV; tvOS)' };

function renderPlayer(uri: string, overrides: Partial<React.ComponentProps<typeof StreamPlayer>> = {}) {
  const onPlaying = jest.fn();
  const onSlotBusy = jest.fn();
  const onFatal = jest.fn();
  const utils = render(
    <StreamPlayer
      uri={uri}
      headers={headers}
      muted={false}
      lease={lease}
      onPlaying={onPlaying}
      onSlotBusy={onSlotBusy}
      onFatal={onFatal}
      testID="video-test"
      {...overrides}
    />,
  );
  return { ...utils, onPlaying, onSlotBusy, onFatal };
}

describe('StreamPlayer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports onPlaying when the video loads and passes source/headers through', () => {
    const { onPlaying, onSlotBusy, onFatal } = renderPlayer('http://panel/live/u/p/6862.m3u8');
    const video = screen.getByTestId('video-test');
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(onSlotBusy).not.toHaveBeenCalled();
    expect(onFatal).not.toHaveBeenCalled();
    expect(video).toBeTruthy();
    expect(screen.queryByTestId('video-test-waiting')).toBeNull();
  });

  it('renders a dark fallback when uri is empty', () => {
    renderPlayer('');
    expect(screen.queryByTestId('video-test')).toBeNull();
    expect(screen.getByTestId('video-test-fallback')).toBeTruthy();
    expect(screen.getByText('No stream')).toBeTruthy();
  });

  it('renders a fallback when no lease is available', () => {
    renderPlayer('http://panel/live/u/p/6862.m3u8', { lease: null });
    expect(screen.queryByTestId('video-test')).toBeNull();
    expect(screen.getByText('No free connection')).toBeTruthy();
  });

  it('treats HTTP 401 as slot busy: waits 1.5 s, remounts, counts attempts, then gives up', () => {
    const { onPlaying, onSlotBusy, onFatal } = renderPlayer('http://panel/live/u/p/simulate-401.m3u8');

    expect(onSlotBusy).toHaveBeenCalledTimes(1);
    expect(onSlotBusy).toHaveBeenLastCalledWith(1);
    expect(screen.getByTestId('video-test-waiting')).toBeTruthy();
    expect(screen.getByText(`Waiting for a free connection (1/${SLOT_BUSY_MAX_ATTEMPTS})`)).toBeTruthy();
    expect(onPlaying).not.toHaveBeenCalled();

    // Advancing less than the retry delay does nothing.
    act(() => {
      jest.advanceTimersByTime(SLOT_BUSY_RETRY_MS - 1);
    });
    expect(onSlotBusy).toHaveBeenCalledTimes(1);

    // The remount happens at 1.5 s and the mock errors again → attempt 2.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onSlotBusy).toHaveBeenCalledTimes(2);
    expect(onSlotBusy).toHaveBeenLastCalledWith(2);
    expect(screen.getByText(`Waiting for a free connection (2/${SLOT_BUSY_MAX_ATTEMPTS})`)).toBeTruthy();

    // Exhaust the remaining attempts.
    for (let n = 3; n <= SLOT_BUSY_MAX_ATTEMPTS; n += 1) {
      act(() => {
        jest.advanceTimersByTime(SLOT_BUSY_RETRY_MS);
      });
      expect(onSlotBusy).toHaveBeenLastCalledWith(n);
    }
    expect(onFatal).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SLOT_BUSY_RETRY_MS);
    });
    expect(onSlotBusy).toHaveBeenCalledTimes(SLOT_BUSY_MAX_ATTEMPTS);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatch(new RegExp(`No free connection after ${SLOT_BUSY_MAX_ATTEMPTS} attempts`));
    expect(screen.queryByTestId('video-test-waiting')).toBeNull();
    expect(screen.getByTestId('video-test-fatal')).toBeTruthy();
  });

  it('reports non-slot errors as fatal immediately', () => {
    const { onSlotBusy, onFatal } = renderPlayer('http://panel/live/u/p/simulate-fatal.m3u8');
    expect(onSlotBusy).not.toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatch(/Source error/);
  });

  it('resets the retry budget when the uri changes', () => {
    const { rerender, onSlotBusy, onPlaying } = renderPlayer('http://panel/live/u/p/simulate-401.m3u8');
    expect(onSlotBusy).toHaveBeenCalledTimes(1);
    rerender(
      <StreamPlayer
        uri="http://panel/live/u/p/6844.m3u8"
        headers={headers}
        muted={false}
        lease={lease}
        onPlaying={onPlaying}
        onSlotBusy={onSlotBusy}
        onFatal={jest.fn()}
        testID="video-test"
      />,
    );
    expect(onPlaying).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('video-test-waiting')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(SLOT_BUSY_RETRY_MS * 2);
    });
    expect(onSlotBusy).toHaveBeenCalledTimes(1);
  });

  it('classifies error messages', () => {
    expect(isSlotBusyError('HTTP 401')).toBe(true);
    expect(isSlotBusyError('Response code: 403')).toBe(true);
    expect(isSlotBusyError('Response code: 404')).toBe(false);
    expect(describeVideoError({ error: { errorString: 'x', errorCode: '22' } })).toBe('x | 22');
    expect(describeVideoError(undefined)).toBe('Unknown playback error');
  });
});
