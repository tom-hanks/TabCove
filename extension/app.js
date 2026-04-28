/* ================================================================
   TabCove — Sidebar Layout App
   ================================================================ */

'use strict';

/* ================================================================
   STATE
   ================================================================ */
let openTabs = [];
let savedTabs = [];
let suspendedTabs = [];
let recentlyClosed = [];
let currentView = 'all'; // 'all' | 'saved' | 'suspended' | 'history'
let searchQuery = '';

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadSavedTabs();
  loadSuspendedTabs();
  loadRecentlyClosed();
  setupTheme();
  setupNavigation();
  setupSearch();
  setupRefresh();
  setupVisibilityRefresh();
  await refresh();
}

function setupVisibilityRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh();
    }
  });
}

async function refresh() {
  await fetchOpenTabs();
  render();
  updateCounts();
  renderNavDomains();
}

/* ================================================================
   CHROME API
   ================================================================ */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;
    const tabs = await chrome.tabs.query({});
    openTabs = tabs
      .filter(t => !t.url.startsWith('chrome-extension://') && t.url !== 'chrome://newtab/')
      .map(t => ({
        id: t.id,
        url: t.url,
        title: t.title || '无标题',
        hostname: getHostname(t.url),
        lastAccessed: t.lastAccessed || Date.now(),
        active: t.active,
        discarded: t.discarded || false,
        favIconUrl: t.favIconUrl,
      }));
  } catch {
    openTabs = [];
  }
}

function getHostname(url) {
  try {
    if (url.startsWith('file://')) return '本地文件';
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    await refresh();
  } catch (e) {
    console.error('Failed to close tab:', e);
  }
}

async function focusTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tabId.windowId || (await chrome.tabs.get(tabId)).windowId, { focused: true });
  } catch (e) {
    console.error('Failed to focus tab:', e);
  }
}

async function discardTab(tabId) {
  try {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
      // 保存到休眠列表
      suspendedTabs.unshift({
        url: tab.url,
        title: tab.title,
        hostname: tab.hostname || getHostname(tab.url),
        favicon: tab.favIconUrl,
        suspendedAt: Date.now(),
      });
      saveSuspendedTabs();
      // 关闭标签
      await chrome.tabs.remove(tabId);
      showToast('已休眠');
      await refresh();
    }
  } catch (e) {
    console.error('Failed to discard tab:', e);
    showToast('休眠失败');
  }
}

async function wakeTab(url) {
  try {
    await chrome.tabs.create({ url, active: true });
    // 从休眠列表移除
    suspendedTabs = suspendedTabs.filter(t => t.url !== url);
    saveSuspendedTabs();
    showToast('已唤醒');
    render();
    updateCounts();
  } catch (e) {
    // 即使唤醒失败（如URL无效），也从休眠列表移除
    suspendedTabs = suspendedTabs.filter(t => t.url !== url);
    saveSuspendedTabs();
    render();
    updateCounts();
    showToast('唤醒失败');
  }
}

async function openUrl(url) {
  try {
    await chrome.tabs.create({ url, active: true });
  } catch (e) {
    console.error('Failed to open tab:', e);
  }
}

/* ================================================================
   STORAGE
   ================================================================ */
function loadSavedTabs() {
  chrome.storage.local.get(['deferred'], (res) => {
    savedTabs = res.deferred || [];
  });
}

function loadSuspendedTabs() {
  chrome.storage.local.get(['suspendedTabs'], (res) => {
    const tabs = res.suspendedTabs || [];
    // 清理无效数据并补充缺失字段
    suspendedTabs = tabs
      .filter(tab => tab.url) // 只保留有 URL 的条目
      .map(tab => ({
        url: tab.url,
        title: tab.title || '无标题',
        hostname: tab.hostname || getHostname(tab.url),
        favicon: tab.favicon || null,
        suspendedAt: typeof tab.suspendedAt === 'number' ? tab.suspendedAt :
                    typeof tab.suspendedAt === 'string' ? new Date(tab.suspendedAt).getTime() : Date.now(),
      }));
    saveSuspendedTabs(); // 保存清理后的数据
  });
}

function saveSuspendedTabs() {
  chrome.storage.local.set({ suspendedTabs });
}

function loadRecentlyClosed() {
  chrome.storage.local.get(['recentlyClosed'], (res) => {
    recentlyClosed = res.recentlyClosed || [];
  });
}

function saveSavedTabs() {
  chrome.storage.local.set({ deferred: savedTabs });
}

function saveRecentlyClosed() {
  chrome.storage.local.set({ recentlyClosed });
}

