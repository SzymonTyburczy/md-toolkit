import './ui.css';
import { createRenderer, type Renderer } from '../markdown/render';
import { resolveRelativeUrls, sanitizeToFragment } from '../markdown/sanitize';
import { applyLook, computeLook, systemDarkQuery, type DocumentLook } from '../shared/apply-settings';
import { byId, debounce, h, hydrateIcons, icon, isTyping, perFrame } from '../shared/dom';
import { currentLocale, setLanguage, t, translateDom, wordCountLabel, type MessageKey } from '../shared/i18n';
import {
  DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type Settings,
} from '../shared/settings';
import { fileNameOf, isAllowedSource, isMarkdownUrl, viewerUrl } from '../shared/urls';
import type { MarkdownEditor } from './editor';
import { enhanceBlocks, renderDiagrams, renderMath } from './enhance';
import { buildStandaloneHtml, copyHtmlSource, copyRichText, downloadFile } from './export';
import { FocusMode } from './focus';
import { ensureFolderAccess, renderFolderLanding } from './folders/landing';
import { folderFileUrl, linkFolderDocument, loadFolderImages } from './folders/links';
import { FilePanel } from './folders/panel';
import { baseName, defaultDocument } from './folders/paths';
import { HandleSource, ListingSource } from './folders/sources';
import { getWorkspace, touchWorkspace } from './folders/store';
import { blocksOf, patchChildren } from './patch';
import { ScrollSync } from './scroll-sync';
import { DocumentSearch } from './search';
import { SettingsPanel } from './settings-panel';
import { LoadError, readSource, SourceWatcher, type LoadFailure } from './source';
import { buildTextIndex, countWords } from './text-index';
import { TableOfContents } from './toc';

const DRAFT_KEY = 'draft';
const LIVE_PREVIEW_DELAY = 120;

const root = document.documentElement;
const preview = byId('mdt-preview');
const article = byId('mdt-document');
const progressBar = byId('mdt-progress-bar');
const dirtyMark = byId('mdt-dirty');
const saveButton = byId<HTMLButtonElement>('mdt-btn-save');
const banner = byId('mdt-banner');
const exportMenu = byId('mdt-export-menu');
const exportButton = byId<HTMLButtonElement>('mdt-btn-export');
const helpDialog = byId<HTMLDialogElement>('mdt-help');
const toast = byId('mdt-toast');
const editorPane = byId('mdt-editor-pane');
const splitHandle = byId('mdt-split-handle');
const settingsAside = byId('mdt-settings');

const viewerBase = chrome.runtime.getURL('viewer.html');
const params = new URLSearchParams(location.search);
/** A document reached by URL: a local file or a web page. */
const source = params.get('src');
/** A folder chosen with "Open folder", and the file in it. */
const workspaceId = params.get('ws');
let currentPath = params.get('path');
/** The page for choosing a folder. */
const showFolderPage = params.has('folder');
/** Text to search for once the document opens, set by folder search results. */
const findOnLoad = params.get('q');
/** The scratchpad has no file behind it: text lives in extension storage instead. */
const isScratchpad = source === null && workspaceId === null && !showFolderPage;

let settings: Settings = DEFAULT_SETTINGS;
let look: DocumentLook;
let renderer: Renderer;
let text = '';
/** Last text known to match the file on disk, which is what "unsaved" compares against. */
let savedText = '';
let documentTitle = '';
let fileHandle: FileSystemFileHandle | undefined;
let editor: MarkdownEditor | undefined;
let scrollSync: ScrollSync | undefined;
let pendingDiskText: string | null = null;
let watcher: SourceWatcher | undefined;
let folder: HandleSource | null = null;
/** False on pages with no document to edit, such as the folder chooser. */
let documentOpen = false;

const toc = new TableOfContents(byId('mdt-toc-list'), preview, article);
const search = new DocumentSearch(article, preview);
const focus = new FocusMode(preview, article);
const panel = new SettingsPanel(settingsAside, {
  get: () => settings,
  set: updateSetting,
  reset: resetAppearance,
}, () => toggleSettings(false));

