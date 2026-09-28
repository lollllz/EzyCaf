#EzCaf

Local-network restaurant order management — Hub QR board, customer ordering, kitchen display (KDS), cashier, and admin.

Designed for a tablet/phone on the same Wi‑Fi. No cloud required (optional Supabase menu sync is off by default).

## Live demo (GitHub Pages)

**https://lollllz.github.io/kamil/**

Static client-only demo with in-memory orders (Customer → Kitchen → Cashier). No Node Hub on Pages — real ordering needs the LAN Hub below.

Rebuild & publish:

```bash
npm run build:pages          # VITE_DEMO=true, base /kamil/
npx gh-pages -d client/dist  # or: npm run deploy:pages
```

## Stack

- **Server:** Node.js, Express, Socket.io, better-sqlite3, qrcode, multer
- **Client:** React, Vite, TypeScript, Tailwind CSS, socket.io-client

## Quick start (LAN Hub)

```bash
cd /workspace/kamil
./start.sh
```

This installs dependencies, builds the SPA (demo **off**), and starts the Hub (API + static client) on port **3847** (override with `PORT=...`).

Printed URLs include localhost and your LAN IP, e.g. `http://192.168.1.10:3847`.

Hub production has **no** demo banner — Socket.io + `/api` are used. Demo mode only activates when `VITE_DEMO=true` (Pages build) or when `/api/hub` is unreachable.

### Dev (optional)

```bash
npm install
npm run build -w client   # or: npm run dev -w client  (proxies to server)
npm run start -w server
```

## Routes

| Path | Role |
|------|------|
| `/` | Hub QR board — black-on-white table QRs + brand logo |
| `/t/:tableId` | Customer menu & cart → Send to kitchen |
| `/kitchen` | Kitchen display (pending / cooking / ready) |
| `/cashier` | Table cards, totals, Clear / Pay |
| `/admin` | Accent, logo, menu CRUD, optional Supabase sync |

(Pages demo uses HashRouter: `/#/`, `/#/t/t1`, etc.)

## Socket events

**Client → server:** `order:create`, `order:status`, `table:clear`  
**Server → clients:** `order:new`, `order:updated`, `table:cleared`, `menu:updated`, `hub:hello`

## Data

SQLite file at `server/data/kamil.db`. Seeded with a demo menu and four tables (`t1`–`t4`). Logos land in `/uploads`.

QR codes encode `http://<lan-ip>:<port>/t/<tableId>`.

## Health

`GET /api/health` → `{ ok, lan, port, baseUrl }`.
