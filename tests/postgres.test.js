import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/policy/store.js';

test('PostgreSQL persists and retrieves organization controls', { skip: !process.env.TEST_POSTGRES_URL }, async () => {
  const store = await openStore(process.env.TEST_POSTGRES_URL);
  const control = { id: `test-${randomUUID()}`, title: 'Postgres roundtrip', resourceType: '*', path: 'location', operator: 'equals', expected: 'eastus', source: 'test' };
  try {
    assert.equal((await store.learn([control])).changed, 1);
    assert.equal((await store.learn([control])).unchanged, 1);
    const found = await store.search(control.id); assert.equal(found.total, 1); assert.equal(found.controls[0].expected, 'eastus');
  } finally { await store.close(); }
});
