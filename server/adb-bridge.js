const EventEmitter = require('events');
const { Adb } = require('@devicefarmer/adbkit');
const { buildDeviceProfile } = require('./device-profile');
const { createLogger } = require('./logger');

const adbLog = createLogger('adb-bridge');

// All possible device states from ADB
const DEVICE_STATES = {
    DEVICE: 'device',           // Ready and authorized
    OFFLINE: 'offline',         // USB connected but ADB not responding
    UNAUTHORIZED: 'unauthorized', // USB debug not authorized (no popup accepted)
    AUTHORIZING: 'authorizing', // Waiting for user to tap "Allow"
    NO_PERMISSIONS: 'no permissions', // Linux udev rules missing
    RECOVERY: 'recovery',      // Device in recovery mode
    SIDELOAD: 'sideload',      // Device in sideload mode
    BOOTLOADER: 'bootloader',  // Device in bootloader/fastboot
};

// Human-readable diagnostic messages (PT-BR)
const DIAGNOSTIC_MESSAGES = {
    [DEVICE_STATES.OFFLINE]: {
        title: 'Dispositivo offline',
        hint: 'O celular está conectado via USB mas o ADB não responde. Tente: (1) Desconectar e reconectar o cabo USB, (2) Desativar e reativar "Depuração USB" nas configurações do desenvolvedor, (3) Reiniciar o ADB server.',
        severity: 'warning'
    },
    [DEVICE_STATES.UNAUTHORIZED]: {
        title: 'Depuração USB não autorizada',
        hint: 'O celular mostra um popup "Permitir depuração USB?" — toque em "Permitir" (ou "Sempre permitir deste computador"). Se não aparecer, desplugue e plugue novamente o cabo.',
        severity: 'action_required'
    },
    [DEVICE_STATES.AUTHORIZING]: {
        title: 'Aguardando autorização',
        hint: 'O celular está pedindo permissão de depuração USB. Verifique a tela do celular e toque em "Permitir".',
        severity: 'action_required'
    },
    [DEVICE_STATES.NO_PERMISSIONS]: {
        title: 'Sem permissão USB',
        hint: 'O Linux não tem permissão para acessar este dispositivo USB. Execute: sudo adb kill-server && sudo adb start-server, ou adicione uma regra udev para o fabricante.',
        severity: 'error'
    },
    [DEVICE_STATES.RECOVERY]: {
        title: 'Modo Recovery',
        hint: 'O celular está em modo recovery. Reinicie normalmente para usar o diagnóstico.',
        severity: 'info'
    },
    [DEVICE_STATES.SIDELOAD]: {
        title: 'Modo Sideload',
        hint: 'O celular está em modo sideload. Reinicie normalmente para usar o diagnóstico.',
        severity: 'info'
    },
    [DEVICE_STATES.BOOTLOADER]: {
        title: 'Modo Bootloader',
        hint: 'O celular está no bootloader/fastboot. Reinicie normalmente para usar o diagnóstico.',
        severity: 'info'
    },
    'usb_mtp_only': {
        title: 'USB em modo Transferência de Arquivos (MTP)',
        hint: 'O celular está conectado em modo MTP (transferência de arquivos), que não ativa o ADB. Vá em Configurações > Opções do desenvolvedor > Depuração USB e certifique-se de que está ativada. Quando a notificação USB aparecer, verifique se a depuração está habilitada.',
        severity: 'action_required'
    },
    'no_device': {
        title: 'Nenhum dispositivo detectado',
        hint: 'Nenhum celular conectado via USB. Verifique: (1) O cabo USB suporta dados (não é só carga), (2) Depuração USB está ativada no celular, (3) O cabo está firmemente conectado.',
        severity: 'info'
    },
    'adb_server_down': {
        title: 'ADB server não está rodando',
        hint: 'O servidor ADB não está respondendo. O sistema tentará reiniciá-lo automaticamente.',
        severity: 'error'
    },
    'shell_timeout': {
        title: 'Comando expirou',
        hint: 'O dispositivo não respondeu a tempo. Pode estar travado ou com conexão USB instável. Tente reconectar o cabo.',
        severity: 'warning'
    },
    'connection_lost': {
        title: 'Conexão perdida durante operação',
        hint: 'O cabo USB pode ter sido desconectado ou o celular reiniciou durante uma operação.',
        severity: 'warning'
    }
};

