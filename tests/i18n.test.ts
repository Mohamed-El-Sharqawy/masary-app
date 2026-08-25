/**
 * Tests for the i18n string tables (lib/i18n.ts): ar/en key parity and
 * coverage of every t('<key>') literal used across the source tree
 * (app/, components/, lib/, hooks/ — recursive, .ts/.tsx only, skipping
 * node_modules/ and tests/). Pure node fs scan — no RN runtime, no fetch;
 * only AsyncStorage is mocked because importing lib/i18n pulls in lib/prefs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));

import { STRINGS } from '../lib/i18n';

const AR_KEYS = new Set(Object.keys(STRINGS.ar));
const EN_KEYS = new Set(Object.keys(STRINGS.en));

/** Source dirs where t() may be called (structure contract, AGENTS.md). */
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks'] as const;

/** Recursively collect .ts/.tsx files, skipping node_modules/ and tests/. */
function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests') continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every t('<key>') literal key used in the scanned source tree. */
function usedTKeys(repoRoot: string): Set<string> {
  const keys = new Set<string>();
  const files = SOURCE_DIRS.flatMap((dir) => collectSourceFiles(join(repoRoot, dir)));
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('STRINGS parity', () => {
  it('ar and en tables have identical key sets', () => {
    const onlyAr = [...AR_KEYS].filter((k) => !EN_KEYS.has(k));
    const onlyEn = [...EN_KEYS].filter((k) => !AR_KEYS.has(k));
    expect(onlyAr, 'keys defined in ar but missing from en').toEqual([]);
    expect(onlyEn, 'keys defined in en but missing from ar').toEqual([]);
  });
});

describe('STRINGS coverage', () => {
  it('every t(key) literal used in source exists in both tables', () => {
    const used = usedTKeys(REPO_ROOT);
    expect(used.size, 'expected to find t() literals in source').toBeGreaterThan(0);
    const missing = [...used].filter((k) => !AR_KEYS.has(k) || !EN_KEYS.has(k));
    expect(missing, 'keys used via t() but absent from STRINGS').toEqual([]);
  });
});
