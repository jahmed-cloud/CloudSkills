import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const source = fileURLToPath(new URL('../.agents/skills/cloud-build/', import.meta.url));
const prompt = 'Use the cloud-build skill. Read this application and its deployment files. Ask me one infrastructure decision at a time and explain your recommendation. Record the decisions in infra/design.md. Generate and validate Terraform or Azure PowerShell for review once the requirements are clear. Leave deployment for a separate request.';

function powershell(script, options = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], options);
}

function pickWorkspace() {
  if (process.platform !== 'win32') throw new Error('Supply the application folder as a command-line argument on this system.');
  return powershell(`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choose the application folder for the Cloud Build interview'
    $dialog.ShowNewFolderButton = $false
    try {
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Write($dialog.SelectedPath)
      }
    } finally { $dialog.Dispose() }
  `, { encoding: 'utf8', windowsHide: true }).trim();
}

async function sameTree(left, right) {
  const a = await readdir(left, { withFileTypes: true });
  const b = new Map((await readdir(right, { withFileTypes: true })).map(entry => [entry.name, entry]));
  if (a.length !== b.size) return false;
  for (const entry of a) {
    const other = b.get(entry.name);
    if (!other) return false;
    const from = join(left, entry.name);
    const to = join(right, entry.name);
    if (entry.isDirectory() && other.isDirectory()) {
      if (!(await sameTree(from, to))) return false;
    } else if (entry.isFile() && other.isFile()) {
      if (!(await readFile(from)).equals(await readFile(to))) return false;
    } else {
      return false;
    }
  }
  return true;
}

async function existingInstallation(destination) {
  try {
    const entry = await lstat(destination);
    if (entry.isDirectory() && await sameTree(source, destination)) return true;
    throw new Error(`Cloud Build already exists and differs from this copy. Review ${destination} before replacing it.`);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function installSkill(workspace) {
  let parent = workspace;
  for (const name of ['.github', 'skills']) {
    const directory = join(parent, name);
    await mkdir(directory, { recursive: true });
    parent = await realpath(directory);
    const fromWorkspace = relative(workspace, parent);
    if (fromWorkspace === '..' || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) {
      throw new Error(`Skill directory points outside the selected application folder: ${directory}`);
    }
  }

  const destination = join(parent, 'cloud-build');
  if (await existingInstallation(destination)) return destination;
  const staging = await mkdtemp(join(parent, '.cloud-build-install-'));
  try {
    await cp(source, join(staging, 'cloud-build'), { recursive: true, errorOnExist: true, force: false });
    try {
      await rename(join(staging, 'cloud-build'), destination);
    } catch (error) {
      if (!(await existingInstallation(destination))) throw error;
    }
    return destination;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function openCopilot(workspace) {
  const options = { cwd: workspace, stdio: ['pipe', 'inherit', 'inherit'] };
  if (process.platform === 'win32') {
    // Use the installed VS Code CLI shim, including version-specific Electron paths.
    powershell(`
      $ErrorActionPreference = 'Stop'
      $cli = Get-Command code -CommandType Application -ErrorAction Stop | Select-Object -First 1
      $prompt = [Console]::In.ReadToEnd()
      & $cli.Source chat --mode agent $prompt
      exit $LASTEXITCODE
    `, { ...options, input: prompt });
  } else {
    execFileSync('code', ['chat', '--mode', 'agent', prompt], options);
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { pick: { type: 'boolean' }, 'install-only': { type: 'boolean' } },
  });
  if (positionals.length + Number(Boolean(values.pick)) !== 1) {
    throw new Error('Usage: node scripts/start-cloud-build.js [--install-only] <application-folder>');
  }
  const selected = values.pick ? pickWorkspace() : positionals[0];
  if (selected) {
    const workspace = await realpath(resolve(selected));
    if (!(await lstat(workspace)).isDirectory()) throw new Error('Choose an application folder.');
    const destination = await installSkill(workspace);
    console.log(`Cloud Build is available at ${destination}`);
    if (!values['install-only']) {
      try { openCopilot(workspace); }
      catch { throw new Error('The skill is installed. Open the selected folder in VS Code and run /cloud-build in Copilot Chat. Check that the VS Code code command is on PATH.'); }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
