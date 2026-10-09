// A minimal server that speaks docs/ENGINE_CONTRACT.md, for developing the `remote` path locally.
// It does NOT convert accents: it returns the audio it receives, and says so in its capabilities.
// Run:  node scripts/mock-engine.mjs   then   ENGINE=remote REMOTE_ENGINE_URL=http://localhost:8790 npm start
import http from 'node:http';

const port = Number(process.env.MOCK_ENGINE_PORT ?? 8790);
const key = process.env.REMOTE_ENGINE_KEY ?? '';

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    if (key && req.headers.authorization !== `Bearer ${key}`) return send(401, { error: { code: 'auth', message: 'Bad key' } });
    if (url.pathname === '/v1/capabilities') {
      return send(200, {
        name: 'Mock engine (echo, no conversion)',
        changesAccent: false,
        preservesSpeaker: true,
        supportsStrength: true,
        maxSegmentSec: 30,
        external: false,
        accents: [{ id: 'en-GB' }, { id: 'en-AU' }, { id: 'en-IE' }],
      });
    }
    if (url.pathname === '/v1/convert' && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      return send(200, Buffer.concat(chunks), 'audio/wav');
    }
    send(404, { error: { code: 'not_found', message: 'Not found' } });
  })
  .listen(port, () => console.log(`mock engine on http://localhost:${port}`));
