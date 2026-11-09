import { describe, expect, it } from 'vitest';
import { linkFolderDocument } from '../src/viewer/folders/links';
import {
  ancestorsOf, baseName, defaultDocument, encodePath, joinPath, parentPath, resolveLink, visibleEntries,
  type FolderEntry,
} from '../src/viewer/folders/paths';
import { collectFiles, findLineMatches, searchFolder } from '../src/viewer/folders/search';
import { ListingSource, parseDirectoryListing, type FolderSource } from '../src/viewer/folders/sources';

describe('paths', () => {
  it('joins and splits folder paths', () => {
    expect(joinPath('', 'a.md')).toBe('a.md');
    expect(joinPath('docs', 'a.md')).toBe('docs/a.md');
    expect(parentPath('docs/sub/a.md')).toBe('docs/sub');
    expect(parentPath('a.md')).toBe('');
    expect(baseName('docs/sub/a.md')).toBe('a.md');
    expect(ancestorsOf('a/b/c.md')).toEqual(['a', 'a/b']);
    expect(ancestorsOf('c.md')).toEqual([]);
  });

  it('encodes each segment but keeps the slashes', () => {
    expect(encodePath('moje notatki/a#1.md')).toBe('moje%20notatki/a%231.md');
  });

  it('resolves relative links inside the folder', () => {
    expect(resolveLink('docs/guide.md', 'other.md')).toEqual({ path: 'docs/other.md', hash: '' });
    expect(resolveLink('docs/guide.md', '../README.md#install')).toEqual({ path: 'README.md', hash: '#install' });
    expect(resolveLink('docs/guide.md', './img/a%20b.png')).toEqual({ path: 'docs/img/a b.png', hash: '' });
    expect(resolveLink('docs/guide.md', '/notes/todo.md')).toEqual({ path: 'notes/todo.md', hash: '' });
  });

  it('never climbs above the folder', () => {
    expect(resolveLink('a.md', '../../../etc/passwd')).toEqual({ path: 'etc/passwd', hash: '' });
  });

  it('leaves absolute URLs alone', () => {
    for (const link of ['https://example.com/a.md', 'mailto:a@b.c', '//cdn.example.com/x.png', 'file:///C:/x.md', 'data:image/png;base64,AA']) {
      expect(resolveLink('a.md', link)).toBeNull();
    }
  });

  it('keeps folders and Markdown, folders first, in natural order', () => {
    const entry = (name: string, kind: FolderEntry['kind'] = 'file'): FolderEntry => ({ name, path: name, kind });
    const result = visibleEntries([
      entry('notes.txt'), entry('10-end.md'), entry('2-start.md'), entry('zeta', 'directory'),
      entry('.git', 'directory'), entry('node_modules', 'directory'), entry('alpha', 'directory'),
      entry('.hidden.md'), entry('README.MD'),
    ]);
    expect(result.map((item) => item.name)).toEqual(['alpha', 'zeta', '2-start.md', '10-end.md', 'README.MD']);
  });

  it('opens a README by default, otherwise the first file', () => {
    const file = (name: string): FolderEntry => ({ name, path: name, kind: 'file' });
    expect(defaultDocument([file('a.md'), file('Readme.md')])).toBe('Readme.md');
    expect(defaultDocument([file('a.md'), file('index.md')])).toBe('index.md');
    expect(defaultDocument([{ name: 'dir', path: 'dir', kind: 'directory' }, file('b.md')])).toBe('b.md');
    expect(defaultDocument([])).toBeNull();
  });
});

describe('parseDirectoryListing', () => {
  const html = [
    '<script>start("C:\\\\notes\\\\");</script>',
    '<script>addRow("..","..",1,0,"0 B",0,"");</script>',
    '<script>addRow("docs","docs",1,0,"0 B",1700000000,"11/14/23");</script>',
    '<script>addRow("za\\u017c\\u00f3\\u0142\\u0107.md","za%C5%BC%C3%B3%C5%82%C4%87.md",0,12,"12 B",1700000000,"11/14/23");</script>',
    '<script>addRow("say \\"hi\\".md","say%20%22hi%22.md",0,1,"1 B",0,"");</script>',
    '<script>addRow(broken);</script>',
  ].join('\n');

  it('reads names and kinds, skipping the parent entry and broken rows', () => {
    expect(parseDirectoryListing(html)).toEqual([
      { name: 'docs', directory: true },
      { name: 'zażółć.md', directory: false },
      { name: 'say "hi".md', directory: false },
    ]);
  });
});

