import { createDependencies } from '../../src/bootstrap.js';
import { createHttpApp as createCore } from '../../src/core/mcp/http.js';
export function createHttpApp(deps, options) { return createCore(deps.registry ? deps : createDependencies(deps), options); }
