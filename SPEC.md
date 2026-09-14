# Pitwall — engineering spec (shared brief for all contributors)

Personal Formula 1 multiview app for Apple TV (tvOS) and Google TV (Android TV), built with
`react-native-tvos` 0.83 (TypeScript) and `react-native-video` 6. Streams come from the user's
Xtream Codes IPTV line. Development-only, own devices. Repo root is the RN project root.

## Hard facts learned from the real provider (2026-09-13)

- Auth: `GET {baseUrl}/player_api.php?username=U&password=P` → `{user_info, server_info}`.
  `user_info.max_connections` is a **string** (`"1"`), `allowed_output_formats` is `["m3u8","ts"]`.
- Categories: `&action=get_live_categories` → `[{category_id:"430", category_name:"VIP | F1 and MotoGP", parent_id:0}]`.
- Streams: `&action=get_live_streams` (optionally `&category_id=430`) → objects with keys
  `num,name,stream_type,stream_id,stream_icon,epg_channel_id,added,category_id,custom_sid,tv_archive,direct_source,tv_archive_duration`.
  `epg_channel_id` is always null for F1; there is no EPG.
- Playback URL: `{baseUrl}/live/{U}/{P}/{stream_id}.m3u8` → HTTP 302 to a tokenised edge host
  (`http://10005055.t04m.cc/live/U/P/6844.m3u8?token=…`), HLS v3, ~10 s TS segments with
  **relative** URIs (`/hlsr/<token>/U/P/6844/<hash>/6844_0.ts`). `.ts` also works (302 → continuous MPEG-TS).
  Re-probed 2026-09-14: `.ts` answered 401 twice with `active_cons=0`, and the panel's edge (Envoy) returned
  503 "upstream connect error" for a few minutes, so treat `.ts` as best-effort; the VLC player only tries it
  as the alternate on a start-watchdog retry.
- **`max_connections` = 1 and it is enforced.** A second concurrent stream gets HTTP 401 (panel) or 403
  (edge). An offline channel returns HTTP 200 with an empty `text/html` body (not a playlist).
  Measured slot accounting (6+ experiments, 2026-09-13):
  - the panel registers a session asynchronously, 2–15 s after segment traffic starts;
  - after a paced player stops (playlist + one segment per target duration, like AVPlayer/ExoPlayer) the slot is
    free again within 0–5 s; after a continuous `.ts` socket is closed, within ~1 s;
  - after a *burst* (re-downloading segments at full bandwidth for 15 s+) the hold stretches to 25–60 s;
  - re-requests of the *same* stream never count as a second connection; the edge ignores `Range`.
  - **A rejected (401) request for stream B made while stream A is still live registers a phantom session**
    that the panel clears only on its own timer (measured 76–322 s). The app must never do this: in
    single-connection mode `WatchScreen` fully unmounts the old player (releasing its lease, stopping all
    requests) *before* mounting the new one, so the slot is genuinely idle (frees in 0–5 s) at switch time.
  The player retries SLOT_BUSY for up to 30 s (`timing.slotRetryMax` × 1.5 s), which covers the idle-switch case.
- The panel returns **503 to curl's default User-Agent**; every player UA works. Always send an explicit
  `User-Agent` on API calls and on the video source headers. Use `Pitwall/1.0 (AppleTV; tvOS)` / `(AndroidTV)`.
- F1 content: category 430 `VIP | F1 and MotoGP` (names prefixed `PPV| `) is the working set. Category 120
  `EU | UK LIVE EVENTS-PPV` mirrors the same names prefixed `UK| ` (some dead → fallback only). Sky Sports F1
  channels live in 119 `EU | UK SPORT` and 121 `EU | UK SPORT 50 FPS`. Legacy `DE| … (CAM)` channels (2023 lineup)
  and `PPV| APPLE TV F1 nn [EVENT ONLY]` are dead/noise → `hidden`.
- Driver channel name pattern (stable): `PPV| F1 {Full Name} | {Team} | {ABBR}` e.g.
  `PPV| F1 Max Verstappen | Red Bull Racing | VER`. 20 drivers in the current list.
