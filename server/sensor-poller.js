const EventEmitter = require('events');
const { createLogger } = require('./logger');

const pollLog = createLogger('sensor-poller');

class SensorPoller extends EventEmitter {
    constructor(adb) {
        super();
        this.adb = adb;
        this.running = false;
        this._consecutiveErrors = 0;
        this._pollInterval = Number(process.env.SENSOR_POLL_INTERVAL || 500);
        this._maxConsecutiveErrors = 10;
        this._pollTimer = null;
        this.state = { cpu: 0, ram: 0, gpu: 0, temperature: 0, battery: { level: 0, charging: false }, disk: 0, signal: -1, latency: 0, bluetooth: false, wifi: false, camera: false, memory: 0 };
    }

    async start() {
        if (this.running) return;
        this.running = true;
        this._consecutiveErrors = 0;
        pollLog.info('Sensor polling started');
        this._poll();
    }

    stop() {
        this.running = false;
        if (this._pollTimer) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        pollLog.info('Sensor polling stopped');
    }

    async _poll() {
        if (!this.running) return;

        if (!this.adb.isConnected()) {
            this._consecutiveErrors++;
            if (this._consecutiveErrors === 1 || this._consecutiveErrors % 20 === 0) {
                pollLog.warn('Device not connected, waiting...', { consecutiveErrors: this._consecutiveErrors });
            }
            this.emit('device_lost');
            const backoff = Math.min(this._pollInterval * Math.pow(2, Math.min(this._consecutiveErrors, 6)), 30000);
            this._pollTimer = setTimeout(() => this._poll(), backoff);
            return;
        }

        try {
            const [cpu, ram, gpu, temp, battery, disk, signal, latency, bt, wifi, cam, memory] = await Promise.allSettled([
                this._cpu(), this._ram(), this._gpu(), this._temp(), this._battery(), this._disk(), this._signal(), this._latency(), this._bt(), this._wifi(), this._camera(), this._memory()
            ]);

            const failedCount = [cpu, ram, gpu, temp, battery, disk, signal, latency, bt, wifi, cam, memory]
                .filter(r => r.status === 'rejected').length;

            if (failedCount === 12) {
                this._consecutiveErrors++;
                if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
                    pollLog.error('All sensors failed, device may be disconnected', { consecutiveErrors: this._consecutiveErrors });
                    this.emit('device_lost');
                }
            } else {
                if (this._consecutiveErrors > 0) {
                    pollLog.info('Sensor polling recovered', { previousErrors: this._consecutiveErrors });
                }
                this._consecutiveErrors = 0;
            }

            this.state = {
                cpu: cpu.status === 'fulfilled' ? cpu.value : this.state.cpu,
                ram: ram.status === 'fulfilled' ? ram.value : this.state.ram,
                gpu: gpu.status === 'fulfilled' ? gpu.value : this.state.gpu,
                temperature: temp.status === 'fulfilled' ? temp.value : this.state.temperature,
                battery: battery.status === 'fulfilled' ? battery.value : this.state.battery,
                disk: disk.status === 'fulfilled' ? disk.value : this.state.disk,
                signal: signal.status === 'fulfilled' ? signal.value : this.state.signal,
                latency: latency.status === 'fulfilled' ? latency.value : this.state.latency,
                bluetooth: bt.status === 'fulfilled' ? bt.value : this.state.bluetooth,
                wifi: wifi.status === 'fulfilled' ? wifi.value : this.state.wifi,
                camera: cam.status === 'fulfilled' ? cam.value : this.state.camera,
                memory: memory.status === 'fulfilled' ? memory.value : this.state.memory
            };

            this.emit('data', { ...this.state, timestamp: Date.now() });
        } catch (err) {
            this._consecutiveErrors++;
            pollLog.error('Poll cycle failed', { error: err.message });
        }
        if (this.running) {
            this._pollTimer = setTimeout(() => this._poll(), this._pollInterval);
        }
    }

    async _exec(cmd) {
        return await this.adb.execute(cmd);
    }

    async _cpu() {
        const out = await this._exec('cat /proc/stat');
        const line = out.split('\n').find(l => l.startsWith('cpu '));
        if (!line) return this.state.cpu;
        const vals = line.split(/\s+/).slice(1, 8).map(Number);
        const total = vals.reduce((a, b) => a + b, 0);
        return Math.min(100, Math.max(0, Math.round((1 - vals[3] / total) * 100)));
    }

    async _ram() {
        const out = await this._exec('cat /proc/meminfo');
        const avail = out.match(/MemAvailable:\s+(\d+)/);
        const total = out.match(/MemTotal:\s+(\d+)/);
        if (!avail || !total) return this.state.ram;
        return Math.round((1 - parseInt(avail[1]) / parseInt(total[1])) * 100);
    }

    async _gpu() {
        try {
            const out = await this._exec('cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage');
            const v = parseInt(out);
            if (!isNaN(v) && v >= 0 && v <= 100) return v;
        } catch {}
        try {
            const out = await this._exec('cat /sys/kernel/debug/mali0/gpu_utilization');
            const v = parseInt(out);
            if (!isNaN(v) && v >= 0 && v <= 100) return v;
        } catch {}
        try {
            const out = await this._exec('cat /proc/mali/utilization');
            const v = parseInt(out);
            if (!isNaN(v) && v >= 0 && v <= 100) return v;
        } catch {}
        return 0;
    }

    async _temp() {
        try {
            const out = await this._exec('cat /sys/class/thermal/thermal_zone*/temp');
            const temps = out.split('\n').map(l => parseInt(l.trim())).filter(v => !isNaN(v) && v > 0 && v < 200000);
            if (temps.length) return Math.round(Math.max(...temps) / 1000);
        } catch {}
        try {
            const out = await this._exec('dumpsys battery');
            const m = out.match(/temperature:\s*(\d+)/);
            if (m) return Math.round(parseInt(m[1]) / 10);
        } catch {}
        return this.state.temperature;
    }

    async _battery() {
        try {
            const out = await this._exec('dumpsys battery');
            const level = out.match(/level:\s*(\d+)/);
            const status = out.match(/status:\s*(\d+)/);
            const temp = out.match(/temperature:\s*(\d+)/);
            const charging = status ? (parseInt(status[1]) === 2 || parseInt(status[1]) === 5) : false;
            if (temp && !this.state.temperature) {
                this.state.temperature = Math.round(parseInt(temp[1]) / 10);
            }
            return { level: level ? parseInt(level[1]) : 0, charging };
        } catch { return this.state.battery; }
    }

    async _disk() {
        try {
            const out = await this._exec('df -h /data');
            const m = out.match(/(\d+)%/);
            return m ? parseInt(m[1]) : this.state.disk;
        } catch { return this.state.disk; }
    }

    async _signal() {
        try {
            const out = await this._exec('dumpsys telephony.registry');
            const signalLine = out.split('\n').find(line => /mSignalStrength|mCellSignalStrength|SignalStrength/i.test(line)) || out;
            const dbmMatch = signalLine.match(/(-\d+)\s*dBm/i) || out.match(/(-\d+)\s*dBm/i);
            if (dbmMatch) return parseInt(dbmMatch[1], 10);

            const negativeValues = signalLine.match(/-\d+/g);
            if (negativeValues && negativeValues.length) return parseInt(negativeValues[0], 10);

            const level = signalLine.match(/(?:level|bars)[=: ]+(\d+)/i);
            if (level) return -113 + (parseInt(level[1], 10) * 10);
        } catch {}
        try {
            const out = await this._exec('dumpsys connectivity');
            if (out.toLowerCase().includes('wifi')) return -50;
        } catch {}
        return this.state.signal;
    }

    async _latency() {
        try {
            const out = await this._exec('cat /proc/sched_debug');
            const m = out.match(/runnable.*?(\d+)/);
            return m ? Math.min(100, parseInt(m[1])) : this.state.latency;
        } catch { return this.state.latency; }
    }

    async _bt() {
        try { const out = await this._exec('dumpsys bluetooth_manager'); return out.toLowerCase().includes('state') && !out.toLowerCase().includes('off'); } catch { return false; }
    }

    async _wifi() {
        try { const out = await this._exec('dumpsys wifi'); return out.toLowerCase().includes('enabled') || out.toLowerCase().includes('connected'); } catch { return false; }
    }

    async _camera() {
        try { const out = await this._exec('dumpsys media.camera'); return out.toLowerCase().includes('camera'); } catch { return false; }
    }

    async _memory() {
        try {
            const out = await this._exec('cat /proc/meminfo');
            const memFree = out.match(/MemFree:\s+(\d+)/);
            const cached = out.match(/Cached:\s+(\d+)/);
            const total = out.match(/MemTotal:\s+(\d+)/);
            if (!total) return this.state.memory;
            const used = parseInt(total[1]) - parseInt(memFree ? memFree[1] : 0) - parseInt(cached ? cached[1] : 0);
            return Math.round((used / parseInt(total[1])) * 100);
        } catch { return this.state.memory; }
    }

    getState() { return { ...this.state }; }
}

module.exports = SensorPoller;
