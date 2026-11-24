import { parseArgs } from 'node:util';
import { openStore } from './core/policy/store.js';
import { createDependencies } from './bootstrap.js';
import { startServer } from './core/mcp/start.js';

const { values } = parseArgs({ options: { transport: { type: 'string', default: 'stdio' } } });
if (!['stdio', 'http'].includes(values.transport)) throw new Error('Transport must be stdio or http');
const store = await openStore();
let running;
try { running = await startServer(createDependencies({ store }), { transport: values.transport }); }
catch (error) { await store.close(); throw error; }
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try { await running.close(); await store.close(); process.exit(0); }
  catch { console.error('CloudSkills shutdown failed'); process.exit(1); }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
