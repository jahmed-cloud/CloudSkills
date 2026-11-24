// Legacy Azure input adapter; the core engine itself has no provider dependency.
export { controlSchema, normalizeControl } from '../core/policy/engine.js';
export { importDefinitions } from '../providers/azure/policy.js';
import { compare as compareCore } from '../core/policy/engine.js';
import { normalize } from '../providers/azure/model.js';
export function compare(input, controls) { return compareCore(normalize(input), controls); }
