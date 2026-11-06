/**
 * Single source of truth for the extension manifest. The version comes from
 * package.json, so a release only ever has to bump one file.
 */

/** File extensions treated as Markdown, in both lower and upper case. */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'MD', 'MARKDOWN'];

/** Hosts rendered out of the box. Everything else is opt-in from the options page. */
const DEFAULT_WEB_HOSTS = [
  'https://raw.githubusercontent.com',
  'https://gist.githubusercontent.com',
  'https://gitlab.com',
];

function matchesFor(origin: string): string[] {
  return MARKDOWN_EXTENSIONS.flatMap((ext) => [`${origin}/*.${ext}`, `${origin}/*.${ext}?*`]);
}

export function buildManifest(version: string): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    short_name: 'MD Toolkit',
    description: '__MSG_extDescription__',
    version,
    default_locale: 'en',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: {
      default_title: 'MD Toolkit',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' },
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['storage', 'scripting'],
    host_permissions: ['file:///*', ...DEFAULT_WEB_HOSTS.map((host) => `${host}/*`)],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    content_scripts: [
      {
        matches: [...matchesFor('file://'), ...DEFAULT_WEB_HOSTS.flatMap(matchesFor)],
        js: ['content.js'],
        run_at: 'document_start',
      },
    ],
    // The viewer has to be reachable from file:// and web pages so the content
    // script can hand a document over with location.replace(), which keeps the
    // back button working. It refuses to run inside frames.
    web_accessible_resources: [{ resources: ['viewer.html'], matches: ['<all_urls>'] }],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'none'",
    },
  };
}