class AdbBridge extends EventEmitter {
    constructor() {
        super();
        this.host = process.env.ADB_HOST || '127.0.0.1';
        this.port = Number(process.env.ADB_PORT) || 5037;
        this.client = Adb.createClient({ host: this.host, port: this.port });
        this.deviceId = null;
        this.deviceInfo = null;
        this._tracker = null;
        this._trackRetryTimer = null;
        this._trackingStopped = false;
        this._shellTimeout = Number(process.env.ADB_SHELL_TIMEOUT || 15000);
        this._pendingDevices = new Map(); // Track non-ready devices for diagnostics
    }

    async listDevices() {
        try {
            const devices = await this.client.listDevices();
            return devices.filter(d => d.type === 'device').map(d => ({ id: d.id, type: d.type }));
        } catch { return []; }
    }

    // List ALL devices including unauthorized/offline for diagnostics
    async listAllDevices() {
        try {
            const devices = await this.client.listDevices();
            return devices.map(d => ({
                id: d.id,
                type: d.type,
                ready: d.type === 'device',
                diagnostic: d.type !== 'device' ? (DIAGNOSTIC_MESSAGES[d.type] || { title: `Estado: ${d.type}`, hint: 'Estado desconhecido', severity: 'info' }) : null
            }));
        } catch (err) {
            return [{ id: null, type: 'error', ready: false, diagnostic: DIAGNOSTIC_MESSAGES['adb_server_down'] }];
        }
    }

    // Get full connection diagnostic
    async diagnose() {
        const result = {
            adbServerReachable: false,
            allDevices: [],
            connectedDevice: this.deviceId || null,
            connectedDeviceInfo: this.deviceInfo || null,
            issues: [],
            timestamp: new Date().toISOString()
        };

        // Test ADB server
        try {
            await this.client.version();
            result.adbServerReachable = true;
        } catch (err) {
            result.issues.push({
                ...DIAGNOSTIC_MESSAGES['adb_server_down'],
                detail: err.message
            });
            return result;
        }

        // List all devices (including problematic ones)
        result.allDevices = await this.listAllDevices();

        if (result.allDevices.length === 0) {
            result.issues.push(DIAGNOSTIC_MESSAGES['no_device']);
            return result;
        }

        // Check for non-ready devices
        for (const dev of result.allDevices) {
            if (!dev.ready && dev.diagnostic) {
                result.issues.push({ ...dev.diagnostic, deviceId: dev.id });
            }
        }

        // Check if connected device is still valid
        if (this.deviceId) {
            const still = result.allDevices.find(d => d.id === this.deviceId);
            if (!still) {
                result.issues.push({
                    ...DIAGNOSTIC_MESSAGES['connection_lost'],
                    detail: `Device ${this.deviceId} desapareceu`
                });
            } else if (!still.ready) {
                result.issues.push({
                    ...DIAGNOSTIC_MESSAGES[still.type] || DIAGNOSTIC_MESSAGES['connection_lost'],
                    detail: `Device ${this.deviceId} mudou para estado ${still.type}`
                });
            }
        }

        return result;
    }

    _device() {
        return this.client.getDevice(this.deviceId);
    }

    // Start watching for device plug/unplug events
    async startTracking() {
        if (this._tracker) return;
        this._trackingStopped = false;
        try {
            this._tracker = await this.client.trackDevices();
            adbLog.info('Device tracking started');

            this._tracker.on('add', (device) => {
                this._handleDeviceEvent('add', device);
            });

            this._tracker.on('remove', (device) => {
                this._handleDeviceEvent('remove', device);
            });

            this._tracker.on('change', (device) => {
                this._handleDeviceEvent('change', device);
            });

            this._tracker.on('end', () => {
                adbLog.warn('Device tracker ended, will retry...');
                this._tracker = null;
                this._scheduleTrackRetry();
            });

            this._tracker.on('error', (err) => {
                adbLog.error('Device tracker error', { error: err.message });
                this._tracker = null;
                this._scheduleTrackRetry();
            });

            // Check if there's already a device connected
            const allDevices = await this.listAllDevices();
            for (const dev of allDevices) {
                if (dev.ready && !this.deviceId) {
                    adbLog.info('Found existing device on startup', { id: dev.id });
                    this._autoConnect(dev.id);
                } else if (!dev.ready && dev.id) {
                    this._handleNonReadyDevice(dev);
                }
            }
        } catch (err) {
            adbLog.error('Failed to start device tracking', { error: err.message });
            this._scheduleTrackRetry();
        }
    }

