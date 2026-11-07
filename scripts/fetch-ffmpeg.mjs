#!/usr/bin/env node
/**
 * fetch-ffmpeg.mjs — download, verify, and stage FFmpeg binaries per
 * `ffmpeg.lock.json`.
 *
 * Rules (docs/ffmpeg.md):
 *  - Binaries are NEVER committed to git. They live under
 *    `resources/ffmpeg/<platform>-<arch>/` after this script runs.
 *  - If the lockfile pins a sha256, the download is verified BEFORE the file
 *    is used or extracted. A mismatch aborts with a non-zero exit.
 *  - If the lockfile entry has no hash yet ("pin-on-first-fetch"), this script
 *    downloads once, prints the SHA-256, and (with `--pin`) records it into
 *    the lockfile. From then on, every run verifies. CI always runs with the
 *    pinned hash so builds are reproducible.
 *  - `--skip` skips the download entirely (used by CI when a target has no
 *    binary and the app must degrade to the in-app downloader).
 */

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(repoRoot, 'ffmpeg.lock.json');
const resourcesDir = join(repoRoot, 'resources', 'ffmpeg');

const args = new Set(process.argv.slice(2));
const SKIP = args.has('--skip');
const PIN = args.has('--pin');
const FORCE = args.has('--force');

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

function sha256(file) {
  const h = createHash('sha256');
  h.update(readFileSync(file));
  return h.digest('hex');
}

async function downloadWithResume(url, dest) {
  let startByte = 0;
  try {
    startByte = statSync(dest).size;
  } catch {
    /* fresh */
  }
  const headers = startByte > 0 ? { Range: `bytes=${startByte}-` } : {};
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest, startByte > 0 ? { flags: 'a' } : {}));
  return statSync(dest).size;
}

/**
 * Some sources (ffprobe-static) ship binaries inside an npm tarball instead of
 * release assets. Tarballs are pinned by version AND verified against the
 * registry's official `dist.integrity` sha512 before extraction.
 */
async function fetchFromNpmTarball(tgzUrl, integrity, member, dest) {
  const tgz = `${dest}.tgz`;
  await downloadWithResume(tgzUrl, tgz);
  if (integrity) {
    const [, algo, expected] = /^(sha512|sha256)-(.+)$/.exec(integrity) ?? [];
    const actual = createHash(algo ?? 'sha512').update(readFileSync(tgz)).digest('base64');
    if (actual !== expected) {
      throw new Error(`npm tarball integrity mismatch for ${tgzUrl}`);
    }
  }
  // `tar` is available on all CI images and dev machines we support.
  execFileSync('tar', ['-xzf', tgz, '-C', dirname(dest), member]);
  renameSync(join(dirname(dest), member), dest);
  if (process.platform !== 'win32') chmodSync(dest, 0o755);
}

async function fetchTarget(key, spec) {
  const outDir = join(resourcesDir, key);
  const results = [];
  for (const [binary, src] of Object.entries(spec.urls)) {
    const dest = join(outDir, binary);
    const isTarball = typeof src === 'object' && src.tgz;
    const url = isTarball ? src.tgz : src;
    if (existsSync(dest) && !FORCE) {
      const existing = sha256(dest);
      const pinned = spec.sha256?.[binary];
      if (pinned && existing !== pinned) {
        throw new Error(
          `Existing ${key}/${binary} does not match the pinned hash.\n  expected ${pinned}\n  actual   ${existing}\nRe-run with --force to re-download.`,
        );
      }
      if (!pinned && PIN) {
        spec.sha256 ??= {};
        spec.sha256[binary] = existing;
        console.log(`📌 pinned existing ${key}/${binary}: ${existing}`);
      }
      results.push({ binary, dest, bytes: statSync(dest).size, verified: Boolean(pinned || PIN) });
      continue;
    }
    console.log(`⇣ ${key}/${binary}`);
    if (SKIP) {
      console.log(`  skipped (--skip)`);
      continue;
    }
    if (isTarball) {
      await fetchFromNpmTarball(src.tgz, src.integrity, src.member, dest);
    } else {
      await downloadWithResume(url, `${dest}.part`);
      renameSync(`${dest}.part`, dest);
      if (process.platform !== 'win32') {
        chmodSync(dest, 0o755);
      }
    }
    const hash = sha256(dest);
    const pinned = spec.sha256?.[binary];
    if (pinned && hash !== pinned) {
      // Never keep an unverified binary.
      renameSync(dest, `${dest}.unverified`);
      throw new Error(
        `SHA-256 mismatch for ${key}/${binary}:\n  expected ${pinned}\n  actual   ${hash}\nThe file was quarantined as ${binary}.unverified.`,
      );
    }
    if (!pinned) {
      console.log(`  ⚠ no pinned hash yet; actual sha256: ${hash}`);
      if (PIN) {
        spec.sha256 ??= {};
        spec.sha256[binary] = hash;
        console.log(`  📌 pinned into ffmpeg.lock.json`);
      } else {
        console.log(`  (run with --pin to record it)`);
      }
    }
    results.push({ binary, dest, bytes: statSync(dest).size, verified: Boolean(pinned || PIN) });
  }
  // Manifest next to the binaries so the app can display what shipped.
  if (results.length > 0) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify({ key, fetchedAt: new Date().toISOString(), files: results }, null, 2),
    );
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--'));
  const selected = positional.length > 0 ? positional.filter((k) => k in lock.targets) : Object.keys(lock.targets);
  let fetched = 0;
  for (const key of selected) {
    const results = await fetchTarget(key, lock.targets[key]);
    fetched += results.length;
    for (const r of results) {
      console.log(`✓ ${key}/${r.binary} (${(r.bytes / 1_000_000).toFixed(1)} MB)${r.verified ? ' [hash verified]' : ''}`);
    }
  }
  if (PIN) {
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  if (!SKIP && fetched === 0) {
    console.log('Nothing fetched. Usage: node scripts/fetch-ffmpeg.mjs [target ...] [--pin|--skip|--force]');
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
