#!/bin/bash
# Double-click in Finder, or run ./Demo-Mac.command in Terminal.
set -euo pipefail
cd "$(dirname "$0")"
fail() { printf '\nDemo setup failed: %s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || fail 'This launcher requires macOS.'
[[ -f package-lock.json && -f server/src/index.js ]] || fail 'Extract the complete EzyCaf folder before running this file.'
OPEN_BROWSER=1
DEMO_PAGE=/
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_BROWSER=0 ;;
    --setup) DEMO_PAGE=/setup ;;
    *) fail "Unknown option: $arg (available: --setup, --no-open)" ;;
  esac
done
DEMO_ROOT="$PWD/.demo"
mkdir -p "$DEMO_ROOT"
export EZYCAF_DATA_DIR="$DEMO_ROOT/data"
export EZYCAF_UPLOAD_DIR="$DEMO_ROOT/uploads"
export NODE_ENV=production
export VITE_DEMO=false
export PORT="${EZYCAF_DEMO_PORT:-3848}"

printf '\nEzyCaf Mac demo — real local orders with a separate demo database\n'
# Keep a private Node runtime when the Mac has no compatible Node installation.
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null || ! command -v npm >/dev/null 2>&1; then
  if [[ ! -x "$DEMO_ROOT/runtime/bin/node" ]]; then
    case "$(uname -m)" in arm64) DEMO_ARCH=arm64 ;; x86_64) DEMO_ARCH=x64 ;; *) fail 'Unsupported Mac processor.' ;; esac
    DOWNLOAD_DIR="$(mktemp -d "$DEMO_ROOT/download.XXXXXX")"
    trap 'rm -rf "$DOWNLOAD_DIR"' EXIT
    printf 'Downloading Node 22 from nodejs.org (no system installation needed)...\n'
    curl --fail --location --retry 3 --connect-timeout 20 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -o "$DOWNLOAD_DIR/checksums"
    NODE_ARCHIVE="$(awk -v arch="$DEMO_ARCH" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-darwin-" arch "\\.tar\\.gz$") {print $2; exit}' "$DOWNLOAD_DIR/checksums")"
    [[ -n "$NODE_ARCHIVE" ]] || fail 'Could not find the official Node archive for this Mac.'
    curl --fail --location --retry 3 --connect-timeout 20 "https://nodejs.org/dist/latest-v22.x/$NODE_ARCHIVE" -o "$DOWNLOAD_DIR/$NODE_ARCHIVE"
    awk -v file="$NODE_ARCHIVE" '$2 == file {print}' "$DOWNLOAD_DIR/checksums" > "$DOWNLOAD_DIR/selected.sha256"
    (cd "$DOWNLOAD_DIR" && shasum -a 256 -c selected.sha256) || fail 'Node download checksum did not match.'
    mkdir "$DOWNLOAD_DIR/runtime"
    tar -xzf "$DOWNLOAD_DIR/$NODE_ARCHIVE" --strip-components=1 -C "$DOWNLOAD_DIR/runtime"
    mv "$DOWNLOAD_DIR/runtime" "$DEMO_ROOT/runtime"
    rm -rf "$DOWNLOAD_DIR"
    trap - EXIT
  fi
  export PATH="$DEMO_ROOT/runtime/bin:$PATH"
fi
node -e 'const net=require("net"); const port=Number(process.env.PORT); if(!Number.isInteger(port)||port<1024||port>65535) throw Error("Use EZYCAF_DEMO_PORT between 1024 and 65535"); const s=net.createServer(); s.on("error",()=>{console.error(`Port ${port} is busy. Stop the other demo or set EZYCAF_DEMO_PORT=3849.`);process.exit(1)});s.listen(port,"0.0.0.0",()=>s.close());'
printf 'Installing dependencies...\n'
ELECTRON_SKIP_BINARY_DOWNLOAD=1 NODE_ENV=development npm ci --include=dev --no-audit --no-fund
printf 'Building the app...\n'
npm run build
node scripts/prepare-demo.mjs
printf '\nStarting the demo on http://localhost:%s%s\n' "$PORT" "$DEMO_PAGE"
node server/src/index.js &
HUB_PID=$!
cleanup() { kill "$HUB_PID" 2>/dev/null || true; wait "$HUB_PID" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 0' INT TERM
node --input-type=module -e 'let ready=false; for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${process.env.PORT}/api/health`,{signal:AbortSignal.timeout(500)});if(r.ok&&(await r.json()).service==="ezycaf-hub"){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}if(!ready)throw Error("Demo hub did not start; check the output above");'
printf '\nReady. Keep this Terminal window open. Press Control-C to stop.\n'
printf 'Hub:     http://localhost:%s/\nKitchen: http://localhost:%s/kitchen\nCashier: http://localhost:%s/cashier\nMenu:    http://localhost:%s/admin\nCustomer: http://localhost:%s/t/t1\n' "$PORT" "$PORT" "$PORT" "$PORT" "$PORT"
printf 'Phones need the same Wi-Fi. Scan a table QR from the hub.\nDemo data stays in .demo/data; cloud sync and public hosting are disabled.\n'
if [[ "$OPEN_BROWSER" == 1 ]]; then open "http://localhost:$PORT$DEMO_PAGE" || true; fi
wait "$HUB_PID"
