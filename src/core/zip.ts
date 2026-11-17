import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface ZipEntry {
  /** Relative file path inside the ZIP archive (e.g. 'report.html' or 'chintap.com/screenshots/home.png') */
  name: string;
  /** Binary file content */
  content: Buffer;
}

export interface ExportZipResult {
  zipPath: string;
  zipFileName: string;
  totalFiles: number;
  sizeBytes: number;
}

/** Precomputed CRC-32 lookup table for cross-platform fallback */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes standard IEEE 802.3 32-bit Cyclic Redundancy Check (CRC-32).
 */
export function computeCrc32(buf: Buffer): number {
  if (typeof (zlib as any).crc32 === 'function') {
    return ((zlib as any).crc32(buf) >>> 0);
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a 100% standard PKZIP (v2.0) archive Buffer from an array of files.
 * Zero external dependencies — pure Node.js standard library.
 */
export function buildZipArchive(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(normalizedName, 'utf8');
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    const compressed = zlib.deflateRawSync(content);
    const crc = computeCrc32(content);

    // 1. Local File Header (30 bytes + name)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Signature
    lh.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    lh.writeUInt16LE(0, 6);          // General purpose bit flag
    lh.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
    lh.writeUInt16LE(0, 10);         // Last mod file time
    lh.writeUInt16LE(0, 12);         // Last mod file date
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressed.length, 18); // Compressed size
    lh.writeUInt32LE(content.length, 22);    // Uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);    // Filename length
    lh.writeUInt16LE(0, 28);                 // Extra field length
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, compressed);

    // 2. Central Directory Header (46 bytes + name)
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // Signature
    cd.writeUInt16LE(20, 4);         // Version made by (2.0)
    cd.writeUInt16LE(20, 6);         // Version needed to extract (2.0)
    cd.writeUInt16LE(0, 8);          // General purpose bit flag
    cd.writeUInt16LE(8, 10);         // Compression method (8 = Deflate)
    cd.writeUInt16LE(0, 12);         // Last mod file time
    cd.writeUInt16LE(0, 14);         // Last mod file date
    cd.writeUInt32LE(crc, 16);       // CRC-32
    cd.writeUInt32LE(compressed.length, 20); // Compressed size
    cd.writeUInt32LE(content.length, 24);    // Uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28);    // Filename length
    cd.writeUInt16LE(0, 30);         // Extra field length
    cd.writeUInt16LE(0, 32);         // Comment length
    cd.writeUInt16LE(0, 34);         // Disk number start
    cd.writeUInt16LE(0, 36);         // Internal file attributes
    cd.writeUInt32LE(0, 38);         // External file attributes
    cd.writeUInt32LE(offset, 42);    // Relative offset of local header
    nameBuf.copy(cd, 46);

    centralHeaders.push(cd);
    offset += lh.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
  const totalEntries = entries.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // Signature
  eocd.writeUInt16LE(0, 4);                     // Disk number
  eocd.writeUInt16LE(0, 6);                     // Start disk number
  eocd.writeUInt16LE(totalEntries, 8);          // Entries on this disk
  eocd.writeUInt16LE(totalEntries, 10);         // Total entries
  eocd.writeUInt32LE(centralDirectorySize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirectoryOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                    // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Recursively collects all files from a directory, ignoring existing .zip archives.
 */
function collectDirectoryEntries(currentDir: string, rootDir: string): ZipEntry[] {
  const entries: ZipEntry[] = [];
  if (!fsSync.existsSync(currentDir)) return entries;

  const items = fsSync.readdirSync(currentDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(currentDir, item.name);
    if (item.isDirectory()) {
      entries.push(...collectDirectoryEntries(fullPath, rootDir));
    } else if (item.isFile() && !item.name.endsWith('.zip')) {
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const content = fsSync.readFileSync(fullPath);
      entries.push({ name: relPath, content });
    }
  }
  return entries;
}

/**
 * Exports a crawled output directory containing `report.html` and domain assets into a single portable ZIP archive.
 *
 * @param outputDir Target output directory (e.g. './output' or './results')
 * @param options Custom destination or domain filter
 */
export async function exportDashboardZip(
  outputDir: string,
  options: {
    domain?: string;
    customZipName?: string;
    destinationPath?: string;
  } = {}
): Promise<ExportZipResult> {
  const resolvedDir = path.resolve(outputDir);
  if (!fsSync.existsSync(resolvedDir)) {
    throw new Error(`Output directory does not exist: ${resolvedDir}`);
  }

  // Determine domain name if not explicitly provided
  let domain = options.domain;
  if (!domain) {
    const dirItems = await fs.readdir(resolvedDir, { withFileTypes: true });
    const domainFolder = dirItems.find(
      (d) => d.isDirectory() && (fsSync.existsSync(path.join(resolvedDir, d.name, 'screenshots')) || fsSync.existsSync(path.join(resolvedDir, d.name, 'content')))
    );
    domain = domainFolder ? domainFolder.name : 'dasyu-crawl';
  }

  const zipFileName = options.customZipName || `${domain}-report.zip`;
  const destinationZipPath = options.destinationPath
    ? path.resolve(options.destinationPath)
    : path.join(resolvedDir, zipFileName);

  // Collect report.html and all domain assets
  const filesToZip: ZipEntry[] = [];

  const reportPath = path.join(resolvedDir, 'report.html');
  if (fsSync.existsSync(reportPath)) {
    filesToZip.push({
      name: 'report.html',
      content: await fs.readFile(reportPath),
    });
  }

  // Collect domain subfolder
  const domainPath = path.join(resolvedDir, domain);
  if (fsSync.existsSync(domainPath)) {
    filesToZip.push(...collectDirectoryEntries(domainPath, resolvedDir));
  } else {
    // If not in a dedicated domain subfolder, collect everything in resolvedDir except other directories
    const allEntries = collectDirectoryEntries(resolvedDir, resolvedDir);
    for (const entry of allEntries) {
      if (entry.name !== 'report.html' && !filesToZip.some((f) => f.name === entry.name)) {
        filesToZip.push(entry);
      }
    }
  }

  if (filesToZip.length === 0) {
    throw new Error(`No report or crawl assets found in directory: ${resolvedDir}`);
  }

  const zipBuffer = buildZipArchive(filesToZip);
  await fs.mkdir(path.dirname(destinationZipPath), { recursive: true });
  await fs.writeFile(destinationZipPath, zipBuffer);

  return {
    zipPath: destinationZipPath,
    zipFileName,
    totalFiles: filesToZip.length,
    sizeBytes: zipBuffer.length,
  };
}
