import readline from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { DasyuCrawler } from '../core/crawler';
import { BrowserManager } from '../core/browser';
import { interactiveLogin, inspectStorageState, importBrowseSession } from '../core/auth';
import { generateHtmlReport, openTarget } from '../core/report';
import type { CrawlOptions, PageData } from '../core/types';
import { logger } from './logger';
import { captureScreenshot } from '../extractors/screenshot';
import { extractPageContent } from '../extractors/content';
import pkg from '../../package.json';

/**
 * Starts the interactive Dasyu REPL shell.
 */
export async function startRepl(initialOptions: Partial<CrawlOptions> = {}): Promise<void> {
  const browserManager = new BrowserManager({ headless: true, storageState: initialOptions.storageState });
  const options: CrawlOptions = {
    startUrl: '',
    maxDepth: initialOptions.maxDepth ?? 1,
    concurrency: initialOptions.concurrency ?? 3,
    outputDir: initialOptions.outputDir ?? './output',
    extractContent: initialOptions.extractContent ?? true,
    allowExternal: initialOptions.allowExternal ?? false,
    storageState: initialOptions.storageState,
  };

  const sessionPages: PageData[] = [];

  printBanner(options);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.bold(logger.tomato('dasyu> ')),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    const [cmd, ...args] = input.split(/\s+/);
    const argStr = args.join(' ');

    try {
      switch (cmd.toLowerCase()) {
        case 'help':
        case '?':
          printHelp();
          break;

        case 'crawl':
        case 'c': {
          let url = '';
          let depthVal = options.maxDepth;
          let concVal = options.concurrency;
          let outDirVal = options.outputDir!;
          let contentVal = options.extractContent;
          let extVal = options.allowExternal;
          let debugVal = options.debug;
          let storageVal = options.storageState;

          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '-d' || arg === '--depth') {
              const next = parseInt(args[++i], 10);
              if (!isNaN(next)) depthVal = next;
            } else if (arg === '-c' || arg === '--concurrency') {
              const next = parseInt(args[++i], 10);
              if (!isNaN(next)) concVal = next;
            } else if (arg === '-o' || arg === '--output') {
              outDirVal = args[++i] || outDirVal;
            } else if (arg === '-s' || arg === '--storage-state' || arg === '--auth') {
              storageVal = args[++i] || storageVal;
            } else if (arg === '--content') {
              contentVal = true;
            } else if (arg === '--no-content') {
              contentVal = false;
            } else if (arg === '--allow-external') {
              extVal = true;
            } else if (arg === '--debug') {
              debugVal = true;
            } else if (!arg.startsWith('-') && !url) {
              url = arg;
            } else if (!arg.startsWith('-') && url && !isNaN(parseInt(arg, 10)) && i === 1) {
              depthVal = parseInt(arg, 10);
            }
          }

          if (!url) {
            logger.error('Please specify a URL to crawl: crawl <https://example.com> [depth|--depth N]');
            break;
          }

          if (storageVal !== options.storageState) {
            await browserManager.setStorageState(storageVal);
          }

          const crawlOpts: CrawlOptions = {
            ...options,
            startUrl: url,
            maxDepth: depthVal,
            concurrency: concVal,
            outputDir: outDirVal,
            extractContent: contentVal,
            allowExternal: extVal,
            debug: debugVal,
            storageState: storageVal,
          };

          logger.info(`Unleashing Dasyu on ${pc.cyan(url)} (depth: ${crawlOpts.maxDepth}, concurrency: ${crawlOpts.concurrency}${storageVal ? `, auth: ${storageVal}` : ''})...`);
          const crawler = new DasyuCrawler(crawlOpts, browserManager);
          
          const result = await crawler.run((page, completed, queueSize) => {
            if (page.error) {
              console.log(`  [${completed}] ${pc.red('ERROR')} ${page.url} — ${pc.red(page.error)}`);
            } else {
              const statusColor = page.status === 200 ? pc.green : pc.yellow;
              console.log(`  [${completed}] ${statusColor(page.status.toString())} ${page.url} (depth ${page.depth})`);
            }
          });

          sessionPages.push(...result.pages);
          const reportPath = await generateHtmlReport(result, { outputDir: crawlOpts.outputDir! });
          const resolvedReport = path.resolve(process.cwd(), reportPath);

          logger.success(`Crawl finished in ${(result.totalDurationMs / 1000).toFixed(2)}s! Captured ${result.pages.length} pages.`);
          console.log(`  📁 Output Dir:    ${pc.bold(logger.tomato(crawlOpts.outputDir!))}`);
          console.log(`  🌐 Visual Report: ${pc.bold(pc.cyan(`file://${resolvedReport}`))}`);
          console.log(`  💡 Run "${pc.green('view')}" or "${pc.green('open')}" to inspect screenshots in your browser.\n`);
          break;
        }

        case 'goto':
        case 'g':
        case 'snap': {
          if (!args[0]) {
            logger.error('Please specify a URL: goto <https://example.com>');
            break;
          }
          const url = args[0];
          logger.info(`Snapping ${pc.cyan(url)}...`);
          const page = await browserManager.acquirePage();
          try {
            const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
              return page.goto(url, { waitUntil: 'load', timeout: 30000 });
            });
            await page.waitForTimeout(1000);
            const status = res?.status() || 200;
            const title = (await page.title()) || url;
            const screenshotPath = await captureScreenshot(page, url, options.outputDir!);
            let contentPath: string | undefined;
            if (options.extractContent) {
              const resContent = await extractPageContent(page, url, options.outputDir!);
              contentPath = resContent.contentPath;
            }
            const pageData: PageData = {
              url,
              depth: 0,
              title,
              status,
              screenshotPath,
              contentPath,
              links: [],
            };
            sessionPages.push(pageData);
            logger.success(`Captured snapshot for ${pc.cyan(title)} (${status})`);
            console.log(`  📸 Screenshot: ${pc.bold(logger.tomato(screenshotPath))}`);
            if (contentPath) console.log(`  📝 Markdown:   ${pc.bold(logger.tomato(contentPath))}`);
          } finally {
            await browserManager.releasePage(page);
          }
          break;
        }

        case 'pages':
        case 'ls':
        case 'list': {
          if (sessionPages.length === 0) {
            logger.info('No pages captured yet in this session. Run "crawl <url>" or "goto <url>".');
          } else {
            logger.header(`Captured Pages (${sessionPages.length})`);
            sessionPages.forEach((p, idx) => {
              const statusStr = p.status === 200 ? pc.green('200') : pc.red(p.status.toString());
              console.log(`[${idx + 1}] ${statusStr} ${pc.bold(p.title || 'Untitled')} — ${pc.dim(p.url)}`);
              if (p.screenshotPath) console.log(`    📸 ${pc.dim(p.screenshotPath)}`);
              if (p.contentPath) console.log(`    📝 ${pc.dim(p.contentPath)}`);
            });
          }
          break;
        }

        case 'inspect':
        case 'i': {
          const idx = parseInt(args[0], 10) - 1;
          if (isNaN(idx) || !sessionPages[idx]) {
            logger.error(`Invalid page index. Use "pages" to list available indexes (1-${sessionPages.length}).`);
          } else {
            const p = sessionPages[idx];
            logger.header(`Inspecting Page #${idx + 1}`);
            console.log(JSON.stringify(p, null, 2));
          }
          break;
        }

        case 'config':
        case 'cfg': {
          if (!args[0]) {
            printConfig(options);
          } else {
            const key = args[0].toLowerCase();
            const val = args[1];
            if (val === undefined) {
              logger.error('Please specify a value: config <key> <value>');
            } else if (key === 'depth' || key === 'maxdepth') {
              options.maxDepth = parseInt(val, 10) || 1;
              logger.success(`maxDepth set to ${options.maxDepth}`);
            } else if (key === 'concurrency') {
              options.concurrency = parseInt(val, 10) || 3;
              logger.success(`concurrency set to ${options.concurrency}`);
            } else if (key === 'output' || key === 'outputdir') {
              options.outputDir = val;
              logger.success(`outputDir set to "${options.outputDir}"`);
            } else if (key === 'content' || key === 'extractcontent') {
              options.extractContent = val === 'true' || val === '1';
              logger.success(`extractContent set to ${options.extractContent}`);
            } else if (key === 'allowexternal' || key === 'allow-external') {
              options.allowExternal = val === 'true' || val === '1';
              logger.success(`allowExternal set to ${options.allowExternal}`);
            } else if (key === 'auth' || key === 'storage-state' || key === 'storagestate') {
              options.storageState = val === 'none' || val === 'null' ? undefined : val;
              await browserManager.setStorageState(options.storageState);
              logger.success(`storageState (auth) set to ${options.storageState || 'none'}`);
            } else {
              logger.error(`Unknown config key "${key}". Valid keys: depth, concurrency, output, content, allow-external, auth`);
            }
          }
          break;
        }

        case 'auth':
        case 'storage-state': {
          const sub = args[0]?.toLowerCase();
          const p = args[1] || args[0];
          if (sub === 'login') {
            const url = args[1];
            const targetPath = args[2] || './auth.json';
            if (!url) {
              logger.error('Please specify a URL to log in: auth login <url> [output.json]');
            } else {
              try {
                logger.info(`Launching interactive browser for ${pc.cyan(url)}...`);
                const result = await interactiveLogin({ url, outputPath: targetPath });
                options.storageState = result.storageStatePath;
                await browserManager.setStorageState(result.storageStatePath);
                logger.success(`✔ Logged in and saved session to ${pc.cyan(result.storageStatePath)}!`);
                logger.info(`Session is now active for subsequent crawls in this REPL.`);
              } catch (err: any) {
                logger.error(`Interactive login failed: ${err?.message || String(err)}`);
              }
            }
          } else if (sub === 'inspect' || sub === 'check') {
            const targetPath = args[1] || (typeof options.storageState === 'string' ? options.storageState : './auth.json');
            try {
              const stats = await inspectStorageState(targetPath);
              logger.header(`Auth Session Details: ${targetPath}`);
              console.log(`  🍪 Cookies:  ${pc.bold(stats.cookiesCount.toString())}`);
              console.log(`  🌐 Domains:  ${stats.domains.join(', ') || 'none'}`);
              console.log(`  🔑 Origins:  ${pc.bold(stats.originsCount.toString())}`);
              if (stats.expiredCookies > 0) {
                logger.warn(`  ⚠️  Expired cookies: ${stats.expiredCookies}`);
              }
            } catch (err: any) {
              logger.error(`Could not inspect ${targetPath}: ${err?.message || String(err)}`);
            }
          } else if (sub === 'import') {
            const inputPath = args[1];
            const targetPath = args[2] || './auth.json';
            if (!inputPath) {
              logger.error('Please specify a session file to import: auth import <input.json> [output.json]');
            } else {
              try {
                const result = await importBrowseSession(inputPath, targetPath);
                options.storageState = result.storageStatePath;
                await browserManager.setStorageState(result.storageStatePath);
                logger.success(`✔ Imported session from "${inputPath}" to ${pc.cyan(result.storageStatePath)}`);
              } catch (err: any) {
                logger.error(`Failed to import session: ${err?.message || String(err)}`);
              }
            }
          } else if (sub === 'save') {
            const targetPath = args[1] || './auth.json';
            await browserManager.saveStorageState(targetPath);
            logger.success(`Saved browser authentication state (cookies, localStorage) to ${targetPath}`);
          } else if (sub === 'load' || sub === 'set' || (p && sub !== 'clear' && sub !== 'none')) {
            const targetPath = sub === 'load' || sub === 'set' ? args[1] : p;
            options.storageState = targetPath;
            await browserManager.setStorageState(targetPath);
            logger.success(`Loaded authentication storageState from "${targetPath}" for subsequent crawls`);
          } else if (sub === 'clear' || sub === 'none') {
            options.storageState = undefined;
            await browserManager.setStorageState(undefined);
            logger.success('Cleared authentication storageState');
          } else {
            logger.info(`Current auth storageState: ${options.storageState || pc.dim('none')}`);
            logger.info('Usage: auth <login|inspect|import|load|save|clear>');
            console.log(`  auth login <url> [file]    Launch browser to log in (SSO/2FA) and save session`);
            console.log(`  auth inspect [file]        Inspect cookies and domains in storageState JSON`);
            console.log(`  auth import <input> [file] Import OpenCode Browse / external cookies`);
            console.log(`  auth load <file>           Load existing storageState JSON`);
            console.log(`  auth save [file]           Save current cookies/localStorage to file`);
            console.log(`  auth clear                 Clear authentication session`);
          }
          break;
        }

        case 'clean':
        case 'reset': {
          const targets = args.length > 0 ? args : [options.outputDir || './output', './results'];
          try {
            for (const target of targets) {
              await fs.rm(target, { recursive: true, force: true });
            }
            sessionPages.length = 0;
            logger.success(`✔ Cleaned output director${targets.length > 1 ? 'ies' : 'y'} (${targets.map(t => pc.cyan(t)).join(', ')}) and reset session pages.`);
          } catch (err: any) {
            logger.error(`Failed to clean output directory: ${err?.message || String(err)}`);
          }
          break;
        }

        case 'view':
        case 'open': {
          const targetDir = path.resolve(process.cwd(), args[0] || options.outputDir || './output');
          const reportFile = path.join(targetDir, 'report.html');
          let targetToOpen = reportFile;
          try {
            await fs.access(reportFile);
          } catch {
            targetToOpen = targetDir;
          }
          logger.info(`Opening ${pc.cyan(targetToOpen)} in browser...`);
          await openTarget(targetToOpen);
          break;
        }

        case 'clear':
        case 'cls':
          console.clear();
          printBanner(options);
          break;

        case 'exit':
        case 'quit':
        case 'q':
          logger.info('Shutting down Dasyu browser session and exiting REPL...');
          await browserManager.close();
          await BrowserManager.closeAll();
          rl.close();
          process.exit(0);
          break;

        default:
          logger.error(`Unknown command: "${cmd}". Type "help" for a list of commands.`);
          break;
      }
    } catch (err: any) {
      logger.error(`Error: ${err?.message || String(err)}`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    await browserManager.close();
    await BrowserManager.closeAll();
    process.exit(0);
  });
}

