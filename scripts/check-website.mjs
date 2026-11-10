#!/usr/bin/env node
/**
 * Static audit of the marketing site in apps/website.
 *
 * The site has no build step, so nothing else catches a typo in an href, a
 * duplicated id, or a missing asset after a rename. Run this before touching
 * the deploy branch:
 *
 *   node scripts/check-website.mjs             # markup + local file audit
 *   node scripts/check-website.mjs --release   # also HEAD every published asset
 *
 * The --release pass needs a reachable public GitHub API. When the anonymous
 * rate limit is exhausted it warns and skips instead of failing the run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'apps', 'website');
const PAGES = ['index.html', '404.html'];
const REPO = 'SudhirDevOps1/recast';
/* GitHub Pages serves the site from https://<user>.github.io/recast/, so a
   root-relative href is written against that base, not the domain root. */
const BASE = '/recast';

const problems = [];
const notes = [];

function fail(file, message) {
  problems.push(`${file}: ${message}`);
}

function read(file) {
  return fs.readFileSync(path.join(SITE, file), 'utf8');
}

/* --------------------------------------------------------------- markup */

function collectIds(file, html) {
  const ids = new Map();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  for (const [id, count] of ids) {
    if (count > 1) fail(file, `duplicate id "${id}" (${count}×)`);
  }
  return new Set(ids.keys());
}

function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

function isLocal(url) {
  return url && !isExternal(url) && !url.startsWith('#');
}

function stripQuery(url) {
  return url.split('#')[0].split('?')[0];
}

function auditPage(file) {
  const html = read(file);
  const ids = collectIds(file, html);

  /* every in-page anchor must land somewhere */
  for (const m of html.matchAll(/href="#([^"]*)"/g)) {
    const target = m[1];
    if (!target) continue;
    if (!ids.has(target)) fail(file, `anchor href="#${target}" has no matching id`);
  }

  /* every local href/src must exist on disk */
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (!isLocal(url)) continue;
    if (url.startsWith('/') && !url.startsWith('//')) {
      /* root-relative paths carry the Pages base, and a directory resolves
         to its index.html */
      const relative = (url.startsWith(BASE) ? url.slice(BASE.length) : url).replace(/^\/+/, '');
      const candidate = relative === '' || relative.endsWith('/') ? relative + 'index.html' : relative;
      const target = path.join(SITE, stripQuery(decodeURI(candidate)));
      if (!fs.existsSync(target)) fail(file, `root-relative "${url}" missing`);
      continue;
    }
    const target = path.join(SITE, stripQuery(decodeURI(url)));
    if (!fs.existsSync(target)) fail(file, `local file "${url}" missing`);
  }

  /* references are only useful if their targets exist */
  for (const attr of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
    const re = new RegExp(`\\s${attr}="([^"]+)"`, 'g');
    for (const m of html.matchAll(re)) {
      for (const token of m[1].split(/\s+/).filter(Boolean)) {
        if (!ids.has(token)) fail(file, `${attr}="${token}" has no matching id`);
      }
    }
  }

  /* new tabs need rel=noopener; images need alt; scripts must stay first-party */
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    if (/target="_blank"/.test(tag) && !/rel="[^"]*noopener/.test(tag)) {
      fail(file, `target=_blank without rel=noopener → ${tag.slice(0, 90)}`);
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) fail(file, `<img> without alt → ${m[0].slice(0, 90)}`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) {
    if (isExternal(m[1])) fail(file, `third-party script ${m[1]}`);
  }

  /* cache-busting params must agree, otherwise one file ships stale */
  const versions = new Set();
  for (const m of html.matchAll(/assets\/[\w.-]+\?v=(\d+)/g)) versions.add(m[1]);
  if (versions.size > 1) fail(file, `mixed asset versions: ${[...versions].join(', ')}`);
  notes.push(`${file}: asset version ${[...versions].join(',') || 'none'}`);

  return html;
}

