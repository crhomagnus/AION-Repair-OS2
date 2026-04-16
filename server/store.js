const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('store');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const MAX_AUDIT_LINES = Number(process.env.MAX_AUDIT_LINES || 5000);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://twllrnhqsyowdxegpvai.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ---------------------------------------------------------------------------
// File-based fallback store (original implementation)
// ---------------------------------------------------------------------------
class FileStore {
    constructor() {
        this._ensureDir();
        this._sessions = this._loadSessions();
        this._auditStream = null;
        this._auditCount = 0;
        this._openAuditStream();
        log.info('Store: file-based storage active');
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

    async getSession(id) {
        return this._sessions.get(id) || null;
    }

    async setSession(id, session) {
        this._sessions.set(id, session);
        this._saveSessions();
    }

    async updateSession(id, updates) {
        const session = this._sessions.get(id);
        if (!session) return null;
        Object.assign(session, updates, { updated_at: new Date().toISOString() });
        this._saveSessions();
        return session;
    }

    async getAllSessions() {
        return this._sessions;
    }

    get sessionCount() {
        return this._sessions.size;
    }

    async appendAudit(entry) {
        if (this._auditStream) {
            this._auditStream.write(JSON.stringify(entry) + '\n');
            this._auditCount++;
            if (this._auditCount > MAX_AUDIT_LINES * 1.5) {
                this._rotateAudit();
            }
        }
    }

    async getRecentAudit(limit = 100) {
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

    async getSessionAudit(sessionId) {
        const all = await this.getRecentAudit(5000);
        return all.filter(e => e.session_id === sessionId);
    }

    async saveChatMessage(sessionId, role, content) {
        // File store: no-op (chat history not persisted in file mode)
        log.warn('saveChatMessage called on FileStore — chat history not persisted');
    }

    async getChatHistory(sessionId, limit = 80) {
        return [];
    }

    _rotateAudit() {
        try {
            if (this._auditStream) this._auditStream.end();
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

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------
class SupabaseStore {
    constructor(supabase) {
        this._sb = supabase;
        this._sessionCountCache = 0;
        log.info('Store: Supabase connected');
    }

    // --- Sessions --------------------------------------------------------

    async getSession(id) {
        try {
            const { data, error } = await this._sb
                .from('sessions')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data || null;
        } catch (err) {
            log.error('getSession failed', { id, error: err.message });
            return null;
        }
    }

    async setSession(id, session) {
        try {
            const row = { id, ...session, updated_at: new Date().toISOString() };
            const { error } = await this._sb
                .from('sessions')
                .upsert(row, { onConflict: 'id' });
            if (error) throw error;
        } catch (err) {
            log.error('setSession failed', { id, error: err.message });
        }
    }

    async updateSession(id, updates) {
        try {
            const { data, error } = await this._sb
                .from('sessions')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data || null;
        } catch (err) {
            log.error('updateSession failed', { id, error: err.message });
            return null;
        }
    }

    async getAllSessions() {
        try {
            const { data, error } = await this._sb
                .from('sessions')
                .select('*')
                .eq('status', 'open');
            if (error) throw error;
            const map = new Map();
            for (const row of data || []) {
                map.set(row.id, row);
            }
            this._sessionCountCache = map.size;
            return map;
        } catch (err) {
            log.error('getAllSessions failed', { error: err.message });
            return new Map();
        }
    }

    get sessionCount() {
        // Returns cached count; callers should await getAllSessions() for accuracy
        return this._sessionCountCache;
    }

    // --- Audit logs ------------------------------------------------------

    async appendAudit(entry) {
        try {
            const row = {
                session_id: entry.session_id || null,
                action_type: entry.action_type || entry.action || 'unknown',
                payload: entry,
                risk_level: entry.risk_level || null,
            };
            const { error } = await this._sb.from('audit_logs').insert(row);
            if (error) throw error;
        } catch (err) {
            log.error('appendAudit failed', { error: err.message });
        }
    }

    async getRecentAudit(limit = 100) {
        try {
            const { data, error } = await this._sb
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return (data || []).reverse();
        } catch (err) {
            log.error('getRecentAudit failed', { error: err.message });
            return [];
        }
    }

    async getSessionAudit(sessionId) {
        try {
            const { data, error } = await this._sb
                .from('audit_logs')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (err) {
            log.error('getSessionAudit failed', { error: err.message });
            return [];
        }
    }

    // --- Chat messages ---------------------------------------------------

    async saveChatMessage(sessionId, role, content) {
        try {
            const { error } = await this._sb
                .from('chat_messages')
                .insert({ session_id: sessionId, role, content });
            if (error) throw error;
        } catch (err) {
            log.error('saveChatMessage failed', { sessionId, error: err.message });
        }
    }

    async getChatHistory(sessionId, limit = 80) {
        try {
            const { data, error } = await this._sb
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) throw error;
            return data || [];
        } catch (err) {
            log.error('getChatHistory failed', { sessionId, error: err.message });
            return [];
        }
    }

    // --- Lifecycle -------------------------------------------------------

    close() {
        // No-op for Supabase
    }
}

// ---------------------------------------------------------------------------
// Factory — picks Supabase if configured, else falls back to file store
// ---------------------------------------------------------------------------
function createStore() {
    if (SUPABASE_SERVICE_KEY) {
        try {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            return new SupabaseStore(supabase);
        } catch (err) {
            log.error('Failed to initialise Supabase client, falling back to file store', {
                error: err.message,
            });
        }
    } else {
        log.info('SUPABASE_SERVICE_KEY not set — using file-based store');
    }
    return new FileStore();
}

module.exports = createStore;
