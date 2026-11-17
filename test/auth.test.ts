import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { importBrowseSession, inspectStorageState } from '../src/core/auth';

describe('Auth Bridge & Session Normalization', () => {
  const tmpDir = path.join(process.cwd(), 'test-auth-temp');
  const tmpAuthJson = path.join(tmpDir, 'auth.json');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should import and normalize an array of cookies from OpenCode Browse or DevTools', async () => {
    const rawCookies = [
      { name: 'session_id', value: 'xyz123', domain: 'example.com', path: '/' },
      { name: 'auth_token', value: 'secret999', domain: 'example.com', path: '/' },
    ];

    const result = await importBrowseSession(rawCookies, tmpAuthJson);
    expect(result.storageStatePath).toBe(path.resolve(tmpAuthJson));
    expect(result.storageState.cookies).toHaveLength(2);
    expect(result.storageState.origins).toEqual([]);

    // Check disk write
    const diskContent = JSON.parse(await fs.readFile(tmpAuthJson, 'utf-8'));
    expect(diskContent.cookies).toHaveLength(2);
  });

  it('should import full storageState object with cookies and origins', async () => {
    const fullState = {
      cookies: [{ name: 'csrf', value: 'token123', domain: 'app.example.com', path: '/' }],
      origins: [
        {
          origin: 'https://app.example.com',
          localStorage: [{ name: 'jwt', value: 'jwt-header.body.sig' }],
        },
      ],
    };

    const result = await importBrowseSession(fullState, tmpAuthJson);
    expect(result.storageState.cookies).toHaveLength(1);
    expect(result.storageState.origins).toHaveLength(1);
  });

  it('should inspect storageState and return accurate metrics', async () => {
    const state = {
      cookies: [
        { name: 'c1', value: '1', domain: 'alpha.com', expires: Date.now() / 1000 + 3600 },
        { name: 'c2', value: '2', domain: 'beta.com', expires: 100 }, // expired
      ],
      origins: [{ origin: 'https://alpha.com', localStorage: [] }],
    };

    await fs.writeFile(tmpAuthJson, JSON.stringify(state), 'utf-8');

    const summary = await inspectStorageState(tmpAuthJson);
    expect(summary.cookiesCount).toBe(2);
    expect(summary.originsCount).toBe(1);
    expect(summary.domains).toContain('alpha.com');
    expect(summary.domains).toContain('beta.com');
    expect(summary.expiredCookies).toBe(1);
  });

  it('should throw an error for unrecognized session formats in importBrowseSession', async () => {
    await expect(importBrowseSession('invalid string content', tmpAuthJson)).rejects.toThrow();
    await expect(importBrowseSession({ invalidKey: 123 }, tmpAuthJson)).rejects.toThrow(
      'Unrecognized session format'
    );
  });

  it('should handle empty storageState gracefully in inspectStorageState', async () => {
    const emptyState = {};
    const summary = await inspectStorageState(emptyState);
    expect(summary.cookiesCount).toBe(0);
    expect(summary.originsCount).toBe(0);
    expect(summary.domains).toHaveLength(0);
    expect(summary.expiredCookies).toBe(0);
  });

  it('should inspect Netlify Identity and local-first auth storageState correctly', async () => {
    const netlifyAuthState = {
      cookies: [
        {
          name: 'nf_jwt',
          value: 'jwt-token-sample',
          domain: 'today.chintap.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 7200,
        },
      ],
      origins: [
        {
          origin: 'https://today.chintap.com',
          localStorage: [
            {
              name: 'chintap_auth_profile_v1',
              value: JSON.stringify({
                id: 'lead-dev',
                name: 'Alex Developer',
                role: 'developer',
                provider: 'netlify',
              }),
            },
            {
              name: 'gotrue.user',
              value: JSON.stringify({
                id: 'lead-dev',
                email: 'alex@chintap.com',
                app_metadata: { provider: 'email', roles: ['developer'] },
              }),
            },
          ],
        },
      ],
    };

    await fs.writeFile(tmpAuthJson, JSON.stringify(netlifyAuthState), 'utf-8');

    const summary = await inspectStorageState(tmpAuthJson);
    expect(summary.cookiesCount).toBe(1);
    expect(summary.originsCount).toBe(1);
    expect(summary.domains).toContain('today.chintap.com');
    expect(summary.expiredCookies).toBe(0);

    const loaded = JSON.parse(await fs.readFile(tmpAuthJson, 'utf-8'));
    expect(loaded.origins[0].localStorage).toHaveLength(2);
    expect(loaded.origins[0].localStorage[0].name).toBe('chintap_auth_profile_v1');
    expect(loaded.origins[0].localStorage[1].name).toBe('gotrue.user');
  });
});
