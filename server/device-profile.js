const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const GSMARENA_IMAGE_BASE = 'https://fdn2.gsmarena.com/vv/bigpic/';
const REQUEST_TIMEOUT_MS = 4500;

const imageCache = new Map();

function compact(values) {
    return values.filter(Boolean);
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase();
}

function slugify(value) {
    return normalizeText(value).replace(/\s+/g, '-');
}

function prettyLabel(value) {
    const text = String(value || '')
        .trim()
        .replace(/\s+/g, ' ');

    if (!text) return '';

    return text
        .split(' ')
        .map((token) => {
            if (!token) return token;
            if (/^[A-Z0-9-]+$/.test(token)) return token;
            if (/^\d+[a-z]+$/i.test(token)) return token.toUpperCase();
            if (token.length <= 3 && token === token.toUpperCase()) return token;
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        })
        .join(' ');
}

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function firstNonEmpty(...values) {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (normalized) return normalized;
    }
    return '';
}

function normalizeBrand(value) {
    const text = prettyLabel(value);
    return text || 'Unknown';
}

function parseGetprop(raw) {
    const props = {};
    const regex = /^\[(.+?)\]: \[(.*)\]$/gm;
    let match;

    while ((match = regex.exec(raw || ''))) {
        props[match[1]] = match[2];
    }

    return props;
}

function parseMemInfo(raw) {
    const totalKb = Number((raw || '').match(/MemTotal:\s+(\d+)/)?.[1] || 0);
    const availableKb = Number((raw || '').match(/MemAvailable:\s+(\d+)/)?.[1] || 0);
    const freeKb = Number((raw || '').match(/MemFree:\s+(\d+)/)?.[1] || 0);
    const cachedKb = Number((raw || '').match(/Cached:\s+(\d+)/)?.[1] || 0);
    const usedKb = totalKb && availableKb ? Math.max(0, totalKb - availableKb) : Math.max(0, totalKb - freeKb - cachedKb);

    return {
        totalKb,
        availableKb,
        usedKb,
        totalMb: Math.round(totalKb / 1024),
        availableMb: Math.round(availableKb / 1024),
        usedMb: Math.round(usedKb / 1024),
        usedPercent: totalKb ? Math.round((usedKb / totalKb) * 100) : 0
    };
}

