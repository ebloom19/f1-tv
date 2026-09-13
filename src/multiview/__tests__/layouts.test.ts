import {
  CANVAS,
  computeLayout,
  maxDocked,
  overlapsProtected,
  protectedRegions,
  rectsOverlap,
  type Layout,
  type Rect,
} from '..';

const FHD = { width: 1920, height: 1080 };
const UHD = { width: 3840, height: 2160 };
const HD = { width: 1280, height: 720 };

const WORLD = 'world:1';
const VER = 'driver:VER';
const NOR = 'driver:NOR';

function r(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

function expectRect(actual: Rect, expected: Rect): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.w).toBeCloseTo(expected.w, 6);
  expect(actual.h).toBeCloseTo(expected.h, 6);
}

function scaled(rect: Rect, k: number): Rect {
  return r(rect.x * k, rect.y * k, rect.w * k, rect.h * k);
}

function nonMainRects(layout: Layout): Rect[] {
  const rects: Rect[] = [...layout.tiles, ...layout.emptySlots.map(s => s.rect)];
  if (layout.rail) {
    rects.push(layout.rail);
  }
  if (layout.info) {
    rects.push(layout.info);
  }
  return rects;
}

const SCENARIOS: { name: string; docked: string[]; railOpen: boolean; budget: number; mode: Layout['mode'] }[] = [
  { name: 'solo closed', docked: [], railOpen: false, budget: 1, mode: 'solo' },
  { name: 'solo open', docked: [], railOpen: true, budget: 1, mode: 'solo' },
  { name: 'solo open budget 3', docked: [], railOpen: true, budget: 3, mode: 'solo' },
  { name: 'duo closed', docked: [VER], railOpen: false, budget: 2, mode: 'duo' },
  { name: 'duo open', docked: [VER], railOpen: true, budget: 2, mode: 'duo' },
  { name: 'duo open budget 3', docked: [VER], railOpen: true, budget: 3, mode: 'duo' },
  { name: 'trio closed', docked: [VER, NOR], railOpen: false, budget: 3, mode: 'trio' },
  { name: 'trio open', docked: [VER, NOR], railOpen: true, budget: 3, mode: 'trio' },
];

