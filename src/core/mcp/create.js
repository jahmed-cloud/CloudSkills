import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

export function createServer(dependencies) {
  const server = new McpServer({ name: 'cloudskills', version: '0.2.0' });
  registerTools(server, dependencies);
  dependencies.registerProviderTools?.(server);
  return server;
}
