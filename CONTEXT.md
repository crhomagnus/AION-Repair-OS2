# AION Repair OS - Project Continuity Context

Last updated: 2026-04-13
Version: 7.0.3

## Document Relationship

This is the condensed continuity document.

For the exhaustive project handoff, read [PROJECT_MASTER.md](/home/bluecamp/aion-repair-os/PROJECT_MASTER.md).

## Purpose

AION Repair OS is a web-based Android diagnostic and repair system. The user talks only to the AION assistant in the browser. The backend handles ADB, telemetry, policy checks, AI calls, and device profiling. The UI is intentionally button-light and log-heavy.

## Non-Negotiable Rules

- No offline AI fallback. If the provider is unavailable or not configured, the backend returns an error instead of inventing a local reply.
- The user does not use shell commands in the UI.
- The user only sends text messages to the assistant.
- Command execution stays behind the backend policy layer.
- High-risk actions require explicit confirmation and session mode checks.
- Secrets must not be committed in raw form inside Markdown or source files.

## Current Architecture

### Runtime Flow

1. `web/index.html` renders the dashboard, telemetry stream, device panel, audit log, and chat composer.
2. The user sends text to `/api/chat`.
3. `server/index.js` pulls current sensor state and session context.
4. `server/ai-agent.js` sends the prompt plus live context to the configured AI provider.
5. The current chat flow is text-first; the frontend has an action hook, but structured suggested actions are not emitted by default.
6. `server/index.js` routes execution through `CmdValidator` and `AdbBridge`.
7. Telemetry and audit events stream back through WebSocket.
8. The app can run in a container with host networking so it can reach the VPS-side loopback tunnel.
9. The local workstation runs `bridge/local-bridge.js`, which opens a secure SSH reverse tunnel from the phone-side ADB server to the VPS.

### Core Modules

| File | Status | Notes |
|---|---|---|
| `main.js` | Active | Loads `.env` and starts the server. |
| `server/index.js` | Active | REST API, WebSocket, sessions, chat, command execution, AI config, forensic capture. |
| `server/adb-bridge.js` | Active | Validates connected devices, reads props/memory/storage, builds device profiles. |
| `server/device-profile.js` | Active | Resolves brand, model, chipset, memory, storage, and image metadata for the current device. |
| `server/sensor-poller.js` | Active | Polls CPU, RAM, GPU, temperature, battery, storage, signal, latency, Bluetooth, Wi-Fi, camera, and memory. |
| `server/cmd-validator.js` | Active | Whitelist, denylist, and risk tiers for ADB commands. |
| `server/ai-agent.js` | Active | Web-only AI provider integration, adaptive vocabulary, no offline reply path. |
| `server/ai-executor.js` | Present | Autonomous executor logic exists and can emit recommended actions. |
| `bridge/local-bridge.js` | Active | Starts the local ADB server and opens the SSH reverse tunnel to the VPS. |
| `web/index.html` | Active | Dark neon UI, buttonless interaction model, device image panel, telemetry, activity feed, chat. |

## Current Implementation Status

### Already Implemented

- Dark, high-tech visual style with neon accents.
- No visible terminal for the user.
- Only Enter-to-send chat interaction.
- Device profile panel with model image and hardware details.
- Adaptive assistant language level: simple for lay users, technical for repair users.
- No AI offline fallback.
- ADB connection validation before session creation.
- Real telemetry polling and streaming.
- Policy-based command filtering.
- Audit log and activity stream.

### Needs Careful Attention

- Hostinger deployment is not the same as local ADB execution.
- A VPS can host the web/API layer, but direct USB ADB still requires a machine that can see the Android device, or a separate ADB relay architecture.
- Raw credentials are intentionally not stored in this document.

## API Surface

### REST Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/status` | Server, device, AI, and policy status. |
| GET | `/api/devices` | List connected ADB devices. |
| POST | `/api/connect` | Connect to a selected device. |
| POST | `/api/sessions` | Create a session and optionally connect to a device. |
| GET | `/api/sessions/:id` | Read a session. |
| PATCH | `/api/sessions/:id` | Update session mode/status. |
| POST | `/api/actions/dispatch` | Dispatch a typed action. |
| POST | `/api/execute` | Execute a validated ADB command. |
| POST | `/api/chat` | Send a user prompt to the AI provider. |
| GET | `/api/ai/status` | AI provider status. |
| POST | `/api/ai/key` | Update AI key/model in memory. |
| GET | `/api/sensors` | Current telemetry snapshot. |
| GET | `/api/audit` | Recent action log. |
| GET | `/api/audit/session/:sessionId` | Session-specific audit log. |
| POST | `/api/capture/forensic` | Start forensic capture job. |
| GET | `/api/capture/forensic/:jobId` | Read forensic job progress. |

### WebSocket Events

- `connected`
- `telemetry`
- `device_connected`
- `chat_response`
- `adb_log`
- `action_executed`
- `ai_config`
- `pong`
- `error`

## Environment Variables

