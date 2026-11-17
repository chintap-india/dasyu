---
title: Word-to-word alignment with Chintap website core capabilities
author: Bharath
date: 2026-11-17
branch: main
id: l-7c82a1d4
scope: repo
status: active
src: agent
touches:
  - src/core/types.ts
  - src/core/crawler.ts
  - src/core/graph.ts
  - src/extractors/content.ts
  - src/cli/repl.ts
  - test/chintap-capabilities.test.ts
---

## Decided
- Anchor and target metadata extraction: `DasyuCrawler` and `extractPageContent` now extract detailed `LinkMetadata` (`url`, `rawHref`, `text`, `target`, `rel`, `isExternal`) from discovered `<a>` elements and persist them to page content JSON and `PageData.linkDetails`.
- Parent-to-child route discovery: crawler queue tracks `parentUrl` across BFS depth tiers, and `SiteGraphNode` / `SiteGraphEdge` in `exportSiteGraph` preserves route lineage and anchor labels in `site-graph.json` and Mermaid diagrams.
- REPL alignment: REPL `help` command displays the welcome banner, active session configuration, and explicitly enumerates all 10 core REPL commands (`help`, `crawl`, `goto`, `snap`, `pages`, `inspect`, `auth`, `config`, `clean`, `exit`).

## Tried and ruled out
- Dropping anchor text and target attributes from link discovery: ruled out because Chintap's committed core capability specifications explicitly guarantee anchor and target metadata extraction as well as structured connectivity data.

## Watch out
- Keep `PageData.links: string[]` intact alongside `linkDetails: LinkMetadata[]` to maintain complete backward compatibility with plugins, reports, and existing CLI callers.
