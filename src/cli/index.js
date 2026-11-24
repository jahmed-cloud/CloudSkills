import { parseArgs } from 'node:util';
import { readFile, mkdir, open, lstat, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Keep help and argument errors fast: provider, report and SDK modules load only for a run.
const usage = 'Usage: npm run audit -- (--input snapshot.json | --subscription UUID[,UUID] | --account ID[,ID]) [--provider azure] [--output reports/audit] [--policy controls.json] [--refresh] [--fail-on-findings]';

async function writeBundle(output, artifacts) {
  await mkdir(output, { recursive: true });
  // Serialize writers targeting one evidence directory, including concurrent CLI runs.
  const lock = resolve(output, '.cloudskills-write.lock');
  const handle = await open(lock, 'wx');
  const written = [];
  try {
    // Discover every collision before writing any evidence. Never overwrite a prior run.
    for (const filename of Object.keys(artifacts)) {
      const target = resolve(output, filename);
      try { await lstat(target); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw new Error(`EEXIST: audit artifact already exists: ${target}; choose a fresh output directory`);
    }
    for (const [filename, content] of Object.entries(artifacts)) {
      const target = resolve(output, filename);
      await mkdir(dirname(target), { recursive: true });
      const file = await open(target, 'wx');
      written.push(target);
      try { await file.writeFile(content); } finally { await file.close(); }
    }
  } catch (error) {
    await Promise.allSettled(written.map(target => unlink(target)));
    throw error;
  } finally {
    await handle.close(); await unlink(lock);
  }
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    input: { type: 'string' }, subscription: { type: 'string' }, account: { type: 'string' },
    provider: { type: 'string' }, output: { type: 'string', default: 'reports/audit' },
    policy: { type: 'string' }, refresh: { type: 'boolean', default: false },
    'fail-on-findings': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log(usage);
  } else {
    if (positionals.length !== 1 || positionals[0] !== 'audit' || [values.input, values.subscription, values.account].filter(Boolean).length !== 1) {
      throw new Error('Use audit with exactly one of --input, --subscription or --account; see --help');
    }
    const { createDependencies } = await import('../bootstrap.js');
    const { registry } = createDependencies();
    const input = values.input ? JSON.parse(await readFile(values.input, 'utf8')) : undefined;
    const provider = values.input ? registry.forSnapshot(input ?? {}, values.provider) : registry.get(values.provider);
    const snapshot = values.input ? provider.normalize(input) : await provider.getInventory({ accountIds: (values.subscription || values.account).split(',').map(id => id.trim()) }, { refresh: values.refresh });
    const [{ htmlReport, jsonReport }, { diagram }, { compare }] = await Promise.all([
      import('../core/reporting/index.js'), import('../core/diagrams/index.js'), import('../core/policy/engine.js'),
    ]);
    const report = provider.review(snapshot); const output = resolve(values.output);
    const artifacts = { 'report.json': jsonReport(report), 'report.html': htmlReport(report) };
    for (const kind of ['architecture', 'network', 'identity']) artifacts[`${kind}.mmd`] = diagram(snapshot, kind).mermaid;
    let policyResult;
    if (values.policy) { policyResult = compare(snapshot, JSON.parse(await readFile(values.policy, 'utf8'))); artifacts['organization-policy.json'] = JSON.stringify(policyResult, null, 2); }
    // Terraform examples remain an Azure capability, outside the generic report pipeline.
    if (provider.id === 'azure') {
      const { terraformGenerate } = await import('../providers/azure/terraform.js');
      for (const kind of ['storage', 'keyvault']) artifacts[`terraform/${kind}/main.tf.json`] = terraformGenerate({ name: 'cloudskillsexample', kind }).content;
    }
    artifacts['manifest.json'] = JSON.stringify({ provider: provider.id, snapshotHash: snapshot.contentHash, generatedAt: new Date().toISOString(), files: Object.keys(artifacts), limitations: ['Terraform examples need workload-specific configuration and validation before use.', 'CLI report contains inventory checks. Live RBAC/PIM/cost/Policy states are separate MCP tools and are not included.'] }, null, 2);
    await writeBundle(output, artifacts);
    console.log(JSON.stringify({ output, provider: provider.id, ...report.summary, snapshotHash: snapshot.contentHash }, null, 2));
    if (values['fail-on-findings'] && (report.summary.fail || policyResult?.results.some(r => r.status === 'fail'))) process.exitCode = 2;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
