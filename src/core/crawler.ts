import type { Page } from 'playwright';
import type { CrawlOptions, CrawlResult, LinkMetadata, PageContext, PageData } from './types';
import type { DasyuPlugin } from '../plugins/base';
import { BrowserManager } from './browser';
import { captureScreenshot, dismissCookieBanners } from '../extractors/screenshot';
import { extractPageContent } from '../extractors/content';
import { ModalExplorerPlugin } from '../plugins/modal';
import { loadPlugins } from '../plugins/loader';
import { logger } from '../cli/logger';

/**
 * Main engine for Dasyu web crawling, snapshotting, and content extraction.
 */
export class DasyuCrawler {
  private options: CrawlOptions;
  private browserManager: BrowserManager;
  private persistentBrowser: boolean;
  private plugins: DasyuPlugin[];
  private isAborted = false;

  constructor(options: CrawlOptions, browserManager?: BrowserManager) {
    this.options = {
      ...options,
      maxDepth: options.maxDepth !== undefined ? Math.min(Math.max(1, options.maxDepth), 5) : 1,
      concurrency: options.concurrency || 3,
      outputDir: options.outputDir || './output',
    };
    this.plugins = [...(options.plugins || [])];
    if (this.options.exploreModals) {
      const hasModal = this.plugins.some((p) => p.name === 'modal-explorer');
      if (!hasModal) {
        this.plugins.push(new ModalExplorerPlugin({ maxModalsPerPage: this.options.maxModalsPerPage }));
      }
    }
    if (browserManager) {
      this.browserManager = browserManager;
      this.persistentBrowser = true;
    } else {
      this.browserManager = new BrowserManager({ storageState: options.storageState });
      this.persistentBrowser = false;
    }
  }

  /**
   * Signals the crawler to abort in-flight workers and stop processing further URLs.
   */
  public abort(): void {
    this.isAborted = true;
  }

  /**
   * Aborts active crawl operations and closes browser resources.
   */
  public async close(): Promise<void> {
    this.abort();
    if (!this.persistentBrowser) {
      await this.browserManager.close();
    }
  }

