import type { DocumentLook } from '../shared/apply-settings';
import { escapeHtml } from '../markdown/highlight';

const INTERFACE_ONLY = '.mdt-copy, .mdt-anchor';
const INTERNAL_ATTRIBUTES = ['data-line', 'data-source', 'data-rendered', 'data-display'];

/** Copies the document without any viewer controls or bookkeeping attributes. */
export function cleanDocumentClone(article: HTMLElement): HTMLElement {
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(INTERFACE_ONLY).forEach((element) => element.remove());
  for (const attribute of INTERNAL_ATTRIBUTES) {
    clone.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
  }
  return clone;
}

async function asDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

async function extensionCss(path: string): Promise<string> {
  return (await fetch(chrome.runtime.getURL(path))).text();
}

/** Embeds every url() in a stylesheet, so an exported file works with no other files around it. */
async function embedCssUrls(css: string, stylesheetPath: string): Promise<string> {
  const base = chrome.runtime.getURL(stylesheetPath);
  const urls = new Set([...css.matchAll(/url\(["']?(?!data:)([^"')]+)["']?\)/g)].map((match) => match[1]!));
  let result = css;
  await Promise.all([...urls].map(async (url) => {
    const dataUrl = await asDataUrl(new URL(url, base).href);
    result = result.replaceAll(url, dataUrl);
  }));
  return result;
}

/** Keeps only the @font-face rules for fonts the exported document really uses. */
function usedFontFaces(css: string, fontStacks: string): string {
  return (css.match(/@font-face\s*{[^}]*}/g) ?? [])
    .filter((rule) => {
      const family = /font-family:\s*"([^"]+)"/.exec(rule)?.[1];
      return family !== undefined && fontStacks.includes(family);
    })
    .join('\n');
}

/** Local images cannot be reached from an exported file, so they are embedded as well. */
async function embedLocalImages(root: HTMLElement): Promise<void> {
  const images = root.querySelectorAll<HTMLImageElement>('img[src^="file:"], img[src^="chrome-extension:"]');
  await Promise.all([...images].map(async (image) => {
    try {
      image.src = await asDataUrl(image.src);
    } catch {
      // A missing image stays as a broken link, the same as in the viewer.
    }
  }));
}

export interface StandaloneExport {
  article: HTMLElement;
  title: string;
  language: string;
  look: DocumentLook;
}

/** Produces one self-contained HTML file that looks the same as the viewer. */
export async function buildStandaloneHtml({ article, title, language, look }: StandaloneExport): Promise<string> {
  const clone = cleanDocumentClone(article);
  await embedLocalImages(clone);

  const computed = getComputedStyle(document.documentElement);
  const fontStacks = ['--font-body', '--font-heading', '--font-code']
    .map((name) => computed.getPropertyValue(name))
    .join(',');

  const [themes, documentStyles, fonts] = await Promise.all([
    extensionCss('styles/themes.css'),
    extensionCss('styles/document.css'),
    extensionCss('styles/fonts.css'),
  ]);
  const fontFaces = await embedCssUrls(usedFontFaces(fonts, fontStacks), 'styles/fonts.css');

  let math = '';
  if (clone.querySelector('.katex')) {
    // Only the woff2 files ship with the extension, which every supported Chrome can use.
    const katexCss = (await extensionCss('vendor/katex/katex.min.css'))
      .replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("[^"]*"\)/g, '');
    math = await embedCssUrls(katexCss, 'vendor/katex/katex.min.css');
  }

  const attributes = Object.entries(look.attributes)
    .map(([name, value]) => `data-${name}="${escapeHtml(value)}"`)
    .join(' ');
  const variables = Object.entries(look.variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');

  return `<!doctype html>
<html lang="${escapeHtml(language)}" ${attributes} style="color-scheme: ${look.dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MD Toolkit">
<title>${escapeHtml(title)}</title>
<style>
${fontFaces}
${themes}
:root { ${variables} }
html, body { margin: 0; background: var(--bg); }
${documentStyles}
${math}
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>
`;
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyRichText(article: HTMLElement): Promise<void> {
  const clone = cleanDocumentClone(article);
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([clone.innerHTML], { type: 'text/html' }),
      'text/plain': new Blob([article.innerText], { type: 'text/plain' }),
    }),
  ]);
}

export async function copyHtmlSource(article: HTMLElement): Promise<void> {
  await navigator.clipboard.writeText(cleanDocumentClone(article).innerHTML);
}
