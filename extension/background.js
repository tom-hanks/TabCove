/**
 * background.js — Service Worker for Badge Updates
 *
 * Chrome's "always-on" background script for Tab Out.
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Since we no longer have a server, we query chrome.tabs directly.
 * The badge counts real web tabs (skipping chrome:// and extension pages).
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

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

    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();

// ─── Open Tab Out page when clicking toolbar icon ──────────────────────────────

chrome.action.onClicked.addListener(async () => {
  const extensionId = chrome.runtime.id;
  const tabOutUrl = `chrome-extension://${extensionId}/index.html`;

  // Check if Tab Out page is already open
  const tabs = await chrome.tabs.query({ url: tabOutUrl });

  if (tabs.length > 0) {
    // If already open, switch to that tab
    await chrome.tabs.update(tabs[0].id, { active: true });
    // Bring the window to front
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    // Open a new tab with Tab Out
    await chrome.tabs.create({ url: tabOutUrl });
  }
});

// ─── Tab Suspender ───────────────────────────────────────────────

const SUSPEND_CHECK_INTERVAL = 5 * 60 * 1000; // 每5分钟检测一次

/**
 * checkAndSuspendIdleTabs()
 *
 * 检测并休眠闲置的标签
 */
async function checkAndSuspendIdleTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    // 从存储中读取阈值
    const { suspendThresholdHours = 2 } = await chrome.storage.local.get('suspendThresholdHours');
    const thresholdMs = suspendThresholdHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const tab of tabs) {
      // 跳过固定标签、内部页面、Tab Out 页面
      if (tab.pinned) continue;
      if (!tab.url || tab.url.startsWith('chrome://')) continue;
      if (tab.url.includes('chrome-extension://')) continue;

      // 检查是否已休眠
      if (tab.url.includes('/suspended.html')) continue;

      // 检查是否超时
      if (tab.lastAccessed && (now - tab.lastAccessed) >= thresholdMs) {
        const extensionId = chrome.runtime.id;
        const suspendedUrl = `chrome-extension://${extensionId}/suspended.html?url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`;

        await chrome.tabs.update(tab.id, { url: suspendedUrl });
      }
    }
  } catch (err) {
    console.warn('[tab-out] Suspend check failed:', err);
  }
}

// 定时检测
setInterval(checkAndSuspendIdleTabs, SUSPEND_CHECK_INTERVAL);

// 启动时检测一次
checkAndSuspendIdleTabs();
