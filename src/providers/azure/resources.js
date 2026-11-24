import { rules } from './analyzers.js';
import { queries } from './queries.js';

export function registerResources(server) {
  for (const [name, value] of Object.entries({ baseline: { rules, limitations: 'Selected heuristics; not a complete CAF/WAF or compliance baseline.' }, queries })) {
    const uri = `azure-architect://${name}`;
    server.registerResource(name, uri, { mimeType: 'application/json', description: `Built-in ${name}; contains no tenant data` }, async () => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value) }] }));
  }
}
