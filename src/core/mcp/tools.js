import { z } from 'zod';
import { compare, controlSchema } from '../policy/engine.js';
import { diagram } from '../diagrams/index.js';
import { htmlReport, jsonReport, reportSchema } from '../reporting/index.js';
import { snapshotInput, pagination, page, resolveSnapshot } from './schemas.js';
import { toolFactory } from './tool.js';

export function registerTools(server, { registry, store }) {
  const tool = toolFactory(server);
  tool('learn_organization_policy', 'Persist normalized controls or translate native definitions with the selected provider. Unsupported definitions are reported.', { provider: z.string().optional(), controls: z.array(controlSchema).max(2000).optional(), definitions: z.array(z.record(z.unknown())).max(2000).optional() }, async a => {
    if (Boolean(a.controls) === Boolean(a.definitions)) throw new Error('Choose exactly one of controls or definitions');
    const result = a.definitions ? registry.get(a.provider).importPolicies(a.definitions) : { controls: a.controls, unsupported: [] };
    return { ...await store.learn(result.controls), unsupported: result.unsupported };
  }, { localWrite: true });
  tool('search_organization_policy', 'Retrieve relevant organization controls by literal search terms and optional exact resource type.', { query: z.string().max(1000).default(''), resourceType: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }, a => store.search(a.query, a.resourceType, a.limit));
  tool('compare_policy_baseline', 'Compare normalized evidence against learned controls, returning bounded violations and unknowns.', { ...snapshotInput, ...pagination, includePassed: z.boolean().default(false) }, async a => {
    const controls = await store.all(); if (!controls.length) throw new Error('No organization controls learned yet');
    const { snapshot } = await resolveSnapshot(registry, a);
    const result = compare(snapshot, controls); const counts = { pass: 0, fail: 0, unknown: 0 }; result.results.forEach(r => counts[r.status]++);
    return { ...result, results: page(result.results.filter(r => a.includePassed || r.status !== 'pass'), a.limit, a.offset), counts };
  }, { remote: true });
  for (const kind of ['architecture', 'network', 'identity']) tool(`generate_${kind}_diagram`, 'Build grouped Mermaid and graph JSON from provider-normalized resource references.', { ...snapshotInput, maxNodes: z.number().int().min(1).max(1000).default(200) }, async a => diagram((await resolveSnapshot(registry, a)).snapshot, kind, { maxNodes: a.maxNodes }), { remote: true });
  for (const format of ['html', 'json']) tool(`generate_${format}_report`, 'Return a complete provider-neutral report from normalized audit evidence or a full inventory.', { ...snapshotInput, report: reportSchema.optional() }, async a => {
    if (a.report && (a.snapshot || a.scope || a.subscriptions)) throw new Error('Choose exactly one of report, snapshot or scope');
    let report = a.report;
    if (!report) { const data = await resolveSnapshot(registry, a); report = data.provider.review(data.snapshot); }
    return { filename: `architecture-report.${format}`, mimeType: format === 'html' ? 'text/html' : 'application/json', content: format === 'html' ? htmlReport(report) : jsonReport(report) };
  }, { remote: true });
}
