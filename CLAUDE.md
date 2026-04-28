# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabCove is a Chrome extension (Manifest V3) that replaces the new tab page with a dashboard showing all open tabs grouped by domain. No server, no npm, no build step — the `extension/` folder loads directly into Chrome.

## Commands

**Load the extension:**
1. Open `chrome://extensions`
2. Enable Developer mode (top-right toggle)
3. Click "Load unpacked" and select the `extension/` folder

**Update after code changes:**
Reload the extension in `chrome://extensions`

There are no test, lint, or build commands — vanilla JS with no dependencies.

## Architecture

```
extension/
├── manifest.json     # Chrome extension config (Manifest V3)
├── background.js     # Service worker — toolbar badge with tab count
├── app.js            # Main dashboard logic (~1500 lines)
├── index.html        # New tab page (replaces chrome://newtab)
├── style.css         # All styles
└── config.local.js   # Optional personal overrides (gitignored)
```

### `background.js` — Service Worker
Runs independently of the page. Its only job: update the toolbar badge showing open tab count with color coding:
- Green (#3d7a4a): 1–10 tabs
- Amber (#b8892e): 11–20 tabs
- Red (#b35a5a): 21+ tabs

### `app.js` — Main App
The brain of the dashboard. Key sections:
1. **Chrome API access** — `chrome.tabs.query()`, `chrome.storage.local`
2. **Tab grouping** — groups tabs by domain; landing pages (Gmail, X, LinkedIn, YouTube, GitHub) get special `__landing-pages__` group
3. **Custom groups** — `config.local.js` can define `LOCAL_CUSTOM_GROUPS` for custom domain merging/splitting and `LOCAL_LANDING_PAGE_PATTERNS` for additional landing page rules
4. **Title cleanup** — `FRIENDLY_DOMAINS` map, `smartTitle()`, `cleanTitle()`, `stripTitleNoise()` for friendly display names
5. **Sound** — Web Audio API synthesized swoosh (no audio files)
6. **Confetti** — Pure CSS + JS particle system
7. **Event delegation** — Single click listener on `document` handles all actions via `data-action` attributes

### Data Storage
- Saved tabs stored in `chrome.storage.local` under `deferred` key
- Shape: `[{ id, url, title, savedAt, completed, dismissed, completedAt }]`
- No server, no external API calls

### Landing Page Detection
Homepages for Gmail, X, LinkedIn, YouTube, GitHub are detected via `LANDING_PAGE_PATTERNS` and grouped separately so closing "Gmail" doesn't close individual email tabs. `config.local.js` can extend this via `LOCAL_LANDING_PAGE_PATTERNS`.

### Custom Group Support
`config.local.js` can define `LOCAL_CUSTOM_GROUPS` array with rules like:
```js
LOCAL_CUSTOM_GROUPS = [{
  hostname: 'github.com',
  pathPrefix: '/org/',
  groupKey: 'github-orgs',
  groupLabel: 'GitHub Orgs'
}]
```
