# ══════════════════════════════════════════
#   SERENITY RADIO — api/subscribe.py
#   Email subscription via Brevo (free tier)
#   300 emails/day, unlimited contacts — free
# ══════════════════════════════════════════

import os
import re
import requests
from flask import request, jsonify
#from db import add_subscriber

from backend.db import (
    add_subscriber,
)

BREVO_API_URL = 'https://api.brevo.com/v3/contacts'

# Email validation
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def handle_subscribe():
    """POST /api/subscribe"""
    data   = request.get_json(silent=True) or {}
    email  = data.get('email', '').strip()
    name   = data.get('name', '').strip()
    reason = data.get('reason', '').strip()

    # Basic validation
    if not email or not EMAIL_RE.match(email):
        return jsonify({'status': 'error', 'message': 'Please enter a valid email address.'}), 400

    # Save to local SQLite database
    saved = add_subscriber(email, name, reason)

    # Also add to Brevo if API key is configured
    brevo_key = os.getenv('BREVO_API_KEY', '')
    if brevo_key:
        try:
            _add_to_brevo(email, name, brevo_key)
        except Exception as e:
            print(f'[Brevo] Warning: {e}')
            # Don't fail the whole request if Brevo is down

    if saved:
        return jsonify({
            'status':  'ok',
            'message': 'Subscribed successfully!',
        }), 200
    else:
        # Already subscribed — still return ok (don't reveal whether email exists)
        return jsonify({
            'status':  'ok',
            'message': 'You are already subscribed. Thank you!',
        }), 200


def _add_to_brevo(email, name, api_key):
    """
    Add contact to Brevo mailing list.
    Get your list ID from: Brevo Dashboard → Contacts → Lists
    Replace LIST_ID below with your actual list ID (it's a number like 2 or 5).
    """
    LIST_ID = int(os.getenv('BREVO_LIST_ID', 2))

    payload = {
        'email': email,
        'attributes': {
            'FIRSTNAME': name.split()[0] if name else '',
            'LASTNAME':  ' '.join(name.split()[1:]) if len(name.split()) > 1 else '',
        },
        'listIds': [LIST_ID],
        'updateEnabled': True,   # Update if contact already exists
    }

    response = requests.post(
        BREVO_API_URL,
        headers={
            'api-key':      api_key,
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=10,
    )

    if response.status_code not in (200, 201, 204):
        raise Exception(f'Brevo returned {response.status_code}: {response.text}')
