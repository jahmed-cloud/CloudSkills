import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureReader } from '../src/collectors/azure.js';
import { allowedSubscriptions } from '../mcp/auth/azure.js';

const id = '00000000-0000-0000-0000-000000000001';
const credential = { getToken: async () => ({ token: 'mock-token' }) };
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const defer = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
test('live reads require explicit valid allowlisted subscriptions before credential use', async () => {
  assert.throws(() => allowedSubscriptions([id], ''), /allowlist/);
  assert.throws(() => allowedSubscriptions(['bad'], id), /valid subscription/);
  const reader = new AzureReader({ subscriptions: '', credential: { getToken: () => { throw new Error('credential touched'); } } });
  await assert.rejects(reader.inventory([id]), /allowlist/);
  await assert.rejects(reader.request('/subscriptions/x/providers/Microsoft.Compute/delete'), /supported read/);
});
test('Resource Graph collects all pages and caches a normalized snapshot', async () => {
  const calls = [];
  const reader = new AzureReader({ subscriptions: id, credential, fetcher: async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return json({ data: [{ id: `/subscriptions/${id}/resources/${calls.length}`, name: 'demo', type: 'test/type', tags: null, identity: null }], ...(calls.length === 1 ? { $skipToken: 'next', resultTruncated: 'true' } : { resultTruncated: 'false' }) });
  } });
  const result = await reader.inventory([id]); assert.equal(result.resources.length, 2); assert.equal(calls[1].options.$skipToken, 'next');
  assert.equal((await reader.inventory([id])).cached, true); assert.equal(calls.length, 2);
});
test('Resource Graph refuses silent truncation and repeated continuation', async () => {
  const reader = new AzureReader({ subscriptions: id, credential, fetcher: async () => json({ data: [], resultTruncated: true }) });
  await assert.rejects(reader.inventory([id]), /truncated/);
  reader.fetcher = async () => json({ data: [], $skipToken: 'repeat' });
  await assert.rejects(reader.inventory([id]), /Repeated/);
});
test('Azure request retries throttling without surfacing secret response bodies', async () => {
  let attempts = 0;
  const reader = new AzureReader({ subscriptions: id, credential, delay: async () => {}, fetcher: async () => ++attempts === 1 ? new Response('secret', { status: 429 }) : json({ data: [] }) });
  await reader.graph([id], 'Resources'); assert.equal(attempts, 2);
  reader.fetcher = async () => new Response('secret', { status: 403 });
  await assert.rejects(reader.graph([id], 'Resources'), error => !error.message.includes('secret') && error.message.includes('403'));
});
test('ARM lists paginate and reject foreign continuation URLs', async () => {
  let calls = 0;
  const base = `https://management.azure.com/subscriptions/${id}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`;
  const reader = new AzureReader({ subscriptions: id, credential, fetcher: async () => json(++calls === 1 ? { value: [{ id: 'a' }], nextLink: `${base}&skiptoken=next` } : { value: [{ id: 'b' }] }) });
  assert.equal((await reader.list(id, 'rbac')).length, 2);
  reader.fetcher = async () => json({ value: [], nextLink: 'https://evil.example/steal' });
  await assert.rejects(reader.list(id, 'rbac'), /Unexpected Azure/);
});

test('Resource Graph validates page inputs before requesting Azure credentials', async () => {
  const reader = new AzureReader({ subscriptions: id, credential: { getToken: () => { throw new Error('credential touched'); } } });
  for (const options of [{ limit: 0 }, { limit: 1001 }, { limit: 1.5 }, { skipToken: '' }, { skipToken: 42 }]) {
    await assert.rejects(reader.graph([id], 'Resources', options), /Invalid Azure/);
  }
  await assert.rejects(reader.graph([id], ' '), /Invalid Azure/);
  await assert.rejects(reader.graph([id], 'x'.repeat(20001)), /Invalid Azure/);
  for (const options of [{ maxPages: 0 }, { maxPages: 1.5 }, { maxResources: 0 }, { maxResources: 50001 }]) {
    assert.throws(() => new AzureReader(options), /Invalid Azure collection bounds/);
  }
});

test('Resource Graph page/resource bounds reject partial evidence without caching it', async () => {
  let calls = 0;
  const record = n => ({ id: `/subscriptions/${id}/resources/${n}`, name: `resource-${n}`, type: 'test/type' });
  const reader = new AzureReader({ subscriptions: id, credential, maxPages: 1, fetcher: async () => {
    calls++;
    return json({ data: [record(1)], $skipToken: 'next' });
  } });
  await assert.rejects(reader.inventory([id]), /pagination exceeded/);
  assert.equal(calls, 1);
  assert.equal(reader.cache.stats.entries, 0);
  reader.fetcher = async () => { calls++; return json({ data: [record(1)], resultTruncated: false }); };
  assert.equal((await reader.inventory([id])).resources.length, 1);
  assert.equal(calls, 2);

  const bounded = new AzureReader({ subscriptions: id, credential, maxResources: 1, fetcher: async () => json({ data: [record(1), record(2)] }) });
  await assert.rejects(bounded.inventory([id]), /resource limit/);
  assert.equal(bounded.cache.stats.entries, 0);
  bounded.fetcher = async () => json({ data: [record(1)], $skipToken: 'next' });
  await assert.rejects(bounded.inventory([id]), /resource limit/);
  bounded.fetcher = async () => json({ data: [record(1)] });
  assert.equal((await bounded.inventory([id])).resources.length, 1);
});

