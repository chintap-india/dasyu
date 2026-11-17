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
}

/**
 * Escapes HTML characters for safe template rendering.
 */
function escapeHtml(str: string): string {
  return str
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

      const escapedTitle = escapeHtml(page.title || 'Untitled Page');
      const escapedUrl = escapeHtml(page.url);
      const escapedSnippet = escapeHtml(markdownSnippet);

      return `
        <div class="page-card" data-url="${escapedUrl}" data-title="${escapedTitle}" data-status="${page.status}">
          <div class="card-header">
            <div class="card-badges">
              ${statusBadge}
              ${depthBadge}
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
  <title>Dasyu (दस्यु) — The Outlaw of the Web — Dasyu Crawl Report | ${escapeHtml(hostname)}</title>
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
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-title .red { color: var(--accent-red); }
    .brand-subtitle {
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.15em;
      text-transform: uppercase;
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
      <svg class="emblem-svg" viewBox="0 0 659 628" fill="none">
        <polygon points="16,17 230,17 16,107" fill="#FFFFFF" />
        <polygon points="16,107 230,17 480,17 638,155 16,327" fill="#EA1C24" />
        <polygon points="16,327 638,155 638,471 498,609 16,609" fill="#FFFFFF" />
      </svg>
      <div>
        <div class="brand-title">dasyu <span class="red">दस्यु</span></div>
        <div class="brand-subtitle"><span class="red">The Outlaw of the Web.</span> Roam links, capture snapshots, extract treasure. • Automated Crawl &amp; Audit Report</div>
      </div>
    </div>

    <div class="target-pill">
      <span class="target-dot"></span>
      <span>${escapeHtml(startUrl)}</span>
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
    <div>THINGS. APPS. POSSIBILITIES. • <span class="red">The Outlaw of the Web. Roam links, capture snapshots, extract treasure.</span> • <a href="https://chintap.com/dasyu" target="_blank" style="color: inherit; text-decoration: underline;">chintap.com/dasyu</a> • <a href="https://github.com/chintap-india/dasyu" target="_blank" style="color: inherit; text-decoration: underline;">GitHub</a></div>
  </footer>

  <script>
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
      const q = document.getElementById('searchInput').value.toLowerCase();
      const cards = document.querySelectorAll('.page-card');
      let visible = 0;
      cards.forEach(card => {
        const url = (card.getAttribute('data-url') || '').toLowerCase();
        const title = (card.getAttribute('data-title') || '').toLowerCase();
        if (url.includes(q) || title.includes(q)) {
          card.style.display = 'flex';
          visible++;
        } else {
          card.style.display = 'none';
        }
      });
      document.getElementById('visibleCount').innerText = visible;
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeMarkdownModal();
      }
    });
  </script>
</body>
</html>`;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, html, 'utf-8');
  return reportPath;
}
