/**
 * background.js — Service Worker for Badge Updates
 *
 * Tab Out's background script (Chrome, Edge, Firefox compatible).
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Uses browserApi (loaded via browser-polyfill.js in the newtab page)
 * for cross-browser compatibility. In the service worker context,
 * browserApi is not available yet — we import it inline.
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

// ——— Cross-browser API shim (service worker has no <script> tags) ———
const browserApi = (typeof browser !== 'undefined' && browser.runtime)
  ? browser
  : chrome;

// ——— Badge updater ——————————————————————————————————————————————————

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not browser internal pages, not extension pages.
 *
 * Filters out browser-specific protocol schemes:
 *   chrome:// chrome-extension:// (Chrome/Edge)
 *   moz-extension://               (Firefox)
 *   edge:// microsoft-edge://      (Edge)
 *   brave://                       (Brave)
 *   about:                         (Firefox about:blank, about:newtab, etc.)
 */
async function updateBadge() {
  try {
    const tabs = await browserApi.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('moz-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('microsoft-edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await browserApi.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green — you're in control
    } else if (count <= 20) {
      color = '#b8892e'; // Amber — things are piling up
    } else {
      color = '#b35a5a'; // Red — time to focus and close some tabs
    }

    await browserApi.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    browserApi.action.setBadgeText({ text: '' });
  }
}

// ——— Event listeners ————————————————————————————————————————————————

// Update badge when the extension is first installed
browserApi.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when the browser starts up
browserApi.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
browserApi.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
browserApi.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from internal pages)
browserApi.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ——— Initial run ————————————————————————————————————————————————————

// Run once immediately when the service worker first loads
updateBadge();
