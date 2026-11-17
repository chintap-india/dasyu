import { describe, it, expect } from 'vitest';
import { SeoAuditPlugin } from '../src/plugins/seo';
import type { PageContext } from '../src/core/types';

describe('SeoAuditPlugin', () => {
  it('should initialize and produce analysis report for healthy SEO page', async () => {
    const plugin = new SeoAuditPlugin({ logWarnings: false });
    expect(plugin.name).toBe('seo-audit');

    const ctx: PageContext = {
      page: {
        evaluate: async () => ({
          hasTitle: true,
          titleLength: 25,
          hasDescription: true,
          descriptionLength: 120,
          h1Count: 1,
          totalImages: 4,
          missingAltImages: 0,
          openGraph: { title: 'Test Title' },
          score: 100,
        }),
      } as any,
      url: 'https://example.com/blog',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/blog',
        depth: 1,
        title: 'Blog',
        status: 200,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.seo).toBeDefined();
    expect(ctx.data.metadata?.seo.score).toBe(100);

    const analysis = await plugin.onAnalyze(ctx);
    expect(analysis.seoAudit).toBeDefined();
    expect(analysis.seoAudit.score).toBe(100);
  });

  it('should penalize and flag missing h1, missing description, and missing alt tags', async () => {
    const plugin = new SeoAuditPlugin({ logWarnings: false });

    const ctx: PageContext = {
      page: {
        evaluate: async () => ({
          hasTitle: true,
          titleLength: 10,
          hasDescription: false,
          descriptionLength: 0,
          h1Count: 0,
          headingsWarning: 'Missing primary <h1> heading tag',
          totalImages: 3,
          missingAltImages: 3,
          openGraph: {},
          score: 56, // deducted for missing desc, missing h1, missing alt
        }),
      } as any,
      url: 'https://example.com/poor-seo',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/poor-seo',
        depth: 1,
        title: 'Poor SEO',
        status: 200,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.seo.hasDescription).toBe(false);
    expect(ctx.data.metadata?.seo.headingsWarning).toBe('Missing primary <h1> heading tag');
    expect(ctx.data.metadata?.seo.missingAltImages).toBe(3);
    expect(ctx.data.metadata?.seo.score).toBeLessThan(70);
  });

  it('should flag multiple h1 tags when detected', async () => {
    const plugin = new SeoAuditPlugin({ logWarnings: false });

    const ctx: PageContext = {
      page: {
        evaluate: async () => ({
          hasTitle: true,
          titleLength: 15,
          hasDescription: true,
          descriptionLength: 80,
          h1Count: 3,
          headingsWarning: 'Multiple (3) <h1> headings found',
          totalImages: 1,
          missingAltImages: 0,
          openGraph: { title: 'Title' },
          score: 95,
        }),
      } as any,
      url: 'https://example.com/multi-h1',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/multi-h1',
        depth: 1,
        title: 'Multi H1',
        status: 200,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.seo.headingsWarning).toBe('Multiple (3) <h1> headings found');
  });
});
