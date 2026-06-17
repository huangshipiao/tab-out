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
const zlib = require('zlib');

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

  // 6. Copy icons (skip .svg — not allowed in Firefox/Edge store packages)
  const iconsSrc = path.join(ROOT, 'icons');
  const iconsDst = path.join(distDir, 'icons');
  copyDir(iconsSrc, iconsDst);
  // Remove any non-PNG files that may have been copied (e.g. icon.svg)
  for (const entry of fs.readdirSync(iconsDst, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith('.png')) {
      fs.unlinkSync(path.join(iconsDst, entry.name));
    }
  }

  // 7. Write merged manifest.json
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log(`  ✓ ${browser} build complete → ${path.relative(ROOT, distDir)}`);
}

/**
 * CRC32 calculation (same algorithm used in ZIP).
 */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Create a .zip archive using only Node.js built-in modules.
 * Paths inside the zip use forward slashes (required by AMO / Chrome Web Store).
 */
function createZip(sourceDir, outputPath) {
  const entries = [];

  function walk(dir, zipBase) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const zipPath = zipBase ? zipBase + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, zipPath);
      } else {
        entries.push({ localPath: fullPath, zipPath });
      }
    }
  }
  walk(sourceDir, '');

  const dosTimeDate = (() => {
    const now = new Date();
    const t = (now.getSeconds() >> 1) | (now.getMinutes() << 5) | (now.getHours() << 11);
    const d = now.getDate() | ((now.getMonth() + 1) << 5) | ((now.getFullYear() - 1980) << 9);
    return { dosTime: t, dosDate: d };
  })();

  const fileChunks = [];
  const centralEntries = [];
  let offset = 0;

  for (const { localPath, zipPath } of entries) {
    const raw = fs.readFileSync(localPath);
    const compressed = zlib.deflateRawSync(raw);
    const useStore = compressed.length >= raw.length; // store if deflate doesn't help
    const data = useStore ? raw : compressed;
    const compMethod = useStore ? 0 : 8;
    const crc = crc32(raw);
    const zipName = Buffer.from(zipPath, 'utf-8');

    // Local file header
    const lh = Buffer.alloc(30 + zipName.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(compMethod, 8);
    lh.writeUInt16LE(dosTimeDate.dosTime, 10);
    lh.writeUInt16LE(dosTimeDate.dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(zipName.length, 26);
    lh.writeUInt16LE(0, 28);
    zipName.copy(lh, 30);

    fileChunks.push(lh, data);

    // Central directory entry
    const cd = Buffer.alloc(46 + zipName.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(compMethod, 10);
    cd.writeUInt16LE(dosTimeDate.dosTime, 12);
    cd.writeUInt16LE(dosTimeDate.dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(zipName.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    zipName.copy(cd, 46);

    centralEntries.push(cd);
    offset += lh.length + data.length;
  }

  // End of central directory
  const cdOffset = offset;
  const cdSize = centralEntries.reduce((s, e) => s + e.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const result = Buffer.concat([...fileChunks, ...centralEntries, eocd]);
  fs.writeFileSync(outputPath, result);
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

  createZip(distDir, zipPath);

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