const isDirty = (): boolean => !isScratchpad && text !== savedText;

function fileName(): string {
  if (source) return fileNameOf(source);
  if (currentPath) return baseName(currentPath);
  return 'untitled.md';
}

function showDocumentName(): void {
  const label = byId('mdt-doc-name');
  if (isScratchpad) {
    label.textContent = t('scratch.title');
    label.title = '';
  } else if (folder && currentPath) {
    label.textContent = currentPath;
    label.title = `${folder.name}/${currentPath}`;
  } else {
    label.textContent = fileName();
    label.title = source ?? '';
  }
}

/* ------------------------------ rendering ------------------------------ */

function createDocumentRenderer(): Renderer {
  return createRenderer({
    typographer: settings.typographer,
    breaks: settings.breaks,
    frontMatterLabel: t('frontMatter.label'),
    alertLabels: {
      note: t('alert.note'),
      tip: t('alert.tip'),
      important: t('alert.important'),
      warning: t('alert.warning'),
      caution: t('alert.caution'),
    },
  });
}

function renderDocument(): void {
  const rendered = renderer(text);
  const fragment = sanitizeToFragment(rendered.html, source);
  if (source) resolveRelativeUrls(fragment, source);
  else if (folder && currentPath) linkFolderDocument(fragment, folder, currentPath);

  const showHint = isScratchpad && !text.trim();
  const blocks = showHint
    ? [h('p', { class: 'mdt-scratch-hint' }, t('scratch.hint'))]
    : blocksOf(fragment);
  enhanceBlocks(patchChildren(article, blocks));
  if (folder) void loadFolderImages(article, folder);

  const severalChapters = rendered.headings.filter((heading) => heading.level === 1).length > 1;
  const numberFrom = severalChapters ? 1 : 2;
  article.dataset.numberFrom = String(numberFrom);
  toc.update(rendered.headings, settings.tocDepth, look.attributes.numbering === 'on' ? numberFrom : null);

  documentTitle = rendered.title ?? (isScratchpad ? t('scratch.title') : fileName());
  document.title = `${documentTitle} - MD Toolkit`;
  showDocumentName();

  search.refresh();
  focus.refresh();
  updateReadingStats();
  updateDirty();
  void renderMath(article).then(updateReadingStats);
  void renderDiagrams(article, look.dark);
}

const renderSoon = debounce(renderDocument, LIVE_PREVIEW_DELAY);

function updateDirty(): void {
  const dirty = isDirty();
  dirtyMark.hidden = !dirty;
  saveButton.disabled = !isScratchpad && !dirty;
}

/* ---------------------------- reading tools ---------------------------- */

function updateReadingStats(): void {
  root.dataset.readingBar = settings.readingBar ? 'on' : 'off';
  if (!settings.readingBar) return;

  const words = countWords(buildTextIndex(article).text);
  const minutes = Math.round(words / settings.wordsPerMinute);
  byId('mdt-status-words').textContent = wordCountLabel(words);
  byId('mdt-status-time').textContent = minutes < 1 ? t('status.lessThanMinute') : t('status.minutes', { minutes });
  updateProgress();
}

function updateProgress(): void {
  const scrollable = preview.scrollHeight - preview.clientHeight;
  const ratio = scrollable <= 0 ? 1 : Math.min(preview.scrollTop / scrollable, 1);
  progressBar.style.transform = `scaleX(${ratio})`;
  byId('mdt-status-progress').textContent = t('status.progress', { percent: Math.round(ratio * 100) });
}

preview.addEventListener('scroll', perFrame(updateProgress), { passive: true });

/* ------------------------------- settings ------------------------------ */

const persistSettings = debounce(() => void saveSettings(settings), 300);

/** Debounced because a colour picker reports every position it is dragged through. */
const redrawDiagrams = debounce(() => void renderDiagrams(article, look.dark, true), 200);

