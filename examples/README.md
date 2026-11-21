# Dasyu Plugin Examples

This directory provides generic, open-source plugin examples demonstrating how to extend `@chintap/dasyu` via lifecycle hooks (`onPageLoad`, `onExtract`, `onAnalyze`, `onComplete`).

## Available Example Plugins

### 1. `readability-grade.mjs` (Reading Level & Flesch-Kincaid Analyzer)
Analyzes extracted Markdown content on each page using standard Flesch-Kincaid Grade Level and Flesch Reading Ease formulas.
- **Metrics Computed**: Reading Ease (0–100), US Grade Level (e.g. 8.4), Plain-English Category, and Target Audience Age (e.g., "13–15 years").
- **Usage**:
  ```bash
  dasyu crawl https://chintap.com --content --plugin ./examples/plugins/readability-grade.mjs
  ```

### 2. `prose-lint.mjs` (English Prose & Writing Quality Linter)
Scans documentation text for writing clarity issues (modeled after tools like `write-good` and `Vale`).
- **Issues Detected**: Passive voice usage, weasel words ("very", "extremely", "obviously"), complex jargon ("utilize" → "use"), and overly long runaway sentences (> 30 words).
- **Metrics Computed**: `proseQualityScore` (0–100) and actionable improvement suggestions.
- **Usage**:
  ```bash
  dasyu crawl https://chintap.com --content --plugin ./examples/plugins/prose-lint.mjs
  ```

---

## Combining Multiple Plugins in `dasyu.config.js`

You can combine multiple plugins in a project configuration file:

```javascript
// dasyu.config.js
import readabilityPlugin from './examples/plugins/readability-grade.mjs';
import proseLintPlugin from './examples/plugins/prose-lint.mjs';

export default {
  maxDepth: 2,
  concurrency: 3,
  extractContent: true,
  plugins: [
    readabilityPlugin,
    proseLintPlugin,
  ],
};
```

Run with your config:
```bash
dasyu crawl https://chintap.com
```
