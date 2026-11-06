import { describe, expect, it } from 'vitest';
import { computeLook } from '../src/shared/apply-settings';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/shared/settings';
import { fontInfo, resolveTheme } from '../src/shared/themes';
import { fileNameOf, isAllowedSource, isMarkdownUrl, viewerUrl, webContentScriptMatches } from '../src/shared/urls';

describe('sanitizeSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const result = sanitizeSettings({ theme: 'nord', fontSize: 20, codeWrap: true, accent: '#ff0000' });
    expect(result).toMatchObject({ theme: 'nord', fontSize: 20, codeWrap: true, accent: '#ff0000' });
  });

  it('clamps numbers to their range', () => {
    expect(sanitizeSettings({ fontSize: 9999 }).fontSize).toBe(28);
    expect(sanitizeSettings({ fontSize: -1 }).fontSize).toBe(12);
  });

  it('rejects wrong types and unknown choices', () => {
    const result = sanitizeSettings({ theme: 'hotdog', fontSize: '20', codeWrap: 'yes', bodyFont: 'comic-sans' });
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(result.codeWrap).toBe(DEFAULT_SETTINGS.codeWrap);
    expect(result.bodyFont).toBe(DEFAULT_SETTINGS.bodyFont);
  });

  it('rejects NaN and CSS injection through the accent colour', () => {
    expect(sanitizeSettings({ fontSize: Number.NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(sanitizeSettings({ accent: 'red;background:url(x)' }).accent).toBe('');
  });

  it('drops keys it does not know', () => {
    expect(sanitizeSettings({ removedSetting: 1 })).not.toHaveProperty('removedSetting');
  });

  it('accepts a code font only for code', () => {
    expect(sanitizeSettings({ codeFont: 'fira-code' }).codeFont).toBe('fira-code');
    expect(sanitizeSettings({ bodyFont: 'fira-code' }).bodyFont).toBe('theme');
  });
});

describe('computeLook', () => {
  it('resolves the auto theme from the system', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('nord', false)).toBe('nord');
    expect(computeLook({ ...DEFAULT_SETTINGS, theme: 'auto' }, true).dark).toBe(true);
  });

  it('leaves theme-controlled values to the stylesheet', () => {
    const { variables } = computeLook(DEFAULT_SETTINGS, false);
    expect(variables).not.toHaveProperty('--font-body');
    expect(variables).not.toHaveProperty('--text-align');
    expect(variables).not.toHaveProperty('--accent');
  });

  it('overrides theme values once chosen', () => {
    const { variables } = computeLook({ ...DEFAULT_SETTINGS, bodyFont: 'inter', textAlign: 'justify', accent: '#123456' }, false);
    expect(variables['--font-body']).toBe(fontInfo('inter')!.stack);
    expect(variables['--text-align']).toBe('justify');
    expect(variables['--accent']).toBe('#123456');
  });

  it('numbers headings from the theme unless overridden', () => {
    expect(computeLook({ ...DEFAULT_SETTINGS, theme: 'academic' }, false).attributes.numbering).toBe('on');
    expect(computeLook({ ...DEFAULT_SETTINGS, theme: 'light' }, false).attributes.numbering).toBe('off');
    expect(computeLook({ ...DEFAULT_SETTINGS, theme: 'academic', headingNumbers: 'off' }, false).attributes.numbering).toBe('off');
    expect(computeLook({ ...DEFAULT_SETTINGS, theme: 'nord', headingNumbers: 'on' }, false).attributes.numbering).toBe('on');
  });
});

describe('urls', () => {
  const ORIGIN = 'chrome-extension://abc';

  it('recognises Markdown URLs', () => {
    expect(isMarkdownUrl('file:///C:/a/README.md')).toBe(true);
    expect(isMarkdownUrl('https://x.test/a.MARKDOWN?raw=1')).toBe(true);
    expect(isMarkdownUrl('https://x.test/a.txt')).toBe(false);
    expect(isMarkdownUrl('ftp://x.test/a.md')).toBe(false);
    expect(isMarkdownUrl('not a url')).toBe(false);
  });

  it('only lets the viewer open local Markdown files', () => {
    expect(isAllowedSource('file:///C:/a.md', ORIGIN)).toBe(true);
    expect(isAllowedSource('file:///C:/Users/me/.ssh/id_rsa', ORIGIN)).toBe(false);
    expect(isAllowedSource('file:///etc/passwd', ORIGIN)).toBe(false);
  });

  it('rejects dangerous schemes and other extensions', () => {
    expect(isAllowedSource('javascript:alert(1)', ORIGIN)).toBe(false);
    expect(isAllowedSource('chrome://settings', ORIGIN)).toBe(false);
    expect(isAllowedSource('chrome-extension://other/x.md', ORIGIN)).toBe(false);
    expect(isAllowedSource(`${ORIGIN}/sample.md`, ORIGIN)).toBe(true);
    expect(isAllowedSource(`${ORIGIN}def/sample.md`, ORIGIN)).toBe(false);
    expect(isAllowedSource('https://x.test/doc', ORIGIN)).toBe(true);
  });

  it('decodes file names', () => {
    expect(fileNameOf('file:///C:/a/moje%20notatki.md')).toBe('moje notatki.md');
    expect(fileNameOf('https://x.test/')).toBe('https://x.test/');
  });

  it('keeps fragments outside the encoded source', () => {
    expect(viewerUrl('v.html', 'file:///a b.md', '#x')).toBe('v.html?src=file%3A%2F%2F%2Fa%20b.md#x');
  });

  it('builds valid match patterns for the all-sites script', () => {
    const matches = webContentScriptMatches();
    expect(matches).toContain('https://*/*.md');
    expect(matches).toContain('http://*/*.md?*');
    expect(new Set(matches).size).toBe(matches.length);
  });
});
