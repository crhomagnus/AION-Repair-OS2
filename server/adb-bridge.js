const { Adb } = require('@devicefarmer/adbkit');
const { buildDeviceProfile } = require('./device-profile');

class AdbBridge {
    constructor() {
        this.host = process.env.ADB_HOST || '127.0.0.1';
        this.port = Number(process.env.ADB_PORT) || 5037;
        this.client = Adb.createClient({ host: this.host, port: this.port });
        this.deviceId = null;
        this.deviceInfo = null;
    }

    async listDevices() {
        try {
            const devices = await this.client.listDevices();
            return devices.filter(d => d.type === 'device').map(d => ({ id: d.id, type: d.type }));
        } catch { return []; }
    }

    async connect(deviceId) {
        const devices = await this.listDevices();
        if (!devices.some(device => device.id === deviceId)) {
            throw new Error(`Device not found or not authorized: ${deviceId}`);
        }

        this.deviceId = deviceId;
        await this._getDeviceInfo();
        return this.deviceInfo;
    }

    async _getDeviceInfo() {
        try {
            const run = async (cmd) => {
                const stream = await this.client.shell(this.deviceId, cmd);
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
        const stream = await this.client.shell(this.deviceId, command);
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
