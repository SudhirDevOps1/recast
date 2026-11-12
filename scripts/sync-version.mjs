#!/usr/bin/env node
/**
 * Single Source of Truth Version Synchronization Script for Recast.
 *
 * Ensures that whenever the version changes in package.json (or via CLI argument),
 * it is safely and atomically synchronized across:
 *   - Root & all workspace packages (apps/desktop, packages/*)
 *   - Release Please manifest (.release-please-manifest.json)
 *   - Shared constants (packages/shared/src/constants.ts PRODUCT_VERSION)
 *   - App code & MCP server
 *   - Website download metadata (apps/website/index.html softwareVersion)
 *   - Packaging manifests (AUR, Chocolatey, Scoop, Snapcraft, WinGet)
 *   - Documentation & Readme badges (README.md, STATUS.md, issue templates, workflows)
 *
 * Usage:
 *   node scripts/sync-version.mjs               # Syncs all files to match root package.json
 *   node scripts/sync-version.mjs 0.0.2         # Sets new version and syncs across entire repo
 *   node scripts/sync-version.mjs --bump patch  # Bumps patch version (e.g. 0.0.1 -> 0.0.2) and syncs
 *   node scripts/sync-version.mjs --bump minor  # Bumps minor version (e.g. 0.0.1 -> 0.1.0) and syncs
 *   node scripts/sync-version.mjs --bump major  # Bumps major version (e.g. 0.0.1 -> 1.0.0) and syncs
 *   node scripts/sync-version.mjs --check       # Verifies all files match root version (exits 1 on drift)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function readJson(relPath) {
  const full = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function writeJson(relPath, obj) {
  const full = path.join(ROOT, relPath);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.readFileSync(full, 'utf8');
}

function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.writeFileSync(full, content, 'utf8');
}

function bumpSemver(current, type) {
  const clean = current.split('-')[0];
  const parts = clean.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid current version for bumping: "${current}"`);
  }
  let [major, minor, patch] = parts;
  if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump type: "${type}". Expected patch, minor, or major.`);
  }
  return `${major}.${minor}.${patch}`;
}

export function syncVersion(options = {}) {
  const rootPkg = readJson('package.json');
  let targetVersion = options.version;

  if (options.bump) {
    targetVersion = bumpSemver(rootPkg.version, options.bump);
  } else if (!targetVersion) {
    targetVersion = rootPkg.version;
  }

  if (!SEMVER_REGEX.test(targetVersion)) {
    throw new Error(`Invalid semver version: "${targetVersion}". Expected format like "0.0.1" or "1.2.0".`);
  }

  const isCheckOnly = Boolean(options.check);
  const diffs = [];

  function record(file, desc, currentVal, expectedVal) {
    if (currentVal !== expectedVal) {
      diffs.push({ file, desc, current: currentVal, expected: expectedVal });
    }
  }

  // 1. Root package.json
  record('package.json', 'version', rootPkg.version, targetVersion);
  if (!isCheckOnly && rootPkg.version !== targetVersion) {
    rootPkg.version = targetVersion;
    writeJson('package.json', rootPkg);
  }

  // 2. All workspace package.json files
  const workspaceDirs = [
    'apps/desktop',
    'packages/capture',
    'packages/editor',
    'packages/export',
    'packages/mcp',
    'packages/shared',
    'packages/ui',
  ];

  for (const dir of workspaceDirs) {
    const pkgPath = `${dir}/package.json`;
    if (fs.existsSync(path.join(ROOT, pkgPath))) {
      const pkg = readJson(pkgPath);
      record(pkgPath, 'version', pkg.version, targetVersion);
      if (!isCheckOnly && pkg.version !== targetVersion) {
        pkg.version = targetVersion;
        writeJson(pkgPath, pkg);
      }
    }
  }

  // 3. Release Please Manifest (.release-please-manifest.json)
  if (fs.existsSync(path.join(ROOT, '.release-please-manifest.json'))) {
    const manifest = readJson('.release-please-manifest.json');
    record('.release-please-manifest.json', 'release-please "." version', manifest['.'] ?? '', targetVersion);
    if (!isCheckOnly && manifest['.'] !== targetVersion) {
      manifest['.'] = targetVersion;
      writeJson('.release-please-manifest.json', manifest);
    }
  }

  // 4. Shared Constants (packages/shared/src/constants.ts)
  const constantsPath = 'packages/shared/src/constants.ts';
  if (fs.existsSync(path.join(ROOT, constantsPath))) {
    const content = readFile(constantsPath);
    const regex = /export const PRODUCT_VERSION = '([^']+)';/;
    const match = content.match(regex);
    const curVal = match ? match[1] : '';
    record(constantsPath, 'PRODUCT_VERSION', curVal, targetVersion);
    if (!isCheckOnly) {
      if (match) {
        if (curVal !== targetVersion) {
          writeFile(constantsPath, content.replace(regex, `export const PRODUCT_VERSION = '${targetVersion}';`));
        }
      } else {
        // Append export const PRODUCT_VERSION at top after canonical identity values
        const updated = content.replace(
          /(export const PRODUCT_NAME = 'Recast';\r?\n)/,
          `$1export const PRODUCT_VERSION = '${targetVersion}';\n`,
        );
        writeFile(constantsPath, updated);
      }
    }
  }

  // 5. App Code: packages/mcp/src/server.ts
  const mcpServerPath = 'packages/mcp/src/server.ts';
  if (fs.existsSync(path.join(ROOT, mcpServerPath))) {
    const content = readFile(mcpServerPath);
    const regex = /(serverInfo:\s*\{[\s\S]*?version:\s*')([^']+)(')/;
    const match = content.match(regex);
    if (match) {
      record(mcpServerPath, 'MCP serverInfo.version', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(mcpServerPath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  // 6. App Code: apps/desktop/src/main/whisper.ts
  const whisperPath = 'apps/desktop/src/main/whisper.ts';
  if (fs.existsSync(path.join(ROOT, whisperPath))) {
    const content = readFile(whisperPath);
    const regex = /('User-Agent':\s*'[^']*Recast\/)([^']+)'/g;
    let match;
    let hasMatch = false;
    while ((match = regex.exec(content)) !== null) {
      hasMatch = true;
      record(whisperPath, 'Whisper User-Agent version', match[2], targetVersion);
    }
    if (!isCheckOnly && hasMatch) {
      const updated = content.replace(regex, `$1${targetVersion}'`);
      writeFile(whisperPath, updated);
    }
  }

  // 7. Website: apps/website/index.html
  const websitePath = 'apps/website/index.html';
  if (fs.existsSync(path.join(ROOT, websitePath))) {
    const content = readFile(websitePath);
    const regex = /("softwareVersion":\s*")([^"]+)(")/;
    const match = content.match(regex);
    if (match) {
      record(websitePath, 'softwareVersion schema in website', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(websitePath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  // 8. Packaging: packaging/aur/PKGBUILD
  const aurPath = 'packaging/aur/PKGBUILD';
  if (fs.existsSync(path.join(ROOT, aurPath))) {
    const content = readFile(aurPath);
    const regex = /(pkgver=)(\S+)/;
    const match = content.match(regex);
    if (match) {
      record(aurPath, 'pkgver', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(aurPath, content.replace(regex, `$1${targetVersion}`));
      }
    }
  }

  // 9. Packaging: packaging/choco/recast.nuspec
  const chocoPath = 'packaging/choco/recast.nuspec';
  if (fs.existsSync(path.join(ROOT, chocoPath))) {
    const content = readFile(chocoPath);
    const regex = /(<version>)([^<]+)(<\/version>)/;
    const match = content.match(regex);
    if (match) {
      record(chocoPath, 'nuspec version', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(chocoPath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  // 10. Packaging: packaging/scoop/recast.json
  const scoopPath = 'packaging/scoop/recast.json';
  if (fs.existsSync(path.join(ROOT, scoopPath))) {
    const scoop = readJson(scoopPath);
    record(scoopPath, 'scoop version', scoop.version ?? '', targetVersion);
    if (!isCheckOnly) {
      scoop.version = targetVersion;
      if (scoop.architecture?.['64bit']?.url) {
        scoop.architecture['64bit'].url = `https://github.com/SudhirDevOps1/recast/releases/download/v${targetVersion}/Recast-Portable-${targetVersion}.exe`;
      }
      scoop.bin = `Recast-Portable-${targetVersion}.exe`;
      scoop.shortcuts = [[`Recast-Portable-${targetVersion}.exe`, 'Recast']];
      writeJson(scoopPath, scoop);
    }
  }

  // 11. Packaging: packaging/snapcraft.yaml
  const snapPath = 'packaging/snapcraft.yaml';
  if (fs.existsSync(path.join(ROOT, snapPath))) {
    const content = readFile(snapPath);
    const regex = /(version:\s*')([^']+)(')/;
    const match = content.match(regex);
    if (match) {
      record(snapPath, 'snapcraft version', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(snapPath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  // 12. Packaging: packaging/winget/SudhirDevOps1.Recast.yaml
  const wingetPath = 'packaging/winget/SudhirDevOps1.Recast.yaml';
  if (fs.existsSync(path.join(ROOT, wingetPath))) {
    let content = readFile(wingetPath);
    const regexVer = /(PackageVersion:\s*)(\S+)/;
    const matchVer = content.match(regexVer);
    if (matchVer) {
      record(wingetPath, 'winget PackageVersion', matchVer[2], targetVersion);
      if (!isCheckOnly) {
        content = content.replace(regexVer, `$1${targetVersion}`);
        content = content.replace(
          /https:\/\/github\.com\/SudhirDevOps1\/recast\/releases\/download\/v[^/]+\/Recast-Setup-[^/]+\.exe/g,
          `https://github.com/SudhirDevOps1/recast/releases/download/v${targetVersion}/Recast-Setup-${targetVersion}.exe`,
        );
        writeFile(wingetPath, content);
      }
    }
  }

  // 13. README.md: badge and enterprise msi reference
  const readmePath = 'README.md';
  if (fs.existsSync(path.join(ROOT, readmePath))) {
    let content = readFile(readmePath);
    const badgeRegex = /(badge\/download-v)([^/-]+)(-2EA043)/;
    const badgeMatch = content.match(badgeRegex);
    if (badgeMatch) {
      record(readmePath, 'badge version', badgeMatch[2], targetVersion);
      if (!isCheckOnly && badgeMatch[2] !== targetVersion) {
        content = content.replace(badgeRegex, `$1${targetVersion}$3`);
      }
    }
    const msiRegex = /(msiexec \/i Recast-)([^/ ]+)(-enterprise\.msi)/;
    const msiMatch = content.match(msiRegex);
    if (msiMatch) {
      record(readmePath, 'msi command version', msiMatch[2], targetVersion);
      if (!isCheckOnly && msiMatch[2] !== targetVersion) {
        content = content.replace(msiRegex, `$1${targetVersion}$3`);
      }
    }
    if (!isCheckOnly) {
      writeFile(readmePath, content);
    }
  }

  // 14. STATUS.md: header version
  const statusPath = 'STATUS.md';
  if (fs.existsSync(path.join(ROOT, statusPath))) {
    const content = readFile(statusPath);
    const regex = /(\*\*v)([^ ]+)(\s+Enterprise Release Foundation\*\*)/;
    const match = content.match(regex);
    if (match) {
      record(statusPath, 'STATUS.md version', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(statusPath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  // 15. GitHub release workflow default tag: .github/workflows/release.yml
  const releaseWfPath = '.github/workflows/release.yml';
  if (fs.existsSync(path.join(ROOT, releaseWfPath))) {
    let content = readFile(releaseWfPath);
    const regexDefault = /(default:\s*'v)([^']+)'/;
    const matchDefault = content.match(regexDefault);
    if (matchDefault) {
      record(releaseWfPath, 'workflow release tag default', matchDefault[2], targetVersion);
      if (!isCheckOnly && matchDefault[2] !== targetVersion) {
        content = content.replace(regexDefault, `$1${targetVersion}'`);
      }
    }
    const regexDesc = /(description:\s*'Tag or version to release \(e\.g\. v)([^)]+)\)'/;
    const matchDesc = content.match(regexDesc);
    if (matchDesc) {
      record(releaseWfPath, 'workflow release tag description', matchDesc[2], targetVersion);
      if (!isCheckOnly && matchDesc[2] !== targetVersion) {
        content = content.replace(regexDesc, `$1${targetVersion})'`);
      }
    }
    if (!isCheckOnly) {
      writeFile(releaseWfPath, content);
    }
  }

  // 16. GitHub issue template placeholder: .github/ISSUE_TEMPLATE/bug_report.yml
  const bugReportPath = '.github/ISSUE_TEMPLATE/bug_report.yml';
  if (fs.existsSync(path.join(ROOT, bugReportPath))) {
    const content = readFile(bugReportPath);
    const regex = /(placeholder:\s*)([^\s(]+)(\s*\(build abc1234\))/;
    const match = content.match(regex);
    if (match) {
      record(bugReportPath, 'bug report placeholder version', match[2], targetVersion);
      if (!isCheckOnly && match[2] !== targetVersion) {
        writeFile(bugReportPath, content.replace(regex, `$1${targetVersion}$3`));
      }
    }
  }

  return {
    targetVersion,
    diffs,
    isCheckOnly,
  };
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const bumpIdx = args.indexOf('--bump');
  const bumpType = bumpIdx !== -1 ? args[bumpIdx + 1] : null;
  const versionArg = args.find((a) => !a.startsWith('--') && a !== bumpType);

  try {
    const result = syncVersion({
      version: versionArg,
      bump: bumpType,
      check: isCheck,
    });

    if (isCheck) {
      if (result.diffs.length > 0) {
        console.error(`\x1b[31m[ERROR]\x1b[0m Version drift detected across ${result.diffs.length} targets:`);
        for (const d of result.diffs) {
          console.error(`  - ${d.file} [${d.desc}]: found "${d.current}", expected "${d.expected}"`);
        }
        console.error(`\nRun \x1b[36mpnpm version:sync\x1b[0m to safely align all targets to v${result.targetVersion}.`);
        process.exit(1);
      } else {
        console.log(`\x1b[32m[OK]\x1b[0m All repo targets are in 100% sync at v${result.targetVersion}`);
        process.exit(0);
      }
    } else {
      if (result.diffs.length === 0) {
        console.log(`\x1b[32m[OK]\x1b[0m All targets were already in sync at v${result.targetVersion}`);
      } else {
        console.log(`\x1b[32m[SUCCESS]\x1b[0m Synchronized ${result.diffs.length} targets to v${result.targetVersion}:`);
        for (const d of result.diffs) {
          console.log(`  ✓ ${d.file} (${d.desc}: ${d.current || 'unset'} -> ${d.expected})`);
        }
      }
      process.exit(0);
    }
  } catch (err) {
    console.error(`\x1b[31m[FATAL]\x1b[0m ${err.message}`);
    process.exit(1);
  }
}
