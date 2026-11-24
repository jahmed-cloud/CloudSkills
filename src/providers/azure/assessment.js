import { allowedSubscriptions } from './auth.js';
import { pimReview, policyStateCounts, rbacAudit } from './analyzers.js';

const sources = {
  policy: 'Azure Policy Insights',
  rbac: 'Azure RBAC',
  pim: 'Azure resource PIM',
  cost: 'Azure Cost Management',
  advisor: 'Azure Advisor',
};

function advisorReview(rows) {
  return {
    count: rows.length,
    recommendations: rows.map(({ id, properties = {} }) => ({
      id,
      resourceId: properties.resourceMetadata?.resourceId ?? null,
      category: properties.category ?? null,
      impact: properties.impact ?? null,
      lastUpdated: properties.lastUpdated ?? null,
      title: properties.shortDescription?.problem ?? null,
      recommendation: properties.shortDescription?.solution ?? null,
      suppressionIds: properties.suppressionIds ?? [],
    })),
    limitations: ['Advisor recommendations are cached. Check freshness and suppressions in Azure before acting. No savings are calculated from these recommendations.'],
  };
}

async function collect(source, read) {
  try {
    const evidence = await read();
    return {
      source,
      collectedAt: new Date().toISOString(),
      status: evidence.dataStatus === 'no-data' ? 'no-data' : 'collected',
      evidence,
    };
  } catch (error) {
    // Avoid publishing SDK errors, request URLs, or credential details in report artifacts.
    const httpStatus = /^Azure read failed \(HTTP (\d{3})\);/.exec(error?.message)?.[1];
    return {
      source,
      status: 'unavailable',
      reason: httpStatus ? `Azure returned HTTP ${httpStatus}.` : 'Read failed or returned incomplete evidence. Check local authentication, connectivity, and collection limits.',
    };
  }
}

export async function collectAssessmentEvidence(provider, subscriptions) {
  const ids = allowedSubscriptions(subscriptions, provider.reader.subscriptions);
  const read = (id, kind) => provider.reader.list(id, kind);
  const results = [];
  // Limit fan-out to one subscription's sources at a time. Each API stream paginates independently.
  for (const subscription of ids) {
    const [policy, rbac, pim, cost, advisor] = await Promise.all([
      collect(sources.policy, async () => {
        const rows = await read(subscription, 'policyStates');
        return {
          counts: policyStateCounts(rows),
          records: rows.filter(row => row.complianceState !== 'Compliant').map(row => ({
            state: row.complianceState || 'Unknown',
            resourceId: row.resourceId ?? null,
            timestamp: row.timestamp ?? null,
            assignmentId: row.policyAssignmentId ?? null,
            definitionId: row.policyDefinitionId ?? null,
            definitionReferenceId: row.policyDefinitionReferenceId ?? null,
          })),
          limitations: ['Counts are policy evaluation records, not unique resources. Freshness and assignment coverage depend on Azure Policy Insights.'],
        };
      }),
      collect(sources.rbac, async () => rbacAudit(await read(subscription, 'rbac'))),
      collect(sources.pim, async () => {
        const [active, eligible] = await Promise.all([read(subscription, 'pimActive'), read(subscription, 'pimEligible')]);
        return pimReview(active, eligible);
      }),
      collect(sources.cost, () => provider.getCost({ accountIds: [subscription] })),
      collect(sources.advisor, async () => advisorReview(await read(subscription, 'advisor'))),
    ]);
    results.push({ subscription, policy, rbac, pim, cost, advisor });
  }
  return results;
}

export function assessmentBundle(report, baseline, subscriptions) {
  const sections = subscriptions.flatMap(({ subscription, ...evidence }) => Object.values(evidence));
  return {
    schemaVersion: '1.0',
    provider: report.provider,
    snapshotHash: report.snapshotHash,
    inventory: { source: report.source, collectedAt: report.collectedAt, resourceCount: report.resourceCount, summary: report.summary, artifact: 'report.json' },
    organizationBaseline: baseline ? { status: 'compared', artifact: 'organization-policy.json', observedFailures: baseline.results.filter(result => result.status === 'fail').length, unknown: baseline.results.filter(result => result.status === 'unknown').length } : { status: 'not-provided' },
    liveEvidenceStatus: sections.length === 0 ? 'offline' : sections.every(section => section.status === 'collected') ? 'collected' : 'incomplete',
    subscriptions,
  };
}

