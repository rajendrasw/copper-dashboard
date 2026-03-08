#!/usr/bin/env python3
"""
Copper Futures OI Alert System
================================
FREE APIs used:
  1. Yahoo Finance (yfinance) - price + volume
  2. CFTC public TXT endpoint - COT short/long data (weekly)
  3. smtplib (stdlib)         - email + SMS alerts

Install deps:  pip install yfinance requests pandas

Schedule with:
  - GitHub Actions (free): .github/workflows/copper_alert.yml
  - cron (Linux/Mac): 30 15 * * 1-5  python copper_alert.py
  - Windows Task Scheduler
"""

import yfinance as yf
import requests, json, os, smtplib
from datetime import date
from email.mime.text import MIMEText

# ── CONFIG ────────────────────────────────────────────────────────
THRESHOLD_WARN = 2.5        # yellow alert if OI changes > this %
THRESHOLD_CRIT = 5.0        # critical alert if OI changes > this %
ALERT_START    = date(2026, 3, 19)
ALERT_END      = date(2026, 4, 20)
STATE_FILE     = "copper_oi_state.json"

# ── EMAIL + SMS CONFIG ────────────────────────────────────────────
# Set these as environment variables OR paste directly here
EMAIL_FROM = os.getenv("EMAIL_FROM", "")       # your Gmail address
EMAIL_PWD  = os.getenv("EMAIL_PWD",  "")       # your Gmail App Password
EMAIL_TO   = os.getenv("EMAIL_TO",   "")       # your Gmail address

# TPG Australia (Optus network) - replace with your mobile number
SMS_TO     = "0420427749@optusmessaging.com"   # e.g. 0412345678@optusmessaging.com

SMTP_HOST  = "smtp.gmail.com"
SMTP_PORT  = 587

# ── FETCH COPPER PRICE (Yahoo Finance - FREE) ─────────────────────
def fetch_price(ticker="HG=F"):
    try:
        t    = yf.Ticker(ticker)
        hist = t.history(period="2d")
        if hist.empty:
            print("  Warning: No price data returned from Yahoo Finance")
            return None
        row = hist.iloc[-1]
        return {
            "price":  round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
            "date":   str(hist.index[-1].date()),
        }
    except Exception as e:
        print("  Price fetch error:", e)
        return None

# ── FETCH OPEN INTEREST (CFTC - FREE) ────────────────────────────
CFTC_URL = "https://www.cftc.gov/dea/futures/deacmxsf.htm"

def fetch_oi():
    """
    Scrapes CFTC weekly COT report for copper open interest.
    CFTC updates this every Friday at 3:30 PM EST.
    Returns None on weekdays when no new data is available.
    """
    try:
        r   = requests.get(CFTC_URL, timeout=15)
        txt = r.text
        idx = txt.find("COPPER- #1")
        if idx == -1:
            print("  Warning: Copper section not found in CFTC report")
            return None
        block = txt[idx:idx+2000]
        for line in block.split("\n"):
            if "OPEN INTEREST" in line:
                oi = int("".join(filter(str.isdigit,
                         line.split(":")[-1].strip().split()[0])))
                return oi
    except Exception as e:
        print("  CFTC fetch error:", e)
    return None

# ── STATE MANAGEMENT ─────────────────────────────────────────────
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_oi": None, "last_price": None, "alerts": []}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

# ── SEND EMAIL + SMS ─────────────────────────────────────────────
def send_alert(subject, body):
    if not all([EMAIL_FROM, EMAIL_PWD]):
        print("  *** Email not configured - alert would have sent: ***")
        print("  SUBJECT:", subject)
        print("  BODY:", body)
        return

    try:
        # Send EMAIL
        msg            = MIMEText(body)
        msg["Subject"] = subject
        msg["From"]    = EMAIL_FROM
        msg["To"]      = EMAIL_TO
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(EMAIL_FROM, EMAIL_PWD)
            s.send_message(msg)
        print("  Email sent to:", EMAIL_TO)

        # Send SMS via email-to-SMS gateway
        # Keeps message short (SMS limit = 160 chars)
        sms_body       = subject + " | " + body[:100]
        sms            = MIMEText(sms_body)
        sms["Subject"] = ""
        sms["From"]    = EMAIL_FROM
        sms["To"]      = SMS_TO
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(EMAIL_FROM, EMAIL_PWD)
            s.send_message(sms)
        print("  SMS sent to:", SMS_TO)

    except Exception as e:
        print("  Alert send error:", e)

