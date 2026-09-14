import { buildCatalogue, findChannel, findDriver } from '../build.ts';
import { classifyStream } from '../classify.ts';
import type { XtreamLiveCategory, XtreamLiveStream } from '../../provider/xtream/types.ts';
import streamsFixture from '../../../__tests__/fixtures/xtream-live-streams.f1.json';
import categoriesFixture from '../../../__tests__/fixtures/xtream-live-categories.json';

const streams = streamsFixture as XtreamLiveStream[];
const categories = categoriesFixture as XtreamLiveCategory[];

describe('buildCatalogue (real provider fixture)', () => {
  const cat = buildCatalogue(streams, categories);
  const allIds = (): Set<number> => {
    const ids = new Set<number>();
    cat.worldFeeds.forEach(c => ids.add(c.streamId));
    cat.drivers.forEach(d => {
      ids.add(d.primary.streamId);
      d.alternates.forEach(a => ids.add(a.streamId));
    });
    return ids;
  };

  test('exactly 20 drivers, every team resolved', () => {
    expect(cat.drivers).toHaveLength(20);
    for (const d of cat.drivers) {
      expect(d.teamId).not.toBe('unknown');
      expect(d.primary.kind).toBe('onboard');
      expect(d.primary.driver?.abbr).toBe(d.abbr);
    }
    expect(new Set(cat.drivers.map(d => d.abbr)).size).toBe(20);
  });

  test('VER → Red Bull Racing / redbull / #3671C6', () => {
    const ver = findDriver(cat, 'ver');
    expect(ver).toMatchObject({
      abbr: 'VER',
      fullName: 'Max Verstappen',
      lastName: 'Verstappen',
      team: 'Red Bull Racing',
      teamId: 'redbull',
      color: '#3671C6',
    });
    expect(ver?.primary.streamId).toBe(6844);
  });

  test('NOR: PPV primary 6849 with UK alternate 1108', () => {
    const nor = findDriver(cat, 'NOR')!;
    expect(nor.primary.streamId).toBe(6849);
    expect(nor.primary.source).toBe('PPV');
    expect(nor.alternates.map(a => a.streamId)).toEqual([1108]);
    expect(nor.alternates[0].source).toBe('UK');
  });

  test('drivers ordered by championship team order then abbr', () => {
    expect(cat.drivers.slice(0, 4).map(d => d.abbr)).toEqual(['NOR', 'PIA', 'HAM', 'LEC']);
    expect(cat.drivers[cat.drivers.length - 1].teamId).toBe('alpine');
    const teamIds = cat.drivers.map(d => d.teamId);
    // Team blocks must be contiguous.
    const seen: string[] = [];
    for (const t of teamIds) {
      if (seen[seen.length - 1] !== t) {
        expect(seen).not.toContain(t);
        seen.push(t);
      }
    }
  });

  test('default world feed is an Apple-playable H.264 feed (F1-INTERNATIONAL UK 7929)', () => {
    // HEVC-in-TS feeds (F1-TV, UHD) are demoted so the default renders on Apple TV, not just Android.
    expect(cat.defaultWorldFeed?.streamId).toBe(7929);
    expect(cat.defaultWorldFeed?.rank).toBe(2);
    expect(cat.worldFeeds[0].streamId).toBe(7929);
    expect(cat.defaultWorldFeed?.appleVideoUnsupported).toBeFalsy();
  });

  test('world feed ranking prefers Apple-playable H.264 feeds; HEVC-in-TS feeds sink to the back', () => {
    const order = cat.worldFeeds.map(c => c.streamId);
    const pos = (id: number): number => order.indexOf(id);
    const flagged = (id: number) => cat.worldFeeds.find(c => c.streamId === id)?.appleVideoUnsupported;
    // H.264 feeds first, English international ahead of the Sky quality ladder.
    expect(pos(7929)).toBe(0);
    expect(pos(34209)).toBeLessThan(pos(102172));
    expect(pos(102172)).toBeLessThan(pos(1084875));
    expect(pos(1084875)).toBeLessThan(pos(29024));
    expect(pos(29024)).toBeLessThan(pos(29025));
    // HEVC-in-TS feeds are flagged and ranked behind every H.264 feed.
    for (const hevc of [6862, 1223445, 1222387]) {
      expect(flagged(hevc)).toBe(true);
      expect(pos(hevc)).toBeGreaterThan(pos(29025));
    }
    // H.264 feeds are not flagged.
    for (const h264 of [7929, 34209, 102172, 1084875, 29024, 29025]) {
      expect(flagged(h264)).toBeFalsy();
    }
  });

  test('Sky Sports F1 FHD (34209) is a world feed with quality FHD and source SKY', () => {
    const sky = cat.worldFeeds.find(c => c.streamId === 34209);
    expect(sky).toMatchObject({ kind: 'world', quality: 'FHD', source: 'SKY', language: 'EN' });
  });

  test('languages on international feeds', () => {
    expect(cat.worldFeeds.find(c => c.streamId === 7929)?.language).toBe('EN');
    expect(cat.worldFeeds.find(c => c.streamId === 7930)?.language).toBe('ES');
    expect(cat.worldFeeds.find(c => c.streamId === 7931)?.language).toBe('FR');
    expect(cat.worldFeeds.find(c => c.streamId === 7932)?.language).toBe('DE');
  });

  test('DE| cams, APPLE TV nn and MotoGP never reach drivers/worldFeeds', () => {
    const ids = allIds();
    const raw = (id: number): string => streams.find(s => s.stream_id === id)!.name;
    for (const s of streams) {
      if (/^DE\|/.test(s.name) || /APPLE TV F1/.test(s.name) || /MotoGP/i.test(s.name)) {
        expect(ids.has(s.stream_id)).toBe(false);
      }
    }
    expect(raw(1048317)).toMatch(/^DE\|/);
    expect(raw(1366794)).toMatch(/APPLE TV F1/);
  });

  test('DE| legacy, APPLE TV, [BK], TEMPORERY are hidden; MotoGP/TT/football/account are dropped entirely', () => {
    const hiddenIds = new Set(cat.hidden.map(c => c.streamId));
    expect(hiddenIds.has(1048317)).toBe(true); // DE| VER VERSTAPPEN (CAM)
    expect(hiddenIds.has(1366794)).toBe(true); // PPV| APPLE TV F1 01
    expect(hiddenIds.has(883275)).toBe(true); // UK| SKY SPORTS F1 [BK]
    expect(hiddenIds.has(6860)).toBe(true); // PPV| F1-TV TEMPORERY
    expect(hiddenIds.has(1119)).toBe(true); // UK| F1-TV TEMPORERY
    const everything = new Set([...allIds(), ...hiddenIds, ...cat.data.map(c => c.streamId)]);
    expect(everything.has(1049)).toBe(false); // MotoGP: Main Race
    expect(everything.has(19136)).toBe(false); // TT RACES 01
    expect(everything.has(1474191)).toBe(false); // Account Information
    expect(everything.has(22669)).toBe(false); // EPL : ARSENAL
    expect(everything.has(6864)).toBe(false); // ✦●✦ F1-EVENT ✦●✦ separator
    expect(cat.hidden.length).toBeGreaterThan(50);
  });

  test('data + tracker channels come from PPV; UK mirrors are hidden', () => {
    expect(cat.data.map(c => [c.kind, c.streamId])).toEqual([
      ['data', 6861],
      ['tracker', 6859],
    ]);
    const hiddenIds = new Set(cat.hidden.map(c => c.streamId));
    expect(hiddenIds.has(1120)).toBe(true); // UK| F1-DATA
    expect(hiddenIds.has(1118)).toBe(true); // UK| F1 F1-TRACKER
  });

  test('stream ids are unique across the catalogue and findChannel works', () => {
    const ids = [...allIds(), ...cat.data.map(c => c.streamId), ...cat.hidden.map(c => c.streamId)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(findChannel(cat, 6844)?.driver?.abbr).toBe('VER');
    expect(findChannel(cat, 1108)?.source).toBe('UK');
    expect(findChannel(cat, 34209)?.label).toBe('Sky Sports F1 FHD');
    expect(findChannel(cat, 999999999)).toBeUndefined();
  });

  test('fetchedAt is set and an empty input yields an empty catalogue', () => {
    expect(cat.fetchedAt).toBeGreaterThan(0);
    const empty = buildCatalogue([], []);
    expect(empty).toMatchObject({ worldFeeds: [], defaultWorldFeed: null, drivers: [], data: [], hidden: [] });
  });
});

describe('classifyStream', () => {
  const stream = (name: string, id = 1, category_id = '430'): XtreamLiveStream => ({
    num: 1,
    name,
    stream_type: 'live',
    stream_id: id,
    stream_icon: '',
    epg_channel_id: null,
    added: '0',
    category_id,
    custom_sid: '',
    tv_archive: 0,
    direct_source: '',
    tv_archive_duration: 0,
  });
  test('onboard label and driver ref', () => {
    const ch = classifyStream(stream('PPV| F1 Max Verstappen | Red Bull Racing | VER', 6844));
    expect(ch).toMatchObject({ kind: 'onboard', source: 'PPV', label: 'VER · Verstappen', categoryId: '430' });
    expect(ch?.driver).toMatchObject({ abbr: 'VER', teamId: 'redbull', color: '#3671C6' });
  });
  test('non-F1 is dropped, separators are dropped', () => {
    expect(classifyStream(stream('PPV| MotoGP: Main Race'))).toBeNull();
    expect(classifyStream(stream('✦●✦ F1-EVENT ✦●✦'))).toBeNull();
    expect(classifyStream(stream('UK| LIVE FOOTBALL 02 [EVENT ONLY]'))).toBeNull();
  });
  test('DE| anything F1 is hidden', () => {
    expect(classifyStream(stream('DE| F1TV PRO HD (EN)'))?.kind).toBe('hidden');
  });
  test('tracker vs data', () => {
    expect(classifyStream(stream('UK| F1 F1-TRACKER'))?.kind).toBe('tracker');
    expect(classifyStream(stream('PPV| F1-DATA'))?.kind).toBe('data');
  });
});
