// ─────────────────────────────────────────────────────────────────────────────
// SIS API — server.js
// Express + SQLite — Receives data from control bot, serves dashboard
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
  if (err) {
    console.error("❌ Failed to connect to SQLite:", err.message);
    process.exit(1);
  }
  console.log("✅ Connected to SQLite:", DB_PATH);
  initDB();
});

// ── Initialize Tables ─────────────────────────────────────────────────────────
function initDB() {
  db.serialize(() => {

    // Guild stats — one row per push from the bot
    db.run(`
      CREATE TABLE IF NOT EXISTS guild_stats (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id     TEXT    NOT NULL,
        member_count INTEGER NOT NULL DEFAULT 0,
        channel_count INTEGER NOT NULL DEFAULT 0,
        voice_users  INTEGER NOT NULL DEFAULT 0,
        online_count INTEGER NOT NULL DEFAULT 0,
        boost_count  INTEGER NOT NULL DEFAULT 0,
        role_count   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Index for fast queries by guild and time
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_stats_guild_time
      ON guild_stats (guild_id, created_at DESC)
    `);

    console.log("✅ Database tables ready");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "online", project: "SIS API", version: "1.0.0" });
});

// ── POST /api/stats ───────────────────────────────────────────────────────────
// Called by the control bot every 5 minutes and on key events
app.post("/api/stats", (req, res) => {
  const {
    guildId,
    memberCount  = 0,
    channelCount = 0,
    voiceUsers   = 0,
    onlineCount  = 0,
    boostCount   = 0,
    roleCount    = 0,
  } = req.body;

  if (!guildId) {
    return res.status(400).json({ error: "guildId is required" });
  }

  const sql = `
    INSERT INTO guild_stats
      (guild_id, member_count, channel_count, voice_users, online_count, boost_count, role_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [guildId, memberCount, channelCount, voiceUsers, onlineCount, boostCount, roleCount], function (err) {
    if (err) {
      console.error("[POST /api/stats] DB error:", err.message);
      return res.status(500).json({ error: "Failed to save stats" });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
// Returns the latest snapshot + last 7 days of history for charts
app.get("/api/stats", (req, res) => {
  const { guildId, limit = 100 } = req.query;

  if (!guildId) {
    return res.status(400).json({ error: "guildId is required" });
  }

  // Latest snapshot
  const latestSQL = `
    SELECT * FROM guild_stats
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

  // Last N rows for chart history (newest first, dashboard reverses)
  const historySQL = `
    SELECT member_count, voice_users, online_count, created_at
    FROM guild_stats
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `;

  db.get(latestSQL, [guildId], (err, latest) => {
    if (err) {
      console.error("[GET /api/stats] DB error:", err.message);
      return res.status(500).json({ error: "Failed to fetch stats" });
    }

    db.all(historySQL, [guildId, Number(limit)], (err2, history) => {
      if (err2) {
        console.error("[GET /api/stats] History error:", err2.message);
        return res.status(500).json({ error: "Failed to fetch history" });
      }

      res.json({
        latest:  latest  || null,
        history: history || [],
      });
    });
  });
});

// ── GET /api/server ───────────────────────────────────────────────────────────
// Used by the dashboard SISControlPanel component (ServerDataContext)
app.get("/api/server", (req, res) => {
  const guildId = process.env.GUILD_ID;

  const sql = `
    SELECT * FROM guild_stats
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.get(sql, [guildId], (err, row) => {
    if (err) {
      console.error("[GET /api/server] DB error:", err.message);
      return res.status(500).json({ error: "Database error" });
    }

    // Shape the response to match DEFAULT_SERVER_DATA in the dashboard
    res.json({
      serverId:   guildId,
      serverName: process.env.SERVER_NAME || "SIS Server",
      serverIcon: null,
      userName:   "",
      userAvatar: null,
      stats: {
        members:           row?.member_count  || 0,
        messages:          0,   // future: track via bot events
        interactions:      0,   // future: track via bot events
        joins:             0,   // future: track via guild_events table
        leaves:            0,
        membersChange:     null,
        messagesChange:    null,
        interactionsChange:null,
        joinsChange:       null,
        leavesChange:      null,
      },
      charts: {
        joinPoints:        [],
        leavePoints:       [],
        msgPoints:         [],
        interactionPoints: [],
        voicePoints:       [],
        chartDates:        [],
      },
      topMembers:        [],
      topChannels:       [],
      embedMessages:     [],
      tempVoiceChannels: [],
      bans:    [],
      mutes:   [],
      timeouts:[],
      tempRoles:[],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Future routes (stubs — implement when dashboard pages are ready)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automod   → push automod config to bot
// POST /api/welcome   → update welcome message
// POST /api/leveling  → update leveling settings
// POST /api/voice     → update temp voice config

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ SIS API running on http://localhost:${PORT}`);
});