import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildZipArchive, computeCrc32, exportDashboardZip } from '../src/core/zip';

describe('Zero-Dependency ZIP Exporter', () => {
  const tmpDir = path.join(process.cwd(), 'test-zip-temp');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should compute valid CRC-32 for strings and buffers', () => {
    const buf = Buffer.from('hello');
    const crc = computeCrc32(buf);
    expect(crc).toBe(0x3610a686);
  });

  it('should build a valid PKZIP buffer from files', () => {
    const entries = [
      { name: 'report.html', content: Buffer.from('<!DOCTYPE html><html><body>Report</body></html>') },
      { name: 'domain.com/screenshots/home.png', content: Buffer.from('fake-png-data') },
      { name: 'domain.com/content/home.md', content: Buffer.from('# Home Page') },
    ];

    const zipBuffer = buildZipArchive(entries);
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);

    // Verify PK header signatures
    // Local header: PK\x03\x04
    expect(zipBuffer.readUInt32LE(0)).toBe(0x04034b50);
    // Find End of Central Directory signature: PK\x05\x06
    const eocdSig = zipBuffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocdSig).toBeGreaterThan(0);
  });

  it('should export output dashboard directory into a zip archive', async () => {
    // Scaffold mock output directory
    const outputDir = path.join(tmpDir, 'output');
    const domainDir = path.join(outputDir, 'example.com');
    const screenshotsDir = path.join(domainDir, 'screenshots');
    const contentDir = path.join(domainDir, 'content');

    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.mkdir(contentDir, { recursive: true });

    await fs.writeFile(path.join(outputDir, 'report.html'), '<!DOCTYPE html><h1>Dasyu Dashboard</h1>');
    await fs.writeFile(path.join(screenshotsDir, 'home.png'), 'image-bytes');
    await fs.writeFile(path.join(contentDir, 'home.md'), '# Markdown text');

    const result = await exportDashboardZip(outputDir, {
      domain: 'example.com',
    });

    expect(result.zipFileName).toBe('example.com-report.zip');
    expect(result.totalFiles).toBe(3);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const exists = await fs.stat(result.zipPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should throw an error if target directory does not exist or is empty', async () => {
    await expect(exportDashboardZip(path.join(tmpDir, 'non-existent'))).rejects.toThrow(
      'Output directory does not exist'
    );

    const emptyDir = path.join(tmpDir, 'empty');
    await fs.mkdir(emptyDir);
    await expect(exportDashboardZip(emptyDir)).rejects.toThrow(
      'No report or crawl assets found'
    );
  });
});
