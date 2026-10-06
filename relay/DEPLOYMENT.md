# Customer ordering on mobile data

The public customer service is separate from the private cafe hub. It provides a menu and receives customer orders. It has no kitchen, cashier, settings or staff APIs. The cafe hub sends its public menu and polls for orders over outbound HTTPS. Orders succeed only after the hub records them in SQLite.

## Choose an operating mode

| Choice | Customer connection | Cafe requirements | Hosting |
| --- | --- | --- | --- |
| Local only | Cafe Wi-Fi, table QR | Wi-Fi router and a running hub; internet not required | None |
| Customer service | Mobile data or any internet connection, table QR | Running hub with internet; staff stays on cafe LAN | Persistent container or Node server, HTTPS and WebSockets |

A static website host or ordinary serverless function cannot run this persistent process. Owners choose and pay for their own compatible provider. Use one service and one unique pairing token per cafe. Do not share a service between unrelated cafes.

## Docker on your own server

1. Extract this bundle. Copy `relay/.env.example` to `relay/.env`.
2. Point your chosen domain's DNS at the server. Set `CUSTOMER_DOMAIN` to that domain (without `https://`). Generate a random token with `openssl rand -hex 32` and put it in `RELAY_TOKEN`. Do not commit this file.
3. Run `docker compose --env-file relay/.env -f relay/compose.yaml up --build -d` from the bundle root. Allow ports 80 and 443 on the hosting server. Caddy obtains HTTPS certificates. Keep the cafe hub's port private.
4. In EzyCaf setup on the cafe host, finish local setup, then choose public customer ordering. Enter `https://your-domain` and the same pairing token. Test and pair.
5. Verify an order reaches the kitchen using a phone with cafe Wi-Fi turned off. Verify the staff APK refuses to connect on mobile data. Reprint table QR codes after pairing, changing domain or unpairing.

## Managed container provider

Upload this bundle or build `relay/Dockerfile` from its root. Run the image with `RELAY_TOKEN` set, `PORT=8080`, and `RELAY_DATA_DIR=/data`. Mount a persistent volume at `/data`. Enable HTTPS and WebSockets at the provider's ingress; preserve the original Host header. Pair the generated HTTPS origin in the cafe setup. If there is exactly one trusted proxy which sanitizes X-Forwarded-For and the container cannot be reached directly, set `RELAY_TRUST_PROXY=1` for per-customer rate limits. Otherwise leave it off.

A managed provider that lacks persistent volumes is not suitable for the SQLite queue. Back up `/data/relay.db` with SQLite's backup API or stop the container before copying the data volume. Do not copy only a live DB file while WAL is active.

## Failure and access behavior

The service refuses new orders when the hub heartbeat is older than 15 seconds. Unconfirmed requests persist briefly across restarts and use stable IDs to avoid duplicate local orders. After a delayed confirmation, retry the same cart or check with staff before starting a different order. Accepted requests are retained for 24 hours to support retries, then removed. A public QR allows anonymous ordering, so staff must review orders; it does not prove physical presence or payment. There is no payment processing in this service.

If internet or hosting fails, staff and local ordering continue on cafe Wi-Fi. Provide a local table link/QR and guest-network instructions as a fallback. The staff hub must not be exposed through port forwarding, public reverse proxies or remote tunnels. Subnet restrictions complement router/firewall configuration; they cannot identify physical Wi-Fi membership behind a proxy.

The existing optional Supabase menu replica is independent of this service. It is not needed for customer mobile-data orders.
