import type { TeamId } from './types.ts';

/** Championship order used to sort drivers (SPEC). */
export const TEAM_ORDER: readonly TeamId[] = [
  'mclaren',
  'ferrari',
  'redbull',
  'mercedes',
  'williams',
  'racingbulls',
  'astonmartin',
  'haas',
  'sauber',
  'alpine',
  'cadillac',
];

export const TEAM_COLORS: Record<TeamId, string> = {
  mclaren: '#FF8000',
  ferrari: '#E80020',
  redbull: '#3671C6',
  mercedes: '#27F4D2',
  astonmartin: '#229971',
  alpine: '#0093CC',
  williams: '#64C4FF',
  racingbulls: '#6692FF',
  haas: '#B6BABD',
  sauber: '#52E252',
  cadillac: '#B0B0B0',
  unknown: '#8A93A6',
};

export const TEAM_NAMES: Record<TeamId, string> = {
  mclaren: 'McLaren',
  ferrari: 'Ferrari',
  redbull: 'Red Bull Racing',
  mercedes: 'Mercedes',
  astonmartin: 'Aston Martin',
  alpine: 'Alpine',
  williams: 'Williams',
  racingbulls: 'Racing Bulls',
  haas: 'Haas',
  sauber: 'Sauber',
  cadillac: 'Cadillac',
  unknown: 'Unknown',
};

/**
 * Case-insensitive substring match of the team string from a channel name.
 * "racing bulls" is tested before "red bull" so neither can shadow the other.
 */
export function matchTeamId(team: string): TeamId {
  const t = (team ?? '').toLowerCase();
  if (!t) {
    return 'unknown';
  }
  if (t.includes('mclaren')) {
    return 'mclaren';
  }
  if (t.includes('ferrari')) {
    return 'ferrari';
  }
  if (t.includes('racing bulls') || /\brb\b/.test(t) || t.includes('visa cash app')) {
    return 'racingbulls';
  }
  if (t.includes('red bull')) {
    return 'redbull';
  }
  if (t.includes('mercedes')) {
    return 'mercedes';
  }
  if (t.includes('aston')) {
    return 'astonmartin';
  }
  if (t.includes('alpine')) {
    return 'alpine';
  }
  if (t.includes('williams')) {
    return 'williams';
  }
  if (t.includes('haas')) {
    return 'haas';
  }
  if (t.includes('sauber') || t.includes('audi')) {
    return 'sauber';
  }
  if (t.includes('cadillac')) {
    return 'cadillac';
  }
  return 'unknown';
}

export function teamColor(teamId: TeamId): string {
  return TEAM_COLORS[teamId] ?? TEAM_COLORS.unknown;
}

/** Position in championship order; unknown teams sort last. */
export function teamOrderIndex(teamId: TeamId): number {
  const i = TEAM_ORDER.indexOf(teamId);
  return i === -1 ? TEAM_ORDER.length : i;
}
