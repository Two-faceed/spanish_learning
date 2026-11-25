#!/bin/zsh
cd "$(dirname "$0")"

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "===================================================="
echo "  Español Fast — Starting local server..."
echo "  Laptop URL:  http://localhost:3000"
echo "  Phone URL:   http://${LAN_IP}:3000"
echo "===================================================="

(sleep 2 && open "http://localhost:3000") &
npm run dev -- --hostname 0.0.0.0 --port 3000
