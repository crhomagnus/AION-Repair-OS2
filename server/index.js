const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const AdbBridge = require('./adb-bridge');
const SensorPoller = require('./sensor-poller');
const CmdValidator = require('./cmd-validator');
const AiAgent = require('./ai-agent');
const AiExecutor = require('./ai-executor');

class AIONServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.clients = new Set();

        this.adb = new AdbBridge();
        this.sensors = new SensorPoller(this.adb);
        this.validator = new CmdValidator();
        this.ai = new AiAgent(this.adb, this.validator);
        this.executor = new AiExecutor(this.sensors, this.validator, this.adb);
        this.autonomousEnabled = false;
        this.captureJobs = new Map();

        this.port = process.env.PORT || 3001;
        this._setupRoutes();
        this._setupWS();
        this._startTelemetry();
        this._startAutonomousCycle();
    }

    _setupRoutes() {
        this.app.use(express.static(path.join(__dirname, '../web'), {
            setHeaders: (res) => {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }));
        this.app.use(express.json());

        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'operational',
                uptime: process.uptime(),
                device: this.adb.deviceInfo,
                aiMode: this.ai.offline ? 'OFFLINE' : 'ONLINE',
                aiModel: this.ai.model
            });
        });

        this.app.get('/api/devices', async (req, res) => {
            try { res.json(await this.adb.listDevices()); }
            catch (err) { res.status(500).json({ error: err.message }); }
        });

        this.app.post('/api/connect', async (req, res) => {
            const { deviceId } = req.body;
            if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
            try {
                const info = await this.adb.connect(deviceId);
                await this.sensors.start();
                this.broadcast({ type: 'device_connected', device: info });
                res.json({ success: true, device: info });
            } catch (err) { res.status(500).json({ error: err.message }); }
        });

        this.app.post('/api/execute', async (req, res) => {
            const { command } = req.body;
            if (!command) return res.status(400).json({ error: 'command required' });
            try {
                if (command.trim() === 'help') {
                    return res.json({
                        success: true,
                        result: [
                            'Comandos suportados pelo terminal AION:',
                            '- dumpsys battery',
                            '- dumpsys meminfo',
                            '- dumpsys wifi',
                            '- dumpsys media.camera',
                            '- cat /proc/stat',
                            '- cat /proc/meminfo',
                            '- df -h /data',
                            '- top -n 1 -b',
                            '- ps -A',
                            '- getprop',
                            '- screencap -p /sdcard/file.png'
                        ].join('\n')
                    });
                }
                if (!this.validator.validate(command)) {
                    return res.status(403).json({ error: 'Command blocked', command });
                }
                const result = await this.adb.execute(command);
                this.broadcast({ type: 'adb_log', command, result });
                res.json({ success: true, result });
            } catch (err) { res.status(500).json({ error: err.message }); }
        });

        this.app.post('/api/chat', async (req, res) => {
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'message required' });
            try {
                const result = await this.ai.chat(message, this.sensors.getState());
                this.broadcast({ type: 'chat_response', ...result });
                res.json(result);
            } catch (err) { res.status(500).json({ error: err.message }); }
        });

        this.app.get('/api/ai/status', (req, res) => {
            res.json({
                offline: this.ai.offline,
                model: this.ai.model,
                hasKey: Boolean(this.ai.apiKey),
                autonomousEnabled: this.autonomousEnabled
            });
        });

        this.app.post('/api/ai/key', (req, res) => {
            const { key, model } = req.body;
            if (key) this.ai.setApiKey(key);
            if (model) this.ai.model = model;
            res.json({ success: true, offline: this.ai.offline, model: this.ai.model });
        });

        this.app.get('/api/sensors', (req, res) => {
            res.json(this.sensors.getState());
        });

        this.app.get('/api/executor/status', (req, res) => {
            try {
                res.json(this.executor.getStatus());
            } catch (err) {
                res.json({ mode: 'MASTER_EXECUTOR', cycle: 0, actionsExecuted: 0 });
            }
        });

        this.app.post('/api/capture/forensic', async (req, res) => {
            if (!this.adb.isConnected()) return res.status(400).json({ error: 'No device connected' });
            try {
                const { type } = req.body || {};
                const jobId = 'cap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                this.captureJobs.set(jobId, { progress: 0, status: 'Iniciando captura...', done: false, error: null, result: null });
                this._runCaptureJob(jobId, type || 'basic').catch((err) => {
                    const job = this.captureJobs.get(jobId);
                    if (job) {
                        job.error = err.message;
                        job.done = true;
                        job.status = 'Falha na captura';
                    }
                });
                res.json({ success: true, jobId });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        this.app.get('/api/capture/forensic/:jobId', (req, res) => {
            const job = this.captureJobs.get(req.params.jobId);
            if (!job) return res.status(404).json({ error: 'Job not found' });
            res.json(job);
        });
    }

    _setupWS() {
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            ws.send(JSON.stringify({ type: 'connected', mode: this.ai.offline ? 'OFFLINE' : 'ONLINE' }));

            ws.on('message', async (raw) => {
                try {
                    const data = JSON.parse(raw);
                    await this._handleWS(ws, data);
                } catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' })); }
            });

            ws.on('close', () => this.clients.delete(ws));
        });
    }

    async _handleWS(ws, data) {
        switch (data.type) {
            case 'chat': {
                const result = await this.ai.chat(data.message, this.sensors.getState());
                ws.send(JSON.stringify({ type: 'chat_response', ...result }));
                break;
            }
            case 'connect': {
                try {
                    const info = await this.adb.connect(data.deviceId);
                    await this.sensors.start();
                    ws.send(JSON.stringify({ type: 'device_connected', device: info }));
                } catch (err) { ws.send(JSON.stringify({ type: 'error', message: err.message })); }
                break;
            }
            case 'set_api_key': {
                if (data.key) this.ai.setApiKey(data.key);
                if (data.model) this.ai.model = data.model;
                ws.send(JSON.stringify({ type: 'ai_config', offline: this.ai.offline, model: this.ai.model }));
                break;
            }
            case 'ping': ws.send(JSON.stringify({ type: 'pong' })); break;
        }
    }

    _startTelemetry() {
        this.sensors.on('data', (data) => this.broadcast({ type: 'telemetry', data }));
    }

    _startAutonomousCycle() {
        setInterval(async () => {
            if (!this.autonomousEnabled || !this.adb.isConnected() || !this.sensors.running) return;
            try {
                const state = this.sensors.getState();
                if (this.executor.shouldAct(state)) {
                    const actions = this.executor.decide(state);
                    const history = this.executor.getHistory().slice(-3);
                    this.broadcast({
                        type: 'executor_action',
                        cycle: this.executor.cycle,
                        actions,
                        thoughts: history,
                        state
                    });
                    for (const cmd of actions) {
                        try {
                            const result = await this.adb.execute(cmd);
                            this.broadcast({ type: 'adb_log', command: cmd, result });
                        } catch (err) {
                            this.broadcast({ type: 'adb_log', command: cmd, result: 'Erro: ' + err.message });
                        }
                    }
                }
            } catch {}
        }, 10000);
    }

    broadcast(msg) {
        const payload = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    }

    async _safeExec(cmd) {
        try {
            return await this.adb.execute(cmd);
        } catch (err) {
            return 'Error: ' + err.message;
        }
    }

    async _runCaptureJob(jobId, type) {
        const job = this.captureJobs.get(jobId);
        if (!job) return;
        const update = (progress, status) => {
            job.progress = progress;
            job.status = status;
        };
        try {
            const results = { timestamp: new Date().toISOString(), device: this.adb.deviceInfo };
            update(10, 'Coletando bugreport resumido...');
            results.bugreport = await this._safeExec('dumpsys battery');
            update(20, 'Lendo memoria...');
            results.memory = await this._safeExec('cat /proc/meminfo');
            update(30, 'Lendo CPU...');
            results.cpu = await this._safeExec('cat /proc/stat');
            update(40, 'Lendo processos...');
            results.processes = await this._safeExec('ps -A');
            update(50, 'Lendo armazenamento...');
            results.disk = await this._safeExec('df -h');
            update(60, 'Lendo bateria...');
            results.battery = await this._safeExec('dumpsys battery');
            update(70, 'Lendo conectividade...');
            results.network = await this._safeExec('dumpsys connectivity');
            update(80, 'Lendo sensores termicos...');
            results.thermal = await this._safeExec('cat /sys/class/thermal/thermal_zone*/temp');
            update(90, 'Gerando screenshot...');
            results.screenshot = await this._safeExec('screencap -p /sdcard/aion_capture.png && echo "Screenshot saved to /sdcard/aion_capture.png"');
            if (type === 'full') {
                update(94, 'Lendo logcat...');
                results.logcat = await this._safeExec('logcat -d -t 200');
                update(97, 'Lendo pacotes e top...');
                results.packages = await this._safeExec('pm list packages -3');
                results.top = await this._safeExec('top -n 1 -b');
            }
            job.progress = 100;
            job.status = 'Captura concluida';
            job.done = true;
            job.result = results;
        } catch (err) {
            job.error = err.message;
            job.done = true;
            job.status = 'Falha na captura';
        }
    }

    start() {
        this.server.listen(this.port, () => {
            console.log('');
            console.log('╔═══════════════════════════════════════════════════╗');
            console.log('║         AION REPAIR OS V7.0 - MESTRE EXECUTOR    ║');
            console.log('╠═══════════════════════════════════════════════════╣');
            console.log(`║  Dashboard:  http://localhost:${this.port}                 ║`);
            console.log(`║  AI Mode:    ${this.ai.offline ? 'OFFLINE (smart local)' : 'ONLINE (' + this.ai.model + ')'}   ║`);
            console.log('╚═══════════════════════════════════════════════════╝');
            console.log('');
        });
    }
}

module.exports = AIONServer;
