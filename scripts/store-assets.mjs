/**
 * Renders the Chrome Web Store screenshots (1280x800) and the small promo tile
 * (440x280) into store/assets, from the built extension and a demo folder.
 *
 *   npm run build && node scripts/store-assets.mjs
 *
 * MDT_BROWSER can point at a Chromium browser when Chrome for Testing is blocked.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'store/assets');
const demo = join(tmpdir(), 'md-toolkit-store-demo', 'Notes');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------ demo folder ------------------------------ */

const DEMO_FILES = {
  'README.md': `# My notes

Everything I am working on, in plain Markdown files that open straight in Chrome.

> [!TIP]
> Press **L** to edit any paragraph right here, or open the **Files** tab to move between notes.

## This week

| Day | Focus | Status |
| --- | --- | :---: |
| Monday | Website redesign | Done |
| Wednesday | Mobile app review | In progress |
| Friday | Reading and ideas | Planned |

## Quick links

- [Ideas](Ideas.md) for the next quarter
- [Reading list](Reading%20list.md)
- Projects: [Website redesign](Projects/Website%20redesign.md) and [Mobile app](Projects/Mobile%20app.md)
`,
  'Ideas.md': `# Ideas

A short list of things worth trying, kept as **plain text** so it works with any tool.

Write the weekly summary as a [single page](README.md) and link everything from there. Short notes are easier to keep up to date than long documents.

- [x] Move all notes into one folder
- [x] Use one file per project
- [ ] Add diagrams for the release process
- [ ] Review the reading list every Sunday
`,
  'Reading list.md': '# Reading list\n\n1. *The Pragmatic Programmer*\n2. *Designing Data-Intensive Applications*\n3. *Shape Up*\n',
  'Projects/Website redesign.md': '# Website redesign\n\nNew layout, faster pages and a dark theme.\n',
  'Projects/Mobile app.md': '# Mobile app\n\nOffline mode and sync.\n',
  'Projects/Release process.md': '# Release process\n\n```mermaid\nflowchart LR\n  A[Write] --> B[Review] --> C[Release]\n```\n',
  'Meetings/2026-11-03 Kickoff.md': '# Kickoff\n\nGoals and owners.\n',
  'Meetings/2026-11-10 Review.md': '# Review\n\nWhat went well.\n',
};

rmSync(dirname(demo), { recursive: true, force: true });
for (const [path, content] of Object.entries(DEMO_FILES)) {
  mkdirSync(dirname(join(demo, path)), { recursive: true });
  writeFileSync(join(demo, path), content);
}

/* -------------------------------- browser -------------------------------- */

const candidates = process.env.MDT_BROWSER
  ? [process.env.MDT_BROWSER]
  : [undefined, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];

let browser;
for (const executablePath of candidates) {
  try {
    browser = await puppeteer.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
      pipe: true,
      enableExtensions: [resolve(root, 'dist')],
      args: ['--no-sandbox', '--lang=en-US'],
      defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    });
    break;
  } catch {
    // Try the next browser.
  }
}
if (!browser) throw new Error('No browser could be started');

const worker = await browser.waitForTarget((target) => target.type() === 'service_worker', { timeout: 15000 });
// The welcome tab opens on install and would take focus from the pages below.
await browser.waitForTarget((target) => target.url().includes('welcome=1'), { timeout: 10000 });
const id = new URL(worker.url()).host;
const viewer = (url) => `chrome-extension://${id}/viewer.html?src=${encodeURIComponent(url)}`;
const sample = `chrome-extension://${id}/sample.md`;

const page = await browser.newPage();

async function show(url, settings, prepare = async () => {}) {
  await page.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'load' });
  await page.evaluate((value) => chrome.storage.sync.set({ settings: value }), settings);
  await page.evaluate(() => { try { localStorage.setItem('mdt-sidebar-tab', 'toc'); } catch {} });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1500);
  await prepare();
  await sleep(700);
}

async function scrollTo(selector) {
  await page.evaluate((query) => {
    const target = document.querySelector(query);
    const scroller = document.querySelector('#mdt-preview');
    scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
  }, selector);
}

mkdirSync(out, { recursive: true });
const shot = (name) => page.screenshot({ path: join(out, name) });

// 1. Themes, math and diagrams.
await show(viewer(sample), { theme: 'tokyo-night' }, () => scrollTo('#math'));
await shot('1-themes-math-diagrams.png');

// 2. Typography: the Academic theme with numbered headings.
await show(viewer(sample), { theme: 'academic' }, () => scrollTo('#tables'));
await shot('2-academic-theme.png');

// 3. The appearance panel.
await show(viewer(sample), { theme: 'nord' }, async () => {
  await page.keyboard.press('s');
  await scrollTo('#callouts');
});
await shot('3-appearance-panel.png');

// 4. A whole folder, with the file tree.
const readme = pathToFileURL(join(demo, 'README.md')).href;
await show(viewer(readme), { theme: 'light' }, async () => {
  await page.click('#mdt-tab-files');
  await sleep(500);
  for (const name of ['Projects', 'Meetings']) {
    await page.evaluate((label) => [...document.querySelectorAll('.mdt-folder-row')].find((row) => row.textContent === label)?.click(), name);
    await sleep(300);
  }
});
await shot('4-folders.png');

// 5. Editing a paragraph in place.
await show(viewer(pathToFileURL(join(demo, 'Ideas.md')).href), { theme: 'one-dark' }, async () => {
  await page.click('#mdt-tab-files');
  await page.keyboard.press('l');
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('#mdt-document > p')][1].click());
  await page.waitForSelector('.mdt-block-editor .cm-editor');
  await page.keyboard.press('End');
});
await shot('5-edit-in-place.png');

/* ------------------------------ promo tile ------------------------------- */

const icon = readFileSync(resolve(root, 'public/icons/icon128.png')).toString('base64');
await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html>
<html><body style="margin:0">
<div style="box-sizing:border-box;width:440px;height:280px;padding:36px 34px;display:flex;flex-direction:column;justify-content:space-between;
  background:linear-gradient(135deg,#1e3a8a 0%,#4c1d95 100%);color:#fff;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="display:flex;align-items:center;gap:16px">
    <img src="data:image/png;base64,${icon}" width="72" height="72" style="border-radius:16px;box-shadow:0 6px 18px rgb(0 0 0 / 35%)">
    <div style="font-size:34px;font-weight:700;letter-spacing:-0.5px">MD Toolkit</div>
  </div>
  <div>
    <div style="font-size:22px;font-weight:600;line-height:1.25">Read and edit Markdown,<br>your way.</div>
    <div style="margin-top:10px;font-size:14px;opacity:0.85">Themes · Math · Diagrams · Folders · Edit in place</div>
  </div>
</div>
</body></html>`);
await page.screenshot({ path: join(out, 'promo-small-440x280.png') });

await browser.close();
rmSync(dirname(demo), { recursive: true, force: true });
console.log(`Wrote store assets to ${out}`);
process.exit(0);