const markdown = value => String(value).replace(/[\r\n]+/g, ' ')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[\\`*_{}\[\]()#!|]/g, '\\$&');

function describe({ status, reason, evidence }, kind) {
  if (status === 'unavailable') return `Unavailable. ${markdown(reason)}`;
  if (status === 'no-data') return 'No billing data returned. Spend is unknown.';
  switch (kind) {
    case 'policy': {
      const counts = Object.entries(evidence.counts).map(([state, count]) => `${markdown(state)} ${count}`);
      return counts.length ? `${counts.join(', ')} evaluation records.` : 'No evaluation records returned. Compliance coverage is unknown.';
    }
    case 'rbac': return `${evidence.findings.length} privileged role assignments to review across ${evidence.assignmentCount} returned assignments.`;
    case 'pim': return `${evidence.reviewCandidates.length} active assignments without an end time to review. ${evidence.activeCount} active and ${evidence.eligibleCount} eligible assignments returned.`;
    case 'cost': return `Month-to-date actual cost. ${Object.entries(evidence.totalsByCurrency).map(([currency, amount]) => `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}`).join(', ')}. Billing data may arrive late.`;
    case 'advisor': return `${evidence.count} cached recommendations returned. Check freshness and suppressions before acting.`;
  }
}

export function assessmentMarkdown(bundle, findings) {
  const { inventory, organizationBaseline, subscriptions } = bundle;
  const lines = [
    '# Azure subscription assessment', '',
    `Resources reviewed: ${inventory.resourceCount}. Failed configuration checks: ${inventory.summary.fail}. Checks needing more evidence: ${inventory.summary.unknown}.`, '',
    'Open the [HTML inventory review](report.html) for configuration findings and [assessment evidence](assessment.json) for source-level details.', '',
  ];
  const severity = ['critical', 'high', 'medium', 'low'];
  const priorities = findings.filter(finding => finding.status === 'fail')
    .sort((a, b) => severity.indexOf(a.severity) - severity.indexOf(b.severity)).slice(0, 5);
  if (priorities.length) {
    lines.push('## Configuration findings to review first', '');
    for (const finding of priorities) lines.push(`- **${markdown(finding.title)}** (${markdown(finding.resourceName)}, ${markdown(finding.severity)}). ${markdown(finding.recommendation)}`);
    lines.push('');
  }
  lines.push('## Organization baseline', '');
  lines.push(organizationBaseline.status === 'compared'
    ? `${organizationBaseline.observedFailures} failed and ${organizationBaseline.unknown} unknown comparisons against the [provided controls](organization-policy.json).`
    : 'No local organization controls were supplied. To compare an approved baseline, use `--policy controls.json`.');
  lines.push('', '## Live Azure evidence', '');
  if (!subscriptions.length) lines.push('This assessment used a local snapshot. Run it with an allowlisted subscription UUID to collect live evidence.', '');
  for (const { subscription, ...evidence } of subscriptions) {
    lines.push(`### ${subscription}`, '', '| Source | Result |', '| --- | --- |');
    for (const [kind, section] of Object.entries(evidence)) lines.push(`| ${section.source} | ${describe(section, kind)} |`);
    lines.push('');
    if (evidence.cost.status === 'collected') {
      const totals = Object.keys(evidence.cost.evidence.totalsByCurrency).sort();
      for (const currency of totals) {
        const top = evidence.cost.evidence.topResources.filter(resource => resource.currency === currency).slice(0, 3);
        if (!top.length) continue;
        lines.push(`**Top billed resources or unallocated charges (${currency})**`, '');
        for (const { resourceId, amount } of top) {
          lines.push(`- ${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${currency} · ${markdown(resourceId ?? 'Unallocated charges')}`);
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
