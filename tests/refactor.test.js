import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { normalize } from '../src/core/model.js';
import { compare } from '../src/core/policy/engine.js';
import { openStore } from '../src/core/policy/store.js';
import { htmlReport, jsonReport } from '../src/core/reporting/index.js';
import { diagram } from '../src/core/diagrams/index.js';
import { Cache } from '../src/core/cache/index.js';
import { ProviderRegistry } from '../src/core/providers.ts';
import { AzureProvider } from '../src/providers/azure/provider.ts';
import { canonical } from '../src/core/model.js';

const resource = (id, extra = {}) => ({ id, name: id, type: 'Example.Service/Widget', tags: {}, properties: {}, ...extra });
test('generic snapshot hashes follow JSON semantics across persistence of optional values', () => {
  const original = normalize({ provider: 'example', resources: [resource('X', { accountId: undefined, properties: { optional: undefined, values: [undefined, null] } })] });
  const restored = normalize(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.contentHash, original.contentHash);
  assert.equal(canonical({ missing: undefined, present: null }), '{"present":null}');
  assert.equal(canonical([undefined, , null]), '[null,null,null]');
});
const snapshot = () => normalize({ provider: 'example', source: 'test evidence', resources: [
  resource('Widget/Upper', { accountId: 'account', group: 'group', kind: 'application', tags: { owner: 'team' }, properties: { encrypted: true }, references: [{ id: 'widget/upper', path: 'properties.target' }] }),
  resource('widget/upper', { accountId: 'account', group: 'group', kind: 'data' }),
] });
const control = (id, extra = {}) => ({ id, title: id, provider: 'example', resourceType: 'Example.Service/Widget', path: 'properties.encrypted', operator: 'equals', expected: true, source: 'approved controls', ...extra });
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('generic normalization preserves case-sensitive identifiers and provider provenance', () => {
  const original = snapshot();
  assert.deepEqual(original.resources.map(r => r.id), ['widget/upper', 'Widget/Upper'].sort((a, b) => a.localeCompare(b)));
  assert.equal(original.resources.find(r => r.id === 'Widget/Upper').type, 'Example.Service/Widget');
  assert.equal(normalize({ ...original, resources: [...original.resources].reverse() }).contentHash, original.contentHash);
  assert.notEqual(normalize({ ...original, provider: 'another' }).contentHash, original.contentHash);
  assert.throws(() => normalize({ ...original, resources: [original.resources[0], original.resources[0]] }), /Duplicate resource/);
  assert.throws(() => normalize({ ...original, resources: [resource('broken', { references: [{ id: 123, path: 'target' }] })] }));
});

test('provider-neutral controls persist in SQLite and restrict comparisons to their provider', async () => {
  const store = await openStore(':memory:');
  try {
    await store.learn([control('encryption'), control('foreign', { provider: 'azure' }), control('owner', { provider: undefined, path: 'tags.owner', operator: 'exists', expected: true })]);
    const learned = await store.all();
    assert.equal((await store.search('encryption', 'Example.Service/Widget')).total, 1);
    const result = compare(snapshot(), learned);
    assert.equal(result.results.length, 4);
    assert.ok(result.results.every(r => r.control !== 'foreign' && r.controlHash.length === 64));
    assert.deepEqual(result.results.filter(r => r.control === 'encryption').map(r => r.status).sort(), ['pass', 'unknown']);
    assert.deepEqual(result.results.filter(r => r.control === 'owner').map(r => r.status).sort(), ['fail', 'pass']);
    await assert.rejects(store.learn([control('missing-expected', { expected: undefined })]));
    assert.equal((await store.all()).length, 3);
  } finally { await store.close(); }
});

