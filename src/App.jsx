/* eslint-disable no-undef, no-unused-vars */
import { useState, useEffect, useCallback, useRef } from "react";

// ─── COLOUR TOKENS ────────────────────────────────────────────────
const C = {
  bg: "#0a0c10",
  panel: "#10141c",
  border: "#1e2535",
  accent: "#e05c2a",       // copper-orange
  accentDim: "#7a2e10",
  green: "#22c55e",
  greenDim: "#14532d",
  red: "#ef4444",
  redDim: "#7f1d1d",
  yellow: "#fbbf24",
  text: "#e2e8f0",
  muted: "#64748b",
  teal: "#06b6d4",
};

// ─── MOCK DATA ENGINE ─────────────────────────────────────────────
// In production replace fetchCopperData() with real API calls:
//   • Yahoo Finance:  https://query1.finance.yahoo.com/v8/finance/chart/HG=F
//   • CFTC COT:       https://www.cftc.gov/dea/futures/deacmxlf.htm  (scrape)
//   • Investing.com open-interest endpoint (no-key free scrape)

function generateMockHistory() {
  const rows = [];
  const start = new Date("2026-03-10");
  let oi = 278219;
  let shorts = 53010;
  let price = 5.84;
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.offsetDays = i;
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const oiDelta = Math.round((Math.random() - 0.45) * 4200);
    const shortDelta = Math.round((Math.random() - 0.48) * 1800);
    const priceDelta = (Math.random() - 0.44) * 0.12;
    oi = Math.max(240000, oi + oiDelta);
    shorts = Math.max(38000, shorts + shortDelta);
    price = Math.max(5.2, Math.min(6.8, price + priceDelta));
    rows.push({
      date: d.toISOString().slice(0, 10),
      oi,
      shorts,
      longs: Math.round(oi * 0.365),
      price: +price.toFixed(4),
      oiChange: oiDelta,
      shortChange: shortDelta,
    });
  }
  return rows;
}

const HISTORY = generateMockHistory();
const ALERT_WINDOW_START = "2026-03-19";
const ALERT_WINDOW_END   = "2026-04-20";

// ─── HELPERS ──────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString() ?? "—";
const pct = (n) => (n >= 0 ? "+" : "") + n?.toFixed(2) + "%";
const inWindow = (d) => d >= ALERT_WINDOW_START && d <= ALERT_WINDOW_END;

function Badge({ children, color }) {
  const bg = { green: C.greenDim, red: C.redDim, yellow: "#451a03", teal: "#083344" }[color] || C.accentDim;
  const fg = { green: C.green, red: C.red, yellow: C.yellow, teal: C.teal }[color] || C.accent;
  return (
    <span style={{
      background: bg, color: fg, border: `1px solid ${fg}40`,
      borderRadius: 4, fontSize: 11, fontWeight: 700,
      padding: "2px 7px", letterSpacing: "0.05em", textTransform: "uppercase",
    }}>{children}</span>
  );
}

