# ══════════════════════════════════════════
#   SERENITY RADIO — api/donate.py
#   Buy Me a Coffee webhook + donation stats
# ══════════════════════════════════════════

import os
from flask import request, jsonify
from backend.db import (
    get_donation_totals,
    add_donation,
    record_donate_click,
)

DONATION_GOAL = 10000   # USD


def get_donation_stats():
    """GET /api/donate/stats — returns totals for the frontend progress bar."""
    total, count = get_donation_totals()
    pct       = round((total / DONATION_GOAL) * 100) if total > 0 else 0
    remaining = max(0, DONATION_GOAL - total)

    return jsonify({
        'total':     int(total),
        'count':     count,
        'goal':      DONATION_GOAL,
        'pct':       pct,
        'remaining': int(remaining),
    })


def handle_bmc_webhook():
    """
    POST /api/donate/webhook
    Buy Me a Coffee calls this every time someone donates.

    To activate:
      BMC Dashboard → Support → Webhooks → Add webhook URL
      URL: https://yourdomain.com/api/donate/webhook
      Copy the token shown and paste it into your .env as BMC_WEBHOOK_TOKEN
    """
    # Verify the request is genuinely from BMC
    token    = request.headers.get('x-bmc-signature', '')
    expected = os.getenv('BMC_WEBHOOK_TOKEN', '')

    if expected and token != expected:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data received'}), 400

    event_type = data.get('type', '')

    if event_type == 'donation.created':
        supporter  = data.get('data', {})
        price      = float(supporter.get('support_coffee_price', 0))
        quantity   = int(supporter.get('support_coffees', 1))
        amount     = price * quantity
        name       = supporter.get('supporter_name', 'Anonymous')
        message    = supporter.get('support_note', '')
        bmc_id     = str(supporter.get('support_id', ''))

        add_donation(amount, name, message, bmc_id)
        print(f"[BMC] Donation received: ${amount:.2f} from {name}")

    return jsonify({'status': 'received'}), 200


def track_donate_click():
    """POST /api/donate/click — lightweight analytics for donate button clicks."""
    record_donate_click()
    return jsonify({'status': 'ok'}), 200
