-- AION Repair OS — Supabase Schema
-- Run this migration in the Supabase SQL Editor

-- ============================================================
-- 1. sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    device_model    TEXT,
    device_brand    TEXT,
    mode            TEXT DEFAULT 'repair',
    status          TEXT DEFAULT 'open',
    channel         TEXT DEFAULT 'web',
    client_name     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    closed_at       TIMESTAMPTZ
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_sessions" ON sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- 2. chat_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT REFERENCES sessions(id),
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages (session_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_chat_messages" ON chat_messages
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- 3. audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT,
    action_type     TEXT NOT NULL,
    payload         JSONB,
    risk_level      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_session_created
    ON audit_logs (session_id, created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_logs" ON audit_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- 4. clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT,
    phone           TEXT,
    device_ids      TEXT[] DEFAULT '{}',
    sessions_count  INTEGER DEFAULT 0,
    first_seen      TIMESTAMPTZ DEFAULT now(),
    last_seen       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_clients" ON clients
    FOR ALL
    USING (true)
    WITH CHECK (true);
