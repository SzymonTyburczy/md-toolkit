import { h, icon } from '../../shared/dom';
import { t } from '../../shared/i18n';
import type { WorkspaceRecord } from './sources';
import { listWorkspaces, rememberFolder, removeWorkspace } from './store';

function workspaceUrl(viewerBase: string, id: string): string {
  return `${viewerBase}?ws=${encodeURIComponent(id)}`;
}

/** The "Open folder" page: choose a folder, or go back to a recent one. */
export async function renderFolderLanding(article: HTMLElement, viewerBase: string): Promise<void> {
  const choose = h('button', { class: 'mdt-button mdt-primary', type: 'button' }, icon('folder-open'), h('span', {}, t('folder.choose')));
  choose.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'md-toolkit', mode: 'read' });
      const record = await rememberFolder(handle);
      location.href = workspaceUrl(viewerBase, record.id);
    } catch (error) {
      // Closing the picker is a normal way to change your mind.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
  });

  const recent = await listWorkspaces();
  const list = h('ul', { class: 'mdt-recent' });
  const renderRecent = (records: WorkspaceRecord[]) => {
    list.replaceChildren(...records.map((record) => h('li', {},
      h('a', { href: workspaceUrl(viewerBase, record.id) }, icon('folder'), h('span', {}, record.name)),
      h('button', {
        class: 'mdt-icon-btn',
        type: 'button',
        title: t('folder.forget'),
        'aria-label': t('folder.forget'),
        onClick: async () => {
          await removeWorkspace(record.id);
          renderRecent(await listWorkspaces());
        },
      }, icon('x')),
    )));
    list.previousElementSibling?.toggleAttribute('hidden', records.length === 0);
  };

  article.replaceChildren(h('div', { class: 'mdt-landing' },
    h('h1', {}, t('folder.title')),
    h('p', {}, t('folder.text')),
    choose,
    h('h2', {}, t('folder.recent')),
    list,
  ));
  renderRecent(recent);
}

/**
 * Chrome forgets folder access when it restarts, unless the user chose to
 * allow it on every visit. Asking again needs a click, so this waits for one.
 */
export async function ensureFolderAccess(article: HTMLElement, record: WorkspaceRecord): Promise<void> {
  if ((await record.handle.queryPermission({ mode: 'read' })) === 'granted') return;

  await new Promise<void>((resolve) => {
    const allow = h('button', { class: 'mdt-button mdt-primary', type: 'button' }, icon('folder-open'),
      h('span', {}, t('folder.allow', { name: record.name })));
    allow.addEventListener('click', async () => {
      if ((await record.handle.requestPermission({ mode: 'read' })) === 'granted') resolve();
    });
    article.replaceChildren(h('div', { class: 'mdt-landing' },
      h('h1', {}, record.name),
      h('p', {}, t('folder.allowText')),
      allow,
    ));
  });
}
