# Hostinger Transfer Notes

## Important Constraint

This project is not a generic web app. It depends on local ADB access to a physical Android device. A Hostinger VPS can host the web and API layers, but it cannot directly talk to a phone connected by USB to your PC unless you add a relay architecture.

## What Can Move to Hostinger

- Web UI
- REST API
- AI provider proxy
- Audit log
- Session state
- Device profile rendering logic
- Containerized runtime and reverse proxy

## What Needs a Local Bridge

- Direct USB ADB access
- Sensor polling from the connected phone
- Any action that depends on the physical phone plugged into the PC

## Deployment on This VPS

This VPS already has Docker and `docker-compose`, so the practical deployment path is:

1. Copy the repository to the VPS.
2. Build the container image from the repo root.
3. Run the app with `HOST=0.0.0.0`, `PORT=3002`, and the AI credentials injected through environment variables.
4. Keep the container on host networking so it can see the SSH reverse tunnel on the VPS loopback.
5. Start the local bridge on the workstation that has the phone connected by USB.

Current live endpoint: `http://31.97.83.152:3002`

## Official Hostinger API Notes

Hostinger documents its API token flow through hPanel, and the API is used for VPS management and automation. Hostinger also provides an API CLI that can authenticate through an API token or a config file.

## Recommended Deployment Shapes

1. Local-only
   - Best if the phone stays plugged into your PC.
   - Lowest complexity.

2. Hostinger VPS plus local bridge
   - Best if you want the dashboard public or remotely reachable.
   - The phone-side ADB bridge stays on the local machine.
   - The bridge uses an SSH reverse tunnel, not an exposed ADB port.

3. Hostinger VPS plus network ADB
   - Only if the phone is reachable over ADB TCP/IP.
   - More fragile and less safe than a local bridge.

## Secrets That Must Stay Out of Markdown

- `OPENROUTER_API_KEY`
- `DEEPSEEK_API_KEY`
- `HOSTINGER_API_TOKEN`
- `HAPI_API_TOKEN`
- any SSH private key
- any host password
- `BRIDGE_SSH_KEY`

## What Is Still Needed for an Actual Transfer

- target Hostinger VPS or project identifier
- SSH host/user/port if the deployment is manual
- permission to create or manage the VPS through the Hostinger API
- decision on whether the bridge key should be separate from the admin key
- confirmation that the workstation can run the bridge script while the phone stays connected

## Practical Next Step

If you want, the next step is to prepare a Hostinger-ready deployment plan and decide whether the app should be:

- local only
- VPS hosted with a local bridge
- VPS hosted with remote ADB
- VPS hosted as a Docker container with no local phone attached
