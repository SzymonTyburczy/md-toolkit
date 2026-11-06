import type { Settings } from './settings';
import { fontInfo, resolveTheme, themeInfo, type ConcreteThemeId } from './themes';

export interface DocumentLook {
  theme: ConcreteThemeId;
  dark: boolean;
  /** Custom properties for the root element. */
  variables: Record<string, string>;
  /** data-* attributes for the root element, without the data- prefix. */
  attributes: Record<string, string>;
}

/** Turns settings into the CSS state shared by the viewer and exported HTML. */
export function computeLook(settings: Settings, systemDark: boolean): DocumentLook {
  const theme = resolveTheme(settings.theme, systemDark);
  const info = themeInfo(theme);

  const variables: Record<string, string> = {
    '--font-size': `${settings.fontSize}px`,
    '--line-height': String(settings.lineHeight),
    '--paragraph-spacing': `${settings.paragraphSpacing}em`,
    '--letter-spacing': `${settings.letterSpacing}em`,
    '--content-width': `${settings.contentWidth}px`,
    '--side-margin': `${settings.sideMargin}px`,
    '--heading-scale': String(settings.headingScale),
    '--code-size': `${settings.codeFontSize}%`,
    '--hyphens': settings.hyphenation ? 'auto' : 'manual',
  };

  const fonts: [string, string][] = [
    ['--font-body', settings.bodyFont],
    ['--font-heading', settings.headingFont],
    ['--font-code', settings.codeFont],
  ];
  for (const [variable, id] of fonts) {
    const font = fontInfo(id);
    if (font) variables[variable] = font.stack;
  }

  if (settings.textAlign !== 'theme') variables['--text-align'] = settings.textAlign;
  if (settings.accent) variables['--accent'] = settings.accent;

  const numbered = settings.headingNumbers === 'theme' ? info.numbered : settings.headingNumbers === 'on';

  return {
    theme,
    dark: info.dark,
    variables,
    attributes: {
      theme,
      numbering: numbered ? 'on' : 'off',
      'table-style': settings.tableStyle,
      'code-wrap': settings.codeWrap ? 'on' : 'off',
      'code-lines': settings.codeLineNumbers ? 'on' : 'off',
      'heading-rule': settings.headingRule ? 'on' : 'off',
    },
  };
}

const THEME_CACHE_KEY = 'mdt-theme';
const appliedVariables = new Set<string>();

export function applyLook(look: DocumentLook, root: HTMLElement = document.documentElement): void {
  for (const name of appliedVariables) {
    if (!(name in look.variables)) root.style.removeProperty(name);
  }
  appliedVariables.clear();
  for (const [name, value] of Object.entries(look.variables)) {
    root.style.setProperty(name, value);
    appliedVariables.add(name);
  }
  for (const [name, value] of Object.entries(look.attributes)) {
    root.setAttribute(`data-${name}`, value);
  }
  root.style.colorScheme = look.dark ? 'dark' : 'light';
  try {
    // boot.js reads this before first paint, so dark themes do not flash white.
    localStorage.setItem(THEME_CACHE_KEY, look.theme);
  } catch {
    // Storage can be unavailable; the only cost is a brief flash on the next load.
  }
}

export const systemDarkQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');
