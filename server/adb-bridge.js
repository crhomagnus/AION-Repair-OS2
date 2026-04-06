const adb = require('adbkit');

class AdbBridge {
    constructor() {
        this.client = adb.createClient({ host: '127.0.0.1', port: 5037 });
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
        this.deviceId = deviceId;
        await this._getDeviceInfo();
        return this.deviceInfo;
    }

    async _getDeviceInfo() {
        try {
            const run = async (cmd) => {
                const stream = await this.client.shell(this.deviceId, cmd);
                return new Promise((resolve) => {
                    const chunks = [];
                    stream.on('data', c => chunks.push(c));
                    stream.on('end', () => resolve(Buffer.concat(chunks).toString().trim()));
                });
            };
            const [model, manufacturer, android, brand] = await Promise.all([
                run('getprop ro.product.model'),
                run('getprop ro.product.manufacturer'),
                run('getprop ro.build.version.release'),
                run('getprop ro.product.brand')
            ]);
            this.deviceInfo = { id: this.deviceId, model, manufacturer, android, brand };
        } catch {
            this.deviceInfo = { id: this.deviceId, model: 'Unknown', manufacturer: '', android: '', brand: '' };
        }
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