# Pleno Live for Even G2

Even Hub plugin for live transcription through the G2 microphone. The plugin runs in the Even Realities App WebView; the app relays display, audio, and touch events to the glasses. It never connects to Bluetooth directly.

## Data flow

```text
G2 microphone (PCM 16 kHz mono)
  -> Even Hub bridge
  -> short-lived token from live.plenoai.com
  -> ElevenLabs realtime transcription
  -> G2 display and companion WebView
```

The package contains no API key. Audio is streamed for transcription and is not persisted by the plugin. Transcript recovery state stays on-device for at most 24 hours and is deleted on a normal G2 exit.

## Controls

- Press the G2 temple or the companion button to pause or resume.
- Double-press the temple to open the required system exit dialog.

## Development

```bash
pnpm even:g2:dev
pnpm even:g2:simulate
```

Set `VITE_PLENO_API_URL` only when using a non-production API. The origin must also be listed in `app.json` before packaging.

## Verification and packaging

```bash
pnpm even:g2:check
pnpm test -- apps/even-g2
pnpm even:g2:build
pnpm even:g2:pack
```

The package is written to `dist/pleno-live-g2.ehpk`. Before submission, install it as an Even Hub beta build and verify microphone permission, five minutes of locked-phone operation, resume after Android WebView reclamation, root double-press exit, and launch of a first-party app after exit. Simulator QA does not cover BLE timing or background execution.

## Permissions and privacy

- `g2-microphone`: captures speech for live transcription.
- `network`: contacts `https://live.plenoai.com` for a short-lived token and `wss://api.elevenlabs.io` for transcription.

No camera, location, phone microphone, or direct Bluetooth permission is requested.
