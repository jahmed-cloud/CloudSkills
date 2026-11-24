import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpApp } from '../mcp/server/http.js';
import { AzureReader } from '../src/collectors/azure.js';
import { openStore } from '../src/policy/store.js';

const fixture = JSON.parse(await readFile(new URL('../examples/subscription.json', import.meta.url), 'utf8'));
const controls = JSON.parse(await readFile(new URL('../examples/organization-controls.json', import.meta.url), 'utf8'));
test('real STDIO MCP client discovers and invokes offline tools, resources, and prompts', { timeout: 30000 }, async () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['mcp/server/index.js'], cwd: process.cwd(), env: { ...process.env, POLICY_DATABASE: ':memory:', AZURE_SUBSCRIPTIONS: '' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools(); assert.equal(tools.length, 22);
    assert.equal(tools.find(t => t.name === 'learn_organization_policy').annotations.readOnlyHint, false);
    const review = await client.callTool({ name: 'azure_architecture_review', arguments: { snapshot: fixture, limit: 2 } });
    assert.ok(!review.isError); assert.equal(review.structuredContent.summary.fail, 4); assert.equal(review.structuredContent.evidence.nextOffset, 2);
    const learned = await client.callTool({ name: 'learn_organization_policy', arguments: { controls } }); assert.equal(learned.structuredContent.changed, 2);
    const matched = await client.callTool({ name: 'compare_policy_baseline', arguments: { snapshot: fixture } }); assert.equal(matched.structuredContent.counts.fail, 2);
    const denied = await client.callTool({ name: 'azure_inventory', arguments: { subscriptions: ['00000000-0000-0000-0000-000000000001'] } }); assert.equal(denied.isError, true);
    const html = await client.callTool({ name: 'generate_html_report', arguments: { snapshot: fixture } }); assert.ok(html.structuredContent.content.startsWith('<!doctype html>'));
    assert.equal((await client.listResources()).resources.length, 2);
    assert.ok((await client.readResource({ uri: 'azure-architect://baseline' })).contents[0].text.includes('AZ-KV-001'));
    assert.equal((await client.getPrompt({ name: 'subscription-review', arguments: { subscription: '00000000-0000-0000-0000-000000000001' } })).messages.length, 1);
  } finally { await client.close(); }
});
test('Streamable HTTP performs authenticated MCP exchange and rejects unsafe requests', { timeout: 30000 }, async () => {
  const token = 'test-only-secret-with-at-least-32-characters'; const store = await openStore(':memory:');
  const allowedHosts = [];
  // Build the guarded app with the actual ephemeral port after reserving it via the listener.
  const http = await import('node:http'); let current;
  const listener = http.createServer((req, res) => current(req, res));
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  allowedHosts.push(new URL(base).host);
  current = createHttpApp({ store, azure: new AzureReader({ subscriptions: '' }) }, { token, allowedHosts });
  const client = new Client({ name: 'http-client', version: '1.0.0' });
  try {
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const badHostStatus = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Host: 'evil.example', 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end('{}');
    });
    assert.equal(badHostStatus, 403);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    assert.equal((await client.listTools()).tools.length, 22);
    const result = await client.callTool({ name: 'generate_identity_diagram', arguments: { snapshot: fixture } }); assert.equal(result.structuredContent.edges.length, 1);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  } finally { await client.close(); listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); await store.close(); }
});
test('HTTP refuses weak or absent authentication at startup', () => {
  assert.throws(() => createHttpApp({}, { token: 'short', allowedHosts: ['localhost'] }), /at least 32/);
});
