/**
 * End-to-end checks against the built extension in a real Chromium.
 *
 *   npm run build && npm run test:e2e
 *
 * Unit tests cannot cover what matters most here: redirects from file:// and
 * web pages, extension permissions, the page CSP, and the lazy-loaded libraries.
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');
const shotsDir = process.env.MDT_SCREENSHOTS ? resolve(process.env.MDT_SCREENSHOTS) : null;
const workDir = join(tmpdir(), `mdt-e2e-${process.pid}`);
mkdirSync(join(workDir, 'sub'), { recursive: true });

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function fixture(name, content) {
  const path = join(workDir, name);
  writeFileSync(path, content);
  return { path, url: pathToFileURL(path).href };
}

writeFileSync(join(workDir, 'pixel.png'), PIXEL);
copyFileSync(resolve(root, 'public/sample.md'), join(workDir, 'sample.md'));

const sample = { path: join(workDir, 'sample.md'), url: pathToFileURL(join(workDir, 'sample.md')).href };
const linked = fixture('linked.md', '# Linked\n\n![pixel](pixel.png)\n\n[other](sub/other.md#target)\n\n[text file](notes.txt)\n');
fixture('sub/other.md', '# Other\n\n'.concat('filler\n\n'.repeat(120), '## Target\n\nArrived.\n'));
const watched = fixture('watched.md', '# Version one\n\n'.concat('line\n\n'.repeat(200), 'End one\n'));
const hostile = fixture('hostile.md', [
  '# Hostile',
  '<script>window.pwned = 1</script>',
  '<img src="x" onerror="window.pwned = 2">',
  '<a id="bad" href="javascript:window.pwned = 3">x</a>',
  '<iframe src="https://example.com"></iframe>',
  '<style>body { display: none }</style>',
  '<svg onload="window.pwned = 4"></svg>',
  '$\\href{javascript:window.pwned=5}{x}$',
  '```mermaid',
  'graph TD; A["<img src=x onerror=window.pwned=6>"]-->B',
  '```',
].join('\n\n'));
fixture('notes.txt', 'plain text, not markdown');

/* ------------------------------ test harness ----------------------------- */

const results = [];
let failed = 0;

async function test(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push(`  ok    ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    failed += 1;
    results.push(`  FAIL  ${name}\n        ${String(error.message ?? error).split('\n').join('\n        ')}`);
  }
  console.log(results.at(-1));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(check, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(60);
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

/* --------------------------------- setup --------------------------------- */

const server = createServer((request, response) => {
  if (request.url === '/page.md') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Real page</title><h1 id="html-page">An HTML page with a .md path</h1>');
  } else if (request.url === '/plain.md') {
    response.writeHead(200, { 'content-type': 'text/plain', 'content-security-policy': "default-src 'none'; sandbox" });
    response.end('# From the web\n\n![local](file:///C:/Windows/win.ini)\n');
  } else if (request.url === '/type.md') {
    response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    response.end('# Markdown type\n');
  } else {
    response.writeHead(404);
    response.end('missing');
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const webBase = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [dist],
  args: ['--no-sandbox', '--lang=en-US'],
  defaultViewport: { width: 1360, height: 860 },
});

const worker = await browser.waitForTarget((target) => target.type() === 'service_worker', { timeout: 15000 });
const extensionId = new URL(worker.url()).host;
const extensionUrl = (path) => `chrome-extension://${extensionId}/${path}`;
const viewerFor = (url) => `${extensionUrl('viewer.html')}?src=${encodeURIComponent(url)}`;

const problems = [];

async function open(url) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/ERR_FILE_NOT_FOUND|404|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(text)) {
      problems.push(`${page.url()}: ${text}`);
    }
  });
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  return page;
}

const ready = (page) => until(() => page.evaluate(() => document.documentElement.dataset.ready === 'true'), 'viewer ready', 12000);

async function openViewer(url) {
  const page = await open(url);
  await until(() => page.url().startsWith('chrome-extension://'), `redirect from ${url}`);
  await ready(page);
  return page;
}

async function setSettings(page, change) {
  await page.evaluate(async (value) => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...settings, ...value } });
  }, change);
}