/* ================================================================
   THEME
   ================================================================ */
function setupTheme() {
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('tabout-theme') || 'dark';
  const savedAccent = localStorage.getItem('tabout-accent') || 'blue';

  function setTheme(theme) {
    html.dataset.theme = theme;
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    localStorage.setItem('tabout-theme', theme);
  }

  function setAccent(accent) {
    html.dataset.accent = accent;
    document.querySelectorAll('.accent-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.accent === accent);
    });
    localStorage.setItem('tabout-accent', accent);
  }

  setTheme(savedTheme);
  setAccent(savedAccent);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.addEventListener('click', () => setAccent(btn.dataset.accent));
  });
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      currentView = item.dataset.view;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      render();
    });
  });
}

/* ================================================================
   SEARCH
   ================================================================ */
function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    render();
  });
}

/* ================================================================
   REFRESH
   ================================================================ */
function setupRefresh() {
  document.getElementById('refreshBtn').addEventListener('click', refresh);
}

/* ================================================================
   RENDER
   ================================================================ */
function render() {
  const tabList = document.getElementById('tabList');
  const emptyState = document.getElementById('emptyState');
  const viewTitle = document.getElementById('viewTitle');
  const viewMeta = document.getElementById('viewMeta');

  let html = '';

  if (currentView === 'all') {
    viewTitle.textContent = '全部标签';
    html = renderAllTabs();
  } else if (currentView === 'saved') {
    viewTitle.textContent = '稍后阅读';
    html = renderSavedTabs();
  } else if (currentView === 'suspended') {
    viewTitle.textContent = '已休眠';
    html = renderSuspendedTabs();
  } else if (currentView === 'history') {
    viewTitle.textContent = '最近关闭';
    html = renderHistory();
  }

  tabList.innerHTML = html;
  emptyState.style.display = html ? 'none' : 'block';

  setupTabActions();
}

function renderAllTabs() {
  const domains = groupTabsByDomain(openTabs);
  let html = '';

  for (const [domain, tabs] of Object.entries(domains)) {
    const filteredTabs = tabs.filter(t =>
      t.title.toLowerCase().includes(searchQuery) ||
      t.url.toLowerCase().includes(searchQuery)
    );

    if (filteredTabs.length === 0) continue;

    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    html += `
      <div class="domain">
        <div class="domain-header">
          <img class="domain-favicon" src="${favicon}" alt="" onerror="this.style.display='none'">
          <span class="domain-name">${domain}</span>
          <span class="domain-count">${filteredTabs.length} 个标签</span>
          <div class="domain-actions">
            <button class="domain-btn discard-all" data-action="discard-domain" data-domain="${domain}">整休</button>
            <button class="domain-btn create" data-action="create-group" data-domain="${domain}">建组</button>
            <button class="domain-btn close-all" data-action="close-domain" data-domain="${domain}">全关</button>
          </div>
        </div>
        ${filteredTabs.map(tab => renderTabRow(tab)).join('')}
      </div>
    `;
  }

  return html;
}

function renderTabRow(tab) {
  const timeAgo = getTimeAgo(tab.lastAccessed);
  const timeClass = getTimeClass(tab.lastAccessed);
  const favicon = tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')
    ? tab.favIconUrl
    : getFaviconUrl(tab.hostname);

  return `
    <div class="tab-row" data-tab-id="${tab.id}">
      <img class="tab-favicon" src="${favicon}" alt="" onerror="this.style.display='none'">
      <span class="tab-title" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title)}</span>
      <span class="tab-time ${timeClass}">${timeAgo}</span>
      <div class="tab-actions">
        <button class="tab-action discard" data-action="discard-tab" data-tab-id="${tab.id}">休眠</button>
        <button class="tab-action group" data-action="group-tab" data-tab-id="${tab.id}">分组</button>
        <button class="tab-action save" data-action="save-tab" data-tab-id="${tab.id}">收藏</button>
        <button class="tab-action close" data-action="close-tab" data-tab-id="${tab.id}">关闭</button>
      </div>
    </div>
  `;
}