/** Applies settings to the page, redoing only the work each change really needs. */
function applySettings(previous: Settings | null): void {
  const previousTheme = previous ? look.theme : null;
  const previousNumbering = previous ? look.attributes.numbering : null;

  setLanguage(settings.language);
  look = computeLook(settings, systemDarkQuery().matches);
  applyLook(look);

  const languageChanged = previous?.language !== settings.language;
  if (languageChanged) {
    translateDom();
    panel.relabel();
  }

  const needsRender = !previous
    || languageChanged
    || previous.typographer !== settings.typographer
    || previous.breaks !== settings.breaks
    || previous.tocDepth !== settings.tocDepth
    || previous.readingBar !== settings.readingBar
    || previous.wordsPerMinute !== settings.wordsPerMinute
    || previousNumbering !== look.attributes.numbering;

  if (needsRender) renderer = createDocumentRenderer();
  if (previous && needsRender) renderDocument();

  const diagramsChanged = previousTheme !== look.theme
    || previous?.accent !== settings.accent
    || previous?.bodyFont !== settings.bodyFont;
  if (previous && diagramsChanged) redrawDiagrams();

  root.dataset.toc = settings.tocOpen ? 'open' : 'closed';
  panel.sync();
}

function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const previous = settings;
  settings = { ...settings, [key]: value };
  applySettings(previous);
  persistSettings();
}

/** Keeps language and auto-reload, which belong to the options page, not the look of a document. */
function resetAppearance(): void {
  const previous = settings;
  settings = {
    ...DEFAULT_SETTINGS,
    language: settings.language,
    autoReload: settings.autoReload,
    reloadInterval: settings.reloadInterval,
    linksInNewTab: settings.linksInNewTab,
  };
  applySettings(previous);
  persistSettings();
}

function toggleSettings(open = settingsAside.hidden): void {
  settingsAside.hidden = !open;
  byId('mdt-btn-settings').setAttribute('aria-pressed', String(open));
}

function toggleToc(): void {
  updateSetting('tocOpen', !settings.tocOpen);
}

/* ------------------------------- editing ------------------------------- */

function onEditorChange(next: string): void {
  text = next;
  updateDirty();
  renderSoon();
  if (isScratchpad) saveDraft(next);
}

const saveDraft = debounce((draft: string) => {
  void chrome.storage.local.set({ [DRAFT_KEY]: draft });
}, 400);

async function setEditing(editing: boolean): Promise<void> {
  if (editing && !documentOpen) return;
  root.dataset.mode = editing ? 'split' : 'read';
  byId('mdt-mode-read').setAttribute('aria-pressed', String(!editing));
  byId('mdt-mode-edit').setAttribute('aria-pressed', String(editing));
  editorPane.hidden = !editing;
  splitHandle.hidden = !editing;
  saveButton.hidden = !editing;
  if (!editing) return;

  if (!editor) {
    const { createEditor } = await import('./editor');
    editor = createEditor(editorPane, text, {
      placeholder: t('editor.placeholder'),
      onChange: onEditorChange,
      onScroll: perFrame(() => scrollSync?.fromEditor()),
    });
    scrollSync = new ScrollSync(editor, preview, article);
    preview.addEventListener('scroll', perFrame(() => {
      if (!editorPane.hidden) scrollSync?.fromPreview();
    }), { passive: true });
  }
  editor.focus();
}

function toggleEditing(): void {
  void setEditing(root.dataset.mode !== 'split');
}

