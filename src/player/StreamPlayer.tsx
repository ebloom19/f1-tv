import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Video, { OnLoadData, OnVideoErrorData, ResizeMode } from 'react-native-video';
import type { SlotLease } from '../provider/pool';
import { colors, font, spacing, timing } from '../ui/theme';

export interface StreamPlayerProps {
  uri: string;
  headers: Record<string, string>;
  muted: boolean;
  lease: SlotLease | null;
  onPlaying(): void;
  onSlotBusy(attempt: number): void;
  onFatal(message: string): void;
  testID?: string;
}

export const SLOT_BUSY_MAX_ATTEMPTS: number = timing.slotRetryMax;
export const SLOT_BUSY_RETRY_MS: number = timing.slotRetryMs;

const SLOT_BUSY_RE = /\b(401|403)\b/;

/** Flatten a react-native-video error into one searchable string. */
export function describeVideoError(e: OnVideoErrorData | undefined): string {
  const err = (e?.error ?? {}) as Record<string, unknown>;
  const parts = [
    err.errorString,
    err.errorCode,
    err.error,
    err.code,
    err.localizedDescription,
    err.localizedFailureReason,
    err.domain,
  ]
    .filter(v => v !== undefined && v !== null && v !== '')
    .map(v => String(v));
  return parts.length ? parts.join(' | ') : 'Unknown playback error';
}

export function isSlotBusyError(message: string): boolean {
  return SLOT_BUSY_RE.test(message);
}

/**
 * react-native-video wrapper for one Xtream live stream.
 *
 * - `onLoad` → `onPlaying()`
 * - `onError` with HTTP 401/403 → the provider slot is still busy: wait 1.5 s and remount the
 *   source (bumping a `key`), up to `timing.slotRetryMax` attempts, calling `onSlotBusy(attempt)` each time.
 * - Any other error, or exhausting the retry budget → `onFatal(message)`.
 */
export function StreamPlayer({ uri, headers, muted, lease, onPlaying, onSlotBusy, onFatal, testID }: StreamPlayerProps) {
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest callbacks without re-subscribing.
  const callbacks = useRef({ onPlaying, onSlotBusy, onFatal });
  callbacks.current = { onPlaying, onSlotBusy, onFatal };

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A new uri starts a fresh retry budget. This is reset during render (not in an effect)
  // because the child <Video> mount effect fires *before* a parent effect would, and it may
  // already report the first error/load of the new source.
  const lastUri = useRef(uri);
  if (lastUri.current !== uri) {
    lastUri.current = uri;
    attemptRef.current = 0;
    setAttempt(0);
    setRetrying(false);
    setFatal(null);
  }
  // Pending remount timers belong to the previous uri (and are dropped on unmount).
  useEffect(() => clearTimer, [uri, clearTimer]);

  const handleLoad = useCallback((_e: OnLoadData) => {
    attemptRef.current = 0;
    setAttempt(0);
    setRetrying(false);
    setFatal(null);
    callbacks.current.onPlaying();
  }, []);

  const handleError = useCallback(
    (e: OnVideoErrorData) => {
      const message = describeVideoError(e);
      if (!isSlotBusyError(message)) {
        setFatal(message);
        setRetrying(false);
        callbacks.current.onFatal(message);
        return;
      }
      const next = attemptRef.current + 1;
      if (next > SLOT_BUSY_MAX_ATTEMPTS) {
        const msg = `No free connection after ${SLOT_BUSY_MAX_ATTEMPTS} attempts (${message})`;
        setFatal(msg);
        setRetrying(false);
        callbacks.current.onFatal(msg);
        return;
      }
      attemptRef.current = next;
      setAttempt(next);
      setRetrying(true);
      callbacks.current.onSlotBusy(next);
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        setGeneration(g => g + 1);
      }, SLOT_BUSY_RETRY_MS);
    },
    [clearTimer],
  );

  const hasSource = uri.length > 0 && lease !== null;

  return (
    <View style={styles.root} testID={testID ? `${testID}-frame` : undefined}>
      {hasSource ? (
        <Video
          key={`${uri}#${generation}`}
          testID={testID}
          source={{ uri, headers, type: 'm3u8' }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          muted={muted}
          paused={false}
          controls={false}
          playInBackground={false}
          ignoreSilentSwitch="ignore"
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <View style={styles.fallback} testID={testID ? `${testID}-fallback` : undefined}>
          <Text style={styles.fallbackText}>{lease === null && uri ? 'No free connection' : 'No stream'}</Text>
        </View>
      )}
      {retrying ? (
        <View style={styles.overlay} pointerEvents="none" testID={testID ? `${testID}-waiting` : undefined}>
          <Text style={styles.overlayTitle}>Switching…</Text>
          <Text style={styles.overlayText}>
            {`Waiting for a free connection (${attempt}/${SLOT_BUSY_MAX_ATTEMPTS})`}
          </Text>
        </View>
      ) : null}
      {fatal ? (
        <View style={styles.overlay} pointerEvents="none" testID={testID ? `${testID}-fatal` : undefined}>
          <Text style={styles.overlayTitle}>Playback failed</Text>
          <Text style={styles.overlayText} numberOfLines={2}>
            {fatal}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.ink3,
    fontSize: font.size.sm,
    fontWeight: font.bodyWeight,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayTitle: {
    color: colors.ink,
    fontSize: font.size.lg,
    fontWeight: font.titleWeight,
    marginBottom: spacing.sm,
  },
  overlayText: {
    color: colors.ink2,
    fontSize: font.size.sm,
    fontWeight: font.bodyWeight,
    textAlign: 'center',
  },
});

export default StreamPlayer;
