const EventEmitter = require('events');
const { Adb } = require('@devicefarmer/adbkit');
const { buildDeviceProfile } = require('./device-profile');
const { createLogger } = require('./logger');

const adbLog = createLogger('adb-bridge');

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
    }

    async listDevices() {
        try {
            const devices = await this.client.listDevices();
            return devices.filter(d => d.type === 'device').map(d => ({ id: d.id, type: d.type }));
        } catch { return []; }
    }

    _device() {
        return this.client.getDevice(this.deviceId);
    }

    // Start watching for device plug/unplug events
    async startTracking() {
        if (this._tracker) return;
        try {
            this._tracker = await this.client.trackDevices();
            adbLog.info('Device tracking started');

            this._tracker.on('add', (device) => {
                if (device.type !== 'device') return;
                adbLog.info('Device plugged in', { id: device.id, type: device.type });
                this._autoConnect(device.id);
            });

            this._tracker.on('remove', (device) => {
                adbLog.info('Device removed', { id: device.id });
                if (this.deviceId === device.id) {
                    this._autoDisconnect(device.id);
                }
            });

            this._tracker.on('change', (device) => {
                if (device.type === 'device' && !this.deviceId) {
                    adbLog.info('Device became ready', { id: device.id });
                    this._autoConnect(device.id);
                } else if (device.type !== 'device' && this.deviceId === device.id) {
                    adbLog.info('Device state changed, disconnecting', { id: device.id, type: device.type });
                    this._autoDisconnect(device.id);
                }
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
            const devices = await this.listDevices();
            if (devices.length > 0 && !this.deviceId) {
                adbLog.info('Found existing device on startup', { id: devices[0].id });
                this._autoConnect(devices[0].id);
            }
        } catch (err) {
            adbLog.error('Failed to start device tracking', { error: err.message });
            this._scheduleTrackRetry();
        }
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
            throw new Error(`Device not found or not authorized: ${deviceId}`);
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
                return new Promise((resolve, reject) => {
                    const chunks = [];
                    stream.on('data', c => chunks.push(c));
                    stream.on('end', () => resolve(Buffer.concat(chunks).toString().trim()));
                    stream.on('error', reject);
                });
            };

            const [props, memInfo, storageInfo] = await Promise.all([
                run('getprop'),
                run('cat /proc/meminfo'),
                run('df -k /storage/emulated/0')
            ]);

            this.deviceInfo = await buildDeviceProfile(this.deviceId, props, memInfo, storageInfo);
        } catch {
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

    async execute(command) {
        if (!this.deviceId) throw new Error('No device connected');
        const stream = await this._device().shell(command);
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString().trim()));
            stream.on('error', reject);
        });
    }

    isConnected() { return !!this.deviceId; }
}

module.exports = AdbBridge;