async function save(): Promise<void> {
  if (!documentOpen) return;
  try {
    // A file from an opened folder saves in place, once writing is allowed.
    if (folder && fileHandle && !(await folder.allowWriting())) {
      showToast(t('folder.writeDenied'));
      return;
    }
    fileHandle ??= await window.showSaveFilePicker({
      suggestedName: fileName(),
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    savedText = text;
    watcher?.follow(fileHandle);
    watcher?.remember(text);
    hideBanner();
    updateDirty();
    showToast(t('export.saved'));
  } catch (error) {
    // Closing the file picker is a normal way to change your mind, not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    showToast(t('editor.saveFailed'));
  }
}

function showBanner(): void {
  banner.hidden = false;
}

function hideBanner(): void {
  banner.hidden = true;
  pendingDiskText = null;
}

/** Applies a new version of the file without moving the reader. */
function applyDiskText(next: string): void {
  const scrollTop = preview.scrollTop;
  text = next;
  savedText = next;
  editor?.setText(next);
  // setText fires the editor's change handler, which only schedules a render.
  renderDocument();
  preview.scrollTop = scrollTop;
}

function onFileChanged(next: string): void {
  if (next === text) {
    savedText = next;
    updateDirty();
    return;
  }
  if (isDirty()) {
    pendingDiskText = next;
    showBanner();
    return;
  }
  applyDiskText(next);
}

byId('mdt-banner-reload').addEventListener('click', () => {
  if (pendingDiskText !== null) applyDiskText(pendingDiskText);
  hideBanner();
});

byId('mdt-banner-keep').addEventListener('click', () => {
  // Compare against the new file from now on, so the document counts as unsaved.
  if (pendingDiskText !== null) savedText = pendingDiskText;
  hideBanner();
  updateDirty();
});

window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

function initSplitHandle(): void {
  splitHandle.addEventListener('pointerdown', (start) => {
    start.preventDefault();
    splitHandle.setPointerCapture(start.pointerId);
    const main = byId('mdt-main');

    const move = (event: PointerEvent) => {
      const bounds = editorPane.getBoundingClientRect();
      const available = main.getBoundingClientRect().right - bounds.left;
      const ratio = Math.min(Math.max((event.clientX - bounds.left) / available, 0.2), 0.8);
      root.style.setProperty('--editor-share', String(ratio));
    };
    const stop = () => {
      splitHandle.removeEventListener('pointermove', move);
      splitHandle.removeEventListener('pointerup', stop);
    };
    splitHandle.addEventListener('pointermove', move);
    splitHandle.addEventListener('pointerup', stop);
  });
}

/* -------------------------------- export ------------------------------- */

function exportName(): string {
  return fileName().replace(/\.[^.]+$/, '');
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(Number(toast.dataset.timer));
  toast.dataset.timer = String(setTimeout(() => { toast.hidden = true; }, 2200));
}

async function copied(action: Promise<void>): Promise<void> {
  try {
    await action;
    showToast(t('export.done'));
  } catch {
    showToast(t('export.failed'));
  }
}

const EXPORT_ACTIONS: Record<string, () => void | Promise<void>> = {
  html: async () => {
    try {
      const html = await buildStandaloneHtml({ article, title: documentTitle, language: currentLocale(), look });
      downloadFile(`${exportName()}.html`, html, 'text/html');
    } catch {
      showToast(t('export.failed'));
    }
  },
  print: () => window.print(),
  markdown: () => downloadFile(fileName(), text, 'text/markdown'),
  'copy-rich': () => copied(copyRichText(article)),
  'copy-html': () => copied(copyHtmlSource(article)),
  'copy-markdown': () => copied(navigator.clipboard.writeText(text)),
};

function toggleExportMenu(open = exportMenu.hidden): void {
  exportMenu.hidden = !open;
  exportButton.setAttribute('aria-expanded', String(open));
}

exportButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleExportMenu();
});

exportMenu.addEventListener('click', (event) => {
  const item = (event.target as Element).closest<HTMLElement>('[data-export]');
  if (!item) return;
  toggleExportMenu(false);
  void EXPORT_ACTIONS[item.dataset.export!]?.();
});

document.addEventListener('click', () => toggleExportMenu(false));

/* ------------------------------ navigation ----------------------------- */

function fragmentId(fragment: string): string {
  const raw = fragment.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    // The hash comes from the address bar, so it can hold a malformed escape.
    return raw;
  }
}

function scrollToFragment(fragment: string): boolean {
  const id = fragmentId(fragment);
  const target = id ? article.querySelector(`[id="${CSS.escape(id)}"]`) : null;
  if (!target) return false;
  target.scrollIntoView();
  return true;
}

