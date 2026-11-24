import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeControl } from './engine.js';

/** @returns {Promise<import('../interfaces/index.ts').IPolicyStore>} */
export async function openStore(location = process.env.POLICY_DATABASE || 'knowledge/organization/policies.db') {
  const postgres = /^postgres(ql)?:\/\//.test(location);
  let db;
  if (postgres) { const { default: pg } = await import('pg'); db = new pg.Pool({ connectionString: location, max: 4 }); }
  else { if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true }); db = new DatabaseSync(location); db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;'); }
  const execute = async (sql, params = []) => postgres ? (await db.query(sql, params)).rows : db.prepare(sql).all(...params);
  await execute('CREATE TABLE IF NOT EXISTS controls (id TEXT PRIMARY KEY, hash TEXT NOT NULL, body TEXT NOT NULL)');
  let pending = Promise.resolve();
  return {
    async learn(inputs) {
      const previous = pending;
      let release;
      pending = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await this.learnBatch(inputs); } finally { release(); }
    },
    async learnBatch(inputs) {
      const controls = inputs.map(normalizeControl);
      if (new Set(controls.map(c => c.id)).size !== controls.length) throw new Error('Duplicate control IDs in import');
      const client = postgres ? await db.connect() : null;
      const run = async (sql, values = []) => postgres ? client.query(sql, values) : db.prepare(sql).run(...values);
      let changed = 0;
      try {
        await run('BEGIN');
        for (const c of controls) {
          const rows = postgres ? (await client.query('SELECT hash FROM controls WHERE id=$1', [c.id])).rows : db.prepare('SELECT hash FROM controls WHERE id=?').all(c.id);
          if (rows[0]?.hash === c.hash) continue;
          await run(`INSERT INTO controls(id,hash,body) VALUES (${postgres ? '$1,$2,$3' : '?,?,?'}) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash, body=excluded.body`, [c.id, c.hash, JSON.stringify(c)]);
          changed++;
        }
        await run('COMMIT');
      } catch (error) { await run('ROLLBACK'); throw error; }
      finally { client?.release(); }
      return { imported: controls.length, changed, unchanged: controls.length - changed };
    },
    async all() { await pending; return (await execute('SELECT body FROM controls ORDER BY id')).map(row => JSON.parse(row.body)); },
    async search(query = '', resourceType, limit = 20) {
      const all = await this.all(); const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = all.filter(c => (!resourceType || c.resourceType === '*' || c.resourceType === resourceType.toLowerCase()) && terms.every(term => `${c.id} ${c.title} ${c.path}`.toLowerCase().includes(term)));
      return { total: matches.length, controls: matches.slice(0, limit), truncated: matches.length > limit };
    },
    async close() { await pending; if (postgres) await db.end(); else db.close(); },
  };
}