- Fixtures captured from the real panel (credentials scrubbed) live in `__tests__/fixtures/`:
  `xtream-live-streams.f1.json`, `xtream-live-categories.json`, `xtream-auth.json`, `playlist-6844.m3u8`.

## Project conventions

- TypeScript strict. No new runtime deps beyond `react-native-video` and `react-native-safe-area-context`
  without asking. No navigation library: `App.tsx` switches screens via state (`connect | hub | watch`).
- Tests: Jest (`preset: 'react-native'`), `@testing-library/react-native` 13 for screens,
  `react-native-video` mocked in `jest/setup.ts` (mock module exports a `Video` component that renders a
  `View` with `testID="video"` and calls `onLoad` on mount unless a prop `__simulateError` is passed).
- Pure modules (`src/provider`, `src/catalogue`, `src/multiview`) must not import from `react-native`.
- File layout:

```
src/
  config/env.ts               reads credentials (generated file + in-app override)
  config/env.example.ts       template committed; env.generated.ts is git-ignored (scripts/gen-env.js writes it)
  provider/xtream/            types.ts client.ts urls.ts errors.ts playlist.ts index.ts
  provider/pool.ts            ConnectionPool (slot leasing across accounts)
  catalogue/                  types.ts teams.ts parse.ts classify.ts rank.ts build.ts index.ts
  multiview/                  types.ts reducer.ts layouts.ts regions.ts index.ts
  player/StreamPlayer.tsx     react-native-video wrapper with slot lease + SLOT_BUSY retry
  screens/ConnectScreen.tsx  SessionHubScreen.tsx  WatchScreen.tsx
  ui/                         DriverChip.tsx OnboardTile.tsx Rail.tsx FocusButton.tsx Toast.tsx theme.ts
  __tests__ live next to code in `__tests__/` folders or `*.test.ts(x)` files.
scripts/gen-env.js            writes src/config/env.generated.ts from XTREAM_DNS1/XTREAM_USERNAME/XTREAM_PASSWORD/M3U
scripts/xtream-probe.ts       CLI: real connection report (ts-node not available → compile with tsx? use `node --experimental-strip-types` on Node 22)
__tests__/integration/        real-provider tests, skipped unless XTREAM_USERNAME is set
```

## Interfaces (pinned — other modules code against these)

### `src/provider/xtream/types.ts`
```ts
export interface XtreamCredentials { baseUrl: string; username: string; password: string; label?: string }
export interface XtreamUserInfo { auth: number; status: string; exp_date: string | null; is_trial: string;
  active_cons: string; created_at: string; max_connections: string; allowed_output_formats: string[]; message?: string }
export interface XtreamServerInfo { url: string; port: string; https_port: string; server_protocol: string;
  rtmp_port?: string; timezone: string; timestamp_now: number; time_now: string }
export interface XtreamAuthResponse { user_info: XtreamUserInfo; server_info: XtreamServerInfo }
export interface XtreamLiveCategory { category_id: string; category_name: string; parent_id: number }
export interface XtreamLiveStream { num: number; name: string; stream_type: string; stream_id: number; stream_icon: string;
  epg_channel_id: string | null; added: string; category_id: string; custom_sid: string; tv_archive: number;
  direct_source: string; tv_archive_duration: number }
export interface XtreamAccount { credentials: XtreamCredentials; userInfo: XtreamUserInfo; serverInfo: XtreamServerInfo;
  maxConnections: number; expiresAt: Date | null }
export type StreamFormat = 'm3u8' | 'ts';
export type PlaylistProbe =
  | { status: 'ok'; segments: number; targetDuration: number; edgeUrl: string; firstSegmentUrl: string }
  | { status: 'slot_busy'; httpStatus: number }
  | { status: 'offline'; httpStatus: number }
  | { status: 'error'; httpStatus?: number; message: string };
```

