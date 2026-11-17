#!/usr/bin/env node

require('../dist/mcp/server.js').startMcpServer().catch((err) => {
  process.stderr.write(`Dasyu MCP Server Error: ${err?.message || String(err)}\n`);
  process.exit(1);
});
