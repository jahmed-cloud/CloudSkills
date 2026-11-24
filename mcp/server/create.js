import { createDependencies } from '../../src/bootstrap.js';
import { createServer as createCore } from '../../src/core/mcp/create.js';
export function createServer(deps) { return createCore(deps.registry ? deps : createDependencies(deps)); }
