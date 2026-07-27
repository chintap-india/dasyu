#!/usr/bin/env node

require('../dist/cli/index.js').main().catch((err) => {
  console.error('Fatal Dasyu CLI Error:', err);
  process.exit(1);
});
