import {
  createInitialState,
  maxDocked,
  reduce,
  TOAST_ALREADY_MAIN,
  TOAST_NO_ROOM,
  type MultiviewAction,
  type MultiviewState,
} from '..';
import { makeSourceId, parseSourceId } from '../types';

const WORLD = 'world:6844';
const VER = 'driver:VER';
const NOR = 'driver:NOR';
const LEC = 'driver:LEC';
const HAM = 'driver:HAM';

function run(state: MultiviewState, ...actions: MultiviewAction[]): MultiviewState {
  return actions.reduce(reduce, state);
}

function expectInvariants(s: MultiviewState): void {
  const ids = [s.main, ...s.docked];
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain(s.audio);
  expect(s.docked.length).toBeLessThanOrEqual(maxDocked(s.budget));
  expect(s.budget).toBeGreaterThanOrEqual(1);
}

describe('source ids', () => {
  it('round-trips through makeSourceId/parseSourceId', () => {
    expect(makeSourceId('driver', 'VER')).toBe('driver:VER');
    expect(makeSourceId('world', 6844)).toBe('world:6844');
    expect(parseSourceId('driver:VER')).toEqual({ kind: 'driver', key: 'VER' });
    expect(parseSourceId('world:6844')).toEqual({ kind: 'world', key: '6844' });
    expect(parseSourceId('data:12')).toEqual({ kind: 'data', key: '12' });
  });

  it('tolerates unknown prefixes', () => {
    expect(parseSourceId('weird:1')).toEqual({ kind: 'data', key: 'weird:1' });
    expect(parseSourceId('noprefix')).toEqual({ kind: 'data', key: 'noprefix' });
  });
});

describe('maxDocked', () => {
  it('is min(2, max(0, budget-1))', () => {
    expect(maxDocked(0)).toBe(0);
    expect(maxDocked(1)).toBe(0);
    expect(maxDocked(2)).toBe(1);
    expect(maxDocked(3)).toBe(2);
    expect(maxDocked(9)).toBe(2);
  });
});

describe('createInitialState', () => {
  it('starts on the given main with audio there, rail closed', () => {
    const s = createInitialState(WORLD, 2);
    expect(s).toEqual({
      budget: 2,
      main: WORLD,
      docked: [],
      audio: WORLD,
      railOpen: false,
      pendingSwitch: null,
      toast: null,
    });
  });

  it('clamps budget to at least 1', () => {
    expect(createInitialState(WORLD, 0).budget).toBe(1);
    expect(createInitialState(WORLD, -3).budget).toBe(1);
    expect(createInitialState(WORLD, 2.9).budget).toBe(2);
  });
});

describe('SELECT_SOURCE', () => {
  it('on main is a no-op with a toast', () => {
    const s0 = createInitialState(WORLD, 3);
    const s1 = reduce(s0, { type: 'SELECT_SOURCE', id: WORLD });
    expect(s1.toast).toBe(TOAST_ALREADY_MAIN);
    expect({ ...s1, toast: null }).toEqual(s0);
  });

  describe('budget 1', () => {
    it('switches main, audio, sets pendingSwitch and keeps docked empty', () => {
      const s = reduce(createInitialState(WORLD, 1), { type: 'SELECT_SOURCE', id: VER });
      expect(s.main).toBe(VER);
      expect(s.audio).toBe(VER);
      expect(s.pendingSwitch).toBe(VER);
      expect(s.docked).toEqual([]);
    });

    it('never docks anything even after several selections', () => {
      const s = run(createInitialState(WORLD, 1), { type: 'SELECT_SOURCE', id: VER }, { type: 'SELECT_SOURCE', id: NOR });
      expect(s.main).toBe(NOR);
      expect(s.docked).toEqual([]);
      expect(s.pendingSwitch).toBe(NOR);
    });
  });

  describe('budget 2', () => {
    it('docks one source and keeps main', () => {
      const s = reduce(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER });
      expect(s.main).toBe(WORLD);
      expect(s.docked).toEqual([VER]);
      expect(s.audio).toBe(WORLD);
      expect(s.pendingSwitch).toBeNull();
    });

    it('second select of a new id toasts and does not change the picture', () => {
      const s1 = reduce(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER });
      const s2 = reduce(s1, { type: 'SELECT_SOURCE', id: NOR });
      expect(s2.toast).toBe(TOAST_NO_ROOM);
      expect(s2.main).toBe(WORLD);
      expect(s2.docked).toEqual([VER]);
      expect(s2.audio).toBe(s1.audio);
    });
  });

  describe('budget 3', () => {
    it('docks two sources oldest first, third toasts', () => {
      const s = run(
        createInitialState(WORLD, 3),
        { type: 'SELECT_SOURCE', id: VER },
        { type: 'SELECT_SOURCE', id: NOR },
      );
      expect(s.docked).toEqual([VER, NOR]);
      expect(s.toast).toBeNull();
      const s3 = reduce(s, { type: 'SELECT_SOURCE', id: LEC });
      expect(s3.toast).toBe(TOAST_NO_ROOM);
      expect(s3.docked).toEqual([VER, NOR]);
    });
  });

  it('on a docked id swaps it with main (same as MAKE_MAIN)', () => {
    const s = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'SELECT_SOURCE', id: NOR },
    );
    expect(s.main).toBe(NOR);
    expect(s.docked).toEqual([VER, WORLD]);
    expect(s.audio).toBe(WORLD);
    expectInvariants(s);
  });
});