describe('regions', () => {
  it('rectsOverlap is strict (touching edges do not overlap)', () => {
    expect(rectsOverlap(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(r(0, 0, 10, 10), r(0, 10, 10, 10))).toBe(false);
    expect(rectsOverlap(r(0, 0, 10, 10), r(10, 10, 10, 10))).toBe(false);
    expect(rectsOverlap(r(0, 0, 10, 10), r(9, 9, 10, 10))).toBe(true);
    expect(rectsOverlap(r(0, 0, 10, 10), r(2, 2, 3, 3))).toBe(true);
    expect(rectsOverlap(r(0, 0, 0, 10), r(0, 0, 10, 10))).toBe(false);
  });

  it('protectedRegions maps fractions onto the main rect', () => {
    const regions = protectedRegions(r(0, 0, 1440, 810));
    expect(regions).toHaveLength(3);
    expectRect(regions[0], r(1440 * 0.024, 810 * 0.12, 1440 * 0.135, 810 * 0.62));
    expectRect(regions[1], r(1440 * 0.024, 810 * 0.04, 1440 * 0.2, 810 * 0.07));
    expectRect(regions[2], r(1440 * 0.25, 810 * 0.86, 1440 * 0.5, 810 * 0.09));
    const offset = protectedRegions(r(100, 50, 1440, 810));
    expectRect(offset[2], r(100 + 1440 * 0.25, 50 + 810 * 0.86, 1440 * 0.5, 810 * 0.09));
  });
});

describe('computeLayout at 1920x1080', () => {
  it('solo with rail closed fills the screen', () => {
    const l = computeLayout({ docked: [], railOpen: false, budget: 1 }, FHD);
    expect(l.mode).toBe('solo');
    expectRect(l.screen, r(0, 0, 1920, 1080));
    expectRect(l.main, r(0, 0, 1920, 1080));
    expect(l.tiles).toEqual([]);
    expect(l.emptySlots).toEqual([]);
    expect(l.rail).toBeNull();
    expect(l.info).toBeNull();
    expect(l.scale).toBe(1);
  });

  it('solo with rail open letterboxes main into the top band', () => {
    const l = computeLayout({ docked: [], railOpen: true, budget: 1 }, FHD);
    expect(l.mode).toBe('solo');
    expectRect(l.main, r(240, 0, 1440, 810));
    expectRect(l.rail as Rect, r(0, 810, 1920, 270));
    expect(l.tiles).toEqual([]);
    expect(l.emptySlots).toEqual([]);
    expect(l.info).toBeNull();
  });

  it('duo places one tile, one empty slot, info panel and rail', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 3 }, FHD);
    expect(l.mode).toBe('duo');
    expectRect(l.main, r(0, 0, 1440, 810));
    expect(l.tiles).toHaveLength(1);
    expectRect(l.tiles[0], r(1440, 0, 480, 270));
    expect(l.emptySlots).toHaveLength(1);
    expectRect(l.emptySlots[0].rect, r(1440, 270, 480, 270));
    expect(l.emptySlots[0].locked).toBe(false);
    expectRect(l.rail as Rect, r(0, 810, 1920, 270));
    expectRect(l.info as Rect, r(1440, 540, 480, 270));
  });

  it('duo with rail closed keeps the same rects and returns rail null', () => {
    const l = computeLayout({ docked: [VER], railOpen: false, budget: 2 }, FHD);
    expectRect(l.main, r(0, 0, 1440, 810));
    expectRect(l.tiles[0], r(1440, 0, 480, 270));
    expect(l.rail).toBeNull();
    expectRect(l.info as Rect, r(1440, 540, 480, 270));
  });

  it('trio fills both tiles', () => {
    const l = computeLayout({ docked: [VER, NOR], railOpen: true, budget: 3 }, FHD);
    expect(l.mode).toBe('trio');
    expectRect(l.main, r(0, 0, 1440, 810));
    expect(l.tiles).toHaveLength(2);
    expectRect(l.tiles[0], r(1440, 0, 480, 270));
    expectRect(l.tiles[1], r(1440, 270, 480, 270));
    expect(l.emptySlots).toEqual([]);
    expectRect(l.rail as Rect, r(0, 810, 1920, 270));
    expectRect(l.info as Rect, r(1440, 540, 480, 270));
  });

  it('ignores docked entries beyond two tiles defensively', () => {
    const l = computeLayout({ docked: [VER, NOR, WORLD], railOpen: false, budget: 3 }, FHD);
    expect(l.mode).toBe('trio');
    expect(l.tiles).toHaveLength(2);
  });
});

describe('locked flags', () => {
  it('budget 1: duo shows the remaining slot locked', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 1 }, FHD);
    expect(l.emptySlots.map(s => s.locked)).toEqual([true]);
  });

  it('budget 2: the second slot is locked', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 2 }, FHD);
    expect(l.emptySlots.map(s => s.locked)).toEqual([true]);
  });

  it('budget 3: the second slot is available', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 3 }, FHD);
    expect(l.emptySlots.map(s => s.locked)).toEqual([false]);
  });

  it('locked matches maxDocked for every budget', () => {
    for (const budget of [1, 2, 3, 4]) {
      const l = computeLayout({ docked: [VER], railOpen: true, budget }, FHD);
      l.emptySlots.forEach((slot, j) => {
        expect(slot.locked).toBe(1 + j >= maxDocked(budget));
      });
    }
  });
});

describe.each([
  ['3840x2160', UHD, 2],
  ['1280x720', HD, 2 / 3],
])('computeLayout scaled to %s', (_name, screen, k) => {
  it('solo closed / open', () => {
    const closed = computeLayout({ docked: [], railOpen: false, budget: 1 }, screen);
    expectRect(closed.main, scaled(CANVAS.full, k));
    expect(closed.scale).toBeCloseTo(k, 9);
    const open = computeLayout({ docked: [], railOpen: true, budget: 1 }, screen);
    expectRect(open.main, scaled(CANVAS.soloRailMain, k));
    expectRect(open.rail as Rect, scaled(CANVAS.rail, k));
  });

  it('duo', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 3 }, screen);
    expectRect(l.main, scaled(CANVAS.multiMain, k));
    expectRect(l.tiles[0], scaled(CANVAS.tiles[0], k));
    expectRect(l.emptySlots[0].rect, scaled(CANVAS.tiles[1], k));
    expectRect(l.rail as Rect, scaled(CANVAS.rail, k));
    expectRect(l.info as Rect, scaled(CANVAS.info, k));
  });

  it('trio', () => {
    const l = computeLayout({ docked: [VER, NOR], railOpen: true, budget: 3 }, screen);
    expectRect(l.main, scaled(CANVAS.multiMain, k));
    expectRect(l.tiles[0], scaled(CANVAS.tiles[0], k));
    expectRect(l.tiles[1], scaled(CANVAS.tiles[1], k));
    expectRect(l.rail as Rect, scaled(CANVAS.rail, k));
    expectRect(l.info as Rect, scaled(CANVAS.info, k));
  });
});

