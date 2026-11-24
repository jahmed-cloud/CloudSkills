import { z } from 'zod';

export function toolFactory(server) {
  return function tool(name, description, schema, fn, { localWrite = false, remote = false } = {}) {
    server.registerTool(name, { description, inputSchema: schema, annotations: { readOnlyHint: !localWrite, destructiveHint: false, idempotentHint: true, openWorldHint: remote } }, async args => {
      try {
        const result = await fn(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const message = error instanceof z.ZodError ? 'Input validation failed' : error.message || '';
        const safe = /^(Provide|Subscription|Azure |Expected|Duplicate|Inventory|Unexpected Azure|Repeated Azure|Cost response|Invalid cost|Invalid Azure|Choose exactly|No organization|Unknown collector|Unsupported provider|Snapshot provider)/.test(message) ? message : 'Operation failed; verify inputs, credentials and server configuration.';
        return { isError: true, content: [{ type: 'text', text: safe }] };
      }
    });
  };
}
