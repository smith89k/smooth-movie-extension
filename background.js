// Background worker: turns the ad list on and off, and closes pop-up tabs
// opened by sites the user has guarded.
import { shouldCloseNewTab } from './lib/guard.js';
import { getSettings } from './lib/settings.js';

async function applyAdBlocking() {
  const { enabled, adBlock } = await getSettings();
  const on = enabled && adBlock;
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    on ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] },
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  // Keep the toolbar icon clean: no blocked-count number drawn over it.
  // (Chrome remembers this choice, so turn it off on every install and update.)
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: false });
  await applyAdBlocking();
});

chrome.runtime.onStartup.addListener(applyAdBlocking);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('enabled' in changes || 'adBlock' in changes)) applyAdBlocking();
});

// ---------- counts shown in the menu ----------

// Counts are kept per tab ("ads:12", "popups:12") and cleared when the tab closes.
// Updates run one at a time so none get lost when many ads load at once.
let counting = Promise.resolve();
function addOne(kind, tabId) {
  const key = `${kind}:${tabId}`;
  counting = counting
    .then(async () => {
      const stored = await chrome.storage.session.get({ [key]: 0 });
      await chrome.storage.session.set({ [key]: stored[key] + 1 });
    })
    .catch(() => {});
  return counting;
}

// Chrome reports each ad it stopped as a request "blocked by client".
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId >= 0 && details.error === 'net::ERR_BLOCKED_BY_CLIENT') addOne('ads', details.tabId);
  },
  { urls: ['<all_urls>'] },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([`ads:${tabId}`, `popups:${tabId}`]);
});

// ---------- pop-up tabs ----------

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  const [settings, source] = await Promise.all([
    getSettings(),
    chrome.tabs.get(details.sourceTabId).catch(() => null),
  ]);
  if (!source) return;

  const close = shouldCloseNewTab({
    sourceUrl: source.url,
    targetUrl: details.url,
    guardedSites: settings.guardedSites,
    enabled: settings.enabled,
  });
  if (!close) return;

  await chrome.tabs.remove(details.tabId).catch(() => {});
  // Pop-up tricks often hide the movie tab; bring it back to the front.
  await chrome.windows.update(source.windowId, { focused: true }).catch(() => {});
  await chrome.tabs.update(source.id, { active: true }).catch(() => {});
  await addOne('popups', source.id);
});
