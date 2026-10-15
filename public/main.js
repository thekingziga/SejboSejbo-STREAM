// ============================================================================
// SEJBOSEJBO.TV — Client Runtime (Theme, Music, Live WebSocket, Synth, Studio)
// ============================================================================

const DEVICE_ID_KEY = "sejbosejbo_device_id";
const NICK_KEY = "sejbosejbo_nick";
const COLOR_KEY = "sejbosejbo_color";
const CAPS_KEY = "sejbosejbo_caps";

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "dev_" + Math.random().toString(36).slice(2));
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getCapsBalance() {
  const val = parseInt(localStorage.getItem(CAPS_KEY) || "150", 10);
  return Number.isNaN(val) ? 150 : val;
}

function setCapsBalance(val) {
  const next = Math.max(0, Math.floor(val));
  localStorage.setItem(CAPS_KEY, String(next));
  document.querySelectorAll("[data-caps-balance]").forEach((el) => {
    el.textContent = next.toLocaleString("en-US");
  });
  return next;
}

setCapsBalance(getCapsBalance());

// --- Theme Toggle (identical to sejbosejbo.fyi) -----------------------------
(() => {
  const KEY = "sejbosejbo_theme";
  const toggle = document.querySelector("[data-theme-toggle]");
  const icon = document.querySelector("[data-theme-icon]");
  if (!toggle || !icon) return;

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function paint() {
    const dark = isDark();
    icon.textContent = dark ? "☀️" : "🌙";
    toggle.setAttribute("aria-pressed", String(dark));
  }

  toggle.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(KEY, next); } catch {}
    paint();
  });

  paint();
})();

// --- Theme Music Toggle (theme.m4a / theme.mp3) -----------------------------
(() => {
  const btn = document.querySelector("[data-music-toggle]");
  const icon = document.querySelector("[data-music-icon]");
  const audio = document.querySelector("[data-music-audio]");
  if (!btn || !audio) return;

  btn.hidden = false;
  btn.addEventListener("click", async () => {
    if (audio.paused) {
      try {
        await audio.play();
        btn.setAttribute("aria-pressed", "true");
        if (icon) icon.textContent = "🔊";
      } catch {}
    } else {
      audio.pause();
      btn.setAttribute("aria-pressed", "false");
      if (icon) icon.textContent = "🔈";
    }
  });
})();

// --- WebAudio Chaos SFX Generator -------------------------------------------
let audioCtx = null;
let sfxMuted = false;

function playChaosSfx(kind) {
  if (sfxMuted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;

    if (kind === "siren") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.25);
      osc.frequency.linearRampToValueAtTime(440, now + 0.5);
      osc.frequency.linearRampToValueAtTime(920, now + 0.75);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.85);
    } else if (kind === "microwave") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2050, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (kind === "brain") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(160, now + 0.12);
      osc.frequency.setValueAtTime(90, now + 0.24);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (kind === "cap") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(528, now);
      osc.frequency.exponentialRampToValueAtTime(264, now + 0.7);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.75);
    }
  } catch {}
}

// --- Emote Parser -----------------------------------------------------------
const EMOTE_MAP = {
  ":sejbo:": "🎭 SEJBO",
  ":nebo:": "🚫 NE BO",
  ":cap:": "🧢 CAP",
  ":sweat:": "💦 SWEAT",
  ":brain:": "🧠 BRAIN.EXE",
  ":microwave:": "⚡ MICROWAVE",
  ":cat:": "🐱 MEOW",
  ":fire:": "🔥 100%"
};

