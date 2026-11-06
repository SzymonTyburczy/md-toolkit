/**
 * Runs at document_start on URLs that look like Markdown. It only decides
 * whether to hand the document to the viewer. Keep this file free of imports:
 * content scripts load as classic scripts, so a shared chunk would break it.
 */
(() => {
  /** Appended to a URL to see the original text instead of the viewer. */
  const RAW_FRAGMENT = '#mdt-raw';
  const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown', 'text/x-web-markdown']);

  if (window.top !== window) return;
  if (location.hash === RAW_FRAGMENT) return;
  // A .md path can still be an HTML page, e.g. github.com/owner/repo/blob/main/README.md.
  if (location.protocol !== 'file:' && !TEXT_TYPES.has(document.contentType)) return;

  const source = location.href.split('#')[0] ?? location.href;
  location.replace(`${chrome.runtime.getURL('viewer.html')}?src=${encodeURIComponent(source)}${location.hash}`);
})();
