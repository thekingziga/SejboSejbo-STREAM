const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const compression = require("compression");
const multer = require("multer");

const { getLang, getCopy, withLang } = require("./lib/i18n");
const { db, rootDir, uploadDir, getMetaInt, incrementMeta } = require("./lib/store");
const { attachLiveHub, broadcastToChannel, getLiveViewerCount, computeSejbometer } = require("./lib/liveHub");

const VERSION = require("./package.json").version;
const PORT = Number(process.env.PORT || 3030);
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const SITE_NAME = process.env.SITE_NAME || "";
const RTMP_PUBLIC_URL = process.env.RTMP_PUBLIC_URL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "sejbosejbo";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const app = express();
const server = http.createServer(app);
attachLiveHub(server);

app.disable("x-powered-by");
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));
app.use("/public", express.static(path.join(rootDir, "public"), { maxAge: "1h" }));
app.use("/uploads", express.static(uploadDir, { maxAge: "7d" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".mp4";
      cb(null, `clip_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 250 * 1024 * 1024 }
});

// Cache-busting asset hash (same pattern as sejbosejbo.fyi)
const assetVersions = new Map();
function assetUrl(file) {
  if (!assetVersions.has(file)) {
    let token = VERSION;
    try {
      token = crypto
        .createHash("sha1")
        .update(fs.readFileSync(path.join(rootDir, "public", file)))
        .digest("hex")
        .slice(0, 10);
    } catch {}
    assetVersions.set(file, token);
  }
  return `/public/${file}?v=${assetVersions.get(file)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUptime(startedIso) {
  const diffMs = Math.max(0, Date.now() - new Date(startedIso).getTime());
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return String(iso || "");
  }
}

function getAllChannels() {
  const rows = db.prepare("SELECT * FROM channels ORDER BY is_live DESC, viewers_base DESC").all();
  return rows.map((ch) => ({
    ...ch,
    viewers: getLiveViewerCount(ch.slug),
    sejbometer: computeSejbometer(ch),
    tagsList: (() => { try { return JSON.parse(ch.tags || "[]"); } catch { return []; } })()
  }));
}

function getStats(req) {
  const t = getCopy(req);
  const visits = incrementMeta("visits", 1, 14820);
  const channelsCount = db.prepare("SELECT COUNT(*) as c FROM channels").get().c;
  const clipsCount = db.prepare("SELECT COUNT(*) as c FROM clips").get().c;
  const capWorships = getMetaInt("cap_worships", 4209);
  const quote = t.quotes[Math.floor(Math.random() * t.quotes.length)];
  return { visits, channelsCount, clipsCount, capWorships, quote };
}

function layout({ title, body, req, activeNav = "live", activeChannelSlug = "sejbosejbo" }) {
  const lang = getLang(req);
  const t = getCopy(req);
  const stats = getStats(req);
  const channels = getAllChannels();
  const currentPath = req.originalUrl.split("?")[0];

  const ribbonHtml = channels.map((ch) => `
    <a class="channel-pill ${ch.slug === activeChannelSlug && activeNav === "live" ? "active" : ""}" href="${withLang(req, `/live/${encodeURIComponent(ch.slug)}`)}">
      <span class="channel-dot ${ch.is_live ? "" : "offline"}"></span>
      <span>${escapeHtml(ch.name)}</span>
      <span class="channel-pill-viewers" data-viewer-count="${escapeHtml(ch.slug)}">${ch.viewers}</span>
    </a>
  `).join("");

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${t.siteName}</title>
  <link rel="icon" type="image/png" href="/public/favicon.png">
  <link rel="apple-touch-icon" href="/public/apple-touch-icon.png">
  <meta name="theme-color" content="#ff66cc">
  <meta name="description" content="${escapeHtml(t.tagline)}">
  <script>
    try {
      if (localStorage.getItem("sejbosejbo_theme") === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="${assetUrl("styles.css")}">
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js" defer></script>
</head>
<body>
  <header class="topbar">
    <a href="${withLang(req, "/")}" class="brand">
      <img class="brand-mark" src="/public/logo.png" alt="">
      <span>SEJBOSEJBO</span>
      <span class="brand-tv-pill">LIVE TV</span>
    </a>
    <nav class="main-nav">
      <a class="${activeNav === "live" ? "active" : ""}" href="${withLang(req, "/")}">🔴 ${t.navLive}</a>
      <a class="${activeNav === "browse" ? "active" : ""}" href="${withLang(req, "/browse")}">📺 ${t.navBrowse}</a>
      <a class="${activeNav === "clips" ? "active" : ""}" href="${withLang(req, "/clips")}">✂️ ${t.navClips}</a>
      <a class="${activeNav === "multistream" ? "active" : ""}" href="${withLang(req, "/multistream")}">🎛️ ${t.navMultistream}</a>
      <a class="${activeNav === "sweat" ? "active" : ""}" href="${withLang(req, "/sweat")}">🧢 ${t.navSweat}</a>
      <a class="nav-studio ${activeNav === "studio" ? "active" : ""}" href="${withLang(req, "/studio")}">🎥 ${t.navStudio}</a>
      <a class="${activeNav === "admin" ? "active" : ""}" href="${withLang(req, "/admin")}">🛡️ ${t.navAdmin}</a>
    </nav>
    <div class="topbar-right">
      <div class="cap-wallet" title="${t.capsBalance} (earned watching streams)">
        🧢 <span data-caps-balance>150</span>
      </div>
      <button type="button" class="music-toggle" data-music-toggle hidden aria-pressed="false" title="${t.musicToggle}">
        <span data-music-icon>🔈</span>
      </button>
      <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" title="${t.themeToggle}">
        <span data-theme-icon>🌙</span>
      </button>
      <div class="language-switch" aria-label="Language switch">
        <a class="${lang === "en" ? "active" : ""}" href="${currentPath}?lang=en">ENG</a>
        <span>/</span>
        <a class="${lang === "sl" ? "active" : ""}" href="${currentPath}?lang=sl">SLO</a>
      </div>
    </div>
  </header>

  <div class="channel-ribbon" aria-label="Live Channels">
    ${ribbonHtml}
  </div>

  <audio data-music-audio loop preload="none">
    <source src="/public/theme.m4a" type="audio/mp4">
    <source src="/public/theme.mp3" type="audio/mpeg">
  </audio>

  <main>
    ${body}
    <section class="alive">
      <div><b>${t.visitors}:</b> ${stats.visits.toLocaleString("en-US")}</div>
      <div><b>${t.totalStreams}:</b> ${stats.channelsCount}</div>
      <div><b>${t.clipsArchived}:</b> ${stats.clipsCount}</div>
      <div><b>${t.capWorships}:</b> ${stats.capWorships.toLocaleString("en-US")}</div>
      <div><b>${t.randomQuote}:</b> ${escapeHtml(stats.quote)}</div>
    </section>
  </main>

  <footer>
    ${t.official}
    <p class="footer-links">
      <a href="${withLang(req, "/studio")}">OBS / Owncast RTMP Setup</a> &middot;
      <a href="${withLang(req, "/api/v1/status")}">JSON API (/api/v1/status)</a> &middot;
      <a href="${withLang(req, "/sweat")}">The Bottle Cap Shrine</a>
    </p>
    <p class="footer-version">sejbosejbo-live v${VERSION}</p>
  </footer>

  <script src="${assetUrl("main.js")}"></script>
</body>
</html>`;
}

function renderClipCard(clip, req) {
  const mediaHtml = clip.filename
    ? `<video class="player-video" src="/uploads/${escapeHtml(clip.filename)}" preload="metadata" muted playsinline></video>`
    : clip.poster_data
      ? `<img class="player-live-img" src="${escapeHtml(clip.poster_data)}" alt="${escapeHtml(clip.title)}">`
      : `<canvas class="player-canvas" data-synth-canvas data-synth-preset="${escapeHtml(clip.synth_preset || "sejbo_tv")}" data-stream-title="${escapeHtml(clip.title)}"></canvas>`;

  return `
    <div class="card">
      <a href="${withLang(req, `/clip/${clip.id}`)}" style="text-decoration:none;color:inherit;">
        <div class="card-media">
          ${mediaHtml}
          <div class="card-overlay-top">
            <span class="tag-badge">${escapeHtml(clip.channel_name)}</span>
            <span class="tag-badge category">${clip.duration_sec}s</span>
          </div>
        </div>
        <strong>${escapeHtml(clip.title)}</strong>
      </a>
      <span style="font-size:13px;opacity:0.8;margin-top:4px;">Clipped by <b>${escapeHtml(clip.creator)}</b> &middot; ${clip.views} views</span>
      <div class="vote-row" data-clip-vote-widget data-clip-id="${clip.id}">
        <button type="button" class="vote-btn vote-up" data-vote="1">▲ SEJ BO <span data-vote-up>${clip.upvotes}</span></button>
        <button type="button" class="vote-btn vote-down" data-vote="-1">▼ NE BO <span data-vote-down>${clip.downvotes}</span></button>
        <a class="button btn-hot" style="padding:3px 8px;font-size:12px;margin-left:auto;" href="${withLang(req, `/clip/${clip.id}`)}">▶ WATCH</a>
      </div>
    </div>
  `;
}

// --- LIVE STREAM VIEW (HOME & /live/:slug) ----------------------------------
function renderStreamPage(req, res, slug) {
  const t = getCopy(req);
  const channel = db.prepare("SELECT * FROM channels WHERE slug = ?").get(slug)
    || db.prepare("SELECT * FROM channels ORDER BY is_live DESC LIMIT 1").get();

  if (!channel) return res.status(404).send("Channel not found");

  const viewers = getLiveViewerCount(channel.slug);
  const meterPct = computeSejbometer(channel);
  const tags = (() => { try { return JSON.parse(channel.tags || "[]"); } catch { return []; } })();
  const messages = db.prepare("SELECT * FROM chat_messages WHERE channel_slug = ? ORDER BY id DESC LIMIT 60").all(channel.slug).reverse();
  const activePoll = db.prepare("SELECT * FROM polls WHERE channel_slug = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(channel.slug);
  const otherChannels = getAllChannels().filter((c) => c.slug !== channel.slug);
  const recentClips = db.prepare("SELECT * FROM clips ORDER BY upvotes DESC, id DESC LIMIT 4").all();

  const chatRowsHtml = messages.map((m) => `
    <div class="chat-msg ${m.is_alert ? "alert-msg" : ""}">
      ${m.badge ? `<span class="chat-badge ${escapeHtml(m.badge)}">${escapeHtml(m.badge)}</span>` : ""}
      <span class="chat-author" style="color:${escapeHtml(m.color)}">${escapeHtml(m.author)}:</span>
      <span data-raw-body="${escapeHtml(m.body)}">${escapeHtml(m.body)}</span>
    </div>
  `).join("");

  const pollHtml = activePoll ? `
    <div class="chat-poll-box">
      <div class="chat-poll-title">
        <span>📊 ${t.pollHeading}: ${escapeHtml(activePoll.question)}</span>
      </div>
      <div class="poll-options-grid">
        <button type="button" class="poll-opt-btn btn-lime" data-poll-vote="a" data-poll-id="${activePoll.id}">
          <span>${escapeHtml(activePoll.option_a)}</span>
          <strong><span data-poll-votes-a>${activePoll.votes_a}</span> votes</strong>
        </button>
        <button type="button" class="poll-opt-btn btn-pink" data-poll-vote="b" data-poll-id="${activePoll.id}">
          <span>${escapeHtml(activePoll.option_b)}</span>
          <strong><span data-poll-votes-b>${activePoll.votes_b}</span> votes</strong>
        </button>
      </div>
    </div>
  ` : "";

  const body = `
    <div class="stream-workspace" data-stream-workspace data-channel-slug="${escapeHtml(channel.slug)}" data-hls-url="${escapeHtml(channel.hls_url)}">
      <!-- LEFT COLUMN: VIDEO STAGE + STREAM HEADER + SEJBOMETER -->
      <div class="stream-stage-col">
        <div class="player-frame" data-player-frame>
          <canvas class="player-canvas" data-main-stream-canvas data-synth-canvas data-synth-preset="${escapeHtml(channel.synth_preset)}" data-stream-title="${escapeHtml(channel.title)}"></canvas>
          <img class="player-live-img" data-live-broadcaster-img hidden alt="Live Broadcast">
          <video class="player-video" data-hls-video controls playsinline hidden></video>
          <div class="player-crt-scanlines"></div>

          <div class="player-top-hud">
            <div class="hud-badges">
              <span class="hud-live-badge"><span class="channel-dot"></span> ${channel.is_live ? t.liveBadge : t.rerunsBadge}</span>
              <span class="hud-viewer-badge">👁️ <span data-main-viewers>${viewers}</span> ${t.viewers}</span>
              <span class="hud-uptime-badge">⏱️ ${formatUptime(channel.started_at)}</span>
            </div>
            <div class="hud-badges">
              <span class="tag-badge" style="background:#000;color:var(--lime);border-color:var(--lime);">OWNCAST / SEJBO-RTC</span>
            </div>
          </div>

          <div class="stream-alert-overlay" data-alert-overlay hidden></div>
          <div class="emoji-rain-layer" data-emoji-layer></div>

          <div class="player-controls">
            <div class="player-controls-left">
              <button type="button" class="ctrl-btn btn-hot" data-sfx-mute-btn>🔊 SFX ON</button>
              <select class="quality-select" aria-label="Stream Quality">
                <option value="1080p">1080p60 SEJBO (SOURCE)</option>
                <option value="720p">720p60 NORMAL</option>
                <option value="144p">144p KROMPIR (POTATO)</option>
                <option value="audio">AUDIO ONLY (KLET)</option>
              </select>
            </div>
            <div class="player-controls-right">
              <button type="button" class="ctrl-btn btn-pink" data-clip-stream-btn>${t.clipButton}</button>
              <button type="button" class="ctrl-btn btn-lime" data-theater-btn>${t.theaterButton}</button>
              <button type="button" class="ctrl-btn" data-fullscreen-btn>⛶ FULL (F)</button>
            </div>
          </div>
        </div>

        <!-- STREAMER IDENTITY & METADATA -->
        <div class="stream-info-card">
          <div class="stream-header-row">
            <div class="streamer-identity">
              <div class="streamer-avatar" style="background:${escapeHtml(channel.avatar_color)}">
                <img src="/public/logo.png" alt="">
              </div>
              <div>
                <h1 class="stream-title">${escapeHtml(channel.title)}</h1>
                <div class="stream-meta-tags">
                  <strong>${escapeHtml(channel.name)}</strong>
                  <span>&middot;</span>
                  <span class="tag-badge category">${escapeHtml(channel.category)}</span>
                  ${tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join("")}
                </div>
              </div>
            </div>
            <div class="stream-actions">
              <a class="button btn-hot" href="${withLang(req, "/multistream")}">🎛️ ${t.multistreamAdd}</a>
              <a class="button btn-pink" href="${withLang(req, `/studio?channel=${encodeURIComponent(channel.slug)}`)}">🎥 Broadcast Here</a>
            </div>
          </div>
          <p style="margin:12px 0 0;opacity:0.9;">${escapeHtml(channel.bio)}</p>
        </div>

        <!-- LIVE STREAM SEJBOMETER™ -->
        <div class="sejbometer-card">
          <div class="sejbometer-top">
            <h2>⚡ ${t.meterTitle}</h2>
            <span style="font-size:14px;font-weight:700;">${t.meterSub}</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill ${meterPct >= 95 ? "maxed" : ""}" data-meter-fill style="width:${meterPct}%"></div>
            <div class="meter-percent-label" data-meter-label>${meterPct}% SEJBOSEJBO</div>
          </div>
          <div class="sejbometer-controls">
            <div class="vote-buttons-pair">
              <button type="button" class="btn-lime" data-sejbo-vote="up">
                ▲ ${t.sejboVoteUp} (<span data-sejbo-up>${channel.sejbo_up}</span>)
              </button>
              <button type="button" class="btn-danger" data-sejbo-vote="down">
                ▼ ${t.sejboVoteDown} (<span data-sejbo-down>${channel.sejbo_down}</span>)
              </button>
            </div>
            <div class="reaction-strip">
              <button type="button" class="reaction-btn" data-send-reaction="🎭" title="Sejbo">🎭</button>
              <button type="button" class="reaction-btn" data-send-reaction="🧢" title="Bottle Cap">🧢</button>
              <button type="button" class="reaction-btn" data-send-reaction="⚡" title="Microwave">⚡</button>
              <button type="button" class="reaction-btn" data-send-reaction="🔥" title="Fire">🔥</button>
              <button type="button" class="reaction-btn" data-send-reaction="💦" title="The Sweat">💦</button>
              <button type="button" class="reaction-btn" data-send-reaction="🧠" title="Brain.exe">🧠</button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: LIVE CHAOS CHAT & BOTTLE CAP REWARDS -->
      <aside class="chat-column">
        <div class="chat-header">
          <span>💬 ${t.chatTitle}</span>
          <span style="font-size:13px;">#${escapeHtml(channel.slug)}</span>
        </div>
        ${channel.pinned_message ? `<div class="chat-pinned-banner" data-pinned-banner>📌 ${escapeHtml(channel.pinned_message)}</div>` : ""}
        ${pollHtml}
        <div class="chat-messages" data-chat-messages>
          ${chatRowsHtml}
        </div>

        <!-- EMOTE PICKER DRAWER -->
        <div class="chat-drawer" data-emotes-drawer hidden>
          <strong style="display:block;margin-bottom:6px;font-size:13px;">CLICK TO INSERT EMOTE:</strong>
          <div class="emote-picker-grid">
            <button type="button" class="emote-pick-btn" data-insert-emote=":sejbo:">🎭 :sejbo:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":nebo:">🚫 :nebo:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":cap:">🧢 :cap:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":sweat:">💦 :sweat:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":brain:">🧠 :brain:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":microwave:">⚡ :microwave:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":cat:">🐱 :cat:</button>
            <button type="button" class="emote-pick-btn" data-insert-emote=":fire:">🔥 :fire:</button>
          </div>
        </div>

        <!-- CHAOS REWARDS DRAWER (SPEND BOTTLE CAPS) -->
        <div class="chat-drawer" data-rewards-drawer hidden>
          <strong style="display:block;margin-bottom:6px;font-size:13px;">🧢 ${t.redeemTitle}:</strong>
          <div class="rewards-grid">
            <button type="button" class="reward-btn btn-hot" data-redeem-reward="microwave" data-cost="20">
              <span>⚡ ${t.redeemAlertMicrowave}</span> <span>20 🧢</span>
            </button>
            <button type="button" class="reward-btn btn-pink" data-redeem-reward="brain" data-cost="30">
              <span>🧠 ${t.redeemAlertBrain}</span> <span>30 🧢</span>
            </button>
            <button type="button" class="reward-btn btn-lime" data-redeem-reward="cap" data-cost="25">
              <span>🧢 ${t.redeemAlertCap}</span> <span>25 🧢</span>
            </button>
            <button type="button" class="reward-btn btn-orange" data-redeem-reward="confetti" data-cost="35">
              <span>🎉 ${t.redeemAlertConfetti}</span> <span>35 🧢</span>
            </button>
            <button type="button" class="reward-btn btn-danger" data-redeem-reward="siren" data-cost="50">
              <span>🚨 ${t.redeemAlertSiren}</span> <span>50 🧢</span>
            </button>
          </div>
        </div>

        <form class="chat-composer" data-chat-form>
          <div class="chat-composer-top">
            <input type="text" class="chat-nick-input" data-chat-nick maxlength="24" placeholder="Nickname">
            <button type="button" class="btn-hot" style="padding:5px 10px;font-size:13px;" data-toggle-emotes>🎭 ${t.emotesTitle}</button>
            <button type="button" class="btn-lime" style="padding:5px 10px;font-size:13px;margin-left:auto;" data-toggle-rewards>🧢 Rewards</button>
          </div>
          <div class="chat-input-row">
            <input type="text" data-chat-input maxlength="360" placeholder="${escapeHtml(t.chatPlaceholder)}" autocomplete="off">
            <button type="submit" class="btn-pink">${t.chatSend}</button>
          </div>
        </form>
      </aside>
    </div>

    <!-- BELOW STREAM DECK: OTHER LIVE CHANNELS & RECENT CLIPS -->
    <div class="below-stream-deck">
      <div class="section-head">
        <h2>📡 ${t.browseHeading}</h2>
        <a class="button btn-hot" href="${withLang(req, "/browse")}">View All Channels</a>
      </div>
      <div class="grid-channels">
        ${otherChannels.map((ch) => `
          <a class="card" href="${withLang(req, `/live/${encodeURIComponent(ch.slug)}`)}">
            <div class="card-media">
              <canvas class="player-canvas" data-synth-canvas data-synth-preset="${escapeHtml(ch.synth_preset)}" data-stream-title="${escapeHtml(ch.title)}"></canvas>
              <div class="card-overlay-top">
                <span class="hud-live-badge" style="font-size:12px;padding:2px 7px;">● LIVE</span>
                <span class="hud-viewer-badge" style="font-size:12px;padding:2px 7px;">👁️ ${ch.viewers}</span>
              </div>
            </div>
            <strong>${escapeHtml(ch.name)}</strong>
            <span style="font-size:14px;margin:4px 0;">${escapeHtml(ch.title)}</span>
            <span class="tag-badge category" style="align-self:flex-start;margin-top:auto;">${escapeHtml(ch.category)}</span>
          </a>
        `).join("")}
      </div>

      <div class="section-head">
        <h2>✂️ ${t.clipsHeading}</h2>
        <a class="button btn-pink" href="${withLang(req, "/clips")}">All Clips & Upload</a>
      </div>
      <div class="grid-clips">
        ${recentClips.map((c) => renderClipCard(c, req)).join("")}
      </div>
    </div>
  `;

  res.send(layout({
    title: `${channel.name} — LIVE`,
    body,
    req,
    activeNav: "live",
    activeChannelSlug: channel.slug
  }));
}

app.get("/", (req, res) => renderStreamPage(req, res, "sejbosejbo"));
app.get("/live/:slug", (req, res) => renderStreamPage(req, res, req.params.slug));

// --- BROWSE CHANNELS & LAUNCH NEW CHANNEL (/browse) -------------------------
app.get("/browse", (req, res) => {
  const t = getCopy(req);
  const channels = getAllChannels();

  const body = `
    <div class="section-head">
      <div>
        <h2>📺 ${t.browseHeading}</h2>
        <p style="margin:4px 0 0;">${t.browseSub}</p>
      </div>
      <a class="button btn-pink" href="${withLang(req, "/studio")}">🎥 ${t.navStudio}</a>
    </div>

    <div class="grid-channels">
      ${channels.map((ch) => `
        <a class="card" href="${withLang(req, `/live/${encodeURIComponent(ch.slug)}`)}">
          <div class="card-media">
            <canvas class="player-canvas" data-synth-canvas data-synth-preset="${escapeHtml(ch.synth_preset)}" data-stream-title="${escapeHtml(ch.title)}"></canvas>
            <div class="card-overlay-top">
              <span class="hud-live-badge" style="font-size:12px;padding:2px 8px;">● ${ch.is_live ? t.liveBadge : t.offlineBadge}</span>
              <span class="hud-viewer-badge" style="font-size:12px;padding:2px 8px;">👁️ ${ch.viewers} ${t.viewers}</span>
            </div>
            <div class="card-overlay-bottom">
              <span class="tag-badge">⚡ ${ch.sejbometer}% SEJBO</span>
            </div>
          </div>
          <strong style="font-size:20px;">${escapeHtml(ch.name)}</strong>
          <p style="margin:6px 0 10px;font-size:15px;">${escapeHtml(ch.title)}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;">
            <span class="tag-badge category">${escapeHtml(ch.category)}</span>
            ${ch.tagsList.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </a>
      `).join("")}
    </div>

    <div class="brutal-box" style="margin-top:32px;max-width:720px;margin-inline:auto;">
      <h2>➕ CREATE A NEW SEJBOSEJBO CHANNEL</h2>
      <p>Spin up your own chaotic stream room on this server with its own OBS stream key and Sejbometer.</p>
      <form method="POST" action="/browse/create" style="display:grid;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label><b>Channel Slug (URL)</b><input type="text" name="slug" required placeholder="e.g. burek_gaming" pattern="[a-zA-Z0-9_-]+"></label>
          <label><b>Display Name</b><input type="text" name="name" required placeholder="BUREK GAMING TV"></label>
        </div>
        <label><b>Stream Title</b><input type="text" name="title" required placeholder="🔴 SPEEDRUNNING MICROWAVE SALAD ANY%"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label><b>Category</b><input type="text" name="category" value="Just Sejbosejbo"></label>
          <label><b>Visual Signal Preset</b>
            <select name="synth_preset">
              <option value="sejbo_tv">Bouncing Sejbosejbo TV</option>
              <option value="sweat_rift">Bottle Cap & Rift Radar</option>
              <option value="microwave_lab">Dr. Mikrovalovka Lab</option>
              <option value="klet_radio">Klet Bass Spectrum Visualizer</option>
            </select>
          </label>
        </div>
        <button type="submit" class="btn-pink">🚀 LAUNCH CHANNEL</button>
      </form>
    </div>
  `;

  res.send(layout({ title: t.browseHeading, body, req, activeNav: "browse" }));
});

app.post("/browse/create", (req, res) => {
  const slug = String(req.body.slug || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const name = String(req.body.name || slug).trim().slice(0, 48);
  const title = String(req.body.title || "LIVE SEJBOSEJBO").trim().slice(0, 140);
  const category = String(req.body.category || "Just Sejbosejbo").trim().slice(0, 48);
  const preset = ["sejbo_tv", "sweat_rift", "microwave_lab", "klet_radio"].includes(req.body.synth_preset)
    ? req.body.synth_preset
    : "sejbo_tv";

  if (!slug) return res.redirect("/browse");

  const existing = db.prepare("SELECT slug FROM channels WHERE slug = ?").get(slug);
  if (!existing) {
    db.prepare(`
      INSERT INTO channels (
        slug, name, title, category, tags, avatar_color, banner_accent, bio,
        is_live, stream_mode, synth_preset, hls_url, stream_key,
        viewers_base, followers, sejbo_up, sejbo_down, slow_mode_sec, pinned_message, started_at
      ) VALUES (?, ?, ?, ?, ?, '#ff66cc', '#ffe03d', 'Community Sejbosejbo Broadcast', 1, 'synth', ?, '', ?, 15, 42, 12, 1, 0, 'Welcome to the new stream!', ?)
    `).run(
      slug,
      name,
      title,
      category,
      JSON.stringify(["LIVE", "SEJBO"]),
      preset,
      "sejbo_live_" + crypto.randomBytes(12).toString("hex"),
      new Date().toISOString()
    );
  }
  res.redirect(`/live/${encodeURIComponent(slug)}`);
});

// --- CLIPS & VODS GALLERY (/clips & /clip/:id) ------------------------------
app.get("/clips", (req, res) => {
  const t = getCopy(req);
  const sort = req.query.sort === "newest" ? "newest" : "top";
  const clips = db.prepare(
    sort === "newest"
      ? "SELECT * FROM clips ORDER BY id DESC"
      : "SELECT * FROM clips ORDER BY (upvotes - downvotes) DESC, views DESC"
  ).all();
  const channels = getAllChannels();

  const body = `
    <div class="section-head">
      <div>
        <h2>✂️ ${t.clipsHeading}</h2>
        <p style="margin:4px 0 0;">${t.clipsSub}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <a class="button ${sort === "top" ? "btn-hot" : ""}" href="${withLang(req, "/clips?sort=top")}">🔥 Top Voted</a>
        <a class="button ${sort === "newest" ? "btn-hot" : ""}" href="${withLang(req, "/clips?sort=newest")}">🕒 Newest</a>
      </div>
    </div>

    <div class="grid-clips">
      ${clips.map((c) => renderClipCard(c, req)).join("")}
    </div>

    <div class="brutal-box" style="margin-top:36px;max-width:680px;margin-inline:auto;">
      <h2>📤 ${t.uploadClipHeading}</h2>
      <p>${t.uploadClipSub}</p>
      <form method="POST" action="/clips/upload" enctype="multipart/form-data" style="display:grid;gap:12px;">
        <label><b>Clip Title</b><input type="text" name="title" required placeholder="Microwaved ice exploded on stream"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label><b>Channel</b>
            <select name="channel_slug">
              ${channels.map((ch) => `<option value="${escapeHtml(ch.slug)}">${escapeHtml(ch.name)}</option>`).join("")}
            </select>
          </label>
          <label><b>Clipped By (Your Nick)</b><input type="text" name="creator" placeholder="AnonSejbo"></label>
        </div>
        <label><b>Description / Context</b><textarea name="description" rows="2" placeholder="What happened?"></textarea></label>
        <label><b>Video File (MP4 / WebM — Optional, uses live signal replay if omitted)</b>
          <input type="file" name="video" accept="video/mp4,video/webm,video/quicktime">
        </label>
        <button type="submit" class="btn-pink">🚀 PUBLISH CLIP TO ARCHIVE</button>
      </form>
    </div>
  `;

  res.send(layout({ title: t.clipsHeading, body, req, activeNav: "clips" }));
});

app.post("/clips/upload", upload.single("video"), (req, res) => {
  const title = String(req.body.title || "Untitled Sejbosejbo Clip").trim().slice(0, 120);
  const slug = String(req.body.channel_slug || "sejbosejbo");
  const ch = db.prepare("SELECT * FROM channels WHERE slug = ?").get(slug);
  const creator = String(req.body.creator || "AnonSejbo").trim().slice(0, 32) || "AnonSejbo";
  const description = String(req.body.description || "").trim().slice(0, 500);
  const filename = req.file ? req.file.filename : "";

  const info = db.prepare(`
    INSERT INTO clips (
      channel_slug, channel_name, title, description, creator,
      filename, poster_data, synth_preset, duration_sec, views, upvotes, downvotes, featured, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, '', ?, 25, 1, 1, 0, 0, ?)
  `).run(
    slug,
    ch ? ch.name : "SEJBOSEJBO OFFICIAL",
    title,
    description,
    creator,
    filename,
    ch ? ch.synth_preset : "sejbo_tv",
    new Date().toISOString()
  );

  res.redirect(`/clip/${info.lastInsertRowid}`);
});

app.get("/clip/:id", (req, res) => {
  const id = Number(req.params.id);
  const clip = db.prepare("SELECT * FROM clips WHERE id = ?").get(id);
  if (!clip) return res.status(404).send("Clip not found");

  db.prepare("UPDATE clips SET views = views + 1 WHERE id = ?").run(id);
  const comments = db.prepare("SELECT * FROM clip_comments WHERE clip_id = ? ORDER BY id DESC").all(id);

  const playerHtml = clip.filename
    ? `<video class="player-video" src="/uploads/${escapeHtml(clip.filename)}" controls autoplay playsinline></video>`
    : `<canvas class="player-canvas" data-synth-canvas data-synth-preset="${escapeHtml(clip.synth_preset)}" data-stream-title="${escapeHtml(clip.title)}"></canvas>`;

  const body = `
    <div style="max-width:960px;margin:0 auto;">
      <div class="player-frame">
        ${playerHtml}
      </div>
      <div class="stream-info-card">
        <div class="stream-header-row">
          <div>
            <span class="tag-badge category">${escapeHtml(clip.channel_name)}</span>
            <h1 class="stream-title" style="margin-top:8px;">${escapeHtml(clip.title)}</h1>
            <p style="margin:4px 0;opacity:0.8;">Clipped by <b>${escapeHtml(clip.creator)}</b> &middot; ${clip.views + 1} views &middot; ${formatDate(clip.created_at)}</p>
          </div>
          <div class="vote-row" data-clip-vote-widget data-clip-id="${clip.id}" style="margin:0;">
            <button type="button" class="btn-lime" data-vote="1">▲ SEJ BO (<span data-vote-up>${clip.upvotes}</span>)</button>
            <button type="button" class="btn-danger" data-vote="-1">▼ SEJ NE BO (<span data-vote-down>${clip.downvotes}</span>)</button>
            <a class="button btn-hot" href="/live/${encodeURIComponent(clip.channel_slug)}">🔴 Watch Channel Live</a>
          </div>
        </div>
        ${clip.description ? `<p style="margin-top:12px;padding:12px;border:2px dashed var(--line);background:var(--panel-alt);">${escapeHtml(clip.description)}</p>` : ""}
      </div>

      <div class="brutal-box" style="margin-top:20px;">
        <h3>💬 COMMENTS (${comments.length})</h3>
        <form method="POST" action="/clip/${clip.id}/comment" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          <input type="text" name="author" placeholder="Nickname" style="width:160px;" value="AnonSejbo">
          <input type="text" name="body" required placeholder="Declare this clip Sejbosejbo..." style="flex:1;">
          <button type="submit" class="btn-pink">Post Comment</button>
        </form>
        <div style="display:grid;gap:8px;">
          ${comments.map((cm) => `
            <div class="chat-msg">
              <strong style="color:var(--pink);">${escapeHtml(cm.author)}:</strong> ${escapeHtml(cm.body)}
              <span style="float:right;font-size:12px;opacity:0.65;">${formatDate(cm.created_at)}</span>
            </div>
          `).join("") || "<p>No comments yet. Be the first brave soul.</p>"}
        </div>
      </div>
    </div>
  `;

  res.send(layout({ title: clip.title, body, req, activeNav: "clips" }));
});

app.post("/clip/:id/comment", (req, res) => {
  const id = Number(req.params.id);
  const author = String(req.body.author || "AnonSejbo").trim().slice(0, 28) || "AnonSejbo";
  const body = String(req.body.body || "").trim().slice(0, 400);
  if (body) {
    db.prepare("INSERT INTO clip_comments (clip_id, author, body, created_at) VALUES (?, ?, ?, ?)").run(
      id, author, body, new Date().toISOString()
    );
  }
  res.redirect(`/clip/${id}`);
});

// --- MULTI-SEJBO 2x2 QUAD STREAM WALL (/multistream) ------------------------
app.get("/multistream", (req, res) => {
  const channels = getAllChannels();
  const slots = [0, 1, 2, 3].map((idx) => channels[idx % channels.length]);

  const body = `
    <div class="section-head">
      <div>
        <h2>🎛️ MULTI-SEJBO QUAD MONITOR WALL</h2>
        <p style="margin:4px 0 0;">Watch 4 simultaneous Sejbosejbo broadcasts at once. Maximum sensory overload.</p>
      </div>
      <a class="button btn-hot" href="/">Back to Single Stage</a>
    </div>
    <div class="multistream-grid">
      ${slots.map((ch, idx) => `
        <div class="multi-slot">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>SLOT #${idx + 1}: ${escapeHtml(ch.name)}</strong>
            <span class="hud-live-badge" style="font-size:12px;padding:1px 7px;">👁️ ${ch.viewers}</span>
          </div>
          <div class="player-frame" style="box-shadow:none;">
            <canvas class="player-canvas" data-synth-canvas data-synth-preset="${escapeHtml(ch.synth_preset)}" data-stream-title="${escapeHtml(ch.title)}"></canvas>
            <div class="player-crt-scanlines"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <span style="font-size:13px;">${escapeHtml(ch.title).slice(0, 56)}...</span>
            <a class="button btn-pink" style="padding:4px 10px;font-size:13px;" href="/live/${encodeURIComponent(ch.slug)}">Open Chat</a>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  res.send(layout({ title: "Multi-Sejbo Quad View", body, req, activeNav: "multistream" }));
});

// --- STREAMER STUDIO & OBS / OWNCAST INGEST (/studio) -----------------------
app.get("/studio", (req, res) => {
  const t = getCopy(req);
  const channels = getAllChannels();
  const selectedSlug = req.query.channel || "sejbosejbo";
  const channel = channels.find((c) => c.slug === selectedSlug) || channels[0];

  const body = `
    <div class="section-head">
      <div>
        <h2>🎥 ${t.studioHeading}</h2>
        <p style="margin:4px 0 0;">${t.studioSub}</p>
      </div>
      <a class="button btn-lime" href="/live/${encodeURIComponent(channel.slug)}">👁️ Open Public Stream Page</a>
    </div>

    <div class="studio-grid" data-broadcaster-studio>
      <!-- LEFT: BROWSER WEBCAM / SCREEN SHARE / SYNTH LIVE BROADCASTER -->
      <div class="brutal-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;">${t.browserBroadcastHeading}</h3>
          <span class="tag-badge" data-studio-status style="background:var(--hot);">STANDBY (READY TO STREAM)</span>
        </div>

        <div class="player-frame" style="margin-bottom:14px;">
          <canvas class="player-canvas" data-studio-canvas data-synth-canvas data-synth-preset="${escapeHtml(channel.synth_preset)}" data-stream-title="${escapeHtml(channel.title)}"></canvas>
          <video class="player-video" data-studio-video autoplay muted playsinline hidden></video>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <button type="button" class="btn-hot" data-start-camera>${t.startCamera}</button>
          <button type="button" class="btn-cyan" data-start-screen>${t.startScreen}</button>
          <button type="button" class="btn-lime" data-start-synth>${t.startSynth}</button>
        </div>

        <div style="display:grid;gap:10px;">
          <label>
            <b>Target Channel to Broadcast Into:</b>
            <select data-studio-channel>
              ${channels.map((ch) => `<option value="${escapeHtml(ch.slug)}" ${ch.slug === channel.slug ? "selected" : ""}>${escapeHtml(ch.name)} (/live/${escapeHtml(ch.slug)})</option>`).join("")}
            </select>
          </label>
          <label>
            <b>Live Lower-Third Banner Text (Rendered on Stream):</b>
            <input type="text" data-studio-overlay value="CERTIFIED SEJBOSEJBO BROADCAST — VOTE ▲ SEJ BO!">
          </label>
          <div style="display:flex;gap:10px;margin-top:6px;">
            <button type="button" class="btn-danger" style="font-size:20px;padding:12px 22px;width:100%;" data-studio-golive>${t.goLiveBtn}</button>
            <button type="button" class="btn-hot" style="font-size:20px;padding:12px 22px;width:100%;" data-studio-stop hidden>${t.stopLiveBtn}</button>
          </div>
        </div>
      </div>

      <!-- RIGHT: OBS STUDIO / OWNCAST RTMP & CHANNEL SETTINGS -->
      <div style="display:grid;gap:18px;align-content:start;">
        <div class="brutal-box">
          <h3>📡 ${t.obsConfigHeading}</h3>
          <p style="font-size:14px;">Stream from <b>OBS Studio</b>, <b>Streamlabs</b>, or <b>Owncast/MediaMTX</b> relay:</p>
          <div style="display:grid;gap:10px;">
            <div>
              <b style="font-size:14px;">${t.rtmpUrlLabel}:</b>
              <div class="code-box">rtmp://${escapeHtml(req.hostname || "localhost")}:1935/live</div>
            </div>
            <div>
              <b style="font-size:14px;">${t.streamKeyLabel} (${escapeHtml(channel.slug)}):</b>
              <div class="code-box">${escapeHtml(channel.stream_key)}</div>
            </div>
          </div>

          <form method="POST" action="/studio/update" style="display:grid;gap:10px;margin-top:16px;border-top:3px solid var(--line);padding-top:14px;">
            <input type="hidden" name="slug" value="${escapeHtml(channel.slug)}">
            <label><b>Stream Title</b><input type="text" name="title" value="${escapeHtml(channel.title)}"></label>
            <label><b>Category</b><input type="text" name="category" value="${escapeHtml(channel.category)}"></label>
            <label><b>Pinned Chat Banner</b><input type="text" name="pinned_message" value="${escapeHtml(channel.pinned_message)}"></label>
            <label><b>${t.hlsUrlLabel}</b>
              <input type="text" name="hls_url" value="${escapeHtml(channel.hls_url)}" placeholder="https://your-owncast-or-hls-server/hls/stream.m3u8">
            </label>
            <button type="submit" class="btn-pink">💾 SAVE STREAM SETTINGS</button>
          </form>
        </div>

        <div class="brutal-box">
          <h3>📊 START A LIVE CHAT PREDICTION</h3>
          <form method="POST" action="/studio/poll" style="display:grid;gap:10px;">
            <input type="hidden" name="channel_slug" value="${escapeHtml(channel.slug)}">
            <label><b>Question</b><input type="text" name="question" required placeholder="WILL THE SALAD SURVIVE 60 SECONDS IN THE MICROWAVE?"></label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <label><b>Option A</b><input type="text" name="option_a" value="100% SEJ BO"></label>
              <label><b>Option B</b><input type="text" name="option_b" value="SEJ NE BO (COOKED)"></label>
            </div>
            <button type="submit" class="btn-lime">📊 LAUNCH LIVE POLL</button>
          </form>
        </div>
      </div>
    </div>
  `;

  res.send(layout({ title: t.studioHeading, body, req, activeNav: "studio", activeChannelSlug: channel.slug }));
});

app.post("/studio/update", (req, res) => {
  const slug = String(req.body.slug || "sejbosejbo");
  const title = String(req.body.title || "").trim().slice(0, 140);
  const category = String(req.body.category || "Just Sejbosejbo").trim().slice(0, 48);
  const pinned = String(req.body.pinned_message || "").trim().slice(0, 200);
  const hlsUrl = String(req.body.hls_url || "").trim().slice(0, 300);

  db.prepare(`
    UPDATE channels
    SET title = COALESCE(NULLIF(?, ''), title),
        category = ?,
        pinned_message = ?,
        hls_url = ?
    WHERE slug = ?
  `).run(title, category, pinned, hlsUrl, slug);

  res.redirect(`/live/${encodeURIComponent(slug)}`);
});

app.post("/studio/poll", (req, res) => {
  const slug = String(req.body.channel_slug || "sejbosejbo");
  const question = String(req.body.question || "IS THIS SEJBOSEJBO?").trim().slice(0, 120);
  const optA = String(req.body.option_a || "SEJ BO").trim().slice(0, 40);
  const optB = String(req.body.option_b || "SEJ NE BO").trim().slice(0, 40);

  db.prepare("UPDATE polls SET status = 'closed' WHERE channel_slug = ?").run(slug);
  db.prepare(`
    INSERT INTO polls (channel_slug, question, option_a, option_b, votes_a, votes_b, status, created_at)
    VALUES (?, ?, ?, ?, 1, 1, 'open', ?)
  `).run(slug, question, optA, optB, new Date().toISOString());

  res.redirect(`/live/${encodeURIComponent(slug)}`);
});

// --- THE SWEAT / BOTTLE CAP 24/7 LIVE SHRINE (/sweat) -----------------------
app.get("/sweat", (req, res) => {
  const t = getCopy(req);
  const worships = getMetaInt("cap_worships", 4209);

  const body = `
    <div class="brutal-box" style="background:#0d0d12;color:#fff;border-color:var(--hot);box-shadow:8px 8px 0 var(--pink);padding:24px;">
      <div style="text-align:center;max-width:780px;margin:0 auto 20px;">
        <span class="tag-badge" style="background:var(--danger);color:#fff;">CLASSIFIED 24/7 BOTTLE CAP FEED</span>
        <h1 style="font-size:clamp(32px,5vw,58px);color:var(--hot);margin:10px 0;">🧢 ${t.sweatHeading}</h1>
        <p style="font-size:19px;">${t.sweatSub}</p>
      </div>

      <div class="player-frame" style="max-width:860px;margin:0 auto 24px;border-color:var(--hot);">
        <canvas class="player-canvas" data-synth-canvas data-synth-preset="sweat_rift" data-stream-title="THE BOTTLE CAP — 0 BLINKS — NOT FOR SALE"></canvas>
        <div class="player-crt-scanlines"></div>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <button type="button" class="btn-hot" style="font-size:26px;padding:16px 32px;" data-bow-cap-btn>
          🙇 BOW TO THE BOTTLE CAP (+10 🧢)
        </button>
        <p style="font-size:20px;font-weight:900;margin-top:12px;">
          The Bottle Cap has been bowed to <span data-bow-cap-count style="color:var(--hot);">${worships.toLocaleString("en-US")}</span> times.
        </p>
      </div>

      <div class="grid-clips" style="margin-top:24px;">
        <div class="brutal-box" style="background:#181822;color:#fff;border-color:var(--cyan);">
          <div style="font-size:13px;color:var(--cyan);">BOTTLE CAPS OWNED</div>
          <div style="font-size:32px;font-weight:900;">1 (ONE)</div>
          <div style="font-size:13px;opacity:0.75;">Offers made: ∞. Offers accepted: 0.</div>
        </div>
        <div class="brutal-box" style="background:#181822;color:#fff;border-color:var(--pink);">
          <div style="font-size:13px;color:var(--pink);">VERIFIED RANK</div>
          <div style="font-size:32px;font-weight:900;">ABOVE THE CHART</div>
          <div style="font-size:13px;opacity:0.75;">The ladder ran out. He kept climbing.</div>
        </div>
        <div class="brutal-box" style="background:#181822;color:#fff;border-color:var(--lime);">
          <div style="font-size:13px;color:var(--lime);">KDA & BLINK RATE</div>
          <div style="font-size:32px;font-weight:900;">YES / 0.00</div>
          <div style="font-size:13px;opacity:0.75;">He bought the whole ISP so nobody could unplug the router.</div>
        </div>
      </div>
    </div>
  `;

  res.send(layout({ title: "THE SWEAT — Bottle Cap Cam", body, req, activeNav: "sweat", activeChannelSlug: "the_sweat" }));
});

// --- ADMIN MODERATION & STREAM CONTROL (/admin) -----------------------------
app.get("/admin", (req, res) => {
  const channels = getAllChannels();
  const clips = db.prepare("SELECT * FROM clips ORDER BY id DESC LIMIT 20").all();

  const body = `
    <div class="section-head">
      <h2>🛡️ SEJBOSEJBO.TV ADMIN & MODERATION</h2>
    </div>
    <div class="studio-grid">
      <div class="brutal-box">
        <h3>📡 CHANNELS & STREAM KEYS</h3>
        <div style="display:grid;gap:12px;">
          ${channels.map((ch) => `
            <div style="border:2px solid var(--line);padding:10px;background:var(--panel-alt);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${escapeHtml(ch.name)} (/live/${escapeHtml(ch.slug)})</strong>
                <span class="tag-badge">⚡ ${ch.sejbometer}%</span>
              </div>
              <div style="font-family:monospace;font-size:13px;margin:6px 0;">Key: ${escapeHtml(ch.stream_key)}</div>
              <form method="POST" action="/admin/channel-action" style="display:flex;gap:6px;flex-wrap:wrap;">
                <input type="hidden" name="slug" value="${escapeHtml(ch.slug)}">
                <button type="submit" name="action" value="clear_chat" class="btn-hot" style="font-size:12px;padding:4px 8px;">🧹 Clear Chat</button>
                <button type="submit" name="action" value="max_meter" class="btn-pink" style="font-size:12px;padding:4px 8px;">🚨 Force 100% Sejbometer</button>
                <button type="submit" name="action" value="regen_key" class="btn-lime" style="font-size:12px;padding:4px 8px;">🔑 New Stream Key</button>
              </form>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="brutal-box">
        <h3>✂️ MANAGE CLIPS (${clips.length})</h3>
        <div style="display:grid;gap:8px;">
          ${clips.map((c) => `
            <div style="display:flex;justify-content:space-between;align-items:center;border:2px solid var(--line);padding:8px;">
              <div>
                <strong>#${c.id} ${escapeHtml(c.title)}</strong>
                <div style="font-size:12px;">by ${escapeHtml(c.creator)} &middot; ▲ ${c.upvotes} ▼ ${c.downvotes}</div>
              </div>
              <form method="POST" action="/admin/delete-clip">
                <input type="hidden" name="id" value="${c.id}">
                <button type="submit" class="btn-danger" style="font-size:12px;padding:4px 8px;">Delete</button>
              </form>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  res.send(layout({ title: "Admin Dashboard", body, req, activeNav: "admin" }));
});

app.post("/admin/channel-action", (req, res) => {
  const { slug, action } = req.body;
  if (action === "clear_chat") {
    db.prepare("DELETE FROM chat_messages WHERE channel_slug = ?").run(slug);
  } else if (action === "max_meter") {
    db.prepare("UPDATE channels SET sejbo_up = 500, sejbo_down = 1 WHERE slug = ?").run(slug);
    broadcastToChannel(slug, {
      type: "alert",
      reward: "siren",
      author: "ADMIN",
      text: "🚨 ADMIN OVERRIDE: 100% MAXIMUM SEJBOSEJBO ACTIVATED! 🚨"
    });
  } else if (action === "regen_key") {
    const newKey = "sejbo_live_" + crypto.randomBytes(12).toString("hex");
    db.prepare("UPDATE channels SET stream_key = ? WHERE slug = ?").run(newKey, slug);
  }
  res.redirect("/admin");
});

app.post("/admin/delete-clip", (req, res) => {
  const id = Number(req.body.id);
  db.prepare("DELETE FROM clips WHERE id = ?").run(id);
  res.redirect("/admin");
});

// --- JSON REST API (/api/v1/* — Owncast & Sejbosejbo App Compatible) --------
app.get("/health", (_req, res) => res.json({ ok: true, service: "sejbosejbo-live", version: VERSION }));

app.get("/api/v1/status", (_req, res) => {
  const channels = getAllChannels();
  const main = channels[0];
  res.json({
    online: Boolean(main?.is_live),
    viewerCount: main?.viewers || 0,
    streamTitle: main?.title || "SEJBOSEJBO.TV",
    sejbometer: main?.sejbometer || 100,
    version: VERSION,
    channels
  });
});

app.get("/api/v1/channels", (_req, res) => {
  res.json({ channels: getAllChannels() });
});

app.post("/api/v1/channels/:slug/vote", (req, res) => {
  const slug = req.params.slug;
  const dir = req.body?.direction === "down" ? "down" : "up";
  if (dir === "up") {
    db.prepare("UPDATE channels SET sejbo_up = sejbo_up + 1 WHERE slug = ?").run(slug);
  } else {
    db.prepare("UPDATE channels SET sejbo_down = sejbo_down + 1 WHERE slug = ?").run(slug);
  }
  const ch = db.prepare("SELECT * FROM channels WHERE slug = ?").get(slug);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  const sejbometer = computeSejbometer(ch);
  broadcastToChannel(slug, {
    type: "meter",
    sejbometer,
    sejboUp: ch.sejbo_up,
    sejboDown: ch.sejbo_down
  });
  res.json({ ok: true, sejbometer, sejboUp: ch.sejbo_up, sejboDown: ch.sejbo_down });
});

app.post("/api/v1/polls/:id/vote", (req, res) => {
  const id = Number(req.params.id);
  const opt = req.body?.option === "b" ? "b" : "a";
  if (opt === "a") {
    db.prepare("UPDATE polls SET votes_a = votes_a + 1 WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE polls SET votes_b = votes_b + 1 WHERE id = ?").run(id);
  }
  const poll = db.prepare("SELECT * FROM polls WHERE id = ?").get(id);
  if (poll) {
    broadcastToChannel(poll.channel_slug, { type: "poll_update", poll });
  }
  res.json({ ok: true, poll });
});

app.post("/api/v1/clips/instant", (req, res) => {
  const slug = String(req.body?.channel_slug || "sejbosejbo");
  const ch = db.prepare("SELECT * FROM channels WHERE slug = ?").get(slug);
  const title = String(req.body?.title || "Instant Sejbosejbo Clip").trim().slice(0, 120);
  const creator = String(req.body?.creator || "AnonSejbo").trim().slice(0, 32);
  const posterData = String(req.body?.poster_data || "").startsWith("data:image/")
    ? String(req.body.poster_data).slice(0, 500000)
    : "";

  const info = db.prepare(`
    INSERT INTO clips (
      channel_slug, channel_name, title, description, creator,
      filename, poster_data, synth_preset, duration_sec, views, upvotes, downvotes, featured, created_at
    ) VALUES (?, ?, ?, 'Captured live from stream.', ?, '', ?, ?, 24, 1, 1, 0, 0, ?)
  `).run(
    slug,
    ch ? ch.name : "SEJBOSEJBO OFFICIAL",
    title,
    creator,
    posterData,
    ch ? ch.synth_preset : "sejbo_tv",
    new Date().toISOString()
  );

  res.json({ ok: true, id: Number(info.lastInsertRowid), clipUrl: `/clip/${info.lastInsertRowid}` });
});

app.post("/api/v1/clips/:id/vote", (req, res) => {
  const clipId = Number(req.params.id);
  const deviceId = String(req.get("X-Device-Id") || "anon").slice(0, 64);
  const value = [1, -1, 0].includes(Number(req.body?.value)) ? Number(req.body.value) : 0;

  if (value === 0) {
    db.prepare("DELETE FROM clip_votes WHERE clip_id = ? AND device_id = ?").run(clipId, deviceId);
  } else {
    db.prepare(`
      INSERT INTO clip_votes (clip_id, device_id, value) VALUES (?, ?, ?)
      ON CONFLICT(clip_id, device_id) DO UPDATE SET value = excluded.value
    `).run(clipId, deviceId, value);
  }

  const up = db.prepare("SELECT COUNT(*) as c FROM clip_votes WHERE clip_id = ? AND value = 1").get(clipId).c;
  const down = db.prepare("SELECT COUNT(*) as c FROM clip_votes WHERE clip_id = ? AND value = -1").get(clipId).c;
  db.prepare("UPDATE clips SET upvotes = ?, downvotes = ? WHERE id = ?").run(up, down, clipId);

  res.json({ ok: true, id: clipId, upvotes: up, downvotes: down });
});

app.post("/api/v1/cap/worship", (_req, res) => {
  const count = incrementMeta("cap_worships", 1, 4209);
  res.json({ ok: true, count });
});

server.listen(PORT, () => {
  console.log(`[SEJBOSEJBO.TV] Live Streaming Server running at http://localhost:${PORT}`);
});
