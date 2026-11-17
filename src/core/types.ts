import type { Page } from 'playwright';
import type { DasyuPlugin } from '../plugins/base';

/**
 * Configuration options for the Dasyu crawler.
 */
export interface CrawlOptions {
  /** The starting URL to crawl */
  startUrl: string;
  /** Maximum crawl depth (1 <= N <= 5). Default is 1 (starting URL + 1 level of links). */
  maxDepth?: number;
  /** Number of concurrent browser pages to run. Default is 3. */
  concurrency?: number;
  /** Output directory for saving screenshots and extracted content. Default is './output'. */
  outputDir?: string;
  /** Whether to generate and save clean Markdown content and metadata reports. Default is false. */
  extractContent?: boolean;
  /** Whether to follow and crawl links pointing to external domains. Default is false. */
  allowExternal?: boolean;
  /** Enable verbose debug logging in terminal. Default is false. */
  debug?: boolean;
  /** Optional Playwright storageState file path or object (cookies, localStorage) for authenticated crawling. */
  storageState?: string | Record<string, any>;
  /** Optional delay (in milliseconds) before navigating each page, useful for throttling and rate-limit avoidance. */
  delay?: number;
  /** Automatically scroll page down to trigger lazy loading, infinite scroll, and dynamic assets before capturing. */
  scroll?: boolean;
  /** Automatically attempt to detect and dismiss cookie consent banners and modal overlays. */
  dismissModals?: boolean;
  /** Optional array of plugins for lifecycle hook extensions (e.g., accessibility auditing). */
  plugins?: DasyuPlugin[];
}

/**
 * Structured metadata for an outbound link discovered on a web page.
 */
export interface LinkMetadata {
  /** The normalized destination URL */
  url: string;
  /** Raw href attribute value */
  rawHref: string;
  /** Visible anchor text */
  text: string;
  /** Anchor target attribute (e.g. '_blank', '_self') */
  target?: string;
  /** Anchor rel attribute (e.g. 'noopener', 'noreferrer', 'nofollow') */
  rel?: string;
  /** Whether the link points to an external origin */
  isExternal?: boolean;
}

/**
 * Extracted metadata and status for a single crawled web page.
 */
export interface PageData {
  /** The normalized URL of the page */
  url: string;
  /** The depth level at which this page was discovered (0 = starting page) */
  depth: number;
  /** Parent route URL that led to the discovery of this page (for parent-to-child route discovery) */
  parentUrl?: string;
  /** The document title of the page */
  title: string;
  /** HTTP status code returned by the navigation response */
  status: number;
  /** Relative or absolute file path to the saved full-page screenshot (.png) */
  screenshotPath?: string;
  /** Relative or absolute file path to the saved markdown/JSON content report */
  contentPath?: string;
  /** Array of normalized outbound URLs discovered on this page */
  links: string[];
  /** Detailed outbound link metadata including anchor text, target, and rel attributes */
  linkDetails?: LinkMetadata[];
  /** Additional extracted page metadata (meta description, open graph tags, etc.) */
  metadata?: Record<string, any>;
  /** Error message if the navigation or processing failed */
  error?: string;
}

/**
 * Summary report of the completed crawl operation.
 */
export interface CrawlResult {
  /** Starting URL of the crawl */
  startUrl: string;
  /** Total elapsed time in milliseconds */
  totalDurationMs: number;
  /** List of successfully crawled and processed pages */
  pages: PageData[];
  /** List of URLs that encountered errors during navigation or processing */
  errors: { url: string; depth: number; error: string }[];
}

/**
 * Context passed to extractors and plugin lifecycle hooks.
 */
export interface PageContext {
  /** Playwright Page instance */
  page: Page;
  /** Normalized URL being processed */
  url: string;
  /** Depth level of current page */
  depth: number;
  /** Current crawl options */
  options: CrawlOptions;
  /** Partial PageData object being constructed */
  data: Partial<PageData>;
}
