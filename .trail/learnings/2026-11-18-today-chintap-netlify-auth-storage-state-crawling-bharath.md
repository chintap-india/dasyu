# Netlify Auth & GoTrue StorageState Crawling on today.chintap.com

## Decided
- Netlify Identity / GoTrue applications store authentication session state primarily in `localStorage` under `gotrue.user` (and application profiles like `chintap_auth_profile_v1` on `today.chintap.com`), alongside optional JWT cookies (`nf_jwt`).
- Dasyu's Playwright storageState schema natively restores both cookies and origin-scoped `localStorage` (`origins: [{ origin, localStorage }]`).
- Passing `--auth ./auth-today.json` enables Dasyu to bypass client-side authentication gates (`task-auth-gate`) on modern SPAs, extracting full protected DOM contents (sprint backlogs, task cards, activity logs) and capturing authenticated screenshots.

## Tried and ruled out
- Sole cookie restoration (`nf_jwt` only): Modern client-side Single Page Applications relying on GoTrue-js or local-first auth services read `localStorage` on hydration. Capturing only cookies causes the SPA to remain on the auth lock screen. Both `cookies` and `origins[].localStorage` must be present.

## Watch out
- Ensure `origins[].origin` exactly matches the protocol, domain, and port (`https://today.chintap.com`).
- Clean up test artifacts and verify zero lingering browser processes after every crawl.
