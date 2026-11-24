// Legacy Azure snapshot API. New integrations use core/model and a provider adapter.
export { canonical, hash, get, resourceSchema, snapshotSchema } from './core/model.js';
export { normalize } from './providers/azure/model.js';
