# Dasyu (दस्यु)

<p align="center">
  <img src="./assets/dasyu-black.png" alt="Dasyu — The Outlaw of the Web" width="400" />
</p>

> *The Outlaw of the Web.* A modern TypeScript/Node.js utility powered by Playwright to crawl web applications up to $N$ levels deep, capture full-page DOM screenshots, and extract clean Markdown content.

In Sanskrit, **Dasyu** (दस्यु) means a fierce non-conformist, rover, or outlaw who refused to submit to orthodox rules. **Dasyu** roams the information superhighway, bypassing fluff, capturing visual snapshots in time, and extracting raw content treasure.

---

## ✨ Features

- **Depth-Controlled BFS Crawler**: Crawl any web application with configurable depth ($1 \le N \le 5$). Includes URL normalization, deduplication, and same-origin filtering.
- **Full-Page DOM Screenshots**: Automatically captures visual layouts and full-page rendering using Playwright headless automation.
- **Markdown Content Extraction**: Converts raw HTML DOM structures into clean, readable Markdown and structured JSON metadata (title, description, headings, link graph).
- **Extensible Plugin Architecture**: Built on an asynchronous lifecycle hook system (`onPageLoad`, `onScreenshot`, `onExtract`, `onAnalyze`) ready for future plugins like accessibility auditing (WCAG via `@axe-core/playwright`), SEO audits, and performance profiling.
- **Dual CLI & Library**: Use directly from your terminal or import programmatically into your Node.js/TypeScript applications.

---

## 🚀 Installation

```bash
# Install globally or run via npx
npx dasyu crawl https://example.com

# Or install as a dependency in your Node.js project
npm install dasyu
```

---

## 💻 CLI Usage

```bash
# Basic screenshot & crawl 1 level deep (default)
npx dasyu crawl https://example.com --output ./results

# Crawl 3 levels deep, generating full-page screenshots AND clean Markdown content reports
npx dasyu crawl https://example.com --depth 3 --content --output ./results

# Crawl an authenticated web app or dashboard using saved Playwright storageState cookies & localStorage
npx dasyu crawl https://app.example.com/dashboard --auth ./auth.json --depth 2 --content

# Specify concurrency limit (default is 3 parallel pages)
npx dasyu crawl https://example.com --depth 2 --concurrency 5 --content
```

### CLI Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `-d, --depth <number>` | Crawl depth ($1 \le N \le 5$) | `1` |
| `-c, --concurrency <number>` | Max parallel browser pages | `3` |
| `-o, --output <dir>` | Output directory for screenshots & content | `./output` |
| `-s, --storage-state <path>` | Playwright `storageState` JSON path (cookies, localStorage) | `undefined` |
| `--auth <path>` | Alias for `-s, --storage-state` | `undefined` |
| `--content` | Extract clean Markdown content & JSON metadata | `false` |
| `--allow-external` | Allow crawling links outside starting domain | `false` |
| `--debug` | Enable verbose debug logging | `false` |

---

## 🔐 Authenticated Crawling (`storageState`)

Dasyu natively integrates Playwright's **`storageState`** feature, enabling developers to automatically crawl authenticated web applications, dashboards, admin panels, and user profiles without needing to script login flows!

Simply pass a saved Playwright `storageState` JSON file containing cookies and `localStorage`:
```bash
# Via CLI using -s / --storage-state (or --auth)
npx dasyu crawl https://app.example.com/dashboard --auth ./auth.json --depth 2 --content
```

In the interactive REPL, you can dynamically load, save, or clear authentication states on the fly:
```bash
dasyu> auth load ./my-cookies.json
✔ Loaded authentication storageState from "./my-cookies.json" for subsequent crawls

dasyu> crawl https://app.example.com/settings 2
# Or save your current session's auth state for future use:
dasyu> auth save ./saved-session.json
```

---

## 🐚 Interactive REPL Shell

Running `dasyu` with no arguments launches an interactive, tomato-styled REPL shell where you can live-command the crawler and inspect results:

```bash
npx dasyu
# or: dasyu repl
```

Inside the `dasyu> ` prompt:
- `crawl <url> [depth]` — Crawls a website, taking snapshots and extracting Markdown. Supports flags like `--auth <path>`.
- `goto <url>` (or `snap <url>`) — Captures a one-off snapshot of a single page.
- `pages` (or `ls`, `list`) — Lists all pages captured in the current session.
- `inspect <index|url>` — Shows detailed JSON metadata, links, and file paths for a captured page.
- `auth <load|save|clear>` — Dynamically manage Playwright authentication storageState (cookies & localStorage).
- `config [key] [val]` — Views or live-updates crawler settings (concurrency, depth, outputDir, auth).
- `clear` — Clears screen and prints the version banner.

Example REPL session with authentication:
```bash
dasyu> auth load ./my-cookies.json
✔ Loaded authentication storageState from "./my-cookies.json" for subsequent crawls

dasyu> config
Current Session Configuration:
  depth:          1 (max: 5)
  concurrency:    3 pages
  output:         ./output
  content:        enabled
  allow-external: disabled
  auth (storage): ./my-cookies.json

dasyu> crawl https://app.example.com/settings --depth 2
```

*Note on SPAs*: Dasyu automatically waits for network idle (`networkidle`) and client-side rendering before capturing snapshots, ensuring Angular (`domtree.io`), React, and Vue applications render completely!

---

## 📦 Version Management & Publishing

To bump the version and push tags for npm publishing:
```bash
# Bump patch version (e.g. 0.1.0 -> 0.1.1) and push tags
npm run bump:patch

# Bump minor or major version
npm run bump:minor
npm run bump:major
```

---

## 📚 Programmatic Library Usage

```typescript
import { DasyuCrawler } from 'dasyu';

async function main() {
  const crawler = new DasyuCrawler({
    startUrl: 'https://example.com/app',
    maxDepth: 2,
    concurrency: 3,
    extractContent: true,
    outputDir: './my-snapshots',
    storageState: './auth.json', // Authenticated crawl with Playwright storageState!
  });

  const report = await crawler.run();
  console.log(`Crawl finished! Captured ${report.pages.length} pages.`);
}

main();
```

---

## 🔌 Plugin Architecture (Roadmap)

Dasyu is designed to be easily extensible without modifying the core crawler engine:
- **`onPageLoad(page, url, depth)`**: Hook invoked after page navigation settles.
- **`onScreenshot(page, screenshotPath)`**: Hook invoked after full-page snapshot is captured.
- **`onExtract(page, content)`**: Hook invoked after DOM extraction.
- **`onAnalyze(page, results)`**: Hook invoked for custom analytical plugins (e.g., WCAG accessibility violations, Lighthouse scores, broken link detection).

---

## 📄 License

MIT
