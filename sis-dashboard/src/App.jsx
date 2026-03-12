import { useState, useEffect, createContext, useContext } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SERVER CONSTANTS — Single-server mode
// ─────────────────────────────────────────────────────────────────────────────
const SERVER_ID   = "YOUR_DISCORD_SERVER_ID";
const SERVER_NAME = "SIS Server";

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND API
// Future endpoints: POST /api/automod, POST /api/welcome, POST /api/voice, POST /api/leveling
// ─────────────────────────────────────────────────────────────────────────────
const GUILD_ID  = "1477991011484438651";
const API_BASE  = "http://localhost:3001";

async function fetchServerData() {
  // Fetch both endpoints in parallel
  const [serverRes, statsRes] = await Promise.all([
    fetch(`${API_BASE}/api/server?guildId=${GUILD_ID}`),
    fetch(`${API_BASE}/api/stats?guildId=${GUILD_ID}`),
  ]);
  const server = await serverRes.json();
  const stats  = await statsRes.json();

  // Map snake_case API fields → camelCase context shape
  const latest = stats?.latest || {};
  return {
    ...server,
    stats: {
      members:           latest.member_count  ?? server?.stats?.members      ?? 0,
      messages:          latest.message_count ?? server?.stats?.messages     ?? 0,
      interactions:      server?.stats?.interactions ?? 0,
      joins:             server?.stats?.joins        ?? 0,
      leaves:            server?.stats?.leaves       ?? 0,
      voiceUsers:        latest.voice_users   ?? 0,
      onlineCount:       latest.online_count  ?? 0,
      boostCount:        latest.boost_count   ?? 0,
      roleCount:         latest.role_count    ?? 0,
      channelCount:      latest.channel_count ?? 0,
      membersChange:     server?.stats?.membersChange      ?? null,
      messagesChange:    server?.stats?.messagesChange     ?? null,
      interactionsChange:server?.stats?.interactionsChange ?? null,
      joinsChange:       server?.stats?.joinsChange        ?? null,
      leavesChange:      server?.stats?.leavesChange       ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER DATA LAYER
// All dynamic data lives here. Pass the result of fetchServerData()
// as the `serverData` prop to <SISControlPanel /> to populate the UI.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SERVER_DATA = {
  // ── Identity ──────────────────────────────────────────────────────────────
  serverId:       SERVER_ID,      // string  | Discord guild ID
  serverName:     SERVER_NAME,    // string  | Guild name
  serverIcon:     null,           // string  | Icon URL
  userName:       "",             // string  | Logged-in user display name
  userAvatar:     null,           // string  | User avatar URL

  // ── Overview Stats ────────────────────────────────────────────────────────
  stats: {
    members:      0,              // number
    messages:     0,              // number
    interactions: 0,              // number
    joins:        0,              // number
    leaves:       0,              // number
    membersChange:     null,      // string | e.g. "+12.5%"
    messagesChange:    null,
    interactionsChange:null,
    joinsChange:       null,
    leavesChange:      null,
  },

  // ── Charts (arrays of data points) ───────────────────────────────────────
  charts: {
    joinPoints:          [],      // number[]
    leavePoints:         [],      // number[]
    msgPoints:           [],      // number[]
    interactionPoints:   [],      // number[]
    voicePoints:         [],      // number[]
    chartDates:          [],      // string[] | x-axis labels
  },

  // ── Top Members & Channels ────────────────────────────────────────────────
  topMembers:     [],             // { rank, name, msgs, xp, invites }[]
  topXP:          [],             // { rank, name, xp }[]
  topInvites:     [],             // { rank, name, invites }[]
  topChannels:    [],             // { rank, name, msgs }[]
  topCommands:    [],             // { rank, name, uses }[]
  activeHours:    [],             // { hour, count }[]

  // ── Server Config ─────────────────────────────────────────────────────────
  botLanguage:    "en",           // string
  logChannel:     null,           // string | channel name
  levelUpChannel: null,           // string | channel name
  whitelistedUsers:  [],          // string[] | user IDs
  whitelistedRoles:  [],          // string[] | role IDs

  // ── Embed Messages ────────────────────────────────────────────────────────
  embedMessages:  [],             // { id, name, createdAt, content }[]

  // ── Temp Voice Channels ───────────────────────────────────────────────────
  tempVoiceChannels: [],          // { id, name, category, createdAt }[]

  // ── Moderation Records ────────────────────────────────────────────────────
  bans:       [],                 // { userId, username, reason, expires }[]
  mutes:      [],                 // { userId, username, type, reason, expires }[]
  timeouts:   [],                 // { userId, username, reason, expires }[]
  tempRoles:  [],                 // { userId, username, role, reason, expires }[]
};

// Context
const ServerDataContext = createContext(DEFAULT_SERVER_DATA);
const useServerData = () => useContext(ServerDataContext);

// ── API HELPERS ──────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guildId: GUILD_ID, ...body }),
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// useApiConfig — loads config from API on mount, returns [config, setConfig, save, saving, toast]
function useApiConfig(getPath, postPath, defaultConfig) {
  const [config, setConfig]   = useState(defaultConfig);
  const [unsaved, setUnsaved] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null);  // { msg, ok }

  useEffect(() => {
    apiGet(`${getPath}?guildId=${GUILD_ID}`)
      .then(data => setConfig(prev => ({ ...prev, ...data })))
      .catch(err => console.warn(`[Config] ${getPath}:`, err.message));
  }, [getPath]);

  const markUnsaved = (updater) => {
    setConfig(updater);
    setUnsaved(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiPost(postPath, config);
      setUnsaved(false);
      setToast({ msg: "Saved successfully", ok: true });
    } catch (err) {
      setToast({ msg: `Save failed: ${err.message}`, ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return { config, setConfig: markUnsaved, unsaved, setUnsaved, save, saving, toast };
}

// Toast notification component
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 999,
      background: toast.ok ? "#052010" : "#2A0A0A",
      border: `1px solid ${toast.ok ? "#22C55E" : "#EF4444"}`,
      color: toast.ok ? "#22C55E" : "#EF4444",
      borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 500,
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {toast.ok ? "✅" : "❌"} {toast.msg}
    </div>
  );
}

// ── EXACT colors from screenshots ──────────────────────────────────────────
const C = {
  bg: "#0D0F13",
  sidebar: "#111318",
  card: "#16181F",
  cardHover: "#1A1C24",
  border: "#1E2028",
  borderLight: "#22242E",
  accent: "#4A90E2",
  accentHover: "#5A9FEF",
  premium: "#D97706",
  premiumBg: "#1C1500",
  premiumBorder: "#3D2E00",
  green: "#22C55E",
  greenBg: "#052010",
  red: "#EF4444",
  white: "#FFFFFF",
  gray1: "#E5E7EB",
  gray2: "#9CA3AF",
  gray3: "#6B7280",
  gray4: "#4B5563",
  gray5: "#374151",
  sectionLabel: "#4B5563",
  activeItemBg: "#1A1C26",
  activeBorder: "#FFFFFF",
  toggleOn: "#4A90E2",
  toggleOff: "#2D2F3A",
};

// ── TOGGLE ──────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange && onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: "pointer",
        background: on ? C.toggleOn : C.toggleOff,
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        border: `1px solid ${on ? C.accent : "#3A3C4A"}`,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: on ? 22 : 2,
        width: 18, height: 18, borderRadius: "50%",
        background: on ? "white" : "#6B7280",
        transition: "left 0.2s, background 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </div>
  );
}

// ── PREMIUM BADGE ───────────────────────────────────────────────────────────
function PremiumBadge() {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: C.premiumBg, border: `1px solid ${C.premiumBorder}`,
      borderRadius: 6, padding: "2px 8px",
      fontSize: 11, fontWeight: 600, color: C.premium,
    }}>
      🔒 PREMIUM
    </div>
  );
}

// ── STATUS LABEL ────────────────────────────────────────────────────────────
function StatusLabel({ enabled }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 500,
      color: enabled ? C.green : C.gray3,
    }}>
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

// ── CONFIGURE BUTTON ────────────────────────────────────────────────────────
function ConfigureBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "6px 14px", color: C.gray1,
      fontSize: 12, fontWeight: 500, cursor: "pointer",
      fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
      transition: "all 0.15s",
    }}>
      Configure <span style={{ fontSize: 10 }}>›</span>
    </button>
  );
}

// ── MANAGE BUTTON ───────────────────────────────────────────────────────────
function ManageBtn() {
  return (
    <button style={{
      background: "transparent", border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "6px 14px", color: C.gray2,
      fontSize: 12, fontWeight: 500, cursor: "pointer",
      fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 12 }}>⚙</span> Manage
    </button>
  );
}

