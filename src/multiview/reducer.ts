import type { MultiviewAction, MultiviewState, SourceId } from './types';

export const TOAST_ALREADY_MAIN = 'Already on the main screen';
export const TOAST_NO_ROOM = 'Long-press to replace';

/** Number of onboard tiles the budget allows: min(2, max(0, budget - 1)). */
export function maxDocked(budget: number): number {
  return Math.min(2, Math.max(0, Math.floor(budget) - 1));
}

function normalizeBudget(budget: number): number {
  return Number.isFinite(budget) ? Math.max(1, Math.floor(budget)) : 1;
}

export function createInitialState(main: SourceId, budget: number): MultiviewState {
  return {
    budget: normalizeBudget(budget),
    main,
    docked: [],
    audio: main,
    railOpen: false,
    pendingSwitch: null,
    toast: null,
  };
}

function withToast(state: MultiviewState, toast: string): MultiviewState {
  return { ...state, toast };
}

/** Keep `audio` pointing at a source that is actually on screen. */
function fixAudio(state: MultiviewState): MultiviewState {
  if (state.audio === state.main || state.docked.includes(state.audio)) {
    return state;
  }
  return { ...state, audio: state.main };
}

function switchMainSolo(state: MultiviewState, id: SourceId): MultiviewState {
  return {
    ...state,
    main: id,
    docked: [],
    audio: id,
    pendingSwitch: id,
    toast: null,
  };
}

function makeMain(state: MultiviewState, id: SourceId): MultiviewState {
  if (id === state.main) {
    return state;
  }
  const index = state.docked.indexOf(id);
  if (index < 0) {
    return state;
  }
  const docked = state.docked.slice();
  docked[index] = state.main;
  // audio still refers to a source on screen (same id set), so it is untouched.
  return { ...state, main: id, docked, toast: null };
}

function selectSource(state: MultiviewState, id: SourceId): MultiviewState {
  if (id === state.main) {
    return withToast(state, TOAST_ALREADY_MAIN);
  }
  if (state.docked.includes(id)) {
    return makeMain(state, id);
  }
  if (state.budget <= 1) {
    return switchMainSolo(state, id);
  }
  if (state.docked.length < maxDocked(state.budget)) {
    return { ...state, docked: [...state.docked, id], toast: null };
  }
  return withToast(state, TOAST_NO_ROOM);
}

function replaceOldest(state: MultiviewState, id: SourceId): MultiviewState {
  if (id === state.main) {
    return withToast(state, TOAST_ALREADY_MAIN);
  }
  if (state.docked.includes(id)) {
    return makeMain(state, id);
  }
  if (state.budget <= 1) {
    return switchMainSolo(state, id);
  }
  const capacity = maxDocked(state.budget);
  if (state.docked.length < capacity) {
    return { ...state, docked: [...state.docked, id], toast: null };
  }
  const [oldest, ...rest] = state.docked;
  const next: MultiviewState = { ...state, docked: [...rest, id], toast: null };
  return state.audio === oldest ? { ...next, audio: next.main } : next;
}

function remove(state: MultiviewState, id: SourceId): MultiviewState {
  const index = state.docked.indexOf(id);
  if (index < 0) {
    // The main picture cannot be removed; it can only be replaced.
    return state;
  }
  const docked = state.docked.filter(d => d !== id);
  return fixAudio({ ...state, docked });
}

function setAudio(state: MultiviewState, id: SourceId): MultiviewState {
  if (id === state.audio) {
    return state;
  }
  if (id !== state.main && !state.docked.includes(id)) {
    return state;
  }
  return { ...state, audio: id };
}

function cycleAudio(state: MultiviewState): MultiviewState {
  const order = [state.main, ...state.docked];
  if (order.length <= 1) {
    return state.audio === state.main ? state : { ...state, audio: state.main };
  }
  const current = order.indexOf(state.audio);
  const next = order[(current + 1) % order.length];
  return { ...state, audio: next };
}

function setBudget(state: MultiviewState, rawBudget: number): MultiviewState {
  const budget = normalizeBudget(rawBudget);
  const docked = state.docked.slice(0, maxDocked(budget));
  const next: MultiviewState = { ...state, budget, docked };
  return fixAudio(next);
}

export function reduce(state: MultiviewState, action: MultiviewAction): MultiviewState {
  switch (action.type) {
    case 'SELECT_SOURCE':
      return selectSource(state, action.id);
    case 'REPLACE_OLDEST':
      return replaceOldest(state, action.id);
    case 'MAKE_MAIN':
      return makeMain(state, action.id);
    case 'REMOVE':
      return remove(state, action.id);
    case 'SET_AUDIO':
      return setAudio(state, action.id);
    case 'CYCLE_AUDIO':
      return cycleAudio(state);
    case 'OPEN_RAIL':
      return state.railOpen ? state : { ...state, railOpen: true };
    case 'CLOSE_RAIL':
      return state.railOpen ? { ...state, railOpen: false } : state;
    case 'TOGGLE_RAIL':
      return { ...state, railOpen: !state.railOpen };
    case 'SET_BUDGET':
      return setBudget(state, action.budget);
    case 'SWITCH_DONE':
      return state.pendingSwitch === null ? state : { ...state, pendingSwitch: null };
    case 'CLEAR_TOAST':
      return state.toast === null ? state : { ...state, toast: null };
    default:
      return state;
  }
}