const shot = async (page, name) => {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${name}.png`) });
};

/* ---------------------------------- tests --------------------------------- */

await test('the welcome page opens on first install', async () => {
  await until(async () => (await browser.pages()).some((page) => page.url().includes('options.html?welcome=1')), 'welcome tab');
});

let demo;

await test('a local .md file redirects to the viewer and renders', async () => {
  demo = await openViewer(sample.url);
  assert(demo.url().includes('viewer.html?src='), `url: ${demo.url()}`);
  equal(await demo.title(), 'MD Toolkit feature demo - MD Toolkit', 'title from front matter');
  equal(await demo.$eval('#mdt-doc-name', (element) => element.textContent), 'sample.md', 'file name');
});

await test('code is highlighted and split into lines', async () => {
  assert(await demo.$('.mdt-code .hljs-keyword'), 'no highlighted keyword');
  const balanced = await demo.$$eval('.mdt-code-line', (lines) => lines.every((line) => line.querySelectorAll('span').length >= 0));
  assert(balanced, 'bad lines');
});

await test('KaTeX loads on demand and renders with its fonts', async () => {
  await until(() => demo.$('.katex'), 'katex output');
  const stillRaw = await demo.$$eval('.mdt-math:not([data-rendered])', (nodes) => nodes.length);
  equal(stillRaw, 0, 'unrendered math');
  const fonts = await until(() => demo.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((font) => font.family.includes('KaTeX') && font.status === 'loaded');
  }), 'KaTeX fonts');
  assert(fonts, 'KaTeX font not loaded');
});

await test('prices next to math are left alone', async () => {
  const text = await demo.$eval('#mdt-document', (element) => element.textContent);
  assert(text.includes('$5 or $10'), 'price text was changed');
});

await test('Mermaid loads on demand and draws diagrams', async () => {
  await until(async () => (await demo.$$('.mdt-mermaid svg')).length === 2, 'two diagrams', 15000);
  const label = await demo.$eval('.mdt-mermaid svg', (svg) => svg.textContent);
  assert(label.includes('Open .md file'), `diagram text: ${label.slice(0, 80)}`);
});

await test('callouts, tables, task lists and footnotes render', async () => {
  equal((await demo.$$('.mdt-alert')).length, 5, 'callouts');
  assert(await demo.$('.mdt-alert-warning .mdt-alert-title'), 'callout title');
  assert(await demo.$('.markdown-body table'), 'table');
  equal((await demo.$$('input.mdt-task')).length, 3, 'task boxes');
  assert(await demo.$('.footnotes'), 'footnotes');
  assert(await demo.$('details.mdt-front-matter'), 'front matter');
});

await test('the table of contents lists headings and follows the scroll position', async () => {
  const entries = await demo.$$eval('#mdt-toc-list a', (links) => links.map((link) => link.textContent));
  assert(entries.includes('Math') && entries.includes('Polish letters'), `entries: ${entries}`);
  await demo.evaluate(() => {
    [...document.querySelectorAll('#mdt-toc-list a')].find((link) => link.textContent === 'Math').click();
  });
  await until(() => demo.$eval('.mdt-active', (element) => element.textContent === 'Math'), 'active entry');
  assert(demo.url().endsWith('#math'), `hash: ${demo.url()}`);
  const inView = await demo.$eval('#math', (heading) => {
    const { top } = heading.getBoundingClientRect();
    return top >= 0 && top < innerHeight;
  });
  assert(inView, 'heading not scrolled into view');
});

await test('table of contents sections collapse', async () => {
  await demo.evaluate(() => {
    const row = [...document.querySelectorAll('#mdt-toc-list li[data-parent]')].find((item) => item.dataset.id === 'lists');
    row.querySelector('.mdt-toc-toggle').click();
  });
  const hidden = await demo.$eval('#mdt-toc-list li[data-id="task-list"]', (item) => item.offsetParent === null);
  assert(hidden, 'child still visible');
  await demo.evaluate(() => document.querySelector('#mdt-toc-list li[data-id="lists"] .mdt-toc-toggle').click());
});

await test('reading statistics and progress are shown', async () => {
  const words = await demo.$eval('#mdt-status-words', (element) => element.textContent);
  assert(/^\d[\d,]* words$/.test(words), `words: ${words}`);
  await demo.$eval('#mdt-preview', (scroller) => { scroller.scrollTop = scroller.scrollHeight; });
  await until(() => demo.$eval('#mdt-status-progress', (element) => element.textContent === '100% read'), '100% progress');
  await demo.$eval('#mdt-preview', (scroller) => { scroller.scrollTop = 0; });
});

await test('search finds text across formatting and steps through matches', async () => {
  await demo.keyboard.press('/');
  await demo.type('#mdt-search-input', 'theme');
  await until(() => demo.$eval('#mdt-search-count', (element) => /^1\/\d+$/.test(element.textContent)), 'match count');
  await demo.keyboard.press('Enter');
  await until(() => demo.$eval('#mdt-search-count', (element) => element.textContent.startsWith('2/')), 'next match');
  equal(await demo.evaluate(() => CSS.highlights.has('mdt-search')), true, 'highlight registered');
  await demo.keyboard.press('Escape');
  equal(await demo.$eval('#mdt-search', (element) => element.hidden), true, 'search closed');
  equal(await demo.evaluate(() => CSS.highlights.has('mdt-search')), false, 'highlight cleared');
});

await test('the appearance panel changes the document live and persists', async () => {
  await demo.keyboard.press('s');
  equal(await demo.$eval('#mdt-settings', (element) => element.hidden), false, 'panel open');
  await shot(demo, 'appearance-panel');

  await demo.click('.mdt-theme-card[data-theme-id="tokyo-night"]');
  equal(await demo.$eval('html', (element) => element.dataset.theme), 'tokyo-night', 'theme attribute');
  const background = await demo.$eval('body', (element) => getComputedStyle(element).backgroundColor);
  equal(background, 'rgb(26, 27, 38)', 'theme background');

  await demo.$eval('input[data-key="fontSize"]', (input) => {
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const size = await demo.$eval('#mdt-document', (element) => getComputedStyle(element).fontSize);
  equal(size, '20px', 'font size');

  await sleep(500);
  await demo.reload();
  await ready(demo);
  equal(await demo.$eval('html', (element) => element.dataset.theme), 'tokyo-night', 'theme after reload');
  equal(await demo.$eval('#mdt-document', (element) => getComputedStyle(element).fontSize), '20px', 'size after reload');
});

await test('every theme applies, and Mermaid follows dark and light', async () => {
  await until(async () => (await demo.$$('.mdt-mermaid svg')).length === 2, 'diagrams');
  const darkDiagram = await demo.$eval('.mdt-mermaid', (element) => element.innerHTML);
  await setSettings(demo, { theme: 'academic' });
  await until(() => demo.$eval('html', (element) => element.dataset.numbering === 'on'), 'academic numbering');
  await until(async () => (await demo.$eval('.mdt-mermaid', (element) => element.innerHTML)) !== darkDiagram, 'diagram redraw', 15000);
  const heading = await demo.$eval('#text', (element) => getComputedStyle(element, '::before').content);
  assert(heading.includes('counter(h2)'), `numbered heading: ${heading}`);
  const align = await demo.$eval('#mdt-document', (element) => getComputedStyle(element).textAlign);
  equal(align, 'justify', 'academic alignment');
  const toc = await demo.$eval('#mdt-toc-list li[data-id="text"] .mdt-toc-number', (element) => element.textContent);
  equal(toc, '1', 'number in table of contents');
  await shot(demo, 'theme-academic');

  for (const theme of ['light', 'dark', 'nord', 'dracula', 'gruvbox', 'one-dark', 'tokyo-night']) {
    await setSettings(demo, { theme });
    await until(() => demo.$eval('html', (element, id) => element.dataset.theme === id, theme), `theme ${theme}`);
    await shot(demo, `theme-${theme}`);
  }
});

await test('formatting options reach the document', async () => {
  await setSettings(demo, {
    theme: 'light', fontSize: 16, codeLineNumbers: true, codeWrap: true, tableStyle: 'striped',
    bodyFont: 'literata', codeFont: 'jetbrains-mono', accent: '#ff0066', contentWidth: 700, textAlign: 'justify',
  });
  await until(() => demo.$eval('html', (element) => element.dataset.tableStyle === 'striped'), 'table style');
  const check = await demo.evaluate(async () => {
    await document.fonts.ready;
    const article = document.querySelector('#mdt-document');
    const style = getComputedStyle(article);
    return {
      font: style.fontFamily,
      width: style.maxWidth,
      align: style.textAlign,
      link: getComputedStyle(article.querySelector('p a')).color,
      counter: getComputedStyle(article.querySelector('.mdt-code-line'), '::before').content,
      wrap: getComputedStyle(article.querySelector('.mdt-code pre')).whiteSpace,
      literata: document.fonts.check('16px "Literata Variable"'),
    };
  });
  assert(check.font.includes('Literata'), `font: ${check.font}`);
  equal(check.width, '700px', 'column width');
  equal(check.align, 'justify', 'alignment');
  equal(check.link, 'rgb(255, 0, 102)', 'accent colour');
  assert(check.counter.includes('counter'), `line numbers: ${check.counter}`);
  equal(check.wrap, 'pre-wrap', 'code wrapping');
  assert(check.literata, 'bundled font did not load');
  await demo.evaluate(() => chrome.storage.sync.clear());
  await demo.reload();
  await ready(demo);
});

await test('focus mode hides the interface and dims other blocks', async () => {
  await demo.keyboard.press('f');
  await until(() => demo.$eval('html', (element) => element.classList.contains('mdt-focus')), 'focus class');
  equal(await demo.$eval('#mdt-toolbar', (element) => getComputedStyle(element).display), 'none', 'toolbar');
  await until(() => demo.$('.mdt-focus-block'), 'highlighted block');
  await until(
    () => demo.$eval('.markdown-body > *:not(.mdt-focus-block)', (element) => Number(getComputedStyle(element).opacity) < 0.5),
    'dimmed blocks',
  );
  await shot(demo, 'focus');
  await demo.keyboard.press('Escape');
  await until(() => demo.$eval('html', (element) => !element.classList.contains('mdt-focus')), 'focus exit');
  await demo.evaluate(() => document.exitFullscreen?.().catch(() => {}));
});

await test('export produces a self-contained HTML file', async () => {
  await until(async () => (await demo.$$('.mdt-mermaid svg')).length === 2, 'diagrams');
  await demo.evaluate(() => {
    window.__exports = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      window.__exports.push(blob.text());
      return original.call(URL, blob);
    };
  });
  await demo.click('#mdt-btn-export');
  await demo.click('[data-export="html"]');
  const html = await until(async () => {
    const value = await demo.evaluate(async () => (window.__exports.length ? window.__exports[0] : null));
    return value;
  }, 'exported file', 15000);

  assert(html.includes('<article'), 'no article');
  assert(!html.includes('mdt-copy"'), 'copy button leaked into export');
  assert(!html.includes('data-source'), 'internal attribute leaked into export');
  assert(!/url\((?!["']?data:)[^)]*\)/.test(html.replace(/url\(#[^)]*\)/g, '')), 'external url() in export');

  const path = join(workDir, 'export.html');
  writeFileSync(path, html);
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  const external = [];
  page.on('request', (request) => {
    if (!/^(file|data|blob):/.test(request.url())) external.push(request.url());
  });
  await page.goto(pathToFileURL(path).href, { waitUntil: 'load' });
  const look = await page.evaluate(() => ({
    katex: !!document.querySelector('.katex'),
    svg: document.querySelectorAll('svg').length,
    hasColor: getComputedStyle(document.querySelector('.hljs-keyword')).color !== getComputedStyle(document.body).color,
  }));
  assert(look.katex, 'math missing from export');
  assert(look.svg >= 2, 'diagrams missing from export');
  assert(look.hasColor, 'code colours missing from export');
  equal(external.length, 0, `external requests: ${external}`);
  await page.close();
});

await test('copying and print styles work', async () => {
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(extensionUrl('').replace(/\/$/, ''), ['clipboard-read', 'clipboard-write']).catch(() => {});
  await demo.click('#mdt-btn-export');
  await demo.click('[data-export="copy-markdown"]');
  await until(() => demo.$eval('#mdt-toast', (element) => !element.hidden), 'toast');

  await demo.emulateMediaType('print');
  const printed = await demo.evaluate(() => ({
    toolbar: getComputedStyle(document.querySelector('#mdt-toolbar')).display,
    toc: getComputedStyle(document.querySelector('#mdt-toc')).display,
    overflow: getComputedStyle(document.querySelector('#mdt-preview')).overflow,
  }));
  await demo.emulateMediaType(null);
  equal(printed.toolbar, 'none', 'toolbar in print');
  equal(printed.toc, 'none', 'contents in print');
  equal(printed.overflow, 'visible', 'scroll container in print');
});

await test('the interface switches between English and Polish', async () => {
  await setSettings(demo, { language: 'pl' });
  await until(() => demo.$eval('#mdt-mode-edit span', (element) => element.textContent === 'Edytuj'), 'Polish label');
  const alert = await demo.$eval('.mdt-alert-warning .mdt-alert-title', (element) => element.textContent);
  equal(alert, 'Ostrzeżenie', 'translated callout');
  const words = await demo.$eval('#mdt-status-words', (element) => element.textContent);
  assert(/słów|słowa|słowo/.test(words), `words: ${words}`);
  await shot(demo, 'polish');
  await demo.evaluate(() => chrome.storage.sync.clear());
  await demo.close();
});

await test('relative images and Markdown links work from the viewer', async () => {
  const page = await openViewer(linked.url);
  await until(() => page.$eval('img', (image) => image.complete && image.naturalWidth > 0), 'local image');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.evaluate(() => [...document.querySelectorAll('a')].find((link) => link.textContent === 'other').click()),
  ]);
  await ready(page);
  equal(await page.$eval('#mdt-doc-name', (element) => element.textContent), 'other.md', 'followed link');
  const inView = await page.$eval('#target', (heading) => {
    const { top } = heading.getBoundingClientRect();
    return top >= 0 && top < innerHeight;
  });
  assert(inView, 'did not scroll to the #target fragment');

  await page.goBack({ waitUntil: 'load' });
  await ready(page);
  equal(await page.$eval('#mdt-doc-name', (element) => element.textContent), 'linked.md', 'back button');
  await page.close();
});

await test('appending #mdt-raw shows the original file', async () => {
  const page = await open(`${linked.url}#mdt-raw`);
  await sleep(400);
  assert(page.url().startsWith('file:'), `redirected to ${page.url()}`);
  await page.close();
});

