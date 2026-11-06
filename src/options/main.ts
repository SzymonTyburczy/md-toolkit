import './options.css';
import { applyLook, computeLook, systemDarkQuery } from '../shared/apply-settings';
import { byId } from '../shared/dom';
import { setLanguage, t, translateDom } from '../shared/i18n';
import {
  DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type Language, type Settings,
} from '../shared/settings';
import { WEB_ORIGINS } from '../shared/urls';

const language = byId<HTMLSelectElement>('language');
const linksNewTab = byId<HTMLInputElement>('links-new-tab');
const autoReload = byId<HTMLInputElement>('auto-reload');
const reloadInterval = byId<HTMLSelectElement>('reload-interval');
const allSites = byId<HTMLInputElement>('all-sites');
const fileAccessFix = byId<HTMLButtonElement>('file-access-fix');

let settings: Settings = DEFAULT_SETTINGS;

function render(): void {
  setLanguage(settings.language);
  applyLook(computeLook(settings, systemDarkQuery().matches));
  translateDom();
  document.title = t('options.title');

  language.value = settings.language;
  linksNewTab.checked = settings.linksInNewTab;
  autoReload.checked = settings.autoReload;
  reloadInterval.value = String(settings.reloadInterval);
  reloadInterval.disabled = !settings.autoReload;
}

function update(change: Partial<Settings>): void {
  settings = { ...settings, ...change };
  render();
  void saveSettings(settings);
}

async function renderFileAccess(): Promise<void> {
  const allowed = await chrome.extension.isAllowedFileSchemeAccess();
  byId('file-access-status').textContent = t(allowed ? 'options.fileAccess.on' : 'options.fileAccess.off');
  fileAccessFix.hidden = allowed;
}

async function renderAllSites(): Promise<void> {
  allSites.checked = await chrome.permissions.contains({ origins: WEB_ORIGINS });
}

async function main(): Promise<void> {
  settings = await loadSettings();
  render();
  await Promise.all([renderFileAccess(), renderAllSites()]);

  if (new URLSearchParams(location.search).has('welcome')) byId('welcome').hidden = false;

  language.addEventListener('change', () => {
    update({ language: language.value as Language });
    void renderFileAccess();
  });
  linksNewTab.addEventListener('change', () => update({ linksInNewTab: linksNewTab.checked }));
  autoReload.addEventListener('change', () => update({ autoReload: autoReload.checked }));
  reloadInterval.addEventListener('change', () => update({ reloadInterval: Number(reloadInterval.value) }));

  // Permission prompts need a user gesture, so this has to stay in the event handler.
  allSites.addEventListener('change', () => {
    const change = allSites.checked
      ? chrome.permissions.request({ origins: WEB_ORIGINS })
      : chrome.permissions.remove({ origins: WEB_ORIGINS }).then(() => false);
    void change.finally(() => void renderAllSites());
  });

  fileAccessFix.addEventListener('click', () => {
    void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });

  byId('open-demo').addEventListener('click', () => {
    const sample = chrome.runtime.getURL('sample.md');
    location.href = `${chrome.runtime.getURL('viewer.html')}?src=${encodeURIComponent(sample)}`;
  });

  byId('reset').addEventListener('click', () => {
    if (confirm(t('options.resetConfirm'))) update({ ...DEFAULT_SETTINGS });
  });

  onSettingsChanged((next) => {
    settings = next;
    render();
    void renderFileAccess();
  });

  // Returning from chrome://extensions should show the new state without a reload.
  window.addEventListener('focus', () => void renderFileAccess());
}

void main();
