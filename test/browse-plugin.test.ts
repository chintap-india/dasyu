import { describe, it, expect, vi } from 'vitest';
import { AnomalyBrowsePlugin } from '../src/plugins/browse';
import type { PageContext } from '../src/core/types';

describe('AnomalyBrowsePlugin', () => {
  it('should detect 401 Unauthorized status as an auth wall', async () => {
    const onAuthWall = vi.fn();
    const plugin = new AnomalyBrowsePlugin({ onAuthWall });

    const ctx: PageContext = {
      page: {} as any,
      url: 'https://example.com/api/data',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/api/data',
        depth: 1,
        title: 'API Data',
        status: 401,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.authWallDetected).toBe(true);
    expect(ctx.data.metadata?.authWallReason).toContain('401');
    expect(onAuthWall).toHaveBeenCalledWith(ctx, expect.stringContaining('401'));

    const analysis = await plugin.onAnalyze(ctx);
    expect(analysis.anomalyBrowse.authWallDetected).toBe(true);
  });

  it('should detect login redirect in URL path', async () => {
    const plugin = new AnomalyBrowsePlugin();

    const ctx: PageContext = {
      page: {} as any,
      url: 'https://example.com/login?next=/dashboard',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/login?next=/dashboard',
        depth: 1,
        title: 'Login Page',
        status: 200,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.authWallDetected).toBe(true);
    expect(ctx.data.metadata?.authWallReason).toContain('Login / SSO redirect');
  });

  it('should detect auth barrier keywords in page title', async () => {
    const plugin = new AnomalyBrowsePlugin();

    const ctx: PageContext = {
      page: {} as any,
      url: 'https://app.example.com/vault',
      depth: 1,
      options: { startUrl: 'https://app.example.com' },
      data: {
        url: 'https://app.example.com/vault',
        depth: 1,
        title: 'Attention Required! | Cloudflare',
        status: 403,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.authWallDetected).toBe(true);
  });

  it('should allow normal pages through without auth flags', async () => {
    const plugin = new AnomalyBrowsePlugin();

    const ctx: PageContext = {
      page: {} as any,
      url: 'https://example.com/about-us',
      depth: 1,
      options: { startUrl: 'https://example.com' },
      data: {
        url: 'https://example.com/about-us',
        depth: 1,
        title: 'About Our Company',
        status: 200,
        links: [],
      },
    };

    await plugin.onPageLoad(ctx);
    expect(ctx.data.metadata?.authWallDetected).toBeUndefined();

    const analysis = await plugin.onAnalyze(ctx);
    expect(analysis.anomalyBrowse.authWallDetected).toBe(false);
  });
});
