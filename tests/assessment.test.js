import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureReader } from '../src/providers/azure/collector.js';
import { AzureProvider } from '../src/providers/azure/provider.ts';
import { assessmentBundle, assessmentMarkdown, collectAssessmentEvidence } from '../src/providers/azure/assessment.js';
import { costAnalysis } from '../src/providers/azure/analyzers.js';

const subscription = '00000000-0000-0000-0000-000000000001';
const columns = [{ name: 'Cost' }, { name: 'ResourceId' }, { name: 'Currency' }];

test('assessment keeps independent evidence when access is denied and billing has no rows', async () => {
  const requests = [];
  const reader = new AzureReader({ subscriptions: subscription, credential: { getToken: async () => ({ token: 'test-token' }) }, fetcher: async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, method: options.method });
    if (path.endsWith('/query')) return new Response(null, { status: 204 });
    if (path.endsWith('/roleAssignments')) return new Response('private request details', { status: 403 });
    if (path.endsWith('/queryResults')) return Response.json({ value: [{ complianceState: 'NonCompliant', resourceId: '/storage', policyAssignmentId: '/policy-assignment' }, { complianceState: 'Compliant' }] });
    if (path.endsWith('/recommendations')) return Response.json({ value: [{ id: '/recommendation', properties: { shortDescription: { problem: 'Review sizing' }, resourceMetadata: { resourceId: '/compute' } } }] });
    return Response.json({ value: [] });
  } });
  const provider = new AzureProvider(reader);
  const evidence = await collectAssessmentEvidence(provider, [subscription, subscription]);
  assert.equal(evidence.length, 1);
  assert.equal(requests.length, 6);
  assert.ok(requests.some(({ path, method }) => path.endsWith('/recommendations') && method === 'GET'));
  const [result] = evidence;
  assert.deepEqual(result.policy.evidence.counts, { NonCompliant: 1, Compliant: 1 });
  assert.equal(result.policy.evidence.records[0].assignmentId, '/policy-assignment');
  assert.deepEqual(result.rbac, { source: 'Azure RBAC', status: 'unavailable', reason: 'Azure returned HTTP 403.' });
  assert.equal(result.pim.status, 'collected');
  assert.equal(result.cost.status, 'no-data');
  assert.deepEqual(result.cost.evidence.totalsByCurrency, {});
  assert.equal(result.advisor.evidence.recommendations[0].resourceId, '/compute');
  const report = provider.review(provider.normalize({ resources: [] }));
  const bundle = assessmentBundle(report, undefined, evidence);
  assert.equal(bundle.liveEvidenceStatus, 'incomplete');
  const brief = assessmentMarkdown(bundle, report.findings);
  assert.match(brief, /Azure returned HTTP 403/);
  assert.match(brief, /Spend is unknown/);
  assert.doesNotMatch(brief, /private request details|test-token/);
});

test('cost summary groups repeated resource rows by currency and distinguishes zero from missing values', () => {
  const result = costAnalysis({ columns, rows: [[2, '/ONE', 'USD'], [4, '/one', 'USD'], [0, null, 'USD'], [50, '/two', 'EUR'], [40, '/three', 'EUR']] });
  assert.deepEqual(result.totalsByCurrency, { USD: 6, EUR: 90 });
  assert.deepEqual(result.topResources.map(({ resourceId, amount }) => [resourceId, amount]), [['/two', 50], ['/one', 6], ['/three', 40], [null, 0]]);
  for (const missing of [null, '', ' ', false]) {
    assert.throws(() => costAnalysis({ columns, rows: [[missing, null, 'USD']] }), /Invalid cost amount/);
  }
  assert.equal(costAnalysis({ columns, rows: [] }).dataStatus, 'no-data');
});