### `src/provider/xtream/errors.ts`
```ts
export type XtreamErrorCode = 'AUTH_FAILED' | 'NETWORK' | 'BLOCKED' | 'SLOT_BUSY' | 'OFFLINE' | 'HTTP' | 'PARSE';
export class XtreamError extends Error { code: XtreamErrorCode; httpStatus?: number; constructor(code, message, httpStatus?) }
```

### `src/provider/xtream/client.ts`
```ts
export interface XtreamClientOptions { fetch?: typeof fetch; userAgent?: string; timeoutMs?: number }
export class XtreamClient {
  constructor(creds: XtreamCredentials, opts?: XtreamClientOptions)
  authenticate(): Promise<XtreamAccount>              // throws XtreamError('AUTH_FAILED') when user_info.auth !== 1
  getLiveCategories(): Promise<XtreamLiveCategory[]>
  getLiveStreams(categoryId?: string): Promise<XtreamLiveStream[]>
  streamUrl(streamId: number, format?: StreamFormat): string     // default 'm3u8'
  streamHeaders(): Record<string, string>                        // { 'User-Agent': … }
  probePlaylist(streamId: number): Promise<PlaylistProbe>        // follows redirect, classifies per facts above
}
export function classifyPlaylistResponse(httpStatus: number, contentType: string, body: string, finalUrl: string): PlaylistProbe
export function withSlotRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; delayMs?: number; onRetry?: (n) => void }): Promise<T>
  // retries only XtreamError code SLOT_BUSY; defaults attempts 8, delayMs 1500 (≈12 s total)
```
`src/provider/xtream/urls.ts`: `normalizeBaseUrl(input)` (accepts `host`, `http://host`, `http://host:80/`, trailing paths stripped),
`buildPlayerApiUrl(creds, action?, params?)`, `buildStreamUrl(creds, id, format)`, `parseM3uPlusLine(extinf, url)` (bonus: M3U interop).
`src/provider/xtream/playlist.ts`: `parseHls(body): { segments: string[]; targetDuration: number; mediaSequence: number }`, `resolveSegmentUrl(edgeUrl, relative)`.

### `src/provider/pool.ts`
```ts
export interface SlotLease { accountIndex: number; release(): void }
export class ConnectionPool {
  constructor(accounts: XtreamAccount[])
  get budget(): number                     // Σ maxConnections
  get inUse(): number
  acquire(): SlotLease | null              // null when budget exhausted
  clientFor(lease: SlotLease): XtreamClient
}
```