// ── BREADCRUMB ──────────────────────────────────────────────────────────────
function Breadcrumb({ section, page }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.gray3 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 14 }}>🖥</span> Server
      </span>
      <span style={{ color: C.gray5 }}>/</span>
      <span style={{
        display: "flex", alignItems: "center", gap: 6,
        color: C.gray1, fontWeight: 500,
      }}>
        <span style={{ fontSize: 14 }}>{section}</span> {page}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function Overview() {
  const d = useServerData();

  const stats = [
    { label: "Members",      value: d.stats.members      || 0, change: d.stats.membersChange,      icon: "👥" },
    { label: "Messages",     value: d.stats.messages     || 0, change: d.stats.messagesChange,     icon: "💬" },
    { label: "Interactions", value: d.stats.interactions || 0, change: d.stats.interactionsChange, icon: "⚡" },
    { label: "Joins",        value: d.stats.joins        || 0, change: d.stats.joinsChange,        icon: "📥" },
    { label: "Leaves",       value: d.stats.leaves       || 0, change: d.stats.leavesChange,       icon: "📤" },
  ];

  const topMembers = d.topMembers.length ? d.topMembers : [];
  const topChannels = d.topChannels.length ? d.topChannels : [];

  const [activeTab, setActiveTab] = useState("Messages");
  const [activeActivityTab, setActiveActivityTab] = useState("Top Channels");

  const joinPoints        = d.charts.joinPoints.length        ? d.charts.joinPoints        : [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const leavePoints       = d.charts.leavePoints.length       ? d.charts.leavePoints       : [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const msgPoints         = d.charts.msgPoints.length         ? d.charts.msgPoints         : [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const interactionPoints = d.charts.interactionPoints.length ? d.charts.interactionPoints : [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const voicePoints       = d.charts.voicePoints.length       ? d.charts.voicePoints       : [0,0,0,0,0,0,0,0,0,0,0,0,0];
  const dates             = d.charts.chartDates.length        ? d.charts.chartDates        : ["—","—","—","—","—","—"];

  function makePath(points, height = 120) {
    const w = 500;
    const step = w / (points.length - 1);
    const maxVal = Math.max(...points);
    const coords = points.map((p, i) => [i * step, height - (p / maxVal) * (height - 10)]);
    let d = `M ${coords[0][0]},${coords[0][1]}`;
    for (let i = 1; i < coords.length; i++) {
      const cp1x = coords[i - 1][0] + step / 3;
      const cp1y = coords[i - 1][1];
      const cp2x = coords[i][0] - step / 3;
      const cp2y = coords[i][1];
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${coords[i][0]},${coords[i][1]}`;
    }
    return { d, coords };
  }

  function LineChart({ points1, color1, points2, color2 }) {
    const p1 = makePath(points1);
    const p2 = points2 ? makePath(points2) : null;
    return (
      <svg viewBox="0 0 500 120" style={{ width: "100%", height: 140 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`g1${color1}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color1} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color1} stopOpacity="0" />
          </linearGradient>
          {p2 && <linearGradient id={`g2${color2}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color2} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color2} stopOpacity="0" />
          </linearGradient>}
        </defs>
        {/* Fill */}
        <path d={`${p1.d} L 500,120 L 0,120 Z`} fill={`url(#g1${color1})`} />
        {p2 && <path d={`${p2.d} L 500,120 L 0,120 Z`} fill={`url(#g2${color2})`} />}
        {/* Lines */}
        <path d={p1.d} fill="none" stroke={color1} strokeWidth="2" />
        {p2 && <path d={p2.d} fill="none" stroke={color2} strokeWidth="2" />}
      </svg>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Welcome */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 600, color: C.white, marginBottom: 4 }}>
          Welcome back 🐱 {d.userName || "—"}
        </div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Get a comprehensive overview of all your server activity</div>
      </div>

      {/* Period selector */}
      <div>
        <select style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "8px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit",
          outline: "none", cursor: "pointer",
        }}>
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
        </select>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12 }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            flex: 1, background: C.card, borderRadius: 12, padding: "18px 20px",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, color: C.gray3, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.white, lineHeight: 1 }}>{s.value}</div>
              </div>
              <div style={{
                width: 36, height: 36, borderRadius: 8, fontSize: 16,
                background: C.cardHover, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{s.icon}</div>
            </div>
            {s.change && (
              <div style={{
                marginTop: 10, fontSize: 11, color: C.green,
                background: C.greenBg, borderRadius: 6, padding: "3px 8px",
                display: "inline-flex", alignItems: "center", gap: 3,
              }}>
                {s.change} compared to previous period
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "Joins & Leaves", sub: "Members joining and leaving your server", p1: joinPoints, c1: "#4A90E2", p2: leavePoints, c2: "#E24A4A" },
          { title: "Messages History", sub: "Your server messages chart", p1: msgPoints, c1: "#4A90E2", p2: null },
        ].map((chart, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 14, padding: "20px 22px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 2 }}>{chart.title}</div>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 16 }}>{chart.sub}</div>
            <LineChart points1={chart.p1} color1={chart.c1} points2={chart.p2} color2={chart.c2} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              {dates.map((d, j) => (
                <span key={j} style={{ fontSize: 10, color: C.gray4 }}>{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Interaction History + Voice Activity charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "Interaction History", sub: "Your server interaction chart", p1: interactionPoints, c1: "#E24A9A" },
          { title: "Voice Activity", sub: "Voice channel usage in minutes", p1: voicePoints, c1: "#4A90E2" },
        ].map((chart, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 14, padding: "20px 22px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 2 }}>{chart.title}</div>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 16 }}>{chart.sub}</div>
            <LineChart points1={chart.p1} color1={chart.c1} points2={null} color2={null} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              {dates.map((d, j) => (
                <span key={j} style={{ fontSize: 10, color: C.gray4 }}>{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Top Members + Server Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top Members */}
        <div style={{ background: C.card, borderRadius: 14, padding: "20px 22px", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>Top Members ↻</div>
          </div>
          <div style={{ display: "flex", gap: 0, marginBottom: 14, background: C.cardHover, borderRadius: 8, padding: 3 }}>
            {["Messages", "XP", "Invites"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: "7px 0", borderRadius: 7, border: "none",
                background: activeTab === tab ? C.accent : "transparent",
                color: activeTab === tab ? C.white : C.gray3,
                fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}>{tab}</button>
            ))}
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray4 }}>🔍</span>
            <input placeholder="Search by name or ID..." style={{
              width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 12px 8px 32px", color: C.gray1,
              fontSize: 12, fontFamily: "inherit", outline: "none",
            }} />
          </div>
          {topMembers.map((m, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
              borderBottom: i < topMembers.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <span style={{ fontSize: 11, color: C.gray4, width: 16, textAlign: "center" }}>{m.rank}.</span>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: C.cardHover,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                border: `1px solid ${C.border}`,
              }}>{m.icon}</div>
              <span style={{ flex: 1, fontSize: 13, color: C.gray1 }}>{m.name}</span>
              <span style={{ fontSize: 12, color: C.gray3 }}><b style={{ color: C.white }}>{m.msgs}</b> Messages</span>
            </div>
          ))}
        </div>

        {/* Server Activity */}
        <div style={{ background: C.card, borderRadius: 14, padding: "20px 22px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 16 }}>Server Activity ↻</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["Top Channels", "Top Commands", "Active Hours"].map(tab => (
              <button key={tab} onClick={() => setActiveActivityTab(tab)} style={{
                padding: "7px 14px", borderRadius: 8, border: "none",
                background: activeActivityTab === tab ? C.accent : C.cardHover,
                color: activeActivityTab === tab ? C.white : C.gray3,
                fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}>{tab}</button>
            ))}
          </div>
          {topChannels.map((ch, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
              borderBottom: i < topChannels.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <span style={{ fontSize: 11, color: C.gray4, width: 16 }}>{ch.rank}.</span>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: C.cardHover,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                border: `1px solid ${C.border}`, color: C.gray3, fontWeight: 700,
              }}>#</div>
              <span style={{ flex: 1, fontSize: 13, color: C.gray1 }}>{ch.name}</span>
              <span style={{ fontSize: 12, color: C.gray3 }}>{ch.msgs} messages</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: SERVER SETUP
// ─────────────────────────────────────────────────────────────────────────────
function ServerSetup() {
  const [states, setStates] = useState({
    commands: true, dashboardPerms: false,
    autoMod: true, modTools: true, protection: true, antiRaid: false,
    leveling: true, welcomer: true, suggestions: false,
    autoRoles: false, selfRoles: true, colors: false, tempVoice: true,
    embedMessages: true, autoReply: false, autoInteraction: false, reminders: false,
    logging: false, serverInsights: false, dashboardWatcher: true,
  });

  const toggle = (k) => setStates(p => ({ ...p, [k]: !p[k] }));

  const Section = ({ title, items }) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.sectionLabel, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: C.card, borderRadius: 12, padding: "16px",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: C.cardHover,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                border: `1px solid ${C.border}`,
              }}>{item.icon}</div>
              {item.premium ? <PremiumBadge /> : <Toggle on={states[item.key]} onChange={() => toggle(item.key)} />}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.gray1, marginBottom: 10 }}>{item.label}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <StatusLabel enabled={item.premium ? false : states[item.key]} />
              {item.premium
                ? <div style={{ fontSize: 11, color: C.premium }}>Premium Required</div>
                : item.hasConfig && <ConfigureBtn />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Server Setup</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Configure your server modules and preferences</div>
      </div>

      {/* Bot Language */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.border}`, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>Bot Language</div>
        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 10 }}>Select the language for bot responses and commands in your server</div>
        <select style={{
          background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "8px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none",
        }}>
          <option>🇺🇸 English</option>
          <option>🇸🇦 Arabic</option>
        </select>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 16 }}>Quick Access</div>

      <Section title="GENERAL" items={[
        { key: "commands", label: "Commands", icon: "⊞", hasConfig: true },
        { key: "dashboardPerms", label: "Dashboard Permissions", icon: "🛡", premium: true },
      ]} />
      <Section title="MODERATION" items={[
        { key: "autoMod", label: "Auto-Moderation", icon: "🤖", hasConfig: true },
        { key: "modTools", label: "Moderation Tools", icon: "⚒", hasConfig: true },
        { key: "protection", label: "Protection", icon: "🛡", hasConfig: true },
        { key: "antiRaid", label: "Anti-Raid", icon: "⚡", premium: true },
      ]} />
      <Section title="COMMUNITY" items={[
        { key: "leveling", label: "Leveling", icon: "📈", hasConfig: true },
        { key: "welcomer", label: "Welcomer", icon: "👋", hasConfig: true },
        { key: "suggestions", label: "Suggestions", icon: "💡" },
      ]} />
      <Section title="CUSTOMIZATION" items={[
        { key: "autoRoles", label: "Auto-Roles", icon: "🎭" },
        { key: "selfRoles", label: "Self-Roles", icon: "▶", hasConfig: true },
        { key: "colors", label: "Colors", icon: "🎨" },
        { key: "tempVoice", label: "Temp Voice", icon: "🎙", hasConfig: true },
      ]} />
      <Section title="MESSAGES" items={[
        { key: "embedMessages", label: "Embed Messages", icon: "📋", hasConfig: true },
        { key: "autoReply", label: "Auto-Reply", icon: "↩" },
        { key: "autoInteraction", label: "Auto-Interaction", icon: "⚡" },
        { key: "reminders", label: "Reminders", icon: "🔔" },
      ]} />

      {/* Notifications */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sectionLabel, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>NOTIFICATIONS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { icon: "🟣", label: "Twitch" }, { icon: "🔴", label: "YouTube" },
            { icon: "🟢", label: "Kick" }, { icon: "🟠", label: "Reddit" },
            { icon: "🦋", label: "Bluesky" }, { icon: "🎮", label: "Steam" },
            { icon: "📰", label: "RSS Feeds" }, { icon: "🎙", label: "Podcasts" },
          ].map((p, i) => (
            <div key={i} style={{
              background: C.card, borderRadius: 12, padding: "16px",
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: C.cardHover,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  border: `1px solid ${C.border}`,
                }}>{p.icon}</div>
                <PremiumBadge />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.gray1, marginBottom: 6 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: C.premium }}>Premium Required</div>
            </div>
          ))}
        </div>
      </div>

      <Section title="MONITORING" items={[
        { key: "logging", label: "Logging", icon: "📁" },
        { key: "serverInsights", label: "Server Insights", icon: "📊" },
        { key: "dashboardWatcher", label: "Dashboard Watcher", icon: "👁", hasConfig: true },
      ]} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
function Commands() {
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");

  const allCommands = {
    General: [
      { name: "color-set", desc: "Set your color role by number", icon: "⊞" },
      { name: "colors", desc: "View available color roles", icon: "⊞" },
      { name: "get-emojis", desc: "Retrieve emojis by placing it in command", icon: "⊞" },
      { name: "help", desc: "Bot's help menu", icon: "⊞" },
      { name: "ping", desc: "Display the current latency of the bot", icon: "⊞" },
      { name: "points-list", desc: "See all points", icon: "⊞" },
      { name: "rep", desc: "Award someone a reputation point. Can only be used once every 24 hours", icon: "⊞" },
      { name: "roll", desc: "Roll a standard 6-sided dice and display the result.", icon: "⊞" },
      { name: "suggest", desc: "Submit a suggestion to the server", icon: "⊞" },
      { name: "suggestion", desc: "Manage a suggestion (approve, deny, or implement)", icon: "⊞" },
      { name: "title", desc: "View or change your profile title", icon: "⊞" },
      { name: "translate", desc: "Translate a message or text to a specified language.", icon: "⊞" },
      { name: "vito", desc: "Show yours or somebody else's vitos", icon: "⊞" },
    ],
    Moderation: [
      { name: "ban", desc: "Bans a member", icon: "🛡", on: true },
      { name: "unban", desc: "Unbans a member", icon: "🛡", on: true },
      { name: "unban-all", desc: "Unban all users currently banned in the server", icon: "🛡" },
      { name: "kick", desc: "Kicks a member", icon: "🛡", on: true },
      { name: "move", desc: "Moves a member to another voice channel", icon: "🛡" },
      { name: "mute-check", desc: "Check the mute status of a specified user", icon: "🛡" },
      { name: "mute-text", desc: "Mute a member so they can't type in text channels", icon: "🛡", on: true },
      { name: "unmute-text", desc: "Unmutes a member", icon: "🛡", on: true },
      { name: "mute-voice", desc: "Mute a member so they can't speak in voice channels", icon: "🛡", on: true },
      { name: "unmute-voice", desc: "Unmutes a member from voice channels", icon: "🛡", on: true },
      { name: "timeout", desc: "Timeouts a member", icon: "🛡", on: true },
      { name: "untimeout", desc: "Removes a timeout from a member", icon: "🛡", on: true },
      { name: "vkick", desc: "Kicks a member from a voice channel", icon: "🛡", on: true },
      { name: "warn-add", desc: "Warns a member", icon: "🛡", on: true },
      { name: "warn-remove", desc: "Remove warnings for the server or user", icon: "🛡" },
      { name: "warnings", desc: "Get the list of warnings for the server or a user", icon: "🛡" },
      { name: "points-reset", desc: "Reset the points", icon: "🛡" },
      { name: "points", desc: "Manage the points of a user", icon: "🛡" },
      { name: "rar", desc: "Remove all roles from a user", icon: "🛡" },
      { name: "role-multiple", desc: "Mass give or remove a role from server members", icon: "🛡" },
      { name: "role", desc: "Manage role(s) for members", icon: "🛡" },
      { name: "setnick", desc: "Changes the nickname of a member", icon: "🛡" },
      { name: "temprole", desc: "Assign a temporary role to a member", icon: "🛡" },
      { name: "add-emoji", desc: "Upload a new custom emoji with the specified name and image URL.", icon: "🛡" },
      { name: "clear", desc: "Cleans up channel messages", icon: "🛡", on: true },
      { name: "hide", desc: "Hides a channel from @everyone", icon: "🛡" },
      { name: "show", desc: "Shows a hidden channel to @everyone", icon: "🛡" },
      { name: "lock", desc: "Disables @everyone from sending messages in specific channel", icon: "🛡", on: true },
      { name: "unlock", desc: "Allows @everyone to send messages in specific channel", icon: "🛡", on: true },
      { name: "slowmode", desc: "Enable or disable slowmode on a channel", icon: "🛡" },
      { name: "giveaway-drop", desc: "Start a drop giveaway", icon: "🛡" },
      { name: "giveaway-end", desc: "End a giveaway early", icon: "🛡" },
      { name: "giveaway-reroll", desc: "Reroll giveaway winners", icon: "🛡" },
      { name: "giveaway-start", desc: "Start a new giveaway", icon: "🛡" },
      { name: "inrole", desc: "Show all users with a specific role", icon: "🛡" },
    ],
    Info: [
      { name: "avatar", desc: "Get a user's avatar or get your avatar", icon: "⊟" },
      { name: "banner", desc: "Get a user's banner or get your banner", icon: "⊟" },
      { name: "invites", desc: "Display your invites info or another user.", icon: "⊟" },
      { name: "profile", desc: "View your or someone else's customizable personal global profile card", icon: "⊟" },
      { name: "roles", desc: "Get a list of server roles and member counts", icon: "⊟" },
      { name: "server-avatar", desc: "Display the current server avatar.", icon: "⊟" },
      { name: "server-banner", desc: "Display the current server banner.", icon: "⊟" },
      { name: "server", desc: "Shows information about the server", icon: "⊟" },
      { name: "user", desc: "Shows information, such as ID and join date, about yourself or a user", icon: "⊟", on: true },
    ],
    Leveling: [
      { name: "reset", desc: "Reset text/voice/invites xp points for all or specific members", icon: "📈" },
      { name: "setlevel", desc: "Sets the user's level", icon: "📈", on: true },
      { name: "setxp", desc: "Sets the user's xp", icon: "📈", on: true },
      { name: "rank", desc: "View your rank card or someone else's in the server", icon: "📈", on: true },
      { name: "top", desc: "Display the top members by text or voice", icon: "📈" },
    ],
  };

  const tabs = [
    { label: "All", count: 63 },
    { label: "General", count: 13 },
    { label: "Moderation", count: 36 },
    { label: "Info", count: 9 },
    { label: "Leveling", count: 5 },
  ];

  const [cmdStates, setCmdStates] = useState({});
  const toggleCmd = (name) => setCmdStates(p => ({ ...p, [name]: !p[name] }));
  const [managingCmd, setManagingCmd] = useState(null);

  // ── MANAGE COMMAND SUB-PAGE ──
  if (managingCmd) {
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <button onClick={() => setManagingCmd(null)} style={{
            background: "transparent", border: "none", color: C.gray3,
            fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1,
          }}>‹</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.white }}>Manage {managingCmd.name}</div>
            <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Configure aliases, permissions, and behavior for this command.</div>
          </div>
        </div>

        {/* Command Aliases */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 4 }}>Command Aliases</div>
          <div style={{ fontSize: 12, color: C.gray3, marginBottom: 14 }}>Add alternative names for this command.</div>
          <input placeholder="Enter alias name" style={{
            width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13,
            fontFamily: "inherit", outline: "none",
          }} />
        </div>

        {/* Roles & Channels */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 8 }}>Disabled Roles</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, color: C.gray4 }}>Select roles to disable</span>
                <span style={{ color: C.gray4 }}>▼</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 8 }}>Enabled Roles</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, color: C.gray4 }}>Select roles to enable</span>
                <span style={{ color: C.gray4 }}>▼</span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 8 }}>Disabled Channels</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, color: C.gray4 }}>Select channels to disable</span>
                <span style={{ color: C.gray4 }}>▼</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 8 }}>Enabled Channels</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, color: C.gray4 }}>Select channels to enable</span>
                <span style={{ color: C.gray4 }}>▼</span>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-delete toggles */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          {[
            { label: "Auto-delete command invocation message", info: true },
            { label: "Auto-delete with message deletion", info: true },
            { label: "Auto-delete bot's reply after 5 seconds", info: true },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0",
              borderBottom: i < 2 ? `1px solid ${C.border}` : "none",
            }}>
              <span style={{ fontSize: 13, color: C.gray1 }}>
                {item.label}
                {item.info && <span style={{ color: C.gray4, marginLeft: 5, fontSize: 12 }}>ℹ</span>}
              </span>
              <Toggle on={false} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  let displayCmds = activeTab === "All"
    ? Object.values(allCommands).flat()
    : allCommands[activeTab] || [];

  if (search) displayCmds = displayCmds.filter(c => c.name.includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Commands Management</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Enable, disable, and configure commands for your server</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 16, gap: 2 }}>
        {tabs.map(t => (
          <button key={t.label} onClick={() => setActiveTab(t.label)} style={{
            flex: 1, padding: "8px 0", border: "none", borderRadius: 8,
            background: activeTab === t.label ? C.cardHover : "transparent",
            color: activeTab === t.label ? C.white : C.gray3,
            fontSize: 13, fontWeight: activeTab === t.label ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            outline: activeTab === t.label ? `1px solid ${C.border}` : "none",
          }}>{t.label} ({t.count})</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray4 }}>🔍</span>
        <input
          placeholder="Search commands..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px 10px 36px", color: C.gray1,
            fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Command list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {displayCmds.map((cmd, i) => {
          const isOn = cmdStates[cmd.name] !== undefined ? cmdStates[cmd.name] : !!cmd.on;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              background: C.card, borderRadius: 10, padding: "14px 16px",
              border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: C.cardHover,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, border: `1px solid ${C.border}`, flexShrink: 0,
              }}>{cmd.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{cmd.name}</div>
                <div style={{ fontSize: 12, color: C.gray3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd.desc}</div>
              </div>
              <Toggle on={isOn} onChange={() => toggleCmd(cmd.name)} />
              <button onClick={() => setManagingCmd(cmd)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 14px", color: C.gray2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>⚙ Manage</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: AUTO-MODERATION
// ─────────────────────────────────────────────────────────────────────────────
function AutoModeration() {
  const { config, setConfig, unsaved, setUnsaved, save, saving, toast } = useApiConfig(
    "/api/automod", "/api/automod",
    { bad_words: 0, repeated_text: 0, discord_invites: 0, external_links: 0,
      excessive_caps: 0, excessive_spoilers: 0, mass_mentions: 0, anti_spam: 1 }
  );

  // Map DB snake_case → UI keys
  const filters = {
    badWords:         !!config.bad_words,
    repeatedText:     !!config.repeated_text,
    discordInvites:   !!config.discord_invites,
    externalLinks:    !!config.external_links,
    excessiveCaps:    !!config.excessive_caps,
    excessiveSpoilers:!!config.excessive_spoilers,
    massMentions:     !!config.mass_mentions,
    antiSpam:         !!config.anti_spam,
  };

  const dbKey = { badWords:"bad_words", repeatedText:"repeated_text",
    discordInvites:"discord_invites", externalLinks:"external_links",
    excessiveCaps:"excessive_caps", excessiveSpoilers:"excessive_spoilers",
    massMentions:"mass_mentions", antiSpam:"anti_spam" };

  const toggle = k => setConfig(prev => ({ ...prev, [dbKey[k]]: prev[dbKey[k]] ? 0 : 1 }));

  const filterList = [
    { key: "badWords",          label: "Bad Words",          desc: "Detects and filters profanity and custom blocked words", icon: "🚫" },
    { key: "repeatedText",      label: "Repeated Text",      desc: "Detects repeated characters and limits excessive emoji usage", icon: "🔁" },
    { key: "discordInvites",    label: "Discord Invites",    desc: "Blocks Discord invite links and codes", icon: "🔗" },
    { key: "externalLinks",     label: "External Links",     desc: "Filters external website links and URLs", icon: "🌐" },
    { key: "excessiveCaps",     label: "Excessive Caps",     desc: "Moderates messages with excessive uppercase letters", icon: "🔠" },
    { key: "excessiveSpoilers", label: "Excessive Spoilers", desc: "Moderates excessive spoiler tag usage", icon: "📦" },
    { key: "massMentions",      label: "Mass Mentions",      desc: "Prevents excessive user/role mentions in messages", icon: "📢" },
    { key: "antiSpam",          label: "Anti-Spam",          desc: "Prevents rapid message flooding, link spam, and attachment spam", icon: "⚡" },
  ];

  const [noCommandsChannels] = useState([]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Auto-Moderation</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Configure automated moderation rules to keep your server safe.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {filterList.map((f, i) => (
          <div key={i} style={{
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: C.cardHover,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, border: `1px solid ${C.border}`, flexShrink: 0,
              }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{f.label}</div>
                <div style={{ fontSize: 11, color: C.gray3, marginTop: 2 }}>{f.desc}</div>
              </div>
              <Toggle on={filters[f.key]} onChange={() => toggle(f.key)} />
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px" }}>
              <button onClick={() => setManagingCmd(cmd)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 14px", color: C.gray2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>⚙ Manage</button>
            </div>
          </div>
        ))}
      </div>

      {/* Exclusive Settings */}
      <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 600, color: C.white }}>Exclusive Settings</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.card, borderRadius: 12, padding: "18px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 8 }}>Only Commands</div>
          <select style={{
            width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 14px", color: C.gray3, fontSize: 13,
            fontFamily: "inherit", outline: "none",
          }}>
            <option value="">Select a channel</option>
          </select>
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: "18px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 8 }}>Only Attachments</div>
          <div style={{
            background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          }}>
            <div style={{
              background: C.border, borderRadius: 6, padding: "3px 10px",
              fontSize: 12, color: C.gray1, display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ color: C.gray4 }}>#</span> —
              <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
            </div>
          </div>
        </div>
      </div>

      {/* No Commands */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>No Commands</div>
          <span style={{
            background: "#1A3A1A", border: "1px solid #2D5A2D",
            color: "#4ADE80", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
          }}>NEW</span>
        </div>
        <div style={{
          background: C.cardHover, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12,
        }}>
          {noCommandsChannels.map(ch => (
            <div key={ch} style={{
              background: C.border, borderRadius: 6, padding: "3px 10px",
              fontSize: 12, color: C.gray1, display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ color: C.gray4 }}>#</span> {ch}
              <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Allowed Roles</div>
        <select style={{
          width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 14px", color: C.gray3, fontSize: 13,
          fontFamily: "inherit", outline: "none", marginBottom: 12,
        }}>
          <option value="">Select roles to bypass this restriction...</option>
        </select>
        <div style={{ fontSize: 11, color: C.gray4, marginBottom: 10 }}>Users with these roles will bypass the restriction in the selected channels.</div>
        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Blocked Prefixes</div>
        <select style={{
          width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 14px", color: C.gray3, fontSize: 13,
          fontFamily: "inherit", outline: "none",
        }}>
          <option value="">Select or type prefixes to block...</option>
        </select>
        <div style={{ fontSize: 11, color: C.gray4, marginTop: 6 }}>Leave empty to block all default command prefixes (/, !, #, +, $)</div>
      </div>

      <Toast toast={toast} />
      {unsaved && (
        <div style={{
          position: "fixed", bottom: 0, left: 240, right: 0,
          background: "#1A1C26", border: `1px solid ${C.border}`,
          padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.premium }}>
            <span>⚠</span> You have unsaved changes
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setUnsaved(false)} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 20px", color: C.gray1,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{
              background: C.accent, border: "none",
              borderRadius: 8, padding: "8px 20px", color: C.white,
              fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
function Protection() {
  const { config, setConfig, unsaved, setUnsaved, save, saving, toast } = useApiConfig(
    "/api/protection", "/api/protection",
    { dm_on_punishment: 1, anti_ban: 0, anti_kick: 0, anti_role: 0,
      anti_channel: 0, anti_webhook: 0, anti_role_create: 0, anti_role_delete: 0,
      anti_role_rename: 0, anti_dangerous_role: 0, anti_channel_create: 0,
      anti_channel_delete: 0, anti_channel_rename: 0, anti_server_rename: 0,
      anti_server_icon: 0, anti_bot_add: 0 }
  );

  const dmOnPunishment = !!config.dm_on_punishment;
  const setDmOnPunishment = v => setConfig(prev => ({ ...prev, dm_on_punishment: v ? 1 : 0 }));

  const [activeTab, setActiveTab] = useState("General Protection");

  const protections = {
    antiBan:     !!config.anti_ban,
    antiKick:    !!config.anti_kick,
    antiRole:    !!config.anti_role,
    antiChannel: !!config.anti_channel,
    antiWebhook: !!config.anti_webhook,
  };

  const dbKey = { antiBan:"anti_ban", antiKick:"anti_kick", antiRole:"anti_role",
                  antiChannel:"anti_channel", antiWebhook:"anti_webhook" };
  const toggle = k => setConfig(prev => ({ ...prev, [dbKey[k]]: prev[dbKey[k]] ? 0 : 1 }));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Protection</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Protect your server from malicious actions</div>
      </div>

      {/* Master Settings */}
      <div style={{ background: C.card, borderRadius: 12, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 16 }}>Master Settings</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1, marginBottom: 4 }}>Log Channel</div>
          <div style={{ fontSize: 12, color: C.gray3, marginBottom: 8 }}>Channel to send protection alerts</div>
          <div style={{
            background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: C.gray4 }}>#</span>
              <span style={{ fontSize: 13, color: C.gray1 }}>—</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
              <span style={{ color: C.gray4 }}>▼</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1 }}>DM on Punishment</div>
            <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Send a DM to users when they are punished</div>
          </div>
          <Toggle on={dmOnPunishment} onChange={setDmOnPunishment} />
        </div>
      </div>

      {/* Whitelist */}
      <div style={{ background: C.card, borderRadius: 12, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 4 }}>Whitelist</div>
        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 16 }}>Users and roles exempt from all protection rules</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 6 }}>Whitelisted Users ℹ</div>
            <div style={{
              background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{
                background: "#1A3060", border: "1px solid #2A4080",
                borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#7CA8FF",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4A90E2", display: "inline-block" }} />
                —
                <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
              </div>
              <span style={{ color: C.gray4, marginLeft: "auto" }}>✕ ▼</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 6 }}>Whitelisted Roles ℹ</div>
            <div style={{
              background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 12, color: C.gray4 }}>Select roles</span>
              <span style={{ color: C.gray4 }}>▼</span>
            </div>
          </div>
        </div>
      </div>

      {/* Protection Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["General Protection", "Commands Limit", "Role-Based Protection"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "9px 18px", borderRadius: 8, border: "none",
            background: activeTab === tab ? C.accent : C.card,
            color: activeTab === tab ? C.white : C.gray3,
            fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: activeTab === tab ? "none" : `1px solid ${C.border}`,
          }}>{tab}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.sectionLabel, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>MEMBER ACTIONS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { key: "antiBan", label: "Anti Ban", desc: "Punish users who mass-ban members", icon: "🚫" },
          { key: "antiKick", label: "Anti Kick", desc: "Punish users who mass-kick members", icon: "👢" },
        ].map((p, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14,
            background: C.card, borderRadius: 10, padding: "16px",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: C.cardHover,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, border: `1px solid ${C.border}`, flexShrink: 0,
            }}>{p.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{p.label}</div>
              <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>{p.desc}</div>
            </div>
            <Toggle on={protections[p.key]} onChange={() => toggle(p.key)} />
          </div>
        ))}
      </div>
      <Toast toast={toast} />
      {unsaved && (
        <div style={{
          position: "fixed", bottom: 0, left: 240, right: 0,
          background: "#1A1C26", border: `1px solid ${C.border}`,
          padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.premium }}>
            <span>⚠</span> You have unsaved changes
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setUnsaved(false)} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 20px", color: C.gray1,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{
              background: C.accent, border: "none",
              borderRadius: 8, padding: "8px 20px", color: C.white,
              fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PAGE: WELCOMER
// ─────────────────────────────────────────────────────────────────────────────
function Welcomer() {
  const { config, setConfig, unsaved, setUnsaved, save, saving, toast } = useApiConfig(
    "/api/welcomer", "/api/welcomer",
    { welcome_enabled: 1, welcome_img_enabled: 1, welcome_channel_id: null,
      goodbye_enabled: 0, goodbye_channel_id: null, greet_enabled: 0 }
  );

  const [mainTab, setMainTab] = useState("Welcome");
  const [subTab, setSubTab] = useState("Settings");
  const [imgTab, setImgTab] = useState("Background");
  const [width, setWidth]   = useState(449);
  const [height, setHeight] = useState(71);

  const enableMsg = !!config.welcome_enabled;
  const enableImg = !!config.welcome_img_enabled;
  const setEnableMsg = v => setConfig(prev => ({ ...prev, welcome_enabled: v ? 1 : 0 }));
  const setEnableImg = v => setConfig(prev => ({ ...prev, welcome_img_enabled: v ? 1 : 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Welcome Messages</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Configure welcome messages and images for new members</div>
      </div>

      {/* Main tabs: Welcome / Goodbye / Greet */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, width: "fit-content" }}>
        {["Welcome", "Goodbye", "Greet"].map(t => (
          <button key={t} onClick={() => setMainTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: mainTab === t ? C.accent : "transparent",
            color: mainTab === t ? C.white : C.gray3,
            fontSize: 13, fontWeight: mainTab === t ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
          }}>{t}</button>
        ))}
      </div>

      {/* Sub tabs: Settings / Message / Image */}
      <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {["Settings", "Message", "Image"].map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            flex: 1, padding: "9px", borderRadius: 8, border: "none",
            background: subTab === t ? C.cardHover : "transparent",
            color: subTab === t ? C.white : C.gray3,
            fontSize: 13, fontWeight: subTab === t ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: subTab === t ? `1px solid ${C.border}` : "none",
          }}>{t}</button>
        ))}
      </div>

      {subTab === "Settings" && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          {/* Channel */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.gray2, marginBottom: 8 }}>Channel</div>
            <div style={{
              background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.gray4 }}>#</span>
                <span style={{ fontSize: 20 }}>▶</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
                <span style={{ color: C.gray4 }}>▼</span>
              </div>
            </div>
          </div>

          {/* Enable Welcome Message */}
          {[
            { label: "Enable Welcome Message", key: "msg", val: enableMsg, set: setEnableMsg },
            { label: "Enable Welcome Image", key: "img", val: enableImg, set: setEnableImg },
          ].map(item => (
            <div key={item.key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 0", borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 13, color: C.gray1 }}>{item.label} <span style={{ color: C.gray4, fontSize: 12 }}>ℹ</span></span>
              <Toggle on={item.val} onChange={item.set} />
            </div>
          ))}

          {/* Text Position */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 18 }}>
            <span style={{ fontSize: 13, color: C.gray1 }}>Text Position <span style={{ color: C.gray4, fontSize: 12 }}>ℹ</span></span>
            <select style={{
              background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 14px", color: C.gray1,
              fontSize: 13, fontFamily: "inherit", outline: "none",
            }}>
              <option>Before Image</option>
              <option>After Image</option>
            </select>
          </div>
        </div>
      )}

      {subTab === "Image" && (
        <div>
          {/* Canvas preview */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "20px", marginBottom: 16,
          }}>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              {["⊞", "◎", "10", "20", "25", "50", "🔗"].map((t, i) => (
                <button key={i} style={{
                  background: C.cardHover, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "4px 8px", color: C.gray3,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>{t}</button>
              ))}
            </div>
            {/* Canvas */}
            <div style={{
              background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 16px 16px",
              borderRadius: 8, padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "12px 24px",
                fontSize: 12, color: C.gray3,
              }}>Welcome to [Server Name]</div>
            </div>
          </div>

          {/* Image settings */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px" }}>
            {/* Img sub tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.cardHover, borderRadius: 8, padding: 3, width: "fit-content" }}>
              {["Background", "Avatar", "Name", "Text", "Settings"].map(t => (
                <button key={t} onClick={() => setImgTab(t)} style={{
                  padding: "7px 14px", borderRadius: 6, border: "none",
                  background: imgTab === t ? C.accent : "transparent",
                  color: imgTab === t ? C.white : C.gray3,
                  fontSize: 12, fontWeight: imgTab === t ? 600 : 400,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{t}</button>
              ))}
            </div>

            {imgTab === "Background" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Stage Size */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Stage Size <span style={{ color: C.gray4, fontSize: 12 }}>ℹ</span></div>
                    <button style={{ background: "transparent", border: "none", color: C.gray3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reset to Default</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                      { label: "Width", val: width, set: setWidth },
                      { label: "Height", val: height, set: setHeight },
                    ].map(f => (
                      <div key={f.label}>
                        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>{f.label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => f.set(v => v - 1)} style={{
                            width: 32, height: 32, borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.cardHover, color: C.white, fontSize: 16, cursor: "pointer",
                          }}>−</button>
                          <input value={f.val} onChange={e => f.set(Number(e.target.value))} style={{
                            flex: 1, background: C.cardHover, border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: "7px 10px", color: C.white, fontSize: 13,
                            fontFamily: "inherit", outline: "none", textAlign: "center",
                          }} />
                          <button onClick={() => f.set(v => v + 1)} style={{
                            width: 32, height: 32, borderRadius: 6, border: `1px solid ${C.border}`,
                            background: C.cardHover, color: C.white, fontSize: 16, cursor: "pointer",
                          }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Background Type */}
                <div>
                  <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Background Type <span style={{ color: C.gray4 }}>ℹ</span></div>
                  <select style={{
                    width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "10px 14px", color: C.gray1,
                    fontSize: 13, fontFamily: "inherit", outline: "none",
                  }}>
                    <option>Image</option>
                    <option>Color</option>
                    <option>Gradient</option>
                  </select>
                </div>

                {/* Background Image */}
                <div>
                  <div style={{ fontSize: 12, color: C.gray3, marginBottom: 8 }}>Background Image <span style={{ color: C.gray4 }}>ℹ</span></div>
                  <div style={{
                    background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 16px 16px",
                    borderRadius: 8, height: 160, marginBottom: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ color: C.gray4, fontSize: 12 }}>Image preview</span>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: C.cardHover, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "8px 14px",
                  }}>
                    <span style={{ fontSize: 11, color: C.gray3 }}>🖼 34ecb48c-dff4-4c2b-8eee-a...</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 12px", color: C.gray2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>↑ Replace</button>
                      <button style={{ background: "transparent", border: `1px solid ${C.red}40`, borderRadius: 6, padding: "4px 12px", color: C.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕ Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save bar */}
      <Toast toast={toast} />
      {unsaved && (
        <div style={{
          position: "fixed", bottom: 0, left: 240, right: 0,
          background: "#1A1C26", border: `1px solid ${C.border}`,
          padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.premium }}>
            <span>⚠</span> You have unsaved changes
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setUnsaved(false)} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 20px", color: C.gray1,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{
              background: C.accent, border: "none",
              borderRadius: 8, padding: "8px 20px", color: C.white,
              fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PAGE: LEVELING
// ─────────────────────────────────────────────────────────────────────────────
function Leveling() {
  const { config, setConfig, unsaved, setUnsaved, save, saving, toast } = useApiConfig(
    "/api/leveling", "/api/leveling",
    { enabled: 1, min_xp: 15, max_xp: 25, cooldown_sec: 60,
      xp_type: "text", stack_roles: 0, channel_levelup_msg: 1,
      enable_lvl_msg: 1, msg_type: "Embed" }
  );

  const [tab, setTab] = useState("Main Settings");
  const enableLvlMsg  = !!config.enable_lvl_msg;
  const msgType       = config.msg_type || "Embed";
  const channelLvlMsg = !!config.channel_levelup_msg;
  const setEnableLvlMsg  = v => setConfig(prev => ({ ...prev, enable_lvl_msg: v ? 1 : 0 }));
  const setMsgType       = v => setConfig(prev => ({ ...prev, msg_type: v }));
  const setChannelLvlMsg = v => setConfig(prev => ({ ...prev, channel_levelup_msg: v ? 1 : 0 }));

  const EmbedBuilder = ({ title }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{title}</div>
        <div style={{
          background: C.cardHover, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: "2px 8px", fontSize: 11, color: C.gray3,
          cursor: "pointer",
        }}>{"{}"}</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {/* Embed preview */}
        <div style={{ padding: "16px", borderLeft: `3px solid ${C.accent}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", background: C.cardHover,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                }}>D</div>
                <span style={{ fontSize: 12, color: C.gray2 }}>from: Bot Name</span>
                <span style={{ color: C.gray4, marginLeft: "auto", fontSize: 12 }}>🔗 ○</span>
              </div>
              <div style={{ fontSize: 13, color: C.gray1, marginBottom: 4 }}>Dear [User],</div>
              <div style={{ fontSize: 12, color: C.gray3 }}>You LEVELED UP from Level: [OldLevel] to Level [Level].</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <span style={{ color: C.gray4, fontSize: 12, cursor: "pointer" }}>🔗</span>
                <span style={{ color: C.gray4, fontSize: 12, cursor: "pointer" }}>○</span>
              </div>
              <div style={{ color: C.gray4, fontSize: 12, marginTop: 4, cursor: "pointer" }}>○</div>
            </div>
            <div style={{
              width: 52, height: 52, borderRadius: 8, background: C.cardHover,
              border: `1px solid ${C.border}`, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>👤</div>
          </div>
          <button style={{
            width: "100%", background: C.cardHover, border: `1px dashed ${C.border}`,
            borderRadius: 6, padding: "8px", color: C.gray3, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}>Add Field</button>
        </div>
        {/* Image drop zone */}
        <div style={{
          background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 12px 12px",
          height: 120, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: C.gray5, fontSize: 12 }}>Drop image here</span>
        </div>
        {/* Bottom bar */}
        <div style={{
          padding: "10px 16px", borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.cardHover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>D</div>
            <span style={{ fontSize: 12, color: C.gray3 }}>Well earned.</span>
          </div>
          <div style={{ display: "flex", gap: 8, color: C.gray4 }}>
            <span style={{ cursor: "pointer" }}>○</span>
            <span style={{ cursor: "pointer" }}>📅</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Leveling System</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Configure leveling settings and reward roles for active members</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 24 }}>
        {["Main Settings", "Leveling Up Messages", "Reward Roles"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "9px", borderRadius: 8, border: "none",
            background: tab === t ? C.cardHover : "transparent",
            color: tab === t ? C.white : C.gray3,
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: tab === t ? `1px solid ${C.border}` : "none",
          }}>{t}</button>
        ))}
      </div>

      {tab === "Main Settings" && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Min XP per Message", value: "15" },
              { label: "Max XP per Message", value: "25" },
              { label: "Cooldown (seconds)", value: "60" },
            ].map((f, i) => (
              <div key={i}>
                <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>{f.label}</div>
                <input defaultValue={f.value} onChange={() => setUnsaved(true)} style={{
                  width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 13,
                  fontFamily: "inherit", outline: "none",
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>XP Type</div>
              <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                <option>Text</option>
                <option>Voice</option>
                <option>Both</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Stack Roles</div>
              <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                <option>Yes — Keep all reward roles</option>
                <option>No — Only highest role</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {tab === "Leveling Up Messages" && (
        <div>
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
            {/* Enable toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1 }}>Enable Leveling Up Messages <span style={{ color: C.gray4, fontSize: 12 }}>ℹ</span></div>
              </div>
              <Toggle on={enableLvlMsg} onChange={v => { setEnableLvlMsg(v); setUnsaved(true); }} />
            </div>

            {/* Message Type */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 8 }}>Message Type</div>
              <div style={{ display: "flex", gap: 4, background: C.cardHover, borderRadius: 8, padding: 3, width: "fit-content" }}>
                {["Text", "Embed"].map(t => (
                  <button key={t} onClick={() => setMsgType(t)} style={{
                    padding: "6px 18px", borderRadius: 6, border: "none",
                    background: msgType === t ? C.accent : "transparent",
                    color: msgType === t ? C.white : C.gray3,
                    fontSize: 12, fontWeight: msgType === t ? 600 : 400,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Channel selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Level Up Announcement Channel</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: C.gray4 }}>#</span>
                  <span style={{ fontSize: 13, color: C.gray1 }}>—</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
                  <span style={{ color: C.gray4 }}>▼</span>
                </div>
              </div>
            </div>

            {/* Channel Level-Up Message */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: C.gray1 }}>Channel Level-Up Message <span style={{ color: C.gray4, fontSize: 12 }}>ℹ</span></span>
              <Toggle on={channelLvlMsg} onChange={v => { setChannelLvlMsg(v); setUnsaved(true); }} />
            </div>
          </div>

          {/* Embed builders */}
          <EmbedBuilder title="Text Level-Up Embed" />
          <EmbedBuilder title="DM Level-Up Embed" />
          <EmbedBuilder title="Voice Level-Up Embed" />
        </div>
      )}

      {tab === "Reward Roles" && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>Level Rewards</div>
            <button style={{
              background: C.accent, border: "none", borderRadius: 8,
              padding: "8px 18px", color: C.white, fontSize: 13,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>+ Add Reward</button>
          </div>
          {[
            { level: 5, role: "Active", color: "#43E97B" },
            { level: 15, role: "Regular", color: "#4FACFE" },
            { level: 30, role: "Veteran", color: "#7C6AF7" },
            { level: 50, role: "Elite", color: "#F7676A" },
          ].map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: r.color + "20",
                border: `1px solid ${r.color}30`, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 11, fontWeight: 800, color: r.color,
              }}>L{r.level}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: r.color }}>@{r.role}</div>
                <div style={{ fontSize: 11, color: C.gray3, marginTop: 2 }}>Assigned at level {r.level}</div>
              </div>
              <button style={{
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "5px 12px", color: C.gray3,
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>Edit</button>
              <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {/* Unsaved changes bar */}
      <Toast toast={toast} />
      {unsaved && (
        <div style={{
          position: "fixed", bottom: 0, left: 240, right: 0,
          background: "#1A1C26", borderTop: `1px solid ${C.border}`,
          padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.premium }}>
            <span>⚠</span> You have unsaved changes
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setUnsaved(false)} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 20px", color: C.gray1,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{
              background: C.accent, border: "none", borderRadius: 8,
              padding: "8px 20px", color: C.white, fontSize: 13,
              fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: TEMP VOICE
// ─────────────────────────────────────────────────────────────────────────────
function TempVoice() {
  const [tab, setTab] = useState("Channels");
  const [view, setView] = useState("list"); // "list" | "create"
  const [ownerOnly, setOwnerOnly] = useState(false);

  const permissions = [
    ["Manage Channel", false, "Manage Permissions", false],
    ["Create Invite", false, "Video", true],
    ["Move Members", false, "Use Soundboard", false],
    ["Use External Sounds", false, "Priority Speaker", false],
    ["Set Voice Channel Status", false, "Bypass Slowmode", false],
    ["Send Voice Messages", false, "Use Activities", false],
  ];

  const panelOptions = [
    ["Name", true, "Limit", true],
    ["Privacy", true, "Chat", false],
    ["Region", false, "Lock", true],
    ["Unlock", true, "Trust", true],
    ["Untrust", true, "Invite", true],
    ["Kick", true, "Block", true],
    ["Unblock", true, "Claim", true],
    ["Transfer", true, "Delete", false],
  ];

  const PermRow = ({ label, val }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: 12, color: C.gray2 }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {["✕", "/", "✓"].map((icon, i) => (
          <div key={i} style={{
            width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
            background: (i === 1 && !val) || (i === 2 && val) ? (i === 2 ? "#1A3A1A" : C.cardHover) : C.cardHover,
            border: `1px solid ${(i === 2 && val) ? "#43E97B40" : C.border}`,
            color: i === 0 ? "#EF4444" : i === 1 ? C.gray3 : "#43E97B",
            fontSize: 11, cursor: "pointer",
          }}>{icon}</div>
        ))}
      </div>
    </div>
  );

  if (view === "create") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <button onClick={() => setView("list")} style={{
            background: "transparent", border: "none", color: C.gray3,
            fontSize: 14, cursor: "pointer", padding: 0,
          }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.white }}>Create</div>
          <div style={{
            background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "3px 10px", fontSize: 11, color: C.gray3,
          }}>#[Category]</div>
        </div>

        {/* General Settings */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 18 }}>General Settings</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Temporary Channel Name</div>
              <input defaultValue="{user}'s Channel" style={{
                width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 13,
                fontFamily: "inherit", outline: "none",
              }} />
            </div>
            <div style={{ minWidth: 140 }}>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Creation Limit</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input defaultValue="1" style={{
                  flex: 1, background: C.cardHover, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 13,
                  fontFamily: "inherit", outline: "none", textAlign: "center",
                }} />
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Temporary Channels Category</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12 }}>📁</span>
                  <span style={{ fontSize: 13, color: C.gray1 }}>[Category]</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
                  <span style={{ color: C.gray4 }}>▼</span>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>New Channels Position</div>
              <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                <option>At the bottom</option>
                <option>At the top</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Region</div>
            <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
              <option>🌐 Automatic</option>
              <option>🇺🇸 US West</option>
              <option>🇸🇦 Dubai</option>
            </select>
          </div>
        </div>

        {/* Permissions */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 18 }}>Permissions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Temporary Channel Allowed Roles</div>
              <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray3, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                <option>Select roles...</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Temporary Channel Privacy Mode</div>
              <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray1, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                <option>Public</option>
                <option>Private</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.gray2, marginBottom: 12 }}>Temporary Channel Permissions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {permissions.map(([l1, v1, l2, v2], i) => (
              <div key={i} style={{ display: "contents" }}>
                <div style={{ padding: "0 0 0 0" }}><PermRow label={l1} val={v1} /></div>
                <div style={{ paddingLeft: 16 }}><PermRow label={l2} val={v2} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel Options */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 18 }}>Panel Options</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: "8px 16px", alignItems: "center" }}>
            {panelOptions.map(([l1, v1, l2, v2], i) => (
              <div key={i} style={{ display: "contents" }}>
                <span style={{ fontSize: 12, color: C.gray2 }}>{l1}</span>
                <div style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: v1 ? "#1A3060" : "#3A0A0A",
                  color: v1 ? C.accent : C.red,
                  border: `1px solid ${v1 ? "#2A4080" : "#5A1A1A"}`,
                  cursor: "pointer",
                }}>{v1 ? "Enabled" : "Disabled"}</div>
                <span style={{ fontSize: 12, color: C.gray2, paddingLeft: 16 }}>{l2}</span>
                <div style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: v2 ? "#1A3060" : "#3A0A0A",
                  color: v2 ? C.accent : C.red,
                  border: `1px solid ${v2 ? "#2A4080" : "#5A1A1A"}`,
                  cursor: "pointer",
                }}>{v2 ? "Enabled" : "Disabled"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Other Settings */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 18 }}>Other Settings</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Greeting Message</div>
            <textarea placeholder="Enter a greeting message for when users join the temporary voice channel..." style={{
              width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 13,
              fontFamily: "inherit", outline: "none", height: 80, resize: "vertical",
            }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Temporary Voice Role</div>
            <select style={{ width: "100%", background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.gray3, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
              <option>Select a role...</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1 }}>Give Owner Only Role</div>
              <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Only give the temporary voice role to the channel owner</div>
            </div>
            <Toggle on={ownerOnly} onChange={setOwnerOnly} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1 }}>Interface for In-Voice Chat</div>
              <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Enable interface controls for in-voice chat</div>
            </div>
            <Toggle on={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Temp Voice</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Configure temporary voice channels for your server</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {["Channels", "Panel"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "9px", borderRadius: 8, border: "none",
            background: tab === t ? C.cardHover : "transparent",
            color: tab === t ? C.white : C.gray3,
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: tab === t ? `1px solid ${C.border}` : "none",
          }}>{t}</button>
        ))}
      </div>

      {tab === "Channels" && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>Temporary Voice Channels</div>
              <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>1 channel configured</div>
            </div>
            <button onClick={() => setView("create")} style={{
              background: C.accent, border: "none", borderRadius: 8,
              padding: "9px 18px", color: C.white, fontSize: 13,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>Create Channel</button>
          </div>
          <div style={{ marginTop: 16 }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
              padding: "10px 0", borderBottom: `1px solid ${C.border}`,
            }}>
              {["CHANNEL NAME", "CATEGORY", "CREATED AT", "ACTIONS"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.gray4, letterSpacing: "0.5px" }}>{h}</div>
              ))}
            </div>
            {/* Table row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
              padding: "14px 0", alignItems: "center",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 13, color: C.white }}>Create</span>
              <span style={{ fontSize: 13, color: C.gray2 }}>[Category]</span>
              <span style={{ fontSize: 13, color: C.gray2 }}>—</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setView("create")} style={{
                  background: "transparent", border: "none", color: C.accent,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}>Manage</button>
                <button style={{
                  background: "transparent", border: "none", color: C.red,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "Panel" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
          {/* Left: Interface Embed builder */}
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 4 }}>Interface Embed</div>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 18 }}>Customize the embed message for the temporary voice interface</div>

            {/* Embed editor */}
            <div style={{ background: C.cardHover, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px", borderLeft: `3px solid ${C.accent}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2A3060", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.accent }}>D</div>
                      <span style={{ fontSize: 12, color: C.gray2 }}>from: DOBERMANN,</span>
                      <span style={{ color: C.gray4, marginLeft: "auto", fontSize: 12, cursor: "pointer" }}>🔗 ○</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>Dear [@user],</div>
                    <div style={{ fontSize: 13, color: C.white, marginBottom: 6 }}>This is Voice Control Panel</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: C.gray4, fontSize: 12, cursor: "pointer" }}>🔗</span>
                      <span style={{ color: C.gray4, fontSize: 12, cursor: "pointer" }}>○</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.gray3, lineHeight: 1.6, marginBottom: 4 }}>
                      Use the buttons below to manage your temporary voice channel.<br />
                      • Rename your channel<br />
                      • Set user limit<br />
                      • Change privacy settings<br />
                      • Lock/Unlock channel<br />
                      • Trust/Block users<br />
                      • And more!
                    </div>
                    <div style={{ color: C.gray4, fontSize: 12, cursor: "pointer" }}>○</div>
                  </div>
                  <div style={{
                    width: 60, height: 60, borderRadius: 8, overflow: "hidden",
                    background: "#1A2A1A", border: `1px solid ${C.border}`, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  }}>🎙</div>
                </div>
                <button style={{
                  width: "100%", marginTop: 8, background: C.card, border: `1px dashed ${C.border}`,
                  borderRadius: 6, padding: "8px", color: C.gray3, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Add Field</button>
              </div>
              {/* Image area */}
              <div style={{
                background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 12px 12px",
                height: 120,
              }} />
            </div>
          </div>

          {/* Right: Send Interface + Reset Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Send Interface */}
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 16 }}>Send Interface</div>
              <div style={{
                background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: C.gray4 }}>#</span>
                  <span style={{ fontSize: 13, color: C.gray1 }}>—</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
                  <span style={{ color: C.gray4 }}>▼</span>
                </div>
              </div>
              <button style={{
                width: "100%", background: C.accent, border: "none",
                borderRadius: 8, padding: "10px", color: C.white,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>Send</button>
            </div>

            {/* Reset Panel */}
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 4 }}>Reset Panel</div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 14 }}>Revert all panel settings to their default values</div>
              <button style={{
                width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px", color: C.gray2,
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}>Revert to Default</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: SELF-ROLES
// ─────────────────────────────────────────────────────────────────────────────
function SelfRoles() {
  const [view, setView] = useState("list");
  const [reactionType, setReactionType] = useState("Emoji");
  const [behavior, setBehavior] = useState("Toggle");
  const [notifications, setNotifications] = useState(false);

  if (view === "create") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <button onClick={() => setView("list")} style={{
            background: "transparent", border: "none", color: C.gray3,
            fontSize: 14, cursor: "pointer", padding: 0,
          }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.white }}>Create Self Role</div>
        </div>

        {/* Select Message */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>Select Message</div>
          <div style={{ fontSize: 12, color: C.gray3, marginBottom: 16 }}>Choose an embed message to attach self-assignable roles to</div>
          <div style={{
            background: C.cardHover, border: `1px dashed ${C.border}`,
            borderRadius: 10, padding: "40px 20px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <div style={{ fontSize: 28, color: C.gray5 }}>💬</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.gray3 }}>No embed messages available.</div>
            <div style={{ fontSize: 12, color: C.gray4 }}>Create an embed message first to continue.</div>
          </div>
        </div>

        {/* Reaction Type */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 16 }}>Reaction Type</div>
          <div style={{ display: "flex", gap: 4, background: C.cardHover, borderRadius: 8, padding: 3, marginBottom: 16, width: "fit-content" }}>
            {["Emoji", "Button", "Dropdown"].map(t => (
              <button key={t} onClick={() => setReactionType(t)} style={{
                padding: "8px 20px", borderRadius: 7, border: "none",
                background: reactionType === t ? C.card : "transparent",
                color: reactionType === t ? C.white : C.gray3,
                fontSize: 13, fontWeight: reactionType === t ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit",
                outline: reactionType === t ? `1px solid ${C.border}` : "none",
              }}>{t}</button>
            ))}
          </div>
          {reactionType === "Emoji" && (
            <button style={{
              background: "transparent", border: `1px dashed ${C.border}`,
              borderRadius: 8, padding: "8px 18px", color: C.gray3,
              fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${C.border}` }} />
              Add Emoji Reaction
            </button>
          )}
        </div>

        {/* Reaction Behavior */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>Reaction Behavior</div>
          <div style={{ fontSize: 12, color: C.gray3, marginBottom: 16 }}>Choose how reactions should behave when users interact with them</div>
          {[
            { val: "Toggle", desc: "Users can have multiple roles from this reaction role menu." },
            { val: "Give Only", desc: "Users can only have one role at a time from this menu." },
            { val: "Take Only", desc: "Opposite of standard - adds role when reaction is removed." },
          ].map(opt => (
            <div key={opt.val} onClick={() => setBehavior(opt.val)} style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
              borderRadius: 10, cursor: "pointer", marginBottom: 8,
              background: behavior === opt.val ? "#1A1C30" : "transparent",
              border: `1px solid ${behavior === opt.val ? C.accent + "50" : C.border}`,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%", marginTop: 2, flexShrink: 0,
                border: `2px solid ${behavior === opt.val ? C.accent : C.gray4}`,
                background: behavior === opt.val ? C.accent : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {behavior === opt.val && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 3 }}>{opt.val}</div>
                <div style={{ fontSize: 12, color: C.gray3 }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Notifications */}
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>Notifications</div>
              <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Send a DM to users when they receive or lose a role</div>
            </div>
            <Toggle on={notifications} onChange={setNotifications} />
          </div>
          {[
            { label: "Give Role Message", placeholder: "You have been given the {role} role!", hint: "Message sent when a user receives a role. Use {role} for the role name." },
            { label: "Take Role Message", placeholder: "The {role} role has been removed from you.", hint: "Message sent when a role is removed from a user. Use {role} for the role name." },
            { label: "General Message", placeholder: "Your roles have been updated.", hint: "General notification message for role changes." },
          ].map((f, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>{f.label}</div>
              <input placeholder={f.placeholder} style={{
                width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 13,
                fontFamily: "inherit", outline: "none", marginBottom: 4,
              }} />
              <div style={{ fontSize: 11, color: C.gray4 }}>{f.hint}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Self-Assignable Roles</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Create role panels for your members</div>
      </div>
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>Role Panels</div>
          <button onClick={() => setView("create")} style={{
            background: C.accent, border: "none", borderRadius: 8,
            padding: "9px 18px", color: C.white, fontSize: 13,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>+ Create Panel</button>
        </div>
        <div style={{
          background: C.cardHover, border: `1px dashed ${C.border}`,
          borderRadius: 10, padding: "50px 20px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{ fontSize: 32, color: C.gray5 }}>🎭</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.gray3 }}>No role panels yet.</div>
          <div style={{ fontSize: 12, color: C.gray4 }}>Create your first panel to let members assign their own roles.</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV DATA
// ─────────────────────────────────────────────────────────────────────────────
const NAV = [
  {
    section: "GENERAL",
    items: [
      { id: "overview", label: "Overview", icon: "🏠" },
      { id: "setup", label: "Server Setup", icon: "⚙" },
      { id: "commands", label: "Commands", icon: "⊞" },
      { id: "dashperms", label: "Dashboard Permissio...", icon: "🔐", premium: true },
    ],
  },
  {
    section: "MODERATION",
    items: [
      { id: "automod", label: "Auto-Moderation", icon: "🤖" },
      { id: "modtools", label: "Moderation Tools", icon: "⚒" },
      { id: "protection", label: "Protection", icon: "🛡" },
      { id: "antiraid", label: "Anti-Raid", icon: "⚡", premium: true },
    ],
  },
  {
    section: "COMMUNITY",
    items: [
      { id: "leveling", label: "Leveling", icon: "📈" },
      { id: "welcomer", label: "Welcomer", icon: "👋" },
      { id: "suggestions", label: "Suggestions", icon: "💡" },
      { id: "tickets", label: "Tickets", icon: "🎫" },
      { id: "giveaways", label: "Giveaways", icon: "🎁" },
    ],
  },
  {
    section: "CUSTOMIZATION",
    items: [
      { id: "autoroles", label: "Auto-Roles", icon: "🎭" },
      { id: "selfroles", label: "Self-Roles", icon: "▶" },
      { id: "colors", label: "Colors", icon: "🎨" },
      { id: "tempvoice", label: "Temp Voice", icon: "🔊" },
    ],
  },
  {
    section: "MESSAGES",
    items: [
      { id: "embeds", label: "Embed Messages", icon: "📋" },
      { id: "autoresponder", label: "Auto-Reply", icon: "↩" },
      { id: "autointeraction", label: "Auto-Interaction", icon: "⚡" },
      { id: "reminders", label: "Reminders", icon: "🔔", badge: "NEW" },
    ],
  },
  {
    section: "MONITORING",
    items: [
      { id: "logs", label: "Logging", icon: "📁" },
      { id: "insights", label: "Server Insights", icon: "📊" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER PAGE for unbuilt sections
// ─────────────────────────────────────────────────────────────────────────────
function PlaceholderPage({ title, desc, icon }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: C.white, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.gray3 }}>{desc}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED PROTECTION PAGE
// ─────────────────────────────────────────────────────────────────────────────
function ProtectionFull() {
  const [activeTab, setActiveTab] = useState("General Protection");
  const [dmOnPunishment, setDmOnPunishment] = useState(true);
  const [states, setStates] = useState({});
  const toggle = k => setStates(p => ({ ...p, [k]: !p[k] }));

  const InstantBadge = () => (
    <span style={{
      background: "#1A2A1A", border: "1px solid #2A4A2A",
      borderRadius: 5, padding: "1px 7px", fontSize: 10,
      fontWeight: 700, color: "#4ADE80", marginLeft: 6,
    }}>Instant</span>
  );

  const ProtRow = ({ k, label, desc, icon, instant }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: C.card, borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.border}`, marginBottom: 4,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: C.cardHover,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, border: `1px solid ${C.border}`, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{label}</span>
          {instant && <InstantBadge />}
        </div>
        <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>{desc}</div>
      </div>
      <Toggle on={!!states[k]} onChange={() => toggle(k)} />
    </div>
  );

  const SectionHeader = ({ title }) => (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.sectionLabel,
      letterSpacing: "1px", textTransform: "uppercase",
      padding: "16px 0 8px", marginTop: 8,
    }}>{title}</div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Protection</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Protect your server from malicious actions</div>
      </div>

      {/* Master Settings */}
      <div style={{ background: C.card, borderRadius: 12, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 16 }}>Master Settings</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1, marginBottom: 4 }}>Log Channel</div>
          <div style={{ fontSize: 12, color: C.gray3, marginBottom: 8 }}>Channel to send protection alerts</div>
          <div style={{
            background: C.cardHover, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: C.gray4 }}>#</span>
              <span style={{ fontSize: 13, color: C.gray1 }}>—</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
              <span style={{ color: C.gray4 }}>▼</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.gray1 }}>DM on Punishment</div>
            <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>Send a DM to users when they are punished</div>
          </div>
          <Toggle on={dmOnPunishment} onChange={setDmOnPunishment} />
        </div>
      </div>

      {/* Whitelist */}
      <div style={{ background: C.card, borderRadius: 12, padding: "20px", border: `1px solid ${C.border}`, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 4 }}>Whitelist</div>
        <div style={{ fontSize: 12, color: C.gray3, marginBottom: 14 }}>Users and roles exempt from all protection rules</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 6 }}>Whitelisted Users ℹ</div>
            <div style={{ background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ background: "#1A3060", border: "1px solid #2A4080", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#7CA8FF", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4A90E2", display: "inline-block" }} />
                —
                <span style={{ color: C.gray4, cursor: "pointer" }}>✕</span>
              </div>
              <span style={{ color: C.gray4, marginLeft: "auto" }}>✕ ▼</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.gray2, marginBottom: 6 }}>Whitelisted Roles ℹ</div>
            <div style={{ background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: C.gray4 }}>Select roles</span>
              <span style={{ color: C.gray4 }}>▼</span>
            </div>
          </div>
        </div>
      </div>

      {/* Protection Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["General Protection", "Commands Limit", "Role-Based Protection"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "9px 18px", borderRadius: 8, border: "none",
            background: activeTab === tab ? C.accent : C.card,
            color: activeTab === tab ? C.white : C.gray3,
            fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: activeTab === tab ? "none" : `1px solid ${C.border}`,
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === "General Protection" && (
        <div>
          <SectionHeader title="MEMBER ACTIONS" />
          {[
            { k: "antiBan", label: "Anti Ban", desc: "Punish users who mass-ban members", icon: "🚫" },
            { k: "antiKick", label: "Anti Kick", desc: "Punish users who mass-kick members", icon: "👢" },
            { k: "antiRole", label: "Anti Role", desc: "Punish users who mass-add roles to members", icon: "🏷" },
          ].map(p => <ProtRow key={p.k} {...p} />)}

          <SectionHeader title="ROLE MANAGEMENT" />
          {[
            { k: "antiRoleCreate", label: "Anti Role Create", desc: "Punish users who mass-create roles", icon: "🛡" },
            { k: "antiRoleDelete", label: "Anti Role Delete", desc: "Punish users who mass-delete roles", icon: "🚫" },
            { k: "antiRoleRename", label: "Anti Role Rename", desc: "Punish users who rename roles", icon: "✏", instant: true },
            { k: "antiDangerousRole", label: "Anti Dangerous Role Add", desc: "Punish users who add roles with dangerous permissions", icon: "⚠", instant: true },
            { k: "antiDangerousPerm", label: "Anti Dangerous Permission Update", desc: "Punish users who add dangerous permissions to roles", icon: "🔑", instant: true },
          ].map(p => <ProtRow key={p.k} {...p} />)}

          <SectionHeader title="CHANNEL MANAGEMENT" />
          {[
            { k: "antiChannelCreate", label: "Anti Channel Create", desc: "Punish users who mass-create channels", icon: "📁" },
            { k: "antiChannelDelete", label: "Anti Channel Delete", desc: "Punish users who mass-delete channels", icon: "🗑" },
            { k: "antiChannelRename", label: "Anti Channel Rename", desc: "Punish users who rename channels", icon: "✏", instant: true },
          ].map(p => <ProtRow key={p.k} {...p} />)}

          <SectionHeader title="SERVER SETTINGS" />
          {[
            { k: "antiServerRename", label: "Anti Server Rename", desc: "Punish users who rename the server", icon: "🖥", instant: true },
            { k: "antiServerIcon", label: "Anti Server Icon Change", desc: "Punish users who change the server icon", icon: "🖼", instant: true },
          ].map(p => <ProtRow key={p.k} {...p} />)}

          <SectionHeader title="OTHER PROTECTIONS" />
          {[
            { k: "antiBotAdd", label: "Anti Bot Add", desc: "Punish users who add bots without permission", icon: "🤖", instant: true },
            { k: "antiEmojiDelete", label: "Anti Emoji Delete", desc: "Punish users who delete emojis", icon: "😊", instant: true },
            { k: "antiEmojiRename", label: "Anti Emoji Rename", desc: "Punish users who rename emojis", icon: "😄", instant: true },
            { k: "antiInviteDelete", label: "Anti Invite Delete", desc: "Punish users who delete invites", icon: "✉", instant: true },
            { k: "antiWebhookCreate", label: "Anti Webhook Create", desc: "Punish users who create webhooks", icon: "🔗", instant: true },
            { k: "antiWebhookDelete", label: "Anti Webhook Delete", desc: "Punish users who delete webhooks", icon: "🗑", instant: true },
            { k: "antiStickerDelete", label: "Anti Sticker Delete", desc: "Punish users who delete stickers", icon: "📄", instant: true },
            { k: "antiEventCancel", label: "Anti Event Cancel", desc: "Punish users who cancel scheduled events", icon: "📅", instant: true },
          ].map(p => <ProtRow key={p.k} {...p} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE MAP
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: MODERATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────
function ModerationTools() {
  const [activeTab, setActiveTab]   = useState("Bans");
  const [search, setSearch]         = useState("");
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);

  // Action form state
  const [showForm, setShowForm]     = useState(false);
  const [formAction, setFormAction] = useState("ban");
  const [formUserId, setFormUserId] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formDuration, setFormDuration] = useState(600);
  const [submitting, setSubmitting] = useState(false);

  const tabs = ["Bans", "Mutes", "Timeouts", "Temp Roles"];

  const tabToType = { Bans: "ban", Mutes: "mute", Timeouts: "timeout", "Temp Roles": "temp_role" };

  // Load records from API when tab changes
  useEffect(() => {
    setLoading(true);
    const type = tabToType[activeTab];
    apiGet(`/api/moderation?guildId=${GUILD_ID}&type=${type}`)
      .then(data => { setRecords(Array.isArray(data) ? data : []); })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  // Show toast
  const showToast = (msg, ok) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Submit moderation action
  const submitAction = async () => {
    if (!formUserId.trim()) return showToast("User ID is required", false);
    setSubmitting(true);
    try {
      await apiPost("/api/moderation", {
        action: formAction,
        targetId: formUserId.trim(),
        reason: formReason || "No reason provided",
        duration: ["timeout", "mute"].includes(formAction) ? formDuration : undefined,
      });
      showToast(`${formAction} queued — bot will execute shortly`, true);
      setShowForm(false);
      setFormUserId(""); setFormReason(""); setFormDuration(600);
      // Refresh records after 2s (bot needs time to execute)
      setTimeout(() => {
        const type = tabToType[activeTab];
        apiGet(`/api/moderation?guildId=${GUILD_ID}&type=${type}`)
          .then(data => setRecords(Array.isArray(data) ? data : []));
      }, 2000);
    } catch (err) {
      showToast(`Error: ${err.message}`, false);
    } finally {
      setSubmitting(false);
    }
  };

  // Remove a moderation record
  const removeRecord = async (id) => {
    try {
      await fetch(`${API_BASE}/api/moderation/${id}`, { method: "DELETE" });
      setRecords(prev => prev.filter(r => r.id !== id));
      showToast("Record removed", true);
    } catch (err) {
      showToast("Failed to remove", false);
    }
  };

  const filtered = records.filter(r =>
    !search || r.username?.toLowerCase().includes(search.toLowerCase()) || r.user_id?.includes(search)
  );

  const columns = {
    Bans:         ["USER", "REASON", "EXPIRES", "ACTIONS"],
    Mutes:        ["USER", "REASON", "EXPIRES", "ACTIONS"],
    Timeouts:     ["USER", "REASON", "EXPIRES", "ACTIONS"],
    "Temp Roles": ["USER", "REASON", "EXPIRES", "ACTIONS"],
  };

  const actionOptions = {
    Bans:         ["ban", "unban"],
    Mutes:        ["mute", "unmute"],
    Timeouts:     ["timeout", "untimeout"],
    "Temp Roles": ["timeout"],
  };

  return (
    <div>
      <Toast toast={toast} />
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Moderation Tools</div>
          <div style={{ fontSize: 13, color: C.gray3 }}>Manage bans, mutes, timeouts, and temporary roles for your server</div>
        </div>
        <button onClick={() => { setFormAction(tabToType[activeTab]); setShowForm(true); }} style={{
          background: C.accent, border: "none", borderRadius: 9, padding: "9px 18px",
          color: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>+ New Action</button>
      </div>

      {/* Action Form */}
      {showForm && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 14 }}>Execute Moderation Action</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Action</div>
              <select value={formAction} onChange={e => setFormAction(e.target.value)} style={{
                width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 12px", color: C.gray1, fontSize: 13,
                fontFamily: "inherit", outline: "none",
              }}>
                {actionOptions[activeTab].map(a => (
                  <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>User ID</div>
              <input
                value={formUserId}
                onChange={e => setFormUserId(e.target.value)}
                placeholder="Discord User ID..."
                style={{
                  width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "9px 12px", color: C.gray1, fontSize: 13,
                  fontFamily: "inherit", outline: "none",
                }}
              />
            </div>
            {["timeout", "mute"].includes(formAction) && (
              <div>
                <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Duration (seconds)</div>
                <input
                  type="number" min={10} max={2419200}
                  value={formDuration}
                  onChange={e => setFormDuration(Number(e.target.value))}
                  style={{
                    width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "9px 12px", color: C.gray1, fontSize: 13,
                    fontFamily: "inherit", outline: "none",
                  }}
                />
              </div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Reason</div>
            <input
              value={formReason}
              onChange={e => setFormReason(e.target.value)}
              placeholder="Reason for this action..."
              style={{
                width: "100%", background: C.cardHover, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 12px", color: C.gray1, fontSize: 13,
                fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowForm(false)} style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "8px 18px", color: C.gray1, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
            <button onClick={submitAction} disabled={submitting} style={{
              background: C.red, border: "none", borderRadius: 8,
              padding: "8px 18px", color: C.white, fontSize: 13,
              fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit",
              opacity: submitting ? 0.7 : 1,
            }}>{submitting ? "Sending…" : "Execute"}</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "10px 14px", marginBottom: 16,
      }}>
        <span style={{ color: C.gray4, fontSize: 14 }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by username or ID..."
          style={{
            flex: 1, background: "transparent", border: "none",
            color: C.white, fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: activeTab === t ? C.accent : C.card,
            color: activeTab === t ? C.white : C.gray3,
            fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
            cursor: "pointer", fontFamily: "inherit",
            outline: activeTab === t ? "none" : `1px solid ${C.border}`,
          }}>{t}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr",
          padding: "12px 20px", borderBottom: `1px solid ${C.border}`, gap: 12,
        }}>
          {columns[activeTab].map(col => (
            <div key={col} style={{ fontSize: 11, fontWeight: 700, color: C.gray4, letterSpacing: "0.5px" }}>{col}</div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.gray3, fontSize: 13 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.gray3, fontSize: 13 }}>
            No moderation actions found
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} style={{
              display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr",
              padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
              gap: 12, alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{r.username || "Unknown"}</div>
                <div style={{ fontSize: 11, color: C.gray4 }}>{r.user_id}</div>
              </div>
              <div style={{ fontSize: 13, color: C.gray2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.reason || "No reason"}
              </div>
              <div style={{ fontSize: 12, color: C.gray3 }}>
                {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "Permanent"}
              </div>
              <div>
                <button onClick={() => removeRecord(r.id)} style={{
                  background: "transparent", border: `1px solid ${C.red}`,
                  borderRadius: 7, padding: "5px 12px", color: C.red,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: EMBED MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
function EmbedMessages() {
  const [embeds, setEmbeds] = useState([]);
  const [editingEmbed, setEditingEmbed] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [embedTitle, setEmbedTitle] = useState("New Embed Message");
  const [msgTab, setMsgTab] = useState("Main Message");

  const now = () => {
    const d = new Date();
    return `Mar ${d.getDate()}, ${d.getFullYear()}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const createEmbed = () => {
    const newEmbed = { id: Date.now(), name: "New Embed Message", createdAt: now() };
    setEmbeds(prev => [...prev, newEmbed]);
    setEmbedTitle(newEmbed.name);
    setEditingEmbed(newEmbed);
  };

  const deleteEmbed = (id) => setEmbeds(prev => prev.filter(e => e.id !== id));

  // ── EDITOR VIEW ──
  if (editingEmbed) {
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setEditingEmbed(null)} style={{
              background: "transparent", border: "none", color: C.gray3,
              fontSize: 18, cursor: "pointer", padding: 0,
            }}>‹</button>
            {editingTitle ? (
              <input
                autoFocus
                value={embedTitle}
                onChange={e => setEmbedTitle(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  setEmbeds(prev => prev.map(e => e.id === editingEmbed.id ? { ...e, name: embedTitle } : e));
                }}
                onKeyDown={e => e.key === "Enter" && e.target.blur()}
                style={{
                  background: "transparent", border: `1px solid ${C.accent}`,
                  borderRadius: 6, padding: "4px 10px", color: C.white,
                  fontSize: 16, fontWeight: 600, fontFamily: "inherit", outline: "none",
                }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.white }}>{embedTitle}</span>
                <button onClick={() => setEditingTitle(true)} style={{
                  background: "transparent", border: "none", color: C.gray3,
                  fontSize: 13, cursor: "pointer", padding: 0,
                }}>✏</button>
              </div>
            )}
          </div>
          <button style={{
            background: C.accent, border: "none", borderRadius: 8,
            padding: "9px 20px", color: C.white, fontSize: 13,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Send Message</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["Main Message", "Previous Messages"].map(t => (
            <button key={t} onClick={() => setMsgTab(t)} style={{
              flex: 1, padding: "9px", borderRadius: 8, border: "none",
              background: msgTab === t ? C.cardHover : "transparent",
              color: msgTab === t ? C.white : C.gray3,
              fontSize: 13, fontWeight: msgTab === t ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit",
              outline: msgTab === t ? `1px solid ${C.border}` : "none",
            }}>{t}</button>
          ))}
        </div>

        {msgTab === "Main Message" && (
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
            {/* Bot identity bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #4A90E2, #7C6AF7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>🐱</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>SIS Bot</span>
                <div style={{
                  background: "#4A90E2", borderRadius: 4, padding: "1px 5px",
                  fontSize: 9, fontWeight: 700, color: C.white,
                }}>APP</div>
                <span style={{ fontSize: 12, color: C.gray4 }}>Today at 5:56 PM</span>
              </div>
            </div>

            {/* Content field */}
            <div style={{
              background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 14px", marginBottom: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, color: C.gray4 }}>Content</span>
              <span style={{ color: C.gray4, cursor: "pointer" }}>☺</span>
            </div>

            {/* Embed builder */}
            <div style={{
              background: C.cardHover, borderRadius: 10, border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${C.accent}`, overflow: "hidden", marginBottom: 12,
            }}>
              {/* Embed tools */}
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                <button style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.gray3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>⚙</button>
                <button style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.gray3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📋</button>
              </div>

              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    {/* Author */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 0", borderBottom: `1px solid ${C.border}20`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>👤</div>
                        <span style={{ fontSize: 12, color: C.gray3 }}>Author</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ color: C.gray4, cursor: "pointer", fontSize: 12 }}>🔗</span>
                        <span style={{ color: C.gray4, cursor: "pointer", fontSize: 12 }}>✕</span>
                      </div>
                    </div>

                    {/* Title */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 0",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.gray2 }}>Title</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ color: C.gray4, cursor: "pointer", fontSize: 12 }}>🔗</span>
                        <span style={{ color: C.gray4, cursor: "pointer", fontSize: 12 }}>✕</span>
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                      <span style={{ fontSize: 12, color: C.gray3 }}>Description</span>
                      <span style={{ color: C.gray4, cursor: "pointer", fontSize: 12 }}>✕</span>
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div style={{
                    width: 60, height: 60, borderRadius: 8, flexShrink: 0,
                    background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 10px 10px",
                    border: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>👤</div>
                  </div>
                </div>

                {/* Add Field */}
                <button style={{
                  width: "100%", marginTop: 10, background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "8px", color: C.gray3, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Add Field</button>
              </div>

              {/* Image drop zone */}
              <div style={{
                background: "repeating-conic-gradient(#1E2028 0% 25%, #16181F 0% 50%) 0 0 / 10px 10px",
                height: 80,
              }} />

              {/* Footer */}
              <div style={{
                padding: "10px 14px", borderTop: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: C.border }} />
                  <span style={{ fontSize: 12, color: C.gray3 }}>Footer Text</span>
                </div>
                <div style={{ display: "flex", gap: 8, color: C.gray4 }}>
                  <span style={{ cursor: "pointer" }}>☺</span>
                  <span style={{ cursor: "pointer" }}>🔗</span>
                </div>
              </div>
            </div>

            {/* Bottom action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{
                width: "100%", background: "transparent", border: `1px dashed ${C.border}`,
                borderRadius: 8, padding: "10px", color: C.gray3, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span>＋</span> Add New Embed
              </button>
              <button style={{
                width: "100%", background: "transparent", border: `1px dashed ${C.border}`,
                borderRadius: 8, padding: "10px", color: C.gray3, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span>🖼</span> Add New Image
              </button>
              <button style={{
                width: "fit-content", background: "transparent", border: `1px dashed ${C.border}`,
                borderRadius: 8, padding: "9px 18px", color: C.gray3, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 14 }}>＋</span> Add Component
              </button>
            </div>
          </div>
        )}

        {msgTab === "Previous Messages" && (
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.gray2, marginBottom: 6 }}>No previous messages</div>
            <div style={{ fontSize: 12, color: C.gray4 }}>Messages sent from this embed will appear here.</div>
          </div>
        )}
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 4 }}>Embed Messages</div>
        <div style={{ fontSize: 13, color: C.gray3 }}>Create and manage custom embed messages and interactive components</div>
      </div>

      {/* Create cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Normal */}
        <div
          onClick={embeds.length < 10 ? createEmbed : undefined}
          style={{
            background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
            padding: "20px 24px", cursor: embeds.length < 10 ? "pointer" : "not-allowed",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6 }}>Normal Embed Message</div>
            <div style={{ fontSize: 12, color: C.gray3 }}>Create beautiful embed messages with rich formatting</div>
          </div>
          <span style={{ color: C.gray3, fontSize: 18, marginLeft: 12 }}>＋</span>
        </div>

        {/* Components - Coming Soon */}
        <div style={{
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
          padding: "20px 24px", opacity: 0.5,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6 }}>Components Messages</div>
            <div style={{ fontSize: 12, color: C.gray3, marginBottom: 6 }}>Create interactive messages with buttons and menus</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>Coming Soon</div>
          </div>
          <span style={{ color: C.gray5, fontSize: 18, marginLeft: 12 }}>＋</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>Normal Embed Messages</div>
          <div style={{ fontSize: 12, color: C.gray3, marginTop: 2 }}>{embeds.length}/10 embeds</div>
        </div>

        {embeds.length === 0 ? (
          <div style={{
            background: C.cardHover, border: `1px dashed ${C.border}`,
            borderRadius: 10, padding: "50px 20px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <div style={{ fontSize: 36, color: C.gray5 }}>📋</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.gray3 }}>No embed messages yet.</div>
            <div style={{ fontSize: 12, color: C.gray4 }}>Click "Normal Embed Message" above to create one.</div>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr auto",
              padding: "8px 0", borderBottom: `1px solid ${C.border}`,
            }}>
              {["MESSAGE NAME", "CREATED AT", "ACTIONS"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.gray4, letterSpacing: "0.5px" }}>{h}</div>
              ))}
            </div>

            {embeds.map((e, i) => (
              <div key={e.id} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr auto",
                padding: "14px 0", alignItems: "center",
                borderBottom: i < embeds.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 13, color: C.white }}>{e.name}</span>
                <span style={{ fontSize: 13, color: C.gray3 }}>{e.createdAt}</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => { setEmbedTitle(e.name); setEditingEmbed(e); }} style={{
                    background: "transparent", border: "none", color: C.accent,
                    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}>Manage</button>
                  <button onClick={() => deleteEmbed(e.id)} style={{
                    background: "transparent", border: "none", color: C.red,
                    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const PAGES = {
  overview:    { label: "Overview",          icon: "🏠",  comp: () => <Overview /> },
  setup:       { label: "Server Setup",      icon: "⚙",  comp: () => <ServerSetup /> },
  commands:    { label: "Commands",          icon: "⊞",  comp: () => <Commands /> },
  automod:     { label: "Auto-Moderation",   icon: "🤖", comp: () => <AutoModeration /> },
  protection:  { label: "Protection",        icon: "🛡", comp: () => <ProtectionFull /> },
  leveling:    { label: "Leveling",          icon: "📈", comp: () => <Leveling /> },
  welcomer:    { label: "Welcomer",          icon: "👋", comp: () => <Welcomer /> },
  selfroles:   { label: "Self-Roles",        icon: "▶",  comp: () => <SelfRoles /> },
  tempvoice:   { label: "Temp Voice",        icon: "🔊", comp: () => <TempVoice /> },
  modtools:    { label: "Moderation Tools",  icon: "⚒", comp: () => <ModerationTools /> },
  antiraid:    { label: "Anti-Raid",         icon: "⚡", comp: () => <PlaceholderPage title="Anti-Raid" desc="Requires Premium. Configure anti-raid protection." icon="⚡" /> },
  suggestions: { label: "Suggestions",       icon: "💡", comp: () => <PlaceholderPage title="Suggestions" desc="Configure the suggestion system for your server." icon="💡" /> },
  tickets:     { label: "Tickets",           icon: "🎫", comp: () => <PlaceholderPage title="Tickets" desc="Configure the ticket system for support and requests." icon="🎫" /> },
  giveaways:   { label: "Giveaways",         icon: "🎁", comp: () => <PlaceholderPage title="Giveaways" desc="Create and manage giveaways for your server." icon="🎁" /> },
  autoroles:   { label: "Auto-Roles",        icon: "🎭", comp: () => <PlaceholderPage title="Auto-Roles" desc="Automatically assign roles when members join." icon="🎭" /> },
  colors:      { label: "Colors",            icon: "🎨", comp: () => <PlaceholderPage title="Colors" desc="Create color roles for your members to choose from." icon="🎨" /> },
  embeds:      { label: "Embed Messages",    icon: "📋", comp: () => <EmbedMessages /> },
  autoresponder:{ label: "Auto-Reply",       icon: "↩", comp: () => <PlaceholderPage title="Auto-Reply" desc="Configure automatic responses to messages." icon="↩" /> },
  autointeraction:{ label: "Auto-Interaction", icon: "⚡", comp: () => <PlaceholderPage title="Auto-Interaction" desc="Configure automatic interactions and triggers." icon="⚡" /> },
  reminders:   { label: "Reminders",         icon: "🔔", comp: () => <PlaceholderPage title="Reminders" desc="Set up scheduled reminders for your server." icon="🔔" /> },
  logs:        { label: "Logging",           icon: "📁", comp: () => <PlaceholderPage title="Logging" desc="Configure server event logging." icon="📁" /> },
  insights:    { label: "Server Insights",   icon: "📊", comp: () => <PlaceholderPage title="Server Insights" desc="View detailed analytics about your server." icon="📊" /> },
  dashperms:   { label: "Dashboard Perms",   icon: "🔐", comp: () => <PlaceholderPage title="Dashboard Permissions" desc="Control who can access the dashboard. Requires Premium." icon="🔐" /> },
  twitch:      { label: "Twitch",            icon: "💜", comp: () => <PlaceholderPage title="Twitch Notifications" desc="Get notified when your Twitch streams go live. Requires Premium." icon="💜" /> },
  youtube:     { label: "YouTube",           icon: "❤",  comp: () => <PlaceholderPage title="YouTube Notifications" desc="Get notified about new YouTube videos. Requires Premium." icon="❤" /> },
  kick:        { label: "Kick",              icon: "💚", comp: () => <PlaceholderPage title="Kick Notifications" desc="Get notified when your Kick streams go live. Requires Premium." icon="💚" /> },
  reddit:      { label: "Reddit",            icon: "🟠", comp: () => <PlaceholderPage title="Reddit Notifications" desc="Get notified about new Reddit posts. Requires Premium." icon="🟠" /> },
  bluesky:     { label: "Bluesky",           icon: "🔵", comp: () => <PlaceholderPage title="Bluesky Notifications" desc="Get notified about new Bluesky posts. Requires Premium." icon="🔵" /> },
  steam:       { label: "Steam",             icon: "🎮", comp: () => <PlaceholderPage title="Steam Notifications" desc="Get notified about Steam updates. Requires Premium." icon="🎮" /> },
  rss:         { label: "RSS",               icon: "📡", comp: () => <PlaceholderPage title="RSS Notifications" desc="Follow any RSS feed and get notified. Requires Premium." icon="📡" /> },
  podcasts:    { label: "Podcasts",          icon: "🎙", comp: () => <PlaceholderPage title="Podcast Notifications" desc="Get notified about new podcast episodes. Requires Premium." icon="🎙" /> },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function SISControlPanel() {
  const [activePage, setActivePage] = useState("overview");
  const [serverData, setServerData] = useState(DEFAULT_SERVER_DATA);
  const page = PAGES[activePage] || PAGES.overview;

  // Fetch live data from API on mount
  useEffect(() => {
    fetchServerData()
      .then(data => setServerData(data))
      .catch(err  => console.error("[SIS] Failed to fetch server data:", err));
  }, []);

  return (
    <ServerDataContext.Provider value={serverData}>
    <div style={{
      background: C.bg, color: C.white, height: "100vh",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: "flex", overflow: "hidden", fontSize: 14,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2A2B35; border-radius: 2px; }
        input, select, textarea { color-scheme: dark; }
        input::placeholder, textarea::placeholder { color: #4B5563; }
        button { font-family: 'Inter', sans-serif; }
        select option { background: #16181F; }
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: 240, background: C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        flexShrink: 0, overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{
          padding: "18px 16px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, overflow: "hidden",
            background: "linear-gradient(135deg, #1a1f3a, #2a3060)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, border: `1px solid ${C.border}`,
          }}>🐱</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.white }}>SIS Control Panel</span>
        </div>

        {/* Server info — Single-server mode */}
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, overflow: "hidden",
            background: C.cardHover, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🖼</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{SERVER_NAME}</div>
            <div style={{ fontSize: 11, color: C.gray3, marginTop: 1 }}>Control Panel</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column" }}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.sectionLabel,
                letterSpacing: "1px", textTransform: "uppercase",
                padding: "10px 10px 6px",
              }}>{group.section}</div>
              {group.items.map(item => {
                const isActive = activePage === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setActivePage(item.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      background: isActive ? C.activeItemBg : "transparent",
                      borderLeft: isActive ? `2px solid ${C.white}` : "2px solid transparent",
                      marginBottom: 1, transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, width: 18, textAlign: "center", opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                      <span style={{
                        fontSize: 13, fontWeight: isActive ? 600 : 400,
                        color: isActive ? C.white : C.gray3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140,
                      }}>{item.label}</span>
                    </div>
                    {item.premium && (
                      <div style={{
                        background: C.premiumBg, border: `1px solid ${C.premiumBorder}`,
                        borderRadius: 5, padding: "1px 6px",
                        fontSize: 9, fontWeight: 700, color: C.premium,
                      }}>PREMIUM</div>
                    )}
                    {item.badge && (
                      <div style={{
                        background: "#0F2A1A", border: "1px solid #1A4A2A",
                        borderRadius: 5, padding: "1px 6px",
                        fontSize: 9, fontWeight: 700, color: "#4ADE80",
                      }}>{item.badge}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{
          height: 52, borderBottom: `1px solid ${C.border}`,
          padding: "0 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: C.bg, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.gray3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14 }}>🖥</span> {SERVER_NAME}
            </span>
            <span style={{ color: C.gray5 }}>/</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.gray1, fontWeight: 500 }}>
              <span>{page.icon}</span> {page.label}
            </span>
          </div>
          <select style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "6px 12px", color: C.gray1, fontSize: 12,
            fontFamily: "inherit", outline: "none", cursor: "pointer",
          }}>
            <option>🇺🇸 English</option>
            <option>🇸🇦 Arabic</option>
          </select>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {page.comp()}
        </div>
      </div>
    </div>
    </ServerDataContext.Provider>
  );
}