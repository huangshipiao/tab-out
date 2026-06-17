/**
 * browser-polyfill.js — Cross-Browser API Abstraction Layer
 *
 * Unifies the chrome.* (Chrome/Edge) and browser.* (Firefox) namespaces
 * into a single browserApi object. All extension code uses browserApi.*
 * instead of chrome.* or browser.* directly.
 *
 * Firefox supports the chrome.* namespace natively (since Firefox 55+),
 * so we default to chrome.* as the baseline. The browser.* namespace
 * (Promise-based) is preferred when available.
 *
 * The critical fix: browserApi.runtime.getURL() automatically returns
 * the correct protocol prefix:
 *   Chrome/Edge:  chrome-extension://{id}/...
 *   Firefox:      moz-extension://{id}/...
 */

'use strict';

// Firefox exposes both browser.* and chrome.* namespaces.
// The browser.* namespace uses Promises natively (preferred).
// Chrome/Edge only have chrome.* (callback-based, but async/await works).
const browserApi = (typeof browser !== 'undefined' && browser.runtime)
  ? browser
  : chrome;
