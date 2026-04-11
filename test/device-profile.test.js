const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// We test only the pure functions that don't require network access.
// buildDeviceProfile needs network for image lookup, so we test the parsers separately.
// Import the module to ensure it loads, then test via internal-facing helpers.

const DeviceProfile = require('../server/device-profile');

// Since only buildDeviceProfile and buildFallbackDeviceArt are exported,
// we test buildFallbackDeviceArt and also import the file to test parsing
// by calling buildDeviceProfile with mocked data.

describe('device-profile module', () => {
    it('exports buildDeviceProfile and buildFallbackDeviceArt', () => {
        assert.equal(typeof DeviceProfile.buildDeviceProfile, 'function');
        assert.equal(typeof DeviceProfile.buildFallbackDeviceArt, 'function');
    });

    describe('buildFallbackDeviceArt', () => {
        it('returns a data URI SVG', () => {
            const result = DeviceProfile.buildFallbackDeviceArt({
                brand: 'Xiaomi',
                model: 'Mi A3',
                serial: 'abc123',
                chipset: 'Qualcomm SDM665',
                ramDisplay: '4 GB',
                storageDisplay: '64 GB total'
            });

            assert.ok(result.startsWith('data:image/svg+xml;'));
            assert.ok(result.includes('Xiaomi'));
            assert.ok(result.includes('Mi%20A3') || result.includes('Mi A3'));
        });

        it('handles missing values gracefully', () => {
            const result = DeviceProfile.buildFallbackDeviceArt({});
            assert.ok(result.startsWith('data:image/svg+xml;'));
        });

        it('escapes XML special characters', () => {
            const result = DeviceProfile.buildFallbackDeviceArt({
                brand: 'Test<Brand>',
                model: 'Model&"Special"',
                serial: '<script>',
                chipset: 'A & B',
                ramDisplay: '4 GB',
                storageDisplay: '64 GB'
            });
            assert.ok(!result.includes('<script>'));
            assert.ok(!result.includes('Model&"'));
        });
    });

    describe('buildDeviceProfile (requires network, may be slow)', () => {
        const sampleGetprop = [
            '[ro.product.brand]: [Xiaomi]',
            '[ro.product.manufacturer]: [Xiaomi]',
            '[ro.product.model]: [Mi A3]',
            '[ro.product.device]: [laurel_sprout]',
            '[ro.product.name]: [laurel_sprout]',
            '[ro.product.board]: [sdm665]',
            '[ro.build.version.release]: [11]',
            '[ro.build.version.sdk]: [30]',
            '[ro.build.id]: [RKQ1.200903.002]',
            '[ro.build.fingerprint]: [Xiaomi/laurel_sprout/laurel_sprout:11/RKQ1.200903.002]',
            '[ro.build.version.security_patch]: [2021-10-01]',
            '[ro.soc.model]: [SDM665]',
            '[ro.soc.manufacturer]: [Qualcomm]',
            '[ro.board.platform]: [sdm665]',
        ].join('\n');

        const sampleMemInfo = [
            'MemTotal:        3891516 kB',
            'MemFree:          234124 kB',
            'MemAvailable:    1845200 kB',
            'Cached:           812000 kB',
        ].join('\n');

        const sampleDf = [
            'Filesystem     1K-blocks    Used Available Use% Mounted on',
            '/dev/fuse       52403200 33600000  18803200  65% /storage/emulated/0',
        ].join('\n');

        it('parses getprop, meminfo, and df correctly', { timeout: 30000 }, async () => {
            const profile = await DeviceProfile.buildDeviceProfile(
                'abc123', sampleGetprop, sampleMemInfo, sampleDf
            );

            assert.equal(profile.brand, 'Xiaomi');
            assert.equal(profile.model, 'Mi A3');
            assert.equal(profile.android, '11');
            assert.equal(profile.androidSdk, '30');
            assert.ok(profile.device.toLowerCase().includes('laurel'));
            assert.ok(profile.chipset.includes('Qualcomm'));
            assert.ok(profile.chipset.includes('SDM665'));
            assert.ok(profile.ramTotalMb > 3000);
            assert.ok(profile.storageTotalGb > 40);
            assert.equal(profile.serial, 'abc123');
            assert.ok(profile.displayName.includes('Xiaomi'));
            assert.ok(profile.summary.includes('Xiaomi'));
        });

        it('handles empty input gracefully', { timeout: 30000 }, async () => {
            const profile = await DeviceProfile.buildDeviceProfile('unknown', '', '', '');

            assert.equal(profile.id, 'unknown');
            assert.equal(profile.brand, 'Unknown');
            assert.equal(profile.model, 'Unknown');
            assert.equal(profile.ramTotalMb, 0);
            assert.equal(profile.storageTotalGb, 0);
            assert.ok(profile.fallbackImageUrl.startsWith('data:image/svg+xml;'));
        });
    });
});
