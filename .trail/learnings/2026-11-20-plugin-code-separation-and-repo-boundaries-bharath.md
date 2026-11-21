# Plugin Code Separation and Repository Boundaries

## Decided
- **Public Core Engine (`@chintap/dasyu`)**: Stays strictly an unopinionated crawler and automation engine, carrying only generic educational plugin examples (`examples/plugins/` like readability and prose linting). No proprietary business logic or specific client/product use cases exist here.
- **Dedicated Private Plugins Repository (`dasyu-private-plugins`)**: **ALL** private, commercial, and app-specific plugins (including `today.chintap.com` Living Docs, motion video storyboards, slide deck builders, and multimodal RAG pipelines) live centrally in a dedicated private repository.
- Consuming applications (such as `today.chintap.com` or other Chintap services) install or fetch their plugins from the private plugins repository/package registry during CI/builds, keeping application codebases focused on their core application logic.

## Tried and ruled out
- Co-locating plugin scripts inside individual consumer app repositories (`today/scripts/plugins/`): Ruled out by user preference. Centralizing all plugin IP, tooling, and reusable extensions in a single dedicated private repository is cleaner and prevents fragmentation across disparate product repos.
- Mixing private commercial use cases into the public `@chintap/dasyu` repository under git branches or docs folders: High risk of accidental public leakage and bloats the core open-source package.

## Watch out
- Ensure `package.json` `"files"` array remains strictly `["dist", "bin", "README.md", "llms.txt"]` so `examples/` and test suites do not bloat the published npm tarball.
- All 17 test suites must pass cleanly before any public release.
