# SEJBOSEJBO.TV REST & WebSocket API (`/api/v1`)

`sejbosejbo-live` exposes a clean JSON API under `/api/v1` and a real-time WebSocket hub at `/ws` for companion apps (`sejbosejbo-app`), OBS browser docks, and Owncast-compatible widgets.

---

## 📡 Status & Channels

### `GET /health`
Returns service health and current version.
```json
{
  "ok": true,
  "service": "sejbosejbo-live",
  "version": "1.1.0"
}
```

### `GET /api/v1/status`
Owncast-compatible status summary of the primary stream and all hosted channels.
```json
{
  "online": true,
  "viewerCount": 184,
  "streamTitle": "🔴 24/7 CERTIFIED SEJBOSEJBO ARENA",
  "sejbometer": 92,
  "version": "1.1.0",
  "channels": [...]
}
```

### `GET /api/v1/channels`
Returns all live and 24/7 channels with viewer counts, categories, tags, and Sejbometer™ percentages.

### `POST /api/v1/channels/:slug/vote`
Cast a real-time vote on a channel's Live Stream Sejbometer™.
- **Body**: `{ "direction": "up" | "down" }`
- **Response**: `{ "ok": true, "sejbometer": 93, "sejboUp": 93, "sejboDown": 8 }`

---

## 📊 Live Predictions / Polls

### `POST /api/v1/polls/:id/vote`
Vote on an active chat prediction.
- **Body**: `{ "option": "a" | "b" }`

---

## ✂️ Clips & VODs

### `POST /api/v1/clips/instant`
Create an instant clip snapshot from a live stream.
- **Body**: `{ "channel_slug": "sejbosejbo", "title": "...", "creator": "AnonSejbo", "poster_data": "data:image/jpeg;base64,..." }`

### `POST /api/v1/clips/:id/vote`
Upvote (`▲ SEJ BO`) or downvote (`▼ NE BO`) a clip, keyed by `X-Device-Id`.
- **Headers**: `X-Device-Id: <uuid>`
- **Body**: `{ "value": 1 | -1 | 0 }`

---

## 🧢 Bottle Cap Shrine

### `POST /api/v1/cap/worship`
Increments the persisted global Bottle Cap worship counter on `/sweat`.
- **Response**: `{ "ok": true, "count": 4210 }`

---

## ⚡ WebSocket Protocol (`/ws?channel=<slug>`)

Connect to `ws://<host>/ws?channel=sejbosejbo` (add `&role=broadcaster` when streaming frames from `/studio`).

- **Client -> Server messages**:
  - `{ "type": "chat", "author": "Nick", "color": "#ff66cc", "badge": "CERTIFIED", "body": "Hello :sejbo:", "deviceId": "..." }`
  - `{ "type": "reaction", "emoji": "🎭" }`
  - `{ "type": "redeem", "reward": "microwave" | "brain" | "siren" | "cap" | "confetti", "author": "Nick" }`
  - `{ "type": "broadcaster_frame", "mode": "webcam" | "screen", "overlayText": "...", "frame": "data:image/jpeg;base64,..." }`
- **Server -> Client messages**:
  - `init`, `viewers`, `chat`, `meter`, `reaction`, `alert`, `live_frame`, `poll_update`.
