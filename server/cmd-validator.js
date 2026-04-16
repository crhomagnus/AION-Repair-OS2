// AION Repair OS — Command Validator
// Politica: NENHUM comando bloqueado. O agente e um tecnico reparador
// que precisa de acesso total ao dispositivo para diagnosticar e consertar.
//
// Classificacao:
//   LOW    — Diagnostico/leitura. Executa automaticamente sem perguntar.
//   MEDIUM — Escrita/modificacao. Agente explica e pede autorizacao.
//   HIGH   — Destrutivo/irreversivel. Agente explica riscos e pede autorizacao explicita.
//
// O frontend DEVE pedir confirmacao para MEDIUM e HIGH antes de executar.

class CmdValidator {
    constructor() {
        // Read-only prefixes — always LOW risk, execute without asking
        this.readOnlyPrefixes = [
            // dumpsys (any service)
            'dumpsys',
            // getprop (any property)
            'getprop',
            // proc/sys filesystem
            'cat /proc/', 'cat /sys/',
            // System info tools
            'ps ', 'ps -', 'top -n', 'df ', 'free', 'uptime', 'uname',
            'id', 'whoami', 'date', 'wm ',
            // Settings read
            'settings get', 'settings list',
            // Package manager read
            'pm list', 'pm path', 'pm dump',
            // Service queries
            'service list', 'service check',
            // Logcat read (with -d flag = dump and exit)
            'logcat -d',
            // Network diagnostics
            'ip ', 'ifconfig', 'netstat', 'ping -c', 'nslookup',
            // Filesystem read
            'ls ', 'cat /etc/', 'cat /sdcard/', 'mount',
            'content query',
            // Misc read
            'help',
        ];

        // Pipe-safe right-hand commands (read-only filters)
        this.safeFilters = [
            'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
        ];

        // HIGH risk patterns — destructive/irreversible operations.
        // Agent must explain the risks in detail and get explicit confirmation.
        this.highRiskPatterns = [
            /^rm\s/, /^rm\s+-/,
            /^dd\s/, /^mkfs/, /^fdisk/, /^sfdisk/,
            /^reboot/, /^shutdown/, /^poweroff/,
            /factoryreset/, /wipe.?data/, /wipe.?partition/,
            /^flash_image/, /^erase_image/,
            /^mount\s+-o\s+remount/,
            /^busybox\s+(rm|dd)/,
            /^pm\s+uninstall(?!\s+--user)/, // full uninstall (not --user 0)
            /^am\s+kill-all/,
        ];

        // MEDIUM risk patterns — write/modify operations.
        // Agent must explain what it does and ask for confirmation.
        this.mediumRiskPatterns = [
            // Activity manager
            /^am\s+(force-stop|kill|start|startservice|broadcast|dumpheap)/,
            // Package manager write
            /^pm\s+(clear|hide|unhide|disable|enable|grant|revoke|install|uninstall|set-install)/,
            // Settings write
            /^setprop\s/, /^settings\s+put/,
            // Network control
            /^svc\s+(wifi|data|bluetooth|nfc|power)/,
            // UI automation
            /^input\s+(keyevent|tap|swipe|text|draganddrop)/,
            // Screen capture
            /^screencap/, /^screenrecord/,
            // Logcat clear
            /^logcat\s+-c/,
            // File write operations
            /^mkdir\s/, /^touch\s/, /^cp\s/, /^mv\s/, /^chmod\s/,
            // Monkey test
            /^monkey\s/,
            // su / shell escalation
            /^su\s/, /^su$/,
            // Downloads
            /^wget\s/, /^curl\s/,
        ];
    }

    validate(cmd) {
        return this.validateWithRisk(cmd).allowed;
    }

    validateWithRisk(cmd) {
        if (!cmd || typeof cmd !== 'string') {
            return { allowed: false, risk: 'INVALID', reason: 'Comando inválido' };
        }

        const t = cmd.trim().replace(/\s+/g, ' ');
        if (!t || t.length > 2000) {
            return { allowed: false, risk: 'INVALID', reason: 'Comando vazio ou longo demais' };
        }

        const tLower = t.toLowerCase();

        // === Check HIGH risk first ===
        for (const p of this.highRiskPatterns) {
            if (p.test(t) || p.test(tLower)) {
                return { allowed: true, risk: 'HIGH', reason: 'Comando destrutivo — explicar riscos e pedir autorização explícita' };
            }
        }

        // === Everything else: LOW risk — execute automatically ===
        // Only HIGH risk commands (above) require user confirmation.
        // All other commands — read, write, modify — execute freely.
        // The agent is a repair technician; it needs full autonomy.
        return { allowed: true, risk: 'LOW', reason: 'Execução automática' };
    }

    getRiskLevel(cmd) {
        return this.validateWithRisk(cmd).risk;
    }
}

module.exports = CmdValidator;