test('generic reports recalculate summaries and render escaped non-Azure evidence', () => {
  const input = {
    schemaVersion: '1.0', provider: 'example', category: 'security', source: 'test evidence', collectedAt: null,
    snapshotHash: snapshot().contentHash, resourceCount: 2,
    summary: { pass: 99, fail: 0, unknown: 0, evaluated: 99, total: 99, observedPassPercentage: 100 },
    findings: [{ id: 'finding', control: 'encryption', resourceId: 'Widget/Upper', resourceName: '<img src=x>', category: 'security', severity: 'high', status: 'fail', title: 'Encryption required', evidence: { path: 'properties.encrypted', expected: true, actual: false }, recommendation: 'Enable encryption', source: 'javascript:alert(1)' }],
    limitations: ['Synthetic provider evidence'],
  };
  const json = JSON.parse(jsonReport(input));
  assert.equal(json.provider, 'example');
  assert.equal(json.findings[0].resourceId, 'Widget/Upper');
  assert.deepEqual(json.summary, { pass: 0, fail: 1, unknown: 0, total: 1, evaluated: 1, observedPassPercentage: 0 });
  const html = htmlReport(input);
  assert.ok(html.includes('CloudSkills') && html.includes('example') && html.includes('&lt;img src=x&gt;'));
  assert.ok(!html.includes('<img src=x>') && !html.includes('href="javascript:'));
  assert.ok(!html.includes('Azure'));
  assert.equal(input.summary.pass, 99);
  assert.throws(() => jsonReport({ ...input, findings: [{ ...input.findings[0], status: 'compliant' }] }));
});

test('generic diagrams use explicit references, retain provider case and bound large views', () => {
  const full = diagram(snapshot());
  assert.equal(full.provider, 'example');
  assert.equal(full.edges.length, 1);
  assert.equal(full.nodes.length, 2);
  assert.ok(full.mermaid.includes('subgraph') && full.mermaid.includes('classDef data'));
  const bounded = diagram(snapshot(), 'architecture', { maxNodes: 1 });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.omittedNodes, 1);
  assert.equal(bounded.omittedEdges, 1);
  assert.equal(bounded.edges.length, 0);
  assert.throws(() => diagram(snapshot(), 'architecture', { maxNodes: 0 }), /maxNodes/);
});

test('provider registry rejects unsupported providers, duplicate registration and mismatched snapshots', () => {
  const azure = new AzureProvider();
  const registry = new ProviderRegistry([azure], 'azure');
  assert.equal(registry.get(), azure);
  assert.equal(registry.forSnapshot({ provider: 'unknown' }), azure);
  assert.throws(() => registry.get('aws'), /Unsupported provider/);
  assert.throws(() => registry.forSnapshot({ provider: 'example' }), /Unsupported provider/);
  assert.throws(() => registry.forSnapshot({ provider: 'example' }, 'azure'), /does not match/);
  assert.throws(() => new ProviderRegistry([azure, azure], 'azure'), /Duplicate provider/);
  assert.throws(() => new ProviderRegistry([], 'azure'), /Unsupported provider/);
  assert.throws(() => azure.normalize(snapshot()), /another provider/);
});

test('Azure normalization preserves explicit relationships and is idempotent across native object ordering', () => {
  const azure = new AzureProvider();
  const source = '/subscriptions/account/resources/source', first = '/subscriptions/account/resources/first', second = '/subscriptions/account/resources/second';
  const native = { id: source, name: 'source', type: 'microsoft.web/sites', properties: { first, second },
    references: [{ id: first.toUpperCase(), path: 'properties.first' }, { id: second.toUpperCase(), path: 'explicit.dependency' }] };
  const input = { resources: [native, resource(first), resource(second)] };
  const left = azure.normalize(input);
  const reordered = { ...native, properties: { second, first }, references: [...native.references].reverse() };
  const right = azure.normalize({ resources: [reordered, resource(first), resource(second)] });
  assert.equal(left.contentHash, right.contentHash);
  const normalizedSource = left.resources.find(r => r.id === source);
  assert.equal(normalizedSource.references.length, 3);
  assert.ok(normalizedSource.references.some(ref => ref.id === second && ref.path === 'explicit.dependency'));
  assert.equal(normalizedSource.references.filter(ref => ref.id === first && ref.path === 'properties.first').length, 1);
  const repeated = azure.normalize(left);
  assert.equal(repeated.contentHash, left.contentHash);
  assert.deepEqual(repeated.resources, left.resources);
  assert.equal(diagram(repeated).edges.length, 3);
  assert.equal(azure.normalize(JSON.parse(JSON.stringify(left))).contentHash, left.contentHash);
});

