// Makes the pictures for the Chrome Web Store listing, using the real menu.
//   npm run store-images   ->  store/images/
// Screenshots are 1280x800 and the promo tile is 440x280 (JPEG, as the store asks).
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'store', 'images');
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// A made-up movie site (".example" names never belong to a real site).
const FAKE_TAB = { id: 424242, url: 'https://watch.movie-site.example/film', windowId: 1 };
const SITE = 'movie-site.example';

const VELVET = '#4A1229';
const VELVET_DEEP = '#300B1A';
const BUTTER = '#F6C445';
const CREAM = '#FFF6E6';

await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  pipe: true,
  enableExtensions: [root],
  args: ['--no-first-run', '--no-default-browser-check'],
});

try {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
    { timeout: 15000 },
  );
  const worker = await target.worker();
  const extensionId = new URL(target.url()).host;

  await worker.evaluate(
    (tabId, site) =>
      Promise.all([
        chrome.storage.local.set({ enabled: true, adBlock: true, boost: true, guardedSites: [site] }),
        chrome.storage.session.set({ [`ads:${tabId}`]: 47, [`popups:${tabId}`]: 6 }),
      ]),
    FAKE_TAB.id,
    SITE,
  );

  // Picture of the real menu, pretending the open tab is the movie site.
  async function menuShot(scheme) {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.setViewport({ width: 320, height: 600, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((tab) => {
      chrome.tabs.query = async () => [tab];
    }, FAKE_TAB);
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForFunction(() => !document.getElementById('popup-count').hidden);
    await new Promise((r) => setTimeout(r, 1200)); // let the bulb animation settle
    const height = await page.evaluate(() => document.body.scrollHeight);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height }, encoding: 'base64' });
    await page.close();
    return `data:image/png;base64,${png}`;
  }

  const light = await menuShot('light');
  const dark = await menuShot('dark');
  const icon = `data:image/png;base64,${(await readFile(path.join(root, 'icons', 'icon128.png'))).toString('base64')}`;

  const base = `
    * { box-sizing: border-box; margin: 0; }
    body { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; color: ${CREAM};
      background: radial-gradient(circle at 75% 40%, #6e2443 0%, ${VELVET} 45%, ${VELVET_DEEP} 100%);
      overflow: hidden; }
    h1 { font-family: "Bahnschrift", "Segoe UI", sans-serif; font-weight: 700; letter-spacing: -0.5px; }
    .menu { border-radius: 14px; box-shadow: 0 30px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
    .bulbs { display: flex; gap: 14px; }
    .bulbs i { width: 10px; height: 10px; border-radius: 50%; background: ${BUTTER};
      box-shadow: 0 0 12px ${BUTTER}; }
  `;
  const bulbs = (n) => `<div class="bulbs">${'<i></i>'.repeat(n)}</div>`;

  const shots = {
    'screenshot-1-overview': `
      <style>${base}
        body { width: 1280px; height: 800px; display: flex; align-items: center; padding: 0 110px; gap: 90px; }
        .text { flex: 1; } h1 { font-size: 64px; line-height: 1.05; margin: 28px 0 30px; }
        ul { list-style: none; padding: 0; font-size: 26px; line-height: 1.5; }
        li { padding-left: 40px; position: relative; margin-bottom: 14px; }
        li::before { content: ""; position: absolute; left: 0; top: 13px; width: 16px; height: 16px;
          border-radius: 50%; background: ${BUTTER}; }
        .menu { width: 384px; }
      </style>
      <div class="text">${bulbs(9)}
        <h1>Watch movies with fewer interruptions</h1>
        <ul>
          <li>Blocks ads from known ad networks</li>
          <li>Closes pop-up tabs on sites you choose</li>
          <li>Loads more video ahead, so it lags less</li>
        </ul>
      </div>
      <img class="menu" src="${light}">`,

    'screenshot-2-popups': `
      <style>${base}
        body { width: 1280px; height: 800px; display: flex; align-items: center; padding: 0 110px; gap: 90px; }
        .text { flex: 1; } h1 { font-size: 58px; line-height: 1.08; margin: 28px 0 26px; }
        p { font-size: 26px; line-height: 1.5; opacity: .9; max-width: 560px; }
        .menu { width: 384px; }
      </style>
      <img class="menu" src="${dark}">
      <div class="text">${bulbs(9)}
        <h1>One switch stops pop&#8209;up tabs</h1>
        <p>Turn it on for a movie site. When the site tries to open another website in a new tab, the tab closes and you go straight back to your movie.</p>
      </div>`,

    'promo-small-440x280': `
      <style>${base}
        body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 14px; text-align: center; }
        img { width: 84px; height: 84px; } h1 { font-size: 40px; }
        p { font-size: 17px; opacity: .9; }
      </style>
      <img src="${icon}">
      <h1>Smooth Movie</h1>
      <p>Fewer ads. No pop-up tabs. Less lag.</p>`,
  };

  for (const [name, html] of Object.entries(shots)) {
    const [width, height] = name.startsWith('promo') ? [440, 280] : [1280, 800];
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><meta charset="utf-8">${html}`, { waitUntil: 'load' });
    const file = path.join(outDir, `${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    await page.close();
    console.log(`Saved ${path.relative(root, file)}`);
  }
} finally {
  await browser.close();
}
