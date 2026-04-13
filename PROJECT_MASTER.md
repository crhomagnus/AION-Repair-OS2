# AION Repair OS - Master Continuity Document

Last updated: 2026-04-13 (post-deploy)
Current app version: 7.0.3 — commit 18e4c4b deployed to VPS

## Scope

This file is the exhaustive handoff document for the project. It is meant to let another AI reconstruct the product, the runtime topology, the deployment model, the APIs, the policy rules, and the current implementation status without asking follow-up questions.

Important rule: this document names secrets and credential locations, but it does not store raw secret values, passwords, or private key contents.

## One-line summary

AION Repair OS is a browser-based Android diagnostic and repair system. The user only chats with the AION assistant in Portuguese. The backend handles ADB access, telemetry polling, policy validation, AI provider calls, device profiling, audit logs, and optional forensic capture. The UI is dark, neon, and button-light.

## Product intent

The product is designed to behave like a premium technical assistant for Android repair work:

- the user speaks naturally in the browser
- the assistant reasons over the phone state and the user message
- the backend executes validated device commands
- telemetry is visible, but only as supporting context
- risky actions require confirmation and session mode control
- no offline AI fallback is allowed

## Reconstructed project origin and evolution

The repository does not contain a fully documented day-zero commit history, so the origin below is reconstructed from the current codebase and version snapshots.

### Phase 0: concept

- Web app for Android diagnostics and repair
- One chat prompt as the only user action
- Backend executes ADB commands on a connected phone
- Telemetry, audit, and device data are visible in the UI
- No generic chatbot tone, no FAQ behavior, no terminal for the end user

### Phase 1: core runtime

- Express HTTP server with WebSocket support
- ADB bridge for device listing, connection, command execution, and device info extraction
- Sensor poller for CPU, RAM, GPU, temperature, battery, disk, signal, latency, Bluetooth, Wi-Fi, camera, and memory
- Command validator with allow-list, deny-list, and risk tiers
- AI chat provider integration
- Audit log and action dispatch endpoints

### Phase 2: UI and device profile

- Dark neon operator panel
- Three main panes: telemetry, prompt/chat, and device/activity
- Device card with model image and hardware metadata
- Model-specific profile resolution using external image sources and local fallback art
- No visible command terminal for the user

### Phase 3: AI refinement

- AION prompt in Portuguese
- Adaptive vocabulary for lay users, mixed users, and repair technicians
- No offline AI response path
- Shorter, more focused replies
- Telemetry only when relevant

### Phase 4: deployment support

- Docker containerization
- Hostinger VPS support
- Configurable `ADB_HOST` and `ADB_PORT`
- Public remote runtime on the VPS

### Phase 5: secure bridge

- Local companion bridge on the workstation that has the phone by USB
- SSH reverse tunnel from the workstation to the VPS
- VPS container uses host networking to see the forwarded ADB port on `127.0.0.1`
- Dedicated bridge SSH key, separate from the VPS admin key

### Phase 6: AI agent rewrite

- System prompt rewritten with zero-hallucination rules
- 33 diagnostic skills (core, network, performance, apps, hardware, baseband, forensic)
- 256 ADB commands with open policy for read-only
- Tool execution loop: AI auto-executes LOW risk actions and re-calls with results
- Host-side ADB commands: bugreport, backup, pull/push
- Pipe command support in cmd-validator

### Phase 7: current state

- App version is 7.0.3, commit `18e4c4b`
- Remote Hostinger deployment is live and healthy
- Secure bridge is live
- AI provider: DeepSeek Reasoner (R1) via direct API
- The remote container sees the local USB phone through the bridge
- Last observed device: Redmi 12 (Android 13)
- The UI remains browser-only and button-light
- API_TOKEN and ADMIN_TOKEN are NOT configured on the VPS

## Current live topology