function escapeHtmlClient(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMessageBody(raw) {
  let safe = escapeHtmlClient(raw);
  for (const [code, label] of Object.entries(EMOTE_MAP)) {
    const reg = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    safe = safe.replace(reg, `<span class="emote-token">${label}</span>`);
  }
  return safe;
}

// --- Procedural 60fps Canvas Stream Synthesizer -----------------------------
const logoImg = new Image();
logoImg.src = "/public/logo.png";

function attachSynthCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const preset = canvas.dataset.synthPreset || "sejbo_tv";
  const titleText = canvas.dataset.streamTitle || "SEJBOSEJBO LIVE";
  let t = Math.random() * 100;
  let dvdX = 80, dvdY = 60, dvdVx = 2.4, dvdVy = 1.9;
  let lastOverlayMsg = "CERTIFIED SEJBOSEJBO SIGNAL";
  let glitchFrames = 0;

  canvas._triggerGlitch = (msg) => {
    glitchFrames = 45;
    if (msg) lastOverlayMsg = msg;
  };

  function draw() {
    const w = canvas.width = canvas.clientWidth ? Math.min(960, Math.max(480, canvas.clientWidth)) : 640;
    const h = canvas.height = Math.round(w * 9 / 16);
    t += 0.03;

    // Background
    if (preset === "sweat_rift") {
      ctx.fillStyle = "#08090f";
      ctx.fillRect(0, 0, w, h);
      // Grid radar lines
      ctx.strokeStyle = "rgba(255, 224, 61, 0.16)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Rotating Bottle Cap Shrine in center
      ctx.save();
      ctx.translate(w / 2, h / 2 - 10);
      const r = Math.min(w, h) * 0.22;
      // Ridges of the bottle cap
      ctx.rotate(t * 0.45);
      for (let i = 0; i < 21; i++) {
        const ang = (i / 21) * Math.PI * 2;
        ctx.fillStyle = i % 2 === 0 ? "#ffe03d" : "#ff7a2f";
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }
      ctx.fillStyle = "#ffe03d";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#000";
      ctx.stroke();

      ctx.rotate(-t * 0.45);
      ctx.fillStyle = "#000";
      ctx.font = `900 ${Math.round(r * 0.28)}px "Comic Sans MS", "Comic Neue", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("THE CAP", 0, -4);
      ctx.font = `700 ${Math.round(r * 0.19)}px "Comic Sans MS", "Comic Neue", sans-serif`;
      ctx.fillText("NOT FOR SALE", 0, r * 0.28);
      ctx.restore();

      // Telemetry text
      ctx.fillStyle = "#5fe3f0";
      ctx.font = `900 14px monospace`;
      ctx.fillText(`BLINKS: 0 | TILT: 0.00% | SWEAT: ${(14.2 + Math.sin(t) * 0.05).toFixed(3)} L`, 16, h - 48);
      ctx.fillStyle = "#ff66cc";
      ctx.fillText(`VALUATION: ∞ EUR | LP: ABOVE THE CHART`, 16, h - 26);

    } else if (preset === "microwave_lab") {
      ctx.fillStyle = "#071418";
      ctx.fillRect(0, 0, w, h);

      // Microwave window frame
      const mwW = w * 0.62, mwH = h * 0.58;
      const mwX = (w - mwW) / 2, mwY = (h - mwH) / 2 - 10;
      ctx.fillStyle = "#102830";
      ctx.fillRect(mwX, mwY, mwW, mwH);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#5fe3f0";
      ctx.strokeRect(mwX, mwY, mwW, mwH);

      // Rotating ice cubes / salad on turntable
      ctx.save();
      ctx.translate(w / 2, mwY + mwH * 0.62);
      ctx.scale(1, 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, mwW * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(95, 227, 240, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#ffe03d";
      ctx.lineWidth = 4;
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const a = t * 1.6 + (i * Math.PI / 2);
        const ix = Math.cos(a) * mwW * 0.16;
        const iy = Math.sin(a) * mwW * 0.16;
        ctx.fillStyle = i % 2 === 0 ? "#77f7ff" : "#c4f24a";
        ctx.fillRect(ix - 18, iy - 18, 36, 36);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(ix - 18, iy - 18, 36, 36);
      }
      ctx.restore();

      // Plasma arcs
      ctx.strokeStyle = "#ff66cc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = mwX + 12; x < mwX + mwW - 12; x += 8) {
        const y = mwY + mwH * 0.35 + Math.sin(x * 0.08 + t * 5) * 18;
        if (x === mwX + 12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = "#ffe03d";
      ctx.font = `900 15px "Comic Sans MS", "Comic Neue", sans-serif`;
      ctx.fillText(`⚡ CORE TEMP: ${(420 + Math.sin(t * 3) * 19).toFixed(1)}°C | ICE STATUS: CONFUSED`, 16, h - 26);

    } else if (preset === "klet_radio") {
      ctx.fillStyle = "#150b1e";
      ctx.fillRect(0, 0, w, h);

      // 28-bar brutalist spectrum visualizer
      const bars = 24;
      const barW = (w - 80) / bars;
      const colors = ["#ffe03d", "#ff66cc", "#5fe3f0", "#c4f24a", "#ff7a2f"];
      for (let i = 0; i < bars; i++) {
        const amp = Math.abs(Math.sin(t * 2.2 + i * 0.45) * Math.cos(t * 1.3 - i * 0.2));
        const bh = Math.max(14, amp * (h * 0.55));
        const bx = 40 + i * barW;
        const by = h - 55 - bh;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(bx, by, barW - 5, bh);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, barW - 5, bh);
      }

      ctx.fillStyle = "#c4f24a";
      ctx.font = `900 18px "Comic Sans MS", "Comic Neue", sans-serif`;
      ctx.fillText("🎵 NOW PLAYING: SEJBOSEJBO.FYI OFFICIAL ANTHEM (BASS BOOSTED)", 20, 42);

    } else {
      // Default flagship: sejbo_tv (Bouncing Cat Logo + Sejbometer Oscilloscope)
      ctx.fillStyle = "#101018";
      ctx.fillRect(0, 0, w, h);

      // Diagonal Neo-Brutalist background stripes
      ctx.fillStyle = "rgba(255, 102, 204, 0.08)";
      for (let i = -h; i < w; i += 48) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 24, 0);
        ctx.lineTo(i + 24 + h, h);
        ctx.lineTo(i + h, h);
        ctx.closePath();
        ctx.fill();
      }

      // Bouncing DVD Cat Logo box
      const boxS = Math.min(w, h) * 0.25;
      dvdX += dvdVx;
      dvdY += dvdVy;
      if (dvdX <= 12 || dvdX + boxS >= w - 12) dvdVx *= -1;
      if (dvdY <= 42 || dvdY + boxS >= h - 56) dvdVy *= -1;
      dvdX = Math.max(12, Math.min(w - boxS - 12, dvdX));
      dvdY = Math.max(42, Math.min(h - boxS - 56, dvdY));

      ctx.fillStyle = "#ffe03d";
      ctx.fillRect(dvdX + 5, dvdY + 5, boxS, boxS);
      ctx.fillStyle = "#ff66cc";
      ctx.fillRect(dvdX, dvdY, boxS, boxS);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#000";
      ctx.strokeRect(dvdX, dvdY, boxS, boxS);

      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.drawImage(logoImg, dvdX + 8, dvdY + 8, boxS - 16, boxS - 16);
      } else {
        ctx.fillStyle = "#000";
        ctx.font = "900 18px sans-serif";
        ctx.fillText("SEJBO", dvdX + 12, dvdY + boxS / 2);
      }

      // Live Waveform
      ctx.strokeStyle = "#5fe3f0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 20; x < w - 20; x += 6) {
        const y = h * 0.5 + Math.sin(x * 0.03 + t * 3) * 26 * Math.cos(t + x * 0.01);
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Glitch / Alert flash
    if (glitchFrames > 0) {
      glitchFrames--;
      ctx.fillStyle = glitchFrames % 4 < 2 ? "rgba(255, 224, 61, 0.28)" : "rgba(255, 102, 204, 0.28)";
      ctx.fillRect(0, 0, w, h);
    }

    // Brutalist Lower-Third Ticker Bar on Stream
    const barH = 34;
    ctx.fillStyle = "#ffe03d";
    ctx.fillRect(0, h - barH, w, barH);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, h - barH);
    ctx.lineTo(w, h - barH);
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.font = `900 ${Math.max(12, Math.round(w * 0.021))}px "Comic Sans MS", "Comic Neue", sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`⚡ ${lastOverlayMsg} — ${titleText}`.slice(0, 78), 12, h - 11);

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}

document.querySelectorAll("[data-synth-canvas]").forEach(attachSynthCanvas);

// --- Live Stream Workspace (WebSocket, Chat, Polls, Sejbometer, Alerts) -----
(() => {
  const workspace = document.querySelector("[data-stream-workspace]");
  if (!workspace) return;

  const channelSlug = workspace.dataset.channelSlug || "sejbosejbo";
  const hlsUrl = workspace.dataset.hlsUrl || "";
  const mainCanvas = workspace.querySelector("[data-main-stream-canvas]");
  const liveImg = workspace.querySelector("[data-live-broadcaster-img]");
  const hlsVideo = workspace.querySelector("[data-hls-video]");
  const viewerCountEls = document.querySelectorAll(`[data-viewer-count="${channelSlug}"], [data-main-viewers]`);
  const meterFill = workspace.querySelector("[data-meter-fill]");
  const meterLabel = workspace.querySelector("[data-meter-label]");
  const upSpan = workspace.querySelector("[data-sejbo-up]");
  const downSpan = workspace.querySelector("[data-sejbo-down]");
  const alertOverlay = workspace.querySelector("[data-alert-overlay]");
  const emojiLayer = workspace.querySelector("[data-emoji-layer]");
  const chatList = workspace.querySelector("[data-chat-messages]");
  const chatForm = workspace.querySelector("[data-chat-form]");
  const chatInput = workspace.querySelector("[data-chat-input]");
  const nickInput = workspace.querySelector("[data-chat-nick]");
  const pinnedBanner = workspace.querySelector("[data-pinned-banner]");

  // Restore saved nickname & color
  const PALETTE = ["#ff66cc", "#5fe3f0", "#ffe03d", "#c4f24a", "#ff7a2f"];
  let userColor = localStorage.getItem(COLOR_KEY);
  if (!userColor) {
    userColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    localStorage.setItem(COLOR_KEY, userColor);
  }
  if (nickInput) {
    nickInput.value = localStorage.getItem(NICK_KEY) || `Sejbo_${Math.floor(100 + Math.random() * 899)}`;
    nickInput.addEventListener("change", () => {
      localStorage.setItem(NICK_KEY, nickInput.value.trim() || "AnonSejbo");
    });
  }

  // Render initial chat messages
  if (chatList) {
    chatList.querySelectorAll("[data-raw-body]").forEach((el) => {
      el.innerHTML = renderMessageBody(el.dataset.rawBody);
    });
    chatList.scrollTop = chatList.scrollHeight;
  }

  // Optional HLS playback (Owncast / OBS RTMP-to-HLS stream)
  if (hlsUrl && hlsVideo) {
    hlsVideo.hidden = false;
    if (mainCanvas) mainCanvas.hidden = true;
    if (hlsVideo.canPlayType("application/vnd.apple.mpegurl")) {
      hlsVideo.src = hlsUrl;
    } else if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(hlsVideo);
    } else {
      hlsVideo.src = hlsUrl;
    }
  }

  function spawnFloatingEmoji(emoji, xPct = 50) {
    if (!emojiLayer) return;
    const span = document.createElement("span");
    span.className = "floating-emoji";
    span.textContent = emoji;
    span.style.left = `${xPct}%`;
    emojiLayer.appendChild(span);
    setTimeout(() => span.remove(), 2300);
  }

  function showStreamAlert(text, reward = "siren") {
    playChaosSfx(reward);
    if (mainCanvas && mainCanvas._triggerGlitch) {
      mainCanvas._triggerGlitch(text);
    }
    document.body.classList.remove("screen-shake");
    void document.body.offsetWidth;
    document.body.classList.add("screen-shake");

    if (alertOverlay) {
      alertOverlay.textContent = text;
      alertOverlay.hidden = false;
      clearTimeout(alertOverlay._hideTimer);
      alertOverlay._hideTimer = setTimeout(() => {
        alertOverlay.hidden = true;
      }, 4200);
    }

    if (reward === "confetti" || reward === "siren") {
      const icons = ["🎭", "🧢", "⚡", "🔥", "💦", "🧠"];
      for (let i = 0; i < 16; i++) {
        setTimeout(() => {
          spawnFloatingEmoji(icons[i % icons.length], 10 + Math.random() * 80);
        }, i * 90);
      }
    }
  }

  function updateMeterUI(pct, up, down) {
    if (meterFill) {
      meterFill.style.width = `${pct}%`;
      meterFill.classList.toggle("maxed", pct >= 95);
    }
    if (meterLabel) {
      meterLabel.textContent = pct >= 95 ? `${pct}% — MAXIMUM SEJBOSEJBO!!` : `${pct}% SEJBOSEJBO`;
    }
    if (upSpan && typeof up === "number") upSpan.textContent = up;
    if (downSpan && typeof down === "number") downSpan.textContent = down;
  }

  function appendChatMessage(m) {
    if (!chatList) return;
    const div = document.createElement("div");
    div.className = "chat-msg" + (m.is_alert ? " alert-msg" : "");
    const badgeHtml = m.badge
      ? `<span class="chat-badge ${escapeHtmlClient(m.badge)}">${escapeHtmlClient(m.badge)}</span>`
      : "";
    div.innerHTML = `${badgeHtml}<span class="chat-author" style="color:${escapeHtmlClient(m.color || "#ff66cc")}">${escapeHtmlClient(m.author)}:</span> <span>${renderMessageBody(m.body)}</span>`;
    chatList.appendChild(div);
    while (chatList.children.length > 150) {
      chatList.removeChild(chatList.firstChild);
    }
    chatList.scrollTop = chatList.scrollHeight;
  }

  // Connect WebSocket
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  let ws;
  function connectWs() {
    ws = new WebSocket(`${proto}//${location.host}/ws?channel=${encodeURIComponent(channelSlug)}`);

    ws.addEventListener("message", (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "init") {
        viewerCountEls.forEach((el) => { el.textContent = data.viewers; });
        updateMeterUI(data.sejbometer, data.sejboUp, data.sejboDown);
        if (data.liveFrame && liveImg) {
          liveImg.src = data.liveFrame;
          liveImg.hidden = false;
          if (mainCanvas) mainCanvas.hidden = true;
        }
      } else if (data.type === "viewers") {
        viewerCountEls.forEach((el) => { el.textContent = data.viewers; });
      } else if (data.type === "chat" && data.message) {
        appendChatMessage(data.message);
        if (mainCanvas && mainCanvas._triggerGlitch) {
          mainCanvas._triggerGlitch(`${data.message.author}: ${data.message.body}`);
        }
      } else if (data.type === "meter") {
        updateMeterUI(data.sejbometer, data.sejboUp, data.sejboDown);
        if (data.sejbometer >= 95) {
          showStreamAlert("🚨 100% MAXIMUM SEJBOSEJBO ACHIEVED! 🚨", "siren");
        }
      } else if (data.type === "reaction") {
        spawnFloatingEmoji(data.emoji, data.x || 50);
      } else if (data.type === "alert") {
        if (data.message) appendChatMessage(data.message);
        showStreamAlert(data.text, data.reward);
      } else if (data.type === "live_frame" && liveImg) {
        liveImg.src = data.frame;
        liveImg.hidden = false;
        if (mainCanvas) mainCanvas.hidden = true;
      } else if (data.type === "poll_update" && data.poll) {
        const aSpan = workspace.querySelector("[data-poll-votes-a]");
        const bSpan = workspace.querySelector("[data-poll-votes-b]");
        if (aSpan) aSpan.textContent = data.poll.votes_a;
        if (bSpan) bSpan.textContent = data.poll.votes_b;
      }
    });

    ws.addEventListener("close", () => {
      setTimeout(connectWs, 2500);
    });
  }
  connectWs();

  // Earn +5 Bottle Caps every 15 seconds watching live!
  setInterval(() => {
    setCapsBalance(getCapsBalance() + 5);
  }, 15000);

  // Send Chat Message
  if (chatForm && chatInput) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const body = chatInput.value.trim();
      if (!body) return;
      const author = (nickInput?.value || "AnonSejbo").trim();
      localStorage.setItem(NICK_KEY, author);

      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "chat",
          author,
          color: userColor,
          badge: "CERTIFIED",
          body,
          deviceId: getDeviceId()
        }));
      }
      chatInput.value = "";
    });
  }

  // Emote Picker Insertion
  workspace.querySelectorAll("[data-insert-emote]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!chatInput) return;
      chatInput.value = `${chatInput.value} ${btn.dataset.insertEmote} `.replace(/^\s+/, "");
      chatInput.focus();
    });
  });

  // Toggle Emotes / Rewards Drawers
  const emotesDrawer = workspace.querySelector("[data-emotes-drawer]");
  const rewardsDrawer = workspace.querySelector("[data-rewards-drawer]");
  workspace.querySelector("[data-toggle-emotes]")?.addEventListener("click", () => {
    if (!emotesDrawer) return;
    emotesDrawer.hidden = !emotesDrawer.hidden;
    if (rewardsDrawer) rewardsDrawer.hidden = true;
  });
  workspace.querySelector("[data-toggle-rewards]")?.addEventListener("click", () => {
    if (!rewardsDrawer) return;
    rewardsDrawer.hidden = !rewardsDrawer.hidden;
    if (emotesDrawer) emotesDrawer.hidden = true;
  });

  // Spend Bottle Caps on Chaos Rewards
  workspace.querySelectorAll("[data-redeem-reward]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cost = parseInt(btn.dataset.cost || "25", 10);
      const reward = btn.dataset.redeemReward;
      const current = getCapsBalance();
      if (current < cost) {
        alert(`Not enough Bottle Caps! You need ${cost} 🧢 (you get +5 🧢 every 15s watching).`);
        return;
      }
      setCapsBalance(current - cost);
      const author = (nickInput?.value || "AnonSejbo").trim();
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "redeem", reward, author }));
      }
    });
  });

  // Live Emoji Reactions
  workspace.querySelectorAll("[data-send-reaction]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.sendReaction;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "reaction", emoji }));
      } else {
        spawnFloatingEmoji(emoji, 40 + Math.random() * 20);
      }
    });
  });

  // Vote on Live Sejbometer (▲ SEJ BO / ▼ SEJ NE BO)
  workspace.querySelectorAll("[data-sejbo-vote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dir = btn.dataset.sejboVote; // "up" or "down"
      try {
        const res = await fetch(`/api/v1/channels/${encodeURIComponent(channelSlug)}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction: dir })
        });
        const data = await res.json();
        if (res.ok) {
          updateMeterUI(data.sejbometer, data.sejboUp, data.sejboDown);
          setCapsBalance(getCapsBalance() + 2);
        }
      } catch {}
    });
  });

  // Vote on Live Poll / Prediction
  workspace.querySelectorAll("[data-poll-vote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pollId = btn.dataset.pollId;
      const option = btn.dataset.pollVote; // "a" or "b"
      try {
        const res = await fetch(`/api/v1/polls/${pollId}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ option })
        });
        const data = await res.json();
        if (res.ok && data.poll) {
          const aSpan = workspace.querySelector("[data-poll-votes-a]");
          const bSpan = workspace.querySelector("[data-poll-votes-b]");
          if (aSpan) aSpan.textContent = data.poll.votes_a;
          if (bSpan) bSpan.textContent = data.poll.votes_b;
        }
      } catch {}
    });
  });

  // Theater Mode, Fullscreen, Mute, Clip That Sejbo
  const toggleTheater = () => {
    document.body.classList.toggle("theater-mode");
  };
  workspace.querySelector("[data-theater-btn]")?.addEventListener("click", toggleTheater);

  const playerFrame = workspace.querySelector("[data-player-frame]");
  workspace.querySelector("[data-fullscreen-btn]")?.addEventListener("click", () => {
    if (!playerFrame) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else playerFrame.requestFullscreen?.();
  });

  const sfxBtn = workspace.querySelector("[data-sfx-mute-btn]");
  sfxBtn?.addEventListener("click", () => {
    sfxMuted = !sfxMuted;
    sfxBtn.textContent = sfxMuted ? "🔇 SFX OFF" : "🔊 SFX ON";
  });

  // Keyboard shortcuts (T for theater, F for fullscreen)
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (e.key.toLowerCase() === "t") toggleTheater();
    if (e.key.toLowerCase() === "f" && playerFrame) {
      if (document.fullscreenElement) document.exitFullscreen();
      else playerFrame.requestFullscreen?.();
    }
  });

  // Instant "✂️ CLIP THAT SEJBO" button
  const clipBtn = workspace.querySelector("[data-clip-stream-btn]");
  clipBtn?.addEventListener("click", async () => {
    clipBtn.disabled = true;
    const origText = clipBtn.textContent;
    clipBtn.textContent = "📸 CLIPPING...";
    try {
      let posterData = "";
      if (mainCanvas && !mainCanvas.hidden) {
        posterData = mainCanvas.toDataURL("image/jpeg", 0.78);
      }
      const creator = (nickInput?.value || "AnonSejbo").trim();
      const titlePrompt = prompt("Name this Sejbosejbo Clip:", `Certified Sejbosejbo moment on ${channelSlug.toUpperCase()}`);
      if (!titlePrompt) {
        clipBtn.disabled = false;
        clipBtn.textContent = origText;
        return;
      }
      const res = await fetch("/api/v1/clips/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_slug: channelSlug,
          title: titlePrompt,
          creator,
          poster_data: posterData
        })
      });
      const payload = await res.json();
      if (res.ok && payload.clipUrl) {
        window.location.assign(payload.clipUrl);
        return;
      }
    } catch {}
    clipBtn.disabled = false;
    clipBtn.textContent = origText;
  });
})();

