// Draws the toolbar icons and saves them as PNG files in icons/.
//   npm run icons                 use the chosen design (ring)
//   npm run icons -- bar          use another design
//   npm run icons -- ring --preview <file.png>   also save a side-by-side comparison
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(here, '..', 'icons');
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VELVET = '#4A1229';
const BUTTER = '#F6C445';
const TRACK = '#6E2443';
const CREAM = '#FFF6E6';
const SIZES = [16, 32, 48, 128];

const tile = `<rect x="2" y="2" width="124" height="124" rx="30" fill="${VELVET}"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${tile}${body}</svg>`;
const play = (d) =>
  `<path d="${d}" fill="${CREAM}" stroke="${CREAM}" stroke-width="7" stroke-linejoin="round"/>`;

// Each design has a detailed version and a bolder one for the tiny 16 and 32 px sizes.
const designs = {
  // Play button inside a ring that is mostly loaded: solid = watched, soft = ready ahead.
  ring(small) {
    const r = small ? 43 : 41;
    const width = small ? 15 : 11;
    const around = 2 * Math.PI * r;
    const arc = (length, color, opacity) =>
      `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-opacity="${opacity}"
        stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${length} ${around}"
        transform="rotate(-90 64 64)"/>`;
    return svg(`
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${width}"/>
      ${arc(around * 0.86, CREAM, 0.5)}
      ${arc(around * 0.52, BUTTER, 1)}
      ${play(small ? 'M54 44 L54 84 L88 64 Z' : 'M55 47 L55 81 L85 64 Z')}
    `);
  },

  // Play button above a video progress bar: solid = watched, soft = ready ahead.
  bar(small) {
    const y = small ? 86 : 88;
    const h = small ? 18 : 14;
    const bar = (width, fill, opacity) =>
      `<rect x="22" y="${y}" width="${width}" height="${h}" rx="${h / 2}" fill="${fill}" fill-opacity="${opacity}"/>`;
    return svg(`
      ${play(small ? 'M48 22 L48 68 L88 45 Z' : 'M51 26 L51 66 L86 46 Z')}
      ${bar(84, TRACK, 1)}
      ${bar(70, CREAM, 0.5)}
      ${bar(42, BUTTER, 1)}
    `);
  },

  // The first icon, for comparison.
  now() {
    return svg(`<path d="M47 33 L47 95 L101 64 Z" fill="${BUTTER}"/>`);
  },
};

async function draw(page, design, size) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px">${designs[design](size <= 32)
        .replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
    </body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

async function preview(page, file) {
  const rows = [];
  for (const [design, label] of [['ring', 'A. Buffer ring'], ['bar', 'B. Video bar'], ['now', 'Current icon']]) {
    const cells = [];
    for (const size of [128, 48, 32, 16]) {
      const png = Buffer.from(await draw(page, design, size)).toString('base64');
      cells.push(`<img src="data:image/png;base64,${png}" width="${size}" height="${size}">`);
    }
    const small = cells.slice(2).join('');
    rows.push(`
      <div class="row">
        <p>${label}</p>
        ${cells.join('')}
        <div class="bar light">${small}<span>Chrome, light</span></div>
        <div class="bar dark">${small}<span>Chrome, dark</span></div>
      </div>`);
  }
  const width = 900;
  await page.setViewport({ width, height: 600, deviceScaleFactor: 2 });
  await page.setContent(`
    <html><head><style>
      body { margin: 0; padding: 24px; width: ${width - 48}px; background: #fff; font: 15px "Segoe UI", sans-serif; color: #222; }
      .row { display: flex; align-items: center; gap: 22px; padding: 14px 0; border-bottom: 1px solid #eee; }
      .row p { width: 110px; flex: none; margin: 0; font-weight: 600; }
      .bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; }
      .bar span { font-size: 12px; white-space: nowrap; }
      .light { background: #f1f3f4; color: #555; }
      .dark { background: #35363a; color: #ccc; }
    </style></head><body>${rows.join('')}</body></html>`);
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
}

const args = process.argv.slice(2);
const chosen = args.find((a) => designs[a]) ?? 'ring';
const previewFile = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;

const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await writeFile(path.join(iconsDir, `icon${size}.png`), await draw(page, chosen, size));
  }
  console.log(`Saved the "${chosen}" icons in ${iconsDir}`);
  if (previewFile) {
    await preview(page, previewFile);
    console.log(`Saved the comparison in ${previewFile}`);
  }
} finally {
  await browser.close();
}