```text
User browser
  -> Hostinger VPS public HTTP endpoint
  -> Docker container running AION Repair OS
  -> ADB client configured for 127.0.0.1:5037 inside the VPS network namespace
  -> SSH reverse tunnel from the workstation
  -> Local ADB server on the workstation
  -> Physical Android phone over USB
```

## Current deployment endpoints

| Purpose | Value |
|---|---|
| Local app URL | `http://127.0.0.1:3001` |
| VPS app URL | `http://31.97.83.152:3002` |
| VPS host | `srv907802.hstgr.cloud` |
| VPS IP | `31.97.83.152` |
| Bridge ADB port on VPS loopback | `127.0.0.1:5037` |

## Repository map

| File | Status | Responsibility | Notes |
|---|---|---|---|
| `main.js` | Active | Loads `.env` and starts the server | Minimal bootstrap only |
| `package.json` | Active | Package metadata, scripts, version, and dependency manifest | App version is `7.0.3` |
| `package-lock.json` | Active | Locked dependency tree | Matches `7.0.3` metadata |
| `.env.example` | Active | Runtime environment template | Never store raw secrets in committed form |
| `bridge/.env.example` | Active | Bridge environment template | Workstation-only companion configuration |
| `server/index.js` | Active | HTTP API, WebSocket, sessions, chat, actions, audit, forensic capture | Core backend orchestrator |
| `server/adb-bridge.js` | Active | ADB device listing, connection, command execution, device info building | Supports `ADB_HOST` and `ADB_PORT` |
| `server/device-profile.js` | Active | Resolves brand, model, chipset, RAM, ROM, Android version, build, and image metadata | Uses Wikimedia Commons, Wikidata, GSMArena, and local fallback SVG |
| `server/sensor-poller.js` | Active | Polls real device telemetry | Reads ADB shell data in a loop |
| `server/cmd-validator.js` | Active | Command allow-list, deny-list, and risk classification | Backend authority for command safety |
| `server/ai-agent.js` | Active | AI provider integration and AION prompt | No offline fallback |
| `server/ai-executor.js` | Present | Autonomous execution scaffold | Not the primary runtime path |
| `web/index.html` | Active | Dark neon UI, chat composer, telemetry stream, device panel, activity log | Button-light user experience |
| `bridge/local-bridge.js` | Active | Local ADB server startup and SSH reverse tunnel | Workstation-only bridge process |
| `bridge/README.md` | Active | Bridge setup and run instructions | Companion doc for the local machine |
| `Dockerfile` | Active | Container image definition | Uses Node 20 on Debian slim |
| `docker-compose.yml` | Active | Hostinger deployment shape | Uses host networking and port 3002 |
| `README.md` | Active | Entry-point summary and quick start | Points to the exhaustive handoff doc |
| `CONTEXT.md` | Active | Condensed continuity doc | Fast resume version |
| `PROGRESS.md` | Active | Short progress snapshot | High-level implementation summary |
| `HOSTINGER_TRANSFER.md` | Active | Deployment boundary notes | Explains what can and cannot live only on the VPS |
| `updates/README.md` | Active | Versioned snapshot index | Points to historical continuity folders |
| `updates/v7.0.0/README.md` | Active | Snapshot of the AI/UI/telemetry refactor |
| `updates/v7.0.1/README.md` | Active | Snapshot of Docker and ADB host/port deployment support |
| `updates/v7.0.2/README.md` | Active | Historical snapshot of the secure bridge rollout |
| `updates/v7.0.3/README.md` | Active | Snapshot of the continuity refresh and OpenRouter/Qwen alignment |

## Miscellaneous artifacts

These files exist in the repository but are not part of the main runtime path:

- `code.html` - local HTML artifact or scratch reference
- `screen.png` - screenshot artifact

## Runtime architecture

### Request flow

