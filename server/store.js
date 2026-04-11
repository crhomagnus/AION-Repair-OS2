const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('store');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const MAX_AUDIT_LINES = Number(process.env.MAX_AUDIT_LINES || 5000);

class Store {
    constructor() {
        this._ensureDir();
        this._sessions = this._loadSessions();
        this._auditStream = null;
        this._auditCount = 0;
        this._openAuditStream();
    }

    _ensureDir() {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch (err) {
            log.error('Failed to create data directory', { path: DATA_DIR, error: err.message });
        }
    }

    _loadSessions() {
        try {
            if (fs.existsSync(SESSIONS_FILE)) {
                const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
                const data = JSON.parse(raw);
                log.info('Loaded sessions from disk', { count: Object.keys(data).length });
                return new Map(Object.entries(data));
            }
        } catch (err) {
            log.warn('Failed to load sessions, starting fresh', { error: err.message });
        }
        return new Map();
    }

    _saveSessions() {
        try {
            const obj = Object.fromEntries(this._sessions);
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            log.error('Failed to save sessions', { error: err.message });
        }
    }

    _openAuditStream() {
        try {
            if (fs.existsSync(AUDIT_FILE)) {
                const content = fs.readFileSync(AUDIT_FILE, 'utf8');
                this._auditCount = content.split('\n').filter(Boolean).length;
            }
            this._auditStream = fs.createWriteStream(AUDIT_FILE, { flags: 'a' });
        } catch (err) {
            log.error('Failed to open audit stream', { error: err.message });
        }
    }

    // --- Sessions ---

    getSession(id) {
        return this._sessions.get(id) || null;
    }

    setSession(id, session) {
        this._sessions.set(id, session);
        this._saveSessions();
    }

    updateSession(id, updates) {
        const session = this._sessions.get(id);
        if (!session) return null;
        Object.assign(session, updates, { updated_at: new Date().toISOString() });
        this._saveSessions();
        return session;
    }

    getAllSessions() {
        return this._sessions;
    }

    get sessionCount() {
        return this._sessions.size;
    }

    // --- Audit log ---

    appendAudit(entry) {
        if (this._auditStream) {
            this._auditStream.write(JSON.stringify(entry) + '\n');
            this._auditCount++;
            if (this._auditCount > MAX_AUDIT_LINES * 1.5) {
                this._rotateAudit();
            }
        }
    }

    getRecentAudit(limit = 100) {
        try {
            if (!fs.existsSync(AUDIT_FILE)) return [];
            const content = fs.readFileSync(AUDIT_FILE, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            return lines.slice(-limit).map(line => {
                try { return JSON.parse(line); } catch { return null; }
            }).filter(Boolean);
        } catch {
            return [];
        }
    }

    getSessionAudit(sessionId) {
        return this.getRecentAudit(5000).filter(e => e.session_id === sessionId);
    }

    _rotateAudit() {
        try {
            if (this._auditStream) {
                this._auditStream.end();
            }
            const content = fs.readFileSync(AUDIT_FILE, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            const kept = lines.slice(-MAX_AUDIT_LINES);
            fs.writeFileSync(AUDIT_FILE, kept.join('\n') + '\n', 'utf8');
            this._auditCount = kept.length;
            this._auditStream = fs.createWriteStream(AUDIT_FILE, { flags: 'a' });
            log.info('Audit log rotated', { kept: kept.length });
        } catch (err) {
            log.error('Failed to rotate audit', { error: err.message });
        }
    }

    close() {
        if (this._auditStream) {
            this._auditStream.end();
            this._auditStream = null;
        }
        this._saveSessions();
    }
}

module.exports = Store;