function renderSavedTabs() {
  if (savedTabs.length === 0) return '';

  return `
    <div class="saved-list">
      ${savedTabs.map(tab => `
        <div class="saved-item" data-saved-url="${escapeHtml(tab.url)}">
          <img class="saved-favicon" src="${getFaviconUrl(tab.hostname)}" alt="" onerror="this.style.display='none'">
          <div class="saved-info">
            <div class="saved-title" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title)}</div>
            <div class="saved-meta">${tab.hostname} · 保存于 ${getTimeAgo(tab.savedAt)}</div>
          </div>
          <div class="saved-actions">
            <button class="saved-action open" data-action="open-saved" data-url="${escapeHtml(tab.url)}">打开</button>
            <button class="saved-action delete" data-action="delete-saved" data-url="${escapeHtml(tab.url)}">删除</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHistory() {
  if (recentlyClosed.length === 0) return '';

  return `
    <div class="history-list">
      ${recentlyClosed.map(item => `
        <div class="history-item" data-history-url="${escapeHtml(item.url)}">
          <img class="history-favicon" src="${getFaviconUrl(item.hostname)}" alt="" onerror="this.style.display='none'">
          <div class="history-info">
            <div class="history-title" title="${escapeHtml(item.url)}">${escapeHtml(item.title)}</div>
          </div>
          <span class="history-time">${getTimeAgo(item.closedAt)}</span>
          <button class="history-action" data-action="restore" data-url="${escapeHtml(item.url)}">恢复</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSuspendedTabs() {
  if (suspendedTabs.length === 0) return '';

  // 清理无效数据：没有URL或时间戳不存在的条目
  const validTabs = suspendedTabs.filter(tab => tab.url && tab.suspendedAt);

  return `
    <div class="suspended-list">
      ${validTabs.map(tab => {
        const hostname = tab.hostname || getHostname(tab.url);
        const suspendedTime = typeof tab.suspendedAt === 'number' ? tab.suspendedAt : Date.now();
        return `
        <div class="suspended-item" data-suspended-url="${escapeHtml(tab.url)}">
          <span class="suspended-icon">💤</span>
          <img class="suspended-favicon" src="${getFaviconUrl(hostname)}" alt="" onerror="this.style.display='none'">
          <div class="suspended-info">
            <div class="suspended-title" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title || '无标题')}</div>
            <div class="suspended-meta">${hostname} · 休眠于 ${getTimeAgo(suspendedTime)}</div>
          </div>
          <div class="suspended-actions">
            <button class="suspended-action wake" data-action="wake-tab" data-url="${escapeHtml(tab.url)}">唤醒</button>
            <button class="suspended-action delete" data-action="delete-suspended" data-url="${escapeHtml(tab.url)}">删除</button>
          </div>
        </div>
      `}).join('')}
    </div>
  `;
}

/* ================================================================
   ACTIONS
   ================================================================ */
function setupTabActions() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleAction);
  });

  document.querySelectorAll('.tab-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const tabId = parseInt(row.dataset.tabId);
      focusTab(tabId);
    });
  });
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;
  const tabId = e.currentTarget.dataset.tabId ? parseInt(e.currentTarget.dataset.tabId) : null;
  const url = e.currentTarget.dataset.url;
  const domain = e.currentTarget.dataset.domain;

  switch (action) {
    case 'close-tab':
      if (tabId) {
        const tab = openTabs.find(t => t.id === tabId);
        if (tab) {
          addToRecentlyClosed(tab);
          await closeTab(tabId);
          showToast('已关闭');
        }
      }
      break;

    case 'discard-tab':
      if (tabId) {
        await discardTab(tabId);
      }
      break;

    case 'save-tab':
      if (tabId) {
        const tab = openTabs.find(t => t.id === tabId);
        if (tab) {
          savedTabs.unshift({
            url: tab.url,
            title: tab.title,
            hostname: tab.hostname,
            favicon: tab.favIconUrl,
            savedAt: Date.now(),
          });
          saveSavedTabs();
          showToast('已保存');
          updateCounts();
        }
      }
      break;

    case 'open-saved':
      if (url) {
        await openUrl(url);
      }
      break;

    case 'delete-saved':
      if (url) {
        savedTabs = savedTabs.filter(t => t.url !== url);
        saveSavedTabs();
        render();
        updateCounts();
        showToast('已删除');
      }
      break;

    case 'wake-tab':
      if (url) {
        await wakeTab(url);
        showToast('已唤醒');
      }
      break;

    case 'delete-suspended':
      if (url) {
        suspendedTabs = suspendedTabs.filter(t => t.url !== url);
        saveSuspendedTabs();
        render();
        updateCounts();
        showToast('已删除');
      }
      break;

    case 'restore':
      if (url) {
        await openUrl(url);
      }
      break;

    case 'close-domain':
      if (domain) {
        const tabs = openTabs.filter(t => t.hostname === domain);
        for (const tab of tabs) {
          addToRecentlyClosed(tab);
        }
        await closeTabsByUrls(tabs.map(t => t.url));
        showToast(`已关闭 ${tabs.length} 个标签`);
      }
      break;

    case 'discard-domain':
      if (domain) {
        try {
          const tabs = openTabs.filter(t => t.hostname === domain && !t.discarded);
          if (tabs.length > 0) {
            for (const tab of tabs) {
              await chrome.tabs.discard(tab.id);
            }
            showToast(`已休眠 ${tabs.length} 个标签`);
            await refresh();
          } else {
            showToast('无可休眠标签');
          }
        } catch (e) {
          console.error('Failed to discard domain tabs:', e);
          showToast('休眠失败');
        }
      }
      break;

    case 'create-group':
      if (domain) {
        try {
          const tabs = openTabs.filter(t => t.hostname === domain);
          if (tabs.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: tabs.map(t => t.id) });
            showToast(`已创建分组`);
          }
        } catch (e) {
          console.error('Failed to create group:', e);
          showToast('分组失败');
        }
      }
      break;
  }
}

