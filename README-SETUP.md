# EzyCaf setup and device guide

## Install the cafe hub

The desktop application runs the hub and opens guided setup. Packaging targets are macOS DMG/ZIP, Windows installer and Linux AppImage/DEB. Pre-release builds are unsigned; distribution requires the owner's signing credentials (including macOS notarization). Closing the application stops the hub. Keep the host on throughout service.

New desktop installs keep their database and uploaded logos in the operating system's EzyCaf application-data folder, not inside the installer. Updating the application preserves this data. Existing source installs continue to use `server/data/kamil.db`. To migrate an existing source database, stop both hubs, back up the database and its SQLite sidecars, and move it to the desktop `hub-data` folder as `kamil.db`. Copy the uploads folder too. The desktop app uses a separate database until migrated; it does not silently overwrite or import existing data.

Developers can run `npm ci` then `npm run desktop`. For Node hub use `start.sh` (macOS/Linux) or `start.bat` (Windows), then visit `http://localhost:3847/setup`. Node setup requires Node 22+. The packaged desktop application includes its runtime and does not require installing Node.

## Guided setup

1. Understand the cafe's local-network requirements.
2. Enter cafe name, colour and table count. Existing tables/order history are preserved.
3. Connect devices using the displayed hub address, test the menu, and choose customer access.

The cafe needs a Wi-Fi router/local network. Staff devices and hub must be reachable on the same subnet. Guest isolation/firewall rules may require router configuration; the installer cannot change every router automatically. Reserve the host's DHCP address so printed local QR codes remain valid. Outside the cafe network the staff app does not operate.

**Local only:** Customers join cafe Wi-Fi and scan their table QR. Internet access is unnecessary. A guest Wi-Fi QR beside the table QR helps customers join.

**Public customer ordering:** Customers scan a public table QR using mobile data or Wi-Fi. Owners choose their own compatible host. Download the customer service ZIP from setup, deploy it, then enter its HTTPS origin and unique pairing token on the cafe host. Staff stays local; no cafe port forwarding is needed. The cafe's hub needs internet for public orders. Details and Docker/managed-container steps are in [relay/DEPLOYMENT.md](relay/DEPLOYMENT.md).

Reprint QR codes when switching modes or changing addresses. Keep local fallback links available if public hosting/internet fails.

## Android staff app

Install the test APK, join cafe Wi-Fi, then enter the private IPv4 address displayed by the hub. Test the connection and choose Table hub, Kitchen or Cashier. The app validates the hub and refuses cellular/VPN connections and public URLs. Leaving Wi-Fi blanks the staff screen; it must reconnect before resuming. Setup/admin remains on the host computer. The role chooser is navigation, not a staff authorization/login system; the existing hub trusts devices on its cafe network. Separate staff and guest networks with router rules if guests must not reach staff endpoints.

Customers do not need an APK; a browser opens the table QR.

## Build and verify

- `npm test`: SQLite deletion/restart, cloud deletion mock, LAN restrictions and real customer-service/hub integration.
- `npm run build`: frontend plus customer deployment ZIP.
- `npm run package:desktop -- --publish never`: installers for the current platform.
- `cd android && ./gradlew assembleDebug lintDebug`: test APK and lint. Production APK signing remains the owner's responsibility.
- Manual CI workflow builds macOS, Windows, Linux and Android artifacts without publishing them.

Optional Supabase replication requires SELECT/INSERT/UPDATE/DELETE policies appropriate to the cafe. Deleted IDs are queued locally and retried; replication failures do not undo local deletion. Previously orphaned cloud rows from the old upsert-only implementation cannot be inferred safely and must be reviewed separately. Live cloud policy validation is required on the owner's project; tests use a fake provider.
