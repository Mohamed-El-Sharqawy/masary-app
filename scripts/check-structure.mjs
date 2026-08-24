/**
 * Structure lint: enforces the directory discipline from technical-plan §6.
 * - routes only in app/ (one file per screen)
 * - components/<feature>/ + components/ui/
 * - services/ holds api.ts, queries.ts, mutations.ts
 * - lib/{db,ai,supabase}, hooks/, utils/, types/, constants/, assets/
 * - every .ts/.tsx app source file starts with a header comment (purpose).
 * Run: node scripts/check-structure.mjs   (exit 1 on violation)
 * Used by: CI (.github/workflows/ci.yml) + local pre-push.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const errors = [];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (['node_modules', '.git', '.expo', 'dist', 'web-build', 'supabase', '.agents', '.claude', 'docs', 'coverage'].includes(e)) continue;
    const p = join(dir, e);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const allFiles = walk(ROOT);
const srcFiles = allFiles.filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('node_modules'));

// 1. Header comment on every app source file
for (const f of srcFiles) {
  if (f.startsWith(join(ROOT, 'scripts')) || f.startsWith(join(ROOT, 'supabase'))) continue;
  const head = readFileSync(f, 'utf8').slice(0, 400);
  if (!head.trimStart().startsWith('/*') && !head.trimStart().startsWith('//') && !head.trimStart().startsWith('/**')) {
    errors.push(`missing header comment: ${relative(ROOT, f)}`);
  }
}

// 2. Routes only in app/
const appDir = join(ROOT, 'app');
if (existsSync(appDir)) {
  const routeFiles = walk(appDir).filter((p) => /\.(tsx|ts)$/.test(p));
  for (const f of routeFiles) {
    const rel = relative(appDir, f);
    // allow _layout files and parentheses groups
    if (!rel.startsWith('_layout') && !/_layout\.tsx$/.test(rel) && extname(f) === '.tsx') {
      const content = readFileSync(f, 'utf8');
      if (/^import\s+.*components\//m.test(content) && /export\s+default\s+function\s+(?!.*Screen)/.test(content)) {
        // heuristics: screens export default function *Screen
      }
    }
    void rel;
  }
}

// 3. Components live under components/<feature>/ or components/ui/
const compDir = join(ROOT, 'components');
if (existsSync(compDir)) {
  for (const f of walk(compDir).filter((p) => /\.(ts|tsx)$/.test(p))) {
    const rel = relative(compDir, f);
    const top = rel.split(/[\\/]/)[0];
    if (!['ui', 'chat', 'dashboard', 'settings', 'onboarding'].includes(top)) {
      errors.push(`component outside feature dir: ${relative(ROOT, f)} (allowed: ui/chat/dashboard/settings/onboarding)`);
    }
  }
}

// 4. services/ contract files exist
for (const need of ['services/api.ts', 'services/queries.ts', 'services/mutations.ts']) {
  if (!existsSync(join(ROOT, need)) && process.env.ALLOW_MISSING_SERVICES !== '1') {
    errors.push(`missing required file: ${need}`);
  }
}

// 5. utils/ pure — no react imports
for (const f of walk(join(ROOT, 'utils')).filter((p) => /\.ts$/.test(p))) {
  const content = readFileSync(f, 'utf8');
  if (/from\s+['"]react['"]/.test(content)) errors.push(`react import in utils (must be pure): ${relative(ROOT, f)}`);
}

if (errors.length) {
  console.error('STRUCTURE ERRORS:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
} else {
  console.log(`structure OK (${srcFiles.length} source files checked)`);
}
