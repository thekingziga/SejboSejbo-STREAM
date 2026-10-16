# SEJBOSEJBO.TV (`sejbosejbo-live`) 🎭🔴

> A deliberately chaotic, self-hosted live streaming platform combining the best of **Twitch**, **YouTube Live**, and **Owncast** in pure Neo-Brutalist **Sejbosejbo** style.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen.svg)](https://nodejs.org/)
[![Docker Image](https://img.shields.io/badge/docker-thekingziga%2Fsejbosejbo--stream-blue.svg)](https://hub.docker.com/r/thekingziga/sejbosejbo-stream)
[![Database](https://img.shields.io/badge/database-SQLite%20WAL-blue.svg)](https://nodejs.org/api/sqlite.html)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## ✨ Features

- 🔴 **Multi-Channel Live Stage & Ribbon**: Host your flagship Owncast-style broadcast alongside community channels or 24/7 procedural signals (`/live/:slug` & `/browse`).
- ⚡ **Live Stream Sejbometer™**: Real-time viewer voting (`▲ SEJ BO` vs `▼ SEJ NE BO`). Pushing the meter to **95%+ MAXIMUM SEJBOSEJBO** triggers a synchronized siren, screen shake, and emoji rain across all watching browsers.
- 💬 **Real-Time WebSocket Chaos Chat (`/ws`)**:
  - Built-in custom emotes (`:sejbo:`, `:nebo:`, `:cap:`, `:sweat:`, `:brain:`, `:microwave:`, `:cat:`, `:fire:`).
  - Pinned streamer banners, slow-mode support, and **Live Chat Predictions / Polls**.
  - **Bottle Cap (`🧢`) Economy & Chaos Alerts**: Viewers earn `+5 🧢` every 15 seconds watching and can spend them to trigger live on-stream visual & audio alerts (*Microwave Ice Alert*, *Brain.exe Crash*, *Maximum Sejbo Siren*, *Bow to the Bottle Cap*, *Sejbo Emoji Rain*).
- 🎥 **Browser Go-Live Studio (`/studio`) + OBS / Owncast RTMP & HLS**:
  - **Zero-OBS Browser Studio**: Broadcast directly from your browser using **Webcam + Mic**, **Screen Share**, or the **60fps Procedural Signal Synthesizer** with live lower-third overlays.
  - **OBS Studio / RTMP / HLS Ready**: Auto-generated per-channel stream keys and built-in `hls.js` `.m3u8` playback. Pairs out-of-the-box with `mediamtx` or `owncast` in [`docker-compose.yml`](docker-compose.yml).
- ✂️ **Instant Clips & VOD Archive (`/clips`)**:
  - One-click **✂️ CLIP THAT SEJBO** button on the live player to snapshot the stream, or upload MP4/WebM recordings with device-keyed voting and comment threads.
- 🎛️ **Multi-Sejbo 2x2 Quad Monitor Wall (`/multistream`)**: Watch 4 simultaneous live channels in a 2×2 grid.
- 🧢 **The Bottle Cap 24/7 Telemetry Shrine (`/sweat`)**: Dedicated live security feed and persisted worship counter.
- 🌓 **Zero-Flash Light & Dark Mode + Bilingual (`ENG / SLO`) + Theme Anthem Toggle (`🔊`)**.
- 📱 **REST & WebSocket API Ready**: Complete `/api/v1` JSON endpoints and `/ws` real-time protocol (see [`docs/api.md`](docs/api.md)).

---

## 🚀 Quickstart (Self-Hosting with Docker)

The fastest and recommended way to run your own instance is with **Docker Compose**. It launches the streaming web platform, persistent volumes, and an optional RTMP-to-HLS ingest server (`mediamtx`) for OBS Studio.

### 1. Clone the repository

```bash
git clone https://github.com/thekingziga/SejboSejbo-STREAM.git
cd SejboSejbo-STREAM
```

### 2. Configure environment

Copy the template configuration:

```bash
cp .env.example .env
```

Open `.env` and customize your settings:
- `ADMIN_PASSWORD`: Secret password for `/admin`.
- `SESSION_SECRET`: Long random string for session signing.
- `SITE_URL`: Canonical public URL of your instance (e.g. `https://tv.yourdomain.com` or `http://localhost:3030`).

### 3. Launch the stack

```bash
docker compose up -d
```

Open `http://localhost:3030` in your browser!
- **Streamer Studio**: `http://localhost:3030/studio`
- **Admin Dashboard**: `http://localhost:3030/admin`
- **Health Check**:
  ```bash
  curl http://localhost:3030/health
  ```

---

## 🎥 Streaming with OBS Studio or Browser Studio

### Option A: Browser Go-Live Studio (No extra software needed)
1. Open `http://localhost:3030/studio`.
2. Choose **📷 Webcam + Mic**, **🖥️ Share Screen**, or **🎛️ Test Signal Synth**.
3. Set your target channel and lower-third banner text, then click **🔴 GO LIVE NOW**.

### Option B: OBS Studio via RTMP / HLS
1. Start the stack with `docker compose up -d` (which starts `sejbosejbo-rtmp` on ports `1935` and `8888`).
2. Copy your channel's **Stream Key** from `http://localhost:3030/studio`.
3. In **OBS Studio → Settings → Stream**:
   - **Server**: `rtmp://localhost:1935/live`
   - **Stream Key**: `<your_stream_key>`
4. In `/studio`, set the channel's **External HLS (.m3u8) Playback URL** to:
   ```text
   http://localhost:8888/live/<your_stream_key>/index.m3u8
   ```

---

## 🛠️ Local Development (Without Docker)

### Prerequisites
- **Node.js**: v22.5.0 or newer (uses Node's built-in `node:sqlite` engine—no external database server required!)

### Setup
```bash
npm install
npm run dev
```

The server starts at `http://localhost:3030` and automatically initializes its SQLite WAL database in `./data/sejbolive.sqlite`.

---

## ⚙️ Configuration Reference

All settings are configured via environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `SITE_URL` | `http://localhost:3030` | Canonical public URL of your streaming instance. |
| `SITE_NAME` | `SEJBOSEJBO.TV` | Site title shown in browser tabs and headers. |
| `PORT` | `3030` | Internal port Express & WebSocket listen on. |
| `HOST_PORT` | `3030` | Host port mapped by Docker Compose. |
| `ADMIN_PASSWORD` | `change-this-password` | Password for `/admin` moderation actions. |
| `SESSION_SECRET` | *(random)* | Secret key used to sign session cookies. |
| `SITE_TIMEZONE` | `Europe/Ljubljana` | Timezone for timestamps and uptime formatting. |
| `RTMP_PUBLIC_URL` | `rtmp://localhost:1935/live` | Public RTMP ingest server URL displayed in `/studio`. |
| `DEFAULT_HLS_URL` | *(empty)* | Optional default `.m3u8` stream URL for the flagship channel. |
| `CLIP_UPLOAD_LIMIT_MB` | `250` | Maximum file size (MB) for uploaded MP4/WebM clips. |

---

## 📚 REST & WebSocket API

Full documentation lives in [`docs/api.md`](docs/api.md).

- `GET /health` — Service health & version check.
- `GET /api/v1/status` — Owncast-compatible live status & channel summary.
- `GET /api/v1/channels` — List all channels, viewer counts, and Sejbometer™ levels.
- `POST /api/v1/channels/:slug/vote` — Vote `▲ SEJ BO` or `▼ SEJ NE BO` on a live stream.
- `POST /api/v1/polls/:id/vote` — Vote on an active chat prediction.
- `POST /api/v1/clips/instant` — Capture an instant clip from the live player.
- `POST /api/v1/clips/:id/vote` — Upvote or downvote a clip (`X-Device-Id`).
- `POST /api/v1/cap/worship` — Bow to the Bottle Cap on `/sweat`.
- `WS /ws?channel=<slug>` — Real-time chat, viewer count, Sejbometer™, alerts, and browser studio frame relay.

---

## 🤝 Contributing & License

Contributions, bug reports, and pull requests are welcome!

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
