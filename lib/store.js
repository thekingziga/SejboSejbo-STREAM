const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const uploadDir = path.join(rootDir, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const dbPath = path.join(dataDir, "sejbolive.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    avatar_color TEXT NOT NULL DEFAULT '#ff66cc',
    banner_accent TEXT NOT NULL DEFAULT '#ffe03d',
    bio TEXT NOT NULL DEFAULT '',
    is_live INTEGER NOT NULL DEFAULT 1,
    stream_mode TEXT NOT NULL DEFAULT 'synth',
    synth_preset TEXT NOT NULL DEFAULT 'sejbo_tv',
    hls_url TEXT NOT NULL DEFAULT '',
    stream_key TEXT NOT NULL,
    viewers_base INTEGER NOT NULL DEFAULT 42,
    followers INTEGER NOT NULL DEFAULT 120,
    sejbo_up INTEGER NOT NULL DEFAULT 18,
    sejbo_down INTEGER NOT NULL DEFAULT 3,
    slow_mode_sec INTEGER NOT NULL DEFAULT 0,
    pinned_message TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_slug TEXT NOT NULL,
    author TEXT NOT NULL,
    color TEXT NOT NULL,
    badge TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    is_alert INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_slug TEXT NOT NULL,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    votes_a INTEGER NOT NULL DEFAULT 0,
    votes_b INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    winner TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_slug TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    creator TEXT NOT NULL DEFAULT 'AnonSejbo',
    filename TEXT NOT NULL DEFAULT '',
    poster_data TEXT NOT NULL DEFAULT '',
    synth_preset TEXT NOT NULL DEFAULT 'sejbo_tv',
    duration_sec INTEGER NOT NULL DEFAULT 24,
    views INTEGER NOT NULL DEFAULT 1,
    upvotes INTEGER NOT NULL DEFAULT 0,
    downvotes INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clip_votes (
    clip_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    PRIMARY KEY (clip_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS clip_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clip_id INTEGER NOT NULL,
    author TEXT NOT NULL DEFAULT 'Anon',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function getMetaInt(key, fallback = 0) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(key, String(fallback));
    return fallback;
  }
  return Number(row.value) || fallback;
}

function setMetaInt(key, val) {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(val));
  return val;
}

function incrementMeta(key, delta = 1, initial = 0) {
  const next = getMetaInt(key, initial) + delta;
  return setMetaInt(key, next);
}

function seedIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) as c FROM channels").get().c;
  if (count > 0) return;

  const now = new Date().toISOString();

  setMetaInt("visits", 14820);
  setMetaInt("cap_worships", 4209);

  const insertChannel = db.prepare(`
    INSERT INTO channels (
      slug, name, title, category, tags, avatar_color, banner_accent, bio,
      is_live, stream_mode, synth_preset, hls_url, stream_key,
      viewers_base, followers, sejbo_up, sejbo_down, slow_mode_sec, pinned_message, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertChannel.run(
    "sejbosejbo",
    "SEJBOSEJBO OFFICIAL",
    "🔴 24/7 CERTIFIED SEJBOSEJBO ARENA — MICROWAVING ICE & TESTING VIBES LIVE",
    "Just Sejbosejbo",
    JSON.stringify(["SLO/ENG", "CHAOS", "OWNCAST", "100% SEJBO"]),
    "#ff66cc",
    "#ffe03d",
    "The official flagship Owncast/Twitch style broadcast of sejbosejbo.fyi. Streaming from a Raspberry Pi in a flat in Slovenia.",
    1,
    "synth",
    "sejbo_tv",
    "",
    "sejbo_live_" + crypto.randomBytes(12).toString("hex"),
    184,
    4290,
    92,
    8,
    0,
    "WELCOME TO SEJBOSEJBO.TV! Vote ▲ SEJ BO or ▼ SEJ NE BO below the player to push the Sejbometer to 100%!",
    new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  );

  insertChannel.run(
    "the_sweat",
    "THE SWEAT (SWEATMATIC)",
    "👁️ [NO BLINK CAM] SOLO QUEUE + LIVE BOTTLE CAP SECURITY FEED (DO NOT OFFER TO BUY)",
    "League of Legends / Bottle Cap",
    JSON.stringify(["NO TILT", "1 BOTTLE CAP", "ABOVE THE CHART", "RIFT"]),
    "#ffe03d",
    "#ff66cc",
    "He does not tilt. He does not blink. He does not sell the cap. Verified rank: above the chart.",
    1,
    "synth",
    "sweat_rift",
    "",
    "sejbo_live_" + crypto.randomBytes(12).toString("hex"),
    312,
    9999,
    144,
    2,
    0,
    "RULE #1: Do not ask how much for the bottle cap. It is not for sale.",
    new Date(Date.now() - 19 * 3600 * 1000).toISOString()
  );

  insertChannel.run(
    "microwave_lab",
    "DR. MIKROVALOVKA",
    "🔬 SCIENTIFIC EXPERIMENT #402: CAN WE INSTALL CHROME TO DOWNLOAD EDGE ON A TOASTER?",
    "Science & Technology",
    JSON.stringify(["SCIENCE", "BRAIN.EXE", "HIGH VOLTAGE", "SLOVENIA"]),
    "#77f7ff",
    "#c4f24a",
    "Peer-reviewed questionable experiments conducted live in 60fps.",
    1,
    "synth",
    "microwave_lab",
    "",
    "sejbo_live_" + crypto.randomBytes(12).toString("hex"),
    67,
    890,
    49,
    6,
    0,
    "Today's hypothesis: Wi-Fi is 94% wireless electricity.",
    new Date(Date.now() - 1.5 * 3600 * 1000).toISOString()
  );

  insertChannel.run(
    "klet_fm",
    "KLET LO-FI & MEME RADIO",
    "🎵 24/7 SEJBOSEJBO ANTHEM BASS BOOSTED BEATS TO FAIL VIBES TO",
    "Music & Chaos",
    JSON.stringify(["24/7 RADIO", "BASS", "NO THOUGHTS", "CHILL"]),
    "#c4f24a",
    "#77f7ff",
    "Non-stop radio waves straight from the basement. Zero thoughts, maximum bass.",
    1,
    "synth",
    "klet_radio",
    "",
    "sejbo_live_" + crypto.randomBytes(12).toString("hex"),
    41,
    640,
    38,
    1,
    0,
    "Press the 🔊 icon in the top bar or unmute the stream for pure sonic Sejbosejbo.",
    new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  );

  // Seed initial chat messages
  const insertChat = db.prepare(`
    INSERT INTO chat_messages (channel_slug, author, color, badge, body, is_alert, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleChats = [
    ["sejbosejbo", "KraljZiga", "#ff66cc", "STREAMER", "Welcome to SEJBOSEJBO.TV! Go crazy with the Sejbometer™! :sejbo: :cap:", 0],
    ["sejbosejbo", "BurekEnjoyer", "#5fe3f0", "VIP", "Wait did he actually microwave a bowl of ice cubes on live stream?? :microwave: :brain:", 0],
    ["sejbosejbo", "LjubljanaGhost", "#ffe03d", "MOD", "Chat remember: 100% on the Sejbometer triggers the siren across all connected browsers :sejbo:", 0],
    ["sejbosejbo", "Krompir144p", "#c4f24a", "", "To je certificiran Sejbosejbo. 10/10 stream.", 0],
    ["sejbosejbo", "SweatWatcher", "#ff7a2f", "CERTIFIED", "Is the bottle cap safe? I need an update :cap: :sweat:", 0],
    ["the_sweat", "CapCollector", "#ffe03d", "VIP", "I offered €50,000 for the bottle cap. He didn't even blink. :cap:", 0],
    ["the_sweat", "RiftHistorian", "#ff66cc", "MOD", "Hour 19 of the session. 0 blinks recorded. KDA: yes. :sweat:", 0],
    ["microwave_lab", "FizikIzKleti", "#77f7ff", "STREAMER", "Stand back chat, we are overclocking the salad spinner :microwave:", 0],
    ["klet_fm", "VibeInspector", "#c4f24a", "VIP", "The vibes were tested. They failed. Beats go hard though :sejbo:", 0]
  ];

  for (const [slug, author, color, badge, body, isAlert] of sampleChats) {
    insertChat.run(slug, author, color, badge, body, isAlert, now);
  }

  // Seed active polls
  const insertPoll = db.prepare(`
    INSERT INTO polls (channel_slug, question, option_a, option_b, votes_a, votes_b, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `);
  insertPoll.run("sejbosejbo", "IS THIS NEXT MOVE OFFICIALLY SEJBOSEJBO?", "100% SEJ BO (CERTIFIED)", "SEJ NE BO (COOKED)", 64, 19, now);
  insertPoll.run("the_sweat", "WILL HE BLINK BEFORE 24 HOURS?", "NO (HE DOES NOT BLINK)", "YES (IMPOSSIBLE)", 412, 3, now);

  // Seed initial Clips / VODs
  const insertClip = db.prepare(`
    INSERT INTO clips (
      channel_slug, channel_name, title, description, creator,
      filename, poster_data, synth_preset, duration_sec, views, upvotes, downvotes, featured, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertClip.run(
    "sejbosejbo",
    "SEJBOSEJBO OFFICIAL",
    "Someone asked if Wi-Fi is wireless electricity LIVE ON AIR",
    "Chat completely lost it and pushed the Sejbometer past 100% in 4 seconds flat.",
    "BurekEnjoyer",
    "",
    "",
    "sejbo_tv",
    28,
    1420,
    189,
    4,
    1,
    new Date(Date.now() - 86400 * 1000 * 2).toISOString()
  );

  insertClip.run(
    "the_sweat",
    "THE SWEAT (SWEATMATIC)",
    "THE €100,000 BOTTLE CAP OFFER REJECTION (0 BLINKS)",
    "Someone donated asking to inspect the bottle cap. He stared directly into the 4K lens for 45 seconds.",
    "CapCollector",
    "",
    "",
    "sweat_rift",
    45,
    3890,
    412,
    1,
    1,
    new Date(Date.now() - 86400 * 1000).toISOString()
  );

  insertClip.run(
    "microwave_lab",
    "DR. MIKROVALOVKA",
    "Microwaving a Caesar Salad for Science (DO NOT TRY)",
    "Peak human intelligence achieved at 00:14 when the lettuce started glowing cyan.",
    "FizikIzKleti",
    "",
    "",
    "microwave_lab",
    19,
    640,
    95,
    7,
    0,
    new Date(Date.now() - 3600 * 1000 * 6).toISOString()
  );

  insertClip.run(
    "klet_fm",
    "KLET LO-FI & MEME RADIO",
    "When the Sejbosejbo bass drop hits at 3AM in Ljubljana",
    "The neighbors knocked on the radiator in rhythm.",
    "LjubljanaGhost",
    "",
    "",
    "klet_radio",
    32,
    510,
    74,
    2,
    0,
    new Date(Date.now() - 3600 * 1000 * 12).toISOString()
  );

  const insertClipComment = db.prepare(`
    INSERT INTO clip_comments (clip_id, author, body, created_at)
    VALUES (?, ?, ?, ?)
  `);
  insertClipComment.run(1, "Krompir144p", "Tega se ne da odvideti. Certificiran Sejbosejbo.", now);
  insertClipComment.run(1, "AnonimniGledalec", "I was there live when the siren went off, my headphones flew across the room.", now);
  insertClipComment.run(2, "SweatFan", "The cap remains. Bow to the cap.", now);
}

seedIfNeeded();

module.exports = {
  db,
  rootDir,
  dataDir,
  uploadDir,
  getMetaInt,
  setMetaInt,
  incrementMeta
};
