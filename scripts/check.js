import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

let checked = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'reports'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr); checked++;
    } else if (entry.name === 'SKILL.md') {
      const body = await readFile(path, 'utf8');
      if (!/^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---/.test(body)) throw new Error(`Invalid skill frontmatter: ${path}`);
    }
  }
}
await walk('.'); console.log(`Syntax checked ${checked} JavaScript files and skill frontmatter.`);
