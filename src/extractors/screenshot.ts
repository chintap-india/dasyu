import path from 'node:path';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';

export interface WebsiteNamingInfo {
  hostname: string;        // e.g. "domtree.io"
  websiteDir: string;      // e.g. "./output/domtree.io"
  screenshotsDir: string;  // e.g. "./output/domtree.io/screenshots"
  contentDir: string;      // e.g. "./output/domtree.io/content"
  pagename: string;        // e.g. "index" or "about_team"
  timestamp: string;       // e.g. "2026-07-27_14-50-00"
  baseFilename: string;    // e.g. "2026-07-27_14-50-00__index"
}

export function getWebsiteNaming(urlStr: string, baseOutputDir: string, customTimestamp?: string): WebsiteNamingInfo {
  let hostname = 'unknown_domain';
  let pagename = 'index';
  try {
    const parsed = new URL(urlStr);
    hostname = parsed.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    let pathname = parsed.pathname;
    if (parsed.hash && (parsed.hash.startsWith('#/') || parsed.hash.startsWith('#!/'))) {
      pathname += (pathname.endsWith('/') ? '' : '/') + parsed.hash.replace(/^#!?\//, '');
    }
    if (pathname === '/' || pathname === '') {
      pagename = 'index';
    } else {
      pagename = pathname
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9-_]/g, '_');
    }
    if (parsed.search) {
      pagename += `_${Math.abs(hashCode(parsed.search))}`;
    }
  } catch {
    pagename = `page_${Date.now()}`;
  }

  const timestamp = customTimestamp || new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
  const websiteDir = path.join(baseOutputDir, hostname);
  const screenshotsDir = path.join(websiteDir, 'screenshots');
  const contentDir = path.join(websiteDir, 'content');
  const baseFilename = `${timestamp}__${pagename}`;

  return {
    hostname,
    websiteDir,
    screenshotsDir,
    contentDir,
    pagename,
    timestamp,
    baseFilename,
  };
}

/**
 * Sanitizes a URL into a safe filesystem filename.
 */
