# ══════════════════════════════════════════
#   SERENITY RADIO — monitor.py
#   Bandwidth + listener tracking
#   Alerts via Telegram when thresholds hit
# ══════════════════════════════════════════

import os, time, threading, requests
from collections import defaultdict

# ── Config ──
TELEGRAM_TOKEN   = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

# Thresholds
WARN_LISTENERS   = int(os.getenv('WARN_LISTENERS',  '30'))   # concurrent listeners
WARN_GB_DAY      = float(os.getenv('WARN_GB_DAY',   '20'))   # estimated GB/day
CRIT_LISTENERS   = int(os.getenv('CRIT_LISTENERS',  '60'))
CRIT_GB_DAY      = float(os.getenv('CRIT_GB_DAY',   '50'))

# Heartbeat tracking: session_id → last_seen timestamp
_listeners: dict[str, float] = {}
_lock = threading.Lock()

# Rolling byte counter: {hour_bucket: bytes_served}
_bytes_by_hour: dict[int, int] = defaultdict(int)
_last_alert_at  = 0.0
ALERT_COOLDOWN  = 3600  # don't spam — max 1 alert/hour


def heartbeat(session_id: str):
    """Called every 30s by the frontend to register an active listener."""
    with _lock:
        _listeners[session_id] = time.time()
        _prune()


def record_bytes(n: int):
    """Called by serve_music route to track bytes sent."""
    bucket = int(time.time() // 3600)
    with _lock:
        _bytes_by_hour[bucket] += n
        # Keep only last 24 buckets
        old = [k for k in _bytes_by_hour if k < bucket - 24]
        for k in old:
            del _bytes_by_hour[k]


def _prune():
    """Remove listeners silent for >90s."""
    cutoff = time.time() - 90
    stale  = [sid for sid, ts in _listeners.items() if ts < cutoff]
    for sid in stale:
        del _listeners[sid]


def get_stats() -> dict:
    with _lock:
        _prune()
        active = len(_listeners)
        bucket = int(time.time() // 3600)
        bytes_24h = sum(v for k, v in _bytes_by_hour.items() if k >= bucket - 24)
        gb_24h    = round(bytes_24h / 1024**3, 3)
        # Project to full day based on last 1h
        gb_1h     = _bytes_by_hour.get(bucket, 0) / 1024**3
        gb_day_est = round(gb_1h * 24, 2)
        return {
            'active_listeners': active,
            'gb_last_24h':      gb_24h,
            'gb_day_estimate':  gb_day_est,
            'warn_listeners':   WARN_LISTENERS,
            'crit_listeners':   CRIT_LISTENERS,
            'warn_gb_day':      WARN_GB_DAY,
            'crit_gb_day':      CRIT_GB_DAY,
            'status': _severity(active, gb_day_est),
        }


def _severity(listeners: int, gb_day: float) -> str:
    if listeners >= CRIT_LISTENERS or gb_day >= CRIT_GB_DAY:
        return 'critical'
    if listeners >= WARN_LISTENERS or gb_day >= WARN_GB_DAY:
        return 'warning'
    return 'ok'


def _send_telegram(msg: str):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'},
            timeout=5,
        )
    except Exception as e:
        print(f'[Monitor] Telegram error: {e}')


def check_and_alert():
    """Run in background thread every 5 min."""
    global _last_alert_at
    while True:
        time.sleep(300)
        stats = get_stats()
        sev   = stats['status']
        now   = time.time()

        if sev == 'ok' or (now - _last_alert_at) < ALERT_COOLDOWN:
            continue

        _last_alert_at = now
        listeners = stats['active_listeners']
        gb_est    = stats['gb_day_estimate']

        if sev == 'critical':
            msg = (
                f"🚨 *Serenity Radio — CRITICAL*\n"
                f"👥 {listeners} concurrent listeners (limit: {CRIT_LISTENERS})\n"
                f"📦 ~{gb_est} GB/day bandwidth estimate\n\n"
                f"⚡ *Action required:* Migrate music to Cloudflare R2\n"
                f"Run: `cd /root/serenityradio && python3 scripts/migrate_r2.py`"
            )
        else:
            msg = (
                f"⚠️ *Serenity Radio — Warning*\n"
                f"👥 {listeners} concurrent listeners\n"
                f"📦 ~{gb_est} GB/day bandwidth estimate\n\n"
                f"Consider migrating music to Cloudflare R2 soon."
            )

        _send_telegram(msg)
        print(f'[Monitor] Alert sent: {sev} — {listeners} listeners, {gb_est} GB/day est.')


# Start background thread on import
threading.Thread(target=check_and_alert, daemon=True).start()


# ── Flask route handlers (imported by server.py) ──
from flask import request, jsonify

def handle_heartbeat():
    data = request.get_json() or {}
    heartbeat(data.get('session_id', request.remote_addr))
    return jsonify({'ok': True})

def handle_stats():
    return jsonify(get_stats())
