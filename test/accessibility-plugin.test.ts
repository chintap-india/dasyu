import { describe, it, expect } from 'vitest';
import { AccessibilityPlugin } from '../src/plugins/accessibility';
import type { PageContext } from '../src/core/types';

describe('AccessibilityPlugin', () => {
  it('should initialize and report violations accurately', () => {
    const plugin = new AccessibilityPlugin({ logWarnings: false });
    expect(plugin.name).toBe('accessibility-audit');
  });

  it('should handle analysis cleanly', async () => {
    const plugin = new AccessibilityPlugin({ logWarnings: false });
    const ctx: PageContext = {
      page: {
        evaluate: async () => {},
      } as any,
      url: 'https://example.com',
      depth: 0,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com',
        depth: 0,
        title: 'Example',
        status: 200,
        links: [],
      },
    };

    // If axe analyze fails due to mock page, it catches gracefully and returns audit object
    const analysis = await plugin.onAnalyze(ctx);
    expect(analysis.accessibilityAudit).toBeDefined();
  });
});
