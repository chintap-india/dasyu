# Zero-Dependency PKZIP Dashboard Export

## Decided
- Exporting the full visual HTML dashboard (`report.html`) and associated domain assets (`screenshots/`, `content/`) must require zero external npm dependencies or native compilation steps.
- Implemented a pure Node.js PKZIP (v2.0) archive builder (`src/core/zip.ts`) using standard `node:zlib` (`deflateRawSync` and `zlib.crc32` with precomputed IEEE 802.3 CRC-32 fallback).
- Integrated seamless CLI workflows:
  - `dasyu crawl <url> --zip` to automatically bundle the crawl output.
  - `dasyu zip [dir]` to package any existing crawl directory on demand.
  - Header download pill in `report.html` matching the Outlaw dark theme.

## Tried and ruled out
- Heavy third-party zip libraries (`archiver`, `adm-zip`, `jszip`): Adds megabytes of unneeded dependencies, potential supply-chain bloat, or async stream complexity when standard `node:zlib` delivers instant in-memory deflation in under 100 lines of robust TypeScript.
- Client-side browser-only zip generation via `fetch()` on `file://`: Browser security policies (CORS) block relative `file://` fetch calls when double-clicking local HTML files. Generating the zip archive on the filesystem via Node.js CLI guarantees 100% reliability, zero CORS errors, and offline portability.

## Watch out
- Ensure forward slashes (`/`) are consistently used in ZIP entry paths across Windows, macOS, and Linux.
- Exclude existing `.zip` files when recursively scanning directories to avoid recursive self-archiving.