1. The browser loads `web/index.html`.
2. The UI opens a WebSocket and starts polling devices and audit logs.
3. The user types only text into the prompt and presses Enter.
4. The frontend posts the message to `/api/chat`.
5. The backend combines the user message with live sensor state and session context.
6. `server/ai-agent.js` sends the prompt to the configured provider.
7. The assistant reply returns to the UI.
8. The current response path is text-first; the frontend has an action hook, but structured suggested actions are not emitted by default in the live `chat()` implementation.
9. `server/index.js` checks policy and session mode before any command runs.
10. Telemetry, device info, and audit events continue to stream in parallel.

### Data sources

- ADB shell output from the connected Android phone
- live sensor polling from `/proc`, `dumpsys`, and related device paths
- AI provider responses from OpenRouter or DeepSeek
- image and metadata lookups from Wikimedia Commons, Wikidata, and GSMArena
- audit state and session state held in memory on the server process

## Backend modules in detail

### `server/index.js`

This is the main orchestrator.

What it does:

- serves the static frontend
- exposes all REST endpoints
- manages WebSocket connections
- starts telemetry streaming
- stores sessions in memory
- stores the audit log in memory
- routes validated command execution
- routes AI chat calls
- exposes AI configuration state
- manages forensic capture jobs

Important behavior:

- `/api/status` reports the runtime version, device state, AI mode, active session count, and policy engine status
- `/api/connect` connects to a selected device and starts telemetry polling
- `/api/sessions` creates a session with channel, device ID, mode, and consent metadata
- `/api/actions/dispatch` enforces typed action risk levels
- `/api/execute` validates raw ADB commands before execution
- `/api/chat` sends the prompt plus current sensor context to the AI provider
- `/api/capture/forensic` starts a multi-step capture job

### `server/adb-bridge.js`

This module owns the ADB client.

Current behavior:

- reads `ADB_HOST` and `ADB_PORT`
- uses `adbkit`
- lists only authorized devices of type `device`
- verifies that a selected serial is actually present before connecting
- collects `getprop`, `/proc/meminfo`, and `df -k /storage/emulated/0`
- builds a richer device profile with `buildDeviceProfile`
- returns a fallback profile if something fails

### `server/device-profile.js`

This module turns raw device data into a user-facing profile.

Inputs:

- `getprop`
- `/proc/meminfo`
- `df` output

Outputs:

- brand
- manufacturer
- model
- device
- product
- board
- Android version
- Android SDK/API level
- build ID
- build fingerprint
- security patch
- chipset
- RAM totals and display text
- storage totals and display text
- display name
- image URL
- image source
- fallback image URL
- image resolution metadata

Image resolution order:

1. Wikimedia Commons category lookup
2. Wikidata image claim lookup
3. GSMArena image CDN lookup
4. Local fallback SVG

Fallback SVG details:

- dark device silhouette
- brand/model title
- serial
- chipset
- RAM/ROM summary
- local visual identity when external image lookup fails

### `server/sensor-poller.js`

This module polls live telemetry every 500 ms when a device is connected.

Metrics collected:

- CPU usage from `/proc/stat`
- RAM usage from `/proc/meminfo`
- GPU usage from vendor-specific files with multiple fallbacks
- temperature from thermal zones, then `dumpsys battery`
- battery level and charging state from `dumpsys battery`
- disk usage from `df -h /data`
- cellular signal from `dumpsys telephony.registry`
- latency from `/proc/sched_debug`
- Bluetooth status from `dumpsys bluetooth_manager`
- Wi-Fi status from `dumpsys wifi`
- camera availability from `dumpsys media.camera`
- memory usage from `/proc/meminfo`

It emits a telemetry snapshot through an internal event emitter, and `server/index.js` forwards that over WebSocket.

### `server/cmd-validator.js`

This module is the policy gate for shell commands.

Risk classes:

- low risk: read-only diagnostics
- medium risk: writes or state changes that need REPAIR mode
- high risk: destructive or irreversible actions that need FORENSIC mode plus explicit confirmation
- blocked: never allowed
- dangerous: path traversal or kernel/system access patterns

