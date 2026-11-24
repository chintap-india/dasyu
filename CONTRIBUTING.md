# Contributing to Dasyu (दस्यु)

Thank you for your interest in contributing to **Dasyu**! Dasyu is an open-source, depth-controlled website crawler, visual DOM snapshot engine, and Markdown extractor developed by [Chintap](https://chintap.com).

This guide outlines our development workflow, quality gates, and best practices.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: `>=18.0.0`
- **npm**: `>=9.0.0`
- **Playwright Chromium**: installed via `npx playwright install chromium`

```bash
# Clone the repository
git clone https://github.com/chintap-india/dasyu.git
cd dasyu

# Install dependencies
npm install

# Build TypeScript distributions
npm run build

# Install Playwright browser binaries
npx playwright install chromium
```

---

## 🧪 Testing & Verification

Every change must pass our full suite of automated tests before submission.

```bash
# Run all unit and integration tests (17 test files, 90+ tests)
npm test

# Type-check TypeScript codebase
npm run typecheck

# Build and verify distribution bundles (ESM, CJS, DTS)
npm run build
```

---

## 📐 Guidelines & Best Practices for Development

These practices govern all developer and agentic contributions across the Dasyu ecosystem:

### 1. Continuous Clean Commit & Push Protocol
- **Continuous Delivery**: Whenever code changes, feature enhancements, documentation updates, or bug fixes are verified, cleanly stage, commit, and push directly to `origin main`.
- **Working Tree Hygiene**: Always keep working trees clean. Temporary crawl artifacts (`*-output/`, `test-*/`, `walkthrough.json`, `auth.json`) must remain ignored in `.gitignore` or wiped before committing.

### 2. Semantic Tagging for Milestones & Releases
- Whenever a major feature, new plugin suite, or significant milestone is reached, create an annotated git tag following semantic versioning:
  ```bash
  git tag -a v<version> -m "Release v<version>: <summary>"
  git push origin v<version>
  ```

### 3. Trail Learnings Persistence (`.trail/learnings/`)
- Dasyu uses [Trail](https://github.com/trailhq/Trail-Code) for deterministic repo graph context and persistent learnings.
- Whenever a non-obvious bug cause, architectural choice, approach ruled out, or user workflow preference is identified, save it as a permanent learning:
  ```bash
  trail note --title "<plain-words decision>" --touches "<file-or-symbol>" -m "## Decided\n...\n## Watch out\n..."
  ```
- This ensures hard-won knowledge is never lost across sessions and subsequent teammates/agents start with full verified context.
- Keep the Trail context graph in sync after significant code edits via `trail build`.

### 4. Brand Integrity: Strictly "Chintap"
- The official company and brand name is strictly **Chintap**.
- **NEVER** use "Chintap Studio" or "Studio" under any circumstances.
- Package author field must always be `"Chintap (https://chintap.com)"`.

### 5. Absolute Public Image URLs in Documentation
- Never use relative image paths (e.g. `./assets/...`) in `README.md`. NPM and external markdown viewers fail to resolve relative paths from package tarballs.
- Use public CDN URLs (`https://chintap.com/images/...`) for official banners, and raw GitHub URLs (`https://raw.githubusercontent.com/chintap-india/dasyu/main/assets/...`) for snapshots and examples.

---

## 🔌 Authoring Custom Plugins

Dasyu provides an extensible dual-resolution plugin system. Custom plugins implement the `DasyuPlugin` interface:

```typescript
import { definePlugin } from '@chintap/dasyu';

export default definePlugin({
  name: 'my-custom-plugin',
  version: '1.0.0',
  description: 'Custom lifecycle analyzer',

  async onStart(options) {
    // Called when crawl starts
  },
  async onPageLoad(ctx) {
    // Called immediately after DOMContentLoaded
  },
  async onScreenshot(ctx, screenshotPath) {
    // Called after full-page screenshot is saved (ctx.page is still active)
  },
  async onExtract(ctx, contentPath) {
    // Called after markdown and metadata extraction
  },
  async onAnalyze(ctx) {
    // Custom analysis; returned object merges into ctx.data.metadata
    return { myMetric: 100 };
  },
  async onComplete(result, options) {
    // Called when all pages have finished processing
  },
});
```

See [`examples/plugins/`](./examples/plugins/) for generic zero-dependency reference implementations.

---

## 📄 License

By contributing to Dasyu, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
