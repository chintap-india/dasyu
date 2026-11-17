import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractPageContent } from '../src/extractors/content';

describe('extractPageContent', () => {
  const tmpDir = path.join(process.cwd(), 'test-content-tmp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should extract metadata, convert HTML to clean markdown, and save both md and json', async () => {
    const mockPage: any = {
      evaluate: async (fn: any) => {
        return {
          html: '<h1>Welcome to Dasyu</h1><p>The <strong>Outlaw</strong> of the Web.</p><ul><li>Feature 1</li><li>Feature 2</li></ul>',
          metadata: {
            title: 'Dasyu Home',
            description: 'Fast web crawling and markdown extraction.',
            keywords: 'playwright, crawler, markdown',
            ogTitle: 'Dasyu | Web Outlaw',
            ogImage: 'https://example.com/og.jpg',
            canonical: 'https://example.com/',
            headings: [{ level: 'h1', text: 'Welcome to Dasyu' }],
            extractedAt: '2026-11-17T12:00:00.000Z',
          },
        };
      },
    };

    const result = await extractPageContent(mockPage, 'https://example.com/', tmpDir);

    expect(result.contentPath).toBeDefined();
    expect(result.metadata.title).toBe('Dasyu Home');
    expect(result.metadata.description).toBe('Fast web crawling and markdown extraction.');
    expect(result.metadata.headings).toHaveLength(1);

    // Markdown checks
    expect(result.markdown).toContain('# Dasyu Home');
    expect(result.markdown).toContain('> **URL**: [https://example.com/](https://example.com/)');
    expect(result.markdown).toContain('> **Description**: Fast web crawling and markdown extraction.');
    expect(result.markdown).toContain('The **Outlaw** of the Web.');
    expect(result.markdown).toContain('Feature 1');
    expect(result.markdown).toContain('Feature 2');

    // Verify files on disk
    const diskMd = await fs.readFile(result.contentPath, 'utf-8');
    expect(diskMd).toBe(result.markdown);

    const jsonPath = result.contentPath.replace(/\.md$/, '.json');
    const diskJson = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    expect(diskJson.url).toBe('https://example.com/');
    expect(diskJson.metadata.title).toBe('Dasyu Home');
  });

  it('should handle pages without metadata or descriptions gracefully', async () => {
    const mockPage: any = {
      evaluate: async () => ({
        html: '<p>Plain content without headings or meta tags.</p>',
        metadata: {
          title: '',
          description: '',
          headings: [],
          extractedAt: '2026-11-17T12:00:00.000Z',
        },
      }),
    };

    const result = await extractPageContent(mockPage, 'https://example.com/plain', tmpDir);

    expect(result.markdown).toContain('# https://example.com/plain');
    expect(result.markdown).not.toContain('> **Description**:');
    expect(result.markdown).toContain('Plain content without headings or meta tags.');
  });
});