    _handleDeviceEvent(event, device) {
        adbLog.info(`Device event: ${event}`, { id: device.id, type: device.type });

        if (event === 'add') {
            if (device.type === 'device') {
                this._pendingDevices.delete(device.id);
                this._autoConnect(device.id);
            } else {
                this._handleNonReadyDevice({ id: device.id, type: device.type, diagnostic: DIAGNOSTIC_MESSAGES[device.type] });
            }
            return;
        }

        if (event === 'remove') {
            this._pendingDevices.delete(device.id);
            if (this.deviceId === device.id) {
                this._autoDisconnect(device.id);
            }
            return;
        }

        // change event
        if (device.type === 'device') {
            // Device transitioned to ready (e.g., user accepted USB debug prompt)
            this._pendingDevices.delete(device.id);
            if (!this.deviceId || this.deviceId !== device.id) {
                adbLog.info('Device became ready (authorized)', { id: device.id });
                this._autoConnect(device.id);
            }
        } else if (this.deviceId === device.id) {
            // Connected device went to non-ready state
            adbLog.warn('Connected device changed state', { id: device.id, newState: device.type });
            this._autoDisconnect(device.id);
            this._handleNonReadyDevice({ id: device.id, type: device.type, diagnostic: DIAGNOSTIC_MESSAGES[device.type] });
        } else {
            this._handleNonReadyDevice({ id: device.id, type: device.type, diagnostic: DIAGNOSTIC_MESSAGES[device.type] });
        }
    }

    _handleNonReadyDevice(dev) {
        this._pendingDevices.set(dev.id, dev);
        const diag = dev.diagnostic || DIAGNOSTIC_MESSAGES[dev.type] || { title: `Estado: ${dev.type}`, hint: '', severity: 'info' };
        adbLog.warn(`Device not ready: ${diag.title}`, { id: dev.id, state: dev.type });
        this.emit('device_issue', {
            deviceId: dev.id,
            state: dev.type,
            ...diag
        });
    }

    _scheduleTrackRetry() {
        if (this._trackRetryTimer || this._trackingStopped) return;
        this._trackRetryTimer = setTimeout(() => {
            this._trackRetryTimer = null;
            if (!this._trackingStopped) this.startTracking();
        }, 5000);
    }

    stopTracking() {
        this._trackingStopped = true;
        if (this._trackRetryTimer) {
            clearTimeout(this._trackRetryTimer);
            this._trackRetryTimer = null;
        }
        if (this._tracker) {
            this._tracker.end();
            this._tracker = null;
        }
    }

    async _autoConnect(deviceId) {
        try {
            const info = await this.connect(deviceId);
            this.emit('device_connected', info);
        } catch (err) {
            adbLog.error('Auto-connect failed', { id: deviceId, error: err.message });
            this.emit('device_issue', {
                deviceId,
                state: 'connect_failed',
                title: 'Falha na conexão automática',
                hint: err.message,
                severity: 'error'
            });
        }
    }

    _autoDisconnect(deviceId) {
        const previousInfo = this.deviceInfo;
        this.deviceId = null;
        this.deviceInfo = null;
        adbLog.info('Device disconnected', { id: deviceId });
        this.emit('device_disconnected', { id: deviceId, previous: previousInfo });
    }

    async connect(deviceId) {
        const devices = await this.listDevices();
        if (!devices.some(device => device.id === deviceId)) {
            // Check if device exists but is not ready
            const allDevices = await this.listAllDevices();
            const found = allDevices.find(d => d.id === deviceId);
            if (found && !found.ready) {
                const diag = found.diagnostic || {};
                throw new Error(`${diag.title || 'Dispositivo não pronto'}: ${diag.hint || `Estado: ${found.type}`}`);
            }
            throw new Error('Dispositivo não encontrado. Verifique a conexão USB e se a depuração USB está ativada.');
        }

        // If switching devices, emit disconnect for the old one
        if (this.deviceId && this.deviceId !== deviceId) {
            this._autoDisconnect(this.deviceId);
        }

        this.deviceId = deviceId;
        await this._getDeviceInfo();
        return this.deviceInfo;
    }

