const { createLogger } = require('./logger');
const log = createLogger('skills');

const SKILL_TIMEOUT = 15000;

const SKILL_DEFINITIONS = {
    FULL_DIAGNOSTIC: {
        description: 'Verificacao completa do dispositivo',
        commands: [
            { key: 'battery', cmd: 'dumpsys battery' },
            { key: 'memory', cmd: 'cat /proc/meminfo' },
            { key: 'cpu', cmd: 'cat /proc/stat' },
            { key: 'disk', cmd: 'df -h' },
            { key: 'thermal', cmd: 'cat /sys/class/thermal/thermal_zone0/temp' },
            { key: 'wifi', cmd: 'dumpsys wifi' },
            { key: 'signal', cmd: 'dumpsys telephony.registry' }
        ]
    },
    BATTERY_HEALTH: {
        description: 'Analise detalhada de bateria',
        commands: [
            { key: 'battery', cmd: 'dumpsys battery' },
            { key: 'batterystats', cmd: 'dumpsys batterystats' }
        ]
    },
    THERMAL_ANALYSIS: {
        description: 'Diagnostico de superaquecimento',
        commands: [
            { key: 'thermal_temps', cmd: 'cat /sys/class/thermal/thermal_zone0/temp' },
            { key: 'thermal_type', cmd: 'cat /sys/class/thermal/thermal_zone0/type' },
            { key: 'processes', cmd: 'ps -A' },
            { key: 'battery_temp', cmd: 'dumpsys battery' }
        ]
    },
    STORAGE_CLEANUP: {
        description: 'Analise de armazenamento',
        commands: [
            { key: 'disk', cmd: 'df -h' },
            { key: 'packages', cmd: 'pm list packages -3' },
            { key: 'package_stats', cmd: 'dumpsys package stats' }
        ]
    },
    NETWORK_DIAGNOSTIC: {
        description: 'Diagnostico de conectividade',
        commands: [
            { key: 'wifi', cmd: 'dumpsys wifi' },
            { key: 'telephony', cmd: 'dumpsys telephony.registry' },
            { key: 'connectivity', cmd: 'dumpsys connectivity' },
            { key: 'ifconfig', cmd: 'ifconfig' }
        ]
    },
    PERFORMANCE_PROFILE: {
        description: 'Perfil de desempenho completo',
        commands: [
            { key: 'cpu', cmd: 'cat /proc/stat' },
            { key: 'memory', cmd: 'cat /proc/meminfo' },
            { key: 'loadavg', cmd: 'cat /proc/loadavg' },
            { key: 'uptime', cmd: 'cat /proc/uptime' },
            { key: 'processes', cmd: 'ps -A' },
            { key: 'disk', cmd: 'df -h' }
        ]
    },
    APP_ANALYSIS: {
        description: 'Analise de apps problematicos',
        commands: [
            { key: 'packages', cmd: 'pm list packages -3' },
            { key: 'activity', cmd: 'dumpsys activity' },
            { key: 'errors', cmd: 'logcat -d -t 50 *:E' }
        ]
    },
    SECURITY_CHECK: {
        description: 'Verificacao de seguranca',
        commands: [
            { key: 'selinux', cmd: 'getprop ro.boot.selinux' },
            { key: 'adb_enabled', cmd: 'settings get global adb_enabled' },
            { key: 'unknown_sources', cmd: 'settings get secure install_non_market_apps' },
            { key: 'encryption', cmd: 'getprop ro.crypto.state' },
            { key: 'security_patch', cmd: 'getprop ro.build.version.security_patch' }
        ]
    }
};

class SkillRunner {
    constructor(adb, validator) {
        this.adb = adb;
        this.validator = validator;
    }

    listSkills() {
        return Object.entries(SKILL_DEFINITIONS).map(([name, def]) => ({
            name,
            description: def.description,
            commands: def.commands.length
        }));
    }

