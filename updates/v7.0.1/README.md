# v7.0.1 Deployment Snapshot

Date: 2026-04-10

## What Changed

- Added container deployment support through `Dockerfile` and `docker-compose.yml`.
- Made the ADB bridge host and port configurable through `ADB_HOST` and `ADB_PORT`.
- Kept the default local behavior intact for direct USB ADB on the workstation.
- Bumped the reported application version to `7.0.1`.

## What Is Stable

- The chat/UI flow is still the same button-light browser experience.
- The AI prompt, adaptive vocabulary, and no-offline policy remain unchanged.
- The Hostinger continuity docs still explain the USB ADB boundary clearly.
- The remote VPS deployment is running at `http://31.97.83.152:3002`.
- AI is online on the VPS with the configured DeepSeek provider.

## What Still Needs Work

- The remote ADB path still depends on a separate bridge or network ADB.
- The VPS can host the app, but not a phone physically plugged into the local PC.
- If the deployment target changes, the reverse proxy and environment injection need to be checked again.
- If ADB is required remotely, the next step is a companion bridge or SSH tunnel from the local machine.

## What Another AI Should Inspect First

1. `Dockerfile`
2. `docker-compose.yml`
3. `server/adb-bridge.js`
4. `server/index.js`
5. `CONTEXT.md`
