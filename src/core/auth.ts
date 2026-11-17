import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import pc from 'picocolors';
import { logger } from '../cli/logger';

export interface InteractiveLoginOptions {
  /** The login or dashboard URL to navigate to */
  url: string;
  /** File path where the captured storageState JSON should be saved. Defaults to './auth.json'. */
  outputPath?: string;
  /** Browser engine type: 'chromium' | 'firefox' | 'webkit'. Defaults to 'chromium'. */
  browserType?: 'chromium' | 'firefox' | 'webkit';
  /** Optional channel such as 'chrome' or 'msedge' */
  channel?: string;
  /** Viewport size for the interactive browser window */
  viewport?: { width: number; height: number };
  /** Force headless mode (defaults to false for interactive login) */
  headless?: boolean;
}

export interface StorageStateSummary {
  cookiesCount: number;
  originsCount: number;
  domains: string[];
  expiredCookies: number;
}

/**
 * Launches an interactive headful browser window allowing the developer
 * to manually log in, solve 2FA/SSO or CAPTCHAs, and automatically saves
 * the resulting cookies and localStorage state to a Playwright storageState file.
 */
export async function interactiveLogin(
  options: InteractiveLoginOptions
): Promise<{ storageStatePath: string; storageState: Record<string, any> }> {
  const outputPath = options.outputPath || './auth.json';
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const browserType = options.browserType || 'chromium';
  const headless = options.headless ?? false;

  const engine =
    browserType === 'firefox'
      ? firefox
      : browserType === 'webkit'
      ? webkit
      : chromium;

  let browser: Browser;
  try {
    browser = await engine.launch({
      headless,
      channel: options.channel,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err: any) {
    if (browserType === 'chromium' && !options.channel) {
      // Fallback to system Google Chrome channel if bundled chromium fails
      browser = await chromium.launch({
        headless,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } else {
      throw err;
    }
  }

  const context: BrowserContext = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DasyuAuth/0.2',
  });

  const page = await context.newPage();

  logger.info(`Opening interactive browser at: ${pc.cyan(options.url)}`);
  await page.goto(options.url).catch(() => {
    logger.warn(`Initial navigation encountered a warning or delay. Continuing interactive session...`);
  });

  let saved = false;
  let finalState: Record<string, any> = { cookies: [], origins: [] };

  const captureSession = async (): Promise<void> => {
    if (saved) return;
    try {
      finalState = await context.storageState();
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, JSON.stringify(finalState, null, 2), 'utf-8');
      saved = true;
    } catch (e: any) {
      logger.warn(`Could not extract storageState before browser closed: ${e?.message || String(e)}`);
    }
  };

  // Listen to page close event so closing the window also triggers state capture
  page.on('close', async () => {
    await captureSession();
  });

  console.log(`\n${pc.bold(logger.tomato('🔐 Interactive Login Active'))}`);
  console.log(`  1. Complete your login, SSO, or 2FA credentials in the opened browser window.`);
  console.log(`  2. When finished, press ${pc.bold(pc.green('ENTER'))} in this terminal, or simply close the browser window.\n`);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = async () => {
      if (resolved) return;
      resolved = true;
      await captureSession();
      resolve();
    };

    page.on('close', () => {
      finish();
    });

    if (process.stdin.isTTY) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('', async () => {
        rl.close();
        await finish();
      });
    } else {
      // In non-interactive environments, wait until the page is closed
      page.waitForEvent('close', { timeout: 300000 }).then(() => finish()).catch(() => finish());
    }
  });

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  return {
    storageStatePath: resolvedPath,
    storageState: finalState,
  };
}

/**
 * Imports and normalizes session cookies or storage state from external tools
 * (such as OpenCode Browse or Chrome DevTools export) into a standard Playwright storageState JSON file.
 */
export async function importBrowseSession(
  input: string | Record<string, any>,
  outputPath: string = './auth.json'
): Promise<{ storageStatePath: string; storageState: Record<string, any> }> {
  let data: any;
  if (typeof input === 'string') {
    const raw = await fs.readFile(input, 'utf-8');
    data = JSON.parse(raw);
  } else {
    data = input;
  }

  let normalized: { cookies: any[]; origins: any[] };
  if (Array.isArray(data)) {
    normalized = { cookies: data, origins: [] };
  } else if (data && typeof data === 'object' && Array.isArray(data.cookies)) {
    normalized = {
      cookies: data.cookies,
      origins: Array.isArray(data.origins) ? data.origins : [],
    };
  } else {
    throw new Error('Unrecognized session format. Expected Playwright storageState JSON or cookie array.');
  }

  const resolved = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(normalized, null, 2), 'utf-8');

  return {
    storageStatePath: resolved,
    storageState: normalized,
  };
}

/**
 * Reads an existing storageState JSON file or object and returns statistical summary details.
 */
export async function inspectStorageState(pathOrState: string | Record<string, any>): Promise<StorageStateSummary> {
  let data: any;
  if (typeof pathOrState === 'string') {
    const raw = await fs.readFile(pathOrState, 'utf-8');
    data = JSON.parse(raw);
  } else {
    data = pathOrState;
  }

  const cookies: any[] = Array.isArray(data) ? data : data?.cookies || [];
  const origins: any[] = Array.isArray(data?.origins) ? data.origins : [];

  const domains = Array.from(new Set(cookies.map((c) => c.domain).filter(Boolean)));
  const now = Date.now() / 1000;
  const expiredCookies = cookies.filter(
    (c) => typeof c.expires === 'number' && c.expires > 0 && c.expires < now
  ).length;

  return {
    cookiesCount: cookies.length,
    originsCount: origins.length,
    domains,
    expiredCookies,
  };
}
