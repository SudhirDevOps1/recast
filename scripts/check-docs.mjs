#!/usr/bin/env node
/**
 * Documentation integrity check.
 *
 * Docs are the product surface for everyone who is not in the codebase, so a
 * broken link or an unbalanced code fence is a real defect. This runs in CI
 * next to the "Docs integrity" job:
 *
 *   node scripts/check-docs.mjs
 *
 * Checks every Markdown file in the repo for:
 *   - relative links that point at a file which does not exist
 *   - in-page anchors (#section) with no matching heading
 *   - unbalanced fenced code blocks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['docs'];
const SCAN_FILES = ['README.md', 'STATUS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'PERFORMANCE.md', 'AGENTS.md'];

const problems = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/* GitHub-style heading slug: lowercase, drop punctuation, spaces to dashes. */
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function headingsOf(markdown) {
  const slugs = new Set();
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) slugs.add(slugify(m[2]));
  }
  return slugs;
}

function checkFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const markdown = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  const fences = (markdown.match(/^\s*```/gm) || []).length;
  if (fences % 2 !== 0) problems.push(`${rel}: unbalanced code fence (${fences} markers)`);

  const slugs = headingsOf(markdown);

  for (const m of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // external
    if (target.startsWith('mailto:')) continue;

    const [pathPart, fragment] = target.split('#');

    if (!pathPart) {
      if (fragment && !slugs.has(fragment)) {
        problems.push(`${rel}: anchor #${fragment} has no matching heading`);
      }
      continue;
    }

    if (pathPart.startsWith('/')) {
      problems.push(`${rel}: root-relative link "${target}" - use a relative path`);
      continue;
    }

    const resolved = path.resolve(dir, decodeURIComponent(pathPart));
    if (!fs.existsSync(resolved)) {
      problems.push(`${rel}: link "${target}" does not exist`);
      continue;
    }

    if (fragment && resolved.endsWith('.md')) {
      const targetSlugs = headingsOf(fs.readFileSync(resolved, 'utf8'));
      if (!targetSlugs.has(fragment)) {
        problems.push(`${rel}: link "${target}" points at a heading that does not exist`);
      }
    }
  }
}

const files = SCAN_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f));
for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) walk(full, files);
}

for (const file of files) checkFile(file);

if (problems.length) {
  console.error(`\n✗ ${problems.length} documentation problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`✓ docs OK (${files.length} Markdown files checked)`);