    async _getDeviceInfo() {
        try {
            const device = this._device();
            const run = async (cmd) => {
                const stream = await device.shell(cmd);
                return this._readStreamWithTimeout(stream, this._shellTimeout);
            };

            const [props, memInfo, storageInfo] = await Promise.allSettled([
                run('getprop'),
                run('cat /proc/meminfo'),
                run('df -k /storage/emulated/0')
            ]);

            // Even if some commands failed, use what we got
            this.deviceInfo = await buildDeviceProfile(
                this.deviceId,
                props.status === 'fulfilled' ? props.value : '',
                memInfo.status === 'fulfilled' ? memInfo.value : '',
                storageInfo.status === 'fulfilled' ? storageInfo.value : ''
            );

            const failedCmds = [props, memInfo, storageInfo].filter(r => r.status === 'rejected');
            if (failedCmds.length > 0) {
                adbLog.warn('Some device info commands failed', {
                    failed: failedCmds.length,
                    errors: failedCmds.map(r => r.reason?.message || 'unknown')
                });
            }
        } catch (err) {
            adbLog.error('Device info collection failed', { error: err.message });
            this.deviceInfo = {
                id: this.deviceId,
                serial: this.deviceId,
                model: 'Unknown',
                manufacturer: '',
                android: '',
                brand: '',
                chipset: 'Unknown',
                ramDisplay: '--',
                storageDisplay: '--',
                imageUrl: '',
                imageSource: 'local-fallback',
                displayName: 'Unknown device'
            };
        }

        return this.deviceInfo;
    }

    _readStreamWithTimeout(stream, timeoutMs) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const timer = setTimeout(() => {
                stream.removeAllListeners();
                try { stream.destroy(); } catch {}
                reject(new Error('Shell command timed out'));
            }, timeoutMs);

            stream.on('data', c => chunks.push(c));
            stream.on('end', () => {
                clearTimeout(timer);
                resolve(Buffer.concat(chunks).toString().trim());
            });
            stream.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async execute(command) {
        if (!this.deviceId) throw new Error('Nenhum dispositivo conectado. Conecte um celular via USB com depuração USB ativada.');

        // Verify device is still alive before executing
        const devices = await this.listDevices();
        if (!devices.some(d => d.id === this.deviceId)) {
            // Device vanished
            this._autoDisconnect(this.deviceId);
            throw new Error('Dispositivo foi desconectado durante a operação. Reconecte o cabo USB.');
        }

        try {
            const stream = await this._device().shell(command);
            return await this._readStreamWithTimeout(stream, this._shellTimeout);
        } catch (err) {
            // Classify the error
            if (err.message.includes('timed out')) {
                this.emit('device_issue', {
                    deviceId: this.deviceId,
                    ...DIAGNOSTIC_MESSAGES['shell_timeout']
                });
                throw new Error('Comando expirou — o dispositivo pode estar travado ou com conexão instável.');
            }
            if (err.message.includes('closed') || err.message.includes('ECONNRESET') || err.message.includes('not found')) {
                adbLog.warn('Device connection lost during execute', { error: err.message });
                this._autoDisconnect(this.deviceId);
                this.emit('device_issue', {
                    deviceId: this.deviceId,
                    ...DIAGNOSTIC_MESSAGES['connection_lost']
                });
                throw new Error('Conexão com o dispositivo perdida. Verifique o cabo USB.');
            }
            throw err;
        }
    }

    isConnected() { return !!this.deviceId; }

    getConnectionStatus() {
        return {
            connected: this.isConnected(),
            deviceId: this.deviceId,
            deviceInfo: this.deviceInfo ? {
                displayName: this.deviceInfo.displayName,
                model: this.deviceInfo.model,
                brand: this.deviceInfo.brand,
                android: this.deviceInfo.android
            } : null,
            pendingDevices: Array.from(this._pendingDevices.values()).map(d => ({
                id: d.id,
                state: d.type,
                title: d.diagnostic?.title || d.type,
                hint: d.diagnostic?.hint || ''
            })),
            trackingActive: !!this._tracker
        };
    }
}

module.exports = AdbBridge;
