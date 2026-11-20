// Real-browser check: starts Chrome with the extension loaded and tries it
// on small test pages served from this computer.
//   npm run test:browser
// Set CHROME_PATH if Chrome is somewhere else. Set SHOW=1 to watch it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '..');
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const shotsDir = path.join(here, 'screenshots');

const files = {
  '/hls.min.js': path.join(extensionDir, 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
};

let server;
let second;
let port;
let browser;
let worker;
let extensionId;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const url = (host, page) => `http://${host}:${port}/${page}`;

async function setSettings(values) {
  await worker.evaluate((v) => chrome.storage.local.set(v), values);
  await sleep(200);
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://x').pathname;
    const file = files[name] ?? path.join(here, 'pages', path.basename(name));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  // also answer on "localhost" so we have two different sites
  port = server.address().port;
  second = http.createServer((req, res) => server.emit('request', req, res));
  await new Promise((resolve) => second.listen(port, '::1', resolve).on('error', resolve));

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: process.env.SHOW ? false : true,
    pipe: true,
    enableExtensions: [extensionDir],
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 15000 },
  );
  worker = await target.worker();
  extensionId = new URL(target.url()).host;
});

after(async () => {
  await Promise.race([browser?.close(), sleep(5000)]);
  browser?.process()?.kill();
  for (const s of [server, second]) {
    s?.closeAllConnections();
    s?.close();
  }
});

test('the extension loads in Chrome', () => {
  assert.match(extensionId, /^[a-p]{32}$/);
});

test('ad scripts are blocked and ad boxes are hidden', async () => {
  const page = await browser.newPage();
  const blocked = [];
  page.on('requestfailed', (r) => blocked.push(`${new URL(r.url()).host} ${r.failure()?.errorText}`));
  await page.goto(url('localhost', 'ads.html'), { waitUntil: 'networkidle0' });
  assert.ok(blocked.includes('pagead2.googlesyndication.com net::ERR_BLOCKED_BY_CLIENT'), blocked.join('\n'));
  assert.ok(blocked.includes('c1.popads.net net::ERR_BLOCKED_BY_CLIENT'), blocked.join('\n'));
  const display = await page.$eval('#ad-box', (el) => getComputedStyle(el).display);
  assert.equal(display, 'none');
  await page.close();
});

test('no number is drawn over the icon after ads are blocked', async () => {
  const page = await browser.newPage();
  await page.goto(url('localhost', 'ads.html'), { waitUntil: 'networkidle0' });
  const badge = await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url?.includes('ads.html'));
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  assert.equal(badge, '');
  await page.close();
});

test('the menu shows how many ads were blocked in this tab', async () => {
  const page = await browser.newPage();
  await page.goto(url('localhost', 'ads.html'), { waitUntil: 'networkidle0' });
  await page.bringToFront();
  const menuTarget = browser.waitForTarget((t) => t.url().endsWith('/popup/popup.html'), { timeout: 5000 });
  await worker.evaluate(() => chrome.action.openPopup());
  const menu = await (await menuTarget).asPage();
  await menu.waitForSelector('#ad-count:not([hidden])');
  assert.equal(await menu.$eval('#ad-count', (el) => el.textContent), 'Blocked 2 ads in this tab.');
  await menu.screenshot({ path: path.join(shotsDir, 'menu-ad-count.png') });
  await menu.close();
  await page.close();
});

test('the real hls.js player buffers two minutes ahead', async () => {
  const page = await browser.newPage();
  await page.goto(url('localhost', 'player.html'));
  const result = await page.evaluate(() => window.result);
  assert.deepEqual(result, {
    maxBufferLength: 120,
    backBufferLength: 30,
    abrBandWidthFactor: 0.8,
    supported: true,
    isHls: true,
    eventsWork: true,
  });
  await page.close();
});

test('a player inside a box from another site is boosted too', async () => {
  const page = await browser.newPage();
  await page.goto(url('localhost', 'frame-host.html'), { waitUntil: 'load' });
  const frame = await page.waitForFrame((f) => f.url().includes('127.0.0.1') && f.url().includes('player'));
  await frame.waitForFunction(() => window.result);
  assert.equal(await frame.evaluate(() => window.result.maxBufferLength), 120);
  await page.close();
});

test('turning smoother playback off leaves the player as it was', async () => {
  await setSettings({ boost: false });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'player.html'));
  assert.equal(await page.evaluate(() => window.result.maxBufferLength), 30);
  await page.close();
  await setSettings({ boost: true });
});

