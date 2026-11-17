---
title: Centralized BrowserManager lifecycle and zero orphaned Chromium processes
author: Bharath
date: 2026-11-17
branch: main
id: l-4b82c1e7
scope: repo
status: active
src: agent
touches:
  - src/core/browser.ts
  - src/core/crawler.ts
  - src/core/auth.ts
  - src/mcp/server.ts
  - src/cli/index.ts
  - test/browser-manager.test.ts
---

## Decided
- Route all browser launches strictly through `BrowserManager` across CLI, REPL, Auth Bridge, and MCP servers.
- Maintain a global active registry (`BrowserManager.activeManagers`) with automated process termination hooks (`SIGINT`, `SIGTERM`, `SIGHUP`, `beforeExit`) to guarantee clean teardown and force-reap child Chromium processes with timeout safeguards.
- Wrap crawler runs, snapshot executions, and interactive logins in `try ... finally` blocks to ensure browser contexts and processes are reliably closed even on unexpected rejections or early aborts.
- Guard `BrowserManager.init()` with an initialization promise lock (`this.initPromise`) so concurrent workers do not race to launch multiple duplicate browser instances.

## Tried and ruled out
- Independent browser launches via `chromium.launch(...)` in `auth.ts` or `server.ts`: ruled out because unhandled signals (such as Ctrl+C during auth login) or unexpected errors leave child Chromium processes orphaned in the background.

## Watch out
- In automated test runners like Vitest, signal hooks must not call `process.exit()` to avoid terminating the test runner prematurely.
