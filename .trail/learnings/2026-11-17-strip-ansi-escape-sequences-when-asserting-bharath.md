---
title: Strip ANSI escape sequences when asserting CLI stdout in CI
author: Bharath
date: 2026-11-17
branch: main
id: l-3004f2d9
scope: repo
status: active
src: agent
touches:
  - test/cli-commands.test.ts
---

## Decided
- In CLI integration tests (such as `test/cli-commands.test.ts`), always strip ANSI terminal styling/color codes before asserting exact string matches on `stdout`.
- GitHub Actions runners automatically enable `FORCE_COLOR` and terminal styling via picocolors/chalk, inserting ANSI escape codes around bold or styled figures (e.g. `\u001b[1m1\u001b[22m`), causing raw string `toContain` checks to fail even when the output text is identical.

## Watch out
- Do not use raw `.toContain()` on formatted terminal figures without running through `stripAnsi` or using regex matchers.
