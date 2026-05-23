# Nightwire Relay

A browser-based PWA for local-first, turn-by-turn covert messaging synchronized by encrypted text seeds.

## Features

- Static PWA deployable on any static host.
- Local operation storage in `localStorage`.
- Multiple simultaneous covert threads using Operation IDs.
- Encrypted seed import/export with AES-GCM.
- Transcript-style turn messaging.
- Offline caching through a service worker.
- SVG-only image assets.

## Local Testing

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Security Model

- Seed payloads are encrypted with AES-256-GCM via Web Crypto.
- Keys are derived with PBKDF2-SHA256 (250,000 iterations) using a user-provided shared secret and operation-specific salt.
- Integrity and authentication are provided by AES-GCM tags; header checksum detects accidental corruption.
- Security depends on secret strength: choose a long random passphrase and share it out-of-band.

## Seed Format

```text
PKBA2|OP-ID|TURN|AGENT|IV.CIPHERTEXT|CHECKSUM
```

Encrypted payload contains operation ID, turn, actor, previous state hash, action, and optional setup metadata.
