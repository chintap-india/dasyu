import type { PageContext } from '../core/types';

/**
 * Lifecycle hooks for Dasyu plugins.
 * Plugins can implement any of these optional async methods to extend crawler functionality without modifying core logic.
 */
export interface DasyuPlugin {
  /** Unique name of the plugin */
  name: string;

  /**
   * Hook called when the crawler begins execution.
   */
  onStart?: () => Promise<void> | void;

  /**
   * Hook called immediately after a page is navigated to and DOM content is ready,
   * before screenshots or content extraction take place.
   */
  onPageLoad?: (ctx: PageContext) => Promise<void> | void;

  /**
   * Hook called after a full-page screenshot has been captured and saved to disk.
   */
  onScreenshot?: (ctx: PageContext, screenshotPath: string) => Promise<void> | void;

  /**
   * Hook called after markdown and metadata content extraction is completed.
   */
  onExtract?: (ctx: PageContext, contentPath?: string) => Promise<void> | void;

  /**
   * Hook called at the end of page processing for custom analysis (e.g., WCAG accessibility auditing, Lighthouse, link checking).
   * Any returned key-value data will be merged into the page's `metadata` object in the final crawl report.
   */
  onAnalyze?: (ctx: PageContext) => Promise<Record<string, any> | void> | Record<string, any> | void;

  /**
   * Hook called when the crawler finishes processing all pages in the queue.
   */
  onComplete?: () => Promise<void> | void;
}
