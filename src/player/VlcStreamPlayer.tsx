import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** Minimal prop surface we use; the package's own typings omit `export` on its classes. */
interface VlcNativeProps {
  source: { uri: string; initType?: 1 | 2; initOptions?: string[] };
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  autoplay?: boolean;
  paused?: boolean;
  muted?: boolean;
  resizeMode?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  autoAspectRatio?: boolean;
  playInBackground?: boolean;
  onPlaying?: (e: unknown) => void;
  onError?: (e: unknown) => void;
}
// Runtime shape is `module.exports = { VLCPlayer, VlCPlayerView }` (no default export).
const { VLCPlayer } = require('react-native-vlc-media-player') as { VLCPlayer: ComponentType<VlcNativeProps> };
import type { StreamPlayerProps } from './StreamPlayer';
import { colors, font, spacing, timing } from '../ui/theme';

export type ErrorClass = 'slot_busy' | 'other';

export interface VlcStreamPlayerProps extends StreamPlayerProps {
  /**
   * VLC's error event carries no HTTP status, so on failure we re-request the playlist to tell a
   * busy provider slot (401/403 → retry) from a real playback error. Injectable for tests.
   */
  classify?: (uri: string, headers: Record<string, string>) => Promise<ErrorClass>;
}

export const VLC_SLOT_BUSY_MAX_ATTEMPTS: number = timing.slotRetryMax;
export const VLC_SLOT_BUSY_RETRY_MS: number = timing.slotRetryMs;

async function classifyByPlaylist(uri: string, headers: Record<string, string>): Promise<ErrorClass> {
  try {
    const res = await fetch(uri, { method: 'GET', headers });
    return res.status === 401 || res.status === 403 ? 'slot_busy' : 'other';
  } catch {
    return 'other';
  }
}

/** libvlc options: identify like a player (the panel 503s curl's UA) and keep a live-friendly buffer. */
export function vlcInitOptions(headers: Record<string, string>): string[] {
  const ua = headers['User-Agent'] ?? headers['user-agent'];
  const opts = ['--network-caching=1500', '--http-reconnect', '--no-video-title-show'];
  if (ua) {
    opts.unshift(`--http-user-agent=${ua}`);
  }
  return opts;
}

/**
 * VLC-backed stream player with the same contract as `StreamPlayer`. Used for feeds AVPlayer
 * cannot render (HEVC in MPEG-TS on Apple) or for everything when the player mode is `vlc`.
 */
export function VlcStreamPlayer({
  uri,
  headers,
  muted,
  lease,
  onPlaying,
  onSlotBusy,
  onFatal,
  testID,
  classify = classifyByPlaylist,
}: VlcStreamPlayerProps) {
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const callbacks = useRef({ onPlaying, onSlotBusy, onFatal, classify });
  callbacks.current = { onPlaying, onSlotBusy, onFatal, classify };

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const lastUri = useRef(uri);
  if (lastUri.current !== uri) {
    lastUri.current = uri;
    attemptRef.current = 0;
    setAttempt(0);
    setRetrying(false);
    setFatal(null);
  }
  useEffect(() => clearTimer, [uri, clearTimer]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const handlePlaying = useCallback(() => {
    attemptRef.current = 0;
    setAttempt(0);
    setRetrying(false);
    setFatal(null);
    callbacks.current.onPlaying();
  }, []);

  const scheduleRetry = useCallback(() => {
    const next = attemptRef.current + 1;
    if (next > VLC_SLOT_BUSY_MAX_ATTEMPTS) {
      const msg = `No free connection after ${VLC_SLOT_BUSY_MAX_ATTEMPTS} attempts (VLC)`;
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
    }, VLC_SLOT_BUSY_RETRY_MS);
  }, [clearTimer]);

  const handleError = useCallback(() => {
    const currentUri = lastUri.current;
    callbacks.current.classify(currentUri, headers).then(kind => {
      if (!alive.current || lastUri.current !== currentUri) {
        return;
      }
      if (kind === 'slot_busy') {
        scheduleRetry();
      } else {
        const msg = 'VLC could not play this stream';
        setFatal(msg);
        setRetrying(false);
        callbacks.current.onFatal(msg);
      }
    });
  }, [headers, scheduleRetry]);

  const hasSource = uri.length > 0 && lease !== null;

  return (
    <View style={styles.root} testID={testID ? `${testID}-frame` : undefined}>
      {hasSource ? (
        <VLCPlayer
          key={`${uri}#${generation}`}
          testID={testID}
          accessibilityLabel="vlc-player"
          style={styles.video}
          source={{ uri, initType: 2, initOptions: vlcInitOptions(headers) }}
          autoplay
          paused={false}
          muted={muted}
          resizeMode="contain"
          autoAspectRatio
          playInBackground={false}
          onPlaying={handlePlaying}
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
            {`Waiting for a free connection (${attempt}/${VLC_SLOT_BUSY_MAX_ATTEMPTS})`}
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
  root: { flex: 1, backgroundColor: colors.black, overflow: 'hidden' },
  video: { ...StyleSheet.absoluteFillObject },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: colors.ink3, fontSize: font.size.sm, fontWeight: font.bodyWeight },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayTitle: { color: colors.ink, fontSize: font.size.lg, fontWeight: font.titleWeight, marginBottom: spacing.sm },
  overlayText: { color: colors.ink2, fontSize: font.size.sm, fontWeight: font.bodyWeight, textAlign: 'center' },
});

export default VlcStreamPlayer;
