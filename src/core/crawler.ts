import type { Page } from 'playwright';
import type { CrawlOptions, CrawlResult, PageContext, PageData } from './types';
import type { DasyuPlugin } from '../plugins/base';
import { BrowserManager } from './browser';
import { captureScreenshot } from '../extractors/screenshot';
import { extractPageContent } from '../extractors/content';

/**
 * Main engine for Dasyu web crawling, snapshotting, and content extraction.
 */
export class DasyuCrawler {
  private options: CrawlOptions;
  private browserManager: BrowserManager;
  private persistentBrowser: boolean;
  private plugins: DasyuPlugin[];

  constructor(options: CrawlOptions, browserManager?: BrowserManager) {
    this.options = {
      ...options,
      maxDepth: options.maxDepth !== undefined ? Math.min(Math.max(1, options.maxDepth), 5) : 1,
      concurrency: options.concurrency || 3,
      outputDir: options.outputDir || './output',
    };
    this.plugins = options.plugins || [];
    if (browserManager) {
      this.browserManager = browserManager;
      this.persistentBrowser = true;
    } else {
      this.browserManager = new BrowserManager();
      this.persistentBrowser = false;
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
      if (result.endsWith('/') && parsed.pathname !== '/' && !parsed.hash) {
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
    const startTime = Date.now();
    const startUrlNorm = this.normalizeUrl(this.options.startUrl);
    const queue: { url: string; depth: number }[] = [{ url: startUrlNorm, depth: 0 }];
    const visited = new Set<string>();
    const pages: PageData[] = [];
    const errors: { url: string; depth: number; error: string }[] = [];

    // Notify plugins onStart
    for (const plugin of this.plugins) {
      await plugin.onStart?.();
    }

    const concurrency = this.options.concurrency!;
    const maxDepth = this.options.maxDepth!;
    let activeWorkers = 0;

    const runWorker = async () => {
      while (true) {
        let item: { url: string; depth: number } | undefined;
        while (queue.length > 0) {
          const candidate = queue.shift()!;
          if (!visited.has(candidate.url)) {
            visited.add(candidate.url);
            item = candidate;
            break;
          }
        }

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
          const pageData = await this.processUrl(item.url, item.depth, maxDepth, queue, visited);
          pages.push(pageData);
          onProgress?.(pageData, pages.length + errors.length, queue.length);
        } catch (err: any) {
          const errorMsg = err?.message || String(err);
          errors.push({ url: item.url, depth: item.depth, error: errorMsg });
          const failedPage: PageData = {
            url: item.url,
            depth: item.depth,
            title: 'Error',
            status: 0,
            links: [],
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

    // Notify plugins onComplete
    for (const plugin of this.plugins) {
      await plugin.onComplete?.();
    }

    // Shut down browser if we created it internally (not injected by REPL/tests)
    if (!this.persistentBrowser) {
      await this.browserManager.close();
    }

    return {
      startUrl: this.options.startUrl,
      totalDurationMs: Date.now() - startTime,
      pages,
      errors,
    };
  }

  /**
   * Processes a single page: navigates, snapshots, extracts content, and discovers links.
   */
  private async processUrl(
    url: string,
    depth: number,
    maxDepth: number,
    queue: { url: string; depth: number }[],
    visited: Set<string>
  ): Promise<PageData> {
    const page = await this.browserManager.acquirePage();
    const outputDir = this.options.outputDir!;
    const pageData: PageData = {
      url,
      depth,
      title: '',
      status: 0,
      links: [],
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
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
        return page.goto(url, { waitUntil: 'load', timeout: 30000 });
      });
      await page.waitForTimeout(1000);
      pageData.status = response?.status() || 200;
      pageData.title = (await page.title()) || url;

      // 1. Invoke onPageLoad plugins
      for (const plugin of this.plugins) {
        await plugin.onPageLoad?.(ctx);
      }

      // 2. Extract outbound links if within depth limits
      if (depth < maxDepth) {
        const rawLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter(Boolean);
        });

        const normalizedLinks = new Set<string>();
        for (const raw of rawLinks) {
          const norm = this.normalizeUrl(raw);
          if (norm && !norm.startsWith('javascript:') && !norm.startsWith('mailto:') && !norm.startsWith('tel:')) {
            if (this.options.allowExternal || this.isSameOrigin(this.options.startUrl, norm)) {
              normalizedLinks.add(norm);
              if (!visited.has(norm)) {
                queue.push({ url: norm, depth: depth + 1 });
              }
            }
          }
        }
        pageData.links = Array.from(normalizedLinks);
      }

      // 3. Capture full-page screenshot
      const screenshotPath = await captureScreenshot(page, url, outputDir);
      pageData.screenshotPath = screenshotPath;
      for (const plugin of this.plugins) {
        await plugin.onScreenshot?.(ctx, screenshotPath);
      }

      // 4. Extract clean Markdown content if enabled
      if (this.options.extractContent) {
        const { contentPath, metadata } = await extractPageContent(page, url, outputDir);
        pageData.contentPath = contentPath;
        pageData.metadata = { ...pageData.metadata, ...metadata };
        for (const plugin of this.plugins) {
          await plugin.onExtract?.(ctx, contentPath);
        }
      }

      // 5. Invoke onAnalyze plugins (e.g., accessibility auditing)
      for (const plugin of this.plugins) {
        const analysisResult = await plugin.onAnalyze?.(ctx);
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
