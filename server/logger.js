const LOG_LEVEL_MAP = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVEL_MAP[process.env.LOG_LEVEL || 'info'] || 1;
const jsonMode = process.env.LOG_FORMAT === 'json';

function ts() {
    return new Date().toISOString();
}

function emit(level, component, message, meta) {
    if (LOG_LEVEL_MAP[level] < currentLevel) return;

    if (jsonMode) {
        const entry = {
            time: ts(),
            level,
            component,
            msg: message,
            ...meta
        };
        const line = JSON.stringify(entry);
        if (level === 'error' || level === 'warn') {
            process.stderr.write(line + '\n');
        } else {
            process.stdout.write(line + '\n');
        }
    } else {
        const prefix = `[${ts()}] [${level.toUpperCase()}] [${component}]`;
        const suffix = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        const line = `${prefix} ${message}${suffix}`;
        if (level === 'error' || level === 'warn') {
            console.error(line);
        } else {
            console.log(line);
        }
    }
}

function createLogger(component) {
    return {
        debug: (msg, meta) => emit('debug', component, msg, meta),
        info: (msg, meta) => emit('info', component, msg, meta),
        warn: (msg, meta) => emit('warn', component, msg, meta),
        error: (msg, meta) => emit('error', component, msg, meta)
    };
}

module.exports = { createLogger };
