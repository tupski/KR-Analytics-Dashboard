import http from 'http';

const PORT = process.env.SYNC_WORKER_PORT || 9090;

const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'kr-analytics-sync-worker',
            timestamp: new Date().toISOString(),
            message: 'Sync worker placeholder — full implementation in Phase 2B-2',
        }));
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`[sync-worker] Health endpoint listening on :${PORT}/health`);
});