# ── MAIN LOGIC ───────────────────────────────────────────────────
def run():
    today     = date.today()
    in_window = ALERT_START <= today <= ALERT_END

    print("\n" + "="*50)
    print("COPPER OI ALERT CHECK —", today)
    print("Alert window active:", in_window)
    print("="*50)

    state  = load_state()
    price_data = fetch_price("HG=F")
    oi         = fetch_oi()

    cp = price_data["price"] if price_data else None

    print("  Current Price :", "$" + str(cp) if cp else "N/A")
    print("  Current OI    :", "{:,}".format(oi) if oi else "N/A (CFTC updates Fridays)")
    print("  Previous OI   :", "{:,}".format(state["last_oi"]) if state["last_oi"] else "No previous data")

    alerts = []

    # ── OI CHANGE ALERT ──────────────────────────────────────────
    if oi and state["last_oi"]:
        pct_change = ((oi - state["last_oi"]) / state["last_oi"]) * 100
        print("  OI Change     : {:+.2f}%".format(pct_change))

        is_critical = abs(pct_change) >= THRESHOLD_CRIT
        is_warning  = not is_critical and abs(pct_change) >= THRESHOLD_WARN

        if is_critical:
            direction = "SURGE" if pct_change > 0 else "DROP"
            subject   = "[COPPER CRITICAL] OI " + direction + " {:+.2f}%".format(pct_change)
            body      = (
                "CRITICAL ALERT - Copper Open Interest " + direction + "\n"
                "Change   : {:+.2f}%\n".format(pct_change) +
                "New OI   : {:,}\n".format(oi) +
                "Prev OI  : {:,}\n".format(state["last_oi"]) +
                "Price    : $" + str(cp) + "\n"
                "Date     : " + str(today) + "\n"
                "In window: " + str(in_window)
            )
            print("  *** CRITICAL ALERT TRIGGERED ***")
            send_alert(subject, body)
            alerts.append(subject)

        elif is_warning:
            direction = "UP" if pct_change > 0 else "DOWN"
            subject   = "[COPPER WARNING] OI " + direction + " {:+.2f}%".format(pct_change)
            body      = (
                "WARNING - Copper Open Interest moved " + direction + "\n"
                "Change   : {:+.2f}%\n".format(pct_change) +
                "New OI   : {:,}\n".format(oi) +
                "Price    : $" + str(cp) + "\n"
                "Date     : " + str(today) + "\n"
                "In window: " + str(in_window)
            )
            print("  *** WARNING ALERT TRIGGERED ***")
            send_alert(subject, body)
            alerts.append(subject)

    # ── PRICE LEVEL ALERTS ───────────────────────────────────────
    if cp and state["last_price"]:
        prev = state["last_price"]
        for level in [5.00, 5.50, 6.00, 6.50, 7.00]:
            crossed_up   = prev < level <= cp
            crossed_down = prev > level >= cp
            if crossed_up or crossed_down:
                direction = "ABOVE" if crossed_up else "BELOW"
                subject   = "[COPPER PRICE] Crossed $" + str(level) + " " + direction
                body      = (
                    "Copper price crossed $" + str(level) + " " + direction + "\n"
                    "Current : $" + str(cp) + "\n"
                    "Previous: $" + str(prev) + "\n"
                    "Date    : " + str(today)
                )
                print("  *** PRICE ALERT: crossed $" + str(level) + " ***")
                send_alert(subject, body)
                alerts.append(subject)

    # ── UPDATE STATE ─────────────────────────────────────────────
    if oi:
        state["last_oi"] = oi
    if cp:
        state["last_price"] = cp
    state["alerts"].extend(alerts)
    save_state(state)

    if not alerts:
        print("  Status: No threshold breaches today.")

    print("="*50 + "\n")

if __name__ == "__main__":
    run()
