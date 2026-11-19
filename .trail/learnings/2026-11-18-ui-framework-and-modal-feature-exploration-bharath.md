# UI Framework Detection & Interactive Modal Feature Exploration

## Decided
- Modern SPAs (such as Angular on `today.chintap.com`, React, Vue, Next.js) often avoid static `<a href>` anchor tags for entity details and state transitions, relying instead on click handlers and modal dialogs (e.g., Task Details, Status change, Edit forms).
- Dasyu's `ModalExplorerPlugin` inspects DOM framework signatures (`ng-version`, `_ngcontent-*`, Angular CDK overlays, Radix UI, Bootstrap, native `<dialog>`) and automatically surfaces interactive triggers via heuristics while filtering out destructive verbs (`delete`, `remove`, `logout`).
- When `--explore-modals` is enabled, Dasyu triggers candidate modals, captures dedicated snapshots (`...__modal_N_slug.png`), extracts form controls, status choices, and action buttons, extracts any deep permalinks or route changes (such as `/tasks/:taskId`), and restores baseline DOM state via clean dismissal before proceeding.
- Deep links discovered from modals are fed directly into the crawler queue, enabling discovery of parameterized routes without requiring static anchor links.

## Tried and ruled out
- Treating modals solely as dismissable obstacles: `--dismiss-modals` previously closed all modals, preventing inspection of rich interactive features and nested routes.
- Clicking unconstrained buttons: Unfiltered clicking risks firing delete, signout, or destructive form submissions. Strict regex allow/block heuristics are required.

## Watch out
- Always dismiss modals via `Escape` key and close selectors before advancing to subsequent triggers to prevent stuck overlay backdrops.
- Cap exploration with `--max-modals` (default 5) to avoid infinite loops on complex SPAs.
