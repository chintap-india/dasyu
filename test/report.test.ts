import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateHtmlReport } from '../src/core/report';
import type { CrawlResult } from '../src/core/types';

describe('HTML Visual Report Generator', () => {
  const tmpDir = path.join(process.cwd(), 'test-report-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should generate a standalone report.html with overview stats and page cards', async () => {
    const mockResult: CrawlResult = {
      startUrl: 'https://chintap.com',
      totalDurationMs: 4200,
      pages: [
        {
          url: 'https://chintap.com',
          depth: 0,
          title: 'Chintap — Things. Apps. Possibilities.',
          status: 200,
          screenshotPath: path.join(tmpDir, 'chintap_com__home.png'),
          links: ['https://chintap.com/how-we-work', 'https://chintap.com/about'],
          metadata: {
            accessibility: { score: 95, violationsCount: 1 },
            seo: { warnings: [], h1Count: 1 },
          },
        },
        {
          url: 'https://chintap.com/how-we-work',
          depth: 1,
          title: 'How We Work — Chintap',
          status: 200,
          screenshotPath: path.join(tmpDir, 'chintap_com__how-we-work.png'),
          links: [],
          metadata: {
            accessibility: { score: 85, violationsCount: 2 },
            seo: { warnings: ['Missing meta description'], h1Count: 1 },
          },
        },
      ],
      errors: [],
    };

    const reportPath = await generateHtmlReport(mockResult, {
      outputDir: tmpDir,
      ragChunksCount: 42,
    });

    expect(reportPath).toBe(path.join(tmpDir, 'report.html'));
    const htmlContent = await fs.readFile(reportPath, 'utf-8');

    // Check header and branding
    expect(htmlContent).toContain('The Outlaw of the Web');
    expect(htmlContent).toContain('dasyu<span class="devanagari">दस्यु</span>');
    expect(htmlContent).toContain('Dasyu Crawl Report');
    expect(htmlContent).toContain('chintap.com');
    expect(htmlContent).toContain('Automated Crawl &amp; Audit Report');

    // Check KPI statistics
    expect(htmlContent).toContain('Pages Crawled');
    expect(htmlContent).toContain('RAG Chunks');
    expect(htmlContent).toContain('42');
    expect(htmlContent).toContain('Avg A11y Score');
    expect(htmlContent).toContain('90/100'); // average of 95 and 85

    // Check Page Cards & details
    expect(htmlContent).toContain('Chintap — Things. Apps. Possibilities.');
    expect(htmlContent).toContain('How We Work — Chintap');
    expect(htmlContent).toContain('Depth 0');
    expect(htmlContent).toContain('Depth 1');
    expect(htmlContent).toContain('200');
    expect(htmlContent).toContain('SEO: <strong>1 warnings</strong>');

    // Check Interactive elements
    expect(htmlContent).toContain('id="searchInput"');
    expect(htmlContent).toContain('id="lightboxModal"');
    expect(htmlContent).toContain('id="mdModal"');
  });

  it('should escape HTML characters in title and URL to prevent XSS injection', async () => {
    const maliciousResult: CrawlResult = {
      startUrl: 'https://example.com',
      totalDurationMs: 1000,
      pages: [
        {
          url: 'https://example.com/test?a=1&b=2<script>alert(1)</script>',
          depth: 0,
          title: 'XSS Attack <img src=x onerror=alert(1)>',
          status: 200,
          links: [],
        },
      ],
      errors: [],
    };

    const reportPath = await generateHtmlReport(maliciousResult, { outputDir: tmpDir });
    const htmlContent = await fs.readFile(reportPath, 'utf-8');

    expect(htmlContent).not.toContain('<script>alert(1)</script>');
    expect(htmlContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(htmlContent).not.toContain('<img src=x onerror=alert(1)>');
    expect(htmlContent).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
