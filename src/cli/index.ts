import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { DasyuCrawler } from '../core/crawler';
import { BrowserManager } from '../core/browser';
import { interactiveLogin, inspectStorageState, importBrowseSession } from '../core/auth';
import { createBrowsePlugin } from '../plugins/browse';
import { createSeoPlugin } from '../plugins/seo';
import { createAccessibilityPlugin } from '../plugins/accessibility';
import { exportRagChunks } from '../core/rag';
import { exportSiteGraph } from '../core/graph';
import { generateHtmlReport, openTarget } from '../core/report';
import { startMcpServer } from '../mcp/server';
import { startRepl } from './repl';
import { logger } from './logger';
import pkg from '../../package.json';

/**
 * Entry point for CLI argument parsing and command dispatch.
 */
export async function main(): Promise<void> {
  BrowserManager.registerExitHandlers();

  const program = new Command();

  program
    .name('dasyu')
    .description('Dasyu (दस्यु) — The Outlaw of the Web. Deep web snapshot, screenshot, and markdown extraction utility.')
    .version(pkg.version)
    .action(async () => {
      // Default action when no subcommand is provided: launch the interactive REPL!
      try {
        await startRepl();
      } finally {
        await BrowserManager.closeAll().catch(() => {});
      }
    });

  program
    .command('clean [dirs...]')
    .aliases(['reset', 'clear-output'])
    .description('Clean and reset generated output folders (default: ./output and ./results)')
    .action(async (dirs?: string[]) => {
      const targets = (dirs && dirs.length > 0) ? dirs : ['./output', './results'];
      try {
        await BrowserManager.closeAll().catch(() => {});
        for (const target of targets) {
          await fs.rm(target, { recursive: true, force: true });
        }
        logger.success(`✔ Cleaned output director${targets.length > 1 ? 'ies' : 'y'}: ${targets.map(t => pc.cyan(t)).join(', ')}`);
        process.exit(0);
      } catch (err: any) {
        logger.error(`Failed to clean output directory: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  program
    .command('repl')
    .description('Start the interactive Dasyu REPL shell')
    .option('-d, --depth <number>', 'Default crawl depth', '1')
    .option('-c, --concurrency <number>', 'Max concurrent pages', '3')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-s, --storage-state <path>', 'Playwright storageState JSON path for authentication')
    .option('--auth <path>', 'Alias for --storage-state')
    .option('--no-content', 'Disable markdown content extraction')
    .action(async (opts) => {
      try {
        await startRepl({
          maxDepth: parseInt(opts.depth, 10) || 1,
          concurrency: parseInt(opts.concurrency, 10) || 3,
          outputDir: opts.output,
          extractContent: opts.content !== false,
          storageState: opts.storageState || opts.auth,
        });
      } finally {
        await BrowserManager.closeAll().catch(() => {});
      }
    });

  const authCmd = program
    .command('auth')
    .description('Interactive authentication and storageState session management');

  authCmd
    .command('login <url>')
    .description('Launch an interactive browser to log in, complete SSO/2FA, and save storageState')
    .option('-o, --output <path>', 'Destination file path for storageState JSON', './auth.json')
    .option('--channel <channel>', 'Browser channel (e.g. chrome, msedge)')
    .action(async (url, opts) => {
      try {
        const result = await interactiveLogin({
          url,
          outputPath: opts.output,
          channel: opts.channel,
        });
        logger.success(`\n✔ Saved authentication storageState to: ${pc.cyan(result.storageStatePath)}`);
        logger.info(`Now crawl using: ${pc.bold(`dasyu crawl ${url} --auth ${opts.output}`)}\n`);
        process.exit(0);
      } catch (err: any) {
        await BrowserManager.closeAll().catch(() => {});
        logger.error(`Interactive login failed: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  authCmd
    .command('inspect <path>')
    .description('Inspect cookies, origins, and domains in an existing storageState JSON file')
    .action(async (pathStr) => {
      try {
        const stats = await inspectStorageState(pathStr);
        logger.header(`Auth Session Details: ${pathStr}`);
        console.log(`  🍪 Cookies:  ${pc.bold(stats.cookiesCount.toString())}`);
        console.log(`  🌐 Domains:  ${stats.domains.join(', ') || 'none'}`);
        console.log(`  🔑 Origins:  ${pc.bold(stats.originsCount.toString())}`);
        if (stats.expiredCookies > 0) {
          logger.warn(`  ⚠️  Expired cookies: ${stats.expiredCookies}`);
        }
        process.exit(0);
      } catch (err: any) {
        logger.error(`Failed to inspect storageState: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  authCmd
    .command('import <input>')
    .description('Import OpenCode Browse / external browser cookies or session JSON')
    .option('-o, --output <path>', 'Output destination for normalized storageState JSON', './auth.json')
    .action(async (inputPath, opts) => {
      try {
        const result = await importBrowseSession(inputPath, opts.output);
        logger.success(`✔ Successfully imported session to ${pc.cyan(result.storageStatePath)}`);
        process.exit(0);
      } catch (err: any) {
        logger.error(`Failed to import session: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  program
    .command('crawl <url>')
    .description('Crawl a URL up to N levels deep, taking snapshots and extracting content')
    .option('-d, --depth <number>', 'Crawl depth (1-5)', '1')
    .option('-c, --concurrency <number>', 'Max concurrent pages', '3')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-s, --storage-state <path>', 'Playwright storageState JSON path for authentication')
    .option('--auth <path>', 'Alias for --storage-state')
    .option('--content', 'Extract markdown content and JSON metadata', false)
    .option('--allow-external', 'Allow crawling external domains', false)
    .option('--detect-auth', 'Enable Anomalyco Browse plugin to monitor and alert on auth walls', false)
    .option('--seo', 'Enable SEO and metadata quality audit plugin', false)
    .option('--a11y', 'Enable Axe-core WCAG 2.1 accessibility compliance audit plugin', false)
    .option('--rag', 'Export extracted markdown to chunked JSONL for vector databases (Chroma, LanceDB)', false)
    .option('--graph', 'Generate site link graph and Mermaid architecture diagram', false)
    .option('--delay <ms>', 'Delay in milliseconds between page navigations (rate limiting)')
    .option('--dismiss-modals', 'Automatically detect and dismiss cookie consent dialogs and modals', false)
    .option('-O, --open', 'Automatically open visual HTML report in your default browser upon completion', false)
    .action(async (url, opts) => {
      const depth = parseInt(opts.depth, 10) || 1;
      const concurrency = parseInt(opts.concurrency, 10) || 3;
      const storageState = opts.storageState || opts.auth;
      const delay = opts.delay ? parseInt(opts.delay, 10) : undefined;
      const outDir = opts.output || './output';

      logger.header(`Dasyu v${pkg.version} — Unleashing on ${pc.cyan(url)} (Depth: ${depth}${storageState ? `, Auth: ${storageState}` : ''})`);

      const plugins = [];
      if (opts.detectAuth) {
        plugins.push(createBrowsePlugin({ sessionState: storageState }));
      }
      if (opts.seo) {
        plugins.push(createSeoPlugin());
      }
      if (opts.a11y) {
        plugins.push(createAccessibilityPlugin());
      }

      const crawler = new DasyuCrawler({
        startUrl: url,
        maxDepth: depth,
        concurrency,
        outputDir: outDir,
        extractContent: Boolean(opts.content),
        allowExternal: Boolean(opts.allowExternal),
        storageState,
        delay,
        dismissModals: Boolean(opts.dismissModals),
        plugins,
      });

      try {
        const result = await crawler.run((page, completed) => {
          if (page.error) {
            console.log(`  [${completed}] ${pc.red('ERROR')} ${page.url} — ${pc.red(page.error)}`);
          } else {
            const statusStr = page.status === 200 ? pc.green('200') : pc.yellow(page.status.toString());
            console.log(`  [${completed}] ${statusStr} ${page.url} (depth ${page.depth})`);
          }
        });

        // Handle optional RAG chunk export
        let ragChunksCount: number | undefined;
        if (opts.rag && opts.content) {
          const ragResult = await exportRagChunks(result.pages, {
            outputPath: `${outDir}/rag-chunks.jsonl`,
          });
          ragChunksCount = ragResult.chunksCount;
          logger.info(`  🧠 RAG Export:  ${pc.bold(ragResult.chunksCount.toString())} chunks saved to ${pc.cyan(ragResult.outputPath)}`);
        }

        // Handle optional Link Graph export
        let graphPaths: { graphJsonPath: string; mermaidPath: string } | undefined;
        if (opts.graph) {
          graphPaths = await exportSiteGraph(result.pages, outDir);
          logger.info(`  🌐 Site Graph:  Saved ${pc.cyan(graphPaths.graphJsonPath)} & ${pc.cyan(graphPaths.mermaidPath)}`);
        }

        // Generate the standalone, interactive visual HTML dashboard
        const reportPath = await generateHtmlReport(result, {
          outputDir: outDir,
          ragChunksCount,
          siteGraphMermaidPath: graphPaths?.mermaidPath,
        });

        const resolvedOutDir = path.resolve(process.cwd(), outDir);
        const resolvedReportPath = path.resolve(process.cwd(), reportPath);
        const fileUrl = `file://${resolvedReportPath}`;

        logger.success(`\nCrawl finished in ${(result.totalDurationMs / 1000).toFixed(2)}s!`);
        console.log(`  📊 Total Pages:   ${pc.bold(result.pages.length.toString())}`);
        console.log(`  📁 Output Dir:    ${pc.bold(logger.tomato(outDir))} (${resolvedOutDir})`);
        console.log(`  🌐 Visual Report: ${pc.bold(pc.cyan(fileUrl))}`);

        // UX Next Steps Guide
        console.log(`\n${pc.bold(logger.tomato('🧭 Next Steps & Quick Navigation:'))}`);
        console.log(`  • View visual report:   ${pc.green(`dasyu view ${outDir}`)}  ${pc.gray(`(or CMD+Click the file:// link above)`)}`);
        console.log(`  • Reveal in Finder:     ${pc.cyan(`open "${resolvedOutDir}"`)}`);
        console.log(`  • Terminal inspection:  ${pc.yellow(`cd "${outDir}" && ls -lh`)}\n`);

        if (opts.open) {
          logger.info(`🚀 Opening visual report in default browser...`);
          await openTarget(resolvedReportPath);
        }

        if (result.errors.length > 0) {
          logger.warn(`  ⚠️  Errors encountered: ${result.errors.length}`);
        }
        process.exit(0);
      } catch (err: any) {
        await BrowserManager.closeAll().catch(() => {});
        logger.error(`Fatal error during crawl: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  program
    .command('view [dir]')
    .aliases(['open', 'show'])
    .description('Open the visual HTML crawl report or screenshots folder in your default browser or Finder')
    .option('-f, --finder', 'Reveal output folder in Finder / file explorer instead of opening browser', false)
    .action(async (dirStr = './output', opts) => {
      const targetDir = path.resolve(process.cwd(), dirStr);
      const reportFile = path.join(targetDir, 'report.html');

      let targetToOpen = reportFile;
      try {
        await fs.access(reportFile);
      } catch {
        targetToOpen = targetDir;
      }

      if (opts.finder) {
        logger.info(`📂 Revealing folder in file explorer: ${pc.cyan(targetDir)}`);
        await openTarget(targetDir);
      } else {
        logger.info(`🌐 Opening in browser: ${pc.cyan(targetToOpen)}`);
        await openTarget(targetToOpen);
      }
    });

  program
    .command('mcp')
    .description('Start the Dasyu Model Context Protocol (MCP) server over stdio for AI coding agents')
    .action(async () => {
      await startMcpServer();
    });

  await program.parseAsync(process.argv);
}
