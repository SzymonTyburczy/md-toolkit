import { h, icon } from '../shared/dom';
import { t, translateDom, type MessageKey } from '../shared/i18n';
import { NUMBER_RULES, type Settings } from '../shared/settings';
import { FONTS, THEMES, type FontKind } from '../shared/themes';

type NumericKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BooleanKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type StringKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];

interface Option {
  value: string;
  label?: string;
  labelKey?: MessageKey;
}

type Control =
  | { type: 'range'; key: NumericKey; label: MessageKey; step: number; format: (value: number) => string }
  | { type: 'toggle'; key: BooleanKey; label: MessageKey }
  | { type: 'select'; key: StringKey; label: MessageKey; options: Option[] }
  | { type: 'color'; key: StringKey; label: MessageKey };

interface Section {
  title: MessageKey;
  open?: boolean;
  controls: Control[];
}

function fontOptions(kind: FontKind): Option[] {
  return [
    { value: 'theme', labelKey: 'settings.fromTheme' },
    ...FONTS.filter((font) => font.kind === kind).map((font) => ({ value: font.id, label: font.label })),
  ];
}

const px = (value: number) => `${value} px`;
const percent = (value: number) => `${value}%`;
const plain = (value: number) => String(value);
const fixed = (digits: number) => (value: number) => value.toFixed(digits);

const SECTIONS: Section[] = [
  {
    title: 'settings.section.typography',
    open: true,
    controls: [
      { type: 'select', key: 'bodyFont', label: 'settings.bodyFont', options: fontOptions('text') },
      { type: 'select', key: 'headingFont', label: 'settings.headingFont', options: fontOptions('text') },
      { type: 'range', key: 'fontSize', label: 'settings.fontSize', step: 1, format: px },
      { type: 'range', key: 'lineHeight', label: 'settings.lineHeight', step: 0.05, format: fixed(2) },
      { type: 'range', key: 'paragraphSpacing', label: 'settings.paragraphSpacing', step: 0.05, format: fixed(2) },
      { type: 'range', key: 'letterSpacing', label: 'settings.letterSpacing', step: 0.005, format: fixed(3) },
    ],
  },
  {
    title: 'settings.section.layout',
    open: true,
    controls: [
      { type: 'range', key: 'contentWidth', label: 'settings.contentWidth', step: 20, format: px },
      { type: 'range', key: 'sideMargin', label: 'settings.sideMargin', step: 4, format: px },
      {
        type: 'select', key: 'textAlign', label: 'settings.textAlign', options: [
          { value: 'theme', labelKey: 'settings.fromTheme' },
          { value: 'left', labelKey: 'settings.textAlign.left' },
          { value: 'justify', labelKey: 'settings.textAlign.justify' },
        ],
      },
      { type: 'toggle', key: 'hyphenation', label: 'settings.hyphenation' },
      { type: 'color', key: 'accent', label: 'settings.accent' },
    ],
  },
  {
    title: 'settings.section.headings',
    controls: [
      {
        type: 'select', key: 'headingNumbers', label: 'settings.headingNumbers', options: [
          { value: 'theme', labelKey: 'settings.fromTheme' },
          { value: 'on', labelKey: 'settings.headingNumbers.on' },
          { value: 'off', labelKey: 'settings.headingNumbers.off' },
        ],
      },
      { type: 'range', key: 'headingScale', label: 'settings.headingScale', step: 0.01, format: fixed(2) },
      { type: 'toggle', key: 'headingRule', label: 'settings.headingRule' },
    ],
  },
  {
    title: 'settings.section.code',
    controls: [
      { type: 'select', key: 'codeFont', label: 'settings.codeFont', options: fontOptions('code') },
      { type: 'range', key: 'codeFontSize', label: 'settings.codeFontSize', step: 1, format: percent },
      { type: 'toggle', key: 'codeWrap', label: 'settings.codeWrap' },
      { type: 'toggle', key: 'codeLineNumbers', label: 'settings.codeLineNumbers' },
    ],
  },
  {
    title: 'settings.section.tables',
    controls: [
      {
        type: 'select', key: 'tableStyle', label: 'settings.tableStyle', options: [
          { value: 'default', labelKey: 'settings.tableStyle.default' },
          { value: 'striped', labelKey: 'settings.tableStyle.striped' },
          { value: 'bordered', labelKey: 'settings.tableStyle.bordered' },
          { value: 'minimal', labelKey: 'settings.tableStyle.minimal' },
        ],
      },
    ],
  },
  {
    title: 'settings.section.rendering',
    controls: [
      { type: 'toggle', key: 'typographer', label: 'settings.typographer' },
      { type: 'toggle', key: 'breaks', label: 'settings.breaks' },
    ],
  },
  {
    title: 'settings.section.tools',
    controls: [
      { type: 'range', key: 'tocDepth', label: 'settings.tocDepth', step: 1, format: plain },
      { type: 'toggle', key: 'readingBar', label: 'settings.readingBar' },
      { type: 'range', key: 'wordsPerMinute', label: 'settings.wordsPerMinute', step: 10, format: plain },
    ],
  },
];

export interface SettingsPanelCallbacks {
  get(): Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  reset(): void;
}

