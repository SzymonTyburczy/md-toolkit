import './popup.css';
import { applyLook, computeLook, systemDarkQuery } from '../shared/apply-settings';
import { byId, h, hydrateIcons } from '../shared/dom';
import { setLanguage, t, translateDom } from '../shared/i18n';
import { loadSettings, saveSettings } from '../shared/settings';
import { THEMES, type ThemeId } from '../shared/themes';
import { viewerUrl } from '../shared/urls';

const viewerBase = chrome.runtime.getURL('viewer.html');

function openTab(url: string): void {
  void chrome.tabs.create({ url });
  window.close();
}

/** Offers to open the current tab when it is a web page the content script did not pick up. */
async function setUpCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^(https?|file):/.test(tab.url)) return;

  const { id, url } = tab;
  const button = byId('open-tab');
  button.hidden = false;
  button.addEventListener('click', () => {
    const go = () => {
      void chrome.tabs.update(id, { url: viewerUrl(viewerBase, url.split('#')[0]!) });
      window.close();
    };
    if (url.startsWith('file:')) {
      go();
      return;
    }
    // The prompt needs a user gesture, and the viewer needs this origin to fetch the page.
    void chrome.permissions.request({ origins: [`${new URL(url).origin}/*`] }).then((granted) => {
      if (granted) go();
    });
  });
}

async function main(): Promise<void> {
  let settings = await loadSettings();
  setLanguage(settings.language);
  applyLook(computeLook(settings, systemDarkQuery().matches));
  hydrateIcons();
  translateDom();

  byId('new-document').addEventListener('click', () => openTab(viewerBase));
  byId('sample').addEventListener('click', () => openTab(viewerUrl(viewerBase, chrome.runtime.getURL('sample.md'))));
  byId('options').addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
    window.close();
  });

  const theme = byId<HTMLSelectElement>('theme');
  theme.append(...THEMES.map((item) =>
    h('option', { value: item.id }, item.labelKey ? t(item.labelKey) : item.label),
  ));
  theme.value = settings.theme;
  theme.addEventListener('change', () => {
    settings = { ...settings, theme: theme.value as ThemeId };
    applyLook(computeLook(settings, systemDarkQuery().matches));
    void saveSettings(settings);
  });

  byId('file-access').hidden = await chrome.extension.isAllowedFileSchemeAccess();
  byId('file-access-fix').addEventListener('click', () => openTab(`chrome://extensions/?id=${chrome.runtime.id}`));

  await setUpCurrentTab();
}

void main();
