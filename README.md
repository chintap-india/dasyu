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

## 🚀 Installation & Setup (Local Beta)

> **Note:** Official NPM registry publishing is held on our Roadmap while we dogfood Dasyu internally. For now, install and run Dasyu directly from the cloned repository!

### Quick Start (Global CLI Link)

```bash
# 1. Clone the repository (or navigate to your local dasyu folder)
git clone https://github.com/001bharathchetty/dasyu.git
cd dasyu

# 2. Install dependencies & compile TypeScript
npm install
npm run build

# 3. Ensure Playwright browser binaries are ready
npx playwright install chromium

# 4. Link globally so `dasyu` and `dasyu-mcp` are available in any terminal:
npm link
```

Once linked, test your global installation anywhere:
```bash
dasyu --version
dasyu --help
```

### Running Locally Without Linking

If you prefer not to link globally, you can invoke the binaries directly:
```bash
# Run Dasyu CLI directly via Node
node ./bin/dasyu.js --help

# Run Dasyu MCP Server directly
node ./bin/dasyu-mcp.js
```

---

## 💻 CLI Usage

```bash
# Basic screenshot & crawl 1 level deep (default)
dasyu crawl https://example.com --output ./results

# Crawl 3 levels deep, generating full-page screenshots AND clean Markdown content reports
dasyu crawl https://example.com --depth 3 --content --output ./results

# Crawl an authenticated web app or dashboard using saved Playwright storageState cookies & localStorage
dasyu crawl https://app.example.com/dashboard --auth ./auth.json --depth 2 --content

# Specify concurrency limit (default is 3 parallel pages)
dasyu crawl https://example.com --depth 2 --concurrency 5 --content

# Clean/reset generated output folders (wipes ./output and ./results by default)
dasyu clean
# Or clean a specific directory:
dasyu clean ./my-snapshots
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
| `--detect-auth` | Enable Anomalyco Browse plugin to monitor auth walls | `false` |
| `--seo` | Enable built-in SEO and metadata quality audit plugin | `false` |
| `--delay <ms>` | Throttling delay between page requests in milliseconds | `undefined` |
| `--dismiss-modals` | Detect & auto-dismiss cookie banners & dialogs | `false` |
| `--debug` | Enable verbose debug logging | `false` |

---

## 🔐 Authenticated Crawling & Interactive Auth Bridge

Dasyu provides an **Interactive Auth Bridge** and native Playwright **`storageState`** integration. You can easily log in to authenticated web applications, dashboards, admin panels, and SSO portals directly through an interactive browser window without scripting complex login flows!

### 1. Interactive Headful Login (`auth login`)
Launch a real browser window, sign in, solve Multi-Factor Authentication (2FA/SSO), and Dasyu will automatically capture and persist the active session cookies & `localStorage`:

```bash
# Open interactive login window and save session to ./auth.json
dasyu auth login https://app.example.com/login

# Or specify a custom output path
dasyu auth login https://app.example.com/login -o ./my-session.json

# Now crawl the authenticated dashboard with your saved state
dasyu crawl https://app.example.com/dashboard --auth ./auth.json --depth 2 --content
```

### 2. Session Inspection & External Import (OpenCode Browse / Chrome)
Easily inspect existing auth tokens or import cookies exported from OpenCode Browse (`anomalyco/browse`) or Chrome DevTools:

```bash
# Inspect cookies, active domains, and expiration dates
dasyu auth inspect ./auth.json

# Import cookies or raw session dumps from OpenCode Browse / DevTools into standard storageState
dasyu auth import ./browse-cookies.json -o ./auth.json
```

### 3. Anomalyco Browse Plugin (`--detect-auth`)
Enable the built-in **Anomalyco Browse Plugin** to monitor and alert on login walls, HTTP 401/403 status codes, and SSO redirects during autonomous crawls:

```bash
dasyu crawl https://app.example.com --auth ./auth.json --detect-auth
```

In the interactive REPL, you can run all auth commands on the fly:
```bash
dasyu> auth login https://app.example.com/login
✔ Logged in and saved session to "./auth.json"!
Session is now active for subsequent crawls in this REPL.

