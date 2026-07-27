import path from 'node:path';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';

/**
 * Sanitizes a URL into a safe filesystem filename.
 */
export function sanitizeUrlToFilename(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    let pathname = parsed.pathname;
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
 * Captures a full-page DOM screenshot of the current page and saves it to disk.
 * @returns The file path where the screenshot was saved.
 */
export async function captureScreenshot(page: Page, url: string, outputDir: string): Promise<string> {
  const screenshotsDir = path.join(outputDir, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });

  const filename = sanitizeUrlToFilename(url);
  const filePath = path.join(screenshotsDir, filename);

  await page.screenshot({
    path: filePath,
    fullPage: true,
    type: 'png',
  });

  return filePath;
}
