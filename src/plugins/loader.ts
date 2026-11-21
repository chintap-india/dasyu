import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { DasyuPlugin } from './base';
import type { CrawlOptions } from '../core/types';
import { logger } from '../cli/logger';

/**
 * Dynamically loads an external user plugin from a local file path or package specifier.
 * Supports ES Modules (.mjs, .js), CommonJS (.cjs, .js), class instances, factory functions,
 * and installed npm packages (e.g., '@chintap/dasyu-plugin-docs').
 */
export async function loadPlugin(specifier: string): Promise<DasyuPlugin> {
  let fileUrl: string | undefined;

  const isExplicitPath =
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:') ||
    /\.[mc]?[jt]sx?$/.test(specifier);

  const resolvedPath = path.isAbsolute(specifier)
    ? specifier
    : path.resolve(process.cwd(), specifier);

  let fileExists = false;
  try {
    await fs.access(resolvedPath);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (fileExists) {
    fileUrl = pathToFileURL(resolvedPath).href;
  } else if (isExplicitPath) {
    throw new Error(`Plugin file not found at: "${specifier}" (resolved: ${resolvedPath})`);
  } else {
    // Attempt resolving as an installed npm package via createRequire or dynamic import
    try {
      const req = createRequire(path.join(process.cwd(), 'package.json'));
      const pkgPath = req.resolve(specifier);
      fileUrl = pathToFileURL(pkgPath).href;
    } catch {
      // Fall back to direct specifier import (Node ESM package resolution)
      fileUrl = specifier;
    }
  }

  try {
    const mod = await import(fileUrl);
    const rawPlugin = mod.default || mod.plugin || mod;

    let pluginInstance: DasyuPlugin;
    if (typeof rawPlugin === 'function') {
      try {
        pluginInstance = new (rawPlugin as any)();
      } catch {
        pluginInstance = (rawPlugin as any)();
      }
    } else {
      pluginInstance = rawPlugin;
    }

    if (!pluginInstance || typeof pluginInstance !== 'object' || typeof pluginInstance.name !== 'string') {
      throw new Error(
        `Invalid plugin structure in "${specifier}". A Dasyu plugin must export an object or class with a "name" string property.`
      );
    }

    return pluginInstance;
  } catch (err: any) {
    if (err.message && err.message.startsWith('Invalid plugin structure')) {
      throw err;
    }
    if (err.message && err.message.startsWith('Plugin file not found')) {
      throw err;
    }
    throw new Error(`Failed to load plugin from "${specifier}": ${err?.message || err}`);
  }
}

/**
 * Loads an array of external plugins, logging progress and warning on failures.
 */
export async function loadPlugins(specifiers: string[]): Promise<DasyuPlugin[]> {
  const plugins: DasyuPlugin[] = [];
  for (const spec of specifiers) {
    if (!spec || typeof spec !== 'string') continue;
    try {
      const p = await loadPlugin(spec);
      plugins.push(p);
      logger.info(`[Plugins] Loaded external plugin: "${p.name}" from ${spec}`);
    } catch (err: any) {
      logger.warn(`[Plugins] Could not load plugin "${spec}": ${err.message}`);
    }
  }
  return plugins;
}

/**
 * Attempts to automatically discover and load a `dasyu.config.{js,mjs,cjs,json}` file from the project root.
 */
export async function loadConfigFile(customConfigPath?: string): Promise<Partial<CrawlOptions> | null> {
  const candidateNames = customConfigPath
    ? [customConfigPath]
    : ['dasyu.config.js', 'dasyu.config.mjs', 'dasyu.config.cjs', 'dasyu.config.json'];

  for (const name of candidateNames) {
    const fullPath = path.isAbsolute(name) ? name : path.resolve(process.cwd(), name);
    try {
      await fs.access(fullPath);
      if (name.endsWith('.json')) {
        const raw = await fs.readFile(fullPath, 'utf-8');
        return JSON.parse(raw);
      }
      const fileUrl = pathToFileURL(fullPath).href;
      const mod = await import(fileUrl);
      const config = mod.default || mod;
      return typeof config === 'function' ? await config() : config;
    } catch {
      // Continue searching next candidate
    }
  }

  return null;
}