describe('REPLACE_OLDEST', () => {
  it('replaces the oldest docked tile when full', () => {
    const s = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'REPLACE_OLDEST', id: LEC },
    );
    expect(s.docked).toEqual([NOR, LEC]);
    expect(s.toast).toBeNull();
  });

  it('just docks when there is still room', () => {
    const s = run(createInitialState(WORLD, 3), { type: 'REPLACE_OLDEST', id: VER });
    expect(s.docked).toEqual([VER]);
  });

  it('with budget 2 replaces the single tile', () => {
    const s = run(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER }, { type: 'REPLACE_OLDEST', id: NOR });
    expect(s.docked).toEqual([NOR]);
    expect(s.main).toBe(WORLD);
  });

  it('moves audio back to main when the replaced tile was the audio source', () => {
    const s = run(
      createInitialState(WORLD, 2),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SET_AUDIO', id: VER },
      { type: 'REPLACE_OLDEST', id: NOR },
    );
    expect(s.docked).toEqual([NOR]);
    expect(s.audio).toBe(WORLD);
  });

  it('behaves like a switch in budget 1', () => {
    const s = reduce(createInitialState(WORLD, 1), { type: 'REPLACE_OLDEST', id: VER });
    expect(s.main).toBe(VER);
    expect(s.pendingSwitch).toBe(VER);
    expect(s.docked).toEqual([]);
  });

  it('on main / docked ids does not duplicate anything', () => {
    const base = run(createInitialState(WORLD, 3), { type: 'SELECT_SOURCE', id: VER });
    expect(reduce(base, { type: 'REPLACE_OLDEST', id: WORLD }).docked).toEqual([VER]);
    const swapped = reduce(base, { type: 'REPLACE_OLDEST', id: VER });
    expect(swapped.main).toBe(VER);
    expect(swapped.docked).toEqual([WORLD]);
  });
});

describe('MAKE_MAIN', () => {
  it('swaps the tile with main, keeps ids distinct and audio valid', () => {
    const base = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'SET_AUDIO', id: NOR },
    );
    const s = reduce(base, { type: 'MAKE_MAIN', id: VER });
    expect(s.main).toBe(VER);
    expect(s.docked).toEqual([WORLD, NOR]);
    expect(s.audio).toBe(NOR);
    expectInvariants(s);
    // swapping back restores the original arrangement
    const back = reduce(s, { type: 'MAKE_MAIN', id: WORLD });
    expect(back.main).toBe(WORLD);
    expect(back.docked).toEqual([VER, NOR]);
  });

  it('keeps audio when the audio tile becomes main', () => {
    const s = run(
      createInitialState(WORLD, 2),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SET_AUDIO', id: VER },
      { type: 'MAKE_MAIN', id: VER },
    );
    expect(s.audio).toBe(VER);
    expect(s.main).toBe(VER);
    expect(s.docked).toEqual([WORLD]);
  });

  it('is a no-op for main or unknown ids', () => {
    const base = run(createInitialState(WORLD, 3), { type: 'SELECT_SOURCE', id: VER });
    expect(reduce(base, { type: 'MAKE_MAIN', id: WORLD })).toBe(base);
    expect(reduce(base, { type: 'MAKE_MAIN', id: HAM })).toBe(base);
  });
});

describe('REMOVE', () => {
  it('drops the tile and resets audio to main when it was the audio source', () => {
    const s = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'SET_AUDIO', id: NOR },
      { type: 'REMOVE', id: NOR },
    );
    expect(s.docked).toEqual([VER]);
    expect(s.audio).toBe(WORLD);
  });

  it('keeps audio when a different tile is removed', () => {
    const s = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'SET_AUDIO', id: NOR },
      { type: 'REMOVE', id: VER },
    );
    expect(s.docked).toEqual([NOR]);
    expect(s.audio).toBe(NOR);
  });

  it('cannot remove main', () => {
    const base = run(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER });
    expect(reduce(base, { type: 'REMOVE', id: WORLD })).toBe(base);
  });
});

describe('audio', () => {
  it('SET_AUDIO only accepts on-screen sources', () => {
    const base = run(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER });
    expect(reduce(base, { type: 'SET_AUDIO', id: VER }).audio).toBe(VER);
    expect(reduce(base, { type: 'SET_AUDIO', id: HAM })).toBe(base);
  });

  it('CYCLE_AUDIO walks [main, ...docked] and wraps', () => {
    const base = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
    );
    const a = reduce(base, { type: 'CYCLE_AUDIO' });
    const b = reduce(a, { type: 'CYCLE_AUDIO' });
    const c = reduce(b, { type: 'CYCLE_AUDIO' });
    expect([base.audio, a.audio, b.audio, c.audio]).toEqual([WORLD, VER, NOR, WORLD]);
  });

  it('CYCLE_AUDIO with nothing docked stays on main', () => {
    const base = createInitialState(WORLD, 1);
    expect(reduce(base, { type: 'CYCLE_AUDIO' }).audio).toBe(WORLD);
  });
});

