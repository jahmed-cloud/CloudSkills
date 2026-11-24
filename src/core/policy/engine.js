import { z } from 'zod';
import { canonical, get, hash, normalize } from '../model.js';

export const controlSchema = z.object({
  id: z.string().min(1).max(300), title: z.string().min(1).max(1000),
  provider: z.string().min(1).optional(), resourceType: z.string().min(1), path: z.string().min(1),
  operator: z.enum(['equals', 'notEquals', 'in', 'notIn', 'exists']), expected: z.unknown(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  source: z.string().min(1),
}).superRefine((v, ctx) => {
  if (v.expected === undefined) ctx.addIssue({ code: 'custom', message: 'expected is required' });
  if (['in', 'notIn'].includes(v.operator) && !Array.isArray(v.expected)) ctx.addIssue({ code: 'custom', message: 'in/notIn require an expected array' });
  if (v.operator === 'exists' && typeof v.expected !== 'boolean') ctx.addIssue({ code: 'custom', message: 'exists requires an expected boolean' });
});
export function normalizeControl(input) {
  const parsed = controlSchema.parse(input);
  // z.unknown() is inferred as optional by Zod 3; superRefine requires the value at runtime.
  const control = { ...parsed, expected: parsed.expected, resourceType: parsed.resourceType.toLowerCase() };
  return { ...control, hash: hash(control) };
}
export function compare(input, controls) {
  const snapshot = normalize(input); const results = [];
  for (const raw of controls) {
    const c = normalizeControl(raw);
    for (const resource of snapshot.resources.filter(r => (!c.provider || c.provider === snapshot.provider) && (c.resourceType === '*' || r.type.toLowerCase() === c.resourceType))) {
      const actual = get(resource, c.path); let status = 'unknown';
      const equal = (a, b) => typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : canonical(a) === canonical(b);
      if (c.operator === 'exists') status = (actual !== undefined) === c.expected ? 'pass' : 'fail';
      else if (actual !== undefined && actual !== null) {
        const match = ['in', 'notIn'].includes(c.operator) ? c.expected.some(v => equal(actual, v)) : equal(actual, c.expected);
        status = (['notIn', 'notEquals'].includes(c.operator) ? !match : match) ? 'pass' : 'fail';
      }
      results.push({ resourceId: resource.id, control: c.id, controlHash: c.hash, status, severity: c.severity, expected: c.expected, actual: actual ?? null, path: c.path, source: c.source });
    }
  }
  return { snapshotHash: snapshot.contentHash, results, limitations: ['Explicit normalized controls only; native assignment scopes, exemptions and remediation effects are not inferred.'] };
}
