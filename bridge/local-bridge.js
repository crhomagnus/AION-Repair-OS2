const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const cfg = {
    sshHost: process.env.BRIDGE_SSH_HOST,
    sshUser: process.env.BRIDGE_SSH_USER || 'root',
    sshPort: Number(process.env.BRIDGE_SSH_PORT || 22),
    sshKey: process.env.BRIDGE_SSH_KEY || path.join(process.env.HOME || '', '.ssh', 'aion_bridge_ed25519'),
    remoteBind: process.env.BRIDGE_REMOTE_BIND || '127.0.0.1',
    remotePort: Number(process.env.BRIDGE_REMOTE_PORT || 5037),
    localBind: process.env.BRIDGE_LOCAL_BIND || '127.0.0.1',
    localPort: Number(process.env.BRIDGE_LOCAL_PORT || 5037),
    adbBin: process.env.BRIDGE_ADB_BIN || 'adb',
    sshBin: process.env.BRIDGE_SSH_BIN || 'ssh',
    keepAliveInterval: Number(process.env.BRIDGE_KEEPALIVE_INTERVAL || 15),
    keepAliveCountMax: Number(process.env.BRIDGE_KEEPALIVE_COUNT_MAX || 3)
};

function fail(message) {
    console.error(`[bridge] ${message}`);
    process.exit(1);
}

function assertConfig() {
    if (!cfg.sshHost) fail('BRIDGE_SSH_HOST is required');
    if (!fs.existsSync(cfg.sshKey)) fail(`SSH key not found: ${cfg.sshKey}`);
}

function runAdb(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cfg.adbBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(stderr.trim() || `adb ${args.join(' ')} failed with code ${code}`));
        });
    });
}

async function ensureAdbServer() {
    try {
        await runAdb(['start-server']);
        const { stdout } = await runAdb(['devices', '-l']);
        console.log('[bridge] ADB server is ready');
        console.log(stdout.trim() || '[bridge] no devices reported yet');
    } catch (err) {
        fail(`ADB server check failed: ${err.message}`);
    }
}

function launchTunnel() {
    const target = `${cfg.remoteBind}:${cfg.remotePort}:${cfg.localBind}:${cfg.localPort}`;
    const args = [
        '-i', cfg.sshKey,
        '-p', String(cfg.sshPort),
        '-N',
        '-T',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', `ServerAliveInterval=${cfg.keepAliveInterval}`,
        '-o', `ServerAliveCountMax=${cfg.keepAliveCountMax}`,
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'LogLevel=ERROR',
        '-R', target,
        `${cfg.sshUser}@${cfg.sshHost}`
    ];

    console.log(`[bridge] opening SSH tunnel to ${cfg.sshUser}@${cfg.sshHost}:${cfg.sshPort}`);
    console.log(`[bridge] remote port ${cfg.remoteBind}:${cfg.remotePort} -> local ${cfg.localBind}:${cfg.localPort}`);

    const child = spawn(cfg.sshBin, args, { stdio: 'inherit' });

    child.on('error', err => {
        console.error(`[bridge] SSH error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
        if (stopping) return;
        console.error(`[bridge] SSH tunnel exited (${signal || code}). Reconnecting in 3s...`);
        setTimeout(launchTunnel, 3000);
    });

    return child;
}

let stopping = false;
let tunnel = null;

async function main() {
    assertConfig();
    await ensureAdbServer();
    tunnel = launchTunnel();
}

function shutdown(signal) {
    stopping = true;
    console.log(`[bridge] received ${signal}, shutting down`);
    if (tunnel && !tunnel.killed) {
        tunnel.kill('SIGTERM');
    }
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => fail(err.message));
