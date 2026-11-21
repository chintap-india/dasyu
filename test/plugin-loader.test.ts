import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadPlugin, loadPlugins, loadConfigFile } from '../src/plugins/loader';
import { definePlugin } from '../src/plugins/base';
import { DEFAULT_TECH_RULES, detectUiFramework } from '../src/plugins/modal';
import { DasyuCrawler } from '../src/core/crawler';
import type { TechDetectionRule, CrawlResult, CrawlOptions } from '../src/core/types';

describe('Plugin Architecture & Loader', () => {
  const tmpDir = path.join(process.cwd(), 'test-plugin-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should define a type-safe plugin with definePlugin', () => {
    const p = definePlugin({
      name: 'sample-plugin',
      onPageLoad: async (ctx) => {},
    });
    expect(p.name).toBe('sample-plugin');
    expect(typeof p.onPageLoad).toBe('function');
  });

  it('should dynamically load an ESM plugin from disk', async () => {
    const pluginPath = path.join(tmpDir, 'custom-plugin.mjs');
    const content = `
      export default {
        name: 'esm-audit-plugin',
        async onPageLoad(ctx) {
          ctx.data.metadata = { audit: 'passed' };
        }
      };
    `;
    await fs.writeFile(pluginPath, content, 'utf-8');

    const plugin = await loadPlugin(pluginPath);
    expect(plugin.name).toBe('esm-audit-plugin');
    expect(typeof plugin.onPageLoad).toBe('function');
  });

  it('should dynamically load a class-based plugin', async () => {
    const pluginPath = path.join(tmpDir, 'class-plugin.mjs');
    const content = `
      export default class MyClassPlugin {
        constructor() {
          this.name = 'class-audit-plugin';
        }
        async onAnalyze(ctx) {
          return { score: 95 };
        }
      }
    `;
    await fs.writeFile(pluginPath, content, 'utf-8');

    const plugin = await loadPlugin(pluginPath);
    expect(plugin.name).toBe('class-audit-plugin');
    expect(typeof plugin.onAnalyze).toBe('function');
  });

  it('should throw an error for missing plugin files or invalid structures', async () => {
    await expect(loadPlugin('./non-existent-plugin.js')).rejects.toThrow('Plugin file not found');

    const invalidPath = path.join(tmpDir, 'invalid.mjs');
    await fs.writeFile(invalidPath, 'export default { foo: "bar" };', 'utf-8');
    await expect(loadPlugin(invalidPath)).rejects.toThrow('Invalid plugin structure');
  });

  it('should load multiple plugins and skip failed ones gracefully with loadPlugins', async () => {
    const p1 = path.join(tmpDir, 'p1.mjs');
    await fs.writeFile(p1, 'export default { name: "plugin-1" };', 'utf-8');

    const loaded = await loadPlugins([p1, './does-not-exist.js']);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('plugin-1');
  });

  it('should load dasyu.config.json configuration file', async () => {
    const configPath = path.join(tmpDir, 'dasyu.config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        maxDepth: 3,
        concurrency: 5,
        exploreModals: true,
      }),
      'utf-8'
    );

    const config = await loadConfigFile(configPath);
    expect(config).toBeDefined();
    expect(config?.maxDepth).toBe(3);
    expect(config?.concurrency).toBe(5);
    expect(config?.exploreModals).toBe(true);
  });

  it('should contain default Lighthouse and Wappalyzer inspired tech rules', () => {
    const ids = DEFAULT_TECH_RULES.map((r) => r.id);
    expect(ids).toContain('angular');
    expect(ids).toContain('react');
    expect(ids).toContain('vue');
    expect(ids).toContain('nextjs');
    expect(ids).toContain('angular-cdk');
    expect(ids).toContain('radix-ui');
    expect(ids).toContain('bootstrap');
  });

  it('should allow custom technology detection rules in detectUiFramework', async () => {
    const customRule: TechDetectionRule = {
      id: 'shoelace',
      name: 'Shoelace Web Components',
      category: 'ui',
      globals: ['Shoelace'],
      dom: ['sl-button, sl-dialog'],
    };

    const mockPage: any = {
      evaluate: async (fn: any, rules: any[]) => {
        const hasShoelace = rules.some((r) => r.id === 'shoelace');
        return {
          framework: 'Custom App',
          componentLibraries: hasShoelace ? ['Shoelace Web Components'] : [],
          isSpa: true,
        };
      },
    };

    const result = await detectUiFramework(mockPage, [customRule]);
    expect(result.componentLibraries).toContain('Shoelace Web Components');
  });

  it('should support plugin metadata (version, description)', () => {
    const plugin = definePlugin({
      name: 'test-meta-plugin',
      version: '1.2.3',
      description: 'Generates living documentation from crawl assets',
    });

    expect(plugin.name).toBe('test-meta-plugin');
    expect(plugin.version).toBe('1.2.3');
    expect(plugin.description).toContain('living documentation');
  });

  it('should pass CrawlResult and CrawlOptions to onComplete hook', async () => {
    let capturedResult: CrawlResult | undefined;
    let capturedOptions: CrawlOptions | undefined;
    let startOptions: CrawlOptions | undefined;

    const testPlugin = definePlugin({
      name: 'summary-collector',
      onStart(options) {
        startOptions = options;
      },
      onComplete(result, options) {
        capturedResult = result;
        capturedOptions = options;
      },
    });

    const mockPage: any = {
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Test Home'),
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
        plugins: [testPlugin],
      },
      mockBrowserManager
    );

    const crawlResult = await crawler.run();
    expect(startOptions).toBeDefined();
    expect(startOptions?.startUrl).toBe('https://example.com');
    expect(capturedResult).toBeDefined();
    expect(capturedResult?.startUrl).toBe('https://example.com');
    expect(capturedResult?.pages.length).toBe(1);
    expect(capturedOptions?.maxDepth).toBe(1);
    expect(crawlResult.pages[0].title).toBe('Test Home');
  });

  it('should isolate page-level hook errors without crashing crawler queue', async () => {
    const buggyPlugin = definePlugin({
      name: 'buggy-plugin',
      onPageLoad() {
        throw new Error('Exploding onPageLoad hook');
      },
      onScreenshot() {
        throw new Error('Exploding onScreenshot hook');
      },
      onExtract() {
        throw new Error('Exploding onExtract hook');
      },
      onAnalyze() {
        throw new Error('Exploding onAnalyze hook');
      },
    });

    const mockPage: any = {
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Resilient Page'),
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
        startUrl: 'https://example.com/resilient',
        maxDepth: 1,
        plugins: [buggyPlugin],
      },
      mockBrowserManager
    );

    // Crawl must succeed and complete despite multiple hook exceptions
    const result = await crawler.run();
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe('Resilient Page');
    expect(result.errors).toHaveLength(0);
  });
});
