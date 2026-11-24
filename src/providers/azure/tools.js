import { z } from 'zod';
import { audit, rbacAudit, pimReview, policyStateCounts } from './analyzers.js';
import { terraformAnalyze, terraformGenerate, terraformOptions } from './terraform.js';
import { subscriptions, pagination, page } from '../../core/mcp/schemas.js';
import { snapshotSchema } from '../../core/model.js';
import { toolFactory } from '../../core/mcp/tool.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export function registerAzureTools(server, provider) {
  const azure = provider.reader;
  const tool = toolFactory(server);
  const snapshotInput = { snapshot: snapshotSchema.optional(), subscriptions: subscriptions.optional() };
  async function snapshot(args) {
    if (Boolean(args.snapshot) === Boolean(args.subscriptions)) throw new Error('Choose exactly one of snapshot or subscriptions');
    return args.snapshot ? provider.normalize(args.snapshot) : provider.getInventory({ accountIds: args.subscriptions });
  }
  tool('azure_inventory', 'Collect normalized read-only inventory, returning one bounded page. Use subscriptions on audit tools to analyze the full server-side snapshot.', { subscriptions, ...pagination, refresh: z.boolean().default(false) }, async a => {
    const data = await azure.inventory(a.subscriptions, { refresh: a.refresh });
    return { ...page(data.resources, a.limit, a.offset), snapshotHash: data.contentHash, collectedAt: data.collectedAt, limitations: data.limitations };
  }, { remote: true });
  tool('azure_resource_graph', 'Run a read-only Resource Graph KQL query in explicitly allowed subscriptions; returns a continuation token.', { subscriptions, query: z.string().min(1).max(20000), limit: z.number().int().min(1).max(1000).default(100), skipToken: z.string().optional() }, async a => azure.graph(a.subscriptions, a.query, a), { remote: true });
  for (const [name, category] of Object.entries({ azure_architecture_review: 'architecture', azure_security_audit: 'security', azure_identity_audit: 'identity', azure_network_audit: 'network', azure_waf_review: 'waf' })) {
    tool(name, `Run selected ${category} checks. Missing evidence is unknown. WAF is a partial configuration review, not a certification.`, { ...snapshotInput, ...pagination, includePassed: z.boolean().default(false) }, async a => {
      const result = audit(await snapshot(a), category); const findings = result.findings.filter(f => a.includePassed || f.status !== 'pass');
      return { ...result, findings: undefined, evidence: page(findings, a.limit, a.offset) };
    }, { remote: true });
  }
  tool('azure_rbac_audit', 'Review privileged built-in role assignments in one allowed subscription.', { subscription: z.string().uuid(), ...pagination }, async a => { const r = rbacAudit(await azure.list(a.subscription, 'rbac')); return { ...r, findings: page(r.findings, a.limit, a.offset) }; }, { remote: true });
  tool('azure_pim_review', 'Review Azure-resource PIM assignments for absent end times. Does not assess Entra directory PIM.', { subscription: z.string().uuid(), ...pagination }, async a => { const [active, eligible] = await Promise.all([azure.list(a.subscription, 'pimActive'), azure.list(a.subscription, 'pimEligible')]); const result = pimReview(active, eligible); return { ...result, reviewCandidates: page(result.reviewCandidates, a.limit, a.offset) }; }, { remote: true });
  tool('azure_policy_audit', 'Read Azure Policy compliance states; evaluation may lag current resources. Does not import definitions.', { subscription: z.string().uuid(), ...pagination }, async a => { const rows = await azure.list(a.subscription, 'policyStates'); return { counts: policyStateCounts(rows), evidence: page(rows.filter(r => r.complianceState !== 'Compliant'), a.limit, a.offset), limitations: ['Policy state freshness and assignment coverage must be reviewed.'] }; }, { remote: true });
  tool('azure_cost_analysis', 'Summarize month-to-date actual cost without mixing currencies or inventing savings.', { subscription: z.string().uuid() }, async a => provider.getCost({ accountIds: [a.subscription] }), { remote: true });
  for (const name of ['terraform_analyze', 'terraform_security_scan']) tool(name, 'Statically inspect Terraform JSON configuration or show -json output. HCL and provider execution are not supported.', { document: z.record(z.unknown()) }, a => terraformAnalyze(a.document));
  tool('terraform_generate', 'Generate reviewable Azure service Terraform JSON for storage, Key Vault, VNet, App Service, VM, SQL, PostgreSQL, AKS or Container Apps. Returns required inputs and a deployment checklist; policy compliance is not inferred. Never runs plan/apply.', terraformOptions.shape, terraformGenerate);

  registerResources(server); registerPrompts(server);
}