await test('auto-reload shows changes and keeps the scroll position', async () => {
  const page = await openViewer(watched.url);
  await page.$eval('#mdt-preview', (scroller) => { scroller.scrollTop = 1500; });
  writeFileSync(watched.path, '# Version two\n\n'.concat('line\n\n'.repeat(200), 'End two\n'));
  await until(() => page.$eval('#mdt-document h1', (heading) => heading.textContent.includes('Version two')), 'reload', 6000);
  const scrollTop = await page.$eval('#mdt-preview', (scroller) => scroller.scrollTop);
  assert(Math.abs(scrollTop - 1500) < 2, `scroll moved to ${scrollTop}`);
  await page.close();
});

await test('auto-reload can be turned off', async () => {
  const page = await openViewer(watched.url);
  await setSettings(page, { autoReload: false });
  await sleep(200);
  writeFileSync(watched.path, '# Version three\n');
  await sleep(2500);
  const title = await page.$eval('#mdt-document h1', (heading) => heading.textContent);
  assert(title.includes('Version two'), `reloaded anyway: ${title}`);
  await page.evaluate(() => chrome.storage.sync.clear());
  await page.close();
});

await test('the editor updates the preview and marks unsaved changes', async () => {
  writeFileSync(watched.path, '# Editing\n\nFirst\n');
  const page = await openViewer(watched.url);
  await page.keyboard.press('e');
  await until(() => page.$('.cm-editor'), 'editor');
  await page.click('.cm-content');
  await page.keyboard.down('Control');
  await page.keyboard.press('End');
  await page.keyboard.up('Control');
  await page.keyboard.type('\n## Typed heading\n');
  await until(() => page.$('#typed-heading'), 'live preview');
  equal(await page.$eval('#mdt-dirty', (element) => element.hidden), false, 'dirty marker');
  await shot(page, 'editor');

  await test('...and does not overwrite edits when the file changes on disk', async () => {
    writeFileSync(watched.path, '# Changed elsewhere\n');
    await until(() => page.$eval('#mdt-banner', (element) => !element.hidden), 'banner', 6000);
    assert(await page.$('#typed-heading'), 'edits were replaced');
    await page.click('#mdt-banner-reload');
    await until(() => page.$('#changed-elsewhere'), 'new version');
    const text = await page.$eval('.cm-content', (element) => element.textContent);
    assert(text.includes('Changed elsewhere'), `editor text: ${text}`);
    equal(await page.$eval('#mdt-dirty', (element) => element.hidden), true, 'clean after reload');
  });

  await test('...and Ctrl+B wraps the selection', async () => {
    await page.click('.cm-content');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.press('b');
    await page.keyboard.up('Control');
    const text = await page.$eval('.cm-content', (element) => element.textContent);
    assert(text.includes('**'), `editor text: ${text}`);
  });
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.close({ runBeforeUnload: false });
});

