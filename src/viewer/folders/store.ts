import type { WorkspaceRecord } from './sources';

/**
 * Folder handles are kept in IndexedDB, the only storage that can hold them,
 * so a folder can be reopened later without choosing it again.
 */

const DATABASE = 'md-toolkit';
const STORE = 'workspaces';
const MAX_RECENT = 10;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'));
  });
}

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'id' });
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error('Cannot open IndexedDB'));
  });
  return database;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await open()).transaction(STORE, mode).objectStore(STORE);
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const records = await request<WorkspaceRecord[]>((await store('readonly')).getAll());
  return records.sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | undefined> {
  return request<WorkspaceRecord | undefined>((await store('readonly')).get(id));
}

export async function removeWorkspace(id: string): Promise<void> {
  await request((await store('readwrite')).delete(id));
}

export async function touchWorkspace(record: WorkspaceRecord): Promise<void> {
  await request((await store('readwrite')).put({ ...record, lastOpened: Date.now() }));
}

/** Saves a newly chosen folder, reusing the existing entry when the same folder is picked again. */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<WorkspaceRecord> {
  const existing = await listWorkspaces();
  for (const record of existing) {
    if (await record.handle.isSameEntry(handle)) {
      const updated = { ...record, handle, name: handle.name, lastOpened: Date.now() };
      await request((await store('readwrite')).put(updated));
      return updated;
    }
  }

  const record: WorkspaceRecord = { id: crypto.randomUUID(), name: handle.name, handle, lastOpened: Date.now() };
  await request((await store('readwrite')).put(record));
  for (const old of existing.slice(MAX_RECENT - 1)) await removeWorkspace(old.id);
  return record;
}
