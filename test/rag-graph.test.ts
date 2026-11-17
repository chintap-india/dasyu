import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exportRagChunks } from '../src/core/rag';
import { exportSiteGraph } from '../src/core/graph';
import type { PageData } from '../src/core/types';

describe('RAG and Site Graph Exporters', () => {
  const tmpDir = path.join(process.cwd(), 'test-export-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should split markdown into RAG chunks and write jsonl', async () => {
    const mdPath = path.join(tmpDir, 'page.md');
    const mdContent = `# Main Title\n\nThis is the introduction.\n\n## Sub Section\n\nThis is detailed text about feature A.\n\n## Another Section\n\nMore details.`;
    await fs.writeFile(mdPath, mdContent, 'utf-8');

    const pages: PageData[] = [
      {
        url: 'https://example.com/guide',
        depth: 0,
        title: 'Guide',
        status: 200,
        links: [],
        contentPath: mdPath,
      },
    ];

    const jsonlPath = path.join(tmpDir, 'chunks.jsonl');
    const result = await exportRagChunks(pages, { outputPath: jsonlPath, maxChunkSize: 500 });
    expect(result.chunksCount).toBeGreaterThanOrEqual(1);

    const fileContent = await fs.readFile(jsonlPath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    expect(lines.length).toBe(result.chunksCount);

    const firstChunk = JSON.parse(lines[0]);
    expect(firstChunk.url).toBe('https://example.com/guide');
    expect(firstChunk.estimatedTokens).toBeGreaterThan(0);
  });

  it('should build a directed site graph and Mermaid diagram', async () => {
    const pages: PageData[] = [
      {
        url: 'https://example.com/',
        depth: 0,
        title: 'Home',
        status: 200,
        links: ['https://example.com/about', 'https://example.com/contact'],
      },
      {
        url: 'https://example.com/about',
        depth: 1,
        title: 'About Us',
        status: 200,
        links: ['https://example.com/contact'],
      },
      {
        url: 'https://example.com/contact',
        depth: 1,
        title: 'Contact Us',
        status: 200,
        links: [],
      },
    ];

    const result = await exportSiteGraph(pages, tmpDir);
    expect(result.graph.nodes).toHaveLength(3);
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(2);

    const mmdContent = await fs.readFile(result.mermaidPath, 'utf-8');
    expect(mmdContent).toContain('graph TD');
    expect(mmdContent).toContain('-->');
  });
});