Examples of low risk:

- `dumpsys battery`
- `dumpsys meminfo`
- `dumpsys wifi`
- `cat /proc/stat`
- `cat /proc/meminfo`
- `df -h`
- `getprop`

Examples of medium risk:

- `am force-stop`
- `pm clear`
- `svc wifi enable`
- `svc wifi disable`
- `input tap`
- `input swipe`
- `logcat -d`

Examples of high risk:

- `rm -rf /data/local/tmp`
- `wipe data`
- `reboot recovery`
- `dd`
- `mkfs`

Blocked patterns include common shell injection and destructive forms such as command substitution, chained shell execution, and raw recursive deletes.

### `server/ai-agent.js`

This is the AI provider integration and prompt engine.

Current behavior:

- picks a provider from `AI_PROVIDER`, then environment hints
- supports OpenRouter and DeepSeek
- never falls back to offline fabricated answers
- uses the AION persona prompt in Portuguese
- adapts vocabulary to the inferred user level:
  - leigo
  - misto
  - tecnico
- adds live sensor context only when useful
- includes session mode context when available
- keeps the assistant response compact
- uses `max_tokens: 1200` and `temperature: 0.3`
- keeps short chat history for context

The prompt rules are:

- 1 to 3 sentences preferred
- one question at a time
- no emoji
- no FAQ tone
- no unnecessary telemetry dumps
- technical language only when it fits the user

### `server/ai-executor.js`

This file is an autonomous-execution scaffold.

Current state:

- it defines simple hypothesis-to-action rules
- it can produce recommended commands from telemetry
- it tracks execution history
- it emits thoughts for observability
- it is present in the codebase, but it is not the primary control loop for the current user-facing workflow

Treat it as a future automation layer, not as the main runtime authority.

### `bridge/local-bridge.js`

This is the workstation-side bridge.

What it does:

- loads `bridge/.env`
- validates bridge configuration
- confirms that the bridge SSH key exists
- starts or reuses the local ADB server
- prints local `adb devices` output for verification
- opens an SSH reverse tunnel to the VPS
- forwards `127.0.0.1:5037` on the VPS to `127.0.0.1:5037` on the workstation
- reconnects automatically if the tunnel exits unexpectedly

Tunnel properties:

- encrypted with SSH
- bound to VPS loopback only
- intended to keep the remote ADB port off the public internet
- uses a dedicated bridge key, not the VPS admin key

## Frontend architecture

The frontend is intentionally button-light. The user primarily sees:

- telemetry stream on the left
- chat prompt in the center
- device showcase and activity feed on the right

### Visual language

- dark background
- neon cyan and violet accents
- modern font stack: `Sora` for UI copy, `JetBrains Mono` for technical data
- glassy cards and overlays
- dense but readable operator-console layout
- mobile-friendly fallbacks exist, but the layout is optimized for desktop

### Interaction model

- the only normal user action is typing in the prompt and pressing Enter
- text confirmations like `confirmar` and `cancelar` are supported for risky actions
- no visible command terminal for the user
- the UI shows command execution as read-only logs

### Device panel

The device panel shows:

- image for the exact or closest resolved model
- brand
- model
- serial
- RAM
- ROM
- chipset
- Android version
- build ID
- board
- product
- API level
- image source label

### Activity panel

The activity feed displays:

- system startup events
- session creation
- device connection
- command execution
- audit entries
- warnings
- AI configuration changes

## API surface