// --- Clips Voting (▲ Sej bo / ▼ Sej ne bo) ----------------------------------
document.querySelectorAll("[data-clip-vote-widget]").forEach((widget) => {
  const clipId = widget.dataset.clipId;
  const upBtn = widget.querySelector('[data-vote="1"]');
  const downBtn = widget.querySelector('[data-vote="-1"]');
  const upSpan = widget.querySelector("[data-vote-up]");
  const downSpan = widget.querySelector("[data-vote-down]");
  let currentVote = null;

  async function vote(val) {
    const next = currentVote === val ? 0 : val;
    try {
      const res = await fetch(`/api/v1/clips/${clipId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": getDeviceId()
        },
        body: JSON.stringify({ value: next })
      });
      if (!res.ok) return;
      const data = await res.json();
      currentVote = next === 0 ? null : next;
      upBtn?.classList.toggle("active", currentVote === 1);
      downBtn?.classList.toggle("active", currentVote === -1);
      if (upSpan) upSpan.textContent = data.upvotes;
      if (downSpan) downSpan.textContent = data.downvotes;
    } catch {}
  }

  upBtn?.addEventListener("click", (e) => { e.preventDefault(); vote(1); });
  downBtn?.addEventListener("click", (e) => { e.preventDefault(); vote(-1); });
});

// --- Browser Broadcaster Studio (/studio) -----------------------------------
(() => {
  const studio = document.querySelector("[data-broadcaster-studio]");
  if (!studio) return;

  const previewVideo = studio.querySelector("[data-studio-video]");
  const previewCanvas = studio.querySelector("[data-studio-canvas]");
  const channelSelect = studio.querySelector("[data-studio-channel]");
  const overlayInput = studio.querySelector("[data-studio-overlay]");
  const statusBadge = studio.querySelector("[data-studio-status]");
  const goLiveBtn = studio.querySelector("[data-studio-golive]");
  const stopBtn = studio.querySelector("[data-studio-stop]");

  let mediaStream = null;
  let broadcastTimer = null;
  let studioWs = null;
  let sourceMode = "synth";

  studio.querySelector("[data-start-camera]")?.addEventListener("click", async () => {
    try {
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: true });
      previewVideo.srcObject = mediaStream;
      previewVideo.hidden = false;
      sourceMode = "webcam";
    } catch (err) {
      alert("Could not access camera: " + err.message);
    }
  });

  studio.querySelector("[data-start-screen]")?.addEventListener("click", async () => {
    try {
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 960, height: 540 }, audio: true });
      previewVideo.srcObject = mediaStream;
      previewVideo.hidden = false;
      sourceMode = "screen";
    } catch (err) {
      alert("Could not capture screen: " + err.message);
    }
  });

  studio.querySelector("[data-start-synth]")?.addEventListener("click", () => {
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    previewVideo.hidden = true;
    sourceMode = "synth";
  });

  goLiveBtn?.addEventListener("click", () => {
    const slug = channelSelect?.value || "sejbosejbo";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    if (studioWs) studioWs.close();
    studioWs = new WebSocket(`${proto}//${location.host}/ws?channel=${encodeURIComponent(slug)}&role=broadcaster`);

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = 640;
    captureCanvas.height = 360;
    const cctx = captureCanvas.getContext("2d");

    studioWs.addEventListener("open", () => {
      if (statusBadge) {
        statusBadge.textContent = `🔴 BROADCASTING LIVE TO /live/${slug}`;
        statusBadge.style.background = "var(--danger)";
        statusBadge.style.color = "#fff";
      }
      goLiveBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = false;

      broadcastTimer = setInterval(() => {
        if (!studioWs || studioWs.readyState !== 1) return;
        if (sourceMode !== "synth" && !previewVideo.hidden && previewVideo.readyState >= 2) {
          cctx.drawImage(previewVideo, 0, 0, 640, 360);
        } else if (previewCanvas) {
          cctx.drawImage(previewCanvas, 0, 0, 640, 360);
        }
        const overlayText = overlayInput?.value.trim() || "";
        if (overlayText) {
          cctx.fillStyle = "#ffe03d";
          cctx.fillRect(0, 322, 640, 38);
          cctx.strokeStyle = "#000";
          cctx.lineWidth = 3;
          cctx.strokeRect(0, 322, 640, 38);
          cctx.fillStyle = "#000";
          cctx.font = '900 18px "Comic Sans MS", sans-serif';
          cctx.fillText(overlayText, 12, 347);
        }
        const frame = captureCanvas.toDataURL("image/jpeg", 0.62);
        studioWs.send(JSON.stringify({
          type: "broadcaster_frame",
          mode: sourceMode,
          overlayText,
          frame
        }));
      }, 220);
    });
  });

  stopBtn?.addEventListener("click", () => {
    clearInterval(broadcastTimer);
    if (studioWs) studioWs.close();
    if (statusBadge) {
      statusBadge.textContent = "STANDBY (READY TO STREAM)";
      statusBadge.style.background = "var(--hot)";
      statusBadge.style.color = "#000";
    }
    goLiveBtn.hidden = false;
    stopBtn.hidden = true;
  });
})();

// --- Bottle Cap Shrine Worship (/sweat) -------------------------------------
(() => {
  const btn = document.querySelector("[data-bow-cap-btn]");
  const countEl = document.querySelector("[data-bow-cap-count]");
  if (!btn || !countEl) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const res = await fetch("/api/v1/cap/worship", { method: "POST" });
      const data = await res.json();
      if (res.ok && typeof data.count === "number") {
        countEl.textContent = data.count.toLocaleString("en-US");
        playChaosSfx("cap");
        setCapsBalance(getCapsBalance() + 10);
      }
    } catch {}
    btn.disabled = false;
  });
})();
