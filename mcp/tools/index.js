// Legacy registration API.
import { createDependencies } from '../../src/bootstrap.js';
import { registerTools as registerCore } from '../../src/core/mcp/tools.js';
export function registerTools(server, dependencies) { const deps = dependencies.registry ? dependencies : createDependencies(dependencies); registerCore(server, deps); deps.registerProviderTools?.(server); }
