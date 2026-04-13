class CmdValidator {
    constructor() {
        // LOW RISK - Read-only diagnostics and information gathering
        this.lowRisk = [
            'help',

            // === DUMPSYS (system service dumps) ===
            'dumpsys battery', 'dumpsys batterystats',
            'dumpsys meminfo', 'dumpsys cpuinfo', 'dumpsys procstats',
            'dumpsys wifi', 'dumpsys telephony.registry', 'dumpsys telephony registry',
            'dumpsys bluetooth_manager', 'dumpsys media.camera',
            'dumpsys connectivity', 'dumpsys activity',
            'dumpsys package', 'dumpsys alarm', 'dumpsys notification',
            'dumpsys window', 'dumpsys display', 'dumpsys power',
            'dumpsys deviceidle', 'dumpsys usagestats',
            'dumpsys netstats', 'dumpsys netpolicy',
            'dumpsys iphonesubinfo', 'dumpsys telecom',
            'dumpsys carrier_config', 'dumpsys phone',
            'dumpsys mount', 'dumpsys diskstats',
            'dumpsys sensorservice', 'dumpsys input',
            'dumpsys audio', 'dumpsys media.audio_flinger',
            'dumpsys gfxinfo', 'dumpsys graphicsstats',
            'dumpsys accessibility', 'dumpsys account',
            'dumpsys content', 'dumpsys statusbar',
            'dumpsys -l',

            // === PROC filesystem (read-only kernel info) ===
            'cat /proc/stat', 'cat /proc/meminfo', 'cat /proc/cpuinfo',
            'cat /proc/loadavg', 'cat /proc/uptime', 'cat /proc/version',
            'cat /proc/sched_debug', 'cat /proc/vmstat',
            'cat /proc/net/dev', 'cat /proc/net/tcp', 'cat /proc/net/tcp6',
            'cat /proc/net/udp', 'cat /proc/net/wireless',
            'cat /proc/diskstats', 'cat /proc/mounts',
            'cat /proc/partitions', 'cat /proc/filesystems',

            // === SYS filesystem (hardware/kernel info) ===
            'cat /sys/class/thermal/', 'cat /sys/class/kgsl/',
            'cat /sys/class/power_supply/', 'cat /sys/class/net/',
            'cat /sys/devices/',

            // === System tools ===
            'df -h', 'df -k', 'free', 'top -n 1', 'ps -A', 'ps -ef',
            'uptime', 'uname -a', 'id', 'whoami', 'date',
            'ls -la /sdcard/', 'ls -la /data/local/tmp/',
            'ls /sdcard/', 'ls /data/local/tmp/',
            'wc -l',

            // === Network diagnostics ===
            'ifconfig', 'ip route', 'ip addr', 'ip link',
            'netstat -t', 'netstat -tlnp', 'netstat -an',
            'ping -c 3', 'ping -c 1',
            'nslookup', 'getprop net.',

            // === Getprop (all read-only) ===
            'getprop',
            'getprop ro.build.version.release',
            'getprop ro.build.version.sdk',
            'getprop ro.build.version.security_patch',
            'getprop ro.product.model',
            'getprop ro.product.manufacturer',
            'getprop ro.product.brand',
            'getprop ro.serialno',
            'getprop ro.boot.selinux',
            'getprop ro.crypto.state',
            'getprop ro.hardware',
            'getprop ro.board.platform',
            'getprop gsm.',
            'getprop persist.sys.',
            'getprop net.',
            'getprop ro.',
            'getprop sys.',

            // === Settings (read) ===
            'settings get', 'settings list',

            // === Package manager (read-only) ===
            'pm list packages', 'pm list packages -3', 'pm list packages -s',
            'pm list packages -d', 'pm list packages -e',
            'pm list features', 'pm list permissions',
            'pm list instrumentation',
            'pm path', 'pm dump',

            // === Logcat (read, with timestamp limit) ===
            'logcat -d', 'logcat -d -t', 'logcat -d -b',
            'logcat -d -s', 'logcat -d -v',
            'logcat --pid=',

            // === Service list ===
            'service list', 'service check',

            // === Content provider queries ===
            'content query --uri',

            // === Misc diagnostics ===
            'cat /etc/hosts',
            'mount',
            'dumpsys SurfaceFlinger',
            'dumpsys input_method',

            // === Baseband/Modem diagnostics ===
            'getprop gsm.version.baseband',
            'getprop gsm.version.ril-impl',
            'getprop persist.radio.modem.version',
            'getprop gsm.operator.alpha',
            'getprop gsm.network.type',
            'getprop gsm.sim.state',
            'getprop gsm.sim.operator.alpha',
            'getprop gsm.nitz.time',
            'getprop rild.libpath', 'getprop rild.libargs',

            // === Firmware diagnostics ===
            'getprop ro.build.fingerprint',
            'getprop ro.build.date',
            'getprop ro.build.type',
            'getprop ro.build.flavor',
            'getprop ro.bootloader',
            'getprop ro.vendor.build.security_patch',
            'getprop ro.boot.slot_suffix',

            // === AT command / serial port detection ===
            'ls -la /dev/smd*', 'ls -la /dev/ttyUSB*',
            'ls -la /dev/ttyACM*', 'ls -la /dev/ttyHS*',
            'ls -la /dev/diag',
            'getprop persist.sys.usb.config',

            // === Location/sensors ===
            'dumpsys location',

            // === Settings system ===
            'settings list system',

            // === Window manager ===
            'wm size', 'wm density',
            'settings get system screen_brightness',
            'settings get system screen_brightness_mode',
            'settings get system screen_off_timeout',
            'settings get system volume_music',
            'settings get system volume_ring',
            'settings get system volume_alarm',
            'settings get system volume_notification',
            'settings get global mode_ringer',

            // === Piped commands (read-only, grep filtering) ===
            'dumpsys window | grep mCurrentFocus',
            'dumpsys window | grep mRotation',
            'dumpsys activity activities | grep mResumedActivity',
            'dumpsys activity activities | grep -E',
            'dumpsys input | grep -A2',
            'dumpsys input_method | grep mCurMethodId',
            'dumpsys power | grep mScreenOn',
            'dumpsys meminfo --compact',
            'logcat -d -b events -t 200 | grep am_proc_died',
            'logcat -d -t 200 | grep -i'
        ];

        // Pipe-safe patterns: commands with | that are read-only grep filters
        this.safePipePatterns = [
            /^dumpsys\s+\w+.*\|\s*grep\s/,
            /^logcat\s+-d.*\|\s*grep\s/,
            /^pm\s+list\s.*\|\s*grep\s/,
            /^ps\s.*\|\s*grep\s/,
            /^cat\s+\/proc\/.*\|\s*grep\s/,
        ];

        // MEDIUM RISK - Write operations, requires REPAIR mode
        this.mediumRisk = [
            // === Activity manager ===
            'am force-stop', 'am kill', 'am start', 'am startservice',
            'am broadcast', 'am dumpheap',

            // === Package manager (write) ===
            'pm clear', 'pm hide', 'pm unhide',
            'pm disable-user', 'pm enable', 'pm enable-user',
            'pm grant', 'pm revoke',
            'pm install', 'pm install-existing',
            'pm uninstall --user 0',
            'pm set-install-location',

            // === Settings (write) ===
            'setprop', 'settings put',

            // === Network control ===
            'svc wifi enable', 'svc wifi disable',
            'svc data enable', 'svc data disable',
            'svc bluetooth enable', 'svc bluetooth disable',
            'svc nfc enable', 'svc nfc disable',
            'svc power stayon',

            // === UI automation ===
            'input keyevent', 'input tap', 'input swipe',
            'input text', 'input draganddrop',

            // === Screen capture ===
            'screencap', 'screenrecord',

            // === Logcat (write) ===
            'logcat -c',

            // === File operations (safe paths only) ===
            'mkdir /sdcard/', 'touch /sdcard/',
            'rm /sdcard', 'cp /sdcard/',
            'mkdir /data/local/tmp/', 'touch /data/local/tmp/',
            'rm /data/local/tmp/',
            'chmod 644', 'chmod 755',

            // === Monkey (stress test) ===
            'monkey',

            // === ADB file transfer ===
            'cat /sdcard/'
        ];

        // HIGH RISK - Destructive, requires FORENSIC mode + explicit confirm
        this.highRisk = [
            'rm -rf /data/local/tmp',
            'rm /data/local/tmp',
            'factoryreset', 'wipe data', 'wipe_partition',
            'reboot', 'reboot bootloader', 'reboot recovery', 'reboot fastboot', 'reboot edl',
            'dd', 'mkfs', 'fdisk',
            'busybox rm -rf', 'busybox dd',
            'pm uninstall',
            'am kill-all'
        ];

        // BLOCKED - Never allowed (regex patterns)
        this.blocked = [
            /^rm\s+-rf\s+\//, /^rm\s+-rf\s+\/system/, /^rm\s+-rf\s+\/data(?!\/local)/,
            /^dd\s+if=/, /^mkfs\./, /^fdisk\s/, /^sfdisk/,
            /^reboot\s+-[fp]$/, /^shutdown/, /sysrq\s+[oebsu]/,
            /:.*\|.*sh$/, /;\s*rm\s+/, /\$\(/, /`[^`]*`/,
            /&&\s*rm/, /\|\s*sh\s*$/, /\|\s*bash\s*$/, /\|\s*\/bin\/sh/,
            /busybox\s+rm\s.*-rf\s+\//,
            /nc\s+-[elp]/, /\/dev\/null/, /\|\s*sh\s*$/,
            /eval\s+/, /exec\s+/, /;\s*sh\s*$/,
            /&\s*$/, /\|\s*grep.*-i.*pass/,
            /^wget\s/, /^curl\s/,
            /^su\s/, /^su$/, /^chmod\s+[0-7]{3}\s+\/system/,
            /^mount\s+-o\s+remount/,
            /^flash_image/, /^erase_image/,
            /^cat\s+\/dev\/block/
        ];

        this.dangerous = [
            /\.\.\//, /proc\/sys\/core/, /sys\/firmware\//,
            /sys\/kernel\/debug\//, /proc\/kcore/,
            /\/system\/app\//, /\/data\/app\/.*\/lib/,
            /\/data\/data\//, /\/data\/system\//
        ];
    }

    _matchesPrefix(command, pattern) {
        return command === pattern || command.startsWith(pattern + ' ');
    }

    validate(cmd) {
        return this.validateWithRisk(cmd).allowed;
    }

    validateWithRisk(cmd) {
        if (!cmd || typeof cmd !== 'string') {
            return { allowed: false, risk: 'UNKNOWN', reason: 'Invalid command' };
        }

        // Normalize: trim, collapse whitespace
        const t = cmd.trim().replace(/\s+/g, ' ');
        if (!t || t.length > 1000) {
            return { allowed: false, risk: 'UNKNOWN', reason: 'Command too long or empty' };
        }

        const tLower = t.toLowerCase();

        // Check if command matches safe pipe patterns (read-only grep filters)
        // These bypass the general pipe block in blocked patterns
        const isSafePipe = t.includes('|') && this.safePipePatterns.some(p => p.test(t));

        // Check blocked patterns first (skip pipe blocks for safe pipes)
        for (const p of this.blocked) {
            if (isSafePipe && (p.source.includes('\\|') || p.source.includes('pipe'))) continue;
            if (p.test(t) || p.test(tLower)) {
                return { allowed: false, risk: 'BLOCKED', reason: 'Command matches blocked pattern' };
            }
        }

        // Check dangerous patterns
        for (const p of this.dangerous) {
            if (p.test(t)) {
                return { allowed: false, risk: 'DANGEROUS', reason: 'Path traversal or dangerous access' };
            }
        }

        // Check HIGH risk — prefix match with word boundary
        for (const pattern of this.highRisk) {
            if (this._matchesPrefix(tLower, pattern.toLowerCase())) {
                return { allowed: true, risk: 'HIGH', reason: 'Requires FORENSIC mode + confirmation' };
            }
        }

        // Check MEDIUM risk — prefix match with word boundary
        for (const pattern of this.mediumRisk) {
            if (this._matchesPrefix(tLower, pattern.toLowerCase())) {
                return { allowed: true, risk: 'MEDIUM', reason: 'Requires REPAIR mode' };
            }
        }

        // Check LOW risk — prefix match with word boundary
        for (const pattern of this.lowRisk) {
            if (this._matchesPrefix(tLower, pattern.toLowerCase())) {
                return { allowed: true, risk: 'LOW', reason: 'Safe diagnostic command' };
            }
        }

        // OPEN POLICY: Commands that passed all blocked/dangerous/high/medium checks
        // are read-only by definition (no rm, reboot, dd, etc matched).
        // Allow them as LOW risk — the agent needs freedom to investigate.
        // Read-only commands (dumpsys, getprop, cat, ls, logcat -d, ps, etc.)
        // that aren't in the whitelist but aren't dangerous either.
        const readOnlyPrefixes = [
            'dumpsys', 'getprop', 'cat /proc/', 'cat /sys/', 'ls ',
            'ps ', 'top ', 'df ', 'free', 'uptime', 'uname',
            'id', 'whoami', 'date', 'wm ', 'settings get', 'settings list',
            'pm list', 'pm path', 'pm dump', 'service ', 'logcat -d',
            'ip ', 'ifconfig', 'netstat', 'ping -c', 'nslookup',
            'cat /etc/', 'mount', 'content query',
        ];
        for (const prefix of readOnlyPrefixes) {
            if (tLower.startsWith(prefix)) {
                return { allowed: true, risk: 'LOW', reason: 'Read-only command (open policy)' };
            }
        }

        // Pipe commands: if left side is read-only and right side is grep/head/tail/wc/sort, allow
        if (t.includes('|')) {
            const parts = t.split('|').map(p => p.trim());
            const leftCmd = parts[0].toLowerCase();
            const rightCmds = parts.slice(1).map(p => p.trim().toLowerCase());
            const leftIsReadOnly = readOnlyPrefixes.some(p => leftCmd.startsWith(p));
            const rightIsSafe = rightCmds.every(r =>
                r.startsWith('grep') || r.startsWith('head') || r.startsWith('tail') ||
                r.startsWith('wc') || r.startsWith('sort') || r.startsWith('uniq') ||
                r.startsWith('cut') || r.startsWith('awk') || r.startsWith('sed')
            );
            if (leftIsReadOnly && rightIsSafe) {
                return { allowed: true, risk: 'LOW', reason: 'Read-only pipe (open policy)' };
            }
        }

        return { allowed: false, risk: 'UNKNOWN', reason: 'Command not in whitelist' };
    }

    getRiskLevel(cmd) {
        return this.validateWithRisk(cmd).risk;
    }
}

module.exports = CmdValidator;
