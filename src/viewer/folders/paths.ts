/**
 * Paths inside a folder are relative and use "/" on every platform, e.g.
 * "docs/guide.md". The folder itself is "".
 */

import { isMarkdownPath } from '../../shared/urls';

export function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Every folder that contains the path, outermost first, e.g. "a", "a/b" for "a/b/c.md". */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const FOLDER_ORIGIN = 'https://folder.invalid';

export interface ResolvedLink {
  path: string;
  hash: string;
}

/**
 * Resolves a link written in the document at `from` to a path in the same
 * folder. Returns null for absolute URLs. A leading "/" means the folder root,
 * and ".." can never climb above it.
 */
export function resolveLink(from: string, link: string): ResolvedLink | null {
  if (!link || SCHEME.test(link) || link.startsWith('//')) return null;
  const url = new URL(link, `${FOLDER_ORIGIN}/${encodePath(from)}`);
  const path = url.pathname.slice(1).split('/').map(decodeSegment).join('/');
  return { path, hash: url.hash };
}

export interface FolderEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
}

/** Version control data and installed packages are never worth browsing. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Keeps folders and Markdown files, folders first, in natural order ("2" before "10"). */
export function visibleEntries(entries: FolderEntry[]): FolderEntry[] {
  return entries
    .filter((entry) => !isHiddenName(entry.name))
    .filter((entry) => entry.kind === 'directory' || isMarkdownPath(entry.name))
    .sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'directory' ? -1 : 1));
}

const DEFAULT_DOCUMENTS = ['readme.md', 'index.md', 'readme.markdown', 'index.markdown'];

/** Picks the file to show when a folder is opened without one: a README, else the first file. */
export function defaultDocument(entries: FolderEntry[]): string | null {
  const files = entries.filter((entry) => entry.kind === 'file');
  for (const name of DEFAULT_DOCUMENTS) {
    const match = files.find((entry) => entry.name.toLowerCase() === name);
    if (match) return match.path;
  }
  return files[0]?.path ?? null;
}
