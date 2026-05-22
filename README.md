# Seed Battle Academy

A browser-based PWA prototype for local-first, turn-by-turn creature battles synchronized by textable seeds.

## Features

- Static PWA: host on GitHub Pages, Netlify, Vercel, or any static server.
- Local game storage with `localStorage`.
- Multiple simultaneous games using visible and embedded Game IDs.
- Turn seed import/export.
- Embedded turn messages.
- Deterministic random resolution from seed payloads.
- Offline caching through a service worker.
- SVG-only image assets.

## Local Testing

Because service workers require an HTTP origin, run through a local static server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages

Upload all files in this folder to a GitHub repository and enable GitHub Pages for the branch/folder. The app is fully static.

## Current MVP Rules

- Each player has one active creature.
- Players alternate attacks.
- Some moves use deterministic seed-based coin flips.
- A player wins when the opposing creature reaches 0 HP.

## Seed Format

```text
PKBA1|GAME-ID|TURN|PLAYER|BASE64_PAYLOAD|CHECKSUM
```

The payload also embeds the Game ID, turn, actor, previous state hash, action, RNG seed, and optional message.