describe('ListingSource', () => {
  const source = new ListingSource('file:///C:/notes/', 'chrome-extension://id/viewer.html');

  it('names the folder and knows its parent', () => {
    expect(source.name).toBe('notes');
    expect(source.title).toBe('C:/notes/');
    expect(source.parentUrl).toBe('file:///C:/');
    expect(new ListingSource('file:///C:/', 'v').parentUrl).toBeNull();
  });

  it('maps between file URLs and folder paths', () => {
    expect(source.fileUrl('docs/a b.md')).toBe('file:///C:/notes/docs/a%20b.md');
    expect(source.pathOf('file:///C:/notes/docs/a%20b.md')).toBe('docs/a b.md');
    expect(source.pathOf('file:///C:/elsewhere/a.md')).toBeNull();
  });

  // Regression: Chrome serves folder listings with status 0, which is not "ok".
  it('accepts the status 0 Chrome uses for folder listings', async () => {
    const realFetch = globalThis.fetch;
    const listing = '<script>addRow("a.md","a.md",0,1,"1 B",0,"");</script>';
    globalThis.fetch = (async () => ({ ok: false, status: 0, text: async () => listing })) as unknown as typeof fetch;
    try {
      expect((await source.list('')).map((entry) => entry.name)).toEqual(['a.md']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('builds viewer links, with an optional search', () => {
    expect(source.href('a.md', { find: 'x y', hash: '#top' }))
      .toBe('chrome-extension://id/viewer.html?src=file%3A%2F%2F%2FC%3A%2Fnotes%2Fa.md&q=x%20y#top');
  });
});

describe('findLineMatches', () => {
  it('finds lines ignoring case, including Polish letters', () => {
    const matches = findLineMatches('first\nZAŻÓŁĆ here\nnothing\nżółć again', 'żółć');
    expect(matches.map((match) => match.line)).toEqual([2, 4]);
    expect(matches[0]).toMatchObject({ before: 'ZA', match: 'ŻÓŁĆ', after: ' here' });
  });

  it('treats the query literally and respects the limit', () => {
    expect(findLineMatches('a.b\naxb', 'a.b')).toHaveLength(1);
    expect(findLineMatches('x\nx\nx\nx', 'x', 2)).toHaveLength(2);
    expect(findLineMatches('anything', '')).toEqual([]);
  });

  it('shortens long lines around the match', () => {
    const [match] = findLineMatches(`${'a'.repeat(200)}NEEDLE${'b'.repeat(200)}`, 'needle');
    expect(match!.before.startsWith('…')).toBe(true);
    expect(match!.after.endsWith('…')).toBe(true);
    expect(match!.before.length).toBeLessThan(60);
  });
});

/** An in-memory folder for testing search and link rewriting. */
function memoryFolder(files: Record<string, string>): FolderSource {
  return {
    key: 'memory',
    name: 'memory',
    title: 'memory',
    async list(path) {
      const prefix = path ? `${path}/` : '';
      const names = new Map<string, FolderEntry>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...rest] = file.slice(prefix.length).split('/');
        names.set(name!, { name: name!, path: `${prefix}${name}`, kind: rest.length ? 'directory' : 'file' });
      }
      return visibleEntries([...names.values()]);
    },
    async read(path) {
      const text = files[path];
      if (text === undefined) throw new Error('missing');
      return text;
    },
    href: (path, options = {}) => `viewer?path=${encodeURIComponent(path)}${options.find ? `&q=${options.find}` : ''}${options.hash ?? ''}`,
  };
}

describe('searchFolder', () => {
  const folder = memoryFolder({
    'README.md': 'Welcome\nSee the guide',
    'docs/guide.md': 'The guide explains everything',
    'docs/deep/notes.md': 'nothing here',
    'node_modules/pkg/readme.md': 'guide inside a package',
    'image.png': 'binary',
  });

  it('walks every Markdown file except hidden folders', async () => {
    expect((await collectFiles(folder, 100)).sort()).toEqual(['README.md', 'docs/deep/notes.md', 'docs/guide.md']);
  });

  it('finds names and contents, names first', async () => {
    const results = await searchFolder(folder, 'guide');
    expect(results.map((result) => result.path)).toEqual(['docs/guide.md', 'README.md']);
    expect(results[0]).toMatchObject({ nameMatches: true });
    expect(results[0]!.lines[0]!.line).toBe(1);
    expect(results[1]!.lines[0]!.line).toBe(2);
  });

  it('reports progress and finishes with done', async () => {
    const updates: boolean[] = [];
    await searchFolder(folder, 'guide', { onUpdate: (_, done) => updates.push(done) });
    expect(updates.at(-1)).toBe(true);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const updates: boolean[] = [];
    await searchFolder(folder, 'guide', { signal: controller.signal, onUpdate: (_, done) => updates.push(done) });
    expect(updates).not.toContain(true);
  });

  it('respects the result limit', async () => {
    const many = memoryFolder(Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${index}.md`, 'match'])));
    expect(await searchFolder(many, 'match', { limits: { files: 100, results: 5 } })).toHaveLength(5);
  });
});

describe('linkFolderDocument', () => {
  const folder = memoryFolder({});

  function link(html: string, currentPath = 'docs/guide.md'): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    linkFolderDocument(root, folder, currentPath);
    return root;
  }

  it('points Markdown links at the viewer and keeps their fragment', () => {
    const root = link('<a href="../README.md#install">x</a>');
    expect(root.querySelector('a')!.getAttribute('href')).toBe('viewer?path=README.md#install');
  });

  it('loads images from the folder instead of from the URL', () => {
    const image = link('<img src="img/a.png">').querySelector('img')!;
    expect(image.hasAttribute('src')).toBe(false);
    expect(image.dataset.folderSrc).toBe('docs/img/a.png');
  });

  it('opens other files from the folder on click', () => {
    const anchor = link('<a href="report.pdf">pdf</a>').querySelector('a')!;
    expect(anchor.dataset.folderFile).toBe('docs/report.pdf');
    expect(anchor.getAttribute('href')).toBe('#');
  });

  it('leaves web links, anchors and data images alone', () => {
    const root = link('<a href="https://example.com/a.md">w</a><a href="#top">t</a><img src="data:image/png;base64,AA">');
    const [web, anchor] = root.querySelectorAll('a');
    expect(web!.getAttribute('href')).toBe('https://example.com/a.md');
    expect(anchor!.getAttribute('href')).toBe('#top');
    expect(root.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AA');
  });
});
