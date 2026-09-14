import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TVEventControl,
  TVFocusGuideView,
  View,
  useTVEventHandler,
  useWindowDimensions,
} from 'react-native';
import type { HWEvent } from 'react-native';
import type { F1Catalogue } from '../catalogue/types';
import { computeLayout } from '../multiview/layouts';
import type { Layout } from '../multiview/layouts';
import type { Rect } from '../multiview/regions';
import { createInitialState, maxDocked, reduce } from '../multiview/reducer';
import type { MultiviewState, SourceId } from '../multiview/types';
import type { ConnectionPool, SlotLease } from '../provider/pool';
import { StreamPlayer } from '../player/StreamPlayer';
import { useLeases } from '../player/useLeases';
import { DriverChip } from '../ui/DriverChip';
import type { ChipState } from '../ui/DriverChip';
import { EmptySlot } from '../ui/EmptySlot';
import { FocusButton } from '../ui/FocusButton';
import { OnboardTile } from '../ui/OnboardTile';
import { Rail } from '../ui/Rail';
import { Toast } from '../ui/Toast';
import { colors, font, radius, spacing, timing } from '../ui/theme';
import { railSources, resolveSource } from './sources';
import type { ResolvedSource } from './sources';

export interface WatchSelection {
  main: SourceId;
  docked?: SourceId[];
}

export interface WatchScreenProps {
  pool: ConnectionPool;
  catalogue: F1Catalogue;
  initialMain: SourceId;
  initialDocked?: SourceId[];
  onExit: () => void;
  /** Safe-area inset in px applied to the whole canvas (default 0: video edge to edge). */
  safeInset?: number;
}

interface InitArgs {
  initialMain: SourceId;
  initialDocked: SourceId[] | undefined;
  budget: number;
}

export function initWatchState({ initialMain, initialDocked, budget }: InitArgs): MultiviewState {
  let s = createInitialState(initialMain, budget);
  for (const id of initialDocked ?? []) {
    s = reduce(s, { type: 'SELECT_SOURCE', id });
  }
  s = reduce(s, { type: 'OPEN_RAIL' });
  // The initial sources are mounted directly; nothing is "switching" yet.
  return { ...s, pendingSwitch: null, toast: null };
}

export function railHint(budget: number): string {
  if (budget <= 1) {
    return '1 connection · Select switches the feed';
  }
  return `${budget} connections · Select adds a driver · Long-press replaces · Play/Pause cycles audio`;
}

const D_PAD_EVENTS = new Set([
  'up',
  'down',
  'left',
  'right',
  'longUp',
  'longDown',
  'longLeft',
  'longRight',
  'swipeUp',
  'swipeDown',
  'swipeLeft',
  'swipeRight',
  'pan',
]);

/** Slots drawn in the letterbox gutter next to the main picture in solo mode (rail open). */
interface GutterSlot {
  rect: Rect;
  locked: boolean;
}

function gutterSlots(layout: Layout, budget: number): GutterSlot[] {
  if (layout.mode !== 'solo' || !layout.rail) {
    return [];
  }
  const capacity = maxDocked(budget);
  const { canvas, scale } = layout;
  const W = 208;
  const H = 117;
  const PAD = 16;
  return [0, 1].map(i => ({
    rect: {
      x: canvas.x + (1680 + PAD) * scale,
      y: canvas.y + (PAD + i * (H + PAD)) * scale,
      w: W * scale,
      h: H * scale,
    },
    locked: i >= capacity,
  }));
}

function abs(r: Rect) {
  return { position: 'absolute' as const, left: r.x, top: r.y, width: r.w, height: r.h };
}