function followInPageLink(anchor: HTMLAnchorElement, event: Event): void {
  const hash = anchor.getAttribute('href')!;
  event.preventDefault();
  if (scrollToFragment(hash)) history.pushState(null, '', hash);
}

/**
 * The viewer is an extension page, so document links need routing: Markdown
 * stays in the viewer, and Chrome will not let the page itself open file: URLs.
 */
function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Element;

  const copyButton = target.closest('.mdt-copy');
  if (copyButton) {
    const code = copyButton.parentElement?.querySelector('code')?.textContent ?? '';
    void navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => {
      copyButton.replaceChildren(icon('check'));
      setTimeout(() => copyButton.replaceChildren(icon('copy')), 1500);
    });
    return;
  }

  const anchor = target.closest('a');
  const href = anchor?.getAttribute('href');
  if (!anchor || !href) return;

  // Links to non-Markdown files in an opened folder, such as a PDF next to the notes.
  const folderFile = anchor.dataset.folderFile;
  if (folderFile && folder) {
    event.preventDefault();
    void folderFileUrl(folder, folderFile).then((url) => url && window.open(url, '_blank', 'noopener'));
    return;
  }

  if (href.startsWith('#')) {
    followInPageLink(anchor, event);
    return;
  }

  const newTab = event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
  const url = anchor.href;

  if (isMarkdownUrl(url)) {
    event.preventDefault();
    const [documentUrl = url, hash] = url.split('#');
    const destination = viewerUrl(viewerBase, documentUrl, hash ? `#${hash}` : '');
    if (newTab || settings.linksInNewTab) void chrome.tabs.create({ url: destination });
    else location.href = destination;
  } else if (url.startsWith('file:')) {
    event.preventDefault();
    void chrome.tabs.create({ url });
  } else if (settings.linksInNewTab && !newTab && /^https?:/.test(url)) {
    event.preventDefault();
    void chrome.tabs.create({ url });
  }
}

article.addEventListener('click', onDocumentClick);
article.addEventListener('auxclick', onDocumentClick);

byId('mdt-toc-list').addEventListener('click', (event) => {
  const anchor = (event.target as Element).closest('a');
  if (anchor) followInPageLink(anchor, event);
});

window.addEventListener('popstate', () => {
  if (location.hash) scrollToFragment(location.hash);
  else preview.scrollTop = 0;
});

/* ------------------------------- keyboard ------------------------------ */

const SHORTCUTS: Record<string, () => void> = {
  t: toggleToc,
  e: toggleEditing,
  f: () => focus.toggle(),
  s: () => toggleSettings(),
  '/': () => search.open(),
  '?': () => helpDialog.showModal(),
};

document.addEventListener('keydown', (event) => {
  const command = event.ctrlKey || event.metaKey;

  // While reading, Ctrl+S keeps its normal meaning of saving the page.
  if (command && event.key.toLowerCase() === 's' && root.dataset.mode === 'split') {
    event.preventDefault();
    void save();
    return;
  }
  if (event.key === 'Escape') {
    if (search.isOpen) search.close();
    else if (focus.isActive) focus.exit();
    else toggleExportMenu(false);
    return;
  }
  if (command || event.altKey || isTyping(event.target)) return;
  if ((event.target as Element).closest?.('.cm-editor')) return;

  const run = SHORTCUTS[event.key.toLowerCase()];
  if (run) {
    event.preventDefault();
    run();
  }
});

/* --------------------------------- boot -------------------------------- */

function failureMessage(failure: LoadFailure): string {
  switch (failure.kind) {
    case 'file-access': return t('error.fileAccess');
    case 'missing': return t('error.missing');
    case 'web': return t('error.web', { origin: failure.origin });
    case 'status': return t('error.status', { status: failure.status });
  }
}

function showError(message: string, actions: HTMLElement[] = []): void {
  article.replaceChildren(h('div', { class: 'mdt-error' },
    h('h1', {}, t('error.title')),
    h('p', {}, message),
    h('div', { class: 'mdt-error-actions' }, ...actions),
  ));
}

