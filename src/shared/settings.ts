import { FONTS, THEMES, type ThemeId } from './themes';

export type Tristate<T extends string> = 'theme' | T;
export type TableStyle = 'default' | 'striped' | 'bordered' | 'minimal';
export type Language = 'auto' | 'en' | 'pl';

export interface Settings {
  theme: ThemeId;

  bodyFont: string;
  headingFont: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  letterSpacing: number;

  contentWidth: number;
  sideMargin: number;
  textAlign: Tristate<'left' | 'justify'>;
  hyphenation: boolean;
  accent: string;

  headingNumbers: Tristate<'on' | 'off'>;
  headingScale: number;
  headingRule: boolean;
  codeFont: string;
  codeFontSize: number;
  codeWrap: boolean;
  codeLineNumbers: boolean;
  tableStyle: TableStyle;

  typographer: boolean;
  breaks: boolean;

  tocOpen: boolean;
  tocDepth: number;
  readingBar: boolean;
  wordsPerMinute: number;

  language: Language;
  autoReload: boolean;
  reloadInterval: number;
  linksInNewTab: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',

  bodyFont: 'theme',
  headingFont: 'theme',
  fontSize: 16,
  lineHeight: 1.65,
  paragraphSpacing: 1,
  letterSpacing: 0,

  contentWidth: 820,
  sideMargin: 32,
  textAlign: 'theme',
  hyphenation: false,
  accent: '',

  headingNumbers: 'theme',
  headingScale: 1.22,
  headingRule: true,
  codeFont: 'theme',
  codeFontSize: 88,
  codeWrap: false,
  codeLineNumbers: false,
  tableStyle: 'default',

  typographer: false,
  breaks: false,

  tocOpen: true,
  tocDepth: 4,
  readingBar: true,
  wordsPerMinute: 200,

  language: 'auto',
  autoReload: true,
  reloadInterval: 1500,
  linksInNewTab: false,
};

interface NumberRule { min: number; max: number }

export const NUMBER_RULES: Partial<Record<keyof Settings, NumberRule>> = {
  fontSize: { min: 12, max: 28 },
  lineHeight: { min: 1.1, max: 2.4 },
  paragraphSpacing: { min: 0.25, max: 2.5 },
  letterSpacing: { min: -0.03, max: 0.12 },
  contentWidth: { min: 480, max: 1600 },
  sideMargin: { min: 8, max: 160 },
  headingScale: { min: 1, max: 1.5 },
  codeFontSize: { min: 70, max: 120 },
  tocDepth: { min: 1, max: 6 },
  wordsPerMinute: { min: 100, max: 500 },
  reloadInterval: { min: 500, max: 10000 },
};

const CHOICES: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: THEMES.map((theme) => theme.id),
  bodyFont: ['theme', ...FONTS.filter((f) => f.kind === 'text').map((f) => f.id)],
  headingFont: ['theme', ...FONTS.filter((f) => f.kind === 'text').map((f) => f.id)],
  codeFont: ['theme', ...FONTS.filter((f) => f.kind === 'code').map((f) => f.id)],
  textAlign: ['theme', 'left', 'justify'],
  headingNumbers: ['theme', 'on', 'off'],
  tableStyle: ['default', 'striped', 'bordered', 'minimal'],
  language: ['auto', 'en', 'pl'],
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Storage is synced between machines and can hold values from older or newer
 * versions, so everything read back goes through this and falls back to defaults.
 */
export function sanitizeSettings(input: unknown): Settings {
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const result: Settings = { ...DEFAULT_SETTINGS };
  const target = result as unknown as Record<string, unknown>;

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = source[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof value !== typeof fallback) continue;

    if (typeof value === 'number') {
      const rule = NUMBER_RULES[key];
      if (!Number.isFinite(value)) continue;
      target[key] = rule ? Math.min(rule.max, Math.max(rule.min, value)) : value;
    } else if (key === 'accent') {
      target[key] = HEX_COLOR.test(value as string) ? value : '';
    } else if (typeof value === 'string') {
      const allowed = CHOICES[key];
      if (!allowed || allowed.includes(value)) target[key] = value;
    } else {
      target[key] = value;
    }
  }
  return result;
}

const STORAGE_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return sanitizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

export function onSettingsChanged(listener: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[STORAGE_KEY];
    if (area === 'sync' && change) listener(sanitizeSettings(change.newValue));
  });
}
