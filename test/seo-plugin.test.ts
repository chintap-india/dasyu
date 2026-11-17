import { describe, it, expect } from 'vitest';
import { SeoAuditPlugin } from '../src/plugins/seo';
import type { PageContext } from '../src/core/types';

describe('SeoAuditPlugin', () => {
  it('should initialize and produce analysis report', async () => {
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
});
