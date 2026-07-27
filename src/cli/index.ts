import { Command } from 'commander';
import fs from 'node:fs/promises';
import pc from 'picocolors';
import { DasyuCrawler } from '../core/crawler';
import { startRepl } from './repl';
import { logger } from './logger';
import pkg from '../../package.json';

/**
 * Entry point for CLI argument parsing and command dispatch.
 */
export async function main(): Promise<void> {
  const program = new Command();

  program
    .name('dasyu')
    .description('Dasyu (दस्यु) — The Outlaw of the Web. Deep web snapshot, screenshot, and markdown extraction utility.')
    .version(pkg.version)
    .action(async () => {
      // Default action when no subcommand is provided: launch the interactive REPL!
      await startRepl();
    });

  program
    .command('clean [dirs...]')
    .aliases(['reset', 'clear-output'])
    .description('Clean and reset generated output folders (default: ./output and ./results)')
    .action(async (dirs?: string[]) => {
      const targets = (dirs && dirs.length > 0) ? dirs : ['./output', './results'];
      try {
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
      await startRepl({
        maxDepth: parseInt(opts.depth, 10) || 1,
        concurrency: parseInt(opts.concurrency, 10) || 3,
        outputDir: opts.output,
        extractContent: opts.content !== false,
        storageState: opts.storageState || opts.auth,
      });
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
    .action(async (url, opts) => {
      const depth = parseInt(opts.depth, 10) || 1;
      const concurrency = parseInt(opts.concurrency, 10) || 3;
      const storageState = opts.storageState || opts.auth;

      logger.header(`Dasyu v${pkg.version} — Unleashing on ${pc.cyan(url)} (Depth: ${depth}${storageState ? `, Auth: ${storageState}` : ''})`);

      const crawler = new DasyuCrawler({
        startUrl: url,
        maxDepth: depth,
        concurrency,
        outputDir: opts.output,
        extractContent: Boolean(opts.content),
        allowExternal: Boolean(opts.allowExternal),
        storageState,
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

        logger.success(`\nCrawl finished in ${(result.totalDurationMs / 1000).toFixed(2)}s!`);
        console.log(`  📊 Total Pages: ${pc.bold(result.pages.length.toString())}`);
        console.log(`  📁 Output Dir:  ${pc.bold(logger.tomato(opts.output))}`);
        if (result.errors.length > 0) {
          logger.warn(`  ⚠️  Errors encountered: ${result.errors.length}`);
        }
        process.exit(0);
      } catch (err: any) {
        logger.error(`Fatal error during crawl: ${err?.message || String(err)}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}
