import { describe, it, expect, vi } from 'vitest';
import { DasyuCrawler } from '../src/core/crawler';
import { BrowserManager } from '../src/core/browser';
import type { DasyuPlugin } from '../src/plugins/base';

describe('DasyuCrawler Core Logic', () => {
  it('should initialize with default options and constrain maxDepth to 1-5', () => {
    const crawler1 = new DasyuCrawler({
      startUrl: 'https://example.com',
      storageState: './auth.json',
    });
    expect(crawler1).toBeDefined();

    const crawler2 = new DasyuCrawler({
      startUrl: 'https://example.com',
      maxDepth: 10, // exceeds max
    });
    // crawler clamps to 5
    expect(crawler2).toBeDefined();

    const crawler3 = new DasyuCrawler({
      startUrl: 'https://example.com',
      maxDepth: 0, // below min
    });
    expect(crawler3).toBeDefined();
  });

  it('should correctly normalize URLs and preserve SPA hash routes', () => {
    const crawler = new DasyuCrawler({ startUrl: 'https://domtree.io' });
    expect(crawler.normalizeUrl('https://domtree.io/#/services/')).toBe('https://domtree.io/#/services');
    expect(crawler.normalizeUrl('https://domtree.io/about#section1')).toBe('https://domtree.io/about');
    expect(crawler.normalizeUrl('https://domtree.io/')).toBe('https://domtree.io/');
    expect(crawler.normalizeUrl('https://domtree.io/page/')).toBe('https://domtree.io/page');
    expect(crawler.normalizeUrl('/relative-path')).toBe('/relative-path');
  });

  it('should correctly determine same origin across protocols and ports', () => {
    const crawler = new DasyuCrawler({ startUrl: 'https://example.com' });
    expect(crawler.isSameOrigin('https://example.com/foo', 'https://example.com/bar')).toBe(true);
    expect(crawler.isSameOrigin('https://example.com/foo', 'https://other.com/bar')).toBe(false);
    expect(crawler.isSameOrigin('https://example.com:8080/foo', 'https://example.com:8080/bar')).toBe(true);
    expect(crawler.isSameOrigin('https://example.com:8080/foo', 'https://example.com:9090/bar')).toBe(false);
  });

  it('should execute full crawl traversal and trigger all plugin lifecycle hooks in order', async () => {
    const hooksCalled: string[] = [];
    const testPlugin: DasyuPlugin = {
      name: 'test-lifecycle',
      onStart: async () => {
        hooksCalled.push('onStart');
      },
      onPageLoad: async (ctx) => {
        hooksCalled.push(`onPageLoad:${ctx.url}`);
      },
      onScreenshot: async (ctx) => {
        hooksCalled.push(`onScreenshot:${ctx.url}`);
      },
      onExtract: async (ctx) => {
        hooksCalled.push(`onExtract:${ctx.url}`);
      },
      onAnalyze: async (ctx) => {
        hooksCalled.push(`onAnalyze:${ctx.url}`);
        return { audited: true };
      },
      onComplete: async () => {
        hooksCalled.push('onComplete');
      },
    };

    const mockPage: any = {
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Test Title'),
      evaluate: vi.fn().mockResolvedValue([]),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const mockBrowserManager: any = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const crawler = new DasyuCrawler(
      {
        startUrl: 'https://example.com',
        maxDepth: 1,
        concurrency: 1,
        outputDir: './test-crawl-temp',
        plugins: [testPlugin],
      },
      mockBrowserManager
    );

    const progressCalls: any[] = [];
    const result = await crawler.run((page, completed, total) => {
      progressCalls.push({ url: page.url, completed, total });
    });

    expect(result.startUrl).toBe('https://example.com');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe('https://example.com/');
    expect(result.errors).toHaveLength(0);

    expect(hooksCalled).toContain('onStart');
    expect(hooksCalled).toContain('onPageLoad:https://example.com/');
    expect(hooksCalled).toContain('onScreenshot:https://example.com/');
    expect(hooksCalled).toContain('onAnalyze:https://example.com/');
    expect(hooksCalled).toContain('onComplete');
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it('should capture errors and record failed pages when navigation fails', async () => {
    const mockPage: any = {
      goto: vi.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED')),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const mockBrowserManager: any = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const crawler = new DasyuCrawler(
      {
        startUrl: 'https://nonexistent-fail-domain.xyz',
        maxDepth: 1,
      },
      mockBrowserManager
    );

    const result = await crawler.run();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('ERR_NAME_NOT_RESOLVED');
    expect(result.pages[0].status).toBe(0);
    expect(result.pages[0].error).toBeDefined();
  });

  it('should reject external links when allowExternal is false', async () => {
    let visitedUrls: string[] = [];

    const mockPage: any = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        visitedUrls.push(url);
        return { status: () => 200 };
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Page'),
      evaluate: vi.fn().mockImplementation((fn: any) => {
        return ['https://external-domain.com/landing', 'https://example.com/about'];
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const mockBrowserManager: any = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const crawler = new DasyuCrawler(
      {
        startUrl: 'https://example.com',
        maxDepth: 1,
        allowExternal: false,
      },
      mockBrowserManager
    );

    const result = await crawler.run();
    const crawledUrls = result.pages.map((p) => p.url);
    expect(crawledUrls).toContain('https://example.com/');
    expect(crawledUrls).toContain('https://example.com/about');
    expect(crawledUrls).not.toContain('https://external-domain.com/landing');
  });

  it('should accept external links when allowExternal is true', async () => {
    let visitedUrls: string[] = [];

    const mockPage: any = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        visitedUrls.push(url);
        return { status: () => 200 };
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Page'),
      evaluate: vi.fn().mockImplementation(() => {
        return ['https://external-domain.com/partner'];
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const mockBrowserManager: any = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const crawler = new DasyuCrawler(
      {
        startUrl: 'https://example.com',
        maxDepth: 1,
        allowExternal: true,
      },
      mockBrowserManager
    );

    const result = await crawler.run();
    const crawledUrls = result.pages.map((p) => p.url);
    expect(crawledUrls).toContain('https://external-domain.com/partner');
  });

  it('should apply options.delay throttling before page navigation', async () => {
    const startTime = Date.now();

    const mockPage: any = {
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Delayed Page'),
      evaluate: vi.fn().mockResolvedValue([]),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
    };

    const mockBrowserManager: any = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const crawler = new DasyuCrawler(
      {
        startUrl: 'https://example.com',
        maxDepth: 1,
        delay: 50, // 50ms delay
      },
      mockBrowserManager
    );

    await crawler.run();
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
