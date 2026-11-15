import { debounce, h, icon } from '../../shared/dom';
import { t } from '../../shared/i18n';
import { chooseFolder, workspaceUrl } from './landing';
import { ancestorsOf, baseName, parentPath, type FolderEntry } from './paths';
import { searchFolder, type FileResult } from './search';
import type { FolderSource } from './sources';
import { listWorkspaces } from './store';

export interface FolderJump {
  name: string;
  title: string;
  select(): void;
}

export interface FilePanelOptions {
  source: FolderSource;
  currentPath: string | null;
  viewerBase: string;
  /** The opened folder this panel shows, left out of the list of folders to switch to. */
  workspaceId?: string;
  /** Present when the folder can move up a level, i.e. folders reached through file://. */
  onUp?: () => void;
  /** Folders above this one, nearest first, for jumping several levels at once. */
  parents?: FolderJump[];
}

interface TreeState {
  expanded: string[];
  scroll: number;
}

function loadState(key: string): TreeState {
  try {
    const stored = JSON.parse(sessionStorage.getItem(`mdt-tree:${key}`) ?? 'null') as TreeState | null;
    if (stored && Array.isArray(stored.expanded)) return stored;
  } catch {
    // A broken or blocked store just means starting with a collapsed tree.
  }
  return { expanded: [], scroll: 0 };
}

/** The Files tab: a lazily loaded folder tree plus search across every file in it. */
export class FilePanel {
  private readonly expanded: Set<string>;
  private readonly tree = h('div', { class: 'mdt-files-tree', role: 'tree' });
  private readonly results = h('div', { class: 'mdt-files-results', hidden: true });
  private readonly input = h('input', {
    type: 'search',
    class: 'mdt-files-search',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: t('files.search'),
    'aria-label': t('files.search'),
  });
  private searchRun: AbortController | undefined;