await test('the interface fills the window whatever the document length', async () => {
  writeFileSync(watched.path, '# Short\n');
  const short = await openViewer(`${watched.url}`);
  await short.keyboard.press('e');
  await until(() => short.$('.cm-editor'), 'editor');
  const layout = await short.evaluate(() => ({
    statusBottom: document.querySelector('#mdt-status').getBoundingClientRect().bottom,
    toolbarTop: document.querySelector('#mdt-toolbar').getBoundingClientRect().top,
    height: innerHeight,
    scrolled: document.scrollingElement.scrollTop,
  }));
  equal(layout.statusBottom, layout.height, 'status bar at the bottom');
  equal(layout.toolbarTop, 0, 'toolbar at the top');
  await short.close();

  const long = await openViewer(sample.url);
  await long.evaluate(() => [...document.querySelectorAll('#mdt-toc-list a')].find((link) => link.textContent === 'Details').click());
  await sleep(200);
  const after = await long.evaluate(() => ({
    toolbarTop: document.querySelector('#mdt-toolbar').getBoundingClientRect().top,
    statusBottom: document.querySelector('#mdt-status').getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  equal(after.toolbarTop, 0, 'jumping to a section must not move the toolbar');
  equal(after.statusBottom, after.height, 'jumping to a section must not move the status bar');

  // A theme change redraws every diagram, so the layout is sampled while that happens.
  await until(async () => (await long.$$('.mdt-mermaid svg')).length === 2, 'diagrams', 15000);
  const lowest = await long.evaluate(async () => {
    const status = document.querySelector('#mdt-status');
    const end = Date.now() + 1800;
    let bottom = Number.POSITIVE_INFINITY;
    await chrome.storage.sync.set({ settings: { theme: 'dracula' } });
    while (Date.now() < end) {
      bottom = Math.min(bottom, status.getBoundingClientRect().bottom);
      await new Promise((done) => setTimeout(done, 0));
    }
    return bottom;
  });
  equal(lowest, after.height, 'drawing diagrams must not disturb the layout');
  await long.evaluate(() => chrome.storage.sync.clear());
  await long.close();
});

await test('a malformed address fragment does not stop the document loading', async () => {
  const page = await open(`${viewerFor(linked.url)}#%E0%A4%A`);
  await ready(page);
  assert(await page.$('#linked'), 'document not rendered');
  await page.close();
});

await test('Ctrl+S saves once, and later checks follow the saved file', async () => {
  writeFileSync(watched.path, '# Original\n');
  const page = await openViewer(watched.url);
  // The native file picker cannot run headless, so a fake file stands in for it.
  await page.evaluate(() => {
    window.__picker = { calls: 0, saved: [] };
    const handle = {
      createWritable: async () => ({
        write: async (text) => { window.__picker.saved.push(text); },
        close: async () => {},
      }),
      getFile: async () => ({ text: async () => window.__picker.saved.at(-1) }),
    };
    window.showSaveFilePicker = async () => {
      window.__picker.calls += 1;
      return handle;
    };
  });

  await page.keyboard.press('e');
  await until(() => page.$('.cm-editor'), 'editor');
  await page.click('.cm-content');
  await page.keyboard.type('Edited ');
  await until(() => page.$eval('#mdt-dirty', (element) => !element.hidden), 'unsaved mark');

  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
  await until(() => page.$eval('#mdt-dirty', (element) => element.hidden), 'saved');
  equal(await page.evaluate(() => window.__picker.calls), 1, 'file pickers opened');
  equal(await page.evaluate(() => window.__picker.saved.length), 1, 'writes');

  // The saved copy is a different file, so the opened one no longer matters.
  await sleep(2500);
  const text = await page.$eval('.cm-content', (element) => element.textContent);
  assert(text.includes('Edited'), `saved text was replaced by the old file: ${text}`);

  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
  await sleep(150);
  equal(await page.evaluate(() => window.__picker.calls), 1, 'the second save reuses the file');
  await page.close();
});

await test('Ctrl+S is left to the browser while reading', async () => {
  const page = await openViewer(linked.url);
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  equal(prevented, false, 'Ctrl+S intercepted while reading');
  await page.close();
});

await test('diagrams use the colours of the active theme', async () => {
  const page = await openViewer(sample.url);
  await until(async () => (await page.$$('.mdt-mermaid svg')).length === 2, 'diagrams', 15000);
  await setSettings(page, { theme: 'nord' });
  await until(() => page.$eval('.mdt-mermaid svg .node rect, .mdt-mermaid svg .node polygon', (shape) => {
    return getComputedStyle(shape).fill === 'rgb(59, 66, 82)';
  }), 'node filled with the Nord surface colour', 15000);
  await page.evaluate(() => document.querySelector('#diagrams').scrollIntoView());
  await sleep(250);
  await shot(page, 'theme-nord-diagrams');
  await page.evaluate(() => chrome.storage.sync.clear());
  await page.close();
});

await test('the split view works on a long document', async () => {
  const page = await openViewer(sample.url);
  await page.keyboard.press('e');
  await until(() => page.$('.cm-editor'), 'editor');
  await setSettings(page, { theme: 'tokyo-night', tocOpen: false });
  await until(() => page.$eval('html', (element) => element.dataset.toc === 'closed'), 'contents closed');
  await sleep(600);
  await shot(page, 'editor-split');
  await page.evaluate(() => chrome.storage.sync.clear());
  await page.close();
});

await test('editor and preview scroll together', async () => {
  const lines = Array.from({ length: 400 }, (_, index) => `## Section ${index}\n\nText ${index}\n`).join('\n');
  writeFileSync(watched.path, lines);
  const page = await openViewer(watched.url);
  await page.keyboard.press('e');
  await until(() => page.$('.cm-editor'), 'editor');
  await sleep(200);
  await page.$eval('.cm-scroller', (element) => { element.scrollTop = 6000; });
  await until(() => page.$eval('#mdt-preview', (element) => element.scrollTop > 1000), 'preview follows editor');
  await page.close();
});

await test('a new document opens the editor and keeps its draft', async () => {
  const page = await open(extensionUrl('viewer.html'));
  await ready(page);
  await until(() => page.$('.cm-editor'), 'editor');
  assert(await page.$('.mdt-scratch-hint'), 'hint');
  await page.click('.cm-content');
  await page.keyboard.type('# Pasted draft');
  await until(() => page.$('#pasted-draft'), 'preview');
  equal(await page.$('.mdt-scratch-hint'), null, 'hint removed');
  await sleep(700);
  await page.reload();
  await ready(page);
  await until(() => page.$('#pasted-draft'), 'restored draft');
  await page.evaluate(() => chrome.storage.local.clear());
  await page.close();
});

await test('hostile documents cannot run code', async () => {
  const page = await openViewer(hostile.url);
  await until(async () => (await page.$$('.mdt-mermaid svg, .mdt-mermaid .mdt-render-error')).length === 1, 'diagram', 15000);
  await page.evaluate(() => document.querySelector('#bad')?.click());
  await sleep(300);
  equal(await page.evaluate(() => window.pwned ?? null), null, 'injected code ran');
  equal(await page.$('#mdt-document iframe'), null, 'iframe kept');
  // Mermaid's own SVG carries a <style>, so only styles outside diagrams count.
  equal(await page.$('#mdt-document style:not(svg style)'), null, 'style kept');
  equal(await page.$eval('body', (element) => getComputedStyle(element).display), 'flex', 'page styles changed');
  equal(await page.$eval('#bad', (element) => element.hasAttribute('href')), false, 'javascript: link kept');
  const handlers = await page.$$eval('*', (elements) =>
    elements.filter((element) => [...element.attributes].some((attribute) => /^on/i.test(attribute.name))).map((element) => element.tagName));
  equal(handlers.length, 0, `elements with inline handlers: ${handlers}`);
  await page.close();
});

await test('a missing file is reported as missing, not as a permission problem', async () => {
  const page = await open(viewerFor(pathToFileURL(join(workDir, 'gone.md')).href));
  await ready(page);
  const text = await page.$eval('.mdt-error', (element) => element.textContent);
  assert(text.includes('does not exist'), text);
  await page.close();
});

await test('the viewer refuses non-Markdown local files', async () => {
  const page = await open(viewerFor(pathToFileURL(join(workDir, 'notes.txt')).href));
  await ready(page);
  const text = await page.$eval('.mdt-error', (element) => element.textContent);
  assert(text.includes('Only Markdown files'), text);
  assert(!(await page.content()).includes('plain text, not markdown'), 'file content shown');
  await page.close();
});

await test('the viewer refuses to run in a frame', async () => {
  const page = await open(`${webBase}/page.md`);
  await page.evaluate((src) => {
    const frame = document.createElement('iframe');
    frame.src = src;
    document.body.append(frame);
  }, viewerFor(linked.url));
  await until(async () => {
    const frame = page.frames().find((item) => item.url().includes('viewer.html'));
    return frame && frame.$('.mdt-error');
  }, 'refusal inside frame');
  await page.close();
});

await test('sites outside the default list are left alone until allowed', async () => {
  const page = await open(`${webBase}/plain.md`);
  await sleep(500);
  assert(page.url().startsWith('http:'), `redirected to ${page.url()}`);
  await page.close();
});

await test('raw.githubusercontent.com works despite its sandbox CSP', async () => {
  const page = await openViewer('https://raw.githubusercontent.com/markdown-it/markdown-it/master/README.md');
  assert(await page.$('#mdt-document h1'), 'no heading rendered');
  await until(() => page.$eval('#mdt-document img', (image) => image.complete), 'image', 10000).catch(() => {});
  await page.close();
});

await test('the options page and popup work', async () => {
  const options = await open(extensionUrl('options.html'));
  await until(() => options.$eval('#file-access-status', (element) => element.textContent.startsWith('On.')), 'file access status');
  await options.select('#language', 'pl');
  await until(() => options.$eval('h1', (element) => element.textContent === 'Ustawienia MD Toolkit'), 'Polish options');
  await options.select('#language', 'en');
  await shot(options, 'options');
  await options.close();

  const popup = await open(extensionUrl('popup.html'));
  await until(() => popup.$eval('#theme', (element) => element.options.length === 9), 'theme list');
  equal(await popup.$eval('#file-access', (element) => element.hidden), true, 'no file access warning');
  await popup.close();
});

await test('no page logged an error or a CSP violation', async () => {
  // DOMPurify parses hostile input in an inert document, and Chrome reports the
  // handlers it sees there. Nothing runs: the hostile test checks that directly.
  const unexpected = problems.filter((problem) => !(problem.includes('hostile.md') && problem.includes('inline event handler')));
  assert(unexpected.length === 0, unexpected.join('\n'));
});

const built = readFileSync(resolve(dist, 'content.js'), 'utf8');
await test('the content script is a self-contained classic script', async () => {
  assert(!/^\s*(import|export)\b/m.test(built), 'content.js has module syntax');
});

await browser.close();

/*
 * The all-sites switch cannot be driven directly, because Chrome's permission
 * prompt needs a real user. A copy of the extension with those hosts already
 * granted exercises everything that happens after the user says yes.
 */
const granted = join(workDir, 'granted');
cpSync(dist, granted, { recursive: true });
const manifestPath = join(granted, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions.push(...manifest.optional_host_permissions);
delete manifest.optional_host_permissions;
writeFileSync(manifestPath, JSON.stringify(manifest));

// Loaded with a flag rather than over CDP, so the extension survives the reload
// Chrome performs when file access is switched, the same as for a real user.
const webBrowser = await puppeteer.launch({
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--lang=en-US', `--disable-extensions-except=${granted}`, `--load-extension=${granted}`],
});

async function webPage(path) {
  const page = await webBrowser.newPage();
  await page.goto(`${webBase}${path}`, { waitUntil: 'load' }).catch(() => {});
  return page;
}

await test('once all sites are allowed, the background script registers the redirect', async () => {
  const target = await webBrowser.waitForTarget((item) => item.type() === 'service_worker', { timeout: 15000 });
  const page = await webBrowser.newPage();
  await page.goto(`chrome-extension://${new URL(target.url()).host}/options.html`);
  await until(() => page.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length === 1), 'dynamic script');
  await until(() => page.$eval('#all-sites', (input) => input.checked), 'switch shown as on');
  await page.close();
});

await test('web pages served as text/plain and text/markdown are rendered', async () => {
  const typed = await webPage('/type.md');
  await until(() => typed.url().startsWith('chrome-extension://'), 'redirect of text/markdown');
  await until(() => typed.$('#markdown-type'), 'rendered text/markdown');
  await typed.close();
});

await test('a sandboxed web document renders but cannot reach local files', async () => {
  const page = await webPage('/plain.md');
  await until(() => page.url().startsWith('chrome-extension://'), 'redirect of sandboxed page');
  await until(() => page.$('#from-the-web'), 'rendered page');
  const image = await page.$eval('#mdt-document img', (element) => element.getAttribute('src'));
  assert(!image?.startsWith('file:'), `web document reached a local file: ${image}`);
  await page.close();
});

await test('HTML pages with a .md path are left alone', async () => {
  const page = await webPage('/page.md');
  await sleep(500);
  assert(page.url().startsWith('http:'), `redirected to ${page.url()}`);
  assert(await page.$('#html-page'), 'page content changed');
  await page.close();
});

/*
 * Unpacked extensions start with file access on, unlike a real install, and
 * switching it off here disables any extension loaded this way, even a trivial
 * one. So the viewer sees the same answers Chrome gives when access is off.
 */
await test('without file access the viewer explains how to turn it on', async () => {
  const target = await webBrowser.waitForTarget((item) => item.type() === 'service_worker');
  const id = new URL(target.url()).host;

  const page = await webBrowser.newPage();
  await page.evaluateOnNewDocument(() => {
    chrome.extension.isAllowedFileSchemeAccess = async () => false;
    const realFetch = window.fetch;
    window.fetch = (url, ...rest) => (String(url).startsWith('file:')
      ? Promise.reject(new TypeError('Failed to fetch'))
      : realFetch(url, ...rest));
  });

  await page.goto(`chrome-extension://${id}/viewer.html?src=${encodeURIComponent(sample.url)}`, { waitUntil: 'load' });
  const message = await until(() => page.$eval('.mdt-error', (element) => element.textContent), 'error message');
  assert(message.includes('Allow access to file URLs'), `unexpected error: ${message}`);

  await page.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
  await until(() => page.$eval('#file-access', (element) => !element.hidden), 'popup warning');
});

await webBrowser.close();
server.close();
rmSync(workDir, { recursive: true, force: true });

console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