    async execute(skillName) {
        const skill = SKILL_DEFINITIONS[skillName];
        if (!skill) {
            return { skill: skillName, success: false, error: `Skill desconhecida: ${skillName}`, summary: '', details: {}, errors: [] };
        }

        const startTime = Date.now();
        const details = {};
        const errors = [];
        const deadline = startTime + SKILL_TIMEOUT;

        for (const { key, cmd } of skill.commands) {
            if (Date.now() > deadline) {
                errors.push({ key, error: 'Timeout global da skill atingido' });
                break;
            }

            const validation = this.validator.validateWithRisk(cmd);
            if (!validation.allowed) {
                errors.push({ key, error: `Comando bloqueado: ${validation.reason}` });
                continue;
            }

            try {
                const output = await this.adb.execute(cmd);
                details[key] = this._truncate(output, 1500);
            } catch (err) {
                errors.push({ key, error: err.message });
                details[key] = null;
            }
        }

        const duration = Date.now() - startTime;
        const summary = this._buildSummary(skillName, details, errors);

        log.info(`Skill ${skillName} completed in ${duration}ms`, { errors: errors.length });

        return {
            skill: skillName,
            success: errors.length < skill.commands.length,
            duration_ms: duration,
            summary,
            details,
            errors
        };
    }

    _truncate(text, max) {
        if (!text) return '';
        if (text.length <= max) return text;
        return text.substring(0, max) + '\n... (truncado)';
    }

    _buildSummary(skillName, details, errors) {
        const parts = [];

        switch (skillName) {
            case 'FULL_DIAGNOSTIC': {
                if (details.battery) parts.push(this._extractBatterySummary(details.battery));
                if (details.memory) parts.push(this._extractMemorySummary(details.memory));
                if (details.disk) parts.push(this._extractDiskSummary(details.disk));
                if (details.thermal) parts.push(`Temp: ${this._extractTemp(details.thermal)}`);
                if (details.wifi) parts.push(this._extractWifiSummary(details.wifi));
                if (details.signal) parts.push(this._extractSignalSummary(details.signal));
                break;
            }
            case 'BATTERY_HEALTH': {
                if (details.battery) parts.push(this._extractBatterySummary(details.battery));
                if (details.batterystats) parts.push('Historico de bateria coletado.');
                break;
            }
            case 'THERMAL_ANALYSIS': {
                if (details.thermal_temps) parts.push(`Temp zona principal: ${this._extractTemp(details.thermal_temps)}`);
                if (details.thermal_type) parts.push(`Tipo: ${details.thermal_type.trim()}`);
                if (details.processes) {
                    const lines = details.processes.split('\n').length;
                    parts.push(`${lines} processos ativos`);
                }
                if (details.battery_temp) parts.push(this._extractBatterySummary(details.battery_temp));
                break;
            }
            case 'STORAGE_CLEANUP': {
                if (details.disk) parts.push(this._extractDiskSummary(details.disk));
                if (details.packages) {
                    const count = details.packages.split('\n').filter(l => l.startsWith('package:')).length;
                    parts.push(`${count} apps de terceiros`);
                }
                break;
            }
            case 'NETWORK_DIAGNOSTIC': {
                if (details.wifi) parts.push(this._extractWifiSummary(details.wifi));
                if (details.telephony) parts.push(this._extractSignalSummary(details.telephony));
                if (details.connectivity) {
                    const hasInternet = details.connectivity.includes('CONNECTED');
                    parts.push(`Internet: ${hasInternet ? 'Conectado' : 'Desconectado'}`);
                }
                break;
            }
            case 'PERFORMANCE_PROFILE': {
                if (details.loadavg) parts.push(`Load avg: ${details.loadavg.trim()}`);
                if (details.uptime) {
                    const secs = parseFloat(details.uptime);
                    if (!isNaN(secs)) parts.push(`Uptime: ${Math.round(secs / 3600)}h`);
                }
                if (details.memory) parts.push(this._extractMemorySummary(details.memory));
                if (details.processes) {
                    const lines = details.processes.split('\n').length;
                    parts.push(`${lines} processos`);
                }
                break;
            }
            case 'APP_ANALYSIS': {
                if (details.packages) {
                    const count = details.packages.split('\n').filter(l => l.startsWith('package:')).length;
                    parts.push(`${count} apps de terceiros`);
                }
                if (details.errors) {
                    const errorLines = details.errors.split('\n').filter(l => l.includes('E/')).length;
                    parts.push(`${errorLines} erros recentes no log`);
                }
                break;
            }
            case 'SECURITY_CHECK': {
                if (details.selinux) parts.push(`SELinux: ${details.selinux.trim()}`);
                if (details.adb_enabled) parts.push(`ADB: ${details.adb_enabled.trim() === '1' ? 'ativo' : 'inativo'}`);
                if (details.encryption) parts.push(`Criptografia: ${details.encryption.trim()}`);
                if (details.security_patch) parts.push(`Patch: ${details.security_patch.trim()}`);
                break;
            }
        }

        if (errors.length > 0) {
            parts.push(`${errors.length} verificacao(oes) falharam`);
        }

        return parts.join('. ') + '.';
    }