function parseStorageInfo(raw) {
    const lines = String(raw || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const targetLine = lines.find((line) => /\s\/storage\/emulated(?:\/0)?$/.test(line))
        || lines.find((line) => /\s\/data$/.test(line))
        || lines.find((line) => line.includes('/storage/emulated'))
        || lines.find((line) => line.includes('/data'));
    if (!targetLine) {
        return {
            totalKb: 0,
            usedKb: 0,
            availableKb: 0,
            usedPercent: 0,
            totalGb: 0,
            usedGb: 0,
            availableGb: 0
        };
    }

    const parts = targetLine.split(/\s+/);
    const totalKb = Number(parts[1] || 0);
    const usedKb = Number(parts[2] || 0);
    const availableKb = Number(parts[3] || 0);
    const usedPercent = Number((parts[4] || '').replace('%', '')) || 0;

    return {
        totalKb,
        usedKb,
        availableKb,
        usedPercent,
        totalGb: Number((totalKb / 1024 / 1024).toFixed(1)),
        usedGb: Number((usedKb / 1024 / 1024).toFixed(1)),
        availableGb: Number((availableKb / 1024 / 1024).toFixed(1))
    };
}

function getPropValue(props, keys) {
    for (const key of keys) {
        const value = firstNonEmpty(props[key]);
        if (value) return value;
    }
    return '';
}

function getChipset(props) {
    const socModel = getPropValue(props, ['ro.soc.model']);
    const socManufacturer = getPropValue(props, ['ro.soc.manufacturer']);
    const boardPlatform = getPropValue(props, ['ro.board.platform']);
    const hardware = getPropValue(props, ['ro.hardware']);
    const chipName = getPropValue(props, ['ro.chipname']);
    const productBoard = getPropValue(props, ['ro.product.board']);
    const vendor = getPropValue(props, ['ro.vendor.product.board']);

    const vendorAliases = {
        qcom: 'Qualcomm',
        qti: 'Qualcomm',
        qualcomm: 'Qualcomm',
        mtk: 'MediaTek',
        mediatek: 'MediaTek',
        exynos: 'Samsung Exynos',
        samsung: 'Samsung Exynos',
        unisoc: 'UNISOC',
        spreadtrum: 'UNISOC',
        hisilicon: 'HiSilicon'
    };

    const vendorLabel = vendorAliases[normalizeText(socManufacturer)] || prettyLabel(socManufacturer);
    const candidate = firstNonEmpty(
        socModel && vendorLabel ? `${vendorLabel} ${socModel}` : '',
        socModel,
        boardPlatform,
        hardware,
        chipName,
        productBoard,
        vendor
    );

    return candidate ? prettyLabel(candidate) : 'Unknown';
}

function buildDisplayName(profile) {
    const brand = prettyLabel(profile.brand);
    const model = prettyLabel(profile.model);
    if (brand === 'Unknown' && model === 'Unknown') return 'Unknown device';
    return compact([brand, model]).join(' ').trim() || model || brand || 'Unknown device';
}

function getImageLookupTerms(profile) {
    const manufacturer = prettyLabel(profile.manufacturer);
    const brand = prettyLabel(profile.brand);
    const model = prettyLabel(profile.model);
    const displayName = buildDisplayName(profile);

    return compact([
        compact([manufacturer, model]).join(' ').trim(),
        compact([brand, model]).join(' ').trim(),
        displayName,
        model
    ]);
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'AION Repair OS/7.0',
                ...(options.headers || {})
            }
        });

        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchText(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'AION Repair OS/7.0',
                ...(options.headers || {})
            }
        });

        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchHead(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'AION Repair OS/7.0'
            }
        });

        if (!response.ok) return null;
        return response;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function lookupCommonsCategoryImage(profile) {
    const categoryTitles = getImageLookupTerms(profile).map((term) => `Category:${term}`);

    for (const categoryTitle of categoryTitles) {
        const categoryUrl = `${COMMONS_API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(categoryTitle)}&cmtype=file&cmlimit=10&format=json&origin=*`;
        const categoryJson = await fetchJson(categoryUrl);
        const members = categoryJson?.query?.categorymembers || [];
        if (!members.length) continue;

        const scoredMembers = members
            .map((member) => {
                const title = String(member.title || '');
                const haystack = normalizeText(title);
                let score = 0;
                const tokens = normalizeText(profile.displayName || profile.model || '')
                    .split(' ')
                    .filter((token) => token.length > 2);

                for (const token of tokens) {
                    if (haystack.includes(token)) score += 3;
                }
                if (normalizeText(profile.brand) && haystack.includes(normalizeText(profile.brand))) score += 2;
                if (normalizeText(profile.manufacturer) && haystack.includes(normalizeText(profile.manufacturer))) score += 2;
                if (/smartphone|phone|device|handset/.test(haystack)) score += 1;
                if (/logo|icon|app|wiki|commons/.test(haystack)) score -= 2;
                return { title, score };
            })
            .sort((a, b) => b.score - a.score);

        const best = scoredMembers[0]?.title || members[0]?.title;
        if (!best) continue;

        const fileUrl = `${COMMONS_API}?action=query&titles=${encodeURIComponent(best)}&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=1200&format=json&origin=*`;
        const fileJson = await fetchJson(fileUrl);
        const page = Object.values(fileJson?.query?.pages || {})[0];
        const info = page?.imageinfo?.[0];
        if (info?.thumburl || info?.url) {
            return {
                url: info.thumburl || info.url,
                source: 'wikimedia-commons',
                label: best
            };
        }
    }

    return null;
}

async function lookupWikidataImage(profile) {
    const searchTerms = getImageLookupTerms(profile);
    for (const term of searchTerms) {
        const searchUrl = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&type=item&limit=5&format=json&origin=*`;
        const searchJson = await fetchJson(searchUrl);
        const results = searchJson?.search || [];
        if (!results.length) continue;

        for (const result of results) {
            const entityUrl = `${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(result.id)}&props=claims&format=json&origin=*`;
            const entityJson = await fetchJson(entityUrl);
            const claims = entityJson?.entities?.[result.id]?.claims || {};
            const imageClaim = claims.P18?.[0]?.mainsnak?.datavalue?.value;
            if (!imageClaim) continue;

            const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageClaim)}?width=1200`;
            return {
                url: fileUrl,
                source: 'wikidata',
                label: imageClaim
            };
        }
    }

    return null;
}

