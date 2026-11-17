import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserManager } from '../src/core/browser';

describe('BrowserManager', () => {
  const tmpDir = path.join(process.cwd(), 'test-browser-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should initialize with default options', () => {
    const manager = new BrowserManager();
    expect(manager).toBeDefined();
    expect(manager.isActive()).toBe(false);
  });

  it('should accept custom viewport and storageState in options', async () => {
    const customState = { cookies: [{ name: 'token', value: '123' }], origins: [] };
    const manager = new BrowserManager({
      headless: true,
      viewport: { width: 1920, height: 1080 },
      storageState: customState,
    });
    expect(manager).toBeDefined();

    // Dynamically update storageState
    await manager.setStorageState('./another-auth.json');
    expect(manager.isActive()).toBe(false);
  });

  it('should return undefined when saving storageState on uninitialized browser', async () => {
    const manager = new BrowserManager();
    const result = await manager.saveStorageState();
    expect(result).toBeUndefined();

    const fileResult = await manager.saveStorageState(path.join(tmpDir, 'saved.json'));
    expect(fileResult).toBeUndefined();
  });

  it('should handle close safely even when not initialized', async () => {
    const manager = new BrowserManager();
    await expect(manager.close()).resolves.toBeUndefined();
    expect(manager.isActive()).toBe(false);
  });
});
