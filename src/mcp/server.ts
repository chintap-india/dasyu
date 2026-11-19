import readline from 'node:readline';
import { DasyuCrawler } from '../core/crawler';
import { BrowserManager } from '../core/browser';
import { captureScreenshot } from '../extractors/screenshot';
import { extractPageContent } from '../extractors/content';
import { inspectStorageState, interactiveLogin } from '../core/auth';
import { createBrowsePlugin } from '../plugins/browse';
import { createSeoPlugin } from '../plugins/seo';
import pkg from '../../package.json';

/**
 * Native Model Context Protocol (MCP) Server for Dasyu.
 * Enables AI coding agents (Claude, Cursor, Codex, OpenCode, Antigravity) to
 * autonomously invoke Dasyu crawling, DOM snapshotting, and auth inspection.
 */
export async function startMcpServer(): Promise<void> {
  BrowserManager.registerExitHandlers();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('close', async () => {
    await BrowserManager.closeAll();
    if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  });

  const send = (message: any) => {
    process.stdout.write(JSON.stringify(message) + '\n');
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: any;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = req;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'dasyu-mcp',
            version: pkg.version,
          },
        },
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'dasyu_crawl',
              description:
                'Recursively crawl a web application up to N levels deep, taking full-page DOM screenshots and extracting clean Markdown content for LLM context.',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'Starting URL to crawl' },
                  depth: { type: 'number', description: 'Crawl depth (1 to 5, default 1)', default: 1 },
                  concurrency: { type: 'number', description: 'Concurrent browser pages (default 3)', default: 3 },
                  outputDir: { type: 'string', description: 'Output folder for screenshots and markdown', default: './output' },
                  extractContent: { type: 'boolean', description: 'Extract clean markdown content', default: true },
                  auth: { type: 'string', description: 'Path to Playwright storageState JSON file' },
                  detectAuth: { type: 'boolean', description: 'Monitor for auth walls & login redirects', default: true },
                  seoAudit: { type: 'boolean', description: 'Run SEO & metadata audit on crawled pages', default: false },
                  delay: { type: 'number', description: 'Delay in milliseconds between page requests' },
                  dismissModals: { type: 'boolean', description: 'Dismiss cookie banners and modals', default: true },
                  exploreModals: { type: 'boolean', description: 'Detect UI framework and explore interactive modals/dialogs', default: false },
                  maxModalsPerPage: { type: 'number', description: 'Maximum modals to explore per page (default: 5)', default: 5 },
                },
                required: ['url'],
              },
            },
            {
              name: 'dasyu_snapshot',
              description:
                'Take a one-off full-page screenshot and extract clean Markdown content from a single URL.',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'Web page URL to snapshot' },
                  outputDir: { type: 'string', description: 'Directory to save screenshots and content', default: './output' },
                  auth: { type: 'string', description: 'Optional storageState JSON file path for authenticated snapshot' },
                  extractContent: { type: 'boolean', description: 'Extract markdown content', default: true },
                },
                required: ['url'],
              },
            },
            {
              name: 'dasyu_inspect_auth',
              description:
                'Inspect cookies, domains, origins, and expiration dates in a Playwright storageState JSON file.',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'Path to storageState JSON file' },
                },
                required: ['path'],
              },
            },
          ],
        },
      });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        if (toolName === 'dasyu_crawl') {
          const plugins = [];
          if (args.detectAuth) plugins.push(createBrowsePlugin({ sessionState: args.auth }));
          if (args.seoAudit) plugins.push(createSeoPlugin());

          const crawler = new DasyuCrawler({
            startUrl: args.url,
            maxDepth: Math.min(5, Math.max(1, Number(args.depth) || 1)),
            concurrency: Number(args.concurrency) || 3,
            outputDir: args.outputDir || './output',
            extractContent: args.extractContent !== false,
            storageState: args.auth,
            delay: args.delay ? Number(args.delay) : undefined,
            dismissModals: args.dismissModals !== false,
            exploreModals: Boolean(args.exploreModals),
            maxModalsPerPage: Number(args.maxModalsPerPage) || 5,
            plugins,
          });

          const result = await crawler.run();
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      startUrl: result.startUrl,
                      durationSec: (result.totalDurationMs / 1000).toFixed(2),
                      pagesCount: result.pages.length,
                      errorsCount: result.errors.length,
                      pages: result.pages.map((p) => ({
                        url: p.url,
                        depth: p.depth,
                        status: p.status,
                        title: p.title,
                        screenshotPath: p.screenshotPath,
                        contentPath: p.contentPath,
                        metadata: p.metadata,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'dasyu_snapshot') {
          const browserManager = new BrowserManager({ headless: true, storageState: args.auth });
          try {
            const page = await browserManager.acquirePage();
            const outputDir = args.outputDir || './output';

            await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
              page.goto(args.url, { waitUntil: 'load', timeout: 30000 })
            );
            await page.waitForTimeout(1000);

            const title = await page.title();
            const screenshotPath = await captureScreenshot(page, args.url, outputDir);
            let contentResult;
            if (args.extractContent !== false) {
              contentResult = await extractPageContent(page, args.url, outputDir);
            }

            send({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        url: args.url,
                        title,
                        screenshotPath,
                        contentPath: contentResult?.contentPath,
                      },
                      null,
                      2
                    ),
                  },
                ],
              },
            });
          } finally {
            await browserManager.close();
          }
          return;
        }

        if (toolName === 'dasyu_inspect_auth') {
          const stats = await inspectStorageState(args.path);
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, path: args.path, stats }, null, 2),
                },
              ],
            },
          });
          return;
        }

        send({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool "${toolName}" not recognized.` },
        });
      } catch (err: any) {
        send({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: err?.message || String(err) },
        });
      }
      return;
    }

    if (id !== undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method "${method}" not implemented.` },
      });
    }
  });
}
