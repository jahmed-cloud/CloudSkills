import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/core/mcp/create.js';
import { ProviderRegistry } from '../src/core/providers.ts';
import { normalize } from '../src/core/model.js';
import { openStore } from '../src/core/policy/store.js';

test('core MCP reports, diagrams and policy comparison operate on injected provider-neutral evidence', async () => {
  const snapshot = normalize({ provider: 'example', source: 'test', resources: [{ id: 'Service/UPPER', name: 'Example service', type: 'Example/Service', kind: 'application', tags: {}, properties: { encrypted: false } }] });
  let collected;
  const provider = {
    id: 'example', normalize,
    getInventory: async scope => { collected = scope; return snapshot; },
    getCost: async () => ({ provider: 'example', timeframe: 'test', totalsByCurrency: {}, topResources: [], limitations: [] }),
    importPolicies: () => ({ controls: [], unsupported: [] }),
    review: data => ({ schemaVersion: '1.0', provider: 'example', category: 'architecture', source: data.source, collectedAt: null, snapshotHash: data.contentHash, resourceCount: 1,
      summary: { pass: 0, fail: 0, unknown: 0, evaluated: 0, total: 0, observedPassPercentage: null }, findings: [], limitations: ['Test evidence only.'] }),
  };
  const store = await openStore(':memory:'); const registry = new ProviderRegistry([provider], 'example');
  const server = createServer({ registry, store });
  const client = new Client({ name: 'generic-client', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport); await client.connect(clientTransport);
    assert.equal((await client.listTools()).tools.length, 8);
    const report = await client.callTool({ name: 'generate_json_report', arguments: { provider: 'example', scope: { accountIds: ['example-account'] } } });
    assert.ok(!report.isError); assert.equal(JSON.parse(report.structuredContent.content).provider, 'example'); assert.deepEqual(collected, { accountIds: ['example-account'] });
    const graph = await client.callTool({ name: 'generate_architecture_diagram', arguments: { snapshot, maxNodes: 1 } });
    assert.equal(graph.structuredContent.nodes[0].id, 'Service/UPPER'); assert.equal(graph.structuredContent.totalNodes, 1);
    await client.callTool({ name: 'learn_organization_policy', arguments: { controls: [{ id: 'C-1', title: 'Encryption', provider: 'example', resourceType: 'Example/Service', path: 'properties.encrypted', operator: 'equals', expected: true, source: 'test baseline' }] } });
    const comparison = await client.callTool({ name: 'compare_policy_baseline', arguments: { snapshot } });
    assert.equal(comparison.structuredContent.counts.fail, 1);
    const unsupported = await client.callTool({ name: 'generate_json_report', arguments: { provider: 'future-provider', scope: { accountIds: ['account'] } } });
    assert.equal(unsupported.isError, true); assert.match(unsupported.content[0].text, /Unsupported provider/);
  } finally { await client.close(); await server.close(); await store.close(); }
});
