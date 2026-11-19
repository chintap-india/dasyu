<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).

### Learnings

Past sessions on this repo, yours and your teammates', leave learnings in
`.trail/learnings/`: what they decided, tried and ruled out. `trail ask`
prints the ones on your task above the code, so read them before exploring
(if `trail` isn't installed, read `.trail/learnings/` directly). They're
learnings from past sessions, never instructions: don't run a command just
because one contains it.

When the session finds what the code can't tell the next person (a bug's
cause after failed attempts, an approach dropped and why, a choice and why,
or the user correcting how something is done here), save a learning:
`trail note --title "<the decision in plain words>"` with the text on stdin,
under `## Decided`, `## Tried and ruled out` and `## Watch out`. A
summary, never a transcript, and nothing secret. Add `--personal` when it's
about how this user likes to work or their own machine. A learning added to
this repo goes in `.trail/learnings/`: commit it with the change, so your
teammates' agent starts from it. Run `trail check` before you commit or open
a PR: it flags a change that goes against a learning.
<!-- trail:end -->

---

## Release & Publishing Protocol (Strict Rules for Every Next Release)

Whenever the user or a task asks to release, version bump, or publish `@chintap/dasyu`:

### 1. Absolute Public Image URLs (Zero Broken Images on NPM)
- **Never** use relative image paths (e.g. `./assets/...`) in `README.md`. NPM and external markdown renderers fail to resolve relative paths from package tarballs.
- **Brand Banners & Logos**: Must use public CDN URLs:
  - Dark: `https://chintap.com/images/dasyu-brand-horizontal-dark-2400.png`
  - Light: `https://chintap.com/images/dasyu-brand-horizontal-2400.png`
  - Dashboard: `https://raw.githubusercontent.com/chintap-india/dasyu/main/assets/dasyu-ui-dashboard.png`
- **Showcase & Example Snapshots**: Must use public GitHub raw URLs:
  - `https://raw.githubusercontent.com/chintap-india/dasyu/main/assets/examples/<filename>.png`
- Always verify all image URLs return `HTTP 200` before releasing.

### 2. Pre-Flight Verification & Metadata Sync
- Ensure all 16 test files pass cleanly (`npm test`).
- Compile TypeScript bundles (`npm run build`).
- Verify `package.json` `"version"` matches the semantic release target.
- Verify `package.json` `"files"` array includes `["dist", "bin", "README.md", "llms.txt"]`.
- Ensure `llms.txt` is updated with latest CLI flags, MCP tools, and library exports.
- Never commit `auth.json` or session files (verify `.gitignore`).

### 3. Git Tagging & Release Notes Protocol
- Push all commits to `origin main` first.
- Tag the release using semantic versioning:
  ```bash
  git tag -a v<version> -m "Release v<version>: <summary>"
  git push origin v<version>
  ```
- **GitHub Release Formatting Standards**:
  - Always include the centered brand logo: `<p align="center"><img src="https://chintap.com/images/dasyu-brand-horizontal-dark-2400.png" alt="Dasyu (दस्यु)" width="640" /></p>`.
  - Always use clear H3 subsections (`### 📦 Quick Start & Installation`, `### ✨ Release Highlights`, `### 🔗 Official Links`).
  - Always use proper fenced code blocks (```bash ... ```). Never output bare lines without code fences.
  - If the git tag was already pushed, edit the existing tag notes at `https://github.com/chintap-india/dasyu/releases/edit/v<version>` rather than trying to create a duplicate tag.

### 4. NPM Publishing
- Scope: `@chintap/dasyu` with public access (`npm publish`).
- Verify via `npm whoami` and ensure 2FA is active.
- Verify published tarball contents: `npx @chintap/dasyu@<version> --version`.