### HTTP endpoints

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | `/api/status` | Runtime status | Reports version, mode, AI state, device state, sessions, and policy engine status |
| GET | `/api/devices` | List connected devices | Returns ADB devices of type `device` |
| POST | `/api/connect` | Connect to a selected device | Requires `deviceId` |
| POST | `/api/sessions` | Create a session | Requires `device_station_id`; may attach device info |
| GET | `/api/sessions/:id` | Read a session | In-memory session lookup |
| PATCH | `/api/sessions/:id` | Update a session | Can update `mode` or `status` |
| POST | `/api/actions/dispatch` | Dispatch typed action | Enforces risk level and session rules |
| POST | `/api/execute` | Execute raw command | Validated by the command policy engine |
| POST | `/api/chat` | Chat with the assistant | Uses live telemetry and session context |
| GET | `/api/ai/status` | AI provider status | Reports configured state and model |
| POST | `/api/ai/key` | Update AI key/model in memory | Runtime-only configuration |
| GET | `/api/sensors` | Current telemetry snapshot | Returns the latest poll result |
| GET | `/api/audit` | Recent audit log | Supports `limit` query parameter |
| GET | `/api/audit/session/:sessionId` | Session audit log | Filters audit records by session |
| POST | `/api/capture/forensic` | Start forensic capture job | Requires a connected device |
| GET | `/api/capture/forensic/:jobId` | Read forensic job status | Returns progress, status, and result |

### WebSocket events

| Event | Direction | Purpose |
|---|---|---|
| `connected` | server -> client | Initial handshake with mode and version |
| `telemetry` | server -> client | Live telemetry snapshots |
| `device_connected` | server -> client | Device profile after successful connect |
| `chat_response` | server -> client | AI response payload |
| `adb_log` | server -> client | Raw command execution result |
| `action_executed` | server -> client | Typed action result |
| `ai_config` | server -> client | AI config changes |
| `pong` | server -> client | Ping response |
| `error` | server -> client | Error message |

## Forensic capture workflow

The forensic capture endpoint exists for structured multi-step data collection.

Captured data can include:

- battery
- memory
- CPU
- process list
- disk
- thermal data
- screenshot
- logcat
- third-party package list

The job is tracked in memory and reports progress through `/api/capture/forensic/:jobId`.

## Dependencies and tools

### Runtime dependencies

| Package | Version | Purpose |
|---|---|---|
| `adbkit` | `^2.11.1` | ADB client library |
| `dotenv` | `^17.4.1` | Environment loading |
| `express` | `^5.2.1` | HTTP server |
| `ws` | `^8.20.0` | WebSocket server |

### Runtime platforms and binaries

| Tool | Purpose | Notes |
|---|---|---|
| Node.js 20 | App runtime | Docker uses `node:20-bookworm-slim` |
| `adb` | Local phone control and telemetry | Required on the workstation bridge host |
| `ssh` | Secure reverse tunnel | Required for the bridge |
| Docker | VPS deployment | Used on Hostinger |
| `docker compose` | Container orchestration | Current VPS deployment path |

### External services

| Service | Use | Secret needed |
|---|---|---|
| OpenRouter | AI provider | Yes |
| DeepSeek | AI provider | Yes, if enabled |
| Wikimedia Commons API | Device image lookup | No |
| Wikidata API | Device image lookup | No |
| GSMArena CDN | Device image lookup | No |
| Hostinger API / HAPI CLI | VPS automation and deployment | Yes, if used |

## Environment variables and credential inventory

This is a naming inventory, not a secret dump. Raw values stay in `.env`, a secret manager, or a deployment vault.

### AI and runtime

