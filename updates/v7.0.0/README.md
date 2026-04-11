# v7.0.0 Current Snapshot

Date: 2026-04-10

## What This Version Represents

This snapshot reflects the current AION Repair OS state after the latest UI, AI, and telemetry work.

## Implemented Changes

- `server/ai-agent.js`
  - Replaced the older short prompt with the AION prompt focused on calm technical support.
  - Disabled offline fallback replies.
  - Added adaptive vocabulary for lay users, mixed users, and repair technicians.
  - Reduced response verbosity by lowering generation settings.
- `server/index.js`
  - Returns AI availability as a normal runtime state instead of an offline mode.
  - Streams AI config state through HTTP and WebSocket.
  - Keeps chat execution backend-driven.
- `server/adb-bridge.js`
  - Validates the selected device against `adb devices`.
  - Builds a richer device profile from props, memory, and storage.
- `server/device-profile.js`
  - Resolves brand, model, chipset, RAM, ROM, and image metadata.
  - Uses external image sources with local fallback.
- `server/sensor-poller.js`
  - Polls telemetry in a more robust way.
  - Uses `telephony.registry` parsing for signal.
- `server/cmd-validator.js`
  - Keeps command execution within allow/deny/risk bounds.
- `web/index.html`
  - Dark neon interface.
  - No visible terminal for the user.
  - Only text entry and Enter-to-send interaction.
  - Device showcase panel with image and hardware fields.
  - Activity stream for commands, telemetry, audit, and AI responses.

## Current Behaviour

- The user talks only to the assistant.
- The assistant chooses the wording based on the apparent user level.
- The backend executes validated actions.
- High-risk flows still need confirmation.
- No AI offline fallback exists.

## Things an AI Should Inspect First

1. `server/ai-agent.js`
2. `server/index.js`
3. `web/index.html`
4. `server/device-profile.js`
5. `server/adb-bridge.js`

## Open Questions

- Whether Hostinger should host only the UI/API layer or the full system.
- Whether a local ADB relay is required for the real phone workflow.
- Whether a future version should split "repair technician" and "general user" UI modes explicitly.
