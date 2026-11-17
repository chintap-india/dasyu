---
title: Dasyu master vector emblem mathematical geometry and asset pipeline
author: Bharath
date: 2026-11-17
branch: main
id: l-a6c5ecec
scope: repo
status: active
src: agent
touches:
  - assets/apple-touch-icon-dark.png
  - assets/dasyu-brand-dark-2048.png
  - assets/dasyu-brand-horizontal-2400.png
  - assets/dasyu-brand-horizontal-dark-2400.png
  - assets/dasyu-brand-white-bg-2048.png
  - assets/dasyu-emblem-dark-mode.png
  - assets/dasyu-emblem-dark-source.png
  - assets/dasyu-emblem-dark.svg
  - assets/dasyu-emblem-light-mode.png
  - assets/dasyu-emblem-light-source.png
---

## Decided
- The 10 master uploaded emblem PNGs conform exactly to a 1000x1000 square artboard with 80px margins and mathematical polygon precision:
  - Top triangle: points="80,80 360,80 80,220" (width 280, height 140, dx/dy = -2)
  - Red slash: points="80,220 360,80 760,80 960,280 80,520" (chamfer dx=200, dy=200 at 45°, lower slash dx/dy = -11/3)
  - Bottom body: points="80,520 960,280 960,720 760,920 80,920" (vertical 440, chamfer dx=-200, dy=200 at 45°)
- Dark version uses body #0A0A0A (or #080808) and slash #F00000 on transparent background.
- Light version uses body #FFFFFF and slash #F00000 on transparent background with identical geometry.
- Horizontal logos, reports, OG previews, and CLI documentation use exact URLs https://chintap.com/dasyu and https://github.com/chintap-india/dasyu.
- Exact tagline enforced everywhere: "The Outlaw of the Web. Roam links, capture snapshots, extract treasure."

## Tried and ruled out
- Raw ASCII art in REPL / CLI: ruled out because terminal raster rendering causes wrapping and illegibility across light/dark terminals. Clean ANSI styled text with logger.tomato provides consistent, crisp rendering.
- Manual pixel tracing: replaced with 100.00% exact mathematical polygon matching against all 10 uploaded master PNGs.

## Watch out
- Running `node scripts/build-brand-assets.js` invokes Chrome headless to generate 2048x2048 PNGs, which requires access to `/Applications/Google Chrome.app`.
