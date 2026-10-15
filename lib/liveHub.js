const { WebSocketServer } = require("ws");
const { db, incrementMeta, getMetaInt } = require("./store");

const rooms = new Map(); // channelSlug -> Set<ws>
const broadcasterFrames = new Map(); // channelSlug -> { frameDataUrl, updatedAt, mode }
const slowModeMap = new Map(); // `${channelSlug}:${deviceId}` -> timestamp

function getRoom(slug) {
  if (!rooms.has(slug)) rooms.set(slug, new Set());
  return rooms.get(slug);
}

function broadcastToChannel(slug, payload, excludeWs = null) {
  const room = rooms.get(slug);
  if (!room) return;
  const text = JSON.stringify(payload);
  for (const client of room) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(text);
    }
  }
}

function getLiveViewerCount(slug) {
  const ch = db.prepare("SELECT viewers_base, is_live FROM channels WHERE slug = ?").get(slug);
  if (!ch || !ch.is_live) return 0;
  const connected = rooms.get(slug)?.size || 0;
  return ch.viewers_base + connected;
}

function computeSejbometer(ch) {
  const up = Number(ch.sejbo_up || 0);
  const down = Number(ch.sejbo_down || 0);
  const total = Math.max(1, up + down);
  const ratio = Math.round((up / total) * 100);
  return Math.max(5, Math.min(100, ratio));
}