function actionButton(key: MessageKey, onClick: () => void): HTMLElement {
  return h('button', { class: 'mdt-button', type: 'button', onClick }, t(key));
}

function showLoadFailure(failure: LoadFailure): void {
  const actions: HTMLElement[] = [];

  if (failure.kind === 'file-access') {
    actions.push(actionButton('error.fileAccessAction', () => {
      void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    }));
  }
  if (failure.kind === 'web') {
    actions.push(actionButton('error.webAction', () => {
      void chrome.permissions.request({ origins: [`${failure.origin}/*`] }).then((granted) => {
        if (granted) location.reload();
      });
    }));
  }
  if (source && !source.startsWith('file:')) {
    actions.push(actionButton('error.openRaw', () => {
      location.href = `${source}#mdt-raw`;
    }));
  }
  showError(failureMessage(failure), actions);
}

async function openScratchpad(): Promise<void> {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const draft = stored[DRAFT_KEY];
  text = typeof draft === 'string' ? draft : '';
  documentOpen = true;
  renderDocument();
  await setEditing(true);
}

/** Shows a freshly loaded document and starts watching it for changes. */
function showOpenedDocument(read: () => Promise<string>, local: boolean): void {
  savedText = text;
  documentOpen = true;
  renderDocument();
  if (location.hash) scrollToFragment(location.hash);
  if (findOnLoad) search.open(findOnLoad);

  watcher = new SourceWatcher({
    read,
    local,
    interval: () => settings.reloadInterval,
    enabled: () => settings.autoReload,
    onChange: onFileChanged,
  });
  watcher.remember(text);
  watcher.start();
}

async function openDocument(url: string): Promise<void> {
  try {
    text = await readSource(url);
  } catch (error) {
    showLoadFailure(error instanceof LoadError ? error.failure : { kind: 'status', status: 0 });
    return;
  }
  const local = url.startsWith('file:');
  showOpenedDocument(() => readSource(url), local);
  if (local) showLocalFolder(url);
}

/* -------------------------------- folders ------------------------------ */

type SidebarTab = 'files' | 'toc';
const SIDEBAR_TAB_KEY = 'mdt-sidebar-tab';
const LISTING_ROOT_KEY = 'mdt-listing-root';

function showSidebarTab(tab: SidebarTab, remember = true): void {
  byId('mdt-files').hidden = tab !== 'files';
  byId('mdt-toc-list').hidden = tab !== 'toc';
  byId('mdt-toc-collapse').hidden = tab !== 'toc';
  byId('mdt-tab-files').setAttribute('aria-selected', String(tab === 'files'));
  byId('mdt-tab-toc').setAttribute('aria-selected', String(tab === 'toc'));
  if (!remember) return;
  try {
    localStorage.setItem(SIDEBAR_TAB_KEY, tab);
  } catch {
    // The tab simply is not remembered.
  }
}

/** Shows the Files tab next to Contents, opening whichever the reader used last. */
function enableFilesTab(fallback: SidebarTab): void {
  byId('mdt-sidebar-tabs').hidden = false;
  byId('mdt-toc-heading').hidden = true;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SIDEBAR_TAB_KEY);
  } catch {
    // Use the fallback.
  }
  showSidebarTab(saved === 'files' || saved === 'toc' ? saved : fallback, false);
}

function openFolderPage(): void {
  location.href = `${viewerBase}?folder`;
}

/**
 * Lists the folder around a local file. The reader can move up a level, and
 * that choice is kept while they move between files in the same tab.
 */
