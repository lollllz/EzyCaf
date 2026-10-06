# Kamil Hub — start & LAN notes

Monorepo layout: root workspaces `server/` (Express + Socket.io + SQLite) and `client/` (React + Tailwind SPA). Runtime dirs: `data/` (SQLite), `uploads/` (logo, Hub-local only).

## Start

- macOS / Linux: `./start.sh`
- Windows cmd: `start.bat`

Scripts require Node 22+, run `npm install` when needed, build the client workspace, then start the Hub (`npm run start -w server`). Default port is **3847** (override with `PORT`).

## Environment

- `PORT` — optional; default `3847`
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — optional Admin menu-sync only. Leave unset for local-only. Cloud must never block LAN ordering.

## Routes

`/` Hub QR board · `/t/:tableId` Customer · `/kitchen` KDS · `/cashier` · `/admin`

For a stable QR destination, reserve the Hub device’s DHCP lease — see [`STATIC-IP.md`](STATIC-IP.md).

Guided desktop, Android and customer-service setup: [README-SETUP.md](README-SETUP.md).
