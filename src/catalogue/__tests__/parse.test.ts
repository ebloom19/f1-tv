import { isF1Name, isSeparatorName, lastNameOf, parseDriverName, parseLanguage, parseQuality, stripSourcePrefix } from '../parse.ts';
import { matchTeamId, TEAM_ORDER, teamColor, teamOrderIndex } from '../teams.ts';

describe('stripSourcePrefix', () => {
  test.each([
    ['PPV| F1-TV', 'PPV', 'F1-TV'],
    ['UK| SKY SPORTS F1 FHD', 'UK', 'SKY SPORTS F1 FHD'],
    ['DE| VER VERSTAPPEN | RED BULL (CAM)', 'DE', 'VER VERSTAPPEN | RED BULL (CAM)'],
    ['Account Information', 'OTHER', 'Account Information'],
  ])('%s', (raw, source, name) => {
    expect(stripSourcePrefix(raw)).toEqual({ source, name });
  });
});

describe('parseDriverName', () => {
  test('matches the stable onboard pattern with or without prefix', () => {
    expect(parseDriverName('PPV| F1 Max Verstappen | Red Bull Racing | VER')).toEqual({
      fullName: 'Max Verstappen',
      team: 'Red Bull Racing',
      abbr: 'VER',
    });
    expect(parseDriverName('F1 Andrea Kimi Antonelli | Mercedes | ANT')).toEqual({
      fullName: 'Andrea Kimi Antonelli',
      team: 'Mercedes',
      abbr: 'ANT',
    });
    expect(parseDriverName('UK| F1 Oliver Bearman | Haas F1 Team | BEA')?.team).toBe('Haas F1 Team');
  });
  test('rejects everything else', () => {
    expect(parseDriverName('PPV| F1-TV')).toBeNull();
    expect(parseDriverName('UK| F1 F1-TRACKER')).toBeNull();
    expect(parseDriverName('DE| VER VERSTAPPEN | RED BULL (CAM)')).toBeNull();
    expect(parseDriverName('PPV| APPLE TV F1 01 [EVENT ONLY]')).toBeNull();
    expect(parseDriverName('')).toBeNull();
  });
});

describe('helpers', () => {
  test('lastNameOf', () => {
    expect(lastNameOf('Andrea Kimi Antonelli')).toBe('Antonelli');
    expect(lastNameOf('')).toBe('');
  });
  test('parseQuality', () => {
    expect(parseQuality('SKY SPORTS F1 FHD')).toBe('FHD');
    expect(parseQuality('SKY SPORTS F1 HEVC')).toBe('HEVC');
    expect(parseQuality('SKY SPORTS F1 50 FPS')).toBe('50FPS');
    expect(parseQuality('SKY SPORTS F1 HD')).toBe('HD');
    expect(parseQuality('SKY SPORTS F1 SD')).toBe('SD');
    expect(parseQuality('SKY SPORTS F1 UHD')).toBe('UHD');
    expect(parseQuality('FORMULA 1 UHD')).toBe('UHD');
    expect(parseQuality('F1-TV')).toBe('UNKNOWN');
  });
  test('parseLanguage', () => {
    expect(parseLanguage('F1-INTERNATIONAL UK')).toBe('EN');
    expect(parseLanguage('F1-INTERNATIONAL ES')).toBe('ES');
    expect(parseLanguage('F1-INTERNATIONAL FR')).toBe('FR');
    expect(parseLanguage('F1-INTERNATIONAL DE')).toBe('DE');
    expect(parseLanguage('F1-TV')).toBeUndefined();
  });
  test('isSeparatorName / isF1Name', () => {
    expect(isSeparatorName('✦●✦ F1-EVENT ✦●✦')).toBe(true);
    expect(isSeparatorName('PPV| F1-TV')).toBe(false);
    expect(isF1Name('SKY SPORTS F1 FHD')).toBe(true);
    expect(isF1Name('FORMULA 1 UHD')).toBe(true);
    expect(isF1Name('MotoGP: Main Race')).toBe(false);
    expect(isF1Name('TT RACES 01')).toBe(false);
  });
});

describe('teams', () => {
  test('matchTeamId by substring', () => {
    expect(matchTeamId('McLaren')).toBe('mclaren');
    expect(matchTeamId('Ferrari')).toBe('ferrari');
    expect(matchTeamId('Red Bull Racing')).toBe('redbull');
    expect(matchTeamId('Racing Bulls')).toBe('racingbulls');
    expect(matchTeamId('Visa Cash App RB')).toBe('racingbulls');
    expect(matchTeamId('Mercedes')).toBe('mercedes');
    expect(matchTeamId('Aston Martin')).toBe('astonmartin');
    expect(matchTeamId('Alpine')).toBe('alpine');
    expect(matchTeamId('Williams')).toBe('williams');
    expect(matchTeamId('Haas F1 Team')).toBe('haas');
    expect(matchTeamId('Kick Sauber')).toBe('sauber');
    expect(matchTeamId('Audi')).toBe('sauber');
    expect(matchTeamId('Cadillac')).toBe('cadillac');
    expect(matchTeamId('Lotus')).toBe('unknown');
  });
  test('colours and championship order', () => {
    expect(teamColor('redbull')).toBe('#3671C6');
    expect(teamColor('mclaren')).toBe('#FF8000');
    expect(teamColor('unknown')).toBe('#8A93A6');
    expect(TEAM_ORDER).toEqual([
      'mclaren', 'ferrari', 'redbull', 'mercedes', 'williams', 'racingbulls', 'astonmartin', 'haas', 'sauber', 'alpine', 'cadillac',
    ]);
    expect(teamOrderIndex('mclaren')).toBe(0);
    expect(teamOrderIndex('unknown')).toBe(TEAM_ORDER.length);
  });
});
