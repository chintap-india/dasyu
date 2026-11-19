import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import type { CrawlResult, PageData } from './types';

/**
 * Cross-platform helper to open a file or URL in the default browser/system viewer.
 */
export function openTarget(target: string): Promise<void> {
  return new Promise((resolve) => {
    let cmd = '';
    if (process.platform === 'darwin') {
      cmd = `open "${target}"`;
    } else if (process.platform === 'win32') {
      cmd = `start "" "${target}"`;
    } else {
      cmd = `xdg-open "${target}"`;
    }
    exec(cmd, () => resolve());
  });
}

export interface ReportOptions {
  outputDir: string;
  reportFilename?: string;
  siteGraphMermaidPath?: string;
  ragChunksCount?: number;
  zipFileName?: string;
}

/**
 * Escapes HTML characters for safe template rendering.
 */
function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates an interactive, standalone HTML visual report for the crawl results.
 */
export async function generateHtmlReport(
  result: CrawlResult,
  options: ReportOptions
): Promise<string> {
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  const reportFilename = options.reportFilename || 'report.html';
  const reportPath = path.join(outputDir, reportFilename);

  const startUrl = result.startUrl;
  let hostname = startUrl;
  try {
    hostname = new URL(startUrl).hostname;
  } catch {
    // keep as is
  }

  // Calculate aggregates
  let totalViolations = 0;
  let avgA11yScore = 0;
  let pagesWithA11y = 0;
  let totalSeoWarnings = 0;

  for (const page of result.pages) {
    if (page.metadata?.accessibility?.score !== undefined) {
      avgA11yScore += page.metadata.accessibility.score;
      totalViolations += page.metadata.accessibility.violationsCount || 0;
      pagesWithA11y++;
    }
    if (page.metadata?.seo?.warnings?.length) {
      totalSeoWarnings += page.metadata.seo.warnings.length;
    }
  }

  const finalAvgA11y = pagesWithA11y > 0 ? Math.round(avgA11yScore / pagesWithA11y) : null;

  // Prepare page cards data
  const clientGraphData = await Promise.all(
    result.pages.map(async (page, idx) => {
      let relScreenshot = '';
      if (page.screenshotPath) {
        relScreenshot = path.relative(outputDir, path.resolve(process.cwd(), page.screenshotPath));
      }
      let rawSnippet = '';
      if (page.contentPath) {
        try {
          const rawMd = await fs.readFile(path.resolve(process.cwd(), page.contentPath), 'utf-8');
          rawSnippet = rawMd.slice(0, 1500) + (rawMd.length > 1500 ? '\n\n... (truncated for preview)' : '');
        } catch {}
      }
      return {
        index: idx,
        id: `node_${idx + 1}`,
        url: escapeHtml(page.url),
        title: escapeHtml(page.title || page.url),
        rawUrl: page.url,
        depth: page.depth || 0,
        status: page.status || 200,
        parentUrl: page.parentUrl || '',
        screenshotRel: relScreenshot,
        markdownSnippet: rawSnippet,
        hasMarkdown: Boolean(page.contentPath),
      };
    })
  );

  // Layout nodes depth-wise and breadth-wise for Constellation Topology
  const maxDepth = Math.max(...result.pages.map((p) => p.depth || 0), 0);
  const depthTiers = new Map<number, number[]>();
  result.pages.forEach((p, idx) => {
    const d = p.depth || 0;
    if (!depthTiers.has(d)) depthTiers.set(d, []);
    depthTiers.get(d)!.push(idx);
  });

  const maxNodesInTier = Math.max(
    ...Array.from(depthTiers.values()).map((arr) => arr.length),
    1
  );

  const svgWidth = Math.max(1000, (maxDepth + 1) * 320 + 80);
  const svgHeight = Math.max(460, maxNodesInTier * 86 + 100);

  const nodePositions: { x: number; y: number }[] = [];
  const urlToIndex = new Map<string, number>();

  result.pages.forEach((p, idx) => {
    urlToIndex.set(p.url, idx);
  });

  for (let d = 0; d <= maxDepth; d++) {
    const tier = depthTiers.get(d) || [];
    const count = tier.length;
    const tierX =
      maxDepth === 0 ? svgWidth / 2 : 100 + (d * (svgWidth - 200)) / maxDepth;

    tier.forEach((pageIdx, tierPos) => {
      const tierY = 70 + ((tierPos + 0.5) * (svgHeight - 140)) / count;
      nodePositions[pageIdx] = { x: Math.round(tierX), y: Math.round(tierY) };
    });
  }

  interface SvgEdge {
    sourceIdx: number;
    targetIdx: number;
    dPath: string;
  }
  const svgEdges: SvgEdge[] = [];
  const edgeSet = new Set<string>();

  result.pages.forEach((p, childIdx) => {
    if ((p.depth || 0) > 0) {
      let parentIdx: number | undefined;
      if (p.parentUrl && urlToIndex.has(p.parentUrl)) {
        parentIdx = urlToIndex.get(p.parentUrl);
      } else {
        const prevTier = depthTiers.get((p.depth || 1) - 1);
        if (prevTier && prevTier.length > 0) {
          parentIdx = prevTier[0];
        } else {
          parentIdx = 0;
        }
      }

      if (parentIdx !== undefined && parentIdx !== childIdx) {
        const edgeKey = `${parentIdx}->${childIdx}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          const pPos = nodePositions[parentIdx] || { x: 100, y: 70 };
          const cPos = nodePositions[childIdx] || { x: 400, y: 70 };
          const midX = Math.round((pPos.x + cPos.x) / 2);
          const dPath = `M ${pPos.x} ${pPos.y} C ${midX} ${pPos.y}, ${midX} ${cPos.y}, ${cPos.x} ${cPos.y}`;
          svgEdges.push({ sourceIdx: parentIdx, targetIdx: childIdx, dPath });
        }
      }
    }
  });

  const tierGuidesSvg: string[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const tierX =
      maxDepth === 0 ? svgWidth / 2 : 100 + (d * (svgWidth - 200)) / maxDepth;
    const label =
      d === 0
        ? 'DEPTH 0 · SEED ENTRY'
        : `DEPTH ${d} · ${d === 1 ? 'PRIMARY DISCOVERY' : 'DEEP WORKSPACE'}`;
    tierGuidesSvg.push(`
      <line x1="${tierX}" y1="36" x2="${tierX}" y2="${svgHeight - 36}" stroke="#222938" stroke-dasharray="4 6" stroke-width="1.2" />
      <text x="${tierX}" y="28" text-anchor="middle" fill="#6B7280" font-family="'Space Grotesk', monospace" font-size="10.5" font-weight="600" letter-spacing="1">${label}</text>
    `);
  }

  const svgNodes = result.pages.map((p, idx) => {
    const pos = nodePositions[idx] || { x: 100, y: 70 };
    const isRoot = (p.depth || 0) === 0;
    const radius = isRoot ? 14 : 10;
    const safeTitle = escapeHtml(p.title || p.url);
    const safeUrl = escapeHtml(p.url);
    const shortTitle = escapeHtml(
      (p.title || p.url).slice(0, 26) +
        ((p.title || p.url).length > 26 ? '…' : '')
    );
    let pathname = '/';
    try {
      pathname = new URL(p.url).pathname;
    } catch {}
    const shortUrl = escapeHtml(pathname);
    const statusColor =
      (p.status || 200) < 300
        ? '#10B981'
        : (p.status || 200) < 400
        ? '#F59E0B'
        : '#EF4444';
    const modalsCount = (p.metadata?.modals as any[])?.length || 0;

    return `
      <g class="graph-node" id="gnode_${idx}" data-index="${idx}" onclick="selectGraphNode(${idx})" transform="translate(${pos.x}, ${pos.y})">
        <circle class="node-glow" r="${radius + 7}" fill="${isRoot ? 'rgba(234, 28, 36, 0.2)' : 'rgba(96, 165, 250, 0.15)'}" />
        <circle class="node-base" r="${radius}" fill="#11141D" stroke="${isRoot ? '#EA1C24' : '#344052'}" stroke-width="${isRoot ? 2.5 : 2}" />
        <circle cx="${radius - 3}" cy="${-(radius - 3)}" r="3.5" fill="${statusColor}" />
        ${modalsCount > 0 ? `<polygon points="${-radius - 2},${-radius} ${-radius + 4},${-radius - 6} ${-radius + 10},${-radius} ${-radius + 4},${-radius + 6}" fill="#F87171"><title>${modalsCount} Modals explored</title></polygon>` : ''}
        <text x="${isRoot ? -20 : 18}" y="-4" text-anchor="${isRoot ? 'end' : 'start'}" fill="#FFFFFF" font-size="12" font-weight="700">${shortTitle}</text>
        <text x="${isRoot ? -20 : 18}" y="12" text-anchor="${isRoot ? 'end' : 'start'}" fill="#9AA5B5" font-family="'Space Grotesk', monospace" font-size="10.5">${shortUrl}</text>
        <title>${safeTitle} (${safeUrl}) - Status: ${p.status}, Depth: ${p.depth}</title>
      </g>
    `;
  });

  const pageCardsHtml = await Promise.all(
    result.pages.map(async (page, index) => {
      // Screenshot relative path from report.html
      let relScreenshot = '';
      if (page.screenshotPath) {
        relScreenshot = path.relative(outputDir, path.resolve(process.cwd(), page.screenshotPath));
      }

      // Markdown content snippet
      let markdownSnippet = '';
      if (page.contentPath) {
        try {
          const rawMd = await fs.readFile(path.resolve(process.cwd(), page.contentPath), 'utf-8');
          // take first 1000 chars for preview
          markdownSnippet = rawMd.slice(0, 1500) + (rawMd.length > 1500 ? '\n\n... (truncated for preview)' : '');
        } catch {
          markdownSnippet = 'Content file not found or inaccessible.';
        }
      }

      // Badges
      const statusClass = page.status === 200 ? 'status-200' : 'status-warn';
      const depthBadge = `<span class="badge depth-badge">Depth ${page.depth}</span>`;
      const statusBadge = `<span class="badge ${statusClass}">${page.status || 'ERR'}</span>`;

      // A11y details
      let a11yHtml = '';
      if (page.metadata?.accessibility) {
        const a11y = page.metadata.accessibility;
        const scoreClass = a11y.score >= 90 ? 'score-good' : a11y.score >= 70 ? 'score-med' : 'score-bad';
        a11yHtml = `
          <div class="meta-pill ${scoreClass}">
            <span>♿ A11y: <strong>${a11y.score}/100</strong> (${a11y.violationsCount} violations)</span>
          </div>
        `;
      }

      // SEO details
      let seoHtml = '';
      if (page.metadata?.seo) {
        const seo = page.metadata.seo;
        const warnCount = seo.warnings?.length || 0;
        const seoClass = warnCount === 0 ? 'score-good' : warnCount <= 2 ? 'score-med' : 'score-bad';
        seoHtml = `
          <div class="meta-pill ${seoClass}">
            <span>🔍 SEO: <strong>${warnCount} warnings</strong> (H1: ${seo.h1Count})</span>
          </div>
        `;
      }

      let fwBadge = '';
      if (page.metadata?.uiFramework?.framework && page.metadata.uiFramework.framework !== 'Static / Vanilla') {
        const fw = page.metadata.uiFramework;
        const fwTitle = `${fw.framework}${fw.version ? ' v' + fw.version : ''} (${fw.componentLibraries?.join(', ') || 'SPA'})`;
        fwBadge = `<span class="badge fw-badge" title="${escapeHtml(fwTitle)}">⚡ ${escapeHtml(fw.framework)}</span>`;
      }

      let modalsHtml = '';
      if (Array.isArray(page.metadata?.modals) && page.metadata.modals.length > 0) {
        const modals = page.metadata.modals;
        modalsHtml = `
          <div class="modal-box">
            <div class="modal-box-header">
              <span>🗂️ Interactive Modals (${modals.length})</span>
            </div>
            ${modals.map((m: any) => {
              const relModalShot = m.screenshotPath ? path.relative(outputDir, m.screenshotPath) : '';
              const mTitle = m.modalTitle || m.name || m.title || 'Modal';
              const mType = m.modalType || m.status || 'dialog';
              return `
                <div class="modal-pill">
                  <span><strong>${escapeHtml(mTitle)}</strong> (${escapeHtml(mType)})</span>
                  ${relModalShot ? `<a href="${relModalShot}" target="_blank" onclick="event.stopPropagation(); openLightbox('${relModalShot}', '${escapeHtml(mTitle)}')">View ↗</a>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      const escapedTitle = escapeHtml(page.title || 'Untitled Page');
      const escapedUrl = escapeHtml(page.url);
      const escapedSnippet = escapeHtml(markdownSnippet);

      return `
        <div class="page-card" id="card_${index}" data-url="${escapedUrl}" data-title="${escapedTitle}" data-status="${page.status}">
          <div class="card-header">
            <div class="card-badges">
              ${statusBadge}
              ${depthBadge}
              ${fwBadge}
            </div>
            <a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="page-url" title="${escapedUrl}">
              ${escapedUrl} ↗
            </a>
          </div>

          <h3 class="page-title" title="${escapedTitle}">${escapedTitle}</h3>

          <div class="meta-row">
            ${a11yHtml}
            ${seoHtml}
            <div class="meta-pill">
              <span>🔗 ${page.links?.length || 0} links</span>
            </div>
          </div>

          <div class="screenshot-frame">
            ${
              relScreenshot
                ? `<img src="${relScreenshot}" alt="Screenshot of ${escapedTitle}" loading="lazy" onclick="openLightbox('${relScreenshot}', '${escapedTitle}')" />
                   <div class="screenshot-overlay" onclick="openLightbox('${relScreenshot}', '${escapedTitle}')">
                     <span>🔍 Click to expand full-page screenshot</span>
                   </div>`
                : `<div class="no-screenshot">No screenshot captured</div>`
            }
          </div>

          ${modalsHtml}

          <div class="card-footer">
            ${
              relScreenshot
                ? `<a href="${relScreenshot}" target="_blank" class="action-btn">Open Image ↗</a>`
                : ''
            }
            ${
              page.contentPath
                ? `<button class="action-btn primary" onclick="showMarkdownModal('${escapedTitle}', \`${escapedSnippet}\`)">View Markdown</button>`
                : ''
            }
            <button class="action-btn" onclick="locateInGraph(${index})" title="Locate page in Constellation Graph">🪐 Graph</button>
          </div>
        </div>
      `;
    })
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Automated crawl and visual audit report generated by Dasyu (@chintap/dasyu) — The Outlaw of the Web.">
  <meta name="generator" content="Dasyu @chintap/dasyu">
  <meta property="og:title" content="Dasyu Crawl Report | ${escapeHtml(hostname)}">
  <meta property="og:description" content="Automated web crawl, visual DOM snapshots, and markdown extracted with Dasyu.">
  <meta property="og:image" content="https://chintap.com/images/dasyu-og.jpg">
  <meta property="og:url" content="https://chintap.com/dasyu">
  <title>Dasyu (दस्यु) — The Outlaw of the Web — Dasyu Crawl Report | ${escapeHtml(hostname)}</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Dasyu",
    "alternateName": "दस्यु",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "All",
    "url": "https://chintap.com/dasyu",
    "sameAs": [
      "https://www.npmjs.com/package/@chintap/dasyu",
      "https://github.com/chintap-india/dasyu"
    ]
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@700;800;900&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B0D12;
      --card-bg: rgba(23, 27, 37, 0.85);
      --card-border: #344052;
      --text: #F3F4F6;
      --text-muted: #9AA5B5;
      --accent-red: #EA1C24;
      --accent-gradient: linear-gradient(90deg, #E62938 0%, #EA1C24 60%, #ff4d5a 100%);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      padding-bottom: 60px;
    }

    /* Ambient top accent */
    .top-accent {
      width: 100%;
      height: 5px;
      background: var(--accent-gradient);
    }

    header {
      padding: 32px 48px 24px 48px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
      background: rgba(18, 22, 31, 0.8);
      backdrop-filter: blur(12px);
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .emblem-svg {
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }

    .brand-title {
      font-family: 'Poppins', sans-serif;
      font-size: 28px;
      font-weight: 900;
      color: #FFFFFF;
      line-height: 1;
      display: inline-flex;
      align-items: flex-start;
      letter-spacing: -0.5px;
    }
    .brand-title .devanagari {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 800;
      color: var(--accent-red);
      line-height: 1;
      margin-left: 3px;
      margin-top: -2px;
      letter-spacing: 0.5px;
    }
    .brand-title .red { color: var(--accent-red); }
    .brand-subtitle {
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: normal;
      margin-top: 4px;
    }

    .target-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #171B25;
      border: 1px solid var(--card-border);
      padding: 10px 18px;
      border-radius: 9999px;
      font-family: 'Space Grotesk', monospace;
      font-size: 14px;
      color: var(--text);
    }
    .target-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-red);
      box-shadow: 0 0 10px var(--accent-red);
    }

    /* KPI Stats Bar */
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      padding: 24px 48px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .kpi-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: #FFFFFF;
    }
    .kpi-value.good { color: #10B981; }
    .kpi-value.warn { color: #F59E0B; }

    /* Constellation Network Graph Section */
    .constellation-section {
      padding: 0 48px 32px 48px;
    }
    .constellation-card {
      background: rgba(18, 22, 31, 0.95);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    .constellation-header {
      padding: 20px 28px 16px 28px;
      border-bottom: 1px solid rgba(52, 64, 82, 0.6);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      background: rgba(23, 27, 37, 0.5);
    }
    .constellation-title-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .constellation-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .constellation-subtitle {
      font-size: 13px;
      color: var(--text-muted);
    }
    .view-toggles {
      display: flex;
      gap: 6px;
      background: #11141D;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--card-border);
    }
    .view-btn {
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 7px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .view-btn:hover { color: #FFF; }
    .view-btn.active {
      background: rgba(234, 28, 36, 0.2);
      color: #FF5A64;
      border: 1px solid rgba(234, 28, 36, 0.4);
    }

    .graph-viewport {
      width: 100%;
      min-height: 420px;
      overflow-x: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background: radial-gradient(circle at 50% 50%, rgba(234, 28, 36, 0.04) 0%, rgba(11, 13, 18, 0.8) 100%);
    }

    .graph-svg {
      width: 100%;
      height: 100%;
      display: block;
      min-width: 900px;
    }
    .graph-edge {
      fill: none;
      stroke: rgba(154, 165, 181, 0.24);
      stroke-width: 1.5;
      transition: stroke 0.25s, stroke-width 0.25s;
    }
    .graph-edge.active {
      stroke: var(--accent-red);
      stroke-width: 2.75;
      stroke-opacity: 0.95;
    }
    .graph-node {
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
    }
    .graph-node:hover circle.node-base,
    .graph-node.selected circle.node-base {
      stroke: var(--accent-red) !important;
      stroke-width: 2.5 !important;
    }
    .graph-node text {
      user-select: none;
      transition: fill 0.2s;
    }

    @keyframes beacon-ping {
      0% { r: 6px; opacity: 0.95; }
      50% { r: 20px; opacity: 0.35; }
      100% { r: 34px; opacity: 0; }
    }
    .beacon-pulse-ring {
      animation: beacon-ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite;
      pointer-events: none;
    }

    .graph-inspector-bar {
      padding: 14px 28px;
      background: rgba(17, 20, 29, 0.95);
      border-top: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .inspector-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .inspector-beacon-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent-red);
      box-shadow: 0 0 12px var(--accent-red);
      display: inline-block;
    }
    .inspector-title {
      font-size: 14px;
      font-weight: 700;
      color: #FFFFFF;
    }
    .inspector-url {
      font-family: 'Space Grotesk', monospace;
      font-size: 12px;
      color: var(--text-muted);
    }
    .inspector-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .page-card.card-highlight {
      border-color: var(--accent-red) !important;
      box-shadow: 0 0 28px rgba(234, 28, 36, 0.45) !important;
      transform: translateY(-4px);
    }

    /* Controls Bar */
    .controls-bar {
      padding: 0 48px 24px 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-input {
      background: #171B25;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      min-width: 320px;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input:focus {
      border-color: var(--accent-red);
    }

    /* Gallery Grid */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 28px;
      padding: 0 48px;
    }

    .page-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    }
    .page-card:hover {
      transform: translateY(-4px);
      border-color: rgba(234, 28, 36, 0.6);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .card-badges {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .badge {
      font-size: 11px;
      font-weight: 800;
      padding: 4px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-200 { background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-warn { background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); }
    .depth-badge { background: #222938; color: var(--text-muted); border: 1px solid var(--card-border); }
    .fw-badge { background: rgba(59, 130, 246, 0.15); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3); }

    .modal-box {
      background: #11141D;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .modal-box-header {
      font-weight: 700;
      color: #F87171;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .modal-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: #171B25;
      padding: 6px 10px;
      border-radius: 6px;
      color: #D1D5DB;
      font-size: 12px;
    }
    .modal-pill a {
      color: #60A5FA;
      text-decoration: underline;
      font-size: 11px;
    }

    .page-url {
      font-family: 'Space Grotesk', monospace;
      font-size: 12px;
      color: var(--text-muted);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
    .page-url:hover { color: var(--text); text-decoration: underline; }

    .page-title {
      font-size: 17px;
      font-weight: 700;
      color: #FFFFFF;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .meta-pill {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      background: #171B25;
      border: 1px solid var(--card-border);
      color: var(--text-muted);
    }
    .score-good { color: #10B981; border-color: rgba(16, 185, 129, 0.4); }
    .score-med { color: #F59E0B; border-color: rgba(245, 158, 11, 0.4); }
    .score-bad { color: #EF4444; border-color: rgba(239, 68, 68, 0.4); }

    .screenshot-frame {
      position: relative;
      width: 100%;
      height: 240px;
      background: #0E121B;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
    }
    .screenshot-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
      transition: transform 0.3s;
    }
    .screenshot-frame:hover img {
      transform: scale(1.03);
    }
    .screenshot-overlay {
      position: absolute;
      inset: 0;
      background: rgba(11, 13, 18, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
      font-size: 13px;
      font-weight: 600;
      color: #FFFFFF;
    }
    .screenshot-frame:hover .screenshot-overlay {
      opacity: 1;
    }

    .card-footer {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }
    .action-btn {
      flex: 1;
      text-align: center;
      padding: 9px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      background: #222938;
      border: 1px solid var(--card-border);
      color: var(--text);
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }
    .action-btn:hover {
      background: #2C3549;
      border-color: var(--text-muted);
    }
    .action-btn.primary {
      background: rgba(234, 28, 36, 0.18);
      border-color: rgba(234, 28, 36, 0.5);
      color: #ff5a64;
    }
    .action-btn.primary:hover {
      background: rgba(234, 28, 36, 0.3);
      border-color: var(--accent-red);
    }

    /* Modal / Lightbox */
    .lightbox-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.88);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }
    .lightbox-modal.active { display: flex; }
    .lightbox-content {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      background: #12151D;
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: auto;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
    }
    .lightbox-content img {
      display: block;
      width: 100%;
      height: auto;
    }
    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid var(--card-border);
      color: #FFF;
      font-size: 20px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Markdown Drawer / Modal */
    .md-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 101;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 30px;
    }
    .md-modal.active { display: flex; }
    .md-card {
      width: 800px;
      max-width: 95vw;
      max-height: 85vh;
      background: #121620;
      border: 1px solid var(--card-border);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .md-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .md-body {
      padding: 24px;
      overflow-y: auto;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #D1D5DB;
      white-space: pre-wrap;
    }

    footer {
      margin-top: 60px;
      border-top: 1px solid var(--card-border);
      padding: 32px 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--text-muted);
      font-size: 14px;
    }
    .footer-brand {
      font-family: 'Poppins', sans-serif;
      font-weight: 900;
      font-size: 22px;
      color: #FFFFFF;
    }
    .footer-brand .red { color: var(--accent-red); }
  </style>
</head>
<body>
  <div class="top-accent"></div>

  <header>
    <div class="brand-group">
      <svg class="emblem-svg" viewBox="0 0 1000 1000" fill="none">
        <polygon points="80,80 360,80 80,220" fill="#FFFFFF" />
        <polygon points="80,220 360,80 760,80 960,280 80,520" fill="#F00000" />
        <polygon points="80,520 960,280 960,720 760,920 80,920" fill="#FFFFFF" />
      </svg>
      <div>
        <div class="brand-title">dasyu<span class="devanagari">दस्यु</span></div>
        <div class="brand-subtitle"><span class="red">The Outlaw of the Web.</span> Roam links, capture snapshots, extract treasure. • Automated Crawl &amp; Audit Report</div>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 10px;">
      ${
        options?.zipFileName
          ? `<a href="./${escapeHtml(options.zipFileName)}" download class="target-pill" style="text-decoration: none; color: #FFF; background: rgba(234, 28, 36, 0.15); border-color: rgba(234, 28, 36, 0.4); font-weight: 500; cursor: pointer;">
        <span>📦 Download ZIP</span>
      </a>`
          : ''
      }
      <div class="target-pill">
        <span class="target-dot"></span>
        <span>${escapeHtml(startUrl)}</span>
      </div>
    </div>
  </header>

  <div class="stats-bar">
    <div class="kpi-card">
      <span class="kpi-label">Pages Crawled</span>
      <span class="kpi-value">${result.pages.length}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Total Duration</span>
      <span class="kpi-value">${(result.totalDurationMs / 1000).toFixed(2)}s</span>
    </div>
    ${
      finalAvgA11y !== null
        ? `<div class="kpi-card">
             <span class="kpi-label">Avg A11y Score</span>
             <span class="kpi-value ${finalAvgA11y >= 85 ? 'good' : 'warn'}">${finalAvgA11y}/100</span>
           </div>`
        : ''
    }
    ${
      totalSeoWarnings > 0
        ? `<div class="kpi-card">
             <span class="kpi-label">SEO Warnings</span>
             <span class="kpi-value warn">${totalSeoWarnings}</span>
           </div>`
        : ''
    }
    ${
      options.ragChunksCount !== undefined
        ? `<div class="kpi-card">
             <span class="kpi-label">RAG Chunks</span>
             <span class="kpi-value">${options.ragChunksCount}</span>
           </div>`
        : ''
    }
  </div>

  <section class="constellation-section" id="constellationSection">
    <div class="constellation-card">
      <div class="constellation-header">
        <div class="constellation-title-group">
          <div class="constellation-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA1C24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Site Constellation &amp; Relational Topology</span>
          </div>
          <div class="constellation-subtitle">Interactive depth &amp; breadth graph of crawled pages with pulsing &quot;You Are Here&quot; beacon.</div>
        </div>
        <div class="view-toggles">
          <button class="view-btn active" id="btnShowBoth" onclick="setViewMode('both')">Split View</button>
          <button class="view-btn" id="btnGraphOnly" onclick="setViewMode('graph')">Graph Only</button>
          <button class="view-btn" id="btnCardsOnly" onclick="setViewMode('cards')">Cards Only</button>
        </div>
      </div>

      <div class="graph-viewport" id="graphViewport">
        <svg class="graph-svg" id="constellationSvg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
          <!-- Background Grid & Tier Guides -->
          <g class="tier-guides">
            ${tierGuidesSvg.join('\n')}
          </g>

          <!-- Edges (Cubic Beziers) -->
          <g class="graph-edges">
            ${svgEdges
              .map(
                (e) => `
              <path class="graph-edge" id="edge_${e.sourceIdx}_${e.targetIdx}" data-source="${e.sourceIdx}" data-target="${e.targetIdx}" d="${e.dPath}" />
            `
              )
              .join('\n')}
          </g>

          <!-- Pulsing Beacon ('You Are Here') -->
          <g id="youAreHereBeacon" transform="translate(${nodePositions[0]?.x || 100}, ${nodePositions[0]?.y || 70})" style="pointer-events: none;">
            <circle class="beacon-pulse-ring" cx="0" cy="0" r="16" fill="rgba(234, 28, 36, 0.45)" stroke="#EA1C24" stroke-width="1.5" />
            <circle cx="0" cy="0" r="5" fill="#FFFFFF" stroke="#EA1C24" stroke-width="2" />
          </g>

          <!-- Nodes -->
          <g class="graph-nodes">
            ${svgNodes.join('\n')}
          </g>
        </svg>
      </div>

      <!-- Inspector Bar at bottom of Graph -->
      <div class="graph-inspector-bar" id="graphInspectorBar">
        <div class="inspector-left">
          <span class="inspector-beacon-dot"></span>
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #EA1C24; letter-spacing: 0.08em;">Active Node:</span>
          <span class="inspector-title" id="inspectorTitle">${escapeHtml(result.pages[0]?.title || result.pages[0]?.url || 'Seed')}</span>
          <span class="inspector-url" id="inspectorUrl">${escapeHtml(result.pages[0]?.url || '')}</span>
          <span class="status-badge status-200" id="inspectorBadge">Depth ${result.pages[0]?.depth || 0}</span>
        </div>
        <div class="inspector-actions">
          <button class="action-btn" id="inspectorJumpBtn" onclick="scrollToCard(0)">🎯 Jump to Card</button>
          <button class="action-btn" id="inspectorShotBtn" onclick="openNodeLightbox(0)">🖼️ Screenshot</button>
          <button class="action-btn" id="inspectorMdBtn" onclick="openNodeMarkdown(0)" style="${result.pages[0]?.contentPath ? '' : 'display: none;'}">📄 Markdown</button>
          <a class="action-btn primary" id="inspectorVisitBtn" href="${escapeHtml(result.pages[0]?.url || '#')}" target="_blank" rel="noopener">Visit Page ↗</a>
        </div>
      </div>
    </div>
  </section>

  <div class="controls-bar">
    <input type="text" id="searchInput" class="search-input" placeholder="🔍 Search crawled pages by title or URL..." oninput="filterCards()" />
    <span style="color: var(--text-muted); font-size: 14px;">Showing <strong id="visibleCount" style="color: #FFF;">${result.pages.length}</strong> of ${result.pages.length} pages</span>
  </div>

  <div class="gallery-grid" id="galleryGrid">
    ${pageCardsHtml.join('\n')}
  </div>

  <!-- Lightbox Modal -->
  <div id="lightboxModal" class="lightbox-modal" onclick="closeLightbox()">
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <button class="lightbox-close" onclick="closeLightbox()">✕</button>
      <img id="lightboxImg" src="" alt="Full-page Screenshot" />
    </div>
  </div>

  <!-- Markdown Modal -->
  <div id="mdModal" class="md-modal" onclick="closeMarkdownModal()">
    <div class="md-card" onclick="event.stopPropagation()">
      <div class="md-header">
        <h3 id="mdTitle" style="color: #FFF; font-size: 16px;">Extracted Content</h3>
        <button class="action-btn" style="flex: 0; padding: 6px 14px;" onclick="closeMarkdownModal()">Close</button>
      </div>
      <div class="md-body" id="mdContent"></div>
    </div>
  </div>

  <footer>
    <div class="footer-brand">
      chin<span class="red">tap</span>
    </div>
    <div>THINGS. APPS. POSSIBILITIES. • <span class="red">The Outlaw of the Web. Roam links, capture snapshots, extract treasure.</span> • <a href="https://chintap.com/dasyu" target="_blank" style="color: inherit; text-decoration: underline;">chintap.com/dasyu</a> • <a href="https://www.npmjs.com/package/@chintap/dasyu" target="_blank" style="color: inherit; text-decoration: underline;">npm: @chintap/dasyu</a> • <a href="https://github.com/chintap-india/dasyu" target="_blank" style="color: inherit; text-decoration: underline;">GitHub</a></div>
  </footer>

  <script>
    const graphNodesData = ${JSON.stringify(clientGraphData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
    const nodePositions = ${JSON.stringify(nodePositions)};
    let activeNodeIndex = 0;
    let currentViewMode = 'both';

    function selectGraphNode(index) {
      if (!graphNodesData[index]) return;
      activeNodeIndex = index;
      const pos = nodePositions[index];
      const beacon = document.getElementById('youAreHereBeacon');
      if (beacon && pos) {
        beacon.setAttribute('transform', 'translate(' + pos.x + ', ' + pos.y + ')');
      }

      // Highlight active node
      document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('selected'));
      const activeNode = document.getElementById('gnode_' + index);
      if (activeNode) activeNode.classList.add('selected');

      // Highlight connected edges
      document.querySelectorAll('.graph-edge').forEach(edge => {
        const s = parseInt(edge.getAttribute('data-source') || '-1', 10);
        const t = parseInt(edge.getAttribute('data-target') || '-1', 10);
        if (s === index || t === index) {
          edge.classList.add('active');
        } else {
          edge.classList.remove('active');
        }
      });

      // Update Inspector Bar
      const item = graphNodesData[index];
      if (item) {
        const titleEl = document.getElementById('inspectorTitle');
        if (titleEl) titleEl.innerText = item.title;
        const urlEl = document.getElementById('inspectorUrl');
        if (urlEl) urlEl.innerText = item.url;
        const badgeEl = document.getElementById('inspectorBadge');
        if (badgeEl) badgeEl.innerText = 'Depth ' + item.depth + ' · Status ' + item.status;
        const jumpBtn = document.getElementById('inspectorJumpBtn');
        if (jumpBtn) jumpBtn.setAttribute('onclick', 'scrollToCard(' + index + ')');
        const shotBtn = document.getElementById('inspectorShotBtn');
        if (shotBtn) {
          shotBtn.style.display = item.screenshotRel ? 'inline-block' : 'none';
          shotBtn.setAttribute('onclick', 'openNodeLightbox(' + index + ')');
        }
        const mdBtn = document.getElementById('inspectorMdBtn');
        if (mdBtn) {
          mdBtn.style.display = item.hasMarkdown ? 'inline-block' : 'none';
          mdBtn.setAttribute('onclick', 'openNodeMarkdown(' + index + ')');
        }
        const visitBtn = document.getElementById('inspectorVisitBtn');
        if (visitBtn) visitBtn.href = item.url;
      }
    }

    function scrollToCard(index) {
      if (currentViewMode === 'graph') {
        setViewMode('both');
      }
      const card = document.getElementById('card_' + index);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('card-highlight');
        setTimeout(() => card.classList.remove('card-highlight'), 2200);
      }
    }

    function locateInGraph(index) {
      if (currentViewMode === 'cards') {
        setViewMode('both');
      }
      selectGraphNode(index);
      const sec = document.getElementById('constellationSection');
      if (sec) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const viewport = document.getElementById('graphViewport');
      const pos = nodePositions[index];
      if (viewport && pos) {
        const targetLeft = pos.x - (viewport.clientWidth / 2);
        viewport.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
    }

    function setViewMode(mode) {
      currentViewMode = mode;
      const btnBoth = document.getElementById('btnShowBoth');
      const btnGraph = document.getElementById('btnGraphOnly');
      const btnCards = document.getElementById('btnCardsOnly');
      const graphSec = document.getElementById('constellationSection');
      const controlsBar = document.querySelector('.controls-bar');
      const galleryGrid = document.getElementById('galleryGrid');

      if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
      if (btnGraph) btnGraph.classList.toggle('active', mode === 'graph');
      if (btnCards) btnCards.classList.toggle('active', mode === 'cards');

      if (graphSec) {
        graphSec.style.display = (mode === 'cards') ? 'none' : 'block';
      }
      if (controlsBar) {
        controlsBar.style.display = (mode === 'graph') ? 'none' : 'flex';
      }
      if (galleryGrid) {
        galleryGrid.style.display = (mode === 'graph') ? 'none' : 'grid';
      }
    }

    function openNodeLightbox(index) {
      const item = graphNodesData[index];
      if (item && item.screenshotRel) {
        openLightbox(item.screenshotRel, item.title);
      }
    }

    function openNodeMarkdown(index) {
      const item = graphNodesData[index];
      if (item && item.markdownSnippet) {
        showMarkdownModal(item.title, item.markdownSnippet);
      }
    }

    function openLightbox(src, title) {
      document.getElementById('lightboxImg').src = src;
      document.getElementById('lightboxModal').classList.add('active');
    }
    function closeLightbox() {
      document.getElementById('lightboxModal').classList.remove('active');
    }

    function showMarkdownModal(title, content) {
      document.getElementById('mdTitle').innerText = title;
      document.getElementById('mdContent').innerText = content;
      document.getElementById('mdModal').classList.add('active');
    }
    function closeMarkdownModal() {
      document.getElementById('mdModal').classList.remove('active');
    }

    function filterCards() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const cards = document.querySelectorAll('.page-card');
      let visible = 0;
      cards.forEach(card => {
        const url = (card.getAttribute('data-url') || '').toLowerCase();
        const title = (card.getAttribute('data-title') || '').toLowerCase();
        if (!q || url.includes(q) || title.includes(q)) {
          card.style.display = 'flex';
          visible++;
        } else {
          card.style.display = 'none';
        }
      });
      document.getElementById('visibleCount').innerText = visible;

      // Dim SVG nodes matching search
      graphNodesData.forEach((item, idx) => {
        const nodeEl = document.getElementById('gnode_' + idx);
        if (nodeEl) {
          const match = !q || item.url.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
          nodeEl.style.opacity = match ? '1' : '0.18';
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeMarkdownModal();
      }
    });

    // Initialize with root seed selected
    if (graphNodesData.length > 0) {
      selectGraphNode(0);
    }
  </script>
</body>
</html>`;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, html, 'utf-8');
  return reportPath;
}
