import { z } from 'zod';
import { snapshotSchema } from '../model.js';
export const subscriptions = z.array(z.guid()).min(1).max(100);
export const snapshotInput = {
  snapshot: snapshotSchema.optional(), provider: z.string().optional(),
  scope: z.object({ accountIds: z.array(z.string().min(1)).min(1).max(100) }).optional(),
  subscriptions: subscriptions.optional(), // Legacy scope alias retained at the MCP boundary.
};
export const pagination = { limit: z.number().int().min(1).max(1000).default(100), offset: z.number().int().min(0).default(0) };
export function page(items, limit, offset) { return { total: items.length, items: items.slice(offset, offset + limit), nextOffset: offset + limit < items.length ? offset + limit : null }; }
export async function resolveSnapshot(registry, args) {
  if ([args.snapshot, args.scope, args.subscriptions].filter(Boolean).length !== 1) throw new Error('Choose exactly one of snapshot, scope or subscriptions');
  const provider = registry.forSnapshot(args.snapshot || {}, args.provider);
  const snapshot = args.snapshot ? provider.normalize(args.snapshot) : await provider.getInventory(args.scope || { accountIds: args.subscriptions });
  return { provider, snapshot };
}