function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) {
    return null;
  }
  const x = Math.min(...rects.map(r => r.x));
  const y = Math.min(...rects.map(r => r.y));
  const x2 = Math.max(...rects.map(r => r.x + r.w));
  const y2 = Math.max(...rects.map(r => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

function relative(r: Rect, origin: Rect): Rect {
  return { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h };
}

/**
 * The multiview screen: main picture, up to two onboard tiles, a bottom rail of chips.
 * Remote handling per SPEC (Select/long-press on chips and tiles, Play/Pause cycles audio,
 * Menu/Back closes the rail then leaves, any d-pad event opens the rail with a 6 s auto-hide).
 */
export function WatchScreen({ pool, catalogue, initialMain, initialDocked, onExit, safeInset = 0 }: WatchScreenProps) {
  const [state, dispatch] = useReducer(reduce, { initialMain, initialDocked, budget: pool.budget }, initWatchState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const window = useWindowDimensions();
  const layout = useMemo(
    () => computeLayout(state, { width: window.width, height: window.height }, safeInset),
    [state, window.width, window.height, safeInset],
  );

  const visible = useMemo(() => [state.main, ...state.docked], [state.main, state.docked]);
  const { leases, releaseAll } = useLeases(pool, visible);

  const [playing, setPlaying] = useState<Record<SourceId, boolean>>({});
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const [menuFor, setMenuFor] = useState<SourceId | null>(null);
  const menuRef = useRef(menuFor);
  menuRef.current = menuFor;
  const [notice, setNotice] = useState<string | null>(null);

  const rail = useMemo(() => railSources(catalogue), [catalogue]);

  // ----- tvOS: make the Menu key reach the app while we are on this screen -----
  useEffect(() => {
    TVEventControl.enableTVMenuKey();
    return () => {
      TVEventControl.disableTVMenuKey();
    };
  }, []);

  // ----- rail auto-hide -----
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);
  const armHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      const anyPlaying = Object.values(playingRef.current).some(Boolean);
      if (anyPlaying && stateRef.current.railOpen && !menuRef.current) {
        dispatch({ type: 'CLOSE_RAIL' });
      }
    }, timing.railAutoHideMs);
  }, [clearHide]);

  useEffect(() => {
    if (state.railOpen) {
      armHide();
    } else {
      clearHide();
    }
  }, [state.railOpen, playing, armHide, clearHide]);
  useEffect(() => clearHide, [clearHide]);

  // ----- toasts -----
  useEffect(() => {
    if (!state.toast) {
      return undefined;
    }
    const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), timing.toastMs);
    return () => clearTimeout(t);
  }, [state.toast]);
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const t = setTimeout(() => setNotice(null), timing.toastMs * 2);
    return () => clearTimeout(t);
  }, [notice]);

  // ----- navigation -----
  const exit = useCallback(() => {
    clearHide();
    releaseAll();
    onExit();
  }, [clearHide, releaseAll, onExit]);

  const handleBack = useCallback(() => {
    if (menuRef.current) {
      setMenuFor(null);
      return;
    }
    if (stateRef.current.railOpen) {
      dispatch({ type: 'CLOSE_RAIL' });
      return;
    }
    exit();
  }, [exit]);

  const openRail = useCallback(() => {
    dispatch({ type: 'OPEN_RAIL' });
    armHide();
  }, [armHide]);

  const onTVEvent = useCallback(
    (evt: HWEvent) => {
      if (evt.eventKeyAction === 1) {
        // Android sends key-up as well; act on key-down only.
        return;
      }
      switch (evt.eventType) {
        case 'playPause':
          dispatch({ type: 'CYCLE_AUDIO' });
          return;
        case 'menu':
          handleBack();
          return;
        case 'select':
        case 'longSelect':
          // Center/select button: raise the rail when it's hidden; while it's open, keep it alive
          // (the focused chip/tile handles its own press via Pressable).
          if (stateRef.current.railOpen) {
            armHide();
          } else {
            openRail();
          }
          return;
        default:
          if (D_PAD_EVENTS.has(evt.eventType)) {
            openRail();
          }
      }
    },
    [armHide, handleBack, openRail],
  );
  useTVEventHandler(onTVEvent);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  // ----- player plumbing -----
  const markPlaying = useCallback((id: SourceId, value: boolean) => {
    setPlaying(p => (p[id] === value ? p : { ...p, [id]: value }));
  }, []);

  const playerFor = useCallback(
    (id: SourceId): { src: ResolvedSource | null; uri: string; headers: Record<string, string>; lease: SlotLease | null } => {
      const src = resolveSource(catalogue, id);
      const lease = leases[id] ?? null;
      if (!src || !lease) {
        return { src, uri: '', headers: {}, lease };
      }
      const client = pool.clientFor(lease);
      return { src, uri: client.streamUrl(src.streamId), headers: client.streamHeaders(), lease };
    },
    [catalogue, leases, pool],
  );

  const chipState = useCallback(
    (id: SourceId): ChipState => (id === state.main ? 'main' : state.docked.includes(id) ? 'docked' : 'idle'),
    [state.main, state.docked],
  );

  const selectSource = useCallback(
    (id: SourceId) => {
      dispatch({ type: 'SELECT_SOURCE', id });
      armHide();
    },
    [armHide],
  );
  const replaceOldest = useCallback(
    (id: SourceId) => {
      dispatch({ type: 'REPLACE_OLDEST', id });
      armHide();
    },
    [armHide],
  );

  // ----- derived geometry -----
  const gutter = useMemo(() => gutterSlots(layout, state.budget), [layout, state.budget]);
  const column = useMemo(
    () => bounds([...layout.tiles, ...layout.emptySlots.map(s => s.rect), ...gutter.map(g => g.rect)]),
    [layout, gutter],
  );

  const main = playerFor(state.main);
  const pendingSrc = state.pendingSwitch ? resolveSource(catalogue, state.pendingSwitch) : null;
  const menuSrc = menuFor ? resolveSource(catalogue, menuFor) : null;

  return (
    <View style={styles.root} testID="watch-screen">
      {/* Main picture */}
      <View style={[styles.mainSlot, abs(layout.main)]} testID="main-slot">
        <StreamPlayer
          uri={main.uri}
          headers={main.headers}
          muted={state.audio !== state.main}
          lease={main.lease}
          onPlaying={() => {
            markPlaying(state.main, true);
            dispatch({ type: 'SWITCH_DONE' });
          }}
          onSlotBusy={() => markPlaying(state.main, false)}
          onFatal={message => {
            markPlaying(state.main, false);
            setNotice(`${main.src?.abbr ?? 'Main'}: ${message}`);
          }}
          testID={`video-${state.main}`}
        />
        {state.pendingSwitch ? (
          <View style={styles.switchOverlay} pointerEvents="none" testID="switch-overlay">
            <Text style={styles.switchText}>{`Switching to ${pendingSrc?.abbr ?? state.pendingSwitch}…`}</Text>
          </View>
        ) : null}
        {!state.pendingSwitch && Platform.OS === 'ios' && main.src?.channel.appleVideoUnsupported ? (
          <View style={styles.hevcOverlay} pointerEvents="none" testID="hevc-overlay">
            <Text style={styles.hevcTitle}>Audio only on Apple TV</Text>
            <Text style={styles.hevcText}>
              This feed is HEVC in a transport stream, which Apple can’t play. Open the rail and pick a
              Sky Sports F1 or International feed.
            </Text>
          </View>
        ) : null}
        {state.railOpen && main.src ? (
          <View style={styles.mainHeader} pointerEvents="none" testID="main-header">
            <Text style={styles.mainHeaderText} numberOfLines={1}>
              <Text style={styles.mainAbbr}>{main.src.abbr}</Text>
              {` ${main.src.kindLabel} · `}
              <Text style={styles.live}>LIVE</Text>
            </Text>
            {state.audio === state.main ? (
              <View style={styles.audioBadge} testID="main-audio">
                <Text style={styles.audioText}>AUDIO</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Tile column (tiles, empty slots, gutter slots) */}
      {column ? (
        <TVFocusGuideView autoFocus style={abs(column)} testID="tile-column">
          {state.docked.map((id, i) => {
            const rect = layout.tiles[i];
            if (!rect) {
              return null;
            }
            const p = playerFor(id);
            return (
              <OnboardTile
                key={id}
                rect={relative(rect, column)}
                abbr={p.src?.abbr ?? '?'}
                kindLabel={p.src?.kindLabel}
                color={p.src?.color ?? colors.ink3}
                isAudio={state.audio === id}
                onPress={() => dispatch({ type: 'MAKE_MAIN', id })}
                onLongPress={() => setMenuFor(id)}
                testID={`tile-${id}`}
              >
                <StreamPlayer
                  uri={p.uri}
                  headers={p.headers}
                  muted={state.audio !== id}
                  lease={p.lease}
                  onPlaying={() => markPlaying(id, true)}
                  onSlotBusy={() => markPlaying(id, false)}
                  onFatal={message => {
                    markPlaying(id, false);
                    setNotice(`${p.src?.abbr ?? id}: ${message}`);
                  }}
                  testID={`video-${id}`}
                />
              </OnboardTile>
            );
          })}
          {layout.emptySlots.map((slot, j) => {
            const index = state.docked.length + j;
            return (
              <EmptySlot
                key={`empty-${index}`}
                rect={relative(slot.rect, column)}
                index={index}
                locked={slot.locked}
                budget={state.budget}
                onPress={openRail}
                testID={`empty-slot-${index}`}
              />
            );
          })}
          {gutter.map((slot, index) => (
            <EmptySlot
              key={`gutter-${index}`}
              rect={relative(slot.rect, column)}
              index={index}
              locked={slot.locked}
              budget={state.budget}
              onPress={openRail}
              testID={`empty-slot-${index}`}
            />
          ))}
        </TVFocusGuideView>
      ) : null}

      {/* Info panel below the tiles (duo/trio) */}
      {layout.info ? (
        <View style={[styles.info, abs(layout.info)]} testID="info-panel">
          <Text style={styles.infoLabel}>AUDIO</Text>
          <Text style={styles.infoValue}>{resolveSource(catalogue, state.audio)?.abbr ?? state.audio}</Text>
          <Text style={styles.infoHint}>Play/Pause cycles audio · long-press a tile for options</Text>
        </View>
      ) : null}

      {/* Rail */}
      {layout.rail ? (
        <Rail rect={layout.rail} title="PITWALL" hint={railHint(state.budget)} testID="rail">
          {rail.map((src, i) => (
            <DriverChip
              key={src.id}
              abbr={src.abbr}
              name={src.name}
              color={src.color}
              state={chipState(src.id)}
              hasTVPreferredFocus={i === 0}
              onPress={() => selectSource(src.id)}
              onLongPress={() => replaceOldest(src.id)}
              testID={`chip-${src.id}`}
            />
          ))}
        </Rail>
      ) : null}

      <Toast message={state.toast ?? notice} />

      {/* Tile context menu */}
      {menuFor ? (
        <View style={styles.menuScrim} testID="tile-menu">
          <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.menuCard}>
            <Text style={styles.menuTitle}>{`${menuSrc?.abbr ?? menuFor} ${menuSrc?.kindLabel ?? ''}`.trim()}</Text>
            <FocusButton
              title="Audio here"
              hasTVPreferredFocus
              onPress={() => {
                dispatch({ type: 'SET_AUDIO', id: menuFor });
                setMenuFor(null);
              }}
              style={styles.menuButton}
              testID="tile-menu-audio"
            />
            <FocusButton
              title="Make main"
              onPress={() => {
                dispatch({ type: 'MAKE_MAIN', id: menuFor });
                setMenuFor(null);
              }}
              style={styles.menuButton}
              testID="tile-menu-main"
            />
            <FocusButton
              title="Remove"
              onPress={() => {
                dispatch({ type: 'REMOVE', id: menuFor });
                setMenuFor(null);
              }}
              style={styles.menuButton}
              testID="tile-menu-remove"
            />
            <FocusButton
              title="Cancel"
              variant="ghost"
              onPress={() => setMenuFor(null)}
              style={styles.menuButton}
              testID="tile-menu-cancel"
            />
          </TVFocusGuideView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mainSlot: {
    backgroundColor: colors.black,
    overflow: 'hidden',
  },
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.band,
  },
  switchText: {
    color: colors.ink,
    fontSize: font.size.md,
    fontWeight: font.titleWeight,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  hevcOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  hevcTitle: {
    color: colors.ink,
    fontSize: font.size.lg,
    fontWeight: font.titleWeight,
    marginBottom: spacing.sm,
  },
  hevcText: {
    color: colors.ink2,
    fontSize: font.size.sm,
    textAlign: 'center',
    maxWidth: 640,
  },
  mainHeader: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.scrim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  mainHeaderText: {
    color: colors.ink,
    fontSize: font.size.xs,
    fontWeight: font.titleWeight,
    letterSpacing: 1,
  },
  mainAbbr: {
    fontWeight: font.abbrWeight,
    color: colors.white,
  },
  live: {
    color: colors.live,
  },
  audioBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.ok,
  },
  audioText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: font.abbrWeight,
    letterSpacing: 1,
  },
  info: {
    backgroundColor: colors.panel,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  infoLabel: {
    color: colors.ink3,
    fontSize: font.size.xs,
    fontWeight: font.titleWeight,
    letterSpacing: 2,
  },
  infoValue: {
    color: colors.ink,
    fontSize: font.size.xl,
    fontWeight: font.abbrWeight,
    marginVertical: spacing.xs,
  },
  infoHint: {
    color: colors.ink3,
    fontSize: font.size.xs,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCard: {
    minWidth: 360,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  menuTitle: {
    color: colors.ink,
    fontSize: font.size.md,
    fontWeight: font.abbrWeight,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  menuButton: {
    marginBottom: spacing.sm,
  },
});

export default WatchScreen;
