/**
 * Mock backend server for Playback feature testing.
 *
 * Provides fake data for:
 *   - GET /api/playback/snapshots
 *   - GET /api/playback/word-frequency-snapshots
 *   - GET /api/admin/settings/default_start_time
 *   - GET /api/exclusion-wordlists
 *   - GET /api/replacement-wordlists
 *   - POST /api/auth/refresh
 *
 * Usage:  node scripts/mock_playback_server.js
 * Runs on port 8000 (same as real backend).
 */

const http = require('http');
const url = require('url');

const PORT = 8000;

// ─── Helpers ────────────────────────────────────────────────────

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };
}

function json(res, data, status = 200) {
    res.writeHead(status, corsHeaders());
    res.end(JSON.stringify(data));
}

/** Generate a random integer in [min, max]. */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Fake data generators ───────────────────────────────────────

const SAMPLE_WORDS = [
    '哈哈', '好棒', '加油', '888', '笑死', '可愛', '厲害', '讚讚',
    'wwww', '草', '辛苦了', '晚安', '好好笑', '太強了', '感動',
    '推', '第一次', '來了', '期待', '開心', '超可愛', '好帥',
    '謝謝', '幫QQ', '恭喜', '可以', '不行', '拜拜', '早安', '嗨',
    '天啊', '哭了', '太猛', '真假', '好耶', '再來', '666', '牛',
    '讓我看看', '好吃', '想吃', '我也要', '衝啊', '抽我', '真香',
    '紅豆泥', '搞笑', '告白', '膝蓋', '上香',
];

function generateSnapshots(startTime, endTime, stepSeconds) {
    const snapshots = [];
    let current = new Date(startTime);
    const end = new Date(endTime);
    let cumulativePaid = 0;
    let cumulativeRevenue = 0;

    // Simulate a viewer curve: rise → peak → gradual decline
    const totalMs = end.getTime() - current.getTime();

    while (current <= end) {
        const elapsed = current.getTime() - new Date(startTime).getTime();
        const progress = totalMs > 0 ? elapsed / totalMs : 0; // 0..1

        // Viewer count: bell-curve-ish shape
        const basePeak = 25000;
        const viewerBase = basePeak * Math.sin(progress * Math.PI);
        const viewerNoise = randInt(-1500, 1500);
        const viewerCount = Math.max(500, Math.round(viewerBase + viewerNoise));

        // Hourly messages: correlated with viewers
        const msgBase = Math.round(viewerCount * 0.15);
        const hourlyMessages = Math.max(10, msgBase + randInt(-200, 200));

        // Paid messages: occasional spikes
        if (Math.random() < 0.3) {
            cumulativePaid += randInt(1, 5);
            cumulativeRevenue += randInt(30, 2000);
        }

        snapshots.push({
            timestamp: current.toISOString(),
            viewer_count: viewerCount,
            hourly_messages: hourlyMessages,
            paid_message_count: cumulativePaid,
            revenue_twd: Math.round(cumulativeRevenue * 100) / 100,
        });

        current = new Date(current.getTime() + stepSeconds * 1000);
    }

    return snapshots;
}

function generateWordcloudSnapshots(startTime, endTime, stepSeconds, wordLimit) {
    const snapshots = [];
    let current = new Date(startTime);
    const end = new Date(endTime);

    // Pick a stable subset of words for this "stream"
    const activeWords = SAMPLE_WORDS.slice(0, Math.min(wordLimit + 10, SAMPLE_WORDS.length));

    while (current <= end) {
        // Generate word frequencies with some variation per step
        const words = activeWords
            .map(word => ({
                word,
                size: randInt(5, 500),
            }))
            .sort((a, b) => b.size - a.size)
            .slice(0, wordLimit);

        snapshots.push({
            timestamp: current.toISOString(),
            words,
        });

        current = new Date(current.getTime() + stepSeconds * 1000);
    }

    return snapshots;
}

// ─── Route handlers ─────────────────────────────────────────────

function handlePlaybackSnapshots(query, res) {
    const startTime = query.start_time;
    const endTime = query.end_time;
    const stepSeconds = parseInt(query.step_seconds || '300', 10);

    if (!startTime || !endTime) {
        return json(res, { detail: 'start_time and end_time are required' }, 400);
    }

    const snapshots = generateSnapshots(startTime, endTime, stepSeconds);

    json(res, {
        snapshots,
        metadata: {
            start_time: startTime,
            end_time: endTime,
            step_seconds: stepSeconds,
            total_snapshots: snapshots.length,
            video_id: 'mock-video-id',
        },
    });
}

function handleWordFrequencySnapshots(query, res) {
    const startTime = query.start_time;
    const endTime = query.end_time;
    const stepSeconds = parseInt(query.step_seconds || '300', 10);
    const wordLimit = parseInt(query.word_limit || '30', 10);

    if (!startTime || !endTime) {
        return json(res, { detail: 'start_time and end_time are required' }, 400);
    }

    const snapshots = generateWordcloudSnapshots(startTime, endTime, stepSeconds, wordLimit);

    json(res, { snapshots });
}

// ─── Server ─────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
    }

    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const query = parsed.query;

    // Route matching
    if (pathname === '/api/playback/snapshots' && req.method === 'GET') {
        return handlePlaybackSnapshots(query, res);
    }

    if (pathname === '/api/playback/word-frequency-snapshots' && req.method === 'GET') {
        return handleWordFrequencySnapshots(query, res);
    }

    if (pathname === '/api/admin/settings/default_start_time' && req.method === 'GET') {
        // Return a default start time (yesterday at 14:00 UTC)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(14, 0, 0, 0);
        return json(res, { value: yesterday.toISOString() });
    }

    if (pathname === '/api/exclusion-wordlists' && req.method === 'GET') {
        return json(res, [
            { id: 1, name: '預設排除清單', words: ['的', '了', '是', '在'] },
        ]);
    }

    if (pathname === '/api/replacement-wordlists' && req.method === 'GET') {
        return json(res, [
            { id: 1, name: '預設取代清單', mappings: [{ from: 'www', to: '草' }] },
        ]);
    }

    if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        return json(res, { access_token: 'mock-token-12345' });
    }

    // Fallback: 404
    json(res, { detail: `Not found: ${pathname}` }, 404);
});

server.listen(PORT, () => {
    console.log(`\n🎭 Mock Playback Server running on http://localhost:${PORT}\n`);
    console.log('Available endpoints:');
    console.log('  GET  /api/playback/snapshots?start_time=...&end_time=...&step_seconds=300');
    console.log('  GET  /api/playback/word-frequency-snapshots?start_time=...&end_time=...');
    console.log('  GET  /api/admin/settings/default_start_time');
    console.log('  GET  /api/exclusion-wordlists');
    console.log('  GET  /api/replacement-wordlists');
    console.log('  POST /api/auth/refresh');
    console.log('\nPress Ctrl+C to stop.\n');
});
