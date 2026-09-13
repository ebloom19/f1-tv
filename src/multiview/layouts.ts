import { maxDocked } from './reducer';
import type { Rect } from './regions';
import type { MultiviewState } from './types';

export type LayoutMode = 'solo' | 'duo' | 'trio';

export interface EmptySlot {
  rect: Rect;
  /** True when the slot can only be used with a bigger connection budget. */
  locked: boolean;
}

export interface Layout {
  /** The full device screen, in screen pixels. */
  screen: Rect;
  /** The 1920x1080 design canvas mapped onto the screen (letterboxed when not 16:9). */
  canvas: Rect;
  /** Screen px per canvas px. */
  scale: number;
  main: Rect;
  /** One rect per docked source, same order as `state.docked`. */
  tiles: Rect[];
  emptySlots: EmptySlot[];
  rail: Rect | null;
  /** Audio / session panel below the tiles (duo/trio only). */
  info: Rect | null;
  mode: LayoutMode;
}

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
/** Inset used by rail contents and text inside their bands (canvas px). */
export const BAND_INSET = 48;

/** Canvas-space constants (all exact 16:9 for video rects). */
export const CANVAS = {
  full: { x: 0, y: 0, w: 1920, h: 1080 },
  soloRailMain: { x: 240, y: 0, w: 1440, h: 810 },
  multiMain: { x: 0, y: 0, w: 1440, h: 810 },
  tiles: [
    { x: 1440, y: 0, w: 480, h: 270 },
    { x: 1440, y: 270, w: 480, h: 270 },
  ] as readonly Rect[],
  info: { x: 1440, y: 540, w: 480, h: 270 },
  rail: { x: 0, y: 810, w: 1920, h: 270 },
} as const;

export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Fit the 1920x1080 canvas inside the screen (minus `safe` px on every side), preserving aspect
 * ratio and centring the result. A 16:9 screen with safe=0 maps the canvas edge to edge.
 */
export function canvasTransform(screen: { width: number; height: number }, safe = 0): CanvasTransform {
  const inset = Math.max(0, safe);
  const availW = Math.max(0, screen.width - inset * 2);
  const availH = Math.max(0, screen.height - inset * 2);
  const scale = Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT);
  const offsetX = inset + (availW - CANVAS_WIDTH * scale) / 2;
  const offsetY = inset + (availH - CANVAS_HEIGHT * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function scaleRect(rect: Rect, t: CanvasTransform): Rect {
  return {
    x: t.offsetX + rect.x * t.scale,
    y: t.offsetY + rect.y * t.scale,
    w: rect.w * t.scale,
    h: rect.h * t.scale,
  };
}

export function modeFor(docked: readonly unknown[]): LayoutMode {
  if (docked.length >= 2) {
    return 'trio';
  }
  return docked.length === 1 ? 'duo' : 'solo';
}

export function computeLayout(
  state: Pick<MultiviewState, 'docked' | 'railOpen' | 'budget'>,
  screen: { width: number; height: number },
  safe = 0,
): Layout {
  const t = canvasTransform(screen, safe);
  const s = (rect: Rect): Rect => scaleRect(rect, t);
  const mode = modeFor(state.docked);
  const screenRect: Rect = { x: 0, y: 0, w: screen.width, h: screen.height };
  const canvas = s(CANVAS.full);

  if (mode === 'solo') {
    if (!state.railOpen) {
      return { screen: screenRect, canvas, scale: t.scale, main: canvas, tiles: [], emptySlots: [], rail: null, info: null, mode };
    }
    return {
      screen: screenRect,
      canvas,
      scale: t.scale,
      main: s(CANVAS.soloRailMain),
      tiles: [],
      emptySlots: [],
      rail: s(CANVAS.rail),
      info: null,
      mode,
    };
  }

  const occupied = Math.min(state.docked.length, CANVAS.tiles.length);
  const capacity = maxDocked(state.budget);
  const tiles = CANVAS.tiles.slice(0, occupied).map(s);
  const emptySlots: EmptySlot[] = CANVAS.tiles.slice(occupied).map((rect, j) => ({
    rect: s(rect),
    locked: occupied + j >= capacity,
  }));

  return {
    screen: screenRect,
    canvas,
    scale: t.scale,
    main: s(CANVAS.multiMain),
    tiles,
    emptySlots,
    rail: state.railOpen ? s(CANVAS.rail) : null,
    info: s(CANVAS.info),
    mode,
  };
}

/** Shrink a band rect by the standard 48 px (canvas) content inset, scaled to the layout. */
export function bandContentRect(band: Rect, scale: number): Rect {
  const inset = BAND_INSET * scale;
  return { x: band.x + inset, y: band.y + inset, w: Math.max(0, band.w - inset * 2), h: Math.max(0, band.h - inset * 2) };
}
