const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Set a known port for testing
process.env.PORT = '3099';
process.env.HOST = '127.0.0.1';

function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:3099${path}`, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, body });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function httpPost(path, data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request(`http://127.0.0.1:3099${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let resBody = '';
            res.on('data', (chunk) => { resBody += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(resBody) });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, body: resBody });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

describe('Server integration', () => {
    let AIONServer;
    let serverInstance;

    before(async () => {
        AIONServer = require('../server/index');
        serverInstance = new AIONServer();
        await new Promise((resolve) => {
            serverInstance.server.listen(3099, '127.0.0.1', resolve);
        });
    });

    after(async () => {
        if (serverInstance?.sensors) serverInstance.sensors.stop();
        if (serverInstance?.server) {
            await new Promise((resolve) => serverInstance.server.close(resolve));
        }
        // Stop tracking AFTER server close to prevent reconnect loop
        if (serverInstance?.adb) serverInstance.adb.stopTracking();
    });

    describe('GET /api/health', () => {
        it('returns health status', async () => {
            const res = await httpGet('/api/health');
            assert.ok([200, 503].includes(res.status));
            assert.ok(res.body.status);
            assert.ok(res.body.version);
            assert.ok(typeof res.body.uptime === 'number');
            assert.ok(res.body.checks);
        });
    });

    describe('GET /api/status', () => {
        it('returns operational status with version', async () => {
            const res = await httpGet('/api/status');
            assert.equal(res.status, 200);
            assert.equal(res.body.status, 'operational');
            assert.ok(res.body.version);
            assert.ok(res.body.policyEngine);
        });
    });

    describe('GET /api/devices', () => {
        it('returns a list (possibly empty)', async () => {
            const res = await httpGet('/api/devices');
            // May fail if ADB not available, but should not crash
            assert.ok([200, 500].includes(res.status));
        });
    });

    describe('GET /api/sensors', () => {
        it('returns sensor state', async () => {
            const res = await httpGet('/api/sensors');
            assert.equal(res.status, 200);
        });
    });

    describe('GET /api/audit', () => {
        it('returns audit log array', async () => {
            const res = await httpGet('/api/audit');
            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
        });
    });

    describe('GET /api/ai/status', () => {
        it('returns AI config', async () => {
            const res = await httpGet('/api/ai/status');
            assert.equal(res.status, 200);
            assert.ok('configured' in res.body);
            assert.ok('model' in res.body);
        });
    });

    describe('POST /api/chat', () => {
        it('rejects empty message', async () => {
            const res = await httpPost('/api/chat', {});
            assert.equal(res.status, 400);
            assert.ok(res.body.error);
        });
    });

    describe('POST /api/execute', () => {
        it('rejects empty command', async () => {
            const res = await httpPost('/api/execute', {});
            assert.equal(res.status, 400);
        });

        it('blocks injection attempt', async () => {
            const res = await httpPost('/api/execute', { command: 'echo $(whoami)' });
            assert.equal(res.status, 403);
        });

        it('blocks unknown commands', async () => {
            const res = await httpPost('/api/execute', { command: 'curl http://evil.com' });
            assert.equal(res.status, 403);
        });
    });

    describe('Security headers', () => {
        it('includes security headers', async () => {
            const res = await httpGet('/api/status');
            assert.equal(res.headers['x-content-type-options'], 'nosniff');
            assert.equal(res.headers['x-frame-options'], 'DENY');
        });
    });

    describe('POST /api/ai/key (admin protection)', () => {
        it('allows without admin token when ADMIN_TOKEN is not set', async () => {
            const res = await httpPost('/api/ai/key', { model: 'test-model' });
            // Should succeed since ADMIN_TOKEN is not set in test env
            assert.equal(res.status, 200);
        });
    });

    describe('POST /api/sessions', () => {
        it('rejects without device_station_id', async () => {
            const res = await httpPost('/api/sessions', {});
            assert.equal(res.status, 400);
        });

        it('creates a session with device_station_id', async () => {
            const res = await httpPost('/api/sessions', { device_station_id: 'test-device' });
            assert.equal(res.status, 201);
            assert.ok(res.body.sessionId);
            assert.ok(res.body.id);
        });
    });
});
