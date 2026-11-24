import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

test('Cloud Build installer copies the full skill, supports repeats, and preserves customized copies', async () => {
  const application = await mkdtemp(join(tmpdir(), 'cloud-build app '));
  const install = () => spawnSync(process.execPath, ['scripts/start-cloud-build.js', '--install-only', application], { encoding: 'utf8' });
  try {
    const first = install();
    assert.equal(first.status, 0, first.stderr);
    const installed = join(application, '.github', 'skills', 'cloud-build');
    assert.match(await readFile(join(installed, 'SKILL.md'), 'utf8'), /^name: cloud-build$/m);
    assert.match(await readFile(join(installed, 'references', 'design-interview.md'), 'utf8'), /one decision at a time/);
    const repeat = install();
    assert.equal(repeat.status, 0, repeat.stderr);
    const custom = 'Keep this custom skill';
    await writeFile(join(installed, 'SKILL.md'), custom);
    const conflict = install();
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /already exists and differs/);
    assert.equal(await readFile(join(installed, 'SKILL.md'), 'utf8'), custom);
  } finally {
    await rm(application, { recursive: true, force: true });
  }
});

test('Cloud Build passes the interview prompt to the VS Code CLI from the selected workspace', async () => {
  const application = await mkdtemp(join(tmpdir(), 'cloud-build editor '));
  const cliDirectory = join(application, 'mock-cli');
  try {
    await mkdir(cliDirectory);
    if (process.platform === 'win32') {
      await writeFile(join(cliDirectory, 'code.cmd'), '@echo off\r\ncd > launcher-cwd.txt\r\necho %* > launcher-args.txt\r\n');
    } else {
      await writeFile(join(cliDirectory, 'code'), '#!/bin/sh\npwd > launcher-cwd.txt\nprintf "%s\\n" "$@" > launcher-args.txt\n', { mode: 0o755 });
    }
    const result = spawnSync(process.execPath, ['scripts/start-cloud-build.js', application], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${cliDirectory}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const actualLocation = (await readFile(join(application, 'launcher-cwd.txt'), 'utf8')).trim();
    assert.equal(await realpath(actualLocation), await realpath(application));
    const args = await readFile(join(application, 'launcher-args.txt'), 'utf8');
    assert.match(args, /chat\s+--mode\s+agent/);
    assert.match(args, /Use the cloud-build skill/);
    assert.match(args, /infra\/design\.md/);
  } finally {
    await rm(application, { recursive: true, force: true });
  }
});
