import { describe, it, expect } from 'vitest';
import { DasyuCrawler } from '../src/core/crawler';
import { BrowserManager } from '../src/core/browser';

describe('DasyuCrawler', () => {
  it('should initialize with default options and preserve storageState', () => {
    const crawler = new DasyuCrawler({
      startUrl: 'https://example.com',
      storageState: './auth.json',
    });
    expect(crawler).toBeDefined();
  });

  it('should correctly normalize URLs and preserve SPA hash routes', () => {
    const crawler = new DasyuCrawler({ startUrl: 'https://domtree.io' });
    expect(crawler.normalizeUrl('https://domtree.io/#/services/')).toBe('https://domtree.io/#/services');
    expect(crawler.normalizeUrl('https://domtree.io/about#section1')).toBe('https://domtree.io/about');
    expect(crawler.normalizeUrl('https://domtree.io/')).toBe('https://domtree.io/');
  });

  it('should correctly determine same origin', () => {
    const crawler = new DasyuCrawler({ startUrl: 'https://example.com' });
    expect(crawler.isSameOrigin('https://example.com/foo', 'https://example.com/bar')).toBe(true);
    expect(crawler.isSameOrigin('https://example.com/foo', 'https://other.com/bar')).toBe(false);
  });
});

describe('BrowserManager', () => {
  it('should accept storageState in options and support setStorageState', async () => {
    const manager = new BrowserManager({ storageState: { cookies: [], origins: [] } });
    expect(manager).toBeDefined();
    await manager.setStorageState('./new-auth.json');
  });
});
