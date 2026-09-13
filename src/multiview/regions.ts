export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fractions of the *main video rect* that carry broadcast graphics we must never cover. */
export const PROTECTED = {
  timingTower: { x: 0.024, y: 0.12, w: 0.135, h: 0.62 },
  lapBox: { x: 0.024, y: 0.04, w: 0.2, h: 0.07 },
  lowerThird: { x: 0.25, y: 0.86, w: 0.5, h: 0.09 },
} as const;

export type ProtectedRegionName = keyof typeof PROTECTED;

export const PROTECTED_NAMES: readonly ProtectedRegionName[] = ['timingTower', 'lapBox', 'lowerThird'];

/** Convert a fractional region into absolute pixels relative to `main`. */
export function regionRect(main: Rect, fraction: { x: number; y: number; w: number; h: number }): Rect {
  return {
    x: main.x + main.w * fraction.x,
    y: main.y + main.h * fraction.y,
    w: main.w * fraction.w,
    h: main.h * fraction.h,
  };
}

/** Absolute pixel rects of every protected region for the given main video rect. */
export function protectedRegions(main: Rect): Rect[] {
  return PROTECTED_NAMES.map(name => regionRect(main, PROTECTED[name]));
}

/** Strict overlap: rects that merely touch along an edge or corner do NOT overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) {
    return false;
  }
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True when `rect` strictly overlaps any protected region of `main`. */
export function overlapsProtected(rect: Rect, main: Rect): boolean {
  return protectedRegions(main).some(region => rectsOverlap(rect, region));
}
