class CmdValidator {
    constructor() {
        this.allowed = [
            'help',
            'am force-stop', 'pm clear', 'pm hide', 'pm disable-user',
            'input keyevent', 'input tap', 'input swipe',
            'screencap', 'screenrecord', 'dumpsys', 'getprop', 'setprop',
            'cat /proc/', 'cat /sys/', 'df -h', 'free', 'top', 'ps',
            'netstat', 'ifconfig', 'ip route', 'settings get', 'settings put',
            'svc wifi enable', 'svc wifi disable', 'svc data enable', 'svc data disable',
            'mkdir', 'chmod', 'chown', 'touch', 'ls -la', 'find', 'grep',
            'monkey', 'btmgmt', 'hciconfig',
            'rm -rf /data/local/tmp', 'rm /data/local/tmp',
            'dumpsys battery', 'dumpsys meminfo', 'dumpsys cpuinfo',
            'dumpsys telephony.registry', 'dumpsys wifi',
            'dumpsys bluetooth_manager', 'dumpsys media.camera',
            'cat /proc/stat', 'cat /proc/meminfo', 'cat /proc/cpuinfo',
            'cat /proc/sched_debug', 'cat /sys/class/thermal/',
            'cat /sys/class/kgsl/'
        ];
        this.blocked = [
            /^rm\s+-rf\s+\//, /^dd\s+/, /^mkfs/, /^fdisk/,
            /^reboot\s+-f/, /^shutdown/, /sysrq\s+[oebsu]/,
            /:.*\|.*sh$/, /;\s*rm\s+/, /\$\(/, /`.*`/,
            /&&\s*rm/, /\|\s*sh$/, /busybox\s+rm/, /nc\s+-e/, /\/dev\/null/
        ];
        this.dangerous = [
            /\.\./, /proc\/sys/, /sys\/firmware/, /sys\/kernel\/debug/, /proc\/kcore/
        ];
    }

    validate(cmd) {
        if (!cmd || typeof cmd !== 'string') return false;
        const t = cmd.trim();
        if (!t || t.length > 1000) return false;
        for (const p of this.blocked) if (p.test(t)) return false;
        for (const p of this.dangerous) if (p.test(t)) return false;
        return this.allowed.some(a => t.startsWith(a) || t === a);
    }
}

module.exports = CmdValidator;
