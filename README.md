# AION Repair OS

Version 7.0.3 — deployed and running on VPS Hostinger.

See [AION-STATUS.md](AION-STATUS.md) for the quick operational status.
See [CONTEXT.md](CONTEXT.md) for the continuity doc, status map, and update index.
See [PROJECT_MASTER.md](PROJECT_MASTER.md) for the exhaustive handoff doc.
See [ESTADO_COMPLETO_DO_PROJETO.md](ESTADO_COMPLETO_DO_PROJETO.md) for the full project state.

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
