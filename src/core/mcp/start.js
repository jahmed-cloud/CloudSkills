import { createServer } from './create.js';

/** Start transports against injected provider contracts; no concrete provider or SDK imports. */
export async function startServer(dependencies, { transport = 'stdio', env = process.env } = {}) {
  if (!['stdio', 'http'].includes(transport)) throw new Error('Transport must be stdio or http');
  let close;
  if (transport === 'stdio') {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const server = createServer(dependencies);
    await server.connect(new StdioServerTransport());
    close = () => server.close();
  } else {
    const { createHttpApp } = await import('./http.js');
    const host = env.MCP_HOST || '127.0.0.1';
    const port = Number(env.MCP_PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT must be 1-65535');
    const allowedHosts = (env.MCP_ALLOWED_HOSTS || (host === '127.0.0.1' ? `127.0.0.1:${port},localhost:${port}` : '')).split(',').map(v => v.trim()).filter(Boolean);
    const app = createHttpApp(dependencies, { token: env.MCP_AUTH_TOKEN, allowedHosts });
    const listener = await new Promise((resolve, reject) => {
      const server = app.listen(port, host, () => resolve(server)); server.once('error', reject);
    });
    console.error(`CloudSkills MCP listening at http://${host}:${port}/mcp`);
    close = () => new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
  return { close };
}
