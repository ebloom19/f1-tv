export type { SourceId, SourceKind, FocusZone, MultiviewState, MultiviewAction, ParsedSourceId } from './types';
export { makeSourceId, parseSourceId, activeSources } from './types';
export { createInitialState, reduce, maxDocked, TOAST_ALREADY_MAIN, TOAST_NO_ROOM } from './reducer';
export type { Rect, ProtectedRegionName } from './regions';
export { PROTECTED, PROTECTED_NAMES, protectedRegions, regionRect, rectsOverlap, overlapsProtected } from './regions';
export type { Layout, LayoutMode, EmptySlot, CanvasTransform } from './layouts';
export {
  computeLayout,
  canvasTransform,
  scaleRect,
  modeFor,
  bandContentRect,
  CANVAS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BAND_INSET,
} from './layouts';
