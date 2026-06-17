/**
 * build.js — Tab Out Multi-Browser Build Script
 *
 * Zero-dependency build tool for generating browser-specific extension
 * distributions from a single shared source tree.
 *
 * Usage:
 *   node build.js chrome       Build for Chrome only
 *   node build.js edge         Build for Edge only
 *   node build.js firefox      Build for Firefox only
 *   node build.js all          Build for all three browsers
 *   node build.js pack chrome  Build + package as .zip (Chrome Web Store)
 *   node build.js pack edge    Build + package as .zip (Edge Add-ons)
 *   node build.js pack firefox Build + package as .zip (Firefox AMO)
 *
 * Output: dist/{browser}/       Unpacked extension (ready to load)
 *         dist/{browser}.zip    Packaged extension (if 'pack' mode)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;

// ——— Supported browsers ————————————————————————————————————————————
const BROWSERS = ['chrome', 'edge', 'firefox'];

// ——— File copy list: [source (relative to src/), dest (relative to dist root)] ———
const SRC_FILES = [
  ['app.js',              'app.js'],
  ['background.js',       'background.js'],
  ['index.html',          'index.html'],
  ['style.css',           'style.css'],
  ['lib/browser-polyfill.js', 'lib/browser-polyfill.js'],
];

// ——— Helpers ————————————————————————————————————————————————————————

/**
 * Deep merge two objects. b's values override a's.
 * Arrays are replaced (not concatenated).
 */
function deepMerge(a, b) {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key])
        && a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])) {
      result[key] = deepMerge(a[key], b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

/**
 * Recursively copy a directory.
 */
function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

/**
 * Build the extension for a single browser.
 */
function build(browser) {
  console.log(`\n  Building Tab Out for ${browser}...`);

  // 1. Load base manifest
  const baseManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifests', 'base.json'), 'utf-8')
  );

  // 2. Load browser-specific overlay
  const overlayPath = path.join(ROOT, 'manifests', `${browser}.json`);
  let overlay = {};
  if (fs.existsSync(overlayPath)) {
    overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf-8'));
  }

  // 3. Deep merge
  const manifest = deepMerge(baseManifest, overlay);

  // 3b. Firefox compat: older Firefox versions don't support service_worker.
  //     Use background.scripts (event page) instead and remove service_worker.
  if (browser === 'firefox' && manifest.background) {
    delete manifest.background.service_worker;
    if (!manifest.background.scripts || manifest.background.scripts.length === 0) {
      manifest.background.scripts = ['background.js'];
    }
  }

  // 4. Prepare dist directory
  const distDir = path.join(ROOT, 'dist', browser);
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 5. Copy source files
  const srcDir = path.join(ROOT, 'src');
  for (const [srcRel, dstRel] of SRC_FILES) {
    const src = path.join(srcDir, srcRel);
    const dst = path.join(distDir, dstRel);
    if (!fs.existsSync(src)) {
      console.warn(`    WARNING: ${srcRel} not found, skipping`);
      continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  // 6. Copy icons
  const iconsSrc = path.join(ROOT, 'icons');
  const iconsDst = path.join(distDir, 'icons');
  copyDir(iconsSrc, iconsDst);

  // 7. Write merged manifest.json
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log(`  ✓ ${browser} build complete → ${path.relative(ROOT, distDir)}`);
}

/**
 * Package a built extension as .zip for store submission.
 */
function pack(browser) {
  const distDir = path.join(ROOT, 'dist', browser);
  if (!fs.existsSync(distDir)) {
    console.error(`  ERROR: No build found for ${browser}. Run 'node build.js ${browser}' first.`);
    process.exit(1);
  }

  const zipPath = path.join(ROOT, 'dist', `${browser}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Use PowerShell Compress-Archive on Windows, zip on Unix
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}'"`;
    execSync(cmd, { stdio: 'pipe' });
  } else {
    // Unix: zip from inside the dist directory so paths are relative
    const cmd = `cd "${distDir}" && zip -r "${zipPath}" .`;
    execSync(cmd, { stdio: 'pipe' });
  }

  console.log(`  ✓ ${browser}.zip created → ${path.relative(ROOT, zipPath)}`);
}

// ——— Main ————————————————————————————————————————————————————————————

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node build.js [chrome|edge|firefox|all]');
  console.log('       node build.js pack [chrome|edge|firefox]');
  process.exit(0);
}

if (args[0] === 'pack') {
  if (args.length < 2) {
    console.error('Usage: node build.js pack [chrome|edge|firefox]');
    process.exit(1);
  }
  const browser = args[1].toLowerCase();
  if (!BROWSERS.includes(browser)) {
    console.error(`Unknown browser: ${browser}. Use: ${BROWSERS.join(', ')}`);
    process.exit(1);
  }
  // Ensure build is up to date
  build(browser);
  pack(browser);
} else if (args[0] === 'all') {
  for (const browser of BROWSERS) {
    build(browser);
  }
  console.log('\n  All builds complete.');
} else {
  const browser = args[0].toLowerCase();
  if (!BROWSERS.includes(browser)) {
    console.error(`Unknown browser: ${browser}. Use: ${BROWSERS.join(', ')}`);
    process.exit(1);
  }
  build(browser);
}
