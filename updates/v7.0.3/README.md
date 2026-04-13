# v7.0.3 Continuity Snapshot

Date: 2026-04-13

## What Changed

- Synchronized the current AION continuity docs to the active OpenRouter setup.
- Updated the OpenRouter default model to `qwen/qwen3.6-plus` across code and environment examples.
- Added a new versioned continuity folder so the next AI can resume from the latest state instead of the prior snapshot.
- Kept raw secrets out of committed Markdown and left live credentials in local runtime storage only.

## What Is Stable

- The browser app remains the main interface for the user.
- The current AI provider selection still supports OpenRouter and DeepSeek through the existing provider logic.
- The Hostinger deployment path, secure bridge, telemetry, and policy layer remain intact.
- Versioned snapshots now document the recent evolution more clearly.

## What Still Needs Work

- Keep the local `.env` aligned with the current provider when the deployment changes.
- Keep the versioned snapshots current whenever a meaningful refactor lands.
- Keep deployment secrets out of committed docs and source control.

## What Another AI Should Inspect First

1. `CONTEXT.md`
2. `PROJECT_MASTER.md`
3. `server/ai-agent.js`
4. `.env.example`
5. `updates/README.md`

