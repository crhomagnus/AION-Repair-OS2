const { createLogger } = require('./logger');
const log = createLogger('skills');

const SKILL_TIMEOUT = 15000;

const SKILL_DEFINITIONS = {
    // ===== CORE DIAGNOSTICS =====
    FULL_DIAGNOSTIC: {
        description: 'Verificacao completa do dispositivo (bateria, RAM, CPU, disco, temp, rede)',
        commands: [
            { key: 'battery', cmd: 'dumpsys battery' },
            { key: 'memory', cmd: 'cat /proc/meminfo' },
            { key: 'cpu', cmd: 'cat /proc/stat' },
            { key: 'disk', cmd: 'df -h' },
            { key: 'thermal', cmd: 'cat /sys/class/thermal/thermal_zone0/temp' },
            { key: 'wifi', cmd: 'dumpsys wifi' },
            { key: 'signal', cmd: 'dumpsys telephony.registry' },
            { key: 'uptime', cmd: 'cat /proc/uptime' }
        ]
    },
    BATTERY_HEALTH: {
        description: 'Analise detalhada de bateria (nivel, saude, temperatura, stats)',
        commands: [
            { key: 'battery', cmd: 'dumpsys battery' },
            { key: 'batterystats', cmd: 'dumpsys batterystats' },
            { key: 'power', cmd: 'dumpsys power' },
            { key: 'deviceidle', cmd: 'dumpsys deviceidle' }
        ]
    },
    THERMAL_ANALYSIS: {
        description: 'Diagnostico de superaquecimento (zonas termicas, processos, CPU)',
        commands: [
            { key: 'thermal_temps', cmd: 'cat /sys/class/thermal/thermal_zone0/temp' },
            { key: 'thermal_type', cmd: 'cat /sys/class/thermal/thermal_zone0/type' },
            { key: 'cpu_stat', cmd: 'cat /proc/stat' },
            { key: 'processes', cmd: 'ps -A' },
            { key: 'battery_temp', cmd: 'dumpsys battery' },
            { key: 'cpuinfo', cmd: 'dumpsys cpuinfo' }
        ]
    },
    STORAGE_CLEANUP: {
        description: 'Analise de armazenamento (uso, apps terceiros, cache)',
        commands: [
            { key: 'disk', cmd: 'df -h' },
            { key: 'disk_detail', cmd: 'df -k' },
            { key: 'packages', cmd: 'pm list packages -3' },
            { key: 'diskstats', cmd: 'dumpsys diskstats' },
            { key: 'sdcard', cmd: 'ls -la /sdcard/' }
        ]
    },

    // ===== NETWORK & CONNECTIVITY =====
    NETWORK_DIAGNOSTIC: {
        description: 'Diagnostico completo de rede (WiFi, celular, IP, DNS, latencia)',
        commands: [
            { key: 'wifi', cmd: 'dumpsys wifi' },
            { key: 'telephony', cmd: 'dumpsys telephony.registry' },
            { key: 'connectivity', cmd: 'dumpsys connectivity' },
            { key: 'ip_addr', cmd: 'ip addr' },
            { key: 'ip_route', cmd: 'ip route' },
            { key: 'dns', cmd: 'getprop net.dns1' },
            { key: 'ping', cmd: 'ping -c 3 8.8.8.8' }
        ]
    },
    WIFI_ANALYSIS: {
        description: 'Analise detalhada de WiFi (SSID, sinal, frequencia, velocidade)',
        commands: [
            { key: 'wifi', cmd: 'dumpsys wifi' },
            { key: 'netstats', cmd: 'dumpsys netstats' },
            { key: 'wireless', cmd: 'cat /proc/net/wireless' },
            { key: 'ip_link', cmd: 'ip link' }
        ]
    },
    CELLULAR_ANALYSIS: {
        description: 'Analise de rede celular (sinal, tipo, operadora, baseband)',
        commands: [
            { key: 'telephony', cmd: 'dumpsys telephony.registry' },
            { key: 'telecom', cmd: 'dumpsys telecom' },
            { key: 'phone', cmd: 'dumpsys phone' },
            { key: 'carrier', cmd: 'dumpsys carrier_config' },
            { key: 'baseband', cmd: 'getprop gsm.version.baseband' },
            { key: 'operator', cmd: 'getprop gsm.operator.alpha' },
            { key: 'network_type', cmd: 'getprop gsm.network.type' },
            { key: 'sim_state', cmd: 'getprop gsm.sim.state' }
        ]
    },
    BLUETOOTH_ANALYSIS: {
        description: 'Diagnostico de Bluetooth (estado, dispositivos, perfis)',
        commands: [
            { key: 'bluetooth', cmd: 'dumpsys bluetooth_manager' },
            { key: 'bt_state', cmd: 'settings get global bluetooth_on' }
        ]
    },

    // ===== PERFORMANCE =====
    PERFORMANCE_PROFILE: {
        description: 'Perfil de desempenho (CPU, RAM, GPU, load, processos top)',
        commands: [
            { key: 'cpu', cmd: 'cat /proc/stat' },
            { key: 'cpuinfo', cmd: 'dumpsys cpuinfo' },
            { key: 'memory', cmd: 'cat /proc/meminfo' },
            { key: 'meminfo', cmd: 'dumpsys meminfo' },
            { key: 'loadavg', cmd: 'cat /proc/loadavg' },
            { key: 'uptime', cmd: 'cat /proc/uptime' },
            { key: 'processes', cmd: 'ps -A' },
            { key: 'disk', cmd: 'df -h' }
        ]
    },
    PROCESS_ANALYSIS: {
        description: 'Analise detalhada de processos (CPU, memoria, activities)',
        commands: [
            { key: 'processes', cmd: 'ps -A' },
            { key: 'cpuinfo', cmd: 'dumpsys cpuinfo' },
            { key: 'procstats', cmd: 'dumpsys procstats --hours 3' },
            { key: 'activity', cmd: 'dumpsys activity activities' }
        ]
    },

    // ===== APPS =====
    APP_ANALYSIS: {
        description: 'Analise de apps (terceiros, erros recentes, activities)',
        commands: [
            { key: 'packages_user', cmd: 'pm list packages -3' },
            { key: 'packages_disabled', cmd: 'pm list packages -d' },
            { key: 'activity', cmd: 'dumpsys activity' },
            { key: 'errors', cmd: 'logcat -d -t 50 *:E' },
            { key: 'usagestats', cmd: 'dumpsys usagestats' }
        ]
    },
    APP_CRASH_LOG: {
        description: 'Logs de crash e ANR (erros fatais, freezes)',
        commands: [
            { key: 'crashes', cmd: 'logcat -d -b crash' },
            { key: 'errors', cmd: 'logcat -d -t 100 *:E' },
            { key: 'system_errors', cmd: 'logcat -d -b system -t 50 *:E' },
            { key: 'main_errors', cmd: 'logcat -d -b main -t 50 *:E' }
        ]
    },

    // ===== SECURITY =====
    SECURITY_CHECK: {
        description: 'Verificacao de seguranca (SELinux, ADB, criptografia, patch)',
        commands: [
            { key: 'selinux', cmd: 'getprop ro.boot.selinux' },
            { key: 'adb_enabled', cmd: 'settings get global adb_enabled' },
            { key: 'unknown_sources', cmd: 'settings get secure install_non_market_apps' },
            { key: 'encryption', cmd: 'getprop ro.crypto.state' },
            { key: 'security_patch', cmd: 'getprop ro.build.version.security_patch' },
            { key: 'verified_boot', cmd: 'getprop ro.boot.verifiedbootstate' },
            { key: 'dm_verity', cmd: 'getprop ro.boot.veritymode' },
            { key: 'usb_config', cmd: 'getprop sys.usb.config' }
        ]
    },

    // ===== HARDWARE =====
    HARDWARE_PROFILE: {
        description: 'Perfil de hardware (plataforma, chipset, sensores, display)',
        commands: [
            { key: 'platform', cmd: 'getprop ro.board.platform' },
            { key: 'hardware', cmd: 'getprop ro.hardware' },
            { key: 'chipset', cmd: 'getprop ro.hardware.chipname' },
            { key: 'cpuinfo', cmd: 'cat /proc/cpuinfo' },
            { key: 'display', cmd: 'dumpsys display' },
            { key: 'sensors', cmd: 'dumpsys sensorservice' },
            { key: 'audio', cmd: 'dumpsys audio' },
            { key: 'camera', cmd: 'dumpsys media.camera' }
        ]
    },
    DEVICE_IDENTITY: {
        description: 'Identidade do dispositivo (modelo, build, IMEI, serial)',
        commands: [
            { key: 'model', cmd: 'getprop ro.product.model' },
            { key: 'brand', cmd: 'getprop ro.product.brand' },
            { key: 'manufacturer', cmd: 'getprop ro.product.manufacturer' },
            { key: 'android', cmd: 'getprop ro.build.version.release' },
            { key: 'sdk', cmd: 'getprop ro.build.version.sdk' },
            { key: 'build', cmd: 'getprop ro.build.display.id' },
            { key: 'serial', cmd: 'getprop ro.serialno' },
            { key: 'iphonesubinfo', cmd: 'dumpsys iphonesubinfo' },
            { key: 'fingerprint', cmd: 'getprop ro.build.fingerprint' }
        ]
    },

    // ===== LOGS & FORENSICS =====
    LOG_COLLECTION: {
        description: 'Coleta de logs do sistema (main, system, radio, events, crash)',
        commands: [
            { key: 'main', cmd: 'logcat -d -b main -t 200' },
            { key: 'system', cmd: 'logcat -d -b system -t 100' },
            { key: 'radio', cmd: 'logcat -d -b radio -t 50' },
            { key: 'events', cmd: 'logcat -d -b events -t 50' },
            { key: 'crash', cmd: 'logcat -d -b crash' }
        ]
    },
    FORENSIC_SNAPSHOT: {
        description: 'Snapshot forense (identidade, apps, contas, configs, rede)',
        commands: [
            { key: 'props', cmd: 'getprop' },
            { key: 'packages_all', cmd: 'pm list packages' },
            { key: 'packages_user', cmd: 'pm list packages -3' },
            { key: 'accounts', cmd: 'dumpsys account' },
            { key: 'settings_global', cmd: 'settings list global' },
            { key: 'settings_secure', cmd: 'settings list secure' },
            { key: 'mounts', cmd: 'mount' },
            { key: 'disk', cmd: 'df -h' },
            { key: 'network', cmd: 'ip addr' }
        ]
    },

    // ===== DISPLAY & UI =====
    DISPLAY_ANALYSIS: {
        description: 'Analise de display (resolucao, densidade, GPU, framerate)',
        commands: [
            { key: 'display', cmd: 'dumpsys display' },
            { key: 'window', cmd: 'dumpsys window' },
            { key: 'gfxinfo', cmd: 'dumpsys gfxinfo' },
            { key: 'surfaceflinger', cmd: 'dumpsys SurfaceFlinger' }
        ]
    },

    // ===== AUDIO =====
    AUDIO_ANALYSIS: {
        description: 'Diagnostico de audio (volumes, rotas, dispositivos, codecs)',
        commands: [
            { key: 'audio', cmd: 'dumpsys audio' },
            { key: 'audio_flinger', cmd: 'dumpsys media.audio_flinger' }
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
                if (details.verified_boot) parts.push(`Verified Boot: ${details.verified_boot.trim()}`);
                break;
            }
            case 'CELLULAR_ANALYSIS': {
                if (details.baseband) parts.push(`Baseband: ${details.baseband.trim()}`);
                if (details.operator) parts.push(`Operadora: ${details.operator.trim()}`);
                if (details.network_type) parts.push(`Rede: ${details.network_type.trim()}`);
                if (details.sim_state) parts.push(`SIM: ${details.sim_state.trim()}`);
                if (details.telephony) parts.push(this._extractSignalSummary(details.telephony));
                break;
            }
            case 'WIFI_ANALYSIS': {
                if (details.wifi) parts.push(this._extractWifiSummary(details.wifi));
                if (details.wireless) {
                    const match = details.wireless.match(/wlan0.*?(\S+)\s+(\S+)/);
                    if (match) parts.push(`Interface wlan0 ativa`);
                }
                break;
            }
            case 'BLUETOOTH_ANALYSIS': {
                if (details.bt_state) parts.push(`Bluetooth: ${details.bt_state.trim() === '1' ? 'ativo' : 'inativo'}`);
                if (details.bluetooth) {
                    const paired = (details.bluetooth.match(/bond state: bonded/gi) || []).length;
                    parts.push(`${paired} dispositivo(s) pareado(s)`);
                }
                break;
            }
            case 'PROCESS_ANALYSIS': {
                if (details.processes) {
                    const lines = details.processes.split('\n').filter(l => l.trim()).length - 1;
                    parts.push(`${lines} processos ativos`);
                }
                if (details.cpuinfo) {
                    const match = details.cpuinfo.match(/(\d+)% TOTAL/);
                    if (match) parts.push(`CPU total: ${match[1]}%`);
                }
                break;
            }
            case 'APP_CRASH_LOG': {
                if (details.crashes) {
                    const lines = details.crashes.split('\n').filter(l => l.trim()).length;
                    parts.push(`${lines} linhas de crash log`);
                }
                if (details.errors) {
                    const fatalCount = (details.errors.match(/FATAL/gi) || []).length;
                    const anrCount = (details.errors.match(/ANR/gi) || []).length;
                    if (fatalCount) parts.push(`${fatalCount} erros fatais`);
                    if (anrCount) parts.push(`${anrCount} ANRs detectados`);
                }
                break;
            }
            case 'HARDWARE_PROFILE': {
                if (details.platform) parts.push(`Plataforma: ${details.platform.trim()}`);
                if (details.hardware) parts.push(`Hardware: ${details.hardware.trim()}`);
                if (details.cpuinfo) {
                    const cores = (details.cpuinfo.match(/processor\s*:/gi) || []).length;
                    if (cores) parts.push(`${cores} cores CPU`);
                }
                if (details.sensors) {
                    const count = (details.sensors.match(/name=/gi) || []).length;
                    if (count) parts.push(`${count} sensores`);
                }
                break;
            }
            case 'DEVICE_IDENTITY': {
                if (details.brand) parts.push(`${details.brand.trim()}`);
                if (details.model) parts.push(`${details.model.trim()}`);
                if (details.android) parts.push(`Android ${details.android.trim()}`);
                if (details.sdk) parts.push(`API ${details.sdk.trim()}`);
                if (details.serial) parts.push(`S/N: ${details.serial.trim()}`);
                if (details.build) parts.push(`Build: ${details.build.trim()}`);
                break;
            }
            case 'LOG_COLLECTION': {
                for (const [key, label] of [['main','Main'],['system','System'],['radio','Radio'],['events','Events'],['crash','Crash']]) {
                    if (details[key]) {
                        const lines = details[key].split('\n').filter(l => l.trim()).length;
                        parts.push(`${label}: ${lines} linhas`);
                    }
                }
                break;
            }
            case 'FORENSIC_SNAPSHOT': {
                if (details.packages_all) {
                    const total = details.packages_all.split('\n').filter(l => l.startsWith('package:')).length;
                    parts.push(`${total} pacotes instalados`);
                }
                if (details.packages_user) {
                    const user = details.packages_user.split('\n').filter(l => l.startsWith('package:')).length;
                    parts.push(`${user} apps de terceiros`);
                }
                if (details.accounts) {
                    const accs = (details.accounts.match(/Account \{/gi) || []).length;
                    parts.push(`${accs} contas configuradas`);
                }
                if (details.disk) parts.push(this._extractDiskSummary(details.disk));
                break;
            }
            case 'DISPLAY_ANALYSIS': {
                if (details.display) {
                    const res = details.display.match(/(\d+)\s*x\s*(\d+)/);
                    if (res) parts.push(`Resolucao: ${res[1]}x${res[2]}`);
                    const dpi = details.display.match(/(\d+)\s*dpi/);
                    if (dpi) parts.push(`${dpi[1]} DPI`);
                }
                break;
            }
            case 'AUDIO_ANALYSIS': {
                if (details.audio) {
                    const vol = details.audio.match(/STREAM_MUSIC.*?index=(\d+)/s);
                    if (vol) parts.push(`Volume musica: ${vol[1]}`);
                    const route = details.audio.match(/Selected Output.*?(\w+)/s);
                    if (route) parts.push(`Saida: ${route[1]}`);
                }
                break;
            }
        }

            // Default: for any unhandled skill, just report data collected
            if (parts.length === 0) {
                const collected = Object.keys(details).filter(k => details[k] !== null).length;
                parts.push(`${collected} verificacoes coletadas`);
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