test('Resource Graph refuses malformed response pages', async () => {
  const reader = new AzureReader({ subscriptions: id, credential });
  for (const body of [{ data: {} }, { data: [], $skipToken: 123 }]) {
    reader.fetcher = async () => json(body);
    await assert.rejects(reader.inventory([id]), /invalid page/);
    assert.equal(reader.cache.stats.entries, 0);
  }
});

test('concurrent Azure inventory requests coalesce by sorted scope and return isolated snapshots', async () => {
  const secondId = '00000000-0000-0000-0000-000000000002';
  const gate = defer(), started = defer(); let calls = 0, body;
  const reader = new AzureReader({ subscriptions: `${id},${secondId}`, credential, fetcher: async (_url, options) => {
    calls++; body = JSON.parse(options.body); started.resolve(); await gate.promise;
    return json({ data: [{ id: `/subscriptions/${id}/resources/one`, name: 'one', type: 'test/type', tags: { owner: 'team' } }] });
  } });
  const first = reader.inventory([id, secondId]);
  const second = reader.inventory([secondId, id], { refresh: true });
  await started.promise;
  assert.equal(calls, 1);
  assert.equal(reader.cache.stats.inFlight, 1);
  assert.deepEqual(body.subscriptions, [id, secondId]);
  assert.ok(body.query.endsWith('order by id asc'));
  gate.resolve();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.cached, false);
  assert.equal(right.cached, false);
  left.resources[0].tags.owner = 'changed';
  assert.equal(right.resources[0].tags.owner, 'team');
  assert.equal((await reader.inventory([secondId, id])).resources[0].tags.owner, 'team');
  assert.equal(calls, 1);
});

test('cancelling one inventory waiter preserves the shared Azure collection', async () => {
  const gate = defer(), started = defer(); let calls = 0;
  const controller = new AbortController();
  const reader = new AzureReader({ subscriptions: id, credential, fetcher: async () => {
    calls++; started.resolve(); await gate.promise;
    return json({ data: [{ id: `/subscriptions/${id}/resources/one`, name: 'one', type: 'test/type' }] });
  } });
  const cancelled = reader.inventory([id], { signal: controller.signal });
  const surviving = reader.inventory([id]);
  await started.promise;
  controller.abort(new Error('caller stopped waiting'));
  await assert.rejects(cancelled, /caller stopped waiting/);
  assert.equal(reader.cache.stats.inFlight, 1);
  gate.resolve();
  assert.equal((await surviving).resources.length, 1);
  assert.equal((await reader.inventory([id])).cached, true);
  assert.equal(calls, 1);
  await assert.rejects(reader.inventory([id], { signal: controller.signal }), /caller stopped waiting/);
  assert.equal(calls, 1);
});

test('Azure retries are bounded and cap excessive Retry-After delays', async () => {
  const delays = []; let calls = 0;
  const reader = new AzureReader({ subscriptions: id, credential, delay: async ms => { delays.push(ms); }, fetcher: async () => {
    calls++;
    return new Response('private response details', { status: 503, headers: { 'Retry-After': '25' } });
  } });
  await assert.rejects(reader.graph([id], 'Resources'), error => error.message.includes('503') && !error.message.includes('private'));
  assert.equal(calls, 4);
  assert.deepEqual(delays, [10000, 10000, 10000]);
});

test('Azure cost pages retain stable columns and refuse changed schemas or pagination loops', async () => {
  const base = `https://management.azure.com/subscriptions/${id}/providers/Microsoft.CostManagement/query?api-version=2025-03-01`;
  const columns = [{ name: 'PreTaxCost' }, { name: 'ResourceId' }, { name: 'Currency' }]; let calls = 0;
  const reader = new AzureReader({ subscriptions: id, credential, fetcher: async () => {
    calls++;
    return json({ properties: { columns, rows: [[calls, `resource-${calls}`, 'USD']], ...(calls === 1 ? { nextLink: `${base}&skiptoken=next` } : {}) } });
  } });
  assert.deepEqual(await reader.list(id, 'costs'), { columns, rows: [[1, 'resource-1', 'USD'], [2, 'resource-2', 'USD']] });
  calls = 0;
  reader.fetcher = async () => {
    calls++;
    return json({ properties: { columns: calls === 1 ? columns : columns.slice().reverse(), rows: [[1, 'r', 'USD']], nextLink: `${base}&skiptoken=next` } });
  };
  await assert.rejects(reader.list(id, 'costs'), /columns changed/);
  reader.fetcher = async () => json({ properties: { columns, rows: [], nextLink: base } });
  await assert.rejects(reader.list(id, 'costs'), /pagination exceeded/);
});
