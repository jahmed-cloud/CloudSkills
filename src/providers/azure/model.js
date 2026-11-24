import { snapshotSchema, normalize as normalizeCloud } from '../../core/model.js';
export { canonical, get, hash } from '../../core/model.js';

function references(value, path = '', output = []) {
  if (typeof value === 'string' && /^\/subscriptions\//i.test(value)) output.push({ id: value.toLowerCase(), path });
  else if (Array.isArray(value)) value.forEach((v, i) => references(v, `${path}[${i}]`, output));
  else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) references(v, path ? `${path}.${key}` : key, output);
  return output;
}
/** @returns {import('../../core/interfaces/index.ts').ICloudSnapshot} */
export function normalize(input) {
  const data = snapshotSchema.parse(input);
  if (!['unknown', 'azure'].includes(data.provider)) throw new Error('Azure provider cannot normalize another provider snapshot');
  const resources = data.resources.map(resource => {
    const r = { ...resource, id: resource.id.toLowerCase(), type: resource.type.toLowerCase() };
    const identity = r.identity || r.attributes?.identity;
    const refs = [...(r.references || []), ...references({ properties: r.properties, identity })];
    for (const id of Object.keys(identity?.userAssignedIdentities || {})) refs.push({ id: id.toLowerCase(), path: 'identity.userAssignedIdentities' });
    // References are a set of relationships, independent of native object property order.
    const uniqueRefs = new Map(refs.map(ref => {
      const normalized = { id: ref.id.toLowerCase(), path: ref.path };
      return [JSON.stringify([normalized.id, normalized.path]), normalized];
    }));
    const sortedRefs = [...uniqueRefs.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, ref]) => ref);
    const kind = r.type.startsWith('microsoft.network/') ? 'network' : identity || /managedidentity|roleassignments/.test(r.type) ? 'identity' : r.type.startsWith('microsoft.compute/') ? 'compute' : /microsoft.(storage|sql|documentdb|keyvault)\//.test(r.type) ? 'data' : r.type.startsWith('microsoft.web/') ? 'application' : 'other';
    return { ...r, accountId: r.subscriptionId || r.accountId, region: r.location || r.region, group: r.resourceGroup || r.group, kind,
      attributes: { ...r.attributes, ...(identity ? { identity } : {}) }, references: sortedRefs };
  });
  return normalizeCloud({ ...data, provider: 'azure', resources });
}
