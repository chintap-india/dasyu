import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { startMcpServer } from '../src/mcp/server';

describe('Dasyu MCP Server Protocol', () => {
  const tmpDir = path.join(process.cwd(), 'test-mcp-tmp');
  const tmpAuthJson = path.join(tmpDir, 'auth.json');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      tmpAuthJson,
      JSON.stringify({
        cookies: [{ name: 'sess', value: 'abc', domain: 'example.com' }],
        origins: [],
      }),
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function sendMcpMessage(request: Record<string, any>): Promise<any> {
    const originalStdin = process.stdin;
    const originalStdoutWrite = process.stdout.write;

    let responseString = '';
    const mockStdin = new Readable({
      read() {
        this.push(JSON.stringify(request) + '\n');
        this.push(null);
      },
    });

    const outputPromise = new Promise<any>((resolve) => {
      // @ts-ignore
      process.stdout.write = (chunk: any) => {
        responseString += chunk.toString();
        const lines = responseString.trim().split('\n');
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === request.id) {
              resolve(parsed);
              return true;
            }
          } catch {}
        }
        return true;
      };
    });

    // @ts-ignore
    Object.defineProperty(process, 'stdin', { value: mockStdin, configurable: true });

    await startMcpServer();
    const result = await outputPromise;

    // Restore
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    process.stdout.write = originalStdoutWrite;

    return result;
  }

  it('should respond to initialize with serverInfo and protocolVersion', async () => {
    const res = await sendMcpMessage({
      jsonrpc: '2.0',
      id: 101,
      method: 'initialize',
      params: {},
    });

    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(101);
    expect(res.result.serverInfo.name).toBe('dasyu-mcp');
    expect(res.result.protocolVersion).toBe('2024-11-05');
  });

  it('should list all available tools on tools/list', async () => {
    const res = await sendMcpMessage({
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/list',
      params: {},
    });

    expect(res.result.tools).toBeDefined();
    const toolNames = res.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('dasyu_crawl');
    expect(toolNames).toContain('dasyu_snapshot');
    expect(toolNames).toContain('dasyu_inspect_auth');
  });

  it('should execute dasyu_inspect_auth tool and return cookie stats', async () => {
    const res = await sendMcpMessage({
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: {
        name: 'dasyu_inspect_auth',
        arguments: { path: tmpAuthJson },
      },
    });

    expect(res.result).toBeDefined();
    const content = JSON.parse(res.result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.stats.cookiesCount).toBe(1);
    expect(content.stats.domains).toContain('example.com');
  });

  it('should return error -32601 for unrecognized tool call', async () => {
    const res = await sendMcpMessage({
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/call',
      params: {
        name: 'non_existent_tool',
        arguments: {},
      },
    });

    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32601);
  });

  it('should return error -32601 for unimplemented method', async () => {
    const res = await sendMcpMessage({
      jsonrpc: '2.0',
      id: 105,
      method: 'unknown/method',
      params: {},
    });

    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32601);
  });
});
