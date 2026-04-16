const { describe, it } = require('node:test');
const assert = require('node:assert');
const CmdValidator = require('../server/cmd-validator');

describe('CmdValidator', () => {
    const v = new CmdValidator();

    describe('LOW risk — auto-execute (diagnostics)', () => {
        const cmds = [
            'dumpsys battery', 'getprop ro.build.version.release',
            'cat /proc/meminfo', 'ps -A', 'df -h', 'pm list packages -3',
            'logcat -d -t 50', 'settings get global adb_enabled',
            'ip addr', 'ping -c 3 8.8.8.8', 'ls /sdcard/',
        ];
        for (const cmd of cmds) {
            it(`"${cmd}" → LOW`, () => {
                const r = v.validateWithRisk(cmd);
                assert.equal(r.allowed, true);
                assert.equal(r.risk, 'LOW');
            });
        }
    });

    describe('LOW risk — modification commands (also auto-execute)', () => {
        const cmds = [
            'am force-stop com.example.app', 'pm clear com.example.app',
            'settings put global adb_enabled 0', 'svc wifi disable',
            'input keyevent 26', 'screencap -p /sdcard/screen.png',
            'pm uninstall --user 0 com.adware.app',
        ];
        for (const cmd of cmds) {
            it(`"${cmd}" → LOW (auto)`, () => {
                const r = v.validateWithRisk(cmd);
                assert.equal(r.allowed, true);
                assert.equal(r.risk, 'LOW');
            });
        }
    });

    describe('HIGH risk — destructive (needs user confirmation)', () => {
        const cmds = [
            'rm -rf /data/local/tmp', 'reboot', 'reboot recovery',
            'dd if=/dev/zero of=/sdcard/test', 'pm uninstall com.example.app',
        ];
        for (const cmd of cmds) {
            it(`"${cmd}" → HIGH`, () => {
                const r = v.validateWithRisk(cmd);
                assert.equal(r.allowed, true);
                assert.equal(r.risk, 'HIGH');
            });
        }
    });

    describe('Unknown commands → LOW (auto-execute)', () => {
        const cmds = ['apt install vim', 'npm install', 'echo hello'];
        for (const cmd of cmds) {
            it(`"${cmd}" → LOW`, () => {
                const r = v.validateWithRisk(cmd);
                assert.equal(r.allowed, true);
                assert.equal(r.risk, 'LOW');
            });
        }
    });

    describe('edge cases', () => {
        it('rejects null', () => assert.equal(v.validate(null), false));
        it('rejects empty string', () => assert.equal(v.validate(''), false));
        it('rejects undefined', () => assert.equal(v.validate(undefined), false));
        it('rejects very long commands', () => assert.equal(v.validate('a'.repeat(2001)), false));
        it('validate() returns boolean', () => assert.equal(v.validate('dumpsys battery'), true));
        it('getRiskLevel()', () => {
            assert.equal(v.getRiskLevel('dumpsys battery'), 'LOW');
            assert.equal(v.getRiskLevel('reboot'), 'HIGH');
            assert.equal(v.getRiskLevel('svc wifi disable'), 'LOW');
        });
    });
});
