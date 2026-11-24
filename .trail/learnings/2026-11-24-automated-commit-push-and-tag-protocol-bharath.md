---
title: Automated commit push and tag protocol
author: Bharath
date: 2026-11-24
branch: main
id: l-8e5875cc
scope: repo
status: active
src: agent
touches:
  - ".gitignore"
  - package.json
---

## Decided
The user established a strict standing policy: Whenever changes are made, cleanly commit and push automatically without pausing or prompting for confirmation. When major features or package suites are delivered, tag the release using semantic versioning and push tags immediately.

## Watch out
Keep working trees clean across both @chintap/dasyu and dasyu-astra by ensuring temporary test crawl artifacts are ignored in .gitignore before pushing.