describe('SET_BUDGET', () => {
  it('shrinking drops the newest docked tiles and fixes audio', () => {
    const base = run(
      createInitialState(WORLD, 3),
      { type: 'SELECT_SOURCE', id: VER },
      { type: 'SELECT_SOURCE', id: NOR },
      { type: 'SET_AUDIO', id: NOR },
    );
    const two = reduce(base, { type: 'SET_BUDGET', budget: 2 });
    expect(two.budget).toBe(2);
    expect(two.docked).toEqual([VER]);
    expect(two.audio).toBe(WORLD);
    const one = reduce(two, { type: 'SET_BUDGET', budget: 1 });
    expect(one.docked).toEqual([]);
    expect(one.audio).toBe(WORLD);
    expect(one.main).toBe(WORLD);
  });

  it('growing keeps everything and allows more docking', () => {
    const base = run(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: VER });
    const grown = run(base, { type: 'SET_BUDGET', budget: 3 }, { type: 'SELECT_SOURCE', id: NOR });
    expect(grown.docked).toEqual([VER, NOR]);
  });

  it('clamps to at least 1', () => {
    expect(reduce(createInitialState(WORLD, 2), { type: 'SET_BUDGET', budget: 0 }).budget).toBe(1);
  });
});

describe('misc actions', () => {
  it('SWITCH_DONE clears pendingSwitch', () => {
    const s = run(createInitialState(WORLD, 1), { type: 'SELECT_SOURCE', id: VER }, { type: 'SWITCH_DONE' });
    expect(s.pendingSwitch).toBeNull();
    expect(s.main).toBe(VER);
  });

  it('rail open/close/toggle', () => {
    const s0 = createInitialState(WORLD, 1);
    expect(reduce(s0, { type: 'OPEN_RAIL' }).railOpen).toBe(true);
    expect(run(s0, { type: 'OPEN_RAIL' }, { type: 'CLOSE_RAIL' }).railOpen).toBe(false);
    expect(reduce(s0, { type: 'TOGGLE_RAIL' }).railOpen).toBe(true);
    expect(run(s0, { type: 'TOGGLE_RAIL' }, { type: 'TOGGLE_RAIL' }).railOpen).toBe(false);
    expect(reduce(s0, { type: 'CLOSE_RAIL' })).toBe(s0);
  });

  it('CLEAR_TOAST clears the toast', () => {
    const s = run(createInitialState(WORLD, 2), { type: 'SELECT_SOURCE', id: WORLD }, { type: 'CLEAR_TOAST' });
    expect(s.toast).toBeNull();
  });
});

describe('invariants under random action sequences', () => {
  // mulberry32 — small deterministic PRNG so failures are reproducible.
  /* eslint-disable no-bitwise */
  function prng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* eslint-enable no-bitwise */

  const POOL = [WORLD, 'world:7001', VER, NOR, LEC, HAM, 'driver:PIA', 'data:9001'];

  function randomAction(rnd: () => number): MultiviewAction {
    const id = POOL[Math.floor(rnd() * POOL.length)];
    const roll = Math.floor(rnd() * 12);
    switch (roll) {
      case 0:
      case 1:
      case 2:
        return { type: 'SELECT_SOURCE', id };
      case 3:
        return { type: 'REPLACE_OLDEST', id };
      case 4:
        return { type: 'MAKE_MAIN', id };
      case 5:
        return { type: 'REMOVE', id };
      case 6:
        return { type: 'SET_AUDIO', id };
      case 7:
        return { type: 'CYCLE_AUDIO' };
      case 8:
        return { type: 'TOGGLE_RAIL' };
      case 9:
        return { type: 'SET_BUDGET', budget: 1 + Math.floor(rnd() * 4) };
      case 10:
        return { type: 'SWITCH_DONE' };
      default:
        return { type: 'CLEAR_TOAST' };
    }
  }

  it('holds for 500 seeded sequences', () => {
    const rnd = prng(0x51de);
    for (let seq = 0; seq < 500; seq++) {
      let state = createInitialState(POOL[Math.floor(rnd() * POOL.length)], 1 + Math.floor(rnd() * 3));
      const steps = 10 + Math.floor(rnd() * 40);
      for (let i = 0; i < steps; i++) {
        const action = randomAction(rnd);
        state = reduce(state, action);
        try {
          expectInvariants(state);
        } catch (err) {
          throw new Error(`seq ${seq} step ${i} action ${JSON.stringify(action)} state ${JSON.stringify(state)}: ${String(err)}`);
        }
      }
    }
  });
});
