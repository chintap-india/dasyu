import type { DasyuPlugin } from './base';
import type { PageContext } from '../core/types';
import { logger } from '../cli/logger';

export interface SeoAuditReport {
  hasTitle: boolean;
  titleLength: number;
  hasDescription: boolean;
  descriptionLength: number;
  canonicalUrl?: string;
  isCanonicalMatch?: boolean;
  h1Count: number;
  headingsWarning?: string;
  totalImages: number;
  missingAltImages: number;
  openGraph: {
    title?: string;
    description?: string;
    image?: string;
  };
  score: number; // 0 - 100
}

export interface SeoPluginOptions {
  /**
   * Log warnings in the console when SEO deficiencies (missing alt, missing meta tags) are found.
   * Default: true
   */
  logWarnings?: boolean;
}

/**
 * Built-in SEO & Content Quality Audit Plugin for Dasyu.
 * Evaluates each crawled page for critical SEO health: title tags, meta descriptions,
 * canonical consistency, heading hierarchies, OpenGraph presence, and missing image alt tags.
 */
export class SeoAuditPlugin implements DasyuPlugin {
  readonly name = 'seo-audit';
  private options: SeoPluginOptions;

  constructor(options: SeoPluginOptions = {}) {
    this.options = { logWarnings: options.logWarnings ?? true };
  }

  async onPageLoad(ctx: PageContext): Promise<void> {
    const page = ctx.page;

    try {
      const seoData = await page.evaluate((currentUrl) => {
        const titleEl = document.querySelector('title');
        const title = titleEl?.textContent?.trim() || '';

        const descEl = document.querySelector('meta[name="description"]');
        const description = descEl?.getAttribute('content')?.trim() || '';

        const canonicalEl = document.querySelector('link[rel="canonical"]');
        const canonicalUrl = canonicalEl?.getAttribute('href')?.trim();

        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || undefined;
        const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || undefined;
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

        const h1s = document.querySelectorAll('h1');
        const images = Array.from(document.querySelectorAll('img'));
        const missingAlt = images.filter((img) => !img.hasAttribute('alt') || !img.getAttribute('alt')?.trim()).length;

        // Calculate a basic SEO health score (0 - 100)
        let score = 100;
        if (!title) score -= 25;
        if (!description) score -= 20;
        if (h1s.length === 0) score -= 15;
        if (h1s.length > 1) score -= 5;
        if (!canonicalUrl) score -= 10;
        if (!ogImage) score -= 10;
        if (missingAlt > 0) score -= Math.min(15, missingAlt * 3);

        let headingsWarning: string | undefined;
        if (h1s.length === 0) headingsWarning = 'Missing primary <h1> heading tag';
        else if (h1s.length > 1) headingsWarning = `Multiple (${h1s.length}) <h1> headings found`;

        return {
          hasTitle: Boolean(title),
          titleLength: title.length,
          hasDescription: Boolean(description),
          descriptionLength: description.length,
          canonicalUrl,
          isCanonicalMatch: canonicalUrl ? canonicalUrl === currentUrl || canonicalUrl === currentUrl.replace(/\/$/, '') : undefined,
          h1Count: h1s.length,
          headingsWarning,
          totalImages: images.length,
          missingAltImages: missingAlt,
          openGraph: {
            title: ogTitle,
            description: ogDesc,
            image: ogImage,
          },
          score: Math.max(0, score),
        };
      }, ctx.url);

      ctx.data.metadata = ctx.data.metadata || {};
      ctx.data.metadata.seo = seoData;

      if (this.options.logWarnings) {
        if (!seoData.hasDescription) {
          logger.warn(`[SEO] Missing <meta name="description"> on ${ctx.url}`);
        }
        if (seoData.headingsWarning) {
          logger.warn(`[SEO] ${seoData.headingsWarning} on ${ctx.url}`);
        }
        if (seoData.missingAltImages > 0) {
          logger.warn(`[SEO] ${seoData.missingAltImages} image(s) missing alt text on ${ctx.url}`);
        }
      }
    } catch {
      // Ignore evaluation errors
    }
  }

  async onAnalyze(ctx: PageContext): Promise<Record<string, any>> {
    return {
      seoAudit: ctx.data.metadata?.seo || null,
    };
  }
}

export function createSeoPlugin(options?: SeoPluginOptions): SeoAuditPlugin {
  return new SeoAuditPlugin(options);
}
