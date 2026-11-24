import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, hash } from '../src/model.js';
import { audit, costAnalysis, rbacAudit, pimReview } from '../src/analyzers/index.js';
import { importDefinitions, compare, normalizeControl } from '../src/policy/engine.js';
import { openStore } from '../src/policy/store.js';
import { terraformAnalyze, terraformGenerate } from '../src/analyzers/terraform.js';
import { diagram } from '../src/diagrams/index.js';
import { htmlReport } from '../src/reporting/index.js';
import { Cache } from '../src/cache/index.js';

const fixture = JSON.parse(await readFile(new URL('../examples/subscription.json', import.meta.url), 'utf8'));
const controls = JSON.parse(await readFile(new URL('../examples/organization-controls.json', import.meta.url), 'utf8'));
test('normalization is stable across ordering and rejects duplicate IDs', () => {
  const reversed = { ...fixture, resources: [...fixture.resources].reverse() };
  assert.equal(normalize(fixture).contentHash, normalize(reversed).contentHash);
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.throws(() => normalize({ resources: [fixture.resources[0], fixture.resources[0]] }), /Duplicate/);
});
test('audit distinguishes observed failures from unknown properties', () => {
  const result = audit(fixture);
  assert.equal(result.summary.fail, 4); assert.equal(result.summary.unknown, 1); assert.equal(result.summary.pass, 22);
  assert.equal(result.findings.find(f => f.control === 'AZ-WEB-001').status, 'unknown');
  assert.equal(audit({ resources: [] }).summary.observedPassPercentage, null);
});
test('NSG management exposure includes IPv6, augmented ports, and ranges', () => {
  const nsg = structuredClone(fixture.resources[2]);
  nsg.properties.securityRules[0].properties = { direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefixes: ['::/0'], destinationPortRanges: ['3300-3400'] };
  assert.equal(audit({ resources: [nsg] }, 'network').summary.fail, 1);
  nsg.properties.securityRules[0].properties.protocol = 'Udp';
  assert.equal(audit({ resources: [nsg] }, 'network').summary.pass, 1);
});
test('learned controls produce compact provenance-backed evidence', () => {
  const result = compare(fixture, controls);
  assert.equal(result.results.length, 2); assert.ok(result.results.every(r => r.status === 'fail' && r.controlHash.length === 64));
  assert.throws(() => normalizeControl({ ...controls[0], expected: undefined }));
  assert.throws(() => normalizeControl({ ...controls[0], operator: 'in', expected: 'bad' }));
  const exists = { ...controls[0], path: 'tags.missing', operator: 'exists', expected: true };
  assert.equal(compare(fixture, [exists]).results[0].status, 'fail');
  assert.equal(compare(fixture, [{ ...controls[0], path: 'properties.notCollected' }]).results[0].status, 'unknown');
});
test('Azure Policy importer inverts violation predicates and rejects unsupported aliases', () => {
  const definition = { name: 'region', properties: { displayName: 'Allowed region', policyRule: { if: { allOf: [{ field: 'type', equals: 'Microsoft.KeyVault/vaults' }, { field: 'location', notIn: ['eastus'] }] }, then: { effect: 'deny' } } } };
  let result = importDefinitions([definition]);
  assert.equal(result.controls[0].operator, 'in'); assert.equal(compare(fixture, result.controls).results[0].status, 'pass');
  definition.properties.policyRule.if.allOf[1] = { field: 'Microsoft.KeyVault/vaults/publicNetworkAccess', notEquals: 'Disabled' };
  result = importDefinitions([definition]); assert.equal(result.unsupported.length, 1); assert.equal(result.controls.length, 0);
  definition.properties.policyRule.if.allOf[1] = { field: 'location', equals: "[concat('east', 'us')]" };
  assert.equal(importDefinitions([definition]).unsupported.length, 1);
});
test('policy storage deduplicates, updates, serializes concurrent imports, and validates batches', async () => {
  const store = await openStore(':memory:');
  try {
    assert.equal((await store.learn(controls)).changed, 2);
    assert.equal((await store.learn(controls)).changed, 0);
    await Promise.all([store.learn([{ ...controls[0], title: 'Updated networking' }]), store.learn([{ ...controls[1], title: 'Updated identity' }])]);
    assert.equal((await store.search('updated')).total, 2);
    assert.equal((await store.search('network', 'Microsoft.KeyVault/vaults', 1)).controls.length, 1);
    await assert.rejects(store.learn([controls[0], { bad: true }]));
    assert.equal((await store.search('updated')).total, 2);
  } finally { await store.close(); }
});
test('Terraform examples parse and pass supported static security checks', () => {
  for (const kind of ['storage', 'keyvault']) {
    const generated = terraformGenerate({ name: 'demoresource', kind });
    const result = terraformAnalyze(JSON.parse(generated.content));
    assert.ok(result.findings.length); assert.ok(result.findings.every(f => f.status === 'pass'));
  }
  assert.throws(() => terraformGenerate({ name: '${malicious}', kind: 'storage' }));
  assert.throws(() => terraformAnalyze({}), /Expected Terraform/);
});
test('Terraform plans inspect child modules and do not expose unrelated secrets', () => {
  const result = terraformAnalyze({ planned_values: { root_module: { child_modules: [{ resources: [{ address: 'module.app.azurerm_key_vault.main', type: 'azurerm_key_vault', values: { secret: 'never-print', purge_protection_enabled: '${var.flag}' } }] }] } } });
  assert.equal(result.resourceCount, 1); assert.ok(result.findings.every(f => f.status === 'unknown')); assert.ok(!JSON.stringify(result).includes('never-print'));
});
test('diagrams retain explicit network and identity references without label injection', () => {
  assert.equal(diagram(fixture, 'network').edges.length, 1);
  assert.equal(diagram(fixture, 'identity').edges.length, 1);
  const dirty = structuredClone(fixture); dirty.resources[0].name = '"] --> exploit["';
  assert.ok(!diagram(dirty).mermaid.includes('"] --> exploit['));
});
test('HTML escapes hostile evidence and has no remote script dependencies', () => {
  const dirty = structuredClone(fixture); dirty.resources[0].name = '<script>alert(1)</script>';
  const html = htmlReport(audit(dirty));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('Content-Security-Policy'));
});
test('costs remain separated by currency and reject invalid numeric values', () => {
  const data = { columns: [{ name: 'PreTaxCost' }, { name: 'ResourceId' }, { name: 'Currency' }], rows: [[10, 'a', 'USD'], [20, 'b', 'INR'], [3, 'c', 'USD']] };
  assert.deepEqual(costAnalysis(data).totalsByCurrency, { USD: 13, INR: 20 });
  assert.throws(() => costAnalysis({ ...data, rows: [['oops', 'a', 'USD']] }), /Invalid cost/);
});
test('RBAC and PIM outputs are review candidates rather than unsupported compliance claims', () => {
  assert.equal(rbacAudit([{ id: 'r', properties: { roleDefinitionId: '/roles/8e3af657-a8ff-443c-a75c-2fe8c4bcb635' } }]).findings[0].status, 'review');
  assert.equal(pimReview([{ id: 'a', properties: {} }, { id: 'b', properties: { endDateTime: '2030-01-01' } }], []).reviewCandidates.length, 1);
});
test('cache returns isolated values and expires entries', async () => {
  const cache = new Cache(10, 1); cache.set('a', { n: 1 }); const value = cache.get('a'); value.n = 2;
  assert.equal(cache.get('a').n, 1); cache.set('b', 2); assert.equal(cache.get('a'), undefined);
  await new Promise(r => setTimeout(r, 20)); assert.equal(cache.get('b'), undefined);
});
