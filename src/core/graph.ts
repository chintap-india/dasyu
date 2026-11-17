import fs from 'node:fs/promises';
import path from 'node:path';
import type { PageData } from './types';

export interface SiteGraphNode {
  id: string;
  url: string;
  title: string;
  depth: number;
  status: number;
  parentUrl?: string;
}

export interface SiteGraphEdge {
  source: string;
  target: string;
  anchorText?: string;
  targetAttr?: string;
}

export interface SiteGraph {
  nodes: SiteGraphNode[];
  edges: SiteGraphEdge[];
}

/**
 * Builds and exports a structured directed link graph and Mermaid diagram of all crawled pages.
 */
export async function exportSiteGraph(
  pages: PageData[],
  outputDir: string
): Promise<{ graphJsonPath: string; mermaidPath: string; graph: SiteGraph }> {
  const urlToId = new Map<string, string>();
  const nodes: SiteGraphNode[] = [];
  const edges: SiteGraphEdge[] = [];
  const visitedEdges = new Set<string>();

  pages.forEach((p, idx) => {
    const id = `node_${idx + 1}`;
    urlToId.set(p.url, id);
    nodes.push({
      id,
      url: p.url,
      title: p.title || p.url,
      depth: p.depth,
      status: p.status,
      parentUrl: p.parentUrl,
    });
  });

  for (const page of pages) {
    const sourceId = urlToId.get(page.url);
    if (!sourceId) continue;

    const linkDetailsMap = new Map<string, { text?: string; target?: string }>();
    if (page.linkDetails) {
      for (const ld of page.linkDetails) {
        if (!linkDetailsMap.has(ld.url)) {
          linkDetailsMap.set(ld.url, { text: ld.text, target: ld.target });
        }
      }
    }

    for (const link of page.links) {
      const targetId = urlToId.get(link);
      if (targetId && sourceId !== targetId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          const meta = linkDetailsMap.get(link);
          edges.push({
            source: sourceId,
            target: targetId,
            anchorText: meta?.text || undefined,
            targetAttr: meta?.target || undefined,
          });
        }
      }
    }
  }

  const graph: SiteGraph = { nodes, edges };

  // Generate Mermaid diagram representation
  let mermaid = 'graph TD\n';
  nodes.forEach((n) => {
    const safeTitle = (n.title || n.url).replace(/["()[\],]/g, ' ').slice(0, 35);
    mermaid += `  ${n.id}["${safeTitle} (${n.depth})"]\n`;
  });
  edges.forEach((e) => {
    const label = e.anchorText ? `|"${e.anchorText.replace(/["()[\],]/g, ' ').slice(0, 20)}"|` : '';
    mermaid += `  ${e.source} -->${label} ${e.target}\n`;
  });

  const graphJsonPath = path.join(outputDir, 'site-graph.json');
  const mermaidPath = path.join(outputDir, 'site-graph.mmd');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(graphJsonPath, JSON.stringify(graph, null, 2), 'utf-8');
  await fs.writeFile(mermaidPath, mermaid, 'utf-8');

  return { graphJsonPath, mermaidPath, graph };
}
