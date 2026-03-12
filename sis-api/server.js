// ─────────────────────────────────────────────────────────────────────────────
// SIS API — server.js  (Complete v2)
// Express + SQLite — All dashboard modules wired
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors    = require("cors");
const path    = require("path");
require("dotenv").config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "../database/sis.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error("❌ SQLite:", err.message); process.exit(1); }
  console.log("✅ Connected to SQLite:", DB_PATH);
  initDB();
});

// ── Helper: wrap db.run in a promise ──────────────────────────────────────────
const dbRun = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (err) { err ? rej(err) : res(this); })
  );

const dbGet = (sql, params = []) =>
  new Promise((res, rej) =>
    db.get(sql, params, (err, row) => { err ? rej(err) : res(row); })
  );

const dbAll = (sql, params = []) =>
  new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => { err ? rej(err) : res(rows); })
  );

// ── Initialize Tables ─────────────────────────────────────────────────────────
function initDB() {
  db.serialize(() => {

    // ── Stats ─────────────────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS guild_stats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      TEXT    NOT NULL,
      member_count  INTEGER NOT NULL DEFAULT 0,
      channel_count INTEGER NOT NULL DEFAULT 0,
      voice_users   INTEGER NOT NULL DEFAULT 0,
      online_count  INTEGER NOT NULL DEFAULT 0,
      boost_count   INTEGER NOT NULL DEFAULT 0,
      role_count    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_stats_guild_time
      ON guild_stats (guild_id, created_at DESC)`);

    // ── Pending Commands (bot polls this) ─────────────────────────────────────
    // Dashboard → API inserts row → Bot picks up → executes → marks done
    db.run(`CREATE TABLE IF NOT EXISTS pending_commands (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      action     TEXT NOT NULL,   -- 'ban'|'unban'|'kick'|'timeout'|'untimeout'|'mute'|'unmute'
      target_id  TEXT NOT NULL,   -- Discord user ID to act on
      reason     TEXT,
      duration   INTEGER,         -- seconds, for timeout / temp roles
      role_id    TEXT,            -- for add_role / remove_role actions
      status     TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'done'|'failed'
      error      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // ── AutoMod Config ────────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS automod_config (
      guild_id           TEXT PRIMARY KEY,
      bad_words          INTEGER NOT NULL DEFAULT 0,
      repeated_text      INTEGER NOT NULL DEFAULT 0,
      discord_invites    INTEGER NOT NULL DEFAULT 0,
      external_links     INTEGER NOT NULL DEFAULT 0,
      excessive_caps     INTEGER NOT NULL DEFAULT 0,
      excessive_spoilers INTEGER NOT NULL DEFAULT 0,
      mass_mentions      INTEGER NOT NULL DEFAULT 0,
      anti_spam          INTEGER NOT NULL DEFAULT 1,
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    )`);

    // ── Protection Config ─────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS protection_config (
      guild_id              TEXT PRIMARY KEY,
      dm_on_punishment      INTEGER NOT NULL DEFAULT 1,
      anti_ban              INTEGER NOT NULL DEFAULT 0,
      anti_kick             INTEGER NOT NULL DEFAULT 0,
      anti_role             INTEGER NOT NULL DEFAULT 0,
      anti_channel          INTEGER NOT NULL DEFAULT 0,
      anti_webhook          INTEGER NOT NULL DEFAULT 0,
      anti_role_create      INTEGER NOT NULL DEFAULT 0,
      anti_role_delete      INTEGER NOT NULL DEFAULT 0,
      anti_role_rename      INTEGER NOT NULL DEFAULT 0,
      anti_dangerous_role   INTEGER NOT NULL DEFAULT 0,
      anti_channel_create   INTEGER NOT NULL DEFAULT 0,
      anti_channel_delete   INTEGER NOT NULL DEFAULT 0,
      anti_channel_rename   INTEGER NOT NULL DEFAULT 0,
      anti_server_rename    INTEGER NOT NULL DEFAULT 0,
      anti_server_icon      INTEGER NOT NULL DEFAULT 0,
      anti_bot_add          INTEGER NOT NULL DEFAULT 0,
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // ── Welcomer Config ───────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS welcomer_config (
      guild_id              TEXT PRIMARY KEY,
      welcome_enabled       INTEGER NOT NULL DEFAULT 1,
      welcome_channel_id    TEXT,
      welcome_img_enabled   INTEGER NOT NULL DEFAULT 1,
      welcome_embed         TEXT,   -- JSON
      goodbye_enabled       INTEGER NOT NULL DEFAULT 0,
      goodbye_channel_id    TEXT,
      goodbye_embed         TEXT,   -- JSON
      greet_enabled         INTEGER NOT NULL DEFAULT 0,
      greet_embed           TEXT,   -- JSON
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // ── Leveling Config ───────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS leveling_config (
      guild_id              TEXT PRIMARY KEY,
      enabled               INTEGER NOT NULL DEFAULT 1,
      min_xp                INTEGER NOT NULL DEFAULT 15,
      max_xp                INTEGER NOT NULL DEFAULT 25,
      cooldown_sec          INTEGER NOT NULL DEFAULT 60,
      xp_type               TEXT    NOT NULL DEFAULT 'text',
      stack_roles           INTEGER NOT NULL DEFAULT 0,
      announcement_channel  TEXT,
      channel_levelup_msg   INTEGER NOT NULL DEFAULT 1,
      enable_lvl_msg        INTEGER NOT NULL DEFAULT 1,
      msg_type              TEXT    NOT NULL DEFAULT 'Embed',
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // ── Moderation Logs ───────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS moderation_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL DEFAULT 'Unknown',
      mod_type   TEXT NOT NULL,   -- 'ban'|'unban'|'kick'|'timeout'|'mute'|'warn'
      reason     TEXT,
      role_id    TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_mod_guild_type
      ON moderation_logs (guild_id, mod_type, created_at DESC)`);

    console.log("✅ All tables initialized");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────
const GUILD_ID = process.env.GUILD_ID || "1477991011484438651";

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — HEALTH
// ─────────────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "online", project: "SIS API", version: "2.0.0" });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — STATS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/stats  — bot pushes stats
app.post("/api/stats", async (req, res) => {
  const { guildId, memberCount = 0, channelCount = 0, voiceUsers = 0,
          onlineCount = 0, boostCount = 0, roleCount = 0 } = req.body;
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    const result = await dbRun(
      `INSERT INTO guild_stats (guild_id, member_count, channel_count, voice_users, online_count, boost_count, role_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [guildId, memberCount, channelCount, voiceUsers, onlineCount, boostCount, roleCount]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error("[POST /api/stats]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats  — dashboard reads stats + history
app.get("/api/stats", async (req, res) => {
  const { guildId = GUILD_ID, limit = 100 } = req.query;
  try {
    const latest  = await dbGet(`SELECT * FROM guild_stats WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1`, [guildId]);
    const history = await dbAll(`SELECT member_count, voice_users, online_count, created_at FROM guild_stats WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`, [guildId, Number(limit)]);
    res.json({ latest: latest || null, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/server  — dashboard main data fetch
app.get("/api/server", async (req, res) => {
  const guildId = GUILD_ID;
  try {
    const row = await dbGet(`SELECT * FROM guild_stats WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1`, [guildId]);
    res.json({
      serverId:   guildId,
      serverName: process.env.SERVER_NAME || "SIS Server",
      serverIcon: null,
      userName:   "",
      userAvatar: null,
      stats: {
        members:      row?.member_count  || 0,
        messages:     0,
        interactions: 0,
        joins:        0,
        leaves:       0,
        voiceUsers:   row?.voice_users   || 0,
        onlineCount:  row?.online_count  || 0,
        boostCount:   row?.boost_count   || 0,
        roleCount:    row?.role_count    || 0,
        channelCount: row?.channel_count || 0,
        membersChange: null, messagesChange: null,
        interactionsChange: null, joinsChange: null, leavesChange: null,
      },
      charts: { joinPoints: [], leavePoints: [], msgPoints: [],
                interactionPoints: [], voicePoints: [], chartDates: [] },
      topMembers: [], topChannels: [],
      embedMessages: [], tempVoiceChannels: [],
      bans: [], mutes: [], timeouts: [], tempRoles: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — AUTOMOD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/automod
app.get("/api/automod", async (req, res) => {
  const { guildId = GUILD_ID } = req.query;
  try {
    const row = await dbGet(`SELECT * FROM automod_config WHERE guild_id = ?`, [guildId]);
    if (!row) return res.json({ guild_id: guildId, bad_words: 0, repeated_text: 0,
      discord_invites: 0, external_links: 0, excessive_caps: 0,
      excessive_spoilers: 0, mass_mentions: 0, anti_spam: 1 });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automod
app.post("/api/automod", async (req, res) => {
  const { guildId = GUILD_ID, badWords = 0, repeatedText = 0, discordInvites = 0,
          externalLinks = 0, excessiveCaps = 0, excessiveSpoilers = 0,
          massMentions = 0, antiSpam = 1 } = req.body;
  try {
    await dbRun(
      `INSERT INTO automod_config (guild_id, bad_words, repeated_text, discord_invites, external_links, excessive_caps, excessive_spoilers, mass_mentions, anti_spam, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         bad_words=excluded.bad_words, repeated_text=excluded.repeated_text,
         discord_invites=excluded.discord_invites, external_links=excluded.external_links,
         excessive_caps=excluded.excessive_caps, excessive_spoilers=excluded.excessive_spoilers,
         mass_mentions=excluded.mass_mentions, anti_spam=excluded.anti_spam,
         updated_at=excluded.updated_at`,
      [guildId, badWords ? 1 : 0, repeatedText ? 1 : 0, discordInvites ? 1 : 0,
       externalLinks ? 1 : 0, excessiveCaps ? 1 : 0, excessiveSpoilers ? 1 : 0,
       massMentions ? 1 : 0, antiSpam ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/protection
app.get("/api/protection", async (req, res) => {
  const { guildId = GUILD_ID } = req.query;
  try {
    const row = await dbGet(`SELECT * FROM protection_config WHERE guild_id = ?`, [guildId]);
    res.json(row || { guild_id: guildId, dm_on_punishment: 1, anti_ban: 0,
      anti_kick: 0, anti_role: 0, anti_channel: 0, anti_webhook: 0,
      anti_role_create: 0, anti_role_delete: 0, anti_role_rename: 0,
      anti_dangerous_role: 0, anti_channel_create: 0, anti_channel_delete: 0,
      anti_channel_rename: 0, anti_server_rename: 0, anti_server_icon: 0, anti_bot_add: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/protection
app.post("/api/protection", async (req, res) => {
  const { guildId = GUILD_ID, ...fields } = req.body;
  const toInt = v => (v ? 1 : 0);
  try {
    await dbRun(
      `INSERT INTO protection_config (guild_id, dm_on_punishment, anti_ban, anti_kick, anti_role, anti_channel, anti_webhook, anti_role_create, anti_role_delete, anti_role_rename, anti_dangerous_role, anti_channel_create, anti_channel_delete, anti_channel_rename, anti_server_rename, anti_server_icon, anti_bot_add, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         dm_on_punishment=excluded.dm_on_punishment, anti_ban=excluded.anti_ban,
         anti_kick=excluded.anti_kick, anti_role=excluded.anti_role,
         anti_channel=excluded.anti_channel, anti_webhook=excluded.anti_webhook,
         anti_role_create=excluded.anti_role_create, anti_role_delete=excluded.anti_role_delete,
         anti_role_rename=excluded.anti_role_rename, anti_dangerous_role=excluded.anti_dangerous_role,
         anti_channel_create=excluded.anti_channel_create, anti_channel_delete=excluded.anti_channel_delete,
         anti_channel_rename=excluded.anti_channel_rename, anti_server_rename=excluded.anti_server_rename,
         anti_server_icon=excluded.anti_server_icon, anti_bot_add=excluded.anti_bot_add,
         updated_at=excluded.updated_at`,
      [guildId,
        toInt(fields.dmOnPunishment), toInt(fields.antiBan), toInt(fields.antiKick),
        toInt(fields.antiRole), toInt(fields.antiChannel), toInt(fields.antiWebhook),
        toInt(fields.antiRoleCreate), toInt(fields.antiRoleDelete), toInt(fields.antiRoleRename),
        toInt(fields.antiDangerousRole), toInt(fields.antiChannelCreate),
        toInt(fields.antiChannelDelete), toInt(fields.antiChannelRename),
        toInt(fields.antiServerRename), toInt(fields.antiServerIcon), toInt(fields.antiBotAdd)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — WELCOMER
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/welcomer
app.get("/api/welcomer", async (req, res) => {
  const { guildId = GUILD_ID } = req.query;
  try {
    const row = await dbGet(`SELECT * FROM welcomer_config WHERE guild_id = ?`, [guildId]);
    res.json(row || { guild_id: guildId, welcome_enabled: 1, welcome_channel_id: null,
      welcome_img_enabled: 1, welcome_embed: null, goodbye_enabled: 0,
      goodbye_channel_id: null, goodbye_embed: null, greet_enabled: 0, greet_embed: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/welcomer
app.post("/api/welcomer", async (req, res) => {
  const { guildId = GUILD_ID, welcomeEnabled = 1, welcomeChannelId = null,
          welcomeImgEnabled = 1, welcomeEmbed = null, goodbyeEnabled = 0,
          goodbyeChannelId = null, goodbyeEmbed = null, greetEnabled = 0, greetEmbed = null } = req.body;
  try {
    await dbRun(
      `INSERT INTO welcomer_config (guild_id, welcome_enabled, welcome_channel_id, welcome_img_enabled, welcome_embed, goodbye_enabled, goodbye_channel_id, goodbye_embed, greet_enabled, greet_embed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         welcome_enabled=excluded.welcome_enabled, welcome_channel_id=excluded.welcome_channel_id,
         welcome_img_enabled=excluded.welcome_img_enabled, welcome_embed=excluded.welcome_embed,
         goodbye_enabled=excluded.goodbye_enabled, goodbye_channel_id=excluded.goodbye_channel_id,
         goodbye_embed=excluded.goodbye_embed, greet_enabled=excluded.greet_enabled,
         greet_embed=excluded.greet_embed, updated_at=excluded.updated_at`,
      [guildId, welcomeEnabled ? 1 : 0, welcomeChannelId,
       welcomeImgEnabled ? 1 : 0, welcomeEmbed ? JSON.stringify(welcomeEmbed) : null,
       goodbyeEnabled ? 1 : 0, goodbyeChannelId,
       goodbyeEmbed ? JSON.stringify(goodbyeEmbed) : null,
       greetEnabled ? 1 : 0, greetEmbed ? JSON.stringify(greetEmbed) : null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — LEVELING
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/leveling
app.get("/api/leveling", async (req, res) => {
  const { guildId = GUILD_ID } = req.query;
  try {
    const row = await dbGet(`SELECT * FROM leveling_config WHERE guild_id = ?`, [guildId]);
    res.json(row || { guild_id: guildId, enabled: 1, min_xp: 15, max_xp: 25,
      cooldown_sec: 60, xp_type: 'text', stack_roles: 0,
      announcement_channel: null, channel_levelup_msg: 1,
      enable_lvl_msg: 1, msg_type: 'Embed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leveling
app.post("/api/leveling", async (req, res) => {
  const { guildId = GUILD_ID, enabled = 1, minXP = 15, maxXP = 25,
          cooldown = 60, xpType = 'text', stackRoles = 0,
          announcementChannel = null, channelLevelupMsg = 1,
          enableLvlMsg = 1, msgType = 'Embed' } = req.body;
  try {
    await dbRun(
      `INSERT INTO leveling_config (guild_id, enabled, min_xp, max_xp, cooldown_sec, xp_type, stack_roles, announcement_channel, channel_levelup_msg, enable_lvl_msg, msg_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         enabled=excluded.enabled, min_xp=excluded.min_xp, max_xp=excluded.max_xp,
         cooldown_sec=excluded.cooldown_sec, xp_type=excluded.xp_type,
         stack_roles=excluded.stack_roles, announcement_channel=excluded.announcement_channel,
         channel_levelup_msg=excluded.channel_levelup_msg, enable_lvl_msg=excluded.enable_lvl_msg,
         msg_type=excluded.msg_type, updated_at=excluded.updated_at`,
      [guildId, enabled ? 1 : 0, minXP, maxXP, cooldown, xpType,
       stackRoles ? 1 : 0, announcementChannel, channelLevelupMsg ? 1 : 0,
       enableLvlMsg ? 1 : 0, msgType]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — MODERATION (Dashboard → queue → Bot executes)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/moderation  — dashboard queues an action
app.post("/api/moderation", async (req, res) => {
  const { guildId = GUILD_ID, action, targetId, targetUsername = "Unknown",
          reason = "No reason provided", duration, roleId } = req.body;

  if (!action || !targetId) {
    return res.status(400).json({ error: "action and targetId are required" });
  }

  const validActions = ["ban", "unban", "kick", "timeout", "untimeout", "mute", "unmute"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
  }

  try {
    // Queue the command for the bot to pick up
    const cmd = await dbRun(
      `INSERT INTO pending_commands (guild_id, action, target_id, reason, duration, role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, action, targetId, reason, duration || null, roleId || null]
    );

    // Log it in moderation_logs
    await dbRun(
      `INSERT INTO moderation_logs (guild_id, user_id, username, mod_type, reason, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, targetId, targetUsername, action, reason,
       duration ? new Date(Date.now() + duration * 1000).toISOString() : null]
    );

    res.json({ success: true, commandId: cmd.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/moderation  — dashboard reads moderation logs
app.get("/api/moderation", async (req, res) => {
  const { guildId = GUILD_ID, type } = req.query;
  try {
    const whereType = type ? `AND mod_type = '${type}'` : "";
    const rows = await dbAll(
      `SELECT * FROM moderation_logs WHERE guild_id = ? ${whereType} ORDER BY created_at DESC LIMIT 100`,
      [guildId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/moderation/:id  — remove a log entry
app.delete("/api/moderation/:id", async (req, res) => {
  try {
    await dbRun(`DELETE FROM moderation_logs WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — PENDING COMMANDS (Bot polls these)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/commands/pending  — bot polls this every 3 seconds
app.get("/api/commands/pending", async (req, res) => {
  const { guildId = GUILD_ID } = req.query;
  try {
    const rows = await dbAll(
      `SELECT * FROM pending_commands WHERE guild_id = ? AND status = 'pending' ORDER BY created_at ASC`,
      [guildId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/commands/:id  — bot marks command done or failed
app.patch("/api/commands/:id", async (req, res) => {
  const { status, error } = req.body;  // status: 'done' | 'failed'
  try {
    await dbRun(
      `UPDATE pending_commands SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, error || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ SIS API running on http://localhost:${PORT}`);
  console.log(`   Guild: ${GUILD_ID}`);
});