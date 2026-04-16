const { describe, it } = require('node:test');
const assert = require('node:assert');
const CmdValidator = require('../server/cmd-validator');

describe('CmdValidator', () => {
    const v = new CmdValidator();

    describe('LOW risk commands (auto-execute)', () => {
        const lowCmds = [
            'dumpsys battery',
            'dumpsys wifi',
            'getprop ro.build.version.release',
            'cat /proc/meminfo',
            'ps -A',
            'df -h',
            'pm list packages -3',
            'logcat -d -t 50',
            'settings get global adb_enabled',
            'ip addr',
            'ping -c 3 8.8.8.8',
            'ls /sdcard/',
        ];

        for (const cmd of lowCmds) {
            it(`allows "${cmd}" as LOW risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'LOW');
            });
        }
    });

    describe('LOW risk pipe commands', () => {
        const pipeCmds = [
            'dumpsys window | grep mCurrentFocus',
            'logcat -d -t 100 | grep -i error',
            'ps -A | grep com.whatsapp',
        ];

        for (const cmd of pipeCmds) {
            it(`allows "${cmd}" as LOW risk pipe`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'LOW');
            });
        }
    });

    describe('MEDIUM risk commands (require confirmation)', () => {
        const medCmds = [
            'am force-stop com.example.app',
            'pm clear com.example.app',
            'pm disable-user --user 0 com.example.app',
            'settings put global adb_enabled 0',
            'input keyevent 26',
            'screencap -p /sdcard/screen.png',
            'svc wifi disable',
        ];

        for (const cmd of medCmds) {
            it(`allows "${cmd}" as MEDIUM risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'MEDIUM');
            });
        }
    });

    describe('HIGH risk commands (require explicit confirmation)', () => {
        const highCmds = [
            'rm -rf /data/local/tmp',
            'reboot',
            'reboot recovery',
            'dd if=/dev/zero of=/sdcard/test',
            'pm uninstall com.example.app',
        ];

        for (const cmd of highCmds) {
            it(`allows "${cmd}" as HIGH risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'HIGH');
            });
        }
    });

    describe('Command injection patterns (HIGH risk, not blocked)', () => {
        const injectionCmds = [
            'echo $(whoami)',
            'echo `id`',
        ];

        for (const cmd of injectionCmds) {
            it(`allows "${cmd}" as HIGH risk (injection pattern)`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'HIGH');
            });
        }
    });

    describe('Unknown commands (MEDIUM — permissive policy)', () => {
        const unknownCmds = [
            'apt install vim',
            'npm install',
            'some-custom-tool --flag',
        ];

        for (const cmd of unknownCmds) {
            it(`allows "${cmd}" as MEDIUM (requires confirmation)`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'MEDIUM');
            });
        }
    });

    describe('edge cases', () => {
        it('rejects null', () => {
            assert.equal(v.validate(null), false);
        });

        it('rejects empty string', () => {
            assert.equal(v.validate(''), false);
        });

        it('rejects undefined', () => {
            assert.equal(v.validate(undefined), false);
        });

        it('rejects very long commands', () => {
            assert.equal(v.validate('a'.repeat(2001)), false);
        });

        it('validate() returns boolean', () => {
            assert.equal(typeof v.validate('dumpsys battery'), 'boolean');
            assert.equal(v.validate('dumpsys battery'), true);
        });

        it('getRiskLevel() returns risk string', () => {
            assert.equal(v.getRiskLevel('dumpsys battery'), 'LOW');
            assert.equal(v.getRiskLevel('reboot'), 'HIGH');
            assert.equal(v.getRiskLevel('npm install'), 'MEDIUM');
        });
    });
});
