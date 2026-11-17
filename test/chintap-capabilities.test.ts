import { describe, it, expect, vi } from 'vitest';
import { DasyuCrawler } from '../src/core/crawler';
import { exportSiteGraph } from '../src/core/graph';
import { extractPageContent } from '../src/extractors/content';
import type { PageData } from '../src/core/types';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('Chintap Website Capabilities Verification', () => {
  const tmpDir = path.join(process.cwd(), 'test-capabilities-temp');

  it('Capability 01 & 04: should discover parent-to-child routes and extract anchor and target metadata', async () => {
    const visitedUrls: string[] = [];

    const mockPage: any = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        visitedUrls.push(url);
        return { status: () => 200 };
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockImplementation(async () => {
        const last = visitedUrls[visitedUrls.length - 1];
        return last.includes('docs') ? 'Documentation Page' : 'Home Page';
      }),
      evaluate: vi.fn().mockImplementation(async (fn: any) => {
        const last = visitedUrls[visitedUrls.length - 1];
        if (last === 'https://example.com/') {
          return [
            {
              href: 'https://example.com/docs',
              rawHref: '/docs',
              text: 'Read Documentation',
              target: '_self',
              rel: 'noopener',
            },
            {
              href: 'https://external-service.org/portal',
              rawHref: 'https://external-service.org/portal',
              text: 'External Portal',
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          ];
        }
        return [];
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
        startUrl: 'https://example.com/',
        maxDepth: 2,
        concurrency: 1,
        outputDir: tmpDir,
        allowExternal: false,
      },
      mockBrowserManager
    );

    const result = await crawler.run();

    // Verification of Breadth-first crawl and depth limits
    expect(result.pages).toHaveLength(2);

    const rootPage = result.pages.find((p) => p.url === 'https://example.com/')!;
    expect(rootPage).toBeDefined();
    expect(rootPage.depth).toBe(0);
    expect(rootPage.parentUrl).toBeUndefined();

    // Verify Anchor and Target metadata extraction
    expect(rootPage.linkDetails).toBeDefined();
    expect(rootPage.linkDetails).toHaveLength(1); // external was excluded
    expect(rootPage.linkDetails![0]).toEqual({
      url: 'https://example.com/docs',
      rawHref: '/docs',
      text: 'Read Documentation',
      target: '_self',
      rel: 'noopener',
      isExternal: false,
    });

    // Verify Parent-to-Child route discovery
    const childPage = result.pages.find((p) => p.url === 'https://example.com/docs')!;
    expect(childPage).toBeDefined();
    expect(childPage.depth).toBe(1);
    expect(childPage.parentUrl).toBe('https://example.com/');
  });

  it('Capability 03 & 04: should extract link metadata into structured JSON alongside markdown', async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    const mockPage: any = {
      evaluate: async () => ({
        html: `
          <h1>Application Dashboard</h1>
          <p>Explore resources below.</p>
          <a href="https://example.com/analytics" target="_blank" rel="noopener">View Analytics</a>
          <a href="https://example.com/settings" target="_self">User Settings</a>
        `,
        metadata: {
          title: 'Application Dashboard',
          description: 'Explore dashboard features and configurations.',
          keywords: 'dashboard, analytics',
          ogTitle: 'Dashboard',
          ogImage: 'https://example.com/banner.png',
          canonical: 'https://example.com/dashboard',
          headings: [{ level: 'h1', text: 'Application Dashboard' }],
          links: [
            {
              href: 'https://example.com/analytics',
              rawHref: 'https://example.com/analytics',
              text: 'View Analytics',
              target: '_blank',
              rel: 'noopener',
            },
            {
              href: 'https://example.com/settings',
              rawHref: 'https://example.com/settings',
              text: 'User Settings',
              target: '_self',
              rel: undefined,
            },
          ],
          extractedAt: new Date().toISOString(),
        },
      }),
    };

    const res = await extractPageContent(mockPage, 'https://example.com/dashboard', tmpDir);

    expect(res.contentPath).toBeDefined();
    expect(res.metadata.links).toHaveLength(2);
    expect(res.metadata.links[0].text).toBe('View Analytics');
    expect(res.metadata.links[0].target).toBe('_blank');

    // Check JSON on disk contains structured link metadata
    const jsonPath = res.contentPath.replace(/\.md$/, '.json');
    const diskJson = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    expect(diskJson.metadata.links).toBeDefined();
    expect(diskJson.metadata.links[0].text).toBe('View Analytics');
    expect(diskJson.metadata.links[0].target).toBe('_blank');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Capability 04: should generate structured JSON connectivity data and Mermaid diagram with route labels', async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    const pages: PageData[] = [
      {
        url: 'https://example.com/',
        depth: 0,
        title: 'Home',
        status: 200,
        links: ['https://example.com/pricing'],
        linkDetails: [
          {
            url: 'https://example.com/pricing',
            rawHref: '/pricing',
            text: 'See Pricing Plans',
            target: '_self',
          },
        ],
      },
      {
        url: 'https://example.com/pricing',
        depth: 1,
        parentUrl: 'https://example.com/',
        title: 'Pricing',
        status: 200,
        links: [],
      },
    ];

    const { graph, graphJsonPath, mermaidPath } = await exportSiteGraph(pages, tmpDir);

    // Check Node details include parent-to-child route discovery
    expect(graph.nodes[1].parentUrl).toBe('https://example.com/');

    // Check Edge metadata includes anchor text and target attribute
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe('node_1');
    expect(graph.edges[0].target).toBe('node_2');
    expect(graph.edges[0].anchorText).toBe('See Pricing Plans');
    expect(graph.edges[0].targetAttr).toBe('_self');

    // Check Mermaid diagram content includes edge label
    const mmdContent = await fs.readFile(mermaidPath, 'utf-8');
    expect(mmdContent).toContain('node_1 -->|"See Pricing Plans"| node_2');

    // Check JSON file
    const jsonContent = JSON.parse(await fs.readFile(graphJsonPath, 'utf-8'));
    expect(jsonContent.edges[0].anchorText).toBe('See Pricing Plans');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
