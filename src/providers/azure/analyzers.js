import { get, hash, normalize } from './model.js';

const source = 'https://learn.microsoft.com/azure/well-architected/security/';
export const rules = [
  { id: 'AZ-KV-001', category: 'security', type: 'microsoft.keyvault/vaults', path: 'properties.enablePurgeProtection', expected: true, severity: 'high', title: 'Key Vault purge protection', recommendation: 'Enable purge protection after reviewing the retention and recovery requirements.' },
  { id: 'AZ-KV-002', category: 'identity', type: 'microsoft.keyvault/vaults', path: 'properties.enableRbacAuthorization', expected: true, severity: 'medium', title: 'Key Vault uses Azure RBAC', recommendation: 'Plan migration from access policies to least-privilege Azure RBAC.' },
  { id: 'AZ-KV-003', category: 'network', type: 'microsoft.keyvault/vaults', path: 'properties.publicNetworkAccess', expected: 'Disabled', severity: 'high', title: 'Key Vault public network access', recommendation: 'Validate private endpoint and DNS connectivity before disabling public network access.' },
  { id: 'AZ-ST-001', category: 'security', type: 'microsoft.storage/storageaccounts', path: 'properties.supportsHttpsTrafficOnly', expected: true, severity: 'high', title: 'Storage requires HTTPS', recommendation: 'Require secure transfer and validate dependent clients.' },
  { id: 'AZ-ST-002', category: 'security', type: 'microsoft.storage/storageaccounts', path: 'properties.allowBlobPublicAccess', expected: false, severity: 'high', title: 'Storage disallows anonymous blob access', recommendation: 'Disable anonymous blob access unless a reviewed workload exception requires it.' },
  { id: 'AZ-ST-003', category: 'security', type: 'microsoft.storage/storageaccounts', path: 'properties.minimumTlsVersion', expected: 'TLS1_2', severity: 'medium', title: 'Storage minimum TLS version', recommendation: 'Require TLS 1.2 or a subsequently supported stronger minimum.' },
  { id: 'AZ-ST-004', category: 'network', type: 'microsoft.storage/storageaccounts', path: 'properties.publicNetworkAccess', expected: 'Disabled', severity: 'medium', title: 'Storage public network access', recommendation: 'Review workload exposure requirements; prefer private endpoints where applicable.' },
  { id: 'AZ-WEB-001', category: 'security', type: 'microsoft.web/sites', path: 'properties.httpsOnly', expected: true, severity: 'high', title: 'Web application requires HTTPS', recommendation: 'Enable HTTPS-only access after validating redirect behavior.' },
];
export function finding(rule, resource, actual, status) {
  return { id: hash([rule.id, resource.id]).slice(0, 20), control: rule.id, resourceId: resource.id, resourceName: resource.name,
    category: rule.category, severity: rule.severity, status, title: rule.title,
    evidence: { path: rule.path, expected: rule.expected, actual: actual ?? null }, recommendation: rule.recommendation, source };
}
export function summarize(findings) {
  const counts = { pass: 0, fail: 0, unknown: 0 };
  for (const f of findings) counts[f.status]++;
  return { ...counts, evaluated: counts.pass + counts.fail, total: findings.length,
    observedPassPercentage: counts.pass + counts.fail ? Math.round(100 * counts.pass / (counts.pass + counts.fail)) : null };
}
function worldSource(rule) {
  const p = rule.properties || rule;
  return [p.sourceAddressPrefix, ...(p.sourceAddressPrefixes || [])].some(v => ['*', 'Internet', '0.0.0.0/0', '::/0'].includes(v));
}
function managementPort(rule) {
  const p = rule.properties || rule;
  return [p.destinationPortRange, ...(p.destinationPortRanges || [])].some(v => {
    if (v === '*') return true;
    if (['22', '3389'].includes(v)) return true;
    const match = /^(\d+)-(\d+)$/.exec(v || '');
    return match && [22, 3389].some(port => port >= Number(match[1]) && port <= Number(match[2]));
  });
}
/** @returns {import('../../core/interfaces/index.ts').ICloudReport} */
export function audit(input, category = 'architecture') {
  const snapshot = normalize(input); const findings = [];
  const include = cat => ['architecture', 'waf'].includes(category) || cat === category;
  for (const r of snapshot.resources) {
    for (const rule of rules.filter(rule => rule.type === r.type && include(rule.category))) {
      const actual = get(r, rule.path);
      const status = actual === undefined || actual === null ? 'unknown' : actual === rule.expected ? 'pass' : 'fail';
      findings.push(finding(rule, r, actual, status));
    }
    if (include('governance')) {
      for (const tag of ['owner', 'environment', 'costCenter']) {
        const rule = { id: `AZ-TAG-${tag}`, category: 'governance', path: `tags.${tag}`, expected: 'non-empty', severity: 'low', title: `Resource has ${tag} tag`, recommendation: 'Apply the organization’s agreed ownership and cost allocation tags; validate exemptions.' };
        findings.push(finding(rule, r, r.tags[tag], r.tags[tag]?.trim() ? 'pass' : 'fail'));
      }
    }
    if (include('network') && r.type === 'microsoft.network/networksecuritygroups') {
      const rule = { id: 'AZ-NSG-001', category: 'network', path: 'properties.securityRules', expected: 'No broad inbound SSH/RDP allow rules', severity: 'high', title: 'Broad management access in NSG rule', recommendation: 'Review effective rule priorities and routing; restrict management sources or use Bastion/JIT.' };
      const securityRules = r.properties.securityRules;
      if (!Array.isArray(securityRules)) findings.push(finding(rule, r, null, 'unknown'));
      else {
        const exposed = securityRules.filter(s => { const p = s.properties || s; return p.direction === 'Inbound' && p.access === 'Allow' && ['Tcp', '*'].includes(p.protocol) && worldSource(s) && managementPort(s); });
        findings.push(finding(rule, r, exposed.map(s => s.name), exposed.length ? 'fail' : 'pass'));
      }
    }
  }
  const limitations = [...snapshot.limitations, 'Checks are selected configuration heuristics, not certification or a complete CAF/WAF assessment. Missing properties are unknown; service defaults are not assumed.', 'NSG checks identify broad rules, not effective reachability. Tag names are a sample baseline.'];
  if (category === 'identity') limitations.push('Identity review covers resource configuration only; Entra users, MFA, Conditional Access and directory roles require separate evidence.');
  return { schemaVersion: '1.0', provider: 'azure', category, source: snapshot.source, collectedAt: snapshot.collectedAt ?? null, snapshotHash: snapshot.contentHash, resourceCount: snapshot.resources.length, summary: summarize(findings), findings, limitations };
}
export function rbacAudit(assignments) {
  const privileged = ['8e3af657-a8ff-443c-a75c-2fe8c4bcb635', 'b24988ac-6180-42a0-ab88-20f7382dd24c', '18d7d88d-d35e-4fb5-a5c3-7773c20a72d9'];
  const findings = assignments.filter(a => privileged.some(id => a.properties?.roleDefinitionId?.toLowerCase().endsWith(id))).map(a => ({
    assignmentId: a.id, principalId: a.properties.principalId, scope: a.properties.scope,
    roleDefinitionId: a.properties.roleDefinitionId, status: 'review',
    recommendation: 'Validate necessity, group-based assignment and time-bounded privileged access. This assignment alone does not prove excessive permissions.',
  }));
  return { assignmentCount: assignments.length, findings, limitations: ['Built-in Owner, Contributor and User Access Administrator only. Custom roles, group expansion and inherited management-group assignments are not evaluated.'] };
}
export function pimReview(active, eligible) {
  return { activeCount: active.length, eligibleCount: eligible.length,
    reviewCandidates: active.filter(a => !a.properties?.endDateTime).map(a => ({ id: a.id, principalId: a.properties?.principalId, assignmentType: a.properties?.assignmentType, reason: 'No endDateTime is present; verify whether a permanent assignment is justified.' })),
    limitations: ['Azure resource PIM only. Activation policy, approvals, MFA enforcement and Entra directory PIM are not assessed.'] };
}
/** @returns {Omit<import('../../core/interfaces/index.ts').ICloudCostResult, 'provider'>} */
export function costAnalysis(data) {
  const limitations = ['Month-to-date actual costs may arrive late; no savings estimate or utilization conclusion is inferred. Different currencies are not added together.'];
  if (data.noData) return { timeframe: 'MonthToDate', dataStatus: 'no-data', totalsByCurrency: {}, topResources: [], limitations: [...limitations, 'Azure returned no billing data for the selected period. Spend is unknown.'] };
  const columns = data.columns.map(c => c.name); const currency = columns.findIndex(c => c.toLowerCase() === 'currency');
  const cost = columns.findIndex(c => ['pretaxcost', 'cost', 'costinbillingcurrency'].includes(c.toLowerCase()));
  const resource = columns.findIndex(c => c.toLowerCase() === 'resourceid');
  if (cost < 0 || currency < 0) throw new Error('Cost response requires cost and currency columns');
  /** @type {Map<string, number>} */
  const totals = new Map();
  const byCurrency = new Map();
  for (const row of data.rows) {
    const raw = row[cost];
    const amount = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
    if (!Number.isFinite(amount)) throw new Error('Invalid cost amount');
    const code = typeof row[currency] === 'string' ? row[currency].trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid cost currency');
    const resourceId = typeof row[resource] === 'string' && row[resource].trim() ? row[resource].trim().toLowerCase() : null;
    totals.set(code, (totals.get(code) ?? 0) + amount);
    if (!byCurrency.has(code)) byCurrency.set(code, new Map());
    const amounts = byCurrency.get(code);
    amounts.set(resourceId, (amounts.get(resourceId) ?? 0) + amount);
  }
  const groups = [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amounts]) => {
    return [...amounts].map(([resourceId, amount]) => ({ resourceId, amount, currency }))
      .sort((a, b) => b.amount - a.amount || (a.resourceId ?? '').localeCompare(b.resourceId ?? '')).slice(0, 20);
  });
  const topResources = [];
  for (let rank = 0; rank < 20 && topResources.length < 20; rank++) {
    for (const group of groups) {
      if (group[rank]) topResources.push(group[rank]);
      if (topResources.length === 20) break;
    }
  }
  if (totals.size > 1) limitations.push('Top resources are ranked within each currency and interleaved in the 20-entry summary.');
  if (!data.rows.length) limitations.push('Azure returned no billing rows for the selected period. Spend is unknown.');
  return { timeframe: 'MonthToDate', dataStatus: data.rows.length ? 'available' : 'no-data', totalsByCurrency: Object.fromEntries(totals), topResources, limitations };
}

export function policyStateCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const state = row.complianceState || 'Unknown';
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}
