import type { MessageKey } from './locales/en';

export type ThemeId =
  | 'auto' | 'light' | 'dark'
  | 'nord' | 'dracula' | 'tokyo-night' | 'gruvbox' | 'one-dark'
  | 'academic';

export type ConcreteThemeId = Exclude<ThemeId, 'auto'>;

export interface ThemeInfo {
  id: ThemeId;
  /** Proper names such as Nord stay as they are, the rest are translated. */
  label: string;
  labelKey?: MessageKey;
  /** Picks the Mermaid palette and the browser colour scheme. */
  dark: boolean;
  /** Theme default used when heading numbers are set to "as in theme". */
  numbered: boolean;
  /** Background, text and accent, used only by the theme picker cards. */
  swatch: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { id: 'auto', label: 'Auto', labelKey: 'settings.theme.auto', dark: false, numbered: false, swatch: ['#ffffff', '#0d1117', '#2563eb'] },
  { id: 'light', label: 'Light', labelKey: 'settings.theme.light', dark: false, numbered: false, swatch: ['#ffffff', '#1f2328', '#0969da'] },
  { id: 'dark', label: 'Dark', labelKey: 'settings.theme.dark', dark: true, numbered: false, swatch: ['#0d1117', '#e6edf3', '#4493f8'] },
  { id: 'nord', label: 'Nord', dark: true, numbered: false, swatch: ['#2e3440', '#d8dee9', '#88c0d0'] },
  { id: 'dracula', label: 'Dracula', dark: true, numbered: false, swatch: ['#282a36', '#f8f8f2', '#bd93f9'] },
  { id: 'tokyo-night', label: 'Tokyo Night', dark: true, numbered: false, swatch: ['#1a1b26', '#c0caf5', '#7aa2f7'] },
  { id: 'gruvbox', label: 'Gruvbox', dark: true, numbered: false, swatch: ['#282828', '#ebdbb2', '#fabd2f'] },
  { id: 'one-dark', label: 'One Dark', dark: true, numbered: false, swatch: ['#282c34', '#abb2bf', '#61afef'] },
  { id: 'academic', label: 'Academic', labelKey: 'settings.theme.academic', dark: false, numbered: true, swatch: ['#fdfdfb', '#16161a', '#7a1f1f'] },
];

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

/** Resolves "auto" against the system preference. */
export function resolveTheme(id: ThemeId, systemDark: boolean): ConcreteThemeId {
  if (id !== 'auto') return id;
  return systemDark ? 'dark' : 'light';
}

export type FontKind = 'text' | 'code';

export interface FontInfo {
  id: string;
  label: string;
  kind: FontKind;
  stack: string;
  /** Stylesheet family name, present only for fonts shipped with the extension. */
  bundled?: string;
}

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, Cambria, "Times New Roman", Times, serif';
const MONO = 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, Menlo, monospace';

export const FONTS: FontInfo[] = [
  { id: 'system-sans', label: 'System UI', kind: 'text', stack: SANS },
  { id: 'inter', label: 'Inter', kind: 'text', stack: `"Inter Variable", ${SANS}`, bundled: 'Inter Variable' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', kind: 'text', stack: `"Atkinson Hyperlegible", ${SANS}`, bundled: 'Atkinson Hyperlegible' },
  { id: 'source-serif', label: 'Source Serif 4', kind: 'text', stack: `"Source Serif 4 Variable", ${SERIF}`, bundled: 'Source Serif 4 Variable' },
  { id: 'literata', label: 'Literata', kind: 'text', stack: `"Literata Variable", ${SERIF}`, bundled: 'Literata Variable' },
  { id: 'system-serif', label: 'Georgia', kind: 'text', stack: SERIF },
  { id: 'system-mono', label: 'System Mono', kind: 'code', stack: MONO },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', kind: 'code', stack: `"JetBrains Mono Variable", ${MONO}`, bundled: 'JetBrains Mono Variable' },
  { id: 'fira-code', label: 'Fira Code', kind: 'code', stack: `"Fira Code Variable", ${MONO}`, bundled: 'Fira Code Variable' },
];

export function fontInfo(id: string): FontInfo | undefined {
  return FONTS.find((font) => font.id === id);
}
