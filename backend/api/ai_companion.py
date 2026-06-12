# ══════════════════════════════════════════
#   SERENITY RADIO — ai_companion.py
#   Free-first AI: Groq (Llama) → Haiku → Sonnet
#   Provider switching via AI_PROVIDER env var
# ══════════════════════════════════════════

import os
from flask import request, jsonify

AI_PROVIDER = os.getenv('AI_PROVIDER', 'groq')   # groq | anthropic | openrouter | mock

# ── Provider adapters ──

def _call_groq(prompt: str) -> str:
    """Free tier: 6000 req/day, Llama 3.1 8B — good enough for wellness."""
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv('GROQ_API_KEY', ''))
        resp   = client.chat.completions.create(
            model    = 'llama-3.1-8b-instant',
            messages = [{'role': 'user', 'content': prompt}],
            max_tokens = 200,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return _mock_response(prompt)


def _call_anthropic(prompt: str, tier: str = 'haiku') -> str:
    """Paid: Haiku ~$0.0001/call, Sonnet for richer responses."""
    models = {
        'haiku':  'claude-haiku-4-5',
        'sonnet': 'claude-sonnet-4-5',
    }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY', ''))
        msg    = client.messages.create(
            model      = models.get(tier, models['haiku']),
            max_tokens = 200,
            messages   = [{'role': 'user', 'content': prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        return _mock_response(prompt)


def _mock_response(prompt: str) -> str:
    """Fallback when no API key set — rule-based responses."""
    p = prompt.lower()
    if 'breath' in p:
        return "Try box breathing: inhale 4 counts, hold 4, exhale 4, hold 4. Repeat 4 times."
    if 'sleep' in p or 'tired' in p:
        return "Your body needs rest. Put on the Sleep channel, dim your screen, and let go of today."
    if 'anxious' in p or 'anxiety' in p:
        return "Ground yourself: name 5 things you can see, 4 you can touch, 3 you can hear. You are safe."
    if 'stress' in p:
        return "Stress is a signal, not a verdict. Take one slow breath, then one small step."
    return "You showed up today. That matters. Let the music carry you for a while."


def _build_prompt(score_data: dict, user_message: str = '') -> str:
    stress  = score_data.get('stress', 5)
    sleep   = score_data.get('sleep', 5)
    energy  = score_data.get('energy', 5)
    anxiety = score_data.get('anxiety', 5)
    mood    = score_data.get('mood', 5)
    score   = score_data.get('score', 50)

    context = (
        f"You are a calm, warm wellness companion for Serenity Radio. "
        f"The user's current Serenity Score is {score}/100. "
        f"Their readings: stress={stress}/10, sleep={sleep}/10, "
        f"energy={energy}/10, anxiety={anxiety}/10, mood={mood}/10. "
        f"Give a brief (2-3 sentence), warm, practical response. No lists. No clinical language. "
        f"End with one specific micro-action they can do right now."
    )
    if user_message:
        context += f"\n\nUser says: \"{user_message}\""
    else:
        context += "\n\nGive them a personalised daily greeting based on their scores."

    return context


def handle_companion():
    """POST /api/companion — returns AI wellness message."""
    data        = request.get_json() or {}
    score_data  = data.get('scores', {})
    user_msg    = data.get('message', '').strip()[:200]  # cap input length
    provider    = data.get('provider', AI_PROVIDER)      # allow per-request override

    prompt = _build_prompt(score_data, user_msg)

    if provider == 'anthropic':
        tier     = data.get('tier', 'haiku')
        response = _call_anthropic(prompt, tier)
    elif provider == 'groq':
        response = _call_groq(prompt)
    else:
        response = _mock_response(prompt)

    return jsonify({
        'message':  response,
        'provider': provider,
        'score':    score_data.get('score', 50),
    })


def handle_provider_status():
    """GET /api/companion/status — which AI providers are configured."""
    return jsonify({
        'active_provider': AI_PROVIDER,
        'providers': {
            'groq':      {'configured': bool(os.getenv('GROQ_API_KEY')),      'cost': 'free',         'model': 'llama-3.1-8b-instant'},
            'anthropic': {'configured': bool(os.getenv('ANTHROPIC_API_KEY')), 'cost': '$0.0001/call', 'model': 'claude-haiku-4-5'},
            'mock':      {'configured': True,                                  'cost': 'free',         'model': 'rule-based'},
        }
    })