function buildGsmArenaCandidates(profile) {
    const terms = getImageLookupTerms(profile);
    const slugs = new Set([
        slugify(terms[0] || ''),
        slugify(terms[1] || ''),
        slugify(terms[2] || ''),
        slugify(`${profile.manufacturer || ''} ${profile.model || ''}`),
        slugify(profile.model || '')
    ]);

    return [...slugs].filter(Boolean).map((slug) => `${GSMARENA_IMAGE_BASE}${slug}.jpg`);
}

async function lookupGsmArenaImage(profile) {
    for (const url of buildGsmArenaCandidates(profile)) {
        const response = await fetchHead(url);
        const contentType = response?.headers?.get('content-type') || '';
        if (contentType.startsWith('image/')) {
            return {
                url,
                source: 'gsmarena',
                label: url.split('/').pop()
            };
        }
    }

    return null;
}

async function resolveDeviceImage(profile) {
    const cacheKey = slugify([profile.brand, profile.manufacturer, profile.model].filter(Boolean).join('|'));
    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }

    const resolved = await lookupCommonsCategoryImage(profile)
        || await lookupWikidataImage(profile)
        || await lookupGsmArenaImage(profile);

    imageCache.set(cacheKey, resolved);
    return resolved;
}

function buildFallbackDeviceArt(profile) {
    const title = escapeXml(buildDisplayName(profile));
    const serial = escapeXml(profile.serial || profile.id || '--');
    const chipset = escapeXml(profile.chipset || 'chipset desconhecido');
    const ram = escapeXml(profile.ramDisplay || '--');
    const rom = escapeXml(profile.storageDisplay || '--');

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1200" viewBox="0 0 960 1200">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#0f1521"/>
                    <stop offset="100%" stop-color="#070a10"/>
                </linearGradient>
                <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#66f2d1" stop-opacity="0.36"/>
                    <stop offset="100%" stop-color="#8d98ff" stop-opacity="0.18"/>
                </linearGradient>
            </defs>
            <rect width="960" height="1200" rx="72" fill="url(#bg)"/>
            <circle cx="190" cy="180" r="210" fill="url(#glow)" fill-opacity="0.18"/>
            <circle cx="760" cy="260" r="260" fill="#8d98ff" fill-opacity="0.10"/>
            <rect x="248" y="110" width="464" height="980" rx="60" fill="#101826" stroke="#66f2d1" stroke-opacity="0.26" stroke-width="3"/>
            <rect x="286" y="164" width="388" height="780" rx="42" fill="#0a0f17" stroke="#ffffff" stroke-opacity="0.04" stroke-width="2"/>
            <rect x="396" y="128" width="168" height="22" rx="11" fill="#1a2232"/>
            <circle cx="480" cy="1038" r="30" fill="#171f2b" stroke="#66f2d1" stroke-opacity="0.26" stroke-width="2"/>
            <text x="480" y="396" fill="#e8eefb" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle">${title}</text>
            <text x="480" y="466" fill="#66f2d1" font-family="JetBrains Mono, monospace" font-size="20" text-anchor="middle">${serial}</text>
            <text x="480" y="586" fill="#94a2bf" font-family="Space Grotesk, Arial, sans-serif" font-size="24" text-anchor="middle">${chipset}</text>
            <text x="480" y="666" fill="#e8eefb" font-family="JetBrains Mono, monospace" font-size="26" text-anchor="middle">${ram} RAM · ${rom} ROM</text>
            <text x="480" y="760" fill="#8d98ff" font-family="Space Grotesk, Arial, sans-serif" font-size="24" text-anchor="middle">Perfil visual gerado localmente</text>
        </svg>
    `.replace(/\s+\n/g, '\n').trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function buildDeviceProfile(deviceId, rawProps, rawMemInfo, rawStorageInfo) {
    const props = parseGetprop(rawProps);

    const brand = normalizeBrand(getPropValue(props, [
        'ro.product.brand',
        'ro.product.system.brand',
        'ro.vendor.product.brand',
        'ro.product.manufacturer'
    ]));

    const manufacturer = normalizeBrand(getPropValue(props, [
        'ro.product.manufacturer',
        'ro.product.system.manufacturer',
        'ro.vendor.product.manufacturer',
        'ro.product.brand'
    ]));

    const model = prettyLabel(getPropValue(props, [
        'ro.product.marketname',
        'ro.product.model',
        'ro.product.product.model',
        'ro.product.system.model',
        'ro.product.system_ext.model',
        'ro.vendor.product.display',
        'ro.vendor.product.model',
        'ro.odm.product.model'
    ])) || 'Unknown';

    const device = prettyLabel(getPropValue(props, [
        'ro.product.device',
        'ro.vendor.product.device',
        'ro.product.system.device'
    ]));

    const product = prettyLabel(getPropValue(props, [
        'ro.product.name',
        'ro.vendor.product.name',
        'ro.product.system.name'
    ]));

    const board = prettyLabel(getPropValue(props, [
        'ro.product.board',
        'ro.vendor.product.board',
        'ro.product.system.board'
    ]));

    const android = getPropValue(props, [
        'ro.build.version.release',
        'ro.system.build.version.release',
        'ro.vendor.build.version.release'
    ]);

    const androidSdk = getPropValue(props, [
        'ro.build.version.sdk',
        'ro.system.build.version.sdk',
        'ro.vendor.build.version.sdk'
    ]);

    const buildId = getPropValue(props, [
        'ro.build.id',
        'ro.system.build.id',
        'ro.vendor.build.id'
    ]);

    const buildFingerprint = getPropValue(props, [
        'ro.build.fingerprint',
        'ro.system.build.fingerprint',
        'ro.vendor.build.fingerprint'
    ]);

    const securityPatch = getPropValue(props, [
        'ro.build.version.security_patch',
        'ro.vendor.build.security_patch'
    ]);

    const chipset = getChipset(props);
    const ram = parseMemInfo(rawMemInfo);
    const storage = parseStorageInfo(rawStorageInfo);
    const displayName = buildDisplayName({ brand, manufacturer, model });
    const image = await resolveDeviceImage({
        brand,
        manufacturer,
        model,
        displayName
    });

    const ramDisplay = ram.totalMb ? `${Number((ram.totalMb / 1024).toFixed(ram.totalMb >= 4096 ? 0 : 1))} GB` : '--';
    const storageDisplay = storage.totalGb ? `${storage.totalGb} GB total · ${storage.availableGb} GB livre` : '--';
    const fallbackImageUrl = buildFallbackDeviceArt({
        brand,
        manufacturer,
        model,
        chipset,
        serial: deviceId,
        ramDisplay,
        storageDisplay
    });
    const imageUrl = image?.url || fallbackImageUrl;

    return {
        id: deviceId,
        serial: deviceId,
        brand,
        manufacturer,
        model,
        displayName,
        device,
        product,
        board,
        chipset,
        android,
        androidSdk,
        buildId,
        buildFingerprint,
        securityPatch,
        ramTotalMb: ram.totalMb,
        ramUsedMb: ram.usedMb,
        ramAvailableMb: ram.availableMb,
        ramUsedPercent: ram.usedPercent,
        ramDisplay,
        storageTotalGb: storage.totalGb,
        storageUsedGb: storage.usedGb,
        storageAvailableGb: storage.availableGb,
        storageUsedPercent: storage.usedPercent,
        storageDisplay,
        imageUrl,
        fallbackImageUrl,
        imageSource: image?.source || 'local-fallback',
        imageLabel: image?.label || 'fallback',
        imageResolved: Boolean(image?.url),
        summary: `${displayName}${android ? ` · Android ${android}` : ''}${chipset ? ` · ${chipset}` : ''}`
    };
}

module.exports = {
    buildDeviceProfile,
    buildFallbackDeviceArt
};
