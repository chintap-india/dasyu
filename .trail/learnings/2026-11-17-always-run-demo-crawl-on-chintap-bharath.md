---
title: Always run demo crawl on chintap.com after adding features
author: Bharath
date: 2026-11-17
branch: main
id: l-10e46749
scope: repo
status: active
src: agent
touches:
  - src/core/crawler.ts
  - src/cli/index.ts
---

## Decided
- Every time a feature or plugin is added to Dasyu (in src/core/crawler.ts or src/cli/index.ts), run an end-to-end demo test crawl against https://chintap.com.
- Present the crawl output, audit logs (A11y, SEO, auth), and generated files (screenshots, markdown, rag-chunks.jsonl, site-graph.mmd) directly to the user.
- Ensure demo-output/ remains git-ignored while persisted on disk.

## Tried and ruled out
- Running only synthetic unit tests: ruled out because live browser crawls against chintap.com verify real DOM execution, network idle timeouts, full-page screenshot layouts, and Axe-core rules.

## Watch out
- Ensure network access is available during demo test runs so live page navigation succeeds.
