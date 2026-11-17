import fs from 'node:fs/promises';
import path from 'node:path';
import type { PageData } from './types';

export interface RagChunk {
  id: string;
  url: string;
  title: string;
  heading?: string;
  content: string;
  charCount: number;
  estimatedTokens: number;
  metadata: Record<string, any>;
}

export interface RagExportOptions {
  /** Target output file path, defaults to './output/rag-chunks.jsonl' */
  outputPath?: string;
  /** Maximum character length per chunk (default 1500 chars ≈ 375 tokens) */
  maxChunkSize?: number;
  /** Overlap character count between consecutive chunks (default 150) */
  overlap?: number;
}

/**
 * Splits extracted Markdown content across crawled pages into semantic chunks
 * suitable for vector database ingestion (Chroma, LanceDB, Pinecone) or LLM RAG pipelines.
 */
export async function exportRagChunks(
  pages: PageData[],
  options: RagExportOptions = {}
): Promise<{ chunksCount: number; outputPath: string; chunks: RagChunk[] }> {
  const outputPath = options.outputPath || './output/rag-chunks.jsonl';
  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const maxChunkSize = options.maxChunkSize || 1500;
  const overlap = options.overlap || 150;

  const chunks: RagChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    if (!page.contentPath) continue;

    let markdown = '';
    try {
      markdown = await fs.readFile(page.contentPath, 'utf-8');
    } catch {
      continue;
    }

    // Split markdown by headings (# , ## , ### )
    const sections = splitByHeadings(markdown);

    for (const section of sections) {
      const sectionChunks = chunkText(section.text, maxChunkSize, overlap);

      for (const piece of sectionChunks) {
        chunkIndex++;
        chunks.push({
          id: `chunk_${chunkIndex}_${Math.abs(hashCode(page.url + '_' + chunkIndex))}`,
          url: page.url,
          title: page.title,
          heading: section.heading,
          content: piece.trim(),
          charCount: piece.length,
          estimatedTokens: Math.ceil(piece.length / 4),
          metadata: {
            ...page.metadata,
            depth: page.depth,
            status: page.status,
          },
        });
      }
    }
  }

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const jsonlContent = chunks.map((c) => JSON.stringify(c)).join('\n') + '\n';
  await fs.writeFile(resolvedPath, jsonlContent, 'utf-8');

  return {
    chunksCount: chunks.length,
    outputPath: resolvedPath,
    chunks,
  };
}

function splitByHeadings(markdown: string): { heading?: string; text: string }[] {
  const lines = markdown.split('\n');
  const sections: { heading?: string; text: string }[] = [];

  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line)) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, text: currentLines.join('\n') });
        currentLines = [];
      }
      currentHeading = line.replace(/^#{1,4}\s+/, '').trim();
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, text: currentLines.join('\n') });
  }

  return sections;
}

function chunkText(text: string, maxChunkSize: number, overlap: number): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;
    if (end < text.length) {
      // Find clean paragraph or newline break before hard boundary
      const nextNewline = text.lastIndexOf('\n', end);
      if (nextNewline > start + maxChunkSize * 0.5) {
        end = nextNewline;
      }
    } else {
      end = text.length;
    }

    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
