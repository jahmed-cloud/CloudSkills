import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('CLI generates consistent report bundle and CI failure exit status', async () => {
  const output = await mkdtemp(join(tmpdir(), 'cloudskills-test-'));
  try {
    const args = ['src/cli/index.js', 'audit', '--input', 'examples/subscription.json', '--policy', 'examples/organization-controls.json', '--output', output, '--assessment', '--fail-on-findings'];
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr);
    const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8')); assert.equal(report.summary.fail, 4);
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')); assert.equal(manifest.snapshotHash, report.snapshotHash);
    assert.equal(manifest.provider, 'azure'); assert.equal(report.provider, 'azure');
    assert.equal(JSON.parse(run.stdout).provider, 'azure');
    const assessment = JSON.parse(await readFile(join(output, 'assessment.json'), 'utf8'));
    assert.equal(assessment.snapshotHash, report.snapshotHash);
    assert.equal(assessment.liveEvidenceStatus, 'offline');
    assert.equal(assessment.organizationBaseline.status, 'compared');
    assert.ok(manifest.files.includes('assessment.md'));
    assert.match(await readFile(join(output, 'assessment.md'), 'utf8'), /local snapshot/);
    assert.ok((await readFile(join(output, 'network.mmd'), 'utf8')).includes('-->'));
    const repeated = spawnSync(process.execPath, args, { encoding: 'utf8' }); assert.equal(repeated.status, 1); assert.ok(repeated.stderr.includes('EEXIST'));
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('CLI exposes provider selection and rejects future providers before writing evidence', async () => {
  const help = spawnSync(process.execPath, ['src/cli/index.js', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /--provider azure/); assert.match(help.stdout, /--account/);
  const output = await mkdtemp(join(tmpdir(), 'cloudskills-provider-test-'));
  try {
    const run = spawnSync(process.execPath, ['src/cli/index.js', 'audit', '--input', 'examples/subscription.json', '--provider', 'aws', '--output', output], { encoding: 'utf8' });
    assert.equal(run.status, 1); assert.match(run.stderr, /Unsupported provider|Snapshot provider does not match/);
    assert.deepEqual(await readdir(output), []);
    const declared = join(output, 'snapshot.json');
    await writeFile(declared, JSON.stringify({ provider: 'gcp', resources: [] }));
    const mismatch = spawnSync(process.execPath, ['src/cli/index.js', 'audit', '--input', declared, '--provider', 'azure', '--output', join(output, 'report')], { encoding: 'utf8' });
    assert.equal(mismatch.status, 1); assert.match(mismatch.stderr, /Snapshot provider does not match/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('CLI checks all artifact collisions before creating any report', async () => {
  const output = await mkdtemp(join(tmpdir(), 'cloudskills-collision-test-'));
  try {
    const terraform = join(output, 'terraform', 'keyvault');
    await mkdir(terraform, { recursive: true });
    await writeFile(join(terraform, 'main.tf.json'), 'Existing evidence');
    const run = spawnSync(process.execPath, ['src/cli/index.js', 'audit', '--input', 'examples/subscription.json', '--output', output], { encoding: 'utf8' });
    assert.equal(run.status, 1); assert.match(run.stderr, /EEXIST/);
    assert.deepEqual(await readdir(output), ['terraform']);
    assert.equal(await readFile(join(terraform, 'main.tf.json'), 'utf8'), 'Existing evidence');
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('CLI keeps the legacy subscription flag and generic account alias behind the same Azure allowlist', () => {
  for (const flag of ['--subscription', '--account']) {
    const run = spawnSync(process.execPath, ['src/cli/index.js', 'audit', flag, '00000000-0000-0000-0000-000000000001'], { encoding: 'utf8', env: { ...process.env, AZURE_SUBSCRIPTIONS: '' } });
    assert.equal(run.status, 1); assert.match(run.stderr, /AZURE_SUBSCRIPTIONS allowlist/);
  }
});