async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith('file://')) {
      exactUrls.add(u);
    } else {
      try { targetHostnames.push(new URL(u).hostname); }
      catch { /* skip */ }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(tab => {
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('file://') && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch { return false; }
    })
    .map(tab => tab.id);

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await refresh();
}

/* ================================================================
   RECENTLY CLOSED
   ================================================================ */
function addToRecentlyClosed(tab) {
  const existing = recentlyClosed.findIndex(t => t.url === tab.url);
  if (existing !== -1) {
    recentlyClosed.splice(existing, 1);
  }
  recentlyClosed.unshift({
    url: tab.url,
    title: tab.title,
    hostname: tab.hostname,
    favicon: tab.favIconUrl,
    closedAt: Date.now(),
  });
  if (recentlyClosed.length > 50) {
    recentlyClosed = recentlyClosed.slice(0, 50);
  }
  saveRecentlyClosed();
}

/* ================================================================
   UTILITIES
   ================================================================ */
function groupTabsByDomain(tabs) {
  const groups = {};
  for (const tab of tabs) {
    const domain = tab.hostname;
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(tab);
  }
  return groups;
}

function getFaviconUrl(hostname) {
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

function getTimeClass(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 300) return 'recent';
  if (seconds < 3600) return 'medium';
  if (seconds < 86400) return 'neutral';
  return 'old';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateCounts() {
  document.getElementById('totalCount').textContent = openTabs.length;
  document.getElementById('savedCount').textContent = savedTabs.length;
  document.getElementById('suspendedCount').textContent = suspendedTabs.length;
  document.getElementById('historyCount').textContent = recentlyClosed.length;

  const viewMeta = document.getElementById('viewMeta');
  if (currentView === 'all') {
    viewMeta.textContent = `${openTabs.length} 个标签`;
  } else if (currentView === 'saved') {
    viewMeta.textContent = `${savedTabs.length} 个保存`;
  } else if (currentView === 'suspended') {
    viewMeta.textContent = `${suspendedTabs.length} 个休眠`;
  } else if (currentView === 'history') {
    viewMeta.textContent = `${recentlyClosed.length} 条记录`;
  }
}

function renderNavDomains() {
  const navDomains = document.getElementById('navDomains');
  if (!navDomains) return;

  const domains = groupTabsByDomain(openTabs);
  const domainEntries = Object.entries(domains)
    .filter(([domain]) => !domain.startsWith('__'))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  if (domainEntries.length === 0) {
    navDomains.innerHTML = '<div class="nav-label" style="padding: 8px 12px; font-size: 11px; color: var(--text-muted);">暂无域名</div>';
    return;
  }

  navDomains.innerHTML = domainEntries.map(([domain, tabs]) => {
    const favicon = getFaviconUrl(domain);
    return `
      <div class="nav-domain-item" data-domain="${domain}">
        <img src="${favicon}" alt="" onerror="this.style.display='none'">
        <span class="domain-text">${domain}</span>
        <span class="nav-count">${tabs.length}</span>
      </div>
    `;
  }).join('');

  navDomains.querySelectorAll('.nav-domain-item').forEach(item => {
    item.addEventListener('click', () => {
      const domain = item.dataset.domain;
      document.querySelectorAll('.nav-domain-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      filterByDomain(domain);
    });
  });
}

function filterByDomain(domain) {
  if (currentView !== 'all') {
    currentView = 'all';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.nav-item[data-view="all"]')?.classList.add('active');
  }
  searchQuery = domain;
  render();
  searchQuery = '';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  toastText.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}
