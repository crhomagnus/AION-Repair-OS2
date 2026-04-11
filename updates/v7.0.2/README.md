# v7.0.2 Secure Bridge Snapshot

Date: 2026-04-11

## What Changed

- Added `bridge/local-bridge.js` to open a secure SSH reverse tunnel from the local workstation to the VPS.
- Added `bridge/.env.example` and `bridge/README.md` so the bridge can be configured without touching app secrets.
- Switched the VPS container to host networking so it can reach the SSH tunnel on the VPS loopback.
- Added a dedicated bridge SSH key separate from the VPS admin key.
- Bumped the reported application version to `7.0.2`.

## What Is Stable

- The UI remains button-light and browser-only for the user.
- AI responses still use the adaptive Portuguese prompt.
- The VPS web/API deployment is still live at `http://31.97.83.152:3002`.
- The VPS can already see the local USB phone through the SSH bridge.
- The ADB bridge still uses the same `AdbBridge` contract on the server side.

## What Still Needs Work

- The bridge should keep running on the workstation whenever the phone is meant to be visible to the VPS.
- If the bridge drops, the VPS app will lose ADB access until the tunnel returns.
- Reverse proxying the app behind a domain is still optional and not yet required.

## What Another AI Should Inspect First

1. `bridge/local-bridge.js`
2. `bridge/README.md`
3. `docker-compose.yml`
4. `server/adb-bridge.js`
5. `CONTEXT.md`