function showLocalFolder(fileUrl: string): void {
  const ownFolder = new URL('./', fileUrl).href;
  let rootUrl = ownFolder;
  try {
    const saved = sessionStorage.getItem(LISTING_ROOT_KEY);
    if (saved && ownFolder.startsWith(saved)) rootUrl = saved;
  } catch {
    // Start from the file's own folder.
  }

  const build = (url: string) => {
    const listing = new ListingSource(url, viewerBase);
    const parent = listing.parentUrl;
    new FilePanel(byId('mdt-files'), {
      source: listing,
      currentPath: listing.pathOf(fileUrl),
      onOpenFolder: openFolderPage,
      onUp: parent
        ? () => {
          try {
            sessionStorage.setItem(LISTING_ROOT_KEY, parent);
          } catch {
            // Moving up still works for this page.
          }
          build(parent);
        }
        : undefined,
    });
  };

  build(rootUrl);
  enableFilesTab('toc');
}

async function openWorkspace(id: string): Promise<void> {
  const record = await getWorkspace(id).catch(() => undefined);
  if (!record) {
    showError(t('folder.gone'), [actionButton('folder.choose', openFolderPage)]);
    return;
  }

  await ensureFolderAccess(article, record);
  void touchWorkspace(record);
  const workspace = new HandleSource(record, viewerBase);
  folder = workspace;

  if (!currentPath) {
    currentPath = defaultDocument(await workspace.list('').catch(() => []));
    if (currentPath) history.replaceState(null, '', workspace.href(currentPath, { hash: location.hash }));
  }

  new FilePanel(byId('mdt-files'), { source: workspace, currentPath, onOpenFolder: openFolderPage });
  enableFilesTab('files');

  if (!currentPath) {
    document.title = `${workspace.name} - MD Toolkit`;
    byId('mdt-doc-name').textContent = workspace.name;
    article.replaceChildren(h('p', { class: 'mdt-scratch-hint' }, t('folder.pickFile')));
    return;
  }

  const path = currentPath;
  try {
    text = await workspace.read(path);
    fileHandle = await workspace.fileHandle(path);
  } catch {
    showLoadFailure({ kind: 'missing' });
    return;
  }
  showOpenedDocument(() => workspace.read(path), true);
}

async function showFolderChooser(): Promise<void> {
  document.title = `${t('folder.title')} - MD Toolkit`;
  byId('mdt-doc-name').textContent = t('folder.title');
  await renderFolderLanding(article, viewerBase);
}

function bindToolbar(): void {
  byId('mdt-btn-toc').addEventListener('click', toggleToc);
  byId('mdt-mode-read').addEventListener('click', () => void setEditing(false));
  byId('mdt-mode-edit').addEventListener('click', () => void setEditing(true));
  saveButton.addEventListener('click', () => void save());
  byId('mdt-btn-search').addEventListener('click', () => search.open());
  byId('mdt-btn-focus').addEventListener('click', () => focus.toggle());
  byId('mdt-btn-settings').addEventListener('click', () => toggleSettings());
  byId('mdt-btn-help').addEventListener('click', () => helpDialog.showModal());
  byId('mdt-help-close').addEventListener('click', () => helpDialog.close());
  byId('mdt-focus-exit').addEventListener('click', () => focus.exit());
  byId('mdt-toc-collapse').addEventListener('click', () => toc.toggleAll());
  byId('mdt-tab-files').addEventListener('click', () => showSidebarTab('files'));
  byId('mdt-tab-toc').addEventListener('click', () => showSidebarTab('toc'));
}

async function main(): Promise<void> {
  settings = await loadSettings();
  hydrateIcons();
  applySettings(null);
  bindToolbar();
  initSplitHandle();

  onSettingsChanged((next) => {
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    const previous = settings;
    settings = next;
    applySettings(previous);
  });

  systemDarkQuery().addEventListener('change', () => applySettings(settings));

  // The viewer is web accessible, so a page could try to frame it for clickjacking.
  if (window.top !== window) {
    showError(t('error.framed'));
    return;
  }

  if (showFolderPage) {
    await showFolderChooser();
  } else if (workspaceId !== null) {
    await openWorkspace(workspaceId);
  } else if (source === null) {
    await openScratchpad();
  } else if (isAllowedSource(source, location.origin)) {
    await openDocument(source);
  } else {
    showError(t('error.notAllowed'));
  }
  root.dataset.ready = 'true';
}

void main();
