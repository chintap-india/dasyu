import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

describe('Dasyu CLI Subcommands & Execution', () => {
  const cliBin = path.resolve(__dirname, '../bin/dasyu.js');
  const tmpDir = path.join(process.cwd(), 'test-cli-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should print help message and exit 0 for --help', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliBin, '--help']);
    expect(stdout).toContain('Dasyu (दस्यु) — The Outlaw of the Web');
    expect(stdout).toContain('crawl [options] <url>');
    expect(stdout).toContain('auth');
    expect(stdout).toContain('mcp');
  });

  it('should print auth subcommand help', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliBin, 'auth', '--help']);
    expect(stdout).toContain('login [options] <url>');
    expect(stdout).toContain('inspect <path>');
    expect(stdout).toContain('import [options] <input>');
  });

  it('should clean specified target directories with dasyu clean', async () => {
    const dirToClean = path.join(tmpDir, 'to-clean');
    await fs.mkdir(dirToClean, { recursive: true });
    await fs.writeFile(path.join(dirToClean, 'test.txt'), 'hello');

    const { stdout } = await execFileAsync(process.execPath, [cliBin, 'clean', dirToClean]);
    expect(stdout).toContain('Cleaned output director');

    const exists = await fs
      .access(dirToClean)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('should execute auth inspect on valid storageState file', async () => {
    const authPath = path.join(tmpDir, 'auth-inspect.json');
    await fs.writeFile(
      authPath,
      JSON.stringify({
        cookies: [
          { name: 'session', value: '123', domain: 'my-app.com', expires: Date.now() / 1000 + 3600 },
        ],
        origins: [],
      })
    );

    const { stdout } = await execFileAsync(process.execPath, [cliBin, 'auth', 'inspect', authPath]);
    const cleanOut = stripAnsi(stdout);
    expect(cleanOut).toContain('Auth Session Details');
    expect(cleanOut).toContain('Cookies:  1');
    expect(cleanOut).toContain('Domains:  my-app.com');
  });

  it('should execute auth import on external cookies array', async () => {
    const rawCookiesPath = path.join(tmpDir, 'raw-cookies.json');
    const outStoragePath = path.join(tmpDir, 'imported-storage.json');
    await fs.writeFile(
      rawCookiesPath,
      JSON.stringify([{ name: 'ext_cookie', value: 'val', domain: 'external.com' }])
    );

    const { stdout } = await execFileAsync(process.execPath, [
      cliBin,
      'auth',
      'import',
      rawCookiesPath,
      '-o',
      outStoragePath,
    ]);
    expect(stdout).toContain('Successfully imported session');

    const diskData = JSON.parse(await fs.readFile(outStoragePath, 'utf-8'));
    expect(diskData.cookies).toHaveLength(1);
    expect(diskData.cookies[0].name).toBe('ext_cookie');
  });

  it('should print crawl command options including --a11y, --rag, and --graph', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliBin, 'crawl', '--help']);
    expect(stdout).toContain('--a11y');
    expect(stdout).toContain('--rag');
    expect(stdout).toContain('--graph');
    expect(stdout).toContain('--delay');
    expect(stdout).toContain('--dismiss-modals');
    expect(stdout).toContain('--detect-auth');
    expect(stdout).toContain('--seo');
    expect(stdout).toContain('--open');
  });

  it('should print view command help and options', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliBin, 'view', '--help']);
    expect(stdout).toContain('view');
    expect(stdout).toContain('[dir]');
    expect(stdout).toContain('--finder');
  });
});
