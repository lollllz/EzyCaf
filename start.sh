#!/usr/bin/env bash
# Kamil Hub one-click start — workspaces: server/ + client/
set -euo pipefail
cd "$(dirname "$0")"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js is not installed or is not on PATH. Install Node.js 22+ and retry."
command -v npm >/dev/null 2>&1 || fail "npm is not installed or is not on PATH. Install Node.js 22+ and retry."

NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null)" || fail "Unable to read the Node.js version."
IFS=. read -r NODE_MAJOR _ <<EOF2
$NODE_VERSION
EOF2
[[ "${NODE_MAJOR:-0}" =~ ^[0-9]+$ ]] || fail "Could not parse Node.js version: $NODE_VERSION"
if (( NODE_MAJOR < 22 )); then
  fail "Node.js 22 or newer is required; found $NODE_VERSION."
fi

[[ -f package.json ]] || fail "package.json missing — run this from the Kamil repo root."

echo "=== Kamil — Restaurant Order Management ==="
echo "Node.js $NODE_VERSION"
echo ""

mkdir -p data uploads

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
else
  echo "Dependencies present (node_modules found)."
fi

if [[ -n "${SUPABASE_URL:-}" || -n "${SUPABASE_ANON_KEY:-}" ]]; then
  echo "Optional Supabase env detected — LAN Hub still does not depend on cloud."
else
  echo "Supabase OFF (no SUPABASE_URL / SUPABASE_ANON_KEY) — local SQLite only."
fi

if [[ -f client/package.json ]]; then
  echo "Building client..."
  npm run build
else
  echo "Note: client/package.json not found yet — skipping client build."
fi

PORT="${PORT:-3847}"
export PORT
export NODE_ENV="${NODE_ENV:-production}"

LAN_IP=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i !~ /^127\./ && $i !~ /:/){print $i; exit}}' || true)
if [ -z "${LAN_IP:-}" ]; then
  LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)
fi
if [ -z "${LAN_IP:-}" ] && command -v ipconfig >/dev/null 2>&1; then
  for iface in en0 en1; do
    LAN_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [ -n "${LAN_IP:-}" ] && break
  done
fi
LAN_IP="${LAN_IP:-localhost}"

echo ""
echo "Starting Kamil Hub on port ${PORT}..."
echo "  Local:   http://localhost:${PORT}"
echo "  LAN:     http://${LAN_IP}:${PORT}"
echo "  Hub:     http://${LAN_IP}:${PORT}/"
echo "  Kitchen: http://${LAN_IP}:${PORT}/kitchen"
echo "  Cashier: http://${LAN_IP}:${PORT}/cashier"
echo "  Admin:   http://${LAN_IP}:${PORT}/admin"
echo ""
echo "Press Ctrl-C to stop."
echo ""

exec npm run start -w server
