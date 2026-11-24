import { createHash } from 'node:crypto';
import { z } from 'zod';

export const resourceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), type: z.string().min(1),
  accountId: z.string().optional(), region: z.string().optional(), group: z.string().optional(),
  kind: z.enum(['compute', 'network', 'identity', 'data', 'application', 'other']).optional(),
  tags: z.record(z.string(), z.string()).default({}), properties: z.record(z.string(), z.unknown()).default({}),
  attributes: z.record(z.string(), z.unknown()).optional(),
  references: z.array(z.object({ id: z.string(), path: z.string() })).optional(),
}).loose(); // Retain provider extensions for compatibility; core never interprets them.
export const snapshotSchema = z.object({
  provider: z.string().min(1).default('unknown'),
  resources: z.array(resourceSchema).max(50000), collectedAt: z.string().datetime().optional(),
  source: z.string().min(1).default('fixture'),
  coverage: z.array(z.string()).default([]), limitations: z.array(z.string()).default([]),
});
export function canonical(value) {
  if (Array.isArray(value)) return `[${Array.from(value, item => canonical(item) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.keys(value).sort().flatMap(key => {
      const encoded = canonical(value[key]);
      return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
    });
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export function get(object, path) {
  return path.split('.').reduce((v, key) => v && Object.hasOwn(v, key) ? v[key] : undefined, object);
}
/** @returns {import('./interfaces/index.ts').ICloudSnapshot} */
export function normalize(input) {
  const data = snapshotSchema.parse(input);
  // Case semantics belong to the provider. Never lowercase generic resource IDs.
  const resources = data.resources.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(resources.map(r => r.id)).size !== resources.length) throw new Error('Duplicate resource IDs in snapshot');
  return { ...data, resources, contentHash: hash({ provider: data.provider, resources }) };
}