function printHelp(): void {
  logger.header('Dasyu REPL Commands');
  console.log(`  ${pc.cyan('crawl <url> [args]')}     Crawl website up to depth N`);
  console.log(`    ${pc.dim('Flags: -d/--depth <N>, -c/--concurrency <N>, -o/--output <dir>, -s/--auth <path>, --content, --allow-external')}`);
  console.log(`  ${pc.cyan('goto <url>')}             Snap a single page screenshot and extract content`);
  console.log(`  ${pc.cyan('pages')}                  List all pages captured in this session`);
  console.log(`  ${pc.cyan('inspect <num>')}          Show full metadata & paths for page #num`);
  console.log(`  ${pc.cyan('auth <cmd> [args]')}      Authentication & session management:`);
  console.log(`    ${pc.dim('auth login <url> [file]  — Open browser to log in (SSO/2FA) and save session')}`);
  console.log(`    ${pc.dim('auth inspect [file]      — Inspect cookies and domains in storageState')}`);
  console.log(`    ${pc.dim('auth import <in> [file]  — Import OpenCode Browse / external cookies')}`);
  console.log(`    ${pc.dim('auth load <file>         — Load existing storageState JSON file')}`);
  console.log(`    ${pc.dim('auth save [file]         — Save current session cookies to file')}`);
  console.log(`    ${pc.dim('auth clear               — Clear active authentication session')}`);
  console.log(`  ${pc.cyan('config [key] [val]')}     View or change settings (depth, concurrency, output, content, auth)`);
  console.log(`  ${pc.cyan('clean [dir]')}            Clean/reset output directory & clear session pages (${pc.dim('alias: reset')})`);
  console.log(`  ${pc.cyan('view [dir]')}             Open visual HTML report or screenshots in browser (${pc.dim('alias: open')})`);
  console.log(`  ${pc.cyan('clear')}                  Clear terminal screen`);
  console.log(`  ${pc.cyan('exit')}                   Close browser and exit REPL\n`);
}