function attachLiveHub(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const slug = url.searchParams.get("channel") || "sejbosejbo";
    ws.channelSlug = slug;
    ws.isBroadcaster = url.searchParams.get("role") === "broadcaster";

    const room = getRoom(slug);
    room.add(ws);

    // Send initial state
    const channel = db.prepare("SELECT * FROM channels WHERE slug = ?").get(slug);
    const activePoll = db.prepare("SELECT * FROM polls WHERE channel_slug = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(slug);
    const latestFrame = broadcasterFrames.get(slug);

    if (channel) {
      ws.send(JSON.stringify({
        type: "init",
        viewers: getLiveViewerCount(slug),
        sejbometer: computeSejbometer(channel),
        sejboUp: channel.sejbo_up,
        sejboDown: channel.sejbo_down,
        pinnedMessage: channel.pinned_message,
        slowModeSec: channel.slow_mode_sec,
        streamMode: channel.stream_mode,
        isLive: Boolean(channel.is_live),
        poll: activePoll || null,
        liveFrame: latestFrame && (Date.now() - latestFrame.updatedAt < 10000) ? latestFrame.frameDataUrl : null
      }));
    }

    broadcastToChannel(slug, {
      type: "viewers",
      viewers: getLiveViewerCount(slug)
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === "chat") {
        const body = String(msg.body || "").trim().slice(0, 360);
        if (!body) return;
        const author = String(msg.author || "AnonSejbo").trim().slice(0, 28) || "AnonSejbo";
        const color = /^#[0-9a-fA-F]{6}$/.test(msg.color || "") ? msg.color : "#ff66cc";
        const badge = String(msg.badge || "").slice(0, 14);
        const deviceId = String(msg.deviceId || "anon");

        const ch = db.prepare("SELECT slow_mode_sec, sejbo_up, sejbo_down FROM channels WHERE slug = ?").get(slug);
        if (ch && ch.slow_mode_sec > 0) {
          const key = `${slug}:${deviceId}`;
          const last = slowModeMap.get(key) || 0;
          if (Date.now() - last < ch.slow_mode_sec * 1000) {
            ws.send(JSON.stringify({
              type: "system",
              text: `Slow mode enabled (${ch.slow_mode_sec}s). Take a breath before your next Sejbosejbo.`
            }));
            return;
          }
          slowModeMap.set(key, Date.now());
        }

        const now = new Date().toISOString();
        const info = db.prepare(`
          INSERT INTO chat_messages (channel_slug, author, color, badge, body, is_alert, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)
        `).run(slug, author, color, badge, body, now);

        const chatItem = {
          id: Number(info.lastInsertRowid),
          channel_slug: slug,
          author,
          color,
          badge,
          body,
          is_alert: 0,
          created_at: now
        };

        broadcastToChannel(slug, { type: "chat", message: chatItem });

        // If chat message contains :sejbo: or "sej bo", nudge Sejbometer up!
        if (/sej\s*bo|:sejbo:/i.test(body)) {
          db.prepare("UPDATE channels SET sejbo_up = sejbo_up + 1 WHERE slug = ?").run(slug);
          const updated = db.prepare("SELECT sejbo_up, sejbo_down FROM channels WHERE slug = ?").get(slug);
          broadcastToChannel(slug, {
            type: "meter",
            sejbometer: computeSejbometer(updated),
            sejboUp: updated.sejbo_up,
            sejboDown: updated.sejbo_down
          });
        }
      } else if (msg.type === "reaction") {
        const emoji = String(msg.emoji || "🎭").slice(0, 8);
        broadcastToChannel(slug, {
          type: "reaction",
          emoji,
          x: Math.floor(15 + Math.random() * 70)
        });
      } else if (msg.type === "redeem") {
        const reward = String(msg.reward || "microwave");
        const author = String(msg.author || "AnonSejbo").slice(0, 28);
        const now = new Date().toISOString();

        const titles = {
          microwave: `⚡ ${author} REDEEMED: MICROWAVE ICE ALERT!`,
          brain: `🧠 ${author} TRIGGERED: BRAIN.EXE STOPPED WORKING!`,
          siren: `🚨 ${author} SOUNDED THE MAXIMUM SEJBOSEJBO SIREN!`,
          cap: `🧢 ${author} BOWED TO THE BOTTLE CAP ON STREAM!`,
          confetti: `🎉 ${author} UNLEASHED A SEJBOSEJBO EMOJI STORM!`
        };

        const alertText = titles[reward] || titles.microwave;

        if (reward === "cap") {
          incrementMeta("cap_worships", 1, 4209);
        }

        const info = db.prepare(`
          INSERT INTO chat_messages (channel_slug, author, color, badge, body, is_alert, created_at)
          VALUES (?, ?, '#ffe03d', 'ALERT', ?, 1, ?)
        `).run(slug, author, alertText, now);

        broadcastToChannel(slug, {
          type: "alert",
          reward,
          author,
          text: alertText,
          capWorships: getMetaInt("cap_worships", 4209),
          message: {
            id: Number(info.lastInsertRowid),
            channel_slug: slug,
            author,
            color: "#ffe03d",
            badge: "ALERT",
            body: alertText,
            is_alert: 1,
            created_at: now
          }
        });
      } else if (msg.type === "broadcaster_frame") {
        // Live canvas / webcam / screen share frame from /studio broadcaster
        if (typeof msg.frame === "string" && msg.frame.startsWith("data:image/")) {
          broadcasterFrames.set(slug, {
            frameDataUrl: msg.frame,
            updatedAt: Date.now(),
            mode: msg.mode || "webcam"
          });
          broadcastToChannel(slug, {
            type: "live_frame",
            frame: msg.frame,
            mode: msg.mode || "webcam",
            overlayText: msg.overlayText || ""
          }, ws);
        }
      }
    });

    ws.on("close", () => {
      room.delete(ws);
      broadcastToChannel(slug, {
        type: "viewers",
        viewers: getLiveViewerCount(slug)
      });
    });
  });

  // Periodic background pulse for active viewer jitter so live channels feel kinetic
  setInterval(() => {
    for (const [slug, room] of rooms.entries()) {
      if (room.size === 0) continue;
      const jitter = Math.floor(Math.random() * 5) - 2;
      const base = getLiveViewerCount(slug);
      broadcastToChannel(slug, {
        type: "viewers",
        viewers: Math.max(1, base + jitter)
      });
    }
  }, 6000);

  return { wss, broadcastToChannel, getLiveViewerCount, computeSejbometer, broadcasterFrames };
}

module.exports = { attachLiveHub, broadcastToChannel, getLiveViewerCount, computeSejbometer, broadcasterFrames };