| Variable | Required | Purpose | Storage |
|---|---|---|---|
| `AI_PROVIDER` | No | Explicit provider selection (`openrouter` or `deepseek`) | `.env` |
| `OPENROUTER_API_KEY` | Yes, if OpenRouter is used | OpenRouter authentication | `.env` or secret manager |
| `OPENROUTER_MODEL` | No | OpenRouter model override | `.env` |
| `OPENROUTER_API_BASE_URL` | No | OpenRouter API base URL override | `.env` |
| `OPENROUTER_REFERER` | No | Referer header for OpenRouter | `.env` |
| `OPENROUTER_APP_NAME` | No | X-Title header for OpenRouter | `.env` |
| `DEEPSEEK_API_KEY` | Yes, if DeepSeek is used | DeepSeek authentication | `.env` or secret manager |
| `DEEPSEEK_MODEL` | No | DeepSeek model override | `.env` |
| `DEEPSEEK_API_BASE_URL` | No | DeepSeek API base URL override | `.env` |
| `PORT` | Yes | HTTP port | `.env` or runtime env |
| `HOST` | Yes | HTTP bind host | `.env` or runtime env |
| `ADB_HOST` | Yes | ADB host for `adbkit` | `.env` or runtime env |
| `ADB_PORT` | Yes | ADB port for `adbkit` | `.env` or runtime env |

### Hostinger and deployment

| Variable | Required | Purpose | Storage |
|---|---|---|---|
| `HOSTINGER_API_TOKEN` | If automation is used | Hostinger API authentication | Secret manager |
| `HAPI_API_TOKEN` | If Hostinger CLI automation is used | Hostinger API token source | Secret manager |
| `HOSTINGER_VM_ID` | If managed programmatically | Target VPS identifier | Deployment metadata |
| `HOSTINGER_SSH_HOST` | If used for direct SSH deploy | VPS SSH hostname | Deployment metadata |
| `HOSTINGER_SSH_USER` | If used for direct SSH deploy | VPS SSH user | Deployment metadata |
| `HOSTINGER_SSH_PORT` | If used for direct SSH deploy | VPS SSH port | Deployment metadata |

### Local bridge

| Variable | Required | Purpose | Storage |
|---|---|---|---|
| `BRIDGE_SSH_HOST` | Yes | VPS host for the reverse tunnel | `bridge/.env` |
| `BRIDGE_SSH_USER` | Yes | SSH user for the reverse tunnel | `bridge/.env` |
| `BRIDGE_SSH_PORT` | No | SSH port | `bridge/.env` |
| `BRIDGE_SSH_KEY` | Yes | Local private key file path | local file on workstation |
| `BRIDGE_REMOTE_BIND` | No | Remote bind address on the VPS | `bridge/.env` |
| `BRIDGE_REMOTE_PORT` | No | Remote ADB port on the VPS | `bridge/.env` |
| `BRIDGE_LOCAL_BIND` | No | Local ADB bind address | `bridge/.env` |
| `BRIDGE_LOCAL_PORT` | No | Local ADB port | `bridge/.env` |
| `BRIDGE_ADB_BIN` | No | Path to `adb` binary | `bridge/.env` |
| `BRIDGE_SSH_BIN` | No | Path to `ssh` binary | `bridge/.env` |
| `BRIDGE_KEEPALIVE_INTERVAL` | No | SSH keepalive interval | `bridge/.env` |
| `BRIDGE_KEEPALIVE_COUNT_MAX` | No | SSH keepalive retry count | `bridge/.env` |

### Credentials observed during setup

The setup used a VPS root password and a dedicated bridge SSH key. Their raw values are intentionally not stored in this repository. The bridge public key is installed on the VPS, and the private key remains only on the workstation.

### Where the real values live

If another AI needs the operational values, it should look in these places, not in Markdown:

- workstation `.env`
- workstation `bridge/.env`
- the VPS container environment
- the deployment vault or secret manager
- the local bridge private key file referenced by `BRIDGE_SSH_KEY`

## Current implementation status

### Stable and active

- chat-only user interaction
- live telemetry polling
- device connect and profile resolution
- dark neon browser UI
- audit log
- websocket streaming
- typed action dispatch
- command policy validation
- no offline AI fallback
- adaptive vocabulary
- Dockerized VPS deployment
- local SSH reverse bridge

### Present but not primary

- `server/ai-executor.js` exists as an autonomous decision scaffold, but the current product flow is still user-chat-first and backend-policy-first

### Needs careful attention

