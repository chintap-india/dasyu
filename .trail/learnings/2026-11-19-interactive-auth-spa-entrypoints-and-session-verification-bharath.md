# Interactive Auth Bridge: SPA Entrypoints, Email/SSO Login, and Session Verification

## Decided
- Target the actual protected destination route (e.g. `https://today.chintap.com/tasks`) rather than legacy `/login` routes when running `dasyu auth login`. Modern client-side SPAs (Angular, React, Vue, Netlify Identity) overlay their authentication gates and modal widgets directly onto the protected path.
- The Interactive Auth Bridge is fully authentication-method agnostic: it seamlessly handles Email/Password form submissions, social OAuth providers (Google, GitHub, GitLab, Bitbucket), and Multi-Factor Authentication (2FA/TOTP).
- Always verify saved credentials with `dasyu auth inspect ./auth.json` before initiating large crawls. A valid SPA session must show both cookies and origin-scoped `localStorage` keys (e.g., `gotrue.user`).
- Use `dasyu view ./output` (or the REPL `view` command) to directly open the visual dashboard in the default web browser, rather than relying on system `open <dir>` which only reveals the folder in Finder.

## Tried and ruled out
- Pointing users to static `/login` URLs for SPAs: Navigating directly to `/login` on route-strict SPAs often triggers a 404 / "broken page" layout underneath the global auth widget. Directing the browser directly to the protected workspace route (`/tasks`, `/dashboard`) provides an intuitive sign-in experience and settled redirect target.
- Assuming pure cookie persistence: GoTrue/Netlify Identity apps discard or ignore cookie-only sessions if `localStorage` is missing. Both cookies and `origins[].localStorage` must be present.

## Watch out
- Ensure `auth.json` and session state dumps are included in `.gitignore` to prevent active access tokens or cookies from being committed to source control.
- Closing the browser window or pressing ENTER in the terminal triggers state serialization; ensure the user waits for the dashboard to settle before closing the browser window.