function printConfig(opts: CrawlOptions): void {
  console.log(pc.dim('Current Session Configuration:'));
  console.log(`  ${pc.bold('depth')}:          ${opts.maxDepth} (max: 5)`);
  console.log(`  ${pc.bold('concurrency')}:    ${opts.concurrency} pages`);
  console.log(`  ${pc.bold('output')}:         ${opts.outputDir}`);
  console.log(`  ${pc.bold('content')}:        ${opts.extractContent ? pc.green('enabled') : pc.yellow('disabled')}`);
  console.log(`  ${pc.bold('allow-external')}: ${opts.allowExternal ? pc.green('enabled') : pc.yellow('disabled')}`);
  console.log(`  ${pc.bold('auth (storage)')}: ${opts.storageState ? pc.cyan(String(opts.storageState)) : pc.dim('none')}\n`);
}

function printBanner(opts: CrawlOptions): void {
  const v = pkg.version;
  console.log('');
  console.log(`  ${pc.bold(logger.tomato(`⚔  DASYU (दस्यु) v${v}`))}  ${pc.dim('— The Outlaw of the Web')}`);
  console.log(`  ${pc.dim('🌐 Web: ')}${pc.cyan('https://chintap.com/dasyu')}  ${pc.dim('• GitHub: ')}${pc.cyan('https://github.com/chintap-india/dasyu')}`);
  console.log(`  ${pc.dim('Type')} ${pc.cyan('help')} ${pc.dim('to see available commands or')} ${pc.cyan('exit')} ${pc.dim('to leave.')}\n`);
  printConfig(opts);
}
