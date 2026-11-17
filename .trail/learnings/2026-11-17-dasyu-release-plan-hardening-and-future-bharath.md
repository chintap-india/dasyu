---
title: "Dasyu release plan, hardening, and future chintap-india org migration"
author: Bharath
date: 2026-11-17
branch: main
id: l-3656fb24
scope: repo
status: active
src: agent
---

## Decided
- Defer public NPM registry release until after dogfooding and feature hardening on apps built in other threads.
- Keep demo-output/ gitignored but retained locally for chintap.com and other test crawls.
- After crawler features are hardened, migrate the repository to the chintap-india GitHub organization.
- Keep Anomalyco Browse as an integrated plugin and auth bridge for session import and login wall detection.

## Tried and ruled out
- Immediate NPM publish: ruled out to prioritize internal dogfooding and feature expansion first.
- Direct runtime dependency on desktop Chromium extensions: ruled out in favor of clean headless crawling with optional session import and detection plugin.

## Watch out
- Ensure demo-output/ stays in .gitignore so local test crawls never pollute git history.
- When crawling authenticated apps, use interactiveLogin or importBrowseSession before initiating deep crawls.
