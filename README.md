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
export XTREAM_DNS1=http://your-panel-host      # or https://host:port
export XTREAM_USERNAME=...
export XTREAM_PASSWORD=...
npm run gen-env                                # writes src/config/env.generated.ts (git-ignored)
```

`gen-env` also runs before `npm start` and `npm test`. If you skip it, the app opens on the
Connect screen where you can type the line in.

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

## Tests

```bash
npm test                              # offline unit + simulated screen tests (mocked player and remote)
XTREAM_USERNAME=... npm run test:live # real-provider integration suite (auth, catalogue, HLS, slot limit)
npm run probe                         # prints what your line exposes, never prints credentials
```

The integration suite is skipped when `XTREAM_USERNAME` is not set.
