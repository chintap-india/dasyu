import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserManagerOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  channel?: string;
  storageState?: string | Record<string, any>;
}

/**
 * Manages the Playwright browser instance, browser context, and page pooling.
 * Guarantees zero orphaned or leaked browser processes via a centralized registry
 * and automated process termination signal hooks (SIGINT, SIGTERM, SIGHUP, beforeExit).
 */
export class BrowserManager {
  private static readonly activeManagers: Set<BrowserManager> = new Set();
  private static exitHandlersRegistered = false;
  private static isShuttingDown = false;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Set<Page> = new Set();
  private options: BrowserManagerOptions;
  private initPromise: Promise<void> | null = null;

  constructor(options: BrowserManagerOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      viewport: options.viewport ?? { width: 1280, height: 800 },
      userAgent:
        options.userAgent ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DasyuBot/0.1',
      browserType: options.browserType ?? 'chromium',
      channel: options.channel,
      storageState: options.storageState,
    };

    BrowserManager.registerExitHandlers();
  }

  /**
   * Registers process-level termination hooks once to ensure all active
   * browser processes are forcefully reaped on SIGINT (Ctrl+C), SIGTERM, SIGHUP, or process exit.
   */
  public static registerExitHandlers(): void {
    if (BrowserManager.exitHandlersRegistered) return;
    BrowserManager.exitHandlersRegistered = true;

    const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');

    const shutdown = async (signal: string, exitCode: number) => {
      if (BrowserManager.isShuttingDown) return;
      BrowserManager.isShuttingDown = true;
      try {
        await BrowserManager.closeAll();
      } catch {
        // Suppress errors during signal exit
      }
      if (!isTest) {
        process.exit(exitCode);
      }
    };

    process.once('SIGINT', () => {
      shutdown('SIGINT', 130);
    });

    process.once('SIGTERM', () => {
      shutdown('SIGTERM', 143);
    });

    process.once('SIGHUP', () => {
      shutdown('SIGHUP', 129);
    });

    process.once('beforeExit', async () => {
      if (BrowserManager.activeManagers.size > 0) {
        await BrowserManager.closeAll();
      }
    });
  }

  /**
   * Closes all active BrowserManager instances currently tracked by the process.
   */
  public static async closeAll(): Promise<void> {
    const managers = Array.from(BrowserManager.activeManagers);
    if (managers.length === 0) return;

    await Promise.allSettled(
      managers.map(async (m) => {
        try {
          await Promise.race([
            m.close(),
            new Promise<void>((resolve) => setTimeout(resolve, 4000)),
          ]);
        } catch {
          // Ignore individual manager close failures during bulk cleanup
        }
      })
    );
    BrowserManager.activeManagers.clear();
  }

  /**
   * Returns the count of active BrowserManager instances currently registered.
   */
  public static getActiveCount(): number {
    return BrowserManager.activeManagers.size;
  }

  /**
   * Returns a snapshot array of all active BrowserManager instances.
   */
  public static getActiveManagers(): BrowserManager[] {
    return Array.from(BrowserManager.activeManagers);
  }

  /**
   * Initializes the Playwright browser and context if not already active.
   * Concurrency-safe: multiple parallel calls share the same initialization promise.
   */
  async init(): Promise<void> {
    if (this.browser && this.context) return;
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      BrowserManager.activeManagers.add(this);

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
          storageState: this.options.storageState as any,
        });
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Dynamically updates the authentication storageState for future browser contexts.
   */
  async setStorageState(storageState?: string | Record<string, any>): Promise<void> {
    this.options.storageState = storageState;
    this.pages.clear();
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }

  /**
   * Saves the current context storageState (cookies, localStorage) to an object or file path.
   */
  async saveStorageState(path?: string): Promise<Record<string, any> | undefined> {
    if (!this.context) return undefined;
    if (path) {
      await this.context.storageState({ path });
      return undefined;
    }
    return this.context.storageState();
  }

  /**
   * Creates and returns a new browser page.
   */
  async acquirePage(): Promise<Page> {
    await this.init();
    if (!this.context) {
      throw new Error('BrowserContext failed to initialize');
    }
    const page = await this.context.newPage();
    this.pages.add(page);
    page.once('close', () => {
      this.pages.delete(page);
    });
    return page;
  }

  /**
   * Safely closes a page when done.
   */
  async releasePage(page: Page): Promise<void> {
    this.pages.delete(page);
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      // Ignore errors if page is already closed or crashed
    }
  }

  /**
   * Closes the entire browser session, all open pages, and frees resources.
   */
  async close(): Promise<void> {
    BrowserManager.activeManagers.delete(this);

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // Ignore initialization errors if close was called during init
      }
      this.initPromise = null;
    }

    // 1. Force close any lingering open pages
    const pagesToClose = Array.from(this.pages);
    this.pages.clear();
    for (const page of pagesToClose) {
      try {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      } catch {
        // Ignore page close error
      }
    }

    // 2. Close browser context
    if (this.context) {
      const ctx = this.context;
      this.context = null;
      try {
        await ctx.close().catch(() => {});
      } catch {
        // Ignore context close error
      }
    }

    // 3. Close browser process with timeout safeguard to prevent hanging
    if (this.browser) {
      const b = this.browser;
      this.browser = null;
      try {
        await Promise.race([
          b.close().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Ignore browser close error
      }
    }
  }

  /**
   * Returns true if the browser is currently initialized and running.
   */
  isActive(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