  /**
   * Safely invokes a plugin lifecycle hook, capturing errors to prevent
   * a single faulty plugin from crashing the crawler queue.
   */
  private async safeInvokeHook<T>(
    plugin: DasyuPlugin,
    hookName: string,
    fn: () => Promise<T> | T
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err: any) {
      logger.warn(`[Plugin:${plugin.name}] Error in ${hookName}: ${err?.message || String(err)}`);
      return undefined;
    }
  }

  /**
   * Normalizes a URL string by removing hash fragments and trailing slashes.
   */
  public normalizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      // Only remove fragment identifiers if they are standard in-page anchors (not SPA hash routes like #/services)
      if (!parsed.hash.startsWith('#/') && !parsed.hash.startsWith('#!/')) {
        parsed.hash = '';
      }
      let result = parsed.toString();
      if (result.endsWith('/') && (parsed.pathname !== '/' || parsed.hash.length > 0)) {
        result = result.slice(0, -1);
      }
      return result;
    } catch {
      return urlStr;
    }
  }

  /**
   * Checks if two URLs share the same origin (protocol + host + port).
   */
  public isSameOrigin(url1: string, url2: string): boolean {
    try {
      return new URL(url1).origin === new URL(url2).origin;
    } catch {
      return false;
    }
  }

  /**
   * Executes the BFS crawl queue across configured depth levels.
   */
  public async run(
    onProgress?: (pageData: PageData, completed: number, queueSize: number) => void
  ): Promise<CrawlResult> {
    if (this.isAborted) {
      return {
        startUrl: this.options.startUrl,
        totalDurationMs: 0,
        pages: [],
        errors: [],
      };
    }

    const startTime = Date.now();
    const startUrlNorm = this.normalizeUrl(this.options.startUrl);
    const queue: { url: string; depth: number; parentUrl?: string }[] = [{ url: startUrlNorm, depth: 0 }];
    const visited = new Set<string>();
    const pages: PageData[] = [];
    const errors: { url: string; depth: number; error: string }[] = [];

    try {
      // Load external user plugins if specified
      if (this.options.pluginPaths && this.options.pluginPaths.length > 0) {
        const externalPlugins = await loadPlugins(this.options.pluginPaths);
        this.plugins.push(...externalPlugins);
      }

      // Notify plugins onStart with CrawlOptions
      for (const plugin of this.plugins) {
        await plugin.onStart?.(this.options);
      }

      const concurrency = this.options.concurrency!;
      const maxDepth = this.options.maxDepth!;
      let activeWorkers = 0;

      const runWorker = async () => {
        while (!this.isAborted) {
          let item: { url: string; depth: number; parentUrl?: string } | undefined;
          while (queue.length > 0 && !this.isAborted) {
            const candidate = queue.shift()!;
            if (!visited.has(candidate.url)) {
              visited.add(candidate.url);
              item = candidate;
              break;
            }
          }

          if (this.isAborted) break;

          if (!item) {
            if (activeWorkers === 0) {
              break; // All workers idle and queue is empty, crawl is complete
            } else {
              // Other workers are still processing and may discover new links
              await new Promise((r) => setTimeout(r, 50));
              continue;
            }
          }

          activeWorkers++;
          try {
            const pageData = await this.processUrl(item.url, item.depth, maxDepth, queue, visited, item.parentUrl);
            pages.push(pageData);
            onProgress?.(pageData, pages.length + errors.length, queue.length);
          } catch (err: any) {
            const errorMsg = err?.message || String(err);
            errors.push({ url: item.url, depth: item.depth, error: errorMsg });
            const failedPage: PageData = {
              url: item.url,
              depth: item.depth,
              parentUrl: item.parentUrl,
              title: 'Error',
              status: 0,
              links: [],
              linkDetails: [],
              error: errorMsg,
            };
            pages.push(failedPage);
            onProgress?.(failedPage, pages.length + errors.length, queue.length);
          } finally {
            activeWorkers--;
          }
        }
      };

      const workers: Promise<void>[] = [];
      for (let i = 0; i < concurrency; i++) {
        workers.push(runWorker());
      }

      await Promise.all(workers);

      const result: CrawlResult = {
        startUrl: this.options.startUrl,
        totalDurationMs: Date.now() - startTime,
        pages,
        errors,
      };

      // Notify plugins onComplete with CrawlResult and CrawlOptions
      for (const plugin of this.plugins) {
        await this.safeInvokeHook(plugin, 'onComplete', () => plugin.onComplete?.(result, this.options));
      }

      return result;
    } finally {
      this.isAborted = false;
      // Shut down browser if we created it internally (not injected by REPL/tests)
      // Guaranteeing cleanup even when an unhandled error or abort occurs
      if (!this.persistentBrowser) {
        await this.browserManager.close();
      }
    }
  }

  /**
   * Processes a single page: navigates, snapshots, extracts content, and discovers links.
   */
  private async processUrl(
    url: string,
    depth: number,
    maxDepth: number,
    queue: { url: string; depth: number; parentUrl?: string }[],
    visited: Set<string>,
    parentUrl?: string
  ): Promise<PageData> {
    const page = await this.browserManager.acquirePage();
    const outputDir = this.options.outputDir!;
    const pageData: PageData = {
      url,
      depth,
      parentUrl,
      title: '',
      status: 0,
      links: [],
      linkDetails: [],
      metadata: {},
    };

    const ctx: PageContext = {
      page,
      url,
      depth,
      options: this.options,
      data: pageData,
    };

    try {
      if (this.options.delay && this.options.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.options.delay));
      }

      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
        return page.goto(url, { waitUntil: 'load', timeout: 30000 });
      });
      await page.waitForTimeout(1000);

      if (this.options.dismissModals) {
        await dismissCookieBanners(page);
      }

      pageData.status = response?.status() || 200;
      pageData.title = (await page.title()) || url;

      // 1. Invoke onPageLoad plugins
      for (const plugin of this.plugins) {
        await this.safeInvokeHook(plugin, 'onPageLoad', () => plugin.onPageLoad?.(ctx));
      }

      // 2. Extract outbound links if within depth limits
      if (depth < maxDepth) {
        const rawAnchorElements = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]')).map((a) => {
            const anchor = a as HTMLAnchorElement;
            return {
              href: anchor.href,
              rawHref: anchor.getAttribute('href') || '',
              text: (anchor.textContent || '').trim().replace(/\s+/g, ' '),
              target: anchor.getAttribute('target') || undefined,
              rel: anchor.getAttribute('rel') || undefined,
            };
          });
        });

        const normalizedLinks = new Set<string>();
        const linkDetails: LinkMetadata[] = [];

        // Pre-populate with links discovered by plugins (e.g. ModalExplorerPlugin)
        const initialLinks = [
          ...(pageData.links || []).map((l) => ({ href: l, rawHref: l, text: '' })),
          ...(rawAnchorElements || []),
        ];

        for (const raw of initialLinks) {
          const item = raw as any;
          const href = typeof item === 'string' ? item : item?.href;
          const rawHref = typeof item === 'string' ? item : item?.rawHref || item?.href || '';
          const text = typeof item === 'string' ? '' : item?.text || '';
          const target = typeof item === 'string' ? undefined : item?.target;
          const rel = typeof item === 'string' ? undefined : item?.rel;

          if (!href) continue;

          const norm = this.normalizeUrl(href);
          if (norm && !norm.startsWith('javascript:') && !norm.startsWith('mailto:') && !norm.startsWith('tel:')) {
            const isExternal = !this.isSameOrigin(this.options.startUrl, norm);
            if (this.options.allowExternal || !isExternal) {
              if (!normalizedLinks.has(norm)) {
                normalizedLinks.add(norm);
                linkDetails.push({
                  url: norm,
                  rawHref,
                  text,
                  target,
                  rel,
                  isExternal,
                });
                if (!visited.has(norm)) {
                  queue.push({ url: norm, depth: depth + 1, parentUrl: url });
                }
              }
            }
          }
        }
        pageData.links = Array.from(normalizedLinks);
        pageData.linkDetails = linkDetails;
      }

      // 3. Capture full-page screenshot
      const screenshotPath = await captureScreenshot(page, url, outputDir);
      pageData.screenshotPath = screenshotPath;
      for (const plugin of this.plugins) {
        await this.safeInvokeHook(plugin, 'onScreenshot', () => plugin.onScreenshot?.(ctx, screenshotPath));
      }

      // 4. Extract clean Markdown content if enabled
      if (this.options.extractContent) {
        const { contentPath, metadata } = await extractPageContent(page, url, outputDir);
        pageData.contentPath = contentPath;
        pageData.metadata = { ...pageData.metadata, ...metadata };
        for (const plugin of this.plugins) {
          await this.safeInvokeHook(plugin, 'onExtract', () => plugin.onExtract?.(ctx, contentPath));
        }
      }

      // 5. Invoke onAnalyze plugins (e.g., accessibility auditing)
      for (const plugin of this.plugins) {
        const analysisResult = await this.safeInvokeHook(plugin, 'onAnalyze', () => plugin.onAnalyze?.(ctx));
        if (analysisResult && typeof analysisResult === 'object') {
          pageData.metadata = { ...pageData.metadata, ...analysisResult };
        }
      }

      return pageData;
    } finally {
      await this.browserManager.releasePage(page);
    }
  }
}
