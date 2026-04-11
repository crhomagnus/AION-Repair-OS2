const { spawn } = require('child_process');
const net = require('net');
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
    keepAliveCountMax: Number(process.env.BRIDGE_KEEPALIVE_COUNT_MAX || 3),
    healthCheckInterval: Number(process.env.BRIDGE_HEALTH_CHECK_INTERVAL || 30000),
    reconnectDelay: Number(process.env.BRIDGE_RECONNECT_DELAY || 5000),
    maxReconnectDelay: Number(process.env.BRIDGE_MAX_RECONNECT_DELAY || 60000)
};

const stats = {
    startedAt: null,
    reconnects: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    healthChecks: 0,
    healthFailures: 0,
    tunnelUp: false
};

function ts() {
    return new Date().toISOString();
}

function log(msg) {
    console.log(`[${ts()}] [bridge] ${msg}`);
}

function logError(msg) {
    console.error(`[${ts()}] [bridge] ${msg}`);
}

function fail(message) {
    logError(`FATAL: ${message}`);
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
        log('ADB server is ready');
        log(stdout.trim() || 'no devices reported yet');
    } catch (err) {
        fail(`ADB server check failed: ${err.message}`);
    }
}

function checkLocalAdb() {
    return new Promise((resolve) => {
        const sock = net.createConnection({ host: cfg.localBind, port: cfg.localPort }, () => {
            sock.destroy();
            resolve(true);
        });
        sock.setTimeout(3000);
        sock.on('timeout', () => { sock.destroy(); resolve(false); });
        sock.on('error', () => resolve(false));
    });
}

async function healthCheck() {
    stats.healthChecks++;
    const adbOk = await checkLocalAdb();
    if (!adbOk) {
        stats.healthFailures++;
        logError(`HEALTH: local ADB not reachable at ${cfg.localBind}:${cfg.localPort} (failure #${stats.healthFailures})`);
        try {
            await runAdb(['start-server']);
            log('HEALTH: ADB server restarted');
        } catch (e) {
            logError(`HEALTH: failed to restart ADB server: ${e.message}`);
        }
        return;
    }
    if (!stats.tunnelUp) {
        logError(`HEALTH: tunnel is down, waiting for reconnect...`);
        return;
    }
    if (stats.healthChecks % 10 === 0) {
        log(`HEALTH: ok | uptime ${Math.round((Date.now() - stats.startedAt) / 1000)}s | reconnects ${stats.reconnects} | checks ${stats.healthChecks}`);
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

    log(`opening SSH tunnel to ${cfg.sshUser}@${cfg.sshHost}:${cfg.sshPort}`);
    log(`remote ${cfg.remoteBind}:${cfg.remotePort} -> local ${cfg.localBind}:${cfg.localPort}`);

    const child = spawn(cfg.sshBin, args, { stdio: 'inherit' });

    child.on('spawn', () => {
        stats.tunnelUp = true;
        stats.lastConnectedAt = Date.now();
        log('TUNNEL: SSH process started');
    });

    child.on('error', err => {
        stats.tunnelUp = false;
        logError(`TUNNEL: SSH error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
        stats.tunnelUp = false;
        stats.lastDisconnectedAt = Date.now();
        if (stopping) return;
        stats.reconnects++;
        const delay = Math.min(cfg.reconnectDelay * Math.pow(2, Math.min(stats.reconnects - 1, 5)), cfg.maxReconnectDelay);
        logError(`TUNNEL: exited (${signal || code}). Reconnect #${stats.reconnects} in ${delay / 1000}s...`);
        setTimeout(() => { tunnel = launchTunnel(); }, delay);
    });

    return child;
}

let stopping = false;
let tunnel = null;
let healthTimer = null;

async function main() {
    stats.startedAt = Date.now();
    assertConfig();
    await ensureAdbServer();
    tunnel = launchTunnel();
    healthTimer = setInterval(healthCheck, cfg.healthCheckInterval);
    log(`health check every ${cfg.healthCheckInterval / 1000}s`);
}

function shutdown(signal) {
    stopping = true;
    log(`received ${signal}, shutting down`);
    if (healthTimer) clearInterval(healthTimer);
    if (tunnel && !tunnel.killed) {
        tunnel.kill('SIGTERM');
    }
    const uptime = stats.startedAt ? Math.round((Date.now() - stats.startedAt) / 1000) : 0;
    log(`session summary: uptime ${uptime}s, reconnects ${stats.reconnects}, health checks ${stats.healthChecks}, failures ${stats.healthFailures}`);
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => fail(err.message));