  constructor(
    container: HTMLElement,
    private readonly options: FilePanelOptions,
  ) {
    const state = loadState(options.source.key);
    this.expanded = new Set([...state.expanded, ...ancestorsOf(options.currentPath ?? '')]);

    const bar = h('div', { class: 'mdt-files-bar' },
      this.folderMenu(),
      options.onUp
        ? h('button', { class: 'mdt-icon-btn', type: 'button', title: t('files.up'), 'aria-label': t('files.up'), onClick: options.onUp }, icon('arrow-up'))
        : null,
      h('button', { class: 'mdt-icon-btn', type: 'button', title: t('files.refresh'), 'aria-label': t('files.refresh'), onClick: () => void this.refresh() }, icon('refresh')),
    );

    this.input.addEventListener('input', debounce(() => void this.search(), 250));
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.input.value) {
        event.stopPropagation();
        this.input.value = '';
        void this.search();
      }
    });

    container.replaceChildren(bar, h('div', { class: 'mdt-files-search-wrap' }, this.input), this.results, this.tree);
    this.tree.addEventListener('scroll', debounce(() => this.saveState(), 150), { passive: true });
    void this.render(state.scroll);
  }

  focusSearch(): void {
    this.input.focus();
    this.input.select();
  }

  /** The folder name doubles as a menu for moving to another folder. */
  private folderMenu(): HTMLElement {
    const menu = h('div', { class: 'mdt-menu mdt-files-menu', role: 'menu', hidden: true });
    const button = h('button', {
      class: 'mdt-files-root',
      type: 'button',
      title: `${this.options.source.title}\n${t('files.switch')}`,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    }, icon('folder'), h('span', {}, this.options.source.name), icon('chevron-down'));

    const close = () => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };

    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!menu.hidden) {
        close();
        return;
      }
      await this.fillMenu(menu);
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    });
    menu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    return h('div', { class: 'mdt-files-switch' }, button, menu);
  }

  private async fillMenu(menu: HTMLElement): Promise<void> {
    const items: HTMLElement[] = [];
    const heading = (key: Parameters<typeof t>[0]) => h('p', { class: 'mdt-menu-heading' }, t(key));

    const parents = this.options.parents ?? [];
    if (parents.length > 0) {
      items.push(heading('files.parents'));
      for (const parent of parents) {
        items.push(h('button', { type: 'button', role: 'menuitem', title: parent.title, onClick: () => parent.select() },
          icon('folder'), h('span', {}, parent.name)));
      }
    }

    const recent = (await listWorkspaces().catch(() => [])).filter((record) => record.id !== this.options.workspaceId);
    if (recent.length > 0) {
      items.push(heading('folder.recent'));
      for (const record of recent) {
        items.push(h('a', { href: workspaceUrl(this.options.viewerBase, record.id), role: 'menuitem' },
          icon('folder'), h('span', {}, record.name)));
      }
    }

    if (items.length > 0) items.push(h('hr'));
    items.push(h('button', {
      type: 'button',
      role: 'menuitem',
      onClick: () => void chooseFolder(this.options.viewerBase),
    }, icon('folder-open'), h('span', {}, t('folder.choose'))));
    menu.replaceChildren(...items);
  }

  async refresh(): Promise<void> {
    const scroll = this.tree.scrollTop;
    await this.render(scroll);
    if (this.input.value) void this.search();
  }

  private saveState(): void {
    try {
      const state: TreeState = { expanded: [...this.expanded], scroll: this.tree.scrollTop };
      sessionStorage.setItem(`mdt-tree:${this.options.source.key}`, JSON.stringify(state));
    } catch {
      // The tree works the same without remembering its state.
    }
  }

  private async render(scroll: number): Promise<void> {
    const list = h('ul', { role: 'group' });
    await this.fill(list, '');
    this.tree.replaceChildren(list);
    this.tree.scrollTop = scroll;
    this.tree.querySelector('.mdt-file-current')?.scrollIntoView({ block: 'nearest' });
  }

  private async fill(list: HTMLElement, path: string): Promise<void> {
    let entries: FolderEntry[];
    try {
      entries = await this.options.source.list(path);
    } catch {
      list.replaceChildren(h('li', { class: 'mdt-files-note' }, t('files.error')));
      return;
    }
    if (entries.length === 0) {
      list.replaceChildren(h('li', { class: 'mdt-files-note' }, t(path ? 'files.emptyFolder' : 'files.empty')));
      return;
    }
    const items = await Promise.all(entries.map((entry) => this.item(entry)));
    list.replaceChildren(...items);
  }

  private async item(entry: FolderEntry): Promise<HTMLElement> {
    if (entry.kind === 'file') {
      const current = entry.path === this.options.currentPath;
      return h('li', { role: 'treeitem' },
        h('a', {
          class: `mdt-file-row${current ? ' mdt-file-current' : ''}`,
          href: this.options.source.href(entry.path),
          title: entry.path,
          'aria-current': current ? 'page' : undefined,
        }, icon('file-text'), h('span', {}, entry.name)),
      );
    }

    const children = h('ul', { role: 'group' });
    const item = h('li', { role: 'treeitem', 'aria-expanded': 'false' });
    const toggle = h('button', { class: 'mdt-file-row mdt-folder-row', type: 'button', title: entry.path },
      icon('chevron-right'), icon('folder'), h('span', {}, entry.name));

    let loaded = false;
    const setOpen = async (open: boolean) => {
      item.setAttribute('aria-expanded', String(open));
      children.hidden = !open;
      if (open) this.expanded.add(entry.path);
      else this.expanded.delete(entry.path);
      this.saveState();
      if (open && !loaded) {
        loaded = true;
        await this.fill(children, entry.path);
      }
    };

    toggle.addEventListener('click', () => void setOpen(item.getAttribute('aria-expanded') !== 'true'));
    children.hidden = true;
    item.append(toggle, children);
    if (this.expanded.has(entry.path)) await setOpen(true);
    return item;
  }

  private async search(): Promise<void> {
    this.searchRun?.abort();
    const query = this.input.value.trim();
    if (!query) {
      this.results.hidden = true;
      this.tree.hidden = false;
      return;
    }

    const run = new AbortController();
    this.searchRun = run;
    this.tree.hidden = true;
    this.results.hidden = false;
    this.results.replaceChildren(h('p', { class: 'mdt-files-note' }, t('files.searching')));

    await searchFolder(this.options.source, query, {
      signal: run.signal,
      onUpdate: (found, done) => {
        if (run.signal.aborted) return;
        this.showResults(found, query, done);
      },
    });
  }

  private showResults(found: FileResult[], query: string, done: boolean): void {
    if (found.length === 0) {
      this.results.replaceChildren(h('p', { class: 'mdt-files-note' }, t(done ? 'files.noResults' : 'files.searching')));
      return;
    }

    const items = found.map((result) => {
      const folder = parentPath(result.path);
      const link = h('a', { class: 'mdt-result', href: this.options.source.href(result.path, { find: query }) },
        h('span', { class: 'mdt-result-name' }, icon('file-text'), h('span', {}, baseName(result.path))),
        folder ? h('span', { class: 'mdt-result-folder' }, folder) : null,
        ...result.lines.map((line) => h('span', { class: 'mdt-result-line' },
          h('span', { class: 'mdt-result-number' }, String(line.line)),
          h('span', {}, line.before, h('mark', {}, line.match), line.after),
        )),
      );
      return link;
    });
    this.results.replaceChildren(...items);
    if (!done) this.results.append(h('p', { class: 'mdt-files-note' }, t('files.searching')));
  }
}