/** Builds the appearance panel from the declarative list above. */
export class SettingsPanel {
  /** Pushes current values back into the controls, e.g. after a reset. */
  private readonly syncers: (() => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: SettingsPanelCallbacks,
    onClose: () => void,
  ) {
    root.append(
      h('header', { class: 'mdt-panel-header' },
        h('h2', { 'data-i18n': 'settings.title' }),
        h('button', { class: 'mdt-icon-btn', type: 'button', 'data-i18n-title': 'settings.close', onClick: onClose }, icon('x')),
      ),
      h('div', { class: 'mdt-panel-body' },
        this.themeSection(),
        ...SECTIONS.map((section) => this.section(section)),
        h('button', {
          class: 'mdt-button mdt-reset',
          type: 'button',
          onClick: () => {
            if (confirm(t('settings.resetConfirm'))) callbacks.reset();
          },
        }, icon('rotate-ccw'), h('span', { 'data-i18n': 'settings.reset' })),
      ),
    );
    this.sync();
  }

  sync(): void {
    for (const syncer of this.syncers) syncer();
  }

  /** Option labels are plain text, so they are refreshed here on a language change. */
  relabel(): void {
    translateDom(this.root);
  }

  private themeSection(): HTMLElement {
    const grid = h('div', { class: 'mdt-theme-grid', role: 'radiogroup' });
    const cards = THEMES.map((theme) => {
      const [background, text, accent] = theme.swatch;
      const label = h('span', { 'data-i18n': theme.labelKey }, theme.label);
      const card = h('button', {
        class: 'mdt-theme-card',
        type: 'button',
        role: 'radio',
        'data-theme-id': theme.id,
        onClick: () => this.callbacks.set('theme', theme.id),
      },
        h('span', { class: 'mdt-theme-preview' },
          h('i', {}), h('i', {}), h('i', {}),
        ),
        label,
      );
      const preview = card.firstElementChild as HTMLElement;
      preview.style.background = theme.id === 'auto'
        ? `linear-gradient(135deg, ${background} 50%, ${text} 50%)`
        : background;
      const [line1, line2, line3] = [...preview.children] as HTMLElement[];
      line1!.style.background = accent;
      line2!.style.background = text;
      line3!.style.background = text;
      return card;
    });

    grid.append(...cards);
    this.syncers.push(() => {
      for (const card of cards) {
        card.setAttribute('aria-checked', String(card.dataset.themeId === this.callbacks.get().theme));
      }
    });

    return h('details', { class: 'mdt-section', open: true },
      h('summary', { 'data-i18n': 'settings.section.theme' }),
      grid,
    );
  }

  private section(section: Section): HTMLElement {
    return h('details', { class: 'mdt-section', open: section.open },
      h('summary', { 'data-i18n': section.title }),
      ...section.controls.map((control) => this.control(control)),
    );
  }

  private control(control: Control): HTMLElement {
    switch (control.type) {
      case 'range': return this.range(control);
      case 'toggle': return this.toggle(control);
      case 'select': return this.select(control);
      case 'color': return this.color(control);
    }
  }

  private range(control: Extract<Control, { type: 'range' }>): HTMLElement {
    const rule = NUMBER_RULES[control.key]!;
    const output = h('output');
    const input = h('input', {
      type: 'range',
      min: rule.min,
      max: rule.max,
      step: control.step,
      'data-key': control.key,
      onInput: () => {
        const value = Number(input.value);
        output.textContent = control.format(value);
        this.callbacks.set(control.key, value);
      },
    });
    this.syncers.push(() => {
      const value = this.callbacks.get()[control.key];
      input.value = String(value);
      output.textContent = control.format(value);
    });
    return h('label', { class: 'mdt-field mdt-field-range' },
      h('span', { class: 'mdt-field-label' }, h('span', { 'data-i18n': control.label }), output),
      input,
    );
  }

  private toggle(control: Extract<Control, { type: 'toggle' }>): HTMLElement {
    const input = h('input', {
      type: 'checkbox',
      role: 'switch',
      'data-key': control.key,
      onChange: () => this.callbacks.set(control.key, input.checked),
    });
    this.syncers.push(() => { input.checked = this.callbacks.get()[control.key]; });
    return h('label', { class: 'mdt-field mdt-field-toggle' }, h('span', { 'data-i18n': control.label }), input);
  }

  private select(control: Extract<Control, { type: 'select' }>): HTMLElement {
    const input = h('select', {
      'data-key': control.key,
      onChange: () => this.callbacks.set(control.key, input.value as never),
    }, ...control.options.map((option) =>
      h('option', { value: option.value, 'data-i18n': option.labelKey }, option.label ?? ''),
    ));
    this.syncers.push(() => { input.value = this.callbacks.get()[control.key]; });
    return h('label', { class: 'mdt-field' }, h('span', { 'data-i18n': control.label }), input);
  }

  private color(control: Extract<Control, { type: 'color' }>): HTMLElement {
    const input = h('input', {
      type: 'color',
      'data-key': control.key,
      onInput: () => this.callbacks.set(control.key, input.value as never),
    });
    const reset = h('button', {
      class: 'mdt-icon-btn',
      type: 'button',
      'data-i18n-title': 'settings.accent.reset',
      onClick: () => this.callbacks.set(control.key, '' as never),
    }, icon('rotate-ccw'));

    this.syncers.push(() => {
      const value = this.callbacks.get()[control.key];
      const themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      input.value = value || themeAccent;
      reset.hidden = !value;
    });
    return h('div', { class: 'mdt-field mdt-field-toggle' },
      h('span', { 'data-i18n': control.label }),
      h('span', { class: 'mdt-color' }, reset, input),
    );
  }
}