export function sanitizeUrlToFilename(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    let pathname = parsed.pathname;
    if (parsed.hash && (parsed.hash.startsWith('#/') || parsed.hash.startsWith('#!/'))) {
      pathname += (pathname.endsWith('/') ? '' : '/') + parsed.hash.replace(/^#!?\//, '');
    }
    if (pathname === '/' || pathname === '') {
      pathname = 'index';
    } else {
      // Remove leading/trailing slash and replace slashes/special chars with underscore
      pathname = pathname
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9-_]/g, '_');
    }
    // Append a short hash of the hostname/search to prevent collisions across domains/queries
    const hostPart = parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    const queryPart = parsed.search ? `_${Math.abs(hashCode(parsed.search))}` : '';
    return `${hostPart}__${pathname}${queryPart}.png`;
  } catch {
    // Fallback for malformed URLs
    return `page_${Date.now()}.png`;
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Attempts to automatically locate and dismiss cookie consent dialogs, GDPR banners,
 * and modal overlays that might obstruct snapshots or clutter extracted content.
 */
export async function dismissCookieBanners(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const candidateSelectors = [
        '#onetrust-accept-btn-handler',
        '.cookie-consent-accept',
        '#cookie-accept',
        '[aria-label*="cookie" i] button',
        '[class*="cookie" i] button',
        '[id*="cookie" i] button',
        'button[data-testid*="cookie" i]',
        'button[id*="accept" i]',
        'button[class*="accept" i]',
      ];

      for (const selector of candidateSelectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el && typeof el.click === 'function' && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }

      // Check buttons for common accept / agreement text
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
      for (const b of buttons) {
        const text = (b.textContent || '').trim().toLowerCase();
        if (/^(accept|accept all|i agree|got it|agree & close|dismiss|close)$/i.test(text)) {
          if ((b as HTMLElement).offsetParent !== null) {
            (b as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Captures a full-page DOM screenshot of the current page and saves it to disk.
 * Automatically scrolls to bottom and back to top first to trigger lazy-loaded SPA content.
 * @returns The file path where the screenshot was saved.
 */
export async function captureScreenshot(
  page: Page,
  url: string,
  outputDir: string,
  naming?: WebsiteNamingInfo
): Promise<string> {
  const info = naming || getWebsiteNaming(url, outputDir);
  await fs.mkdir(info.screenshotsDir, { recursive: true });

  const filePath = path.join(info.screenshotsDir, `${info.baseFilename}.png`);

  // Ensure full-page rendering by scrolling down and back to top (triggers SPA lazy loading & animations)
  try {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        // Find the primary scrollable element (e.g. Angular mat-sidenav-content, React root, or window)
        const maxEl = Array.from(document.querySelectorAll('*')).reduce(
          (a, b) => (a.scrollHeight > b.scrollHeight ? a : b),
          document.documentElement
        );
        const isCustomScroll = maxEl && maxEl.scrollHeight > (document.documentElement?.clientHeight || 0) + 100 && maxEl !== document.documentElement && maxEl !== document.body;

        let totalHeight = 0;
        const distance = 600;
        const timer = setInterval(() => {
          const scrollHeight = isCustomScroll ? maxEl.scrollHeight : (document.body?.scrollHeight || document.documentElement?.scrollHeight || 0);
          if (isCustomScroll) {
            maxEl.scrollBy(0, distance);
          } else {
            window.scrollBy(0, distance);
          }
          totalHeight += distance;
          if (totalHeight >= scrollHeight || totalHeight > 15000) {
            clearInterval(timer);
            if (isCustomScroll) maxEl.scrollTo(0, 0);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 80);
      });
    });
    await page.waitForTimeout(500); // Allow layout animations to settle after scrolling back up

    // Prepare DOM for full-page screenshot: expand fixed/overflowing SPA layout containers so fullPage captures everything
    await page.evaluate(() => {
      const maxScrollH = Math.max(...Array.from(document.querySelectorAll('*')).map(e => e.scrollHeight));
      if (maxScrollH > (document.documentElement?.clientHeight || 0) + 50) {
        document.querySelectorAll('*').forEach(el => {
          // Never expand visually hidden, screen-reader, or CDK message containers
          if (
            el.classList.contains('cdk-visually-hidden') ||
            el.classList.contains('cdk-describedby-message-container') ||
            el.classList.contains('cdk-live-announcer-element') ||
            el.classList.contains('sr-only') ||
            el.classList.contains('visually-hidden') ||
            el.getAttribute('aria-hidden') === 'true' ||
            el.closest('.cdk-visually-hidden') ||
            el.closest('.cdk-describedby-message-container')
          ) {
            return;
          }
          if (el.scrollHeight > el.clientHeight + 20 || el.scrollHeight >= maxScrollH - 50) {
            const htmlEl = el as HTMLElement;
            if (htmlEl.style) {
              const style = window.getComputedStyle(htmlEl);
              if (style.overflow !== 'visible' || style.height !== 'auto' || style.maxHeight !== 'none') {
                htmlEl.style.setProperty('height', 'auto', 'important');
                htmlEl.style.setProperty('max-height', 'none', 'important');
                htmlEl.style.setProperty('overflow', 'visible', 'important');
                htmlEl.style.setProperty('overflow-y', 'visible', 'important');
              }
            }
          }
        });
        if (document.documentElement) {
          document.documentElement.style.setProperty('height', 'auto', 'important');
          document.documentElement.style.setProperty('overflow', 'visible', 'important');
        }
        if (document.body) {
          document.body.style.setProperty('height', 'auto', 'important');
          document.body.style.setProperty('overflow', 'visible', 'important');
        }
      }
    });
    await page.waitForTimeout(300);
  } catch {
    // Ignore evaluation errors if page closed or restricted
  }

  await page.screenshot({
    path: filePath,
    fullPage: true,
    animations: 'disabled',
    type: 'png',
  });

  return filePath;
}
