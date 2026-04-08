const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('crypto');
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
        
        this.port = process.env.PORT || 3001;
        
        this.sessions = new Map();
        this.actionLog = [];
        this.captureJobs = new Map();

        this._setupRoutes();
        this._setupWS();
        this._startTelemetry();
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

        // === SESSION MANAGEMENT (PRD) ===
        this.app.post('/api/sessions', async (req, res) => {
            const { channel, device_station_id, mode, consent } = req.body;
            
            if (!device_station_id) {
                return res.status(400).json({ error: 'device_station_id required' });
            }

            const sessionId = 'session_' + uuidv4();
            const session = {
                id: sessionId,
                channel: channel || 'web',
                user_id: req.body.user_id || 'anonymous',
                device_station_id,
                mode: mode || 'diagnostic',
                status: 'open',
                consent: consent || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            this.sessions.set(sessionId, session);
            this._logAction(sessionId, 'SESSION_CREATED', { mode, consent }, 'LOW');

            // Connect device
            try {
                const deviceInfo = await this.adb.connect(device_station_id);
                session.device_info = deviceInfo;
                await this.sensors.start();
            } catch (err) {
                console.warn('[Session] Device connection warning:', err.message);
            }

            res.status(201).json({ sessionId, ...session });
        });

        this.app.get('/api/sessions/:id', (req, res) => {
            const session = this.sessions.get(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            res.json(session);
        });

        this.app.patch('/api/sessions/:id', (req, res) => {
            const session = this.sessions.get(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            
            if (req.body.status) session.status = req.body.status;
            if (req.body.mode) session.mode = req.body.mode;
            session.updated_at = new Date().toISOString();
            
            res.json(session);
        });

        // === DEVICE MANAGEMENT ===
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'operational',
                version: '7.0.0',
                mode: 'AGENTIC',
                uptime: process.uptime(),
                device: this.adb.deviceInfo,
                aiMode: this.ai.offline ? 'OFFLINE' : 'ONLINE',
                aiModel: this.ai.model,
                activeSessions: this.sessions.size,
                policyEngine: {
                    status: 'ACTIVE',
                    allowList: true,
                    denyList: true,
                    humanConfirm: 'HIGH-RISK'
                }
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

        // === TYPED ACTION API (PRD) ===
        this.app.post('/api/actions/dispatch', async (req, res) => {
            const { session_id, action_type, payload } = req.body;
            
            if (!action_type) {
                return res.status(400).json({ error: 'action_type required' });
            }

            const session = session_id ? this.sessions.get(session_id) : null;
            const riskLevel = this._getRiskLevel(action_type, payload);

            // HIGH risk requires explicit session
            if (riskLevel === 'HIGH' && !session) {
                return res.status(403).json({ 
                    error: 'HIGH risk actions require active session',
                    riskLevel 
                });
            }

            const result = await this._executeTypedAction(action_type, payload);

            // Log action
            this._logAction(session_id, action_type, payload, riskLevel);

            this.broadcast({ 
                type: 'action_executed', 
                action_type, 
                riskLevel,
                result 
            });

            res.json({ 
                accepted: true, 
                action_type, 
                riskLevel,
                result 
            });
        });

        // === COMMAND EXECUTION ===
        this.app.post('/api/execute', async (req, res) => {
            const { command, sessionId } = req.body;
            if (!command) return res.status(400).json({ error: 'command required' });
            
            try {
                if (command.trim() === 'help') {
                    return res.json({
                        success: true,
                        result: this._getHelpText()
                    });
                }
                
                const validation = this.validator.validateWithRisk(command);
                
                if (!validation.allowed) {
                    this._logAction(sessionId, 'BLOCKED', { command, reason: 'Policy denied' }, 'HIGH');
                    return res.status(403).json({ 
                        error: 'Command blocked by policy', 
                        command,
                        reason: validation.reason
                    });
                }

                // Check session mode for HIGH risk commands
                if (validation.risk === 'HIGH' && sessionId) {
                    const session = this.sessions.get(sessionId);
                    if (!session || session.mode === 'diagnostic') {
                        return res.status(403).json({ 
                            error: 'Command requires REPAIR or FORENSIC session mode',
                            command,
                            currentMode: session?.mode || 'none'
                        });
                    }
                }

                const result = await this.adb.execute(command);
                this._logAction(sessionId, 'EXECUTE', { command, risk: validation.risk }, validation.risk);
                this.broadcast({ type: 'adb_log', command, result, risk: validation.risk });
                res.json({ success: true, result, risk: validation.risk });
            } catch (err) { res.status(500).json({ error: err.message }); }
        });

        // === CHAT WITH AGENTIC AI ===
        this.app.post('/api/chat', async (req, res) => {
            const { message, sessionId, context } = req.body;
            if (!message) return res.status(400).json({ error: 'message required' });
            
            try {
                const sensorData = this.sensors.getState();
                const session = sessionId ? this.sessions.get(sessionId) : null;
                
                const result = await this.ai.chat(message, sensorData, {
                    session,
                    mode: context?.mode || 'diagnostic',
                    device: context?.device
                });

                this.broadcast({ type: 'chat_response', ...result });
                res.json({
                    ...result,
                    sessionId,
                    actions: result.suggestedActions || []
                });
            } catch (err) { res.status(500).json({ error: err.message }); }
        });

        // === AI CONFIG ===
        this.app.get('/api/ai/status', (req, res) => {
            res.json({
                offline: this.ai.offline,
                model: this.ai.model,
                hasKey: Boolean(this.ai.apiKey),
                policyEngine: {
                    allowList: true,
                    denyList: true,
                    humanConfirm: ['HIGH']
                }
            });
        });

        this.app.post('/api/ai/key', (req, res) => {
            const { key, model } = req.body;
            if (key) this.ai.setApiKey(key);
            if (model) this.ai.model = model;
            res.json({ success: true, offline: this.ai.offline, model: this.ai.model });
        });

        // === TELEMETRY ===
        this.app.get('/api/sensors', (req, res) => {
            res.json(this.sensors.getState());
        });

        // === AUDIT LOG ===
        this.app.get('/api/audit', (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            res.json(this.actionLog.slice(-limit));
        });

        this.app.get('/api/audit/session/:sessionId', (req, res) => {
            const logs = this.actionLog.filter(log => log.session_id === req.params.sessionId);
            res.json(logs);
        });

        // === FORENSIC CAPTURE ===
        this.app.post('/api/capture/forensic', async (req, res) => {
            if (!this.adb.isConnected()) return res.status(400).json({ error: 'No device connected' });
            try {
                const { type, sessionId } = req.body || {};
                const jobId = 'cap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                this.captureJobs.set(jobId, { 
                    progress: 0, 
                    status: 'Iniciando captura...', 
                    done: false, 
                    error: null, 
                    result: null,
                    sessionId
                });
                this._runCaptureJob(jobId, type || 'basic').catch((err) => {
                    const job = this.captureJobs.get(jobId);
                    if (job) {
                        job.error = err.message;
                        job.done = true;
                        job.status = 'Falha na captura';
                    }
                });
                this._logAction(sessionId, 'FORENSIC_CAPTURE_START', { type }, 'MEDIUM');
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
            ws.send(JSON.stringify({ 
                type: 'connected', 
                mode: this.ai.offline ? 'OFFLINE' : 'ONLINE',
                version: '7.0.0'
            }));

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
            case 'dispatch': {
                const result = await this._executeTypedAction(data.action_type, data.payload);
                ws.send(JSON.stringify({ type: 'action_result', result }));
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

    broadcast(msg) {
        const payload = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    }

    _getRiskLevel(actionType, payload) {
        const highRisk = ['FACTORY_RESET', 'REBOOT', 'WIPE_DATA', 'INSTALL_UNKNOWN'];
        const mediumRisk = ['PM_CLEAR', 'PM_DISABLE', 'FORCE_STOP', 'SETPROP'];
        
        if (highRisk.includes(actionType)) return 'HIGH';
        if (mediumRisk.includes(actionType)) return 'MEDIUM';
        return 'LOW';
    }

    async _executeTypedAction(actionType, payload) {
        const actionMap = {
            'GET_PROPS': () => this.adb.execute('getprop'),
            'DUMPSYS_BATTERY': () => this.adb.execute('dumpsys battery'),
            'DUMPSYS_MEMINFO': () => this.adb.execute('dumpsys meminfo'),
            'DUMPSYS_WIFI': () => this.adb.execute('dumpsys wifi'),
            'LIST_PACKAGES': () => this.adb.execute('pm list packages'),
            'GET_CPU': () => this.adb.execute('cat /proc/stat'),
            'GET_MEMORY': () => this.adb.execute('cat /proc/meminfo'),
            'GET_TEMP': () => this.adb.execute('cat /sys/class/thermal/thermal_zone*/temp'),
            'CAPTURE_SCREENSHOT': () => this.adb.execute('screencap -p /sdcard/aion_screen.png'),
            'GET_PROCESSES': () => this.adb.execute('ps -A'),
            'GET_DISK': () => this.adb.execute('df -h'),
            'SHELL_SAFE': () => payload?.command ? this.adb.execute(payload.command) : Promise.reject(new Error('No command'))
        };

        const handler = actionMap[actionType];
        if (!handler) {
            throw new Error(`Unknown action type: ${actionType}`);
        }

        return await handler();
    }

    _logAction(sessionId, actionType, payload, riskLevel) {
        const log = {
            id: uuidv4(),
            session_id: sessionId,
            action_type: actionType,
            payload,
            risk_level: riskLevel,
            status: 'logged',
            timestamp: new Date().toISOString()
        };
        this.actionLog.push(log);
        
        // Keep only last 1000 entries
        if (this.actionLog.length > 1000) {
            this.actionLog = this.actionLog.slice(-1000);
        }
    }

    _getHelpText() {
        return [
            '═══════════════════════════════════════════',
            '  AION Repair OS V7.0 - Comandos Disponíveis',
            '═══════════════════════════════════════════',
            '',
            'DIAGNÓSTICO (LOW RISK):',
            '  - dumpsys battery',
            '  - dumpsys meminfo',
            '  - dumpsys wifi',
            '  - dumpsys telephony.registry',
            '  - cat /proc/stat',
            '  - cat /proc/meminfo',
            '  - df -h',
            '  - ps -A',
            '  - getprop',
            '',
            'REPARO (MEDIUM RISK - Requer modo REPAIR):',
            '  - pm clear <package>',
            '  - am force-stop <package>',
            '  - svc wifi enable/disable',
            '',
            'FORENSE (Retém dados):',
            '  - screencap -p /sdcard/file.png',
            '  - logcat -d -t 200',
            '',
            'Policy Engine: ATIVO',
            '═══════════════════════════════════════════'
        ].join('\n');
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
            const results = { 
                timestamp: new Date().toISOString(), 
                device: this.adb.deviceInfo,
                type 
            };
            
            update(10, 'Coletando bateria...');
            results.battery = await this._safeExec('dumpsys battery');
            
            update(20, 'Lendo memoria...');
            results.memory = await this._safeExec('cat /proc/meminfo');
            
            update(30, 'Lendo CPU...');
            results.cpu = await this._safeExec('cat /proc/stat');
            
            update(40, 'Lendo processos...');
            results.processes = await this._safeExec('ps -A');
            
            update(50, 'Lendo armazenamento...');
            results.disk = await this._safeExec('df -h');
            
            update(60, 'Lendo sensores...');
            results.thermal = await this._safeExec('cat /sys/class/thermal/thermal_zone*/temp');
            
            update(80, 'Gerando screenshot...');
            results.screenshot = await this._safeExec('screencap -p /sdcard/aion_capture.png');
            
            if (type === 'full') {
                update(90, 'Lendo logcat...');
                results.logcat = await this._safeExec('logcat -d -t 200');
                results.packages = await this._safeExec('pm list packages -3');
            }
            
            job.progress = 100;
            job.status = 'Captura concluida';
            job.done = true;
            job.result = results;
            
            this._logAction(job.sessionId, 'FORENSIC_CAPTURE_COMPLETE', { type }, 'MEDIUM');
        } catch (err) {
            job.error = err.message;
            job.done = true;
            job.status = 'Falha na captura';
        }
    }

    start() {
        this.server.listen(this.port, () => {
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║         AION REPAIR OS V7.0 - AGENTIC MODE           ║');
            console.log('╠═══════════════════════════════════════════════════════╣');
            console.log(`║  Dashboard:    http://localhost:${this.port}                   ║`);
            console.log(`║  AI Mode:      ${this.ai.offline ? 'OFFLINE (smart local)' : 'ONLINE (' + this.ai.model + ')'}    ║`);
            console.log(`║  Policy:       ACTIVE (Allow/Deny + Human Confirm)  ║`);
            console.log(`║  Sessions:     ${String(this.sessions.size).padStart(3)} active                         ║`);
            console.log('╚═══════════════════════════════════════════════════════╝');
            console.log('');
        });
    }
}

module.exports = AIONServer;
