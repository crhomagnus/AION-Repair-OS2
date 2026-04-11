# Local ADB Bridge

This bridge runs on the workstation that has the Android phone connected by USB.
It does two things:

1. Starts or reuses the local ADB server.
2. Opens an SSH reverse tunnel to the Hostinger VPS so the remote AION container can reach the local ADB server securely.

## Why This Is Secure

- The tunnel is encrypted with SSH.
- The remote ADB port is bound to `127.0.0.1` on the VPS.
- The container on the VPS only reaches that port through the host network.
- The bridge uses a dedicated SSH key, separate from the admin key.

## Setup

1. Copy `bridge/.env.example` to `bridge/.env`.
2. Ensure the SSH key path in `BRIDGE_SSH_KEY` points to the local bridge key.
3. Make sure the public key is authorized on the VPS.
4. Confirm `adb devices -l` sees the phone locally.

## Run

```bash
npm run bridge
```

## Auto-Start with systemd

To keep the bridge running automatically on boot:

```bash
sudo cp bridge/aion-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aion-bridge
sudo systemctl start aion-bridge
```

Check status:

```bash
sudo systemctl status aion-bridge
journalctl -u aion-bridge -f
```

## Health Check

The bridge runs a health check every 30 seconds (configurable via `BRIDGE_HEALTH_CHECK_INTERVAL`).

It verifies:
- Local ADB server is reachable (auto-restarts if not)
- SSH tunnel process is alive
- Periodic summary every 10 checks (uptime, reconnects, failures)

## Reconnection

If the SSH tunnel drops, the bridge reconnects with exponential backoff:
- First retry: 5s
- Subsequent retries: 10s, 20s, 40s... up to 60s max
- Configurable via `BRIDGE_RECONNECT_DELAY` and `BRIDGE_MAX_RECONNECT_DELAY`

## Expected Result

- Local workstation: `adb devices` shows the phone.
- VPS: AION sees the same phone through the forwarded ADB port.
- Remote app: `http://31.97.83.152:3002`

