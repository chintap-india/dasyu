# Release & Publishing Protocol for Dasyu

## Decided
- Every release must strictly use absolute public HTTPS URLs for all images in `README.md` (`chintap.com/images/...` or `raw.githubusercontent.com/chintap-india/dasyu/main/assets/...`). Relative paths (`./assets/...`) are forbidden in `README.md` because NPM registry tarballs and external proxies fail to resolve them.
- Release notes for GitHub Releases must include the centered brand logo, H3 subsections, and proper fenced code blocks (` ```bash `). Raw lines without code fences result in broken typography on GitHub.
- Pushing a git tag `v<version>` automatically creates a tag entry on GitHub. To publish release notes for an existing tag, navigate to `https://github.com/chintap-india/dasyu/releases/edit/v<version>` instead of attempting to create a new release with a duplicate tag name.
- Always include `llms.txt` in `package.json` `"files"` so the AI/LLM specification is distributed with the npm tarball.
- Always verify all 16 test files pass (`npm test`) and compilation succeeds (`npm run build`) before tagging or publishing.

## Tried and ruled out
- Using relative markdown image paths (`./assets/...`): Broke the logo and dashboard preview on `npmjs.com/package/@chintap/dasyu`.
- Using raw lines without code blocks in GitHub release notes: Rendered headers as gigantic text with ugly unformatted commands.
- Creating a release via "New release" after pushing git tag: Failed with `Duplicate tag name: tag name has already been taken`. Must edit the existing tag notes at `/releases/edit/v<version>`.

## Watch out
- Ensure `auth.json` and session dumps remain in `.gitignore` and are never committed.
- Keep `package.json` version, `README.md` badges, and git tag names strictly synchronized.