function KPI({ label, value, sub, color, flash }) {
  const fg = { green: C.green, red: C.red, yellow: C.yellow, accent: C.accent }[color] || C.text;
  return (
    <div style={{
      background: C.panel, border: `1px solid ${flash ? C.accent : C.border}`,
      borderRadius: 10, padding: "18px 22px", flex: 1, minWidth: 140,
      boxShadow: flash ? `0 0 18px ${C.accent}55` : "none",
      transition: "box-shadow 0.4s",
    }}>
      <div style={{ color: C.muted, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ color: fg, fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────
function Sparkline({ data, color = C.accent, height = 48, field = "oi" }) {
  if (!data.length) return null;
  const vals = data.map((d) => d[field]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 280, h = height;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={+pts.split(" ").at(-1).split(",")[0]} cy={+pts.split(" ").at(-1).split(",")[1]} r={3} fill={color} />
    </svg>
  );
}

// ─── ALERT ROW ────────────────────────────────────────────────────
function AlertRow({ row, threshold }) {
  const oiPct = (row.oiChange / (row.oi - row.oiChange)) * 100;
  const isCritical = Math.abs(oiPct) >= threshold.critical;
  const isWarn     = !isCritical && Math.abs(oiPct) >= threshold.warn;
  const triggered  = isCritical || isWarn;
  const inW        = inWindow(row.date);
  if (!triggered && !inW) return null;

  const borderCol = isCritical ? C.red : isWarn ? C.yellow : C.border;
  const bgCol     = isCritical ? `${C.red}14` : isWarn ? `${C.yellow}10` : C.panel;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "11px 14px", borderRadius: 8,
      background: bgCol, border: `1px solid ${borderCol}`,
      marginBottom: 6, transition: "all 0.2s",
      boxShadow: isCritical ? `0 0 12px ${C.red}44` : isWarn ? `0 0 8px ${C.yellow}33` : "none",
    }}>
      <span style={{ color: C.muted, fontSize: 12, fontFamily: "monospace", minWidth: 90 }}>{row.date}</span>

      {/* Window badge */}
      {inW ? <Badge color="teal">🎯 Window</Badge> : <Badge color="yellow">Watch</Badge>}

      {/* Severity badge */}
      {isCritical && <Badge color="red">🚨 CRITICAL >{threshold.critical}%</Badge>}
      {isWarn      && <Badge color="yellow">⚠️ WARNING >{threshold.warn}%</Badge>}

      {/* OI change */}
      {triggered && (
        <span style={{ color: oiPct > 0 ? C.green : C.red, fontWeight: 700, fontSize: 13 }}>
          {oiPct > 0 ? "▲" : "▼"} OI {pct(oiPct)}
        </span>
      )}

      <span style={{ color: C.text, fontSize: 13, fontFamily: "monospace" }}>OI: {fmt(row.oi)}</span>

      <span style={{ color: row.shortChange < 0 ? C.green : C.red, fontSize: 13, fontFamily: "monospace", marginLeft: "auto" }}>
        Shorts Δ: {row.shortChange > 0 ? "+" : ""}{fmt(row.shortChange)}
      </span>
      <span style={{ color: C.accent, fontSize: 13, fontFamily: "monospace" }}>${row.price.toFixed(3)}</span>
    </div>
  );
}

// ─── PYTHON SCRIPT MODAL ──────────────────────────────────────────
const PYTHON_SCRIPT = [
  "#!/usr/bin/env python3",
  '"""',
  "Copper Futures OI Alert System",
  "================================",
  "FREE APIs used:",
  "  1. Yahoo Finance (yfinance) - price + volume",
  "  2. CFTC public TXT endpoint - COT short/long data (weekly)",
  "  3. smtplib (stdlib)         - email alerts (optional)",
  "",
  "Schedule with:",
  "  - GitHub Actions (free): .github/workflows/copper_alert.yml",
  "  - cron (Linux/Mac): 30 15 * * 1-5  python copper_alert.py",
  "  - Windows Task Scheduler",
  "",
  "Install deps:  pip install yfinance requests pandas",
  '"""',
  "",
  "import yfinance as yf",
  "import requests, json, os, smtplib",
  "from datetime import datetime, date",
  "from email.mime.text import MIMEText",
  "",
  "# CONFIG",
  "THRESHOLD_WARN = 2.5   # yellow alert if OI changes > this %",
  "THRESHOLD_CRIT = 5.0   # critical alert if OI changes > this %",
  "ALERT_START    = date(2026, 3, 19)",
  "ALERT_END      = date(2026, 4, 20)",
  'STATE_FILE     = "copper_oi_state.json"',
  "",
  "# Email config (optional - leave blank to skip)",
  'EMAIL_FROM = os.getenv("EMAIL_FROM", "")',
  'EMAIL_TO   = os.getenv("EMAIL_TO", "")',
  'EMAIL_PWD  = os.getenv("EMAIL_PWD", "")',
  'SMTP_HOST  = "smtp.gmail.com"',
  "SMTP_PORT  = 587",
  "",
  "# FETCH COPPER PRICE",
  'def fetch_yf(ticker="HG=F"):',
  "    t = yf.Ticker(ticker)",
  '    hist = t.history(period="2d")',
  "    if hist.empty:",
  "        return None",
  "    row = hist.iloc[-1]",
  "    return {",
  '        "price": round(float(row["Close"]), 4),',
  '        "volume": int(row["Volume"]),',
  '        "date": str(hist.index[-1].date()),',
  "    }",
  "",
  "# FETCH CFTC COT DATA (free public endpoint)",
  'CFTC_URL = "https://www.cftc.gov/dea/futures/deacmxsf.htm"',
  "",
  "def fetch_cftc_oi():",
  "    try:",
  "        r = requests.get(CFTC_URL, timeout=15)",
  "        txt = r.text",
  '        idx = txt.find("COPPER- #1")',
  "        if idx == -1:",
  "            return None",
  "        block = txt[idx:idx+2000]",
  '        for line in block.split("\\n"):',
  '            if "OPEN INTEREST" in line:',
  '                oi = int("".join(filter(str.isdigit, line.split(":")[-1].strip().split()[0])))',
  "                return oi",
  "    except Exception as e:",
  '        print("CFTC fetch error:", e)',
  "    return None",
  "",
  "# STATE MANAGEMENT",
  "def load_state():",
  "    if os.path.exists(STATE_FILE):",
  "        with open(STATE_FILE) as f:",
  "            return json.load(f)",
  '    return {"last_oi": None, "last_price": None, "alerts": []}',
  "",
  "def save_state(state):",
  '    with open(STATE_FILE, "w") as f:',
  "        json.dump(state, f, indent=2)",
  "",
  "# EMAIL ALERT",
  "def send_email(subject, body):",
  "    if not all([EMAIL_FROM, EMAIL_TO, EMAIL_PWD]):",
  '        print("Email not configured - printing alert:")',
  '        print("  SUBJECT:", subject)',
  '        print("  BODY:", body)',
  "        return",
  "    msg = MIMEText(body)",
  '    msg["Subject"] = subject',
  '    msg["From"]    = EMAIL_FROM',
  '    msg["To"]      = EMAIL_TO',
  "    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:",
  "        s.starttls()",
  "        s.login(EMAIL_FROM, EMAIL_PWD)",
  "        s.send_message(msg)",
  '    print("Email sent:", subject)',
  "",
  "# MAIN ALERT LOGIC",
  "def run():",
  "    today     = date.today()",
  "    in_window = ALERT_START <= today <= ALERT_END",
  "    state     = load_state()",
  '    yf_data   = fetch_yf("HG=F")',
  "    cftc_oi   = fetch_cftc_oi()",
  "    cp        = yf_data['price'] if yf_data else None",
  "    cur_oi    = cftc_oi",
  '    print("Copper Check:", today, "| Price:", cp, "| OI:", cur_oi)',
  '    print("In alert window:", in_window)',
  "    alerts = []",
  "    if cur_oi and state['last_oi']:",
  "        pct = ((cur_oi - state['last_oi']) / state['last_oi']) * 100",
  "        is_crit = abs(pct) >= THRESHOLD_CRIT",
  "        is_warn = not is_crit and abs(pct) >= THRESHOLD_WARN",
  "        if is_crit or is_warn:",
  '            tier = "CRITICAL" if is_crit else "WARNING"',
  '            direction = "SURGE" if pct > 0 else "DROP"',
  '            msg = tier + " — Copper OI " + direction + " " + str(round(pct,2)) + "%"',
  "            alerts.append(msg)",
  '            send_email("[COPPER " + tier + "] OI " + direction, msg)',
  "    if cp and state['last_price']:",
  "        for lvl in [5.00, 5.50, 6.00, 6.50]:",
  "            prev = state['last_price']",
  "            if prev < lvl <= cp or prev > lvl >= cp:",
  '                msg = "Copper crossed " + str(lvl) + " | Price: " + str(cp)',
  "                alerts.append(msg)",
  '                send_email("[COPPER] Price crossed " + str(lvl), msg)',
  "    if cur_oi: state['last_oi'] = cur_oi",
  "    if cp: state['last_price'] = cp",
  "    state['alerts'].extend(alerts)",
  "    save_state(state)",
  '    if not alerts: print("No threshold breaches today.")',
  "",
  'if __name__ == "__main__":',
  "    run()",
].join("\n");

// ─── GITHUB ACTIONS YAML ──────────────────────────────────────────
const GH_YAML = String.raw`# .github/workflows/copper_alert.yml
# FREE daily automated run via GitHub Actions
# Runs every weekday at 4:00 PM UTC (after US market close)

name: Copper OI Alert

on:
  schedule:
    - cron: '0 16 * * 1-5'   # Mon-Fri 4PM UTC
  workflow_dispatch:           # manual trigger button

jobs:
  alert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install yfinance requests pandas

      - name: Run copper alert
        env:
          EMAIL_FROM: \${{ secrets.EMAIL_FROM }}
          EMAIL_TO:   \${{ secrets.EMAIL_TO }}
          EMAIL_PWD:  \${{ secrets.EMAIL_PWD }}
        run: python copper_alert.py

      - name: Commit state file
        run: |
          git config user.name  "copper-bot"
          git config user.email "bot@copper"
          git add copper_oi_state.json || true
          git diff --staged --quiet || git commit -m "chore: update OI state \$(date -u +%Y-%m-%d)"
          git push
`;

// ─── MAIN COMPONENT ───────────────────────────────────────────────
export default function CopperDashboard() {
  const [threshold] = useState({ warn: 2.5, critical: 5.0 });
  const [tab, setTab] = useState("dashboard");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString());
  const [flashKpi, setFlashKpi] = useState(false);
  const audioRef = useRef(null);

  const latest = HISTORY[HISTORY.length - 1];
  const prev   = HISTORY[HISTORY.length - 2];
  const windowRows = HISTORY.filter((r) => inWindow(r.date));
  const oiChgPct = prev ? ((latest.oi - prev.oi) / prev.oi) * 100 : 0;
  const shortChgPct = prev ? ((latest.shorts - prev.shorts) / prev.shorts) * 100 : 0;

  const enableNotifications = useCallback(async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      setNotifEnabled(perm === "granted");
      if (perm === "granted") {
        new Notification("🔴 Copper OI Alerts Active", {
          body: "You'll be notified when OI changes exceed your threshold.",
        });
      }
    }
  }, []);

  const playPing = (critical = false) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (critical) {
        // Two-tone urgent beep for critical
        [0, 0.25].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 1100;
          gain.gain.setValueAtTime(0, ctx.currentTime + delay);
          gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.22);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.22);
        });
      } else {
        // Single mellow ping for warning
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 740;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      }
    } catch {}
  };

  const simulateAlert = (critical = false) => {
    playPing(critical);
    setFlashKpi(true);
    setTimeout(() => setFlashKpi(false), 2000);
    const label = critical ? "🚨 CRITICAL >5%" : "⚠️ WARNING >2.5%";
    const color = critical ? C.red : C.yellow;
    if (notifEnabled) {
      new Notification(`${label} COPPER OI ALERT`, {
        body: `OI changed ${pct(oiChgPct)} | Price: $${latest.price} | Shorts: ${fmt(latest.shorts)}`,
      });
    }
  };

  const refresh = () => {
    setLastRefresh(new Date().toLocaleTimeString());
    playPing();
  };

  const tabs = [
    { id: "dashboard", label: "📊 Dashboard" },
    { id: "alerts",    label: "🔔 Alert Log" },
    { id: "python",    label: "🐍 Python Script" },
    { id: "github",    label: "⚙️ GitHub Actions" },
  ];

  const tabStyle = (id) => ({
    padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: tab === id ? C.accent : "transparent",
    color: tab === id ? "#fff" : C.muted,
    border: "none", transition: "all 0.2s",
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: C.text, padding: "24px 20px" }}>

      {/* HEADER */}
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `radial-gradient(circle, ${C.accent}, ${C.accentDim})`, boxShadow: `0 0 18px ${C.accent}88` }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: C.text }}>
              COPPER OI ALERT SYSTEM
            </h1>
            <div style={{ color: C.muted, fontSize: 11, letterSpacing: "0.1em" }}>
              COMEX HG FUTURES • MAR 19 – APR 20, 2026 • FREE API MONITOR
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <Badge color={inWindow(latest?.date) ? "teal" : "yellow"}>
              {inWindow(latest?.date) ? "🎯 WINDOW ACTIVE" : "⏳ WINDOW PENDING"}
            </Badge>
            <button onClick={refresh} style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>
              ↻ Refresh
            </button>
          </div>
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 20 }}>Last updated: {lastRefresh} &nbsp;|&nbsp; Data: Yahoo Finance (free) + CFTC COT (free)</div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 4, marginBottom: 22, background: C.panel, padding: 4, borderRadius: 8, width: "fit-content" }}>
          {tabs.map((t) => <button key={t.id} style={tabStyle(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <>
            {/* KPI ROW */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <KPI label="Copper Price" value={`$${latest.price}`} sub="COMEX HG front month" color="accent" flash={flashKpi} />
              <KPI label="Total Open Interest" value={fmt(latest.oi)} sub={`${pct(oiChgPct)} vs yesterday`} color={oiChgPct > 0 ? "green" : "red"} flash={flashKpi} />
              <KPI label="Short Contracts" value={fmt(latest.shorts)} sub={`${pct(shortChgPct)} vs yesterday`} color={shortChgPct < 0 ? "green" : "red"} flash={flashKpi} />
              <KPI label="Long Contracts" value={fmt(latest.longs)} sub="Managed money net long" color="teal" />
            </div>

            {/* CHARTS ROW */}
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "Open Interest Trend", field: "oi", color: C.accent },
                { label: "Short Position Trend", field: "shorts", color: C.red },
                { label: "Price ($/lb)", field: "price", color: C.teal },
              ].map(({ label, field, color }) => (
                <div key={field} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 260 }}>
                  <div style={{ color: C.muted, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
                  <Sparkline data={HISTORY} field={field} color={color} height={56} />
                  <div style={{ color, fontSize: 20, fontWeight: 800, marginTop: 8 }}>
                    {field === "price" ? `$${latest[field].toFixed(3)}` : fmt(latest[field])}
                  </div>
                </div>
              ))}
            </div>

            {/* ALERT CONTROLS */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 22px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, color: C.text }}>🔔 Dual-Threshold Alert System</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>

                {/* Warning tier */}
                <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}50`, borderRadius: 8, padding: "10px 16px", minWidth: 180 }}>
                  <div style={{ color: C.yellow, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 4 }}>⚠️ WARNING TIER</div>
                  <div style={{ color: C.text, fontSize: 22, fontWeight: 900, fontFamily: "monospace" }}>&gt;2.5% OI Δ</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Single audio ping • Yellow badge</div>
                </div>

                <div style={{ color: C.muted, fontSize: 20, fontWeight: 300 }}>→</div>

                {/* Critical tier */}
                <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}50`, borderRadius: 8, padding: "10px 16px", minWidth: 180 }}>
                  <div style={{ color: C.red, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 4 }}>🚨 CRITICAL TIER</div>
                  <div style={{ color: C.text, fontSize: 22, fontWeight: 900, fontFamily: "monospace" }}>&gt;5.0% OI Δ</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Double beep • Red badge • Email</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: "auto" }}>
                  <button onClick={enableNotifications} style={{
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: notifEnabled ? C.greenDim : C.panel,
                    color: notifEnabled ? C.green : C.muted,
                    border: `1px solid ${notifEnabled ? C.green : C.border}`,
                  }}>
                    {notifEnabled ? "✅ Browser Notifs ON" : "Enable Browser Notifications"}
                  </button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => simulateAlert(false)} style={{
                      flex: 1, padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                      background: `${C.yellow}20`, color: C.yellow, border: `1px solid ${C.yellow}60`,
                    }}>⚠️ Test Warning</button>
                    <button onClick={() => simulateAlert(true)} style={{
                      flex: 1, padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                      background: `${C.red}20`, color: C.red, border: `1px solid ${C.red}60`,
                    }}>🚨 Test Critical</button>
                  </div>
                </div>
              </div>
            </div>

            {/* WINDOW STATS */}
            {windowRows.length > 0 && (
              <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}40`, borderRadius: 10, padding: "16px 20px" }}>
                <div style={{ fontWeight: 700, color: C.teal, marginBottom: 10 }}>🎯 Alert Window Summary (Mar 19 – Apr 20)</div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div><span style={{ color: C.muted, fontSize: 12 }}>Days tracked: </span><span style={{ color: C.text, fontWeight: 700 }}>{windowRows.length}</span></div>
                  <div><span style={{ color: C.muted, fontSize: 12 }}>Avg OI: </span><span style={{ color: C.text, fontWeight: 700 }}>{fmt(Math.round(windowRows.reduce((a, r) => a + r.oi, 0) / windowRows.length))}</span></div>
                  <div><span style={{ color: C.muted, fontSize: 12 }}>Short trend: </span><span style={{ color: windowRows.at(-1)?.shorts < windowRows[0]?.shorts ? C.green : C.red, fontWeight: 700 }}>{windowRows.at(-1)?.shorts < windowRows[0]?.shorts ? "▼ Covering (Bullish)" : "▲ Adding (Bearish)"}</span></div>
                  <div><span style={{ color: C.muted, fontSize: 12 }}>Price Δ: </span><span style={{ color: C.accent, fontWeight: 700 }}>{windowRows.length > 1 ? pct(((windowRows.at(-1).price - windowRows[0].price) / windowRows[0].price) * 100) : "—"}</span></div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── ALERT LOG TAB ── */}
        {tab === "alerts" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: C.muted, fontSize: 12 }}>Showing days with OI threshold breach OR inside Mar 19–Apr 20 window</div>
              <Badge color="yellow">⚠️ Warning: &gt;2.5% OI Δ</Badge>
              <Badge color="red">🚨 Critical: &gt;5.0% OI Δ</Badge>
            </div>
            {HISTORY.map((row) => <AlertRow key={row.date} row={row} threshold={threshold} />)}
            {HISTORY.filter(r => Math.abs((r.oiChange / (r.oi - r.oiChange)) * 100) >= threshold.warn || inWindow(r.date)).length === 0 && (
              <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>No alerts triggered yet.</div>
            )}
          </div>
        )}

        {/* ── PYTHON SCRIPT TAB ── */}
        {tab === "python" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
              <Badge color="green">FREE</Badge>
              <Badge color="teal">No API Key Needed</Badge>
              <Badge color="yellow">pip install yfinance requests</Badge>
            </div>
            <div style={{ background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px", overflowX: "auto" }}>
              <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{PYTHON_SCRIPT}</pre>
            </div>
            <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Quick Setup</div>
              {[
                "pip install yfinance requests pandas",
                "python copper_alert.py   # test run",
                "Add EMAIL_FROM / EMAIL_TO / EMAIL_PWD as env vars for email alerts",
                "Schedule via cron or GitHub Actions (see next tab)",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: C.accent, fontWeight: 700 }}>{i + 1}.</span>
                  <code style={{ color: C.text }}>{s}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GITHUB ACTIONS TAB ── */}
        {tab === "github" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
              <Badge color="green">100% FREE</Badge>
              <Badge color="teal">Runs Mon–Fri Automatically</Badge>
              <Badge color="yellow">No Server Needed</Badge>
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>⚙️ GitHub Actions Setup (5 mins)</div>
              {[
                { step: "1", text: "Create a free GitHub account → New repository (private)" },
                { step: "2", text: "Upload copper_alert.py to the repo root" },
                { step: "3", text: "Create .github/workflows/copper_alert.yml (paste code below)" },
                { step: "4", text: "Go to Settings → Secrets → add EMAIL_FROM, EMAIL_TO, EMAIL_PWD" },
                { step: "5", text: "GitHub runs it free every weekday at 4PM UTC automatically!" },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ background: C.accent, color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{step}</span>
                  <span style={{ color: C.text }}>{text}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px", overflowX: "auto" }}>
              <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{GH_YAML}</pre>
            </div>
            <div style={{ marginTop: 14, background: `${C.green}15`, border: `1px solid ${C.green}40`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.green }}>
              ✅ GitHub Actions gives you 2,000 free minutes/month. This job runs ~2 min/day × 23 days = ~46 minutes total for the alert window. Completely within free tier.
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}>
          <span>📡 Live data sources: Yahoo Finance (HG=F) • CFTC COT Report (Fridays)</span>
          <span style={{ color: C.redDim }}>⚠️ Not financial advice</span>
        </div>
      </div>
    </div>
  );
}