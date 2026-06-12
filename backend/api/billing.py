# ══════════════════════════════════════════
#   SERENITY RADIO — billing.py
#   Stripe subscriptions: Listener Pro $9/mo,
#   Teacher Pro $29/mo
# ══════════════════════════════════════════

import os, json
from flask import request, jsonify
from backend.db import get_connection
from backend.api.auth import get_current_user

STRIPE_SECRET_KEY   = os.getenv('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '')
APP_URL             = os.getenv('APP_URL', 'https://serenityradio.duckdns.org')

# Stripe Price IDs — create these in Stripe dashboard
PRICE_LISTENER_PRO  = os.getenv('STRIPE_PRICE_LISTENER', '')   # $9/mo
PRICE_TEACHER_PRO   = os.getenv('STRIPE_PRICE_TEACHER', '')     # $29/mo

PLANS = {
    'listener': {'price_id': PRICE_LISTENER_PRO, 'name': 'Listener Pro', 'amount': 9},
    'teacher':  {'price_id': PRICE_TEACHER_PRO,  'name': 'Teacher Pro',  'amount': 29},
}


def _stripe():
    if not STRIPE_SECRET_KEY:
        raise RuntimeError('STRIPE_SECRET_KEY not set')
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def handle_create_checkout():
    """POST /api/billing/checkout  {plan: 'listener'|'teacher'}"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401

    d    = request.get_json() or {}
    plan = d.get('plan', 'listener')
    if plan not in PLANS:
        return jsonify({'error': 'Invalid plan'}), 400
    if not STRIPE_SECRET_KEY:
        return jsonify({'error': 'Billing not configured yet',
                        'hint':  'Set STRIPE_SECRET_KEY in .env'}), 503

    stripe = _stripe()
    session = stripe.checkout.Session.create(
        mode='subscription',
        customer_email=user['email'],
        line_items=[{'price': PLANS[plan]['price_id'], 'quantity': 1}],
        success_url=f"{APP_URL}/?upgraded=1",
        cancel_url=f"{APP_URL}/?upgrade=cancelled",
        metadata={'user_id': str(user['id']), 'plan': plan},
    )
    return jsonify({'url': session.url})


def handle_portal():
    """POST /api/billing/portal — Stripe customer portal (cancel/upgrade)"""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Login required'}), 401
    if not STRIPE_SECRET_KEY:
        return jsonify({'error': 'Billing not configured'}), 503

    conn = get_connection()
    row  = conn.execute(
        'SELECT stripe_customer_id FROM users WHERE id=?', (user['id'],)
    ).fetchone()
    conn.close()
    if not row or not row['stripe_customer_id']:
        return jsonify({'error': 'No active subscription found'}), 404

    stripe  = _stripe()
    session = stripe.billing_portal.Session.create(
        customer=row['stripe_customer_id'],
        return_url=APP_URL,
    )
    return jsonify({'url': session.url})


def handle_webhook():
    """POST /api/billing/webhook — Stripe sends events here"""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')
    if not STRIPE_SECRET_KEY:
        return jsonify({'ok': True})  # silently ignore if not configured

    stripe = _stripe()
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

    if event['type'] == 'checkout.session.completed':
        s = event['data']['object']
        user_id   = int(s['metadata'].get('user_id', 0))
        plan      = s['metadata'].get('plan', 'listener')
        cust_id   = s.get('customer', '')
        db_plan   = 'pro_teacher' if plan == 'teacher' else 'pro'
        conn = get_connection()
        # Add stripe_customer_id column if first webhook
        try:
            conn.execute('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT ""')
            conn.commit()
        except Exception:
            pass
        conn.execute(
            'UPDATE users SET plan=?, stripe_customer_id=? WHERE id=?',
            (db_plan, cust_id, user_id)
        )
        conn.commit()
        conn.close()
        print(f"[Billing] User {user_id} upgraded to {db_plan}")

    elif event['type'] == 'customer.subscription.deleted':
        cust_id = event['data']['object'].get('customer', '')
        conn = get_connection()
        try:
            conn.execute(
                'UPDATE users SET plan="free" WHERE stripe_customer_id=?', (cust_id,)
            )
            conn.commit()
        except Exception:
            pass
        conn.close()

    return jsonify({'ok': True})


def handle_plans():
    """GET /api/billing/plans — public, no auth"""
    return jsonify({
        'plans': [
            {'id': 'listener', 'name': 'Listener Pro', 'price': 9,
             'features': ['No ads', 'Offline playlist', 'Score history 1 year',
                          'AI companion unlimited', 'Early access channels']},
            {'id': 'teacher',  'name': 'Teacher Pro',  'price': 29,
             'features': ['Everything in Listener Pro', 'Teacher profile page',
                          'Upload custom playlists', 'Follower analytics',
                          'Embeddable player widget', 'Priority in directory']},
        ]
    })
