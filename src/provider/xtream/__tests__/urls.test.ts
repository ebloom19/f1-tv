import { buildPlayerApiUrl, buildStreamUrl, normalizeBaseUrl, originOf, parseM3uPlusLine } from '../urls.ts';

const creds = { baseUrl: 'panel.example.com', username: 'us er', password: 'p&ss' };

describe('normalizeBaseUrl', () => {
  test.each([
    ['host', 'http://host'],
    ['http://host', 'http://host'],
    ['http://host:80/', 'http://host'],
    ['http://host:80/player_api.php?x=1', 'http://host'],
    ['https://host:443/', 'https://host'],
    ['https://host:25460/some/path', 'https://host:25460'],
    ['  HTTP://Host.Example.COM/  ', 'http://host.example.com'],
    ['host:8080/get.php', 'http://host:8080'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });
});

describe('originOf', () => {
  test('returns scheme://host[:port]', () => {
    expect(originOf('http://10005055.t04m.cc/live/U/P/6844.m3u8?token=x')).toBe('http://10005055.t04m.cc');
    expect(originOf('https://a.b:8443/x')).toBe('https://a.b:8443');
    expect(originOf('/relative')).toBe('');
  });
});

describe('buildPlayerApiUrl', () => {
  test('auth only', () => {
    expect(buildPlayerApiUrl(creds)).toBe('http://panel.example.com/player_api.php?username=us%20er&password=p%26ss');
  });
  test('action + params (undefined/empty dropped)', () => {
    expect(buildPlayerApiUrl(creds, 'get_live_streams', { category_id: '430', foo: undefined, bar: '' })).toBe(
      'http://panel.example.com/player_api.php?username=us%20er&password=p%26ss&action=get_live_streams&category_id=430',
    );
  });
});

describe('buildStreamUrl', () => {
  test('defaults to m3u8', () => {
    expect(buildStreamUrl(creds, 6844)).toBe('http://panel.example.com/live/us%20er/p%26ss/6844.m3u8');
  });
  test('ts format', () => {
    expect(buildStreamUrl(creds, 6844, 'ts')).toBe('http://panel.example.com/live/us%20er/p%26ss/6844.ts');
  });
});

describe('parseM3uPlusLine', () => {
  test('parses attributes, name and stream id', () => {
    const e = parseM3uPlusLine(
      '#EXTINF:-1 tvg-id="" tvg-name="PPV| F1-TV" tvg-logo="https://lo1.in/uk/f1.png" group-title="VIP | F1 and MotoGP",PPV| F1-TV',
      'http://panel.example.com/live/U/P/6862.m3u8',
    );
    expect(e).toEqual({
      name: 'PPV| F1-TV',
      url: 'http://panel.example.com/live/U/P/6862.m3u8',
      tvgId: '',
      tvgName: 'PPV| F1-TV',
      tvgLogo: 'https://lo1.in/uk/f1.png',
      groupTitle: 'VIP | F1 and MotoGP',
      streamId: 6862,
      duration: -1,
    });
  });
  test('non-xtream url has no stream id', () => {
    expect(parseM3uPlusLine('#EXTINF:10,Foo', 'http://x/y.ts').streamId).toBeNull();
  });
});
