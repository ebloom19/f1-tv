/**
 * Multiview domain types (pure TypeScript — no react-native imports).
 *
 * `SourceId` is a string of the form `world:${streamId}` | `driver:${ABBR}` | `data:${streamId}`.
 */

export type SourceId = string;

export type SourceKind = 'world' | 'driver' | 'data';

export type FocusZone = 'tiles' | 'rail' | 'none';

export interface MultiviewState {
  /** Total concurrent streams allowed (>= 1). */
  budget: number;
  /** The big picture. */
  main: SourceId;
  /** 0..2 onboard tiles, oldest first. */
  docked: SourceId[];
  /** Exactly one audio source; always `main` or a member of `docked`. */
  audio: SourceId;
  railOpen: boolean;
  /** Budget-1 mode: main is being switched and we are waiting for the slot. */
  pendingSwitch: SourceId | null;
  toast: string | null;
}

export type MultiviewAction =
  | { type: 'SELECT_SOURCE'; id: SourceId }
  | { type: 'REPLACE_OLDEST'; id: SourceId }
  | { type: 'MAKE_MAIN'; id: SourceId }
  | { type: 'REMOVE'; id: SourceId }
  | { type: 'SET_AUDIO'; id: SourceId }
  | { type: 'CYCLE_AUDIO' }
  | { type: 'OPEN_RAIL' }
  | { type: 'CLOSE_RAIL' }
  | { type: 'TOGGLE_RAIL' }
  | { type: 'SET_BUDGET'; budget: number }
  | { type: 'SWITCH_DONE' }
  | { type: 'CLEAR_TOAST' };

export interface ParsedSourceId {
  kind: SourceKind;
  key: string;
}

const KINDS: readonly SourceKind[] = ['world', 'driver', 'data'];

function isSourceKind(value: string): value is SourceKind {
  return (KINDS as readonly string[]).includes(value);
}

/** Build a `SourceId` from its parts, e.g. `makeSourceId('driver', 'VER')` → `driver:VER`. */
export function makeSourceId(kind: SourceKind, key: string | number): SourceId {
  return `${kind}:${String(key)}`;
}

/**
 * Split a `SourceId` into `{ kind, key }`. Unknown prefixes (or ids with no prefix) are
 * reported as `kind: 'data'` with the full id as key so callers never throw on user data.
 */
export function parseSourceId(id: SourceId): ParsedSourceId {
  const colon = id.indexOf(':');
  if (colon <= 0) {
    return { kind: 'data', key: id };
  }
  const prefix = id.slice(0, colon);
  const key = id.slice(colon + 1);
  if (isSourceKind(prefix)) {
    return { kind: prefix, key };
  }
  return { kind: 'data', key: id };
}

/** All sources currently on screen, in audio-cycle order: `[main, ...docked]`. */
export function activeSources(state: Pick<MultiviewState, 'main' | 'docked'>): SourceId[] {
  return [state.main, ...state.docked];
}

// Reducer helpers live in ./reducer (type-only import there, so no runtime cycle).
export { createInitialState, reduce, maxDocked } from './reducer';
