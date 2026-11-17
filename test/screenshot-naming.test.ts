import { describe, it, expect } from 'vitest';
import { getWebsiteNaming, dismissCookieBanners, sanitizeUrlToFilename } from '../src/extractors/screenshot';

describe('Screenshot Naming and Helpers', () => {
  it('should generate proper WebsiteNamingInfo for root and deep URLs', () => {
    const rootInfo = getWebsiteNaming('https://chintap.com/', './output', '2026-11-17_12-00-00');
    expect(rootInfo.hostname).toBe('chintap.com');
    expect(rootInfo.pagename).toBe('index');
    expect(rootInfo.baseFilename).toBe('2026-11-17_12-00-00__index');
    expect(rootInfo.screenshotsDir).toContain('chintap.com/screenshots');
    expect(rootInfo.contentDir).toContain('chintap.com/content');

    const deepInfo = getWebsiteNaming('https://chintap.com/products/widgets', './output', '2026-11-17_12-00-00');
    expect(deepInfo.pagename).toBe('products_widgets');
    expect(deepInfo.baseFilename).toBe('2026-11-17_12-00-00__products_widgets');
  });

  it('should handle SPA hash routing in getWebsiteNaming', () => {
    const spaInfo = getWebsiteNaming('https://domtree.io/#/dashboard/settings', './output', '2026-11-17_12-00-00');
    expect(spaInfo.pagename).toBe('dashboard_settings');
  });

  it('should include hash suffix for query parameters', () => {
    const searchInfo = getWebsiteNaming('https://example.com/search?q=playwright', './output', '2026-11-17_12-00-00');
    expect(searchInfo.pagename).toMatch(/^search_\d+$/);
  });

  it('should sanitize URLs to safe filenames', () => {
    expect(sanitizeUrlToFilename('https://example.com/docs/api-v1')).toBe('example_com__docs_api-v1.png');
    expect(sanitizeUrlToFilename('https://example.com/')).toBe('example_com__index.png');
  });

  it('should execute dismissCookieBanners and handle evaluation errors safely', async () => {
    const mockPageSuccess: any = {
      evaluate: async () => true,
    };
    const dismissed = await dismissCookieBanners(mockPageSuccess);
    expect(dismissed).toBe(true);

    const mockPageFail: any = {
      evaluate: async () => {
        throw new Error('Context closed');
      },
    };
    const failed = await dismissCookieBanners(mockPageFail);
    expect(failed).toBe(false);
  });
});
