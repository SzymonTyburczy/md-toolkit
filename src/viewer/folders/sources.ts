import { viewerUrl } from '../../shared/urls';
import { readSource } from '../source';
import { baseName, encodePath, joinPath, parentPath, visibleEntries, type FolderEntry } from './paths';

/** A folder the viewer can browse, whichever way it was reached. */
export interface FolderSource {
  /** Identifies the folder, so the tree can remember what was expanded. */
  readonly key: string;
  readonly name: string;
  /** The full location, shown as a tooltip. */
  readonly title: string;
  list(path: string): Promise<FolderEntry[]>;
  read(path: string): Promise<string>;
  /** Viewer URL for a file, optionally searching for `find` once it opens. */
  href(path: string, options?: { hash?: string; find?: string }): string;
}

function findParam(find?: string): string {
  return find ? `&q=${encodeURIComponent(find)}` : '';
}

/* ----------------------- folders chosen by the user ----------------------- */

export interface WorkspaceRecord {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpened: number;
}

/**
 * A folder picked with "Open folder". Reading and writing go through the
 * File System Access API, so edits can be saved straight back to the file.
 */
export class HandleSource implements FolderSource {
  readonly key: string;
  readonly name: string;
  readonly title: string;

  constructor(
    readonly workspace: WorkspaceRecord,
    private readonly viewerBase: string,
  ) {
    this.key = `workspace:${workspace.id}`;
    this.name = workspace.handle.name;
    this.title = workspace.handle.name;
  }

  private async directory(path: string): Promise<FileSystemDirectoryHandle> {
    let directory = this.workspace.handle;
    for (const part of path.split('/').filter(Boolean)) {
      directory = await directory.getDirectoryHandle(part);
    }
    return directory;
  }

  async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const directory = await this.directory(parentPath(path));
    return directory.getFileHandle(baseName(path));
  }

  async file(path: string): Promise<File> {
    return (await this.fileHandle(path)).getFile();
  }

  async list(path: string): Promise<FolderEntry[]> {
    const directory = await this.directory(path);
    const entries: FolderEntry[] = [];
    for await (const [name, handle] of directory.entries()) {
      entries.push({ name, path: joinPath(path, name), kind: handle.kind === 'directory' ? 'directory' : 'file' });
    }
    return visibleEntries(entries);
  }

  async read(path: string): Promise<string> {
    return (await this.file(path)).text();
  }

  /** Reading needs one permission, writing another. Asked for only on the first save. */
  async allowWriting(): Promise<boolean> {
    const handle = this.workspace.handle;
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  href(path: string, options: { hash?: string; find?: string } = {}): string {
    const query = `?ws=${encodeURIComponent(this.workspace.id)}&path=${encodeURIComponent(path)}`;
    return `${this.viewerBase}${query}${findParam(options.find)}${options.hash ?? ''}`;
  }
}

/* --------------------------- folders on file:// --------------------------- */

export interface ListingRow {
  name: string;
  directory: boolean;
}

/**
 * Reads the page Chrome generates for a file:// folder. Each entry is a call
 * such as addRow("name", "url", isDirectory, ...) whose arguments are JSON.
 */
export function parseDirectoryListing(html: string): ListingRow[] {
  const rows: ListingRow[] = [];
  for (const match of html.matchAll(/addRow\((.*)\);/g)) {
    try {
      const [name, , directory] = JSON.parse(`[${match[1]}]`) as [unknown, unknown, unknown];
      if (typeof name === 'string' && name !== '..' && name !== '.') rows.push({ name, directory: directory === 1 });
    } catch {
      // A row that does not parse is skipped rather than breaking the whole folder.
    }
  }
  return rows;
}

/** The folder around a local file, browsed through Chrome's own folder listings. */
export class ListingSource implements FolderSource {
  readonly key: string;
  readonly name: string;
  readonly title: string;

  constructor(
    /** A file:// URL ending in "/". */
    readonly rootUrl: string,
    private readonly viewerBase: string,
  ) {
    const location = decodeURIComponent(new URL(rootUrl).pathname).replace(/^\/([a-z]:)/i, '$1');
    this.key = `listing:${rootUrl}`;
    this.title = location;
    this.name = location.split('/').filter(Boolean).pop() ?? location;
  }

  /** The folder one level up, or null at the top of the drive. */
  get parentUrl(): string | null {
    const parent = new URL('../', this.rootUrl).href;
    return parent === this.rootUrl ? null : parent;
  }

  fileUrl(path: string): string {
    return new URL(encodePath(path), this.rootUrl).href;
  }

  /** The path of a file inside this folder, or null when it lies elsewhere. */
  pathOf(fileUrl: string): string | null {
    if (!fileUrl.startsWith(this.rootUrl)) return null;
    return fileUrl.slice(this.rootUrl.length).split('/').map((part) => decodeURIComponent(part)).join('/');
  }

  async list(path: string): Promise<FolderEntry[]> {
    const url = new URL(path ? `${encodePath(path)}/` : '', this.rootUrl).href;
    const response = await fetch(url, { cache: 'no-cache' });
    // Chrome answers a folder listing with status 0 rather than 200, body intact.
    if (!response.ok && response.status !== 0) throw new Error(`Cannot list ${url}`);
    const rows = parseDirectoryListing(await response.text());
    return visibleEntries(rows.map((row) => ({
      name: row.name,
      path: joinPath(path, row.name),
      kind: row.directory ? 'directory' : 'file',
    })));
  }

  read(path: string): Promise<string> {
    return readSource(this.fileUrl(path));
  }

  href(path: string, options: { hash?: string; find?: string } = {}): string {
    return viewerUrl(this.viewerBase, this.fileUrl(path), `${findParam(options.find)}${options.hash ?? ''}`);
  }
}
