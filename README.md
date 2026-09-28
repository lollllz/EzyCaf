# Kamil

Local-network restaurant order management — Hub QR board, customer ordering, kitchen display (KDS), cashier, and admin.

Designed for a tablet/phone on the same Wi‑Fi. No cloud required (optional Supabase menu sync is off by default).

## Stack

- **Server:** Node.js, Express, Socket.io, better-sqlite3, qrcode, multer
- **Client:** React, Vite, TypeScript, Tailwind CSS, socket.io-client

## Quick start

```bash
cd /workspace/kamil
./start.sh
```

This installs dependencies, builds the SPA, and starts the Hub (API + static client) on port **3847** (override with `PORT=...`).

Printed URLs include localhost and your LAN IP, e.g. `http://192.168.1.10:3847`.

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

## Socket events

**Client → server:** `order:create`, `order:status`, `table:clear`  
**Server → clients:** `order:new`, `order:updated`, `table:cleared`, `menu:updated`, `hub:hello`

## Data

SQLite file at `server/data/kamil.db`. Seeded with a demo menu and four tables (`t1`–`t4`). Logos land in `/uploads`.

QR codes encode `http://<lan-ip>:<port>/t/<tableId>`.

## Health

`GET /api/health` → `{ ok, lan, port, baseUrl }`.
