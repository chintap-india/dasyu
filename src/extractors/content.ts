import path from 'node:path';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import TurndownService from 'turndown';
import { getWebsiteNaming, type WebsiteNamingInfo } from './screenshot';

export interface ExtractedContentResult {
  contentPath: string;
  metadata: Record<string, any>;
  markdown: string;
}

/**
 * Extracts page metadata, headings, and converts HTML DOM content into clean Markdown.
 */
export async function extractPageContent(
  page: Page,
  url: string,
  outputDir: string,
  naming?: WebsiteNamingInfo
): Promise<ExtractedContentResult> {
  const info = naming || getWebsiteNaming(url, outputDir);
  const contentDir = info.contentDir;
  await fs.mkdir(contentDir, { recursive: true });

  // 1. Extract metadata and clean DOM snapshot via browser evaluation
  const { html, metadata } = await page.evaluate(() => {
    const getMeta = (name: string) =>
      document.querySelector(`meta[name="${name}"], meta[property="${name}"], meta[name="twitter:${name}"]`)?.getAttribute('content') || '';

    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
      level: h.tagName.toLowerCase(),
      text: (h.textContent || '').trim(),
    }));

    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => {
        const el = a as HTMLAnchorElement;
        return {
          href: el.href,
          rawHref: el.getAttribute('href') || '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' '),
          target: el.getAttribute('target') || undefined,
          rel: el.getAttribute('rel') || undefined,
        };
      })
      .filter((l) => Boolean(l.href) && !l.href.startsWith('javascript:'));

    // Clone body and remove noisy tags for clean text extraction
    const clone = document.body ? (document.body.cloneNode(true) as HTMLElement) : document.documentElement;
    const noisyTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas'];
    noisyTags.forEach((tag) => {
      const elements = clone.querySelectorAll(tag);
      elements.forEach((el) => el.remove());
    });

    return {
      html: clone.innerHTML || '',
      metadata: {
        title: document.title || '',
        description: getMeta('description') || getMeta('og:description'),
        keywords: getMeta('keywords'),
        ogTitle: getMeta('og:title'),
        ogImage: getMeta('og:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        headings,
        links,
        extractedAt: new Date().toISOString(),
      },
    };
  });

  // 2. Convert clean HTML to Markdown using TurndownService
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    hr: '---',
  });
  turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg'] as any);
  
  const rawMarkdown = turndownService.turndown(html);

  // 3. Format final markdown file with frontmatter/header
  const formattedMarkdown = `# ${metadata.title || url}\n\n` +
    `> **URL**: [${url}](${url})\n` +
    `> **Extracted At**: ${metadata.extractedAt}\n` +
    (metadata.description ? `> **Description**: ${metadata.description}\n` : '') +
    `\n---\n\n` +
    rawMarkdown;

  // 4. Save Markdown and JSON report to disk
  const mdPath = path.join(contentDir, `${info.baseFilename}.md`);
  const jsonPath = path.join(contentDir, `${info.baseFilename}.json`);

  await Promise.all([
    fs.writeFile(mdPath, formattedMarkdown, 'utf-8'),
    fs.writeFile(jsonPath, JSON.stringify({ url, metadata, markdown: formattedMarkdown }, null, 2), 'utf-8'),
  ]);

  return {
    contentPath: mdPath,
    metadata,
    markdown: formattedMarkdown,
  };
}