    _extractBatterySummary(raw) {
        const level = raw.match(/level:\s*(\d+)/);
        const status = raw.match(/status:\s*(\d+)/);
        const temp = raw.match(/temperature:\s*(\d+)/);
        const health = raw.match(/health:\s*(\d+)/);
        const statusMap = { '2': 'Carregando', '3': 'Descarregando', '5': 'Completa' };
        const healthMap = { '2': 'BOA', '3': 'SOBREAQUECIDA', '4': 'MORTA', '6': 'FALHA', '7': 'FRIA' };
        const parts = [];
        if (level) parts.push(`Bateria ${level[1]}%`);
        if (status) parts.push(statusMap[status[1]] || `status ${status[1]}`);
        if (health) parts.push(`saude ${healthMap[health[1]] || health[1]}`);
        if (temp) parts.push(`temp ${(parseInt(temp[1]) / 10).toFixed(1)}C`);
        return parts.join(', ');
    }

    _extractMemorySummary(raw) {
        const total = raw.match(/MemTotal:\s*(\d+)/);
        const available = raw.match(/MemAvailable:\s*(\d+)/);
        if (total && available) {
            const t = parseInt(total[1]);
            const a = parseInt(available[1]);
            const usedPct = Math.round(((t - a) / t) * 100);
            return `RAM ${usedPct}% usada (${Math.round(t / 1024)}MB total)`;
        }
        return 'RAM: dados parciais';
    }

    _extractDiskSummary(raw) {
        const lines = raw.split('\n');
        const dataLine = lines.find(l => l.includes('/data') || l.includes('/storage'));
        if (dataLine) {
            const parts = dataLine.trim().split(/\s+/);
            if (parts.length >= 5) return `Disco: ${parts[4]} usado (${parts[1]} total)`;
        }
        return 'Disco: dados parciais';
    }

    _extractTemp(raw) {
        const temp = parseInt(raw);
        if (!isNaN(temp)) return `${temp > 1000 ? (temp / 1000).toFixed(1) : temp}C`;
        return 'N/A';
    }

    _extractWifiSummary(raw) {
        const ssid = raw.match(/SSID:\s*"?([^"\n]+)/);
        const rssi = raw.match(/RSSI:\s*(-?\d+)/);
        if (ssid) return `Wi-Fi: ${ssid[1].trim()}${rssi ? ` (${rssi[1]} dBm)` : ''}`;
        const enabled = raw.includes('Wi-Fi is enabled') || raw.includes('mWifiEnabled true');
        return enabled ? 'Wi-Fi: ativo mas sem rede' : 'Wi-Fi: desativado';
    }

    _extractSignalSummary(raw) {
        const dbm = raw.match(/mSignalStrength=(-?\d+)/);
        const type = raw.match(/mNetworkType=(\d+)/);
        const typeMap = { '13': 'LTE', '20': '5G', '3': '3G', '0': 'Sem sinal' };
        const parts = [];
        if (dbm) parts.push(`Sinal: ${dbm[1]} dBm`);
        if (type) parts.push(typeMap[type[1]] || `tipo ${type[1]}`);
        return parts.join(' ') || 'Sinal: dados indisponiveis';
    }
}

module.exports = SkillRunner;
