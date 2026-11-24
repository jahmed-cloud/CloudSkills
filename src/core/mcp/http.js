import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './create.js';
import { httpGuard } from './auth.js';

export function createHttpApp(dependencies, options) {
  const app = express(); app.disable('x-powered-by');
  app.use(httpGuard(options));
  app.use(express.json({ limit: '10mb' }));
  app.post('/mcp', async (req, res) => {
    const server = createServer(dependencies);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close().catch(() => {}); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }); }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
  app.use((err, _req, res, _next) => { res.status(err.status === 413 ? 413 : 400).json({ error: 'Invalid or oversized JSON request' }); });
  return app;
}
