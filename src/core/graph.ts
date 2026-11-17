import fs from 'node:fs/promises';
import path from 'node:path';
import type { PageData } from './types';

export interface SiteGraphNode {
  id: string;
  url: string;
  title: string;
  depth: number;
  status: number;
}

export interface SiteGraphEdge {
  source: string;
  target: string;
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
    });
  });

  for (const page of pages) {
    const sourceId = urlToId.get(page.url);
    if (!sourceId) continue;

    for (const link of page.links) {
      const targetId = urlToId.get(link);
      if (targetId && sourceId !== targetId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
          edges.push({ source: sourceId, target: targetId });
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
    mermaid += `  ${e.source} --> ${e.target}\n`;
  });

  const graphJsonPath = path.join(outputDir, 'site-graph.json');
  const mermaidPath = path.join(outputDir, 'site-graph.mmd');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(graphJsonPath, JSON.stringify(graph, null, 2), 'utf-8');
  await fs.writeFile(mermaidPath, mermaid, 'utf-8');

  return { graphJsonPath, mermaidPath, graph };
}
