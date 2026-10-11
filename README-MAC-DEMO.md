# Mac demo in one launch

Extract the complete EzyCaf Mac Demo ZIP, then double-click **Demo-Mac.command**. Keep the extracted files together. Alternatively, run `bash Demo-Mac.command` from Terminal in the EzyCaf repository.

The launcher downloads a private Node 22 runtime from nodejs.org if needed, verifies its SHA-256 checksum, installs locked dependencies, builds the app, creates sample data and opens the browser. First launch needs internet for downloads. Later launches still check/install dependencies and build, so keep internet available. It does not require Homebrew, Docker, an Android SDK, an account or cloud hosting.

The demo uses port **3848**, with four tables, eight menu items and three sample orders in pending, cooking and ready states. Use Table hub, Kitchen, Cashier, Menu/settings, or `http://localhost:3848/t/t1` for the customer view. Orders and menu edits use a real SQLite database and persist between launches. Press **Control-C** in Terminal to stop the hub.

Demo database/uploads are kept under `.demo/` in the extracted folder, separately from normal hub and desktop application data. Supabase sync and public customer-service pairing are disabled each launch. This demo demonstrates local ordering; phones need the same cafe Wi-Fi, and macOS must allow local network access. The hub displays table QR codes with its LAN address.

To walk through onboarding instead, run `bash Demo-Mac.command --setup`. To leave the browser closed, use `--no-open`. If port 3848 is busy, stop the other demo or run `EZYCAF_DEMO_PORT=3849 bash Demo-Mac.command`. The script never stops an unrelated process.

For a fresh demo, stop the launcher and move the `.demo/data` folder elsewhere as a backup before launching again. This removes demo history from the next session. Moving the entire extracted folder also moves its demo data.

This is a demo launcher, not a production deployment or a desktop/APK installer builder. Staff access retains the project's local-network trust model.
