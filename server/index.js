const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const AdbBridge = require('./adb-bridge');
const SensorPoller = require('./sensor-poller');
const CmdValidator = require('./cmd-validator');
const AiAgent = require('./ai-agent');
const AiExecutor = require('./ai-executor');
const { createLogger } = require('./logger');
const createStore = require('./store');
const { version: appVersion } = require('../package.json');

const log = createLogger('server');

class AIONServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.clients = new Set();

        this.store = createStore();
        this.adb = new AdbBridge();
        this.sensors = new SensorPoller(this.adb);
        this.validator = new CmdValidator();
        this.ai = new AiAgent(this.adb, this.validator, (msg) => this.broadcast(msg), this.store);
        this.executor = new AiExecutor(this.sensors, this.validator, this.adb);

        this.port = Number(process.env.PORT) || 3001;
        this.host = process.env.HOST || '127.0.0.1';
        this.adminToken = process.env.ADMIN_TOKEN || null;
        this.apiToken = process.env.API_TOKEN || null;
        this.corsOrigin = process.env.CORS_ORIGIN || null;

        this.captureJobs = new Map();
        this._startedAt = Date.now();

        // Rate limiting state
        this._rateLimits = new Map();
        this._rateLimitWindow = Number(process.env.RATE_LIMIT_WINDOW || 60000);
        this._rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 30);

        // Rate limiter cleanup — prevent unbounded Map growth
        this._rateLimitCleanup = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this._rateLimits) {
                if (now - entry.windowStart > this._rateLimitWindow * 2) {
                    this._rateLimits.delete(key);
                }
            }
        }, this._rateLimitWindow);

        // Startup security validation
        if (process.env.NODE_ENV === 'production') {
            if (!this.adminToken) log.warn('ADMIN_TOKEN not set — admin endpoints are unprotected');
            if (!this.apiToken) log.warn('API_TOKEN not set — all endpoints are open without authentication');
        }

        this._setupRoutes();
        this._setupWS();
        this._startTelemetry();
        this._startDeviceTracking();
    }

    _requireAuth(req, res, next) {
        if (!this.apiToken) return next();
        const token = req.headers['authorization']?.replace('Bearer ', '')
                    || req.headers['x-api-token'];
        if (token !== this.apiToken) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    }

    _requireAdmin(req, res, next) {
        if (!this.adminToken) return next();
        const token = req.headers['x-admin-token'];
        if (token !== this.adminToken) {
            log.warn('Admin auth failed', { ip: req.ip });
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    }

    _rateLimit(key, req, res, next) {
        const ip = req.ip || req.socket.remoteAddress;
        const id = `${key}:${ip}`;
        const now = Date.now();
        let entry = this._rateLimits.get(id);
        if (!entry || now - entry.windowStart > this._rateLimitWindow) {
            entry = { windowStart: now, count: 0 };
            this._rateLimits.set(id, entry);
        }
        entry.count++;
        if (entry.count > this._rateLimitMax) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    }

    _setupRoutes() {
        // CORS
        this.app.use((req, res, next) => {
            const allowed = this.corsOrigin || req.headers.origin || `http://localhost:${this.port}`;
            res.setHeader('Access-Control-Allow-Origin', allowed);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, X-API-Token, Authorization');
            if (req.method === 'OPTIONS') return res.status(204).end();
            next();
        });

        // Security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });

        this.app.use(express.static(path.join(__dirname, '../web'), {
            setHeaders: (res) => {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }));
        this.app.use(express.json({ limit: '1mb' }));

        // Auth middleware — applies to all /api/* except /api/health
        this.app.use('/api', (req, res, next) => {
            if (req.path === '/health') return next();
            this._requireAuth(req, res, next);
        });

        // === HEALTH CHECK ===
        this.app.get('/api/health', (req, res) => {
            const adbOk = this.adb.isConnected();
            const aiOk = Boolean(this.ai.apiKey);
            res.status(adbOk || aiOk ? 200 : 503).json({
                status: adbOk || aiOk ? 'healthy' : 'degraded',
                version: appVersion,
                uptime: Math.round((Date.now() - this._startedAt) / 1000),
                checks: {
                    adb: adbOk ? 'connected' : 'disconnected',
                    ai: aiOk ? 'configured' : 'unconfigured',
                    websocket: `${this.clients.size} clients`
                }
            });
        });

        // === SESSION MANAGEMENT (PRD) ===
        const VALID_MODES = ['diagnostic', 'repair', 'forensic'];
        const VALID_STATUSES = ['open', 'closed', 'paused'];

        this.app.post('/api/sessions', (req, res, next) => this._rateLimit('sessions', req, res, next), async (req, res) => {
            const { channel, device_station_id, mode, consent } = req.body;

            if (!device_station_id) {
                return res.status(400).json({ error: 'device_station_id required' });
            }
            if (mode && !VALID_MODES.includes(mode)) {
                return res.status(400).json({ error: `Invalid mode. Valid: ${VALID_MODES.join(', ')}` });
            }

            const sessionId = 'session_' + crypto.randomUUID();
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

            await this.store.setSession(sessionId, session);
            this._logAction(sessionId, 'SESSION_CREATED', { mode, consent }, 'LOW');

            // Connect device
            try {
                const deviceInfo = await this.adb.connect(device_station_id);
                session.device_info = deviceInfo;
                await this.sensors.start();
            } catch (err) {
                log.warn('Device connection warning', { error: err.message });
            }

            res.status(201).json({ sessionId, ...session });
        });

        this.app.get('/api/sessions/:id', async (req, res) => {
            const session = await this.store.getSession(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            res.json(session);
        });

        this.app.patch('/api/sessions/:id', async (req, res) => {
            const session = await this.store.getSession(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });

            if (req.body.mode && !VALID_MODES.includes(req.body.mode)) {
                return res.status(400).json({ error: `Invalid mode. Valid: ${VALID_MODES.join(', ')}` });
            }
            if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
                return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
            }

            if (req.body.status) session.status = req.body.status;
            if (req.body.mode) session.mode = req.body.mode;
            session.updated_at = new Date().toISOString();

            // Cleanup AI history when session closes
            if (session.status === 'closed') {
                this.ai.clearSessionHistory(req.params.id);
            }

            res.json(session);
        });

        // === DEVICE MANAGEMENT ===
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'operational',
                version: appVersion,
                mode: 'AGENTIC',
                uptime: process.uptime(),
                device: this.adb.deviceInfo,
                aiMode: this.ai.apiKey ? 'ONLINE' : 'AI_UNAVAILABLE',
                aiModel: this.ai.model,
                activeSessions: this.store.sessionCount,
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
            catch (err) { log.error('Device list failed', { error: err.message }); res.status(500).json({ error: 'Failed to list devices' }); }
        });

        // Connection diagnostics — shows all devices including problematic ones
        this.app.get('/api/devices/diagnose', async (req, res) => {
            try { res.json(await this.adb.diagnose()); }
            catch (err) { log.error('Diagnose failed', { error: err.message }); res.status(500).json({ error: 'Diagnostic failed' }); }
        });

        // Connection status with pending devices info
        this.app.get('/api/devices/status', (req, res) => {
            res.json(this.adb.getConnectionStatus());
        });

        this.app.post('/api/connect', (req, res, next) => this._rateLimit('connect', req, res, next), async (req, res) => {
            const { deviceId } = req.body;
            if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
            try {
                const info = await this.adb.connect(deviceId);
                await this.sensors.start();
                this.broadcast({ type: 'device_connected', device: info });
                res.json({ success: true, device: info });
            } catch (err) { log.error('Connect failed', { error: err.message }); res.status(500).json({ error: 'Failed to connect device' }); }
        });

        // === TYPED ACTION API (PRD) ===
        this.app.post('/api/actions/dispatch', (req, res, next) => this._rateLimit('dispatch', req, res, next), async (req, res) => {
            const { session_id, action_type, payload } = req.body;
            
            if (!action_type) {
                return res.status(400).json({ error: 'action_type required' });
            }

            const session = session_id ? await this.store.getSession(session_id) : null;
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
            }, session_id);

            res.json({ 
                accepted: true, 
                action_type, 
                riskLevel,
                result 
            });
        });

        // === COMMAND EXECUTION ===
        this.app.post('/api/execute', (req, res, next) => this._rateLimit('execute', req, res, next), async (req, res) => {
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
                    this._logAction(sessionId, 'BLOCKED', { command, reason: validation.reason }, 'HIGH');
                    return res.status(403).json({
                        error: 'Comando inválido',
                        command,
                        reason: validation.reason
                    });
                }

                // Log risk level for audit trail
                if (validation.risk === 'HIGH' || validation.risk === 'MEDIUM') {
                    log.info('Executing user-confirmed command', { command, risk: validation.risk });
                }

                const result = await this.adb.execute(command);
                this._logAction(sessionId, 'EXECUTE', { command, risk: validation.risk }, validation.risk);
                res.json({ success: true, result, risk: validation.risk });
            } catch (err) { log.error('Execute failed', { command, error: err.message }); res.status(500).json({ error: 'Command execution failed' }); }
        });

        // === CHAT WITH AGENTIC AI ===
        this.app.post('/api/chat', (req, res, next) => this._rateLimit('chat', req, res, next), async (req, res) => {
            const { message, sessionId, context } = req.body;
            if (!message) return res.status(400).json({ error: 'message required' });
            if (message.length > 2000) return res.status(400).json({ error: 'message too long (max 2000 chars)' });
            
            try {
                const sensorData = this.sensors.getState();
                const session = sessionId ? await this.store.getSession(sessionId) : null;
                
                const result = await this.ai.chat(message, sensorData, {
                    session,
                    sessionId,
                    mode: context?.mode || 'diagnostic',
                    device: context?.device || this.adb.deviceInfo || null
                });

                res.json({
                    ...result,
                    sessionId,
                    actions: result.actions || []
                });
            } catch (err) { log.error('Chat failed', { error: err.message }); res.status(500).json({ error: err.message }); }
        });

        // === AI CONFIG ===
        this.app.get('/api/ai/status', (req, res) => {
            res.json({
                configured: Boolean(this.ai.apiKey),
                model: this.ai.model,
                policyEngine: {
                    allowList: true,
                    denyList: true,
                    humanConfirm: ['HIGH']
                }
            });
        });

        this.app.post('/api/ai/key', (req, res, next) => this._requireAdmin(req, res, next), (req, res) => {
            const { key, model } = req.body;
            if (key) this.ai.setApiKey(key, model);
            else if (model) this.ai.setModel(model);
            res.json({ success: true, configured: Boolean(this.ai.apiKey), model: this.ai.model });
        });

        // === TELEMETRY ===
        this.app.get('/api/sensors', (req, res) => {
            res.json(this.sensors.getState());
        });

        // === AUDIT LOG ===
        this.app.get('/api/audit', async (req, res) => {
            const limit = Math.min(parseInt(req.query.limit) || 100, 500);
            res.json(await this.store.getRecentAudit(limit));
        });

        this.app.get('/api/audit/session/:sessionId', async (req, res) => {
            res.json(await this.store.getSessionAudit(req.params.sessionId));
        });

        // === FORENSIC CAPTURE ===
        this.app.post('/api/capture/forensic', (req, res, next) => this._rateLimit('capture', req, res, next), async (req, res) => {
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

        // === AI EXECUTOR (opt-in autonomous mode) ===
        this.app.get('/api/executor/status', (req, res, next) => this._requireAdmin(req, res, next), (req, res) => {
            const enabled = process.env.EXECUTOR_ENABLED === 'true';
            res.json({
                enabled,
                ...this.executor.getStatus()
            });
        });

        this.app.post('/api/executor/evaluate', (req, res, next) => this._requireAdmin(req, res, next), async (req, res) => {
            if (process.env.EXECUTOR_ENABLED !== 'true') {
                return res.status(403).json({ error: 'Executor is disabled. Set EXECUTOR_ENABLED=true to enable.' });
            }
            try {
                const result = await this.executor.execute();
                this._logAction(null, 'EXECUTOR_EVALUATE', { actions: result.actions.length }, 'MEDIUM');
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }

    _setupWS() {
        this.wss.on('connection', (ws, req) => {
            // WebSocket authentication
            if (this.apiToken) {
                const url = new URL(req.url, 'http://localhost');
                const token = url.searchParams.get('token');
                if (token !== this.apiToken) {
                    ws.close(1008, 'Unauthorized');
                    return;
                }
            }

            // Rate limit WebSocket connections per IP
            const ip = req.socket.remoteAddress;
            const wsConns = [...this.clients].filter(c => c._aionIp === ip).length;
            if (wsConns >= 10) {
                ws.close(1008, 'Too many connections');
                return;
            }
            ws._aionIp = ip;

            this.clients.add(ws);
            ws._aionSessionId = null;
            ws._msgCount = 0;
            ws._msgWindowStart = Date.now();
            ws.send(JSON.stringify({
                type: 'connected',
                mode: this.ai.apiKey ? 'ONLINE' : 'AI_UNAVAILABLE',
                version: appVersion
            }));

            ws.on('message', async (raw) => {
                try {
                    // WebSocket rate limiting: 20 msgs per 10 seconds
                    const now = Date.now();
                    if (now - ws._msgWindowStart > 10000) {
                        ws._msgCount = 0;
                        ws._msgWindowStart = now;
                    }
                    ws._msgCount++;
                    if (ws._msgCount > 20) {
                        ws.close(1008, 'Rate limit exceeded');
                        return;
                    }
                    if (raw.length > 65536) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
                        return;
                    }
                    const data = JSON.parse(raw);
                    await this._handleWS(ws, data);
                } catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' })); }
            });

            ws.on('close', () => this.clients.delete(ws));
        });
    }

    async _handleWS(ws, data) {
        // Track session for broadcast filtering
        if (data.sessionId && !ws._aionSessionId) {
            ws._aionSessionId = data.sessionId;
        }

        switch (data.type) {
            case 'chat': {
                const result = await this.ai.chat(data.message, this.sensors.getState(), {
                    sessionId: data.sessionId || ws._aionSessionId,
                    device: this.adb.deviceInfo || null
                });
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
                if (this.adminToken && data.admin_token !== this.adminToken) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
                    break;
                }
                if (data.key) this.ai.setApiKey(data.key, data.model);
                else if (data.model) this.ai.setModel(data.model);
                ws.send(JSON.stringify({ type: 'ai_config', configured: Boolean(this.ai.apiKey), model: this.ai.model }));
                break;
            }
            case 'ping': ws.send(JSON.stringify({ type: 'pong' })); break;
        }
    }

    _startTelemetry() {
        this.sensors.on('data', (data) => this.broadcast({ type: 'telemetry', data }));
    }

    _startDeviceTracking() {
        this.adb.on('device_connected', (deviceInfo) => {
            log.info('Auto-detected device', { id: deviceInfo.id, model: deviceInfo.displayName || deviceInfo.model });
            this.sensors.start();
            this.broadcast({ type: 'device_connected', device: deviceInfo });
        });

        this.adb.on('device_disconnected', ({ id, previous }) => {
            log.info('Device removed', { id, model: previous?.displayName || 'unknown' });
            this.sensors.stop();
            this.broadcast({ type: 'device_disconnected', deviceId: id, device: previous });
        });

        this.adb.on('device_issue', (issue) => {
            log.warn('Device issue detected', { deviceId: issue.deviceId, title: issue.title, severity: issue.severity });
            this.broadcast({ type: 'device_issue', ...issue });
        });

        this.adb.startTracking();
    }

    broadcast(msg, sessionId = null) {
        const payload = JSON.stringify(msg);
        const isGlobal = !sessionId || ['telemetry', 'device_connected', 'device_disconnected', 'device_issue'].includes(msg.type);
        let sent = 0;
        for (const client of this.clients) {
            if (client.readyState !== WebSocket.OPEN) continue;
            if (isGlobal || client._aionSessionId === sessionId) {
                client.send(payload);
                sent++;
            }
        }
        if (msg.type === 'chat_response') {
            console.log(`[WS] Broadcast chat_response to ${sent}/${this.clients.size} clients`);
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
            'SHELL_SAFE': () => {
                if (!payload?.command) return Promise.reject(new Error('No command'));
                const v = this.validator.validateWithRisk(payload.command);
                if (!v.allowed) return Promise.reject(new Error(`Command blocked: ${v.reason}`));
                return this.adb.execute(payload.command);
            },
            'RUN_SKILL': async () => {
                if (!payload?.skill) throw new Error('No skill specified');
                return this.ai.skills.execute(payload.skill);
            },
            'BUGREPORT': async () => {
                const path = `/data/local/tmp/bugreport_${Date.now()}.zip`;
                return this.adb.bugreport(path);
            },
            'BACKUP_DEVICE': async () => {
                const path = `/data/local/tmp/backup_${Date.now()}.ab`;
                return this.adb.backup(path, { apk: true, shared: true });
            },
            'PULL_FILE': async () => {
                if (!payload?.remote) throw new Error('No remote path specified');
                const localPath = `/data/local/tmp/pulled_${Date.now()}`;
                return this.adb.pullFile(payload.remote, localPath);
            },
            'PUSH_FILE': async () => {
                if (!payload?.local || !payload?.remote) throw new Error('Missing local or remote path');
                return this.adb.pushFile(payload.local, payload.remote);
            }
        };

        const handler = actionMap[actionType];
        if (!handler) {
            throw new Error(`Unknown action type: ${actionType}`);
        }

        return await handler();
    }

    _logAction(sessionId, actionType, payload, riskLevel) {
        const log = {
            id: crypto.randomUUID(),
            session_id: sessionId,
            action_type: actionType,
            payload,
            risk_level: riskLevel,
            status: 'logged',
            timestamp: new Date().toISOString()
        };
        this.store.appendAudit(log);
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
        this.server.on('error', (err) => {
            log.error('Failed to start server', { error: err.message });
            process.exitCode = 1;
        });

        this.server.listen(this.port, this.host, () => {
            const displayHost = this.host === '0.0.0.0' ? 'localhost' : this.host;
            log.info('Server started', {
                url: `http://${displayHost}:${this.port}`,
                version: appVersion,
                aiMode: this.ai.apiKey ? 'ONLINE' : 'AI_UNAVAILABLE',
                aiModel: this.ai.model,
                policy: 'ACTIVE',
                sessions: this.store.sessionCount
            });
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║         AION REPAIR OS V7.0 - AGENTIC MODE           ║');
            console.log('╠═══════════════════════════════════════════════════════╣');
            console.log(`║  Dashboard:    http://${displayHost}:${this.port}                   ║`);
            console.log(`║  AI Mode:      ${this.ai.apiKey ? 'ONLINE (' + this.ai.model + ')' : 'AI_UNAVAILABLE'}    ║`);
            console.log(`║  Policy:       ACTIVE (Allow/Deny + Human Confirm)  ║`);
            console.log(`║  Sessions:     ${String(this.store.sessionCount).padStart(3)} active                         ║`);
            console.log('╚═══════════════════════════════════════════════════════╝');
            console.log('');
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            log.info(`Received ${signal}, shutting down gracefully...`);
            clearInterval(this._rateLimitCleanup);
            this.adb.stopTracking();
            this.sensors.stop();

            // Close all WebSocket connections
            for (const client of this.clients) {
                try { client.close(1001, 'Server shutting down'); } catch {}
            }
            this.clients.clear();

            // Close WebSocket server
            this.wss.close(() => {
                log.info('WebSocket server closed');
            });

            // Flush store
            this.store.close();

            // Close HTTP server
            this.server.close(() => {
                log.info('HTTP server closed');
                process.exit(0);
            });

            // Force exit after 10s if graceful shutdown stalls
            setTimeout(() => {
                log.warn('Graceful shutdown timed out, forcing exit');
                process.exit(1);
            }, 10000).unref();
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

module.exports = AIONServer;
