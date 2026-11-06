import { WEB_ORIGINS, webContentScriptMatches } from '../shared/urls';

const WEB_SCRIPT_ID = 'mdt-web-redirect';

/** Keeps the all-sites content script in step with the optional host permission. */
async function syncWebContentScript(): Promise<void> {
  const granted = await chrome.permissions.contains({ origins: WEB_ORIGINS });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [WEB_SCRIPT_ID] });

  if (granted && existing.length === 0) {
    await chrome.scripting.registerContentScripts([
      { id: WEB_SCRIPT_ID, matches: webContentScriptMatches(), js: ['content.js'], runAt: 'document_start' },
    ]);
  } else if (!granted && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [WEB_SCRIPT_ID] });
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void syncWebContentScript();
  if (reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(() => void syncWebContentScript());
chrome.permissions.onAdded.addListener(() => void syncWebContentScript());
chrome.permissions.onRemoved.addListener(() => void syncWebContentScript());