### `src/catalogue/types.ts`
```ts
export type ChannelKind = 'world' | 'onboard' | 'data' | 'tracker' | 'hidden';
export type SourceTag = 'PPV' | 'UK' | 'DE' | 'SKY' | 'OTHER';
export type Quality = 'SD' | 'HD' | 'FHD' | 'UHD' | 'HEVC' | '50FPS' | 'UNKNOWN';
export type TeamId = 'mclaren' | 'ferrari' | 'redbull' | 'mercedes' | 'astonmartin' | 'alpine' | 'williams' | 'racingbulls' | 'haas' | 'sauber' | 'cadillac' | 'unknown';
export interface DriverRef { abbr: string; fullName: string; lastName: string; team: string; teamId: TeamId; color: string }
export interface F1Channel { kind: ChannelKind; streamId: number; rawName: string; label: string; source: SourceTag; quality: Quality;
  language?: 'EN' | 'ES' | 'FR' | 'DE' | 'IT'; categoryId: string; driver?: DriverRef; rank: number }
export interface DriverEntry extends DriverRef { primary: F1Channel; alternates: F1Channel[] }
export interface F1Catalogue { worldFeeds: F1Channel[]; defaultWorldFeed: F1Channel | null; drivers: DriverEntry[];
  data: F1Channel[]; hidden: F1Channel[]; fetchedAt: number }
```
`buildCatalogue(streams, categories): F1Catalogue` — drivers ordered by team (championship order constant in teams.ts:
mclaren, ferrari, redbull, mercedes, williams, racingbulls, astonmartin, haas, sauber, alpine, cadillac) then abbr.
Dedup: one `DriverEntry` per abbr; PPV primary, UK alternate, DE hidden. World feed ranking: `PPV| F1-TV` (rank 0) →
`PPV| FORMULA 1 UHD` → `PPV| F1-INTERNATIONAL UK` → Sky Sports F1 (FHD > HEVC > 50FPS > HD > SD; UHD last since it 401'd) → other languages.
`defaultWorldFeed` = rank 0. `parseDriverName(name)` returns `{fullName, team, abbr} | null`.
Team colours (`teams.ts`): mclaren #FF8000, ferrari #E80020, redbull #3671C6, mercedes #27F4D2, astonmartin #229971,
alpine #0093CC, williams #64C4FF, racingbulls #6692FF, haas #B6BABD, sauber #52E252, cadillac #B0B0B0, unknown #8A93A6.
Match team by case-insensitive substring: "mclaren", "ferrari", "red bull", "mercedes", "aston", "alpine", "williams", "racing bulls"/"rb ", "haas", "sauber"/"audi", "cadillac".

### `src/multiview/types.ts`
```ts
export type SourceId = string;   // `world:${streamId}` | `driver:${ABBR}` | `data:${streamId}`
export type FocusZone = 'tiles' | 'rail' | 'none';
export interface MultiviewState {
  budget: number;              // total concurrent streams allowed (≥1)
  main: SourceId;              // big picture
  docked: SourceId[];          // 0..2 onboard tiles, oldest first
  audio: SourceId;             // exactly one audio source, must be main or in docked
  railOpen: boolean;
  pendingSwitch: SourceId | null;   // budget-1 mode: switching main, waiting for slot
  toast: string | null;
}
export type MultiviewAction =
  | { type: 'SELECT_SOURCE'; id: SourceId }   // chip Select
  | { type: 'REPLACE_OLDEST'; id: SourceId }  // chip long-press
  | { type: 'MAKE_MAIN'; id: SourceId }       // tile Select (swap with main)
  | { type: 'REMOVE'; id: SourceId }
  | { type: 'SET_AUDIO'; id: SourceId }
  | { type: 'CYCLE_AUDIO' }                   // Play/Pause
  | { type: 'OPEN_RAIL' } | { type: 'CLOSE_RAIL' } | { type: 'TOGGLE_RAIL' }
  | { type: 'SET_BUDGET'; budget: number }    // drops docked beyond budget-1
  | { type: 'SWITCH_DONE' }                   // player reports new main playing
  | { type: 'CLEAR_TOAST' };
export function createInitialState(main: SourceId, budget: number): MultiviewState
export function reduce(state: MultiviewState, action: MultiviewAction): MultiviewState
export function maxDocked(budget: number): number   // min(2, max(0, budget-1))
```
Rules: SELECT_SOURCE on main → no-op toast. On docked id → MAKE_MAIN. Budget 1 → main=id, audio=id, pendingSwitch=id,
docked=[]. Budget ≥2 and room → push; no room → toast "Long-press to replace" (no change). MAKE_MAIN swaps positions
(the old main goes into the tile the new main occupied). REMOVE drops from docked; if it was audio → audio=main.
CYCLE_AUDIO cycles [main, ...docked]. All sources must remain distinct.

### `src/multiview/layouts.ts` + `regions.ts`
```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout { screen: Rect; main: Rect; tiles: Rect[]; emptySlots: { rect: Rect; locked: boolean }[]; rail: Rect | null; mode: 'solo' | 'duo' | 'trio' }
export function computeLayout(state: Pick<MultiviewState,'docked'|'railOpen'|'budget'>, screen: { width: number; height: number }, safe?: number): Layout
```
Canvas 1920×1080 (scale to any 16:9 screen; `safe` = safe-area inset px, default 0 for the video rects; the rail
and text use 48 px insets inside their bands). Solo: main = full screen when rail closed; when rail open main is
scaled to fit width inside the top 75% (letterboxed, centred). Duo/Trio: main = (0,0,1440,810), tiles at
(1440,0,480,270) and (1440,270,480,270), rail band (0,810,1920,270) always. Video rects keep exact 16:9.
`regions.ts`: `PROTECTED = { timingTower: {x:.024,y:.12,w:.135,h:.62}, lapBox: {x:.024,y:.04,w:.2,h:.07}, lowerThird: {x:.25,y:.86,w:.5,h:.09} }`
as fractions of the *main video rect*; `protectedRegions(mainRect): Rect[]`; `rectsOverlap(a,b)`. Layout tests assert
no tile/rail rect overlaps any protected region in any mode.

## UI / UX (WatchScreen)

- Screen zones: main video, right column tiles (occupied → `OnboardTile`, empty → "Add a driver" or
  "Needs connection N · your line allows B" locked), bottom band `Rail` (driver chips grouped by team colour, world
  feed chip first, data/tracker chips last, session hint text on the right).
- Focus: `TVFocusGuideView` around tiles and the rail. First focus goes to the rail's first chip. Chip focus scales 1.08
  with a white border. Tiles show a white border on focus.
- Remote (`useTVEventHandler`): `select` handled by Pressable `onPress`; `longSelect`/`onLongPress` on chip → REPLACE_OLDEST,
  on tile → contextual menu (Audio here / Remove / Make main) — a small overlay with three FocusButtons.
  `playPause` → CYCLE_AUDIO. `menu`/Back (`BackHandler`) → rail open ? CLOSE_RAIL : leave to hub (release all leases).
  Any d-pad event → OPEN_RAIL and restart a 6 s auto-hide timer (only auto-hide when a video is playing).
- Single-connection mode banner in the rail hint: "1 connection · Select switches the feed". On switch: main video
  shows "Switching to VER…" overlay while `StreamPlayer` retries SLOT_BUSY; `SWITCH_DONE` on first `onLoad`.
- `StreamPlayer` props: `{ uri: string; headers: Record<string,string>; muted: boolean; lease: SlotLease | null;
  onPlaying(): void; onSlotBusy(attempt: number): void; onFatal(message: string): void; testID?: string }`.
  On `onError` inspect `error.errorString/errorCode`; HTTP 401/403 → treat as slot busy → wait 1.5 s and remount the
  source (max 8 tries), otherwise `onFatal`.
- Theme (`ui/theme.ts`): bg #06080C, panel #131720, panel2 #1B2029, line #2A3040, ink #E8EAF0, ink2 #AEB5C4, ink3 #7C8493,
  accent #D40000, live #FF2D2D, ok #3DD68C, warn #F2B95F. Typography: system font, weights 900 for driver abbr.
- SessionHub: header "Pitwall" + account line (`{label} · {budget} connection(s) · expires {date}`), a "Watch" hero
  button for the default world feed, a row of alternative world feeds, a grid of 20 driver chips (Select → watch with
  that driver as main in budget-1 mode, or world main + driver docked when budget ≥2), a row of data screens, and
  a "Settings" button (ConnectScreen). Catalogue is loaded on mount with loading/error states.
- ConnectScreen: fields for server URL, username, password (TextInput works on tvOS/Android TV), "Test & save" button
  → `authenticate()` → shows max connections and expiry; "Add another line" appends to the pool (kept in memory +
  persisted with a tiny JSON store `src/config/store.ts` using `@react-native-async-storage/async-storage`? NO — avoid
  new native deps: keep in memory and pre-fill from `env.generated.ts`).

## Testing rules

- `npm test` must pass offline. Integration tests under `__tests__/integration/*.live.test.ts` use `describe.skip`
  unless `process.env.XTREAM_USERNAME` is set; they use Node's global fetch with the explicit User-Agent.
- Screen tests drive the app with `fireEvent.press`, `fireEvent(el, 'focus')`, `fireEvent(el, 'longPress')`, and by
  emitting TV remote events through the mocked `TVEventHandler` (see `jest/setup.ts`: it stores listeners in
  `global.__tvListeners` and exposes `global.emitTVEvent({eventType:'playPause'})`).
- Never write real credentials into any file under version control.
