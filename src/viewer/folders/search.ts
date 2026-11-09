import { baseName } from './paths';
import type { FolderSource } from './sources';

export interface LineMatch {
  /** One-based, as editors show it. */
  line: number;
  /** The surrounding text, shortened around the match. */
  before: string;
  match: string;
  after: string;
}

export interface FileResult {
  path: string;
  nameMatches: boolean;
  lines: LineMatch[];
}

const CONTEXT = 48;

function literal(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
}

/** Finds lines containing the query, ignoring case, with a little context on each side. */
export function findLineMatches(text: string, query: string, limit = 3): LineMatch[] {
  if (!query) return [];
  const pattern = literal(query);
  const matches: LineMatch[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
    const line = lines[index]!;
    const found = pattern.exec(line);
    if (!found) continue;
    const start = found.index;
    const end = start + found[0].length;
    const before = line.slice(Math.max(0, start - CONTEXT), start).trimStart();
    const after = line.slice(end, end + CONTEXT).trimEnd();
    matches.push({
      line: index + 1,
      before: (start > CONTEXT ? '…' : '') + before,
      match: found[0],
      after: after + (end + CONTEXT < line.length ? '…' : ''),
    });
  }
  return matches;
}

export interface SearchLimits {
  files: number;
  results: number;
}

const DEFAULT_LIMITS: SearchLimits = { files: 2000, results: 100 };

/** Lists every Markdown file below a folder, breadth first, up to a limit. */
export async function collectFiles(source: FolderSource, limit: number, signal?: AbortSignal): Promise<string[]> {
  const files: string[] = [];
  const queue = [''];
  while (queue.length > 0 && files.length < limit) {
    if (signal?.aborted) break;
    const directory = queue.shift()!;
    let entries;
    try {
      entries = await source.list(directory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.kind === 'directory') queue.push(entry.path);
      else if (files.length < limit) files.push(entry.path);
    }
  }
  return files;
}

/**
 * Searches file names and contents. Results arrive in batches through
 * `onUpdate`, so a large folder shows its first hits straight away.
 */
export async function searchFolder(
  source: FolderSource,
  query: string,
  options: { signal?: AbortSignal; onUpdate?: (results: FileResult[], done: boolean) => void; limits?: SearchLimits } = {},
): Promise<FileResult[]> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const files = await collectFiles(source, limits.files, options.signal);
  const pattern = literal(query);
  const results: FileResult[] = [];

  // Names first: they are free to check and usually what someone types.
  for (const path of files) {
    if (pattern.test(baseName(path))) results.push({ path, nameMatches: true, lines: [] });
  }
  options.onUpdate?.(results.slice(0, limits.results), false);

  const byPath = new Map(results.map((result) => [result.path, result]));
  let next = 0;
  const worker = async () => {
    while (next < files.length && !options.signal?.aborted && results.length < limits.results) {
      const path = files[next++]!;
      let text: string;
      try {
        text = await source.read(path);
      } catch {
        continue;
      }
      const lines = findLineMatches(text, query);
      if (lines.length === 0) continue;
      const existing = byPath.get(path);
      if (existing) existing.lines = lines;
      else {
        const result = { path, nameMatches: false, lines };
        results.push(result);
        byPath.set(path, result);
      }
    }
  };

  // A few reads at once keeps local disks busy without flooding anything.
  const progress = setInterval(() => options.onUpdate?.(results.slice(0, limits.results), false), 200);
  try {
    await Promise.all(Array.from({ length: 6 }, worker));
  } finally {
    clearInterval(progress);
  }

  const final = results.slice(0, limits.results);
  if (!options.signal?.aborted) options.onUpdate?.(final, true);
  return final;
}
