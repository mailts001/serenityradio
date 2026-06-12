#!/bin/bash
set -e
APP="/root/serenityradio"
VENV="$APP/venv"
echo "▶ Fixing permissions..."
chmod o+x /root
find "$APP/frontend" -type d -exec chmod 755 {} \;
find "$APP/frontend" -type f -exec chmod 644 {} \;
echo "▶ Creating channel folders..."
for ch in sleep focus yoga nature; do mkdir -p "$APP/frontend/assets/music/$ch" && chmod 755 "$APP/frontend/assets/music/$ch"; done
echo "▶ Installing deps..."
"$VENV/bin/pip" install groq anthropic --quiet
echo "▶ Setting env defaults..."
grep -q 'ADMIN_PASSWORD' "$APP/.env" || echo 'ADMIN_PASSWORD=serenity2024' >> "$APP/.env"
grep -q 'AI_PROVIDER'    "$APP/.env" || echo 'AI_PROVIDER=mock'            >> "$APP/.env"
echo "▶ Restarting..."
systemctl restart serenityradio && sleep 2
systemctl is-active serenityradio && echo "✅ Done!" || journalctl -u serenityradio -n 20
echo ""
echo "🎵  http://5.223.72.120"
echo "🔧  http://5.223.72.120/admin  (pw: serenity2024)"
echo "📊  http://5.223.72.120/api/monitor"
