/**
 * Renders the extension icon at every size Chrome needs. The PNGs are committed,
 * so this only has to run again when the design changes:
 *
 *   node scripts/generate-icons.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/icons');
const SIZES = [16, 32, 48, 128];

/** A dark tile with an M and a down arrow, the shape people associate with Markdown. */
function icon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b82f6"/>
        <stop offset="1" stop-color="#6d28d9"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="28" fill="url(#tile)"/>
    <path d="M22 92V36h15l15 20 15-20h15v56H67V60L52 79 37 60v32z" fill="#fff"/>
    <path d="M96 36h13v30h11L102.500 92 85 66h11z" fill="#fff"/>
  </svg>`;
}

mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${icon(size)}</body>`);
  await page.screenshot({ path: resolve(out, `icon${size}.png`), omitBackground: true });
}

await browser.close();
console.log(`Wrote ${SIZES.length} icons to ${out}`);
