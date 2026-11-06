import { en, type MessageKey } from './locales/en';
import { pl } from './locales/pl';
import type { Language } from './settings';

export type { MessageKey };

type Locale = 'en' | 'pl';
type Params = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, pl };

let locale: Locale = 'en';

function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export function setLanguage(language: Language): void {
  locale = language === 'auto' ? browserLocale() : language;
  document.documentElement.lang = locale;
}

export function currentLocale(): Locale {
  return locale;
}

export function t(key: MessageKey, params?: Params): string {
  const template = DICTIONARIES[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

/** Picks the right plural form. Polish has more of them than English. */
export function wordCountLabel(count: number): string {
  const form = new Intl.PluralRules(locale).select(count);
  const key = `status.words.${form}` as MessageKey;
  const rule = key in DICTIONARIES[locale] ? key : 'status.words.other';
  return t(rule, { count: count.toLocaleString(locale) });
}

/** Fills in every element carrying a data-i18n* attribute. */
export function translateDom(root: ParentNode = document): void {
  const bindings: [string, (element: HTMLElement, text: string) => void][] = [
    ['i18n', (element, text) => { element.textContent = text; }],
    ['i18nTitle', (element, text) => { element.title = text; element.setAttribute('aria-label', text); }],
    ['i18nPlaceholder', (element, text) => { element.setAttribute('placeholder', text); }],
  ];

  for (const [dataKey, apply] of bindings) {
    const attribute = dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    for (const element of root.querySelectorAll<HTMLElement>(`[data-${attribute}]`)) {
      apply(element, t(element.dataset[dataKey] as MessageKey));
    }
  }
}