async function clickAndWatchNewTab(page, selector) {
  const opened = browser.waitForTarget((t) => t.opener() === page.target(), { timeout: 5000 });
  await page.click(selector);
  const target = await opened;
  await sleep(1500);
  const stillOpen = (await browser.pages()).some((p) => p.target() === target);
  return { url: target.url(), stillOpen };
}

test('pop-up tabs stay open on sites that are not guarded', async () => {
  await setSettings({ guardedSites: [] });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'popups.html'));
  const popup = await clickAndWatchNewTab(page, '#play');
  assert.equal(popup.stillOpen, true);
  for (const p of await browser.pages()) if (p.url().includes('landing')) await p.close();
  await page.close();
});

test('pop-up tabs to other sites are closed on a guarded site', async () => {
  await setSettings({ guardedSites: ['localhost'] });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'popups.html'));
  const created = [];
  const onCreated = (t) => created.push(t.url());
  browser.on('targetcreated', onCreated);
  await page.click('#play');
  await sleep(2000);
  browser.off('targetcreated', onCreated);

  const openTabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url));
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.includes('popups.html'))?.id;
  });
  const counts = await worker.evaluate(() => chrome.storage.session.get(null));
  const report = JSON.stringify({ created, openTabs, counts }, null, 1);

  assert.ok(!openTabs.some((u) => u?.includes('landing')), report);
  // The count proves the tab really opened and the extension closed it.
  assert.equal(counts[`popups:${tabId}`], 1, report);
  await page.close();
});

test('new tabs on the same site still open on a guarded site', async () => {
  await setSettings({ guardedSites: ['localhost'] });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'popups.html'));
  const tab = await clickAndWatchNewTab(page, '#same-site');
  assert.equal(tab.stillOpen, true);
  for (const p of await browser.pages()) if (p.url().includes('landing')) await p.close();
  await page.close();
});

test('the big switch turns pop-up closing off', async () => {
  await setSettings({ guardedSites: ['localhost'], enabled: false });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'popups.html'));
  const popup = await clickAndWatchNewTab(page, '#play');
  assert.equal(popup.stillOpen, true);
  for (const p of await browser.pages()) if (p.url().includes('landing')) await p.close();
  await page.close();
  await setSettings({ enabled: true, guardedSites: [] });
});

test('the big switch turns ad blocking off', async () => {
  await setSettings({ enabled: false });
  const page = await browser.newPage();
  const blocked = [];
  page.on('requestfailed', (r) => blocked.push(r.failure()?.errorText));
  await page.goto(url('localhost', 'ads.html'), { waitUntil: 'networkidle0' }).catch(() => {});
  assert.ok(!blocked.includes('net::ERR_BLOCKED_BY_CLIENT'), blocked.join('\n'));
  await page.close();
  await setSettings({ enabled: true });
});

test('the menu offers to close pop-up tabs on the open movie page', async () => {
  await setSettings({ guardedSites: [] });
  const page = await browser.newPage();
  await page.goto(url('localhost', 'popups.html'));
  await page.bringToFront();
  const menuTarget = browser.waitForTarget((t) => t.url().endsWith('/popup/popup.html'), { timeout: 5000 });
  await worker.evaluate(() => chrome.action.openPopup());
  const menu = await (await menuTarget).asPage();
  await menu.waitForSelector('#site-section:not([hidden])');
  assert.equal(await menu.$eval('#site-name', (el) => el.textContent), 'localhost');

  await menu.click('#guard');
  await sleep(300);
  const { guardedSites } = await worker.evaluate(() => chrome.storage.local.get('guardedSites'));
  assert.deepEqual(guardedSites, ['localhost']);
  await menu.screenshot({ path: path.join(shotsDir, 'menu-site.png') });

  await setSettings({ guardedSites: [] });
  await menu.close();
  await page.close();
});

test('the menu shows the settings', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 420, deviceScaleFactor: 2 });
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await page.waitForSelector('.bulbs span');
  const state = await page.evaluate(() => ({
    title: document.querySelector('h1').textContent,
    status: document.getElementById('status').textContent,
    adBlock: document.getElementById('adBlock').checked,
    boost: document.getElementById('boost').checked,
    noSiteShown: !document.getElementById('no-site').hidden,
  }));
  assert.deepEqual(state, {
    title: 'Smooth Movie',
    status: 'Working on every site',
    adBlock: true,
    boost: true,
    noSiteShown: true,
  });
  await page.screenshot({ path: path.join(shotsDir, 'menu.png') });

  await page.click('#enabled');
  await sleep(300);
  assert.equal(await page.$eval('#status', (el) => el.textContent), 'Paused on every site');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('enabled')).enabled), false);
  await page.screenshot({ path: path.join(shotsDir, 'menu-off.png') });
  await page.click('#enabled');
  await page.close();
});
