import { isMarkdownPath } from '../../shared/urls';
import { resolveLink } from './paths';
import type { FolderSource } from './sources';

/**
 * A document from an opened folder has no URL of its own, so relative links
 * and images are rewritten against the folder: Markdown links open in the
 * viewer, other files and images are read from disk on demand.
 *
 * This runs after sanitizing, and a link can only resolve to a path inside
 * the folder the user chose, never outside it.
 */
export function linkFolderDocument(root: ParentNode, source: FolderSource, currentPath: string): void {
  for (const image of root.querySelectorAll<HTMLImageElement>('img[src]')) {
    const resolved = resolveLink(currentPath, image.getAttribute('src')!);
    if (!resolved) continue;
    image.removeAttribute('src');
    image.dataset.folderSrc = resolved.path;
  }

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')!;
    if (href.startsWith('#')) continue;
    const resolved = resolveLink(currentPath, href);
    if (!resolved) continue;

    if (isMarkdownPath(resolved.path)) {
      anchor.setAttribute('href', source.href(resolved.path, { hash: resolved.hash }));
    } else {
      anchor.setAttribute('href', '#');
      anchor.dataset.folderFile = resolved.path;
    }
  }
}

export interface FileReader {
  file(path: string): Promise<File>;
}

const objectUrls = new Map<string, Promise<string | null>>();

/** One object URL per file, so re-rendering while typing does not leak memory. */
export function folderFileUrl(reader: FileReader, path: string): Promise<string | null> {
  let url = objectUrls.get(path);
  if (!url) {
    url = reader.file(path).then((file) => URL.createObjectURL(file), () => null);
    objectUrls.set(path, url);
  }
  return url;
}

export async function loadFolderImages(root: ParentNode, reader: FileReader): Promise<void> {
  const images = root.querySelectorAll<HTMLImageElement>('img[data-folder-src]:not([src])');
  await Promise.all([...images].map(async (image) => {
    const url = await folderFileUrl(reader, image.dataset.folderSrc!);
    if (url) image.src = url;
  }));
}
