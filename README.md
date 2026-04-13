# AION Repair OS

See [PROJECT_MASTER.md](/home/bluecamp/aion-repair-os/PROJECT_MASTER.md) for the exhaustive handoff doc.
See [CONTEXT.md](/home/bluecamp/aion-repair-os/CONTEXT.md) for the current continuity doc, status map, secrets policy, and update index.
Latest continuity snapshot: [updates/v7.0.3/README.md](/home/bluecamp/aion-repair-os/updates/v7.0.3/README.md).

## Quick Start

```bash
npm install
npm start
```

Open the UI at `http://127.0.0.1:3001`.

## Docker

```bash
docker compose up -d --build
```

The container runs on host network mode in the VPS deployment and expects AI credentials in `.env`.
The public app is on `http://31.97.83.152:3002`.

## Local Bridge

```bash
npm run bridge
```

The bridge script opens a secure SSH reverse tunnel from the workstation with the phone to the VPS.

## What This Project Does

- Web-based Android diagnostic and repair interface.
- ADB-backed telemetry and command execution.
- AI assistant with adaptive vocabulary for lay users and repair technicians.
- Dark neon UI with telemetry, audit, and device profile panels.

## Important Constraint

- Full Hostinger deployment is not the same as USB ADB control of a local phone. See `HOSTINGER_TRANSFER.md`, `bridge/README.md`, and `CONTEXT.md` for the deployment boundary.