dasyu> auth inspect ./auth.json
dasyu> crawl https://app.example.com/settings --depth 2
```

---

## 🐚 Interactive REPL Shell

Running `dasyu` with no arguments launches an interactive, tomato-styled REPL shell where you can live-command the crawler and inspect results:

```bash
dasyu
# or: dasyu repl
```

Inside the `dasyu> ` prompt:
- `crawl <url> [depth]` — Crawls a website, taking snapshots and extracting Markdown. Supports flags like `--auth <path>`.
- `goto <url>` (or `snap <url>`) — Captures a one-off snapshot of a single page.
- `pages` (or `ls`, `list`) — Lists all pages captured in the current session.
- `inspect <index|url>` — Shows detailed JSON metadata, links, and file paths for a captured page.
- `auth <load|save|clear>` — Dynamically manage Playwright authentication storageState (cookies & localStorage).
- `config [key] [val]` — Views or live-updates crawler settings (concurrency, depth, outputDir, auth).
- `clean [dir]` (or `reset [dir]`) — Clears generated output directories and resets the session captured pages list.
- `clear` — Clears screen and prints the version banner.
- `exit` — Closes browser session and exits REPL.

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
dasyu> clean
✔ Cleaned output directory (./output, ./results) and reset session pages.
```

*Note on SPAs*: Dasyu automatically waits for network idle (`networkidle`) and client-side rendering before capturing snapshots, ensuring Angular (`domtree.io`), React, and Vue applications render completely!

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

## 🤖 Model Context Protocol (MCP) Server for AI Agents

Dasyu includes a native **Model Context Protocol (MCP)** server over standard I/O (`stdio`), allowing AI coding agents (such as Antigravity, Claude Code, Cursor, OpenCode, Codex) to invoke deep crawling and visual snapshotting natively as tool calls.

### Launching the MCP Server
```bash
# Launch directly via CLI
dasyu mcp

# Or via the standalone bin executable
node ./bin/dasyu-mcp.js
```

### Agent Configuration Example
Add Dasyu to your agent's MCP settings (e.g. `.gemini/settings.json`, `claude_desktop_config.json`, or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "dasyu": {
      "command": "node",
      "args": ["/absolute/path/to/dasyu/bin/dasyu-mcp.js"]
    }
  }
}
```

Available MCP tools:
- **`dasyu_crawl`**: Recursively crawls a target web app up to $N$ levels deep, captures DOM snapshots, extracts Markdown, and returns structured page summaries.
- **`dasyu_snapshot`**: Captures a one-off full-page screenshot and clean Markdown for any single URL.
- **`dasyu_inspect_auth`**: Inspects cookies, active domains, and expiration dates in a `storageState` JSON file.

---

## 🗺️ Roadmap & Future Plans

### 🏢 Organization Migration (`chintap-india`)
Once the application undergoes full dogfooding and hardening across internal threads, the repository will officially migrate under the **`chintap-india`** GitHub organization (`github.com/chintap-india/dasyu`).

### 📦 Hardening & NPM Registry Publishing
Public NPM publishing (`npm i -g dasyu`) is intentionally held while we dogfood Dasyu across internal web apps built in other threads. Releases and version bumps follow semantic versioning:
```bash
# Bump patch or minor version
npm run bump:patch
npm run bump:minor
```

### 🔌 Extensible Plugin Architecture
- **`Anomalyco Browse Plugin`** (`--detect-auth`): ✅ Completed (monitors login barriers and redirects).
- **`SEO & Quality Audit Plugin`** (`--seo`): ✅ Completed (audits headings, meta tags, and alt attributes).
- **`Accessibility (WCAG) Plugin`**: Hooking `@axe-core/playwright` into `onAnalyze` for automated WCAG 2.1 compliance audits.
- **`Vector Store Exporter`**: Direct export of extracted Markdown into chunked embeddings for RAG pipelines (Chroma, LanceDB).

---

## 📄 License

MIT
