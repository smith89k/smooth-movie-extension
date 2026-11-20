import { siteOf } from '../lib/guard.js';
import { getSettings, saveSettings } from '../lib/settings.js';

const $ = (id) => document.getElementById(id);
const BULB_COUNT = 17;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const site = siteOf(tab?.url);
let settings = await getSettings();

for (let i = 0; i < BULB_COUNT; i++) {
  const bulb = document.createElement('span');
  bulb.style.setProperty('--i', i);
  $('bulbs').append(bulb);
}

function render() {
  const { enabled, adBlock, boost, guardedSites } = settings;
  document.body.classList.toggle('is-off', !enabled);
  $('enabled').checked = enabled;
  $('status').textContent = enabled ? 'Working on every site' : 'Paused on every site';
  $('controls').disabled = !enabled;
  $('adBlock').checked = adBlock;
  $('boost').checked = boost;

  $('site-section').hidden = !site;
  $('no-site').hidden = Boolean(site);
  if (site) {
    $('site-name').textContent = site;
    $('guard').checked = guardedSites.includes(site);
  }
}

const amount = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function showCounts() {
  if (!tab) return;
  const adsKey = `ads:${tab.id}`;
  const popupsKey = `popups:${tab.id}`;
  const stored = await chrome.storage.session.get({ [adsKey]: 0, [popupsKey]: 0 });
  const ads = stored[adsKey];
  const popups = stored[popupsKey];

  $('ad-count').hidden = !site;
  $('ad-count').textContent = `Blocked ${amount(ads, 'ad', 'ads')} in this tab.`;

  $('popup-count').hidden = popups === 0;
  $('popup-count').textContent = `Closed ${amount(popups, 'pop-up tab', 'pop-up tabs')} in this tab.`;
}

async function change(patch, { needsReload }) {
  settings = { ...settings, ...patch };
  render();
  await saveSettings(patch);
  if (needsReload && site) $('reload').hidden = false;
}

$('enabled').addEventListener('change', (event) => {
  const enabled = event.target.checked;
  if (enabled) {
    document.body.classList.add('lighting-up');
    setTimeout(() => document.body.classList.remove('lighting-up'), 1000);
  }
  change({ enabled }, { needsReload: true });
});

$('adBlock').addEventListener('change', (event) => {
  change({ adBlock: event.target.checked }, { needsReload: true });
});

$('boost').addEventListener('change', (event) => {
  change({ boost: event.target.checked }, { needsReload: true });
});

// Closing pop-up tabs starts right away; no reload needed.
$('guard').addEventListener('change', (event) => {
  const sites = new Set(settings.guardedSites);
  if (event.target.checked) sites.add(site);
  else sites.delete(site);
  change({ guardedSites: [...sites] }, { needsReload: false });
});

$('reload-btn').addEventListener('click', async () => {
  await chrome.tabs.reload(tab.id);
  window.close();
});

chrome.storage.session.onChanged.addListener(showCounts);

render();
showCounts();
