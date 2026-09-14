# Pitwall

Personal Formula 1 multiview for Apple TV and Google TV, fed by your own Xtream Codes IPTV line.
The world feed stays full-size and untouched; driver onboards dock beside it and never cover the
timing tower or the lower-third graphics. Built with `react-native-tvos` and `react-native-video`.

Development-only. Runs in developer mode on your own devices; nothing here is meant for a store.

## What it does

- Reads your Xtream line, finds the F1 channels (world feeds, 20 driver onboards, data and tracker
  screens) and hides the dead legacy ones.
- **Solo**: world feed or any onboard full-screen. The driver rail slides in on Select and the
  video scales up above it instead of being covered.
- **Duo / Trio**: world feed at 1440×810 with one or two onboards docked in the right column,
  one audio source at a time, Select on a tile swaps it with the main picture.
- **Connection budget**: your line reports `max_connections`. With 1 (the line probed while
  building this) the app runs a single decoder with instant driver switching; Duo and Trio unlock
  automatically once the pool has 2 or 3 connections (a second line added in Settings, or an
  upgraded plan). The server enforces the limit hard, so the app leases a slot per player and
  never tries to exceed the budget.

See `SPEC.md` for the provider findings and module interfaces.

## Setup

```bash
npm install --legacy-peer-deps
# Put your Xtream line in a git-ignored .env at the repo root:
cat > .env <<'ENV'
XTREAM_DNS1=http://your-panel-host      # or https://host:port
XTREAM_USERNAME=your-username
XTREAM_PASSWORD=your-password
M3U=http://your-panel-host/get.php?username=...&password=...&type=m3u_plus&output=mpegts
ENV
npm run gen-env                                # writes src/config/env.generated.ts (git-ignored)
```

`gen-env` reads the root `.env` (and `.env.local`); real shell environment variables of the
same names take precedence. It runs automatically before `npm start` and `npm test`. If no
credentials are found, the app opens on the Connect screen where you can type the line in.
After editing `.env`, re-run `npm run gen-env` and reload the app (press R in the simulator, or
restart Metro with `npm start --reset-cache`) so the new bundle picks it up.

## Run on Apple TV

```bash
cd ios && pod install && cd ..
npx react-native run-ios --simulator "Apple TV"          # simulator
npx react-native run-ios --device "Living Room"           # a paired Apple TV in Xcode
```

Plain-HTTP loads are allowed in `Info.plist` because Xtream panels and their edge hosts serve HTTP.

## Run on Google TV / Android TV

```bash
npx react-native run-android --device <tv_serial>        # adb connect <tv-ip>:5555 first
```

Debug builds allow cleartext traffic; the Leanback launcher intent and TV banner are configured.

## Remote

| Input | On a driver chip | On a tile | Anywhere |
|---|---|---|---|
| D-pad | move along the rail | move between tiles / down to the rail | wakes the rail (auto-hides after 6 s) |
| Select | budget ≥ 2: dock in the next free slot · budget 1: switch the picture | make this the main picture | |
| Long press | replace the oldest onboard | Audio here · Make main · Remove | |
| Play/Pause | | | cycle audio: world feed → tile 1 → tile 2 |
| Menu / Back | | | rail open: close it · rail closed: back to the hub, streams released |

## Players: AVPlayer vs VLC (HEVC feeds)

Apple's HLS refuses HEVC carried in MPEG-TS segments, which this provider uses for its F1-TV and
UHD feeds, so AVPlayer plays their audio over a black frame. The app bundles VLC (`TVVLCKit`)
as a second player; VLC demuxes the TS itself and hardware-decodes the HEVC. Which player a
feed gets is controlled by `PITWALL_PLAYER` in `.env` (then `npm run gen-env` and reload):

| `PITWALL_PLAYER` | Behaviour |
|---|---|
| `auto` (default) | AVPlayer for H.264 feeds (native pipeline, lowest latency); VLC only for feeds flagged HEVC-in-TS on Apple. Android always uses ExoPlayer, which plays HEVC-in-TS natively. |
| `vlc` | VLC for every feed. One consistent path; immune to the HEVC name heuristic; slightly slower start. |
| `avplayer` | Never use VLC (HEVC feeds show the "audio only" overlay). |

The HEVC flag is a name heuristic (`UHD` quality or the bare `F1-TV` brand) that matched every stream
probed on the real panel. If a feed you pick is still black under `auto`, switch to `vlc`.
Adding VLC requires a native rebuild: `npm install` (applies the `patches/` fix to the VLC view),
`cd ios && pod install && cd ..`, then run from Xcode.

### Reading the VLC badge

A VLC feed carries a small badge in the bottom-right corner. It is the diagnostic when the picture
is black:

| Badge | Meaning |
|---|---|
| "VLC isn't in this build" overlay | The native module is missing: run `pod install` and rebuild from Xcode. |
| `VLC · loading` | The view is mounted but VLC has not reported anything yet. |
| `VLC · opening` / `buffering` | VLC is fetching the stream. Stuck here means the network path (HLS 302, token, slot) is the problem. |
| `VLC · stopped` / `error` | VLC gave up; the app re-checks the playlist (401/403 → waits for a free slot) or shows "Playback failed". |
| `VLC · retry n (ts)` / `(m3u8)` | The 15 s start watchdog remounted the player, alternating the HLS playlist and the continuous `.ts` URL. After 4 tries it fails with the last state in the message. |
| `VLC · 1920×1080` | VLC is decoding video at that size. Black at this point is a rendering issue, not a stream issue. |

Debug builds also print VLC's own log (`libvlc`, `hls`, `videotoolbox` lines) to the Xcode console;
filter on `vlc` to see it.

## Tests

```bash
npm test                              # offline unit + simulated screen tests (mocked player and remote)
XTREAM_USERNAME=... npm run test:live # real-provider integration suite (auth, catalogue, HLS, slot limit)
npm run probe                         # prints what your line exposes, never prints credentials
```

The integration suite is skipped when `XTREAM_USERNAME` is not set.