test('core modules cannot import a cloud SDK or provider adapter', async () => {
  async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await checkDirectory(url);
      else if (/\.[cm]?[jt]s$/.test(entry.name)) {
        const content = await readFile(url, 'utf8');
        const imports = [...content.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
        assert.ok(imports.every(specifier => !/providers\/|@azure\/|@aws-sdk\/|@google-cloud\//.test(specifier)), `${url.pathname} imports a provider-specific module`);
      }
    }
  }
  await checkDirectory(new URL('../src/core/', import.meta.url));
});

test('cache evicts least recently used entries and retains an absolute TTL', () => {
  let now = 0;
  const cache = new Cache(50, 2, { now: () => now });
  cache.set('a', { value: 1 });
  cache.set('b', { value: 2 });
  now = 10;
  assert.equal(cache.get('a').value, 1);
  cache.set('c', { value: 3 });
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a').value, 1);
  now = 50;
  assert.equal(cache.get('a'), undefined);
  assert.deepEqual(cache.stats, { entries: 1, bytes: Buffer.byteLength(JSON.stringify({ value: 3 })), inFlight: 0 });
  now = 60;
  assert.equal(cache.stats.entries, 0);
  assert.equal(cache.stats.bytes, 0);
});

test('cache enforces aggregate bytes and per-entry limits independently of count', () => {
  const cache = new Cache(1000, 10, { maxBytes: 20, maxEntryBytes: 15 });
  assert.equal(cache.set('a', '12345678'), true);
  assert.equal(cache.set('b', '12345678'), true);
  assert.equal(cache.stats.bytes, 20);
  cache.get('a');
  cache.set('c', '12345678');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.stats.bytes, 20);
  assert.equal(cache.set('large', '1234567890123456'), false);
  assert.equal(cache.get('large'), undefined);
  assert.equal(cache.stats.entries, 2);
  assert.throws(() => new Cache(0), /positive integers/);
});

test('cache coalesces concurrent loads, isolates callers and bounds pending work', async () => {
  const cache = new Cache(1000, 1);
  const gate = defer(); let calls = 0;
  const loader = async () => { calls++; return gate.promise; };
  const first = cache.getOrLoad('a', loader);
  const second = cache.getOrLoad('a', loader, { refresh: true });
  await assert.rejects(cache.getOrLoad('b', loader), /busy/);
  assert.equal(calls, 1);
  assert.equal(cache.stats.inFlight, 1);
  gate.resolve({ value: [1] });
  const [left, right] = await Promise.all([first, second]);
  left.value.value.push(2);
  assert.deepEqual(right.value, { value: [1] });
  assert.deepEqual(cache.get('a'), { value: [1] });
  assert.equal(left.cached, false);
  assert.equal((await cache.getOrLoad('a', loader)).cached, true);
  assert.equal(cache.stats.inFlight, 0);
});

test('failed shared cache loads can retry and failed refreshes retain usable evidence', async () => {
  const cache = new Cache(); let calls = 0;
  const failure = new Error('read failed');
  const loader = () => { calls++; throw failure; };
  const results = await Promise.allSettled([cache.getOrLoad('a', loader), cache.getOrLoad('a', loader)]);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason === failure));
  assert.deepEqual(cache.stats, { entries: 0, bytes: 0, inFlight: 0 });
  assert.equal((await cache.getOrLoad('a', async () => ({ recovered: true }))).cached, false);
  await assert.rejects(cache.getOrLoad('a', loader, { refresh: true }), /read failed/);
  assert.deepEqual((await cache.getOrLoad('a', loader)).value, { recovered: true });
  assert.equal(cache.stats.inFlight, 0);
});