### Runtime

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port for the Node server. |
| `HOST` | Bind host for the Node server. |
| `ADB_HOST` | Hostname or IP for the ADB server used by `adbkit`. |
| `ADB_PORT` | TCP port for the ADB server used by `adbkit`. |
| `OPENROUTER_API_KEY` | Primary AI key when using OpenRouter. |
| `OPENROUTER_MODEL` | OpenRouter model override. |
| `OPENROUTER_API_BASE_URL` | OpenRouter base URL override. |
| `OPENROUTER_REFERER` | HTTP referer header for OpenRouter. |
| `OPENROUTER_APP_NAME` | X-Title header for OpenRouter. |
| `DEEPSEEK_API_KEY` | Alternate AI key if DeepSeek is used. |
| `DEEPSEEK_MODEL` | DeepSeek model override. |
| `DEEPSEEK_API_BASE_URL` | DeepSeek base URL override. |
| `AI_PROVIDER` | Explicit provider selector. |

### Deployment and Continuity

| Variable | Purpose |
|---|---|
| `HOSTINGER_API_TOKEN` | Hostinger API token for deployment automation. Redacted here on purpose. |
| `HAPI_API_TOKEN` | Hostinger API CLI token source. Redacted here on purpose. |
| `HOSTINGER_VM_ID` | Target VPS identifier if a Hostinger VPS is managed programmatically. |
| `HOSTINGER_SSH_HOST` | SSH host for VPS deployment. |
| `HOSTINGER_SSH_USER` | SSH username for VPS deployment. |
| `HOSTINGER_SSH_PORT` | SSH port for VPS deployment. |
| `BRIDGE_SSH_HOST` | VPS host used by the local ADB bridge tunnel. |
| `BRIDGE_SSH_USER` | SSH user used by the local ADB bridge tunnel. |
| `BRIDGE_SSH_PORT` | SSH port used by the local ADB bridge tunnel. |
| `BRIDGE_SSH_KEY` | Local private key for the bridge tunnel. |
| `BRIDGE_REMOTE_BIND` | Remote bind address for the forwarded ADB port. |
| `BRIDGE_REMOTE_PORT` | Remote forwarded ADB port on the VPS. |
| `BRIDGE_LOCAL_BIND` | Local bind address for the ADB server on the workstation. |
| `BRIDGE_LOCAL_PORT` | Local ADB server port on the workstation. |

## Secrets Policy

This repository must not store raw secrets in Markdown. If a secret exists in the working machine, keep it in `.env`, a secret manager, or a deployment vault. For continuity, document:

- secret name
- where it is used
- whether it is required
- whether it is runtime or deployment-only

Do not paste raw API keys, tokens, passwords, or private endpoints into docs.

## External Services

| Service | Use | Secret Needed |
|---|---|---|
| OpenRouter | AI chat provider | Yes |
| DeepSeek | Alternate AI provider | Yes, if enabled |
| Hostinger API | VPS/deployment management | Yes, if used |
| ADB / adbkit | Local Android device access | No external secret, but USB or network transport is required |
| Wikimedia Commons / Wikidata / GSMArena image lookup | Device profile image resolution | No |

## Hostinger Transfer Reality

Full "move everything to Hostinger" is not equivalent to full local execution.

- The web UI can run anywhere.
- The Node API can run on a VPS.
- The ADB bridge needs a machine that can actually see the phone, unless the device is reachable over network ADB or a relay service.
- Docker deployment is now supported through `Dockerfile` and `docker-compose.yml`.

If the target is a Hostinger VPS, the safe architecture is:

1. Hostinger hosts the web/API layer.
2. A local companion bridge keeps USB ADB access to the phone.
3. The two sides communicate over a secure SSH reverse tunnel.
4. The bridge binds the remote ADB port to VPS loopback only.
5. The VPS container reaches that loopback through host networking.

## Quick Resume Guide for Another AI

If another AI opens this repo, the fastest path is:

1. Read this file.
2. Read `updates/README.md`.
3. Read `updates/v7.0.3/README.md`.
4. Check `server/index.js` for the live API contract.
5. Check `server/ai-agent.js` for the current prompt and vocabulary rules.
6. Check `web/index.html` for the current UI flow.
7. Run `npm start`.
8. Open `http://127.0.0.1:3001`.
9. Verify `/api/status`, `/api/devices`, `/api/sensors`, and `/api/chat`.

## Current Snapshot

- The assistant is configured as AION in Portuguese (Brazil).
- The current AI provider is OpenRouter with `qwen/qwen3.6-plus`; DeepSeek remains supported as the alternate provider when configured.
- The UI is dark, neon, and mostly read-only.
- The assistant adapts to lay users or repair technicians.
- Offline AI replies are disabled.
- The device profile panel resolves model-specific images and hardware data.
- The Hostinger VPS deployment is live through Docker on `http://31.97.83.152:3002`.
- The remote container now sees the local phone through the SSH reverse tunnel on host port `5037`.
- The bridge process lives in `bridge/local-bridge.js` and is run on the workstation with the phone connected by USB.
- Current worktree contains uncommitted changes and should be read carefully before any refactor.

## Update Index

- `updates/v7.0.3/README.md` contains the current implementation snapshot.
- Future improvements should get their own versioned folder under `updates/`.

## Notes for Future Maintenance

- Keep secrets out of Markdown.
- Keep the prompt short enough to stay responsive, but precise enough to preserve behavior.
- Keep the UI buttonless unless the product requirements change.
- If Hostinger deployment is required, define the target first: VPS, Git deployment, or a local bridge plus remote dashboard.
- If the AI provider changes, update `server/ai-agent.js`, `server/index.js`, and this file together.
