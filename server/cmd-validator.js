class CmdValidator {
    constructor() {
        // LOW RISK - Read-only diagnostics
        this.lowRisk = [
            'help',
            'dumpsys battery', 'dumpsys meminfo', 'dumpsys cpuinfo',
            'dumpsys wifi', 'dumpsys telephony.registry',
            'dumpsys bluetooth_manager', 'dumpsys media.camera',
            'dumpsys connectivity', 'dumpsys activity',
            'cat /proc/stat', 'cat /proc/meminfo', 'cat /proc/cpuinfo',
            'cat /proc/loadavg', 'cat /proc/uptime',
            'cat /proc/sched_debug', 'cat /sys/class/thermal/',
            'cat /sys/class/kgsl/', 'cat /sys/devices/',
            'df -h', 'free', 'top -n 1', 'ps -A',
            'getprop', 'getprop ro.*', 'settings get',
            'ifconfig', 'ip route', 'netstat -t',
            'pm list packages', 'pm list features',
            'dumpsys package', 'dumpsys alarm'
        ];

        // MEDIUM RISK - Write operations, requires REPAIR mode
        this.mediumRisk = [
            'am force-stop', 'pm clear', 'pm hide',
            'pm disable-user', 'pm enable-user',
            'setprop', 'settings put',
            'svc wifi enable', 'svc wifi disable',
            'svc data enable', 'svc data disable',
            'input keyevent', 'input tap', 'input swipe',
            'screencap', 'screenrecord',
            'monkey', 'logcat -c', 'logcat -d',
            'mkdir /sdcard/', 'touch /sdcard/',
            'chmod 644', 'chmod 755'
        ];

        // HIGH RISK - Destructive, requires FORENSIC mode + explicit confirm
        this.highRisk = [
            'rm -rf /data/local/tmp',
            'rm /data/local/tmp',
            'factoryreset', 'wipe data', 'wipe_partition',
            'reboot bootloader', 'reboot recovery',
            'dd', 'mkfs', 'fdisk',
            'busybox rm -rf', 'busybox dd'
        ];

        // BLOCKED - Never allowed
        this.blocked = [
            /^rm\s+-rf\s+\//, /^rm\s+-rf\s+system/, /^rm\s+-rf\s+data/,
            /^dd\s+/, /^mkfs/, /^fdisk/, /^sfdisk/,
            /^reboot\s+-f$/, /^shutdown/, /sysrq\s+[oebsu]/,
            /:.*\|.*sh$/, /;\s*rm\s+/, /\$\(/, /`.*`/,
            /&&\s*rm/, /\|\s*sh$/, /busybox\s+rm.*rf/,
            /nc\s+-e/, /\/dev\/null/, /\|\s*sh\s*$/,
            /eval\s+\(/, /exec\s+/, /;\s*sh\s*$/,
            /2>&1/, /&\s*$/, /\|\s*grep.*-i.*pass/
        ];

        this.dangerous = [
            /\.\./, /proc\/sys\/core/, /sys\/firmware/,
            /sys\/kernel\/debug\//, /proc\/kcore/,
            /\/system\/app\//, /\/data\/app\/.*\/lib/
        ];
    }

    validate(cmd) {
        return this.validateWithRisk(cmd).allowed;
    }

    validateWithRisk(cmd) {
        if (!cmd || typeof cmd !== 'string') {
            return { allowed: false, risk: 'UNKNOWN', reason: 'Invalid command' };
        }

        const t = cmd.trim();
        if (!t || t.length > 1000) {
            return { allowed: false, risk: 'UNKNOWN', reason: 'Command too long or empty' };
        }

        // Check blocked patterns
        for (const p of this.blocked) {
            if (p.test(t)) {
                return { allowed: false, risk: 'BLOCKED', reason: 'Command matches blocked pattern' };
            }
        }

        // Check dangerous patterns
        for (const p of this.dangerous) {
            if (p.test(t)) {
                return { allowed: false, risk: 'DANGEROUS', reason: 'Path traversal or dangerous access' };
            }
        }

        // Check HIGH risk first
        for (const pattern of this.highRisk) {
            if (t.toLowerCase().includes(pattern.toLowerCase())) {
                return { allowed: true, risk: 'HIGH', reason: 'Requires FORENSIC mode + confirmation' };
            }
        }

        // Check MEDIUM risk
        for (const pattern of this.mediumRisk) {
            if (t.startsWith(pattern) || t.toLowerCase().startsWith(pattern.toLowerCase())) {
                return { allowed: true, risk: 'MEDIUM', reason: 'Requires REPAIR mode' };
            }
        }

        // Check LOW risk
        for (const pattern of this.lowRisk) {
            if (t.startsWith(pattern) || t.toLowerCase().startsWith(pattern.toLowerCase())) {
                return { allowed: true, risk: 'LOW', reason: 'Safe diagnostic command' };
            }
        }

        return { allowed: false, risk: 'UNKNOWN', reason: 'Command not in whitelist' };
    }

    getRiskLevel(cmd) {
        return this.validateWithRisk(cmd).risk;
    }
}

module.exports = CmdValidator;