describe('non-16:9 screens and safe insets', () => {
  it('letterboxes the canvas inside a 4:3 screen', () => {
    const l = computeLayout({ docked: [], railOpen: false, budget: 1 }, { width: 1600, height: 1200 });
    // scale limited by width: 1600/1920
    const k = 1600 / 1920;
    expectRect(l.main, r(0, (1200 - 1080 * k) / 2, 1600, 1080 * k));
    expectRect(l.screen, r(0, 0, 1600, 1200));
  });

  it('pillarboxes the canvas inside an ultra-wide screen', () => {
    const l = computeLayout({ docked: [VER], railOpen: true, budget: 2 }, { width: 2560, height: 1080 });
    expectRect(l.canvas, r((2560 - 1920) / 2, 0, 1920, 1080));
    expectRect(l.main, r(320, 0, 1440, 810));
  });

  it('applies the safe inset around the canvas', () => {
    const l = computeLayout({ docked: [], railOpen: false, budget: 1 }, FHD, 60);
    // available 1800x960 → height-limited: k = 960/1080, canvas pillarboxed inside the inset area
    const k = 960 / 1080;
    expectRect(l.main, r(60 + (1800 - 1920 * k) / 2, 60, 1920 * k, 1080 * k));
    expect(l.scale).toBeCloseTo(k, 9);
    expect(l.main.y + l.main.h).toBeCloseTo(1080 - 60, 6);
  });
});

describe('geometry invariants in every mode', () => {
  const screens = [FHD, UHD, HD, { width: 1600, height: 1200 }, { width: 2560, height: 1080 }];

  for (const screen of screens) {
    for (const sc of SCENARIOS) {
      const l = computeLayout({ docked: sc.docked, railOpen: sc.railOpen, budget: sc.budget }, screen);

      it(`${sc.name} @ ${screen.width}x${screen.height}: mode`, () => {
        expect(l.mode).toBe(sc.mode);
      });

      it(`${sc.name} @ ${screen.width}x${screen.height}: main is 16:9 within 1 px`, () => {
        expect(Math.abs(l.main.w - (l.main.h * 16) / 9)).toBeLessThanOrEqual(1);
        for (const tile of l.tiles) {
          expect(Math.abs(tile.w - (tile.h * 16) / 9)).toBeLessThanOrEqual(1);
        }
      });

      it(`${sc.name} @ ${screen.width}x${screen.height}: nothing covers a protected region`, () => {
        for (const rect of nonMainRects(l)) {
          expect(overlapsProtected(rect, l.main)).toBe(false);
        }
      });

      it(`${sc.name} @ ${screen.width}x${screen.height}: rects stay inside the screen`, () => {
        for (const rect of [l.main, ...nonMainRects(l)]) {
          expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
          expect(rect.y).toBeGreaterThanOrEqual(-1e-6);
          expect(rect.x + rect.w).toBeLessThanOrEqual(screen.width + 1e-6);
          expect(rect.y + rect.h).toBeLessThanOrEqual(screen.height + 1e-6);
        }
      });

      it(`${sc.name} @ ${screen.width}x${screen.height}: tiles, slots, rail and info do not overlap each other or main`, () => {
        const others = nonMainRects(l);
        for (const rect of others) {
          expect(rectsOverlap(rect, l.main)).toBe(false);
        }
        for (let i = 0; i < others.length; i++) {
          for (let j = i + 1; j < others.length; j++) {
            expect(rectsOverlap(others[i], others[j])).toBe(false);
          }
        }
      });
    }
  }
});
