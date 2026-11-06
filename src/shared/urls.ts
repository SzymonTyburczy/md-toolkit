export const WEB_ORIGINS = ['https://*/*', 'http://*/*'];

const MARKDOWN_PATH = /\.(md|markdown|mdown|mkd|mkdn|mdwn)$/i;
const MATCH_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'MD', 'MARKDOWN'];

export function webContentScriptMatches(): string[] {
  return ['https', 'http'].flatMap((scheme) =>
    MATCH_EXTENSIONS.flatMap((ext) => [`${scheme}://*/*.${ext}`, `${scheme}://*/*.${ext}?*`]),
  );
}

export function isMarkdownPath(pathname: string): boolean {
  return MARKDOWN_PATH.test(pathname);
}

/** True when a URL points at a Markdown document the viewer should open itself. */
export function isMarkdownUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['file:', 'http:', 'https:'].includes(parsed.protocol) && isMarkdownPath(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * The viewer is web accessible, so `src` is untrusted input. Local files are
 * limited to Markdown so a page cannot point the viewer at arbitrary files.
 */
export function isAllowedSource(url: string, extensionOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'file:') return isMarkdownPath(parsed.pathname);
    return url.startsWith(`${extensionOrigin}/`);
  } catch {
    return false;
  }
}

export function fileNameOf(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : url;
  } catch {
    return url;
  }
}

export function viewerUrl(viewerBase: string, source: string, hash = ''): string {
  return `${viewerBase}?src=${encodeURIComponent(source)}${hash}`;
}
