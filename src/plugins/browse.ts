import type { DasyuPlugin } from './base';
import type { PageContext } from '../core/types';
import { logger } from '../cli/logger';
import { inspectStorageState } from '../core/auth';

export interface BrowsePluginOptions {
  /**
   * Path to or object representing an external OpenCode Browse / real browser session state.
   */
  sessionState?: string | Record<string, any>;

  /**
   * Automatically detect authentication barriers (login forms, 401/403 status, SSO redirects, CAPTCHAs).
   * Defaults to true.
   */
  detectAuthWalls?: boolean;

  /**
   * Optional custom regular expressions to match authentication or login URLs.
   */
  customAuthPatterns?: RegExp[];

  /**
   * Hook invoked whenever an authentication barrier or login screen is detected during crawl.
   */
  onAuthWall?: (ctx: PageContext, reason: string) => Promise<void> | void;

  /**
   * Optional file path to export the final browser storageState when the crawl finishes.
   */
  exportSessionPath?: string;
}

/**
 * Anomalyco Browse Plugin for Dasyu.
 *
 * Bridges OpenCode Browse sessions into Dasyu, provides real-time detection
 * of authentication barriers / login walls across crawled pages, and logs
 * security checkpoints for human-in-the-loop interventions.
 */
export class AnomalyBrowsePlugin implements DasyuPlugin {
  readonly name = 'anomaly-browse';
  private options: BrowsePluginOptions;

  constructor(options: BrowsePluginOptions = {}) {
    this.options = {
      detectAuthWalls: options.detectAuthWalls ?? true,
      customAuthPatterns: options.customAuthPatterns ?? [],
      ...options,
    };
  }

  async onStart(): Promise<void> {
    if (this.options.sessionState) {
      try {
        const stats = await inspectStorageState(this.options.sessionState);
        logger.info(
          `[BrowsePlugin] OpenCode Browse session active — ${stats.cookiesCount} cookies across ${stats.domains.length} domains (${stats.domains.join(', ') || 'all'})`
        );
      } catch (err: any) {
        logger.warn(`[BrowsePlugin] Could not inspect initial sessionState: ${err?.message || String(err)}`);
      }
    }
  }

  async onPageLoad(ctx: PageContext): Promise<void> {
    if (!this.options.detectAuthWalls) return;

    const urlLower = ctx.url.toLowerCase();
    const status = ctx.data.status;
    const titleLower = (ctx.data.title || '').toLowerCase();

    let detectedReason: string | null = null;

    // 1. Status Code Check
    if (status === 401) {
      detectedReason = 'HTTP 401 Unauthorized';
    } else if (status === 403) {
      detectedReason = 'HTTP 403 Forbidden / Access Denied';
    }

    // 2. URL Path Pattern Check
    if (!detectedReason) {
      const defaultPatterns = [
        /\/(login|signin|sign-in|authenticate|checkpoint)/i,
        /accounts\.google\.com|auth0\.com|okta\.com|login\.microsoftonline\.com/i,
      ];
      const patterns = [...defaultPatterns, ...(this.options.customAuthPatterns || [])];

      for (const pattern of patterns) {
        if (pattern.test(urlLower)) {
          detectedReason = `Login / SSO redirect detected (${pattern.toString()})`;
          break;
        }
      }
    }

    // 3. Page Title Keyword Check
    if (!detectedReason && titleLower) {
      const titleKeywords = [
        'sign in',
        'log in',
        'login',
        'authentication required',
        'access denied',
        'attention required! | cloudflare',
        'verify you are human',
      ];
      for (const kw of titleKeywords) {
        if (titleLower.includes(kw)) {
          detectedReason = `Auth barrier detected in page title ("${kw}")`;
          break;
        }
      }
    }

    if (detectedReason) {
      ctx.data.metadata = ctx.data.metadata || {};
      ctx.data.metadata.authWallDetected = true;
      ctx.data.metadata.authWallReason = detectedReason;

      logger.warn(`⚠️  [BrowsePlugin] ${detectedReason} on ${ctx.url}`);

      if (this.options.onAuthWall) {
        await this.options.onAuthWall(ctx, detectedReason);
      }
    }
  }

  async onAnalyze(ctx: PageContext): Promise<Record<string, any>> {
    return {
      anomalyBrowse: {
        authWallDetected: Boolean(ctx.data.metadata?.authWallDetected),
        authWallReason: ctx.data.metadata?.authWallReason || null,
      },
    };
  }

  async onComplete(): Promise<void> {
    if (this.options.exportSessionPath) {
      logger.success(`[BrowsePlugin] Crawl session state preserved for export: ${this.options.exportSessionPath}`);
    }
  }
}

/**
 * Factory helper to instantiate the Anomalyco Browse plugin.
 */
export function createBrowsePlugin(options?: BrowsePluginOptions): AnomalyBrowsePlugin {
  return new AnomalyBrowsePlugin(options);
}
