# Tab Out

**Keep tabs on your tabs.**

Tab Out is a cross-browser extension that replaces your new tab page with a dashboard of everything you have open. Tabs are grouped by domain, with homepages (Gmail, X, LinkedIn, etc.) pulled into their own group. Close tabs with a satisfying swoosh + confetti.

**Supports Chrome, Edge, and Firefox** — one codebase, three browsers.

No server. No account. No external API calls. Just a browser extension.

---

## Browsers Supported

| Browser | Status | Install |
|---------|--------|---------|
| Chrome  | Full support | `dist/chrome/` (Load unpacked) |
| Edge    | Full support | `dist/edge/` (Load unpacked) |
| Firefox | Full support | `dist/firefox/` (Load Temporary Add-on) |

---

## Install with a coding agent

Send your coding agent (Claude Code, Codex, etc.) this repo and say **"install this"**:

```
https://github.com/huangshipiao/tab-out
```

The agent will walk you through it. Takes about 1 minute.

---

## Features

- **See all your tabs at a glance** on a clean grid, grouped by domain
- **Homepages group** pulls Gmail inbox, X home, YouTube, LinkedIn, GitHub homepages into one card
- **Close tabs with style** with swoosh sound + confetti burst
- **Duplicate detection** flags when you have the same page open twice, with one-click cleanup
- **Click any tab to jump to it** across windows, no new tab opened
- **Save for later** bookmark tabs to a checklist before closing them
- **Localhost grouping** shows port numbers next to each tab so you can tell your vibe coding projects apart
- **Expandable groups** show the first 8 tabs with a clickable "+N more"
- **100% local** your data never leaves your machine
- **Cross-browser** one codebase supports Chrome, Edge, and Firefox

---

## Development Setup

### Project Structure

```
tab-out/
├── src/                    # Shared source code
│   ├── app.js              # Dashboard logic (browserApi.*)
│   ├── background.js       # Service worker (badge updates)
│   ├── index.html          # New tab page
│   ├── style.css           # Styles
│   └── lib/
│       └── browser-polyfill.js  # Cross-browser API abstraction
├── manifests/              # Per-browser manifest overlays
│   ├── base.json           # Common configuration
│   ├── chrome.json         # Chrome overlay (empty)
│   ├── edge.json           # Edge overlay (empty)
│   └── firefox.json        # Firefox overlay (browser_specific_settings)
├── icons/                  # Shared icons
├── build.js                # Zero-dependency build script
├── package.json            # Build scripts only
└── README.md
```

### Build Commands

```bash
# Build for all browsers
npm run build

# Build for a specific browser
npm run build:chrome
npm run build:edge
npm run build:firefox

# Package for store submission
npm run pack:chrome
npm run pack:edge
npm run pack:firefox
```

Output goes to `dist/` — each browser gets its own directory with the correct manifest.

---

## Manual Setup

### Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/chrome/` folder (after running `npm run build:chrome`)

Alternatively, for quick dev: load the `extension/` folder directly (legacy Chrome-only source).

### Edge

1. Open Edge and go to `edge://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/edge/` folder (after running `npm run build:edge`)

### Firefox

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select any file in the `dist/firefox/` folder (e.g., `manifest.json`)
4. Firefox will ask: "Allow this extension to control your new tab?" — click **Allow**

**Note**: In Firefox, temporary add-ons are removed when the browser restarts. For permanent install, submit to Firefox Add-ons (AMO) or use `about:config` to set `xpinstall.signatures.required` to `false` (Developer Edition / Nightly only).

---

## How it works

```
You open a new tab
  -> Tab Out shows your open tabs grouped by domain
  -> Homepages (Gmail, X, etc.) get their own group at the top
  -> Click any tab title to jump to it
  -> Close groups you're done with (swoosh + confetti)
  -> Save tabs for later before closing them
```

Everything runs inside the browser extension. No external server, no API calls, no data sent anywhere. Saved tabs are stored in the browser's local storage.

---

## Tech stack

| What | How |
|------|-----|
| Extension | Manifest V3 (WebExtensions) |
| API Layer | Lightweight browserApi polyfill |
| Storage | browser.storage.local / chrome.storage.local |
| Sound | Web Audio API (synthesized, no files) |
| Animations | CSS transitions + JS confetti particles |
| Build | Zero-dependency Node.js script |

---

## Cross-Browser Architecture

Tab Out uses a lightweight API abstraction layer (`lib/browser-polyfill.js`) to unify the `chrome.*` (Chrome/Edge) and `browser.*` (Firefox) namespaces into a single `browserApi` object. Key compatibility fixes:

- **URL protocols**: `browserApi.runtime.getURL()` automatically returns the correct protocol (`chrome-extension://` vs `moz-extension://`)
- **Internal page filtering**: Filters out browser-specific pages (`chrome://`, `edge://`, `microsoft-edge://`, `moz-extension://`, `about:`, `brave://`)
- **New tab detection**: Handles `chrome://newtab/` and `about:newtab` (Firefox)

---

## License

MIT

---

Built by [huangshipiao](https://github.com/huangshipiao)