function auditCss() {
  const cssPath = path.join(SITE, 'assets', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  if (open !== close) fail('assets/style.css', `unbalanced braces ${open}/${close}`);

  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const url = decodeURIComponent(m[1]);
    if (isExternal(url) || url.startsWith('data:') || url.startsWith('#')) continue;
    const target = path.join(SITE, 'assets', stripQuery(url));
    if (!fs.existsSync(target)) fail('assets/style.css', `url(${m[1]}) missing`);
  }
}

function auditJs() {
  for (const file of ['app.js', 'releases.js']) {
    const full = path.join(SITE, 'assets', file);
    const js = fs.readFileSync(full, 'utf8');
    if (/https?:\/\/[^\s'"]+\.js/.test(js)) fail(`assets/${file}`, 'loads a remote script');
    if (/\binnerHTML\s*=/.test(js)) notes.push(`assets/${file}: uses innerHTML (verify it is trusted markup only)`);
  }
}

/* --------------------------------------------------------- live release */

async function head(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return { status: res.status, length: Number(res.headers.get('content-length') || 0) };
}

async function auditRelease() {
  const api = `https://api.github.com/repos/${REPO}/releases?per_page=6`;
  let list;
  try {
    const res = await fetch(api, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'recast-site-check' }
    });
    if (res.status === 403 || res.status === 429) {
      notes.push('release check skipped: GitHub API rate limit');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list = await res.json();
  } catch (error) {
    notes.push(`release check skipped: ${error.message}`);
    return;
  }

  const stable = list.find((r) => !r.prerelease && !/nightly/i.test(r.tag_name));
  if (!stable) {
    fail('release', 'no stable release found');
    return;
  }

  const names = stable.assets.map((a) => a.name);
  notes.push(`release ${stable.tag_name}: ${names.length} assets`);

  const required = [
    ['Windows installer', /^Recast-Setup-.*(?<!arm64)\.exe$/i],
    ['Windows ARM64 installer', /^Recast-Setup-.*arm64\.exe$/i],
    ['macOS Apple Silicon DMG', /-arm64\.dmg$/i],
    ['macOS Intel DMG', /-x64\.dmg$/i],
    ['Linux AppImage', /\.AppImage$/i],
    ['checksums', /^SHA256SUMS$/i]
  ];
  for (const [label, re] of required) {
    if (!names.some((name) => re.test(name))) fail('release', `${label} missing (${re})`);
  }

  const version = String(stable.tag_name).replace(/^v/i, '');
  if (!names.every((name) => !/Recast-/.test(name) || name.includes(version))) {
    const odd = names.filter((name) => /Recast-/.test(name) && !name.includes(version));
    fail('release', `assets do not match tag ${stable.tag_name}: ${odd.join(', ')}`);
  }

  /* spot-check one binary per platform instead of hammering the CDN */
  for (const [label, re] of required.slice(0, 5)) {
    const asset = stable.assets.find((a) => re.test(a.name));
    if (!asset) continue;
    try {
      const { status, length } = await head(asset.browser_download_url);
      if (status >= 400) fail('release', `${label} HEAD ${status} (${asset.name})`);
      else if (asset.size > 1024 * 1024 && length && length < 1024 * 1024) {
        fail('release', `${label} HEAD reports ${length} bytes for ${asset.name}`);
      } else notes.push(`${label} reachable (${status}, ${(asset.size / 1048576).toFixed(1)} MB)`);
    } catch (error) {
      fail('release', `${label} HEAD failed: ${error.message}`);
    }
  }
}

/* --------------------------------------------------------------- main */

const htmlPages = PAGES.map((page) => auditPage(page));
if (htmlPages[0] && htmlPages[1]) {
  for (const needle of ['assets/releases.js', 'assets/app.js']) {
    if (!htmlPages[0].includes(needle)) fail('index.html', `does not load ${needle}`);
  }
}
auditCss();
auditJs();

if (process.argv.includes('--release')) await auditRelease();

for (const note of notes) console.log(`· ${note}`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\n✓ website OK (${PAGES.join(', ')}, assets, CSS, JS)`);
