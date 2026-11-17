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

  it('should track active instances in central registry and clear them with closeAll()', async () => {
    const manager1 = new BrowserManager();
    const manager2 = new BrowserManager();

    // Mock internal browser and context
    (manager1 as any).browser = { close: async () => {} };
    (manager1 as any).context = { close: async () => {} };
    (manager2 as any).browser = { close: async () => {} };
    (manager2 as any).context = { close: async () => {} };

    // Register into active set
    (BrowserManager as any).activeManagers.add(manager1);
    (BrowserManager as any).activeManagers.add(manager2);

    expect(BrowserManager.getActiveCount()).toBeGreaterThanOrEqual(2);
    expect(BrowserManager.getActiveManagers()).toContain(manager1);
    expect(BrowserManager.getActiveManagers()).toContain(manager2);

    // Individual close removes from active registry
    await manager1.close();
    expect(BrowserManager.getActiveManagers()).not.toContain(manager1);

    // Global closeAll cleans up all remaining instances
    await BrowserManager.closeAll();
    expect(BrowserManager.getActiveCount()).toBe(0);
  });

  it('should track and close all open pages during manager close()', async () => {
    const manager = new BrowserManager();
    let page1Closed = false;
    let page2Closed = false;

    const mockPage1: any = {
      isClosed: () => page1Closed,
      close: async () => { page1Closed = true; },
    };
    const mockPage2: any = {
      isClosed: () => page2Closed,
      close: async () => { page2Closed = true; },
    };

    (manager as any).pages.add(mockPage1);
    (manager as any).pages.add(mockPage2);

    expect((manager as any).pages.size).toBe(2);

    // Release page1
    await manager.releasePage(mockPage1);
    expect(page1Closed).toBe(true);
    expect((manager as any).pages.size).toBe(1);

    // Close manager should force close page2
    await manager.close();
    expect(page2Closed).toBe(true);
    expect((manager as any).pages.size).toBe(0);
  });

  it('should be idempotent and tolerate multiple consecutive close() calls', async () => {
    const manager = new BrowserManager();
    await manager.close();
    await manager.close();
    await manager.close();
    expect(manager.isActive()).toBe(false);
  });
});