- the bridge must keep running on the workstation if the VPS needs to see the USB phone
- if the bridge drops, the VPS loses live ADB access until the tunnel comes back
- raw secrets must never be copied into Markdown
- the worktree currently contains uncommitted edits, so any future refactor should read the current file state before overwriting anything

## Current live validation snapshot

Last live validation: 2026-04-13 post-deploy

- remote endpoint: `http://31.97.83.152:3002`
- app version: `7.0.3`
- commit: `18e4c4b`
- device seen through the bridge: `Redmi 12`
- device serial: `7b8127147d81`
- Android version: 13
- AI mode: online
- AI model: `deepseek-reasoner` (DeepSeek R1)
- last observed telemetry: CPU `46%`, RAM `46%`, GPU `0%`, temperature `33C`, battery `100%` charging, disk `15%`, signal `-103 dBm`, latency `0`, Bluetooth `false`, Wi-Fi `true`, camera `true`, memory `45%`

These values are operational snapshots, not permanent constants. Recheck them if the deployment or the connected phone changes.

## Version history

### v7.0.0

- AION prompt introduced
- offline AI fallback removed
- adaptive vocabulary added
- device profile panel added
- telemetry and audit flow consolidated
- dark neon interface established

### v7.0.1

- Docker deployment added
- `ADB_HOST` and `ADB_PORT` added
- VPS deployment support formalized
- app version reported as `7.0.1`

### v7.0.2

- local bridge added
- SSH reverse tunnel added
- host networking used on the VPS container
- dedicated bridge SSH key introduced
- VPS can see the USB phone through the bridge
- app version reported as `7.0.2`

### v7.0.3

- System prompt rewritten: zero-tolerance for hallucination, maximum effort always
- 33 diagnostic skills (was 19): added baseband, modem, AT command, radio deep, firmware, forensic chain, connectivity deep, power, memory, notification, sensor, UI automation, app troubleshoot
- 256 ADB commands (was 105): open policy for read-only commands
- Host-side ADB commands: bugreport, backup, pull/push via `child_process.execFile`
- Pipe command support in cmd-validator (grep, head, tail, wc, sort, awk, sed)
- AUDIO_ANALYSIS and DISPLAY_ANALYSIS skills with specific data commands
- Deployed to VPS on 2026-04-13 — confirmed healthy with Redmi 12 connected
- AI provider on VPS: DeepSeek Reasoner (R1), not OpenRouter
- current app version reported as `7.0.3`

## What another AI should inspect first

If a new AI opens this repository, the fastest route is:

1. Read this file.
2. Read `CONTEXT.md`.
3. Read `updates/README.md`.
4. Read `updates/v7.0.3/README.md`.
5. Inspect `server/index.js`.
6. Inspect `server/ai-agent.js`.
7. Inspect `server/device-profile.js`.
8. Inspect `bridge/local-bridge.js`.
9. Inspect `web/index.html`.
10. Inspect `docker-compose.yml`.
11. Run `npm start` locally or `docker compose up -d --build` for the VPS container.
12. If the phone must be visible to the VPS, run `npm run bridge` on the workstation with the USB phone attached.

## Operational checklist

Before changing code:

- confirm whether the goal is local runtime, VPS runtime, or bridge behavior
- confirm whether the phone is physically attached to the workstation
- confirm whether the AI provider is OpenRouter or DeepSeek
- confirm whether the command belongs to the validated policy surface
- avoid touching secrets or replacing live deployment credentials

Before releasing:

- verify `/api/status`
- verify `/api/devices`
- verify `/api/sensors`
- verify `/api/chat`
- verify the device image panel
- verify websocket telemetry
- verify the bridge path if remote ADB is required

## Maintenance rules

- keep secrets out of Markdown
- keep the UI button-light unless the product spec changes
- keep the assistant short, calm, and technically precise
- keep the command validator as the authoritative safety gate
- update this file whenever deployment shape, bridge shape, or AI provider shape changes
