import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserManagerOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  channel?: string;
}

/**
 * Manages the Playwright browser instance, browser context, and page pooling.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: BrowserManagerOptions;

  constructor(options: BrowserManagerOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      viewport: options.viewport ?? { width: 1280, height: 800 },
      userAgent:
        options.userAgent ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DasyuBot/0.1',
      browserType: options.browserType ?? 'chromium',
      channel: options.channel,
    };
  }

  /**
   * Initializes the Playwright browser and context if not already active.
   */
  async init(): Promise<void> {
    if (!this.browser) {
      const engine =
        this.options.browserType === 'firefox'
          ? firefox
          : this.options.browserType === 'webkit'
          ? webkit
          : chromium;

      try {
        this.browser = await engine.launch({
          headless: this.options.headless,
          channel: this.options.channel,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
      } catch (e: any) {
        // Fallback: If standard chromium launch fails (e.g., pre-built binary unsupported on older macOS),
        // automatically try launching system Google Chrome via channel: 'chrome'.
        if (!this.options.browserType || this.options.browserType === 'chromium') {
          if (!this.options.channel) {
            try {
              this.browser = await chromium.launch({
                headless: this.options.headless,
                channel: 'chrome',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
              });
            } catch {
              throw e;
            }
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: this.options.viewport,
        userAgent: this.options.userAgent,
        ignoreHTTPSErrors: true,
      });
    }
  }

  /**
   * Creates and returns a new browser page.
   */
  async acquirePage(): Promise<Page> {
    await this.init();
    if (!this.context) {
      throw new Error('BrowserContext failed to initialize');
    }
    return this.context.newPage();
  }

  /**
   * Safely closes a page when done.
   */
  async releasePage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      // Ignore errors if page is already closed or crashed
    }
  }

  /**
   * Closes the entire browser session and frees resources.
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /**
   * Returns true if the browser is currently initialized and running.
   */
  isActive(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
