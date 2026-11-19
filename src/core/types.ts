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
  /** Automatically detect underlying UI frameworks and explore interactive modals/dialogs. */
  exploreModals?: boolean;
  /** Maximum number of modals to explore per page. Default is 5. */
  maxModalsPerPage?: number;
  /** Optional array of plugins for lifecycle hook extensions (e.g., accessibility auditing). */
  plugins?: DasyuPlugin[];
  /** Optional file paths or package names for external custom user plugins to load dynamically. */
  pluginPaths?: string[];
  /** Optional custom technology/framework detection rules (modeled after Lighthouse Stacks / Wappalyzer). */
  techRules?: TechDetectionRule[];
}

/**
 * A technology or framework detection rule (modeled after Lighthouse Stacks & Wappalyzer).
 */
export interface TechDetectionRule {
  /** Unique identifier for the technology (e.g., 'angular', 'react', 'tailwind') */
  id: string;
  /** Display name (e.g., 'Angular', 'React', 'Tailwind CSS') */
  name: string;
  /** Category classification */
  category: 'framework' | 'ui' | 'library' | 'cms' | 'router';
  /** Optional documentation or project website URL */
  website?: string;
  /** Window global variable properties to check (e.g., ['ng', 'React']) */
  globals?: string[];
  /** DOM element selector queries to match (e.g., ['[ng-version]', '[data-reactroot]']) */
  dom?: string[];
  /** HTML meta tag attributes to match */
  meta?: Record<string, string>;
  /** Optional regex pattern string to extract the version from matched text/attributes */
  versionPattern?: string;
}

/**
 * Information on the underlying UI framework and component libraries detected on the page.
 */
export interface UiFrameworkInfo {
  /** The detected frontend framework (e.g., 'Angular', 'React', 'Vue', 'Svelte', 'Next.js', 'Nuxt', 'Static') */
  framework: string;
  /** Detected framework version, if available */
  version?: string;
  /** Component or modal libraries detected (e.g., 'Angular CDK / Material', 'Radix UI', 'Bootstrap', 'HTML5 Dialog') */
  componentLibraries: string[];
  /** Whether the page appears to be a client-rendered Single Page Application */
  isSpa: boolean;
  /** Detected router type (e.g., 'Angular Router', 'React Router', 'Next.js', 'History API', 'Hash') */
  routerType?: string;
}

/**
 * A form input, dropdown, or toggle control discovered inside a modal.
 */
export interface ModalFormField {
  name: string;
  type: string;
  label?: string;
  options?: string[];
  value?: string;
}

/**
 * Metadata and extracted features for an interactive modal or dialog explored on a page.
 */
export interface ModalFeature {
  id: string;
  triggerSelector?: string;
  triggerText: string;
  modalTitle: string;
  modalType: 'details' | 'status-picker' | 'edit-form' | 'tour-dialog' | 'dialog';
  content?: string;
  fields?: ModalFormField[];
  actions?: string[];
  screenshotPath?: string;
  discoveredUrls?: string[];
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
  /** Extracted UI framework and SPA architecture information */
  uiFramework?: UiFrameworkInfo;
  /** Discovered and explored interactive modals/dialogs */
  modals?: ModalFeature[];
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
