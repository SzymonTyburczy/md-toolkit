import { beforeEach, describe, expect, it } from 'vitest';
import { blocksOf, patchChildren } from '../src/viewer/patch';
import { buildTextIndex, countWords, findMatches, rangeFor } from '../src/viewer/text-index';
import { buildTree } from '../src/viewer/toc';
import { en } from '../src/shared/locales/en';
import { pl } from '../src/shared/locales/pl';
import { setLanguage, t, wordCountLabel } from '../src/shared/i18n';

function blocks(html: string): Element[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return blocksOf(template.content);
}

describe('patchChildren', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    patchChildren(container, blocks('<p data-line="0">a</p><p data-line="2">b</p><p data-line="4">c</p>'));
  });

  it('builds the initial document', () => {
    expect(container.textContent).toBe('abc');
  });

  it('keeps unchanged blocks as the same DOM nodes', () => {
    const [first, , third] = [...container.children];
    const inserted = patchChildren(container, blocks('<p data-line="0">a</p><p data-line="2">CHANGED</p><p data-line="4">c</p>'));
    expect(container.children[0]).toBe(first);
    expect(container.children[2]).toBe(third);
    expect(inserted).toHaveLength(1);
    expect(container.textContent).toBe('aCHANGEDc');
  });

  it('does nothing when the document is identical', () => {
    const before = [...container.children];
    expect(patchChildren(container, blocks('<p data-line="0">a</p><p data-line="2">b</p><p data-line="4">c</p>'))).toEqual([]);
    expect([...container.children]).toEqual(before);
  });

  it('updates line numbers without rebuilding a shifted block', () => {
    const last = container.children[2]!;
    patchChildren(container, blocks('<p data-line="0">a</p><p data-line="2">b</p><p data-line="4">new</p><p data-line="6">c</p>'));
    expect(container.children[3]).toBe(last);
    expect(last.getAttribute('data-line')).toBe('6');
  });

  it('survives enhancements made to the live DOM', () => {
    const first = container.children[0]!;
    first.append(document.createElement('button'));
    patchChildren(container, blocks('<p data-line="0">a</p><p data-line="2">b</p><p data-line="4">c</p>'));
    expect(container.children[0]).toBe(first);
    expect(first.querySelector('button')).not.toBeNull();
  });

  it('handles deletion, insertion at the start and full replacement', () => {
    patchChildren(container, blocks('<p>a</p><p>c</p>'));
    expect(container.textContent).toBe('ac');
    patchChildren(container, blocks('<p>z</p><p>a</p><p>c</p>'));
    expect(container.textContent).toBe('zac');
    patchChildren(container, blocks('<h1>new</h1>'));
    expect(container.innerHTML).toBe('<h1>new</h1>');
    patchChildren(container, []);
    expect(container.children).toHaveLength(0);
  });

  it('handles repeated identical blocks', () => {
    patchChildren(container, blocks('<p>x</p><p>x</p><p>x</p>'));
    patchChildren(container, blocks('<p>x</p><p>x</p>'));
    expect(container.children).toHaveLength(2);
  });
});

describe('blocksOf', () => {
  it('keeps loose text instead of dropping it', () => {
    const result = blocks('<div>a</div> loose text\n<div>b</div>');
    expect(result.map((element) => element.textContent)).toEqual(['a', ' loose text\n', 'b']);
  });
});

describe('text index', () => {
  function root(html: string): HTMLElement {
    const element = document.createElement('div');
    element.innerHTML = html;
    return element;
  }

  it('finds matches that cross inline formatting', () => {
    const index = buildTextIndex(root('<p>hello <strong>wor</strong>ld</p>'));
    const [match] = findMatches(index.text, 'hello world', false);
    const range = rangeFor(index, ...match!)!;
    expect(range.toString()).toBe('hello world');
  });

  it('skips interface text and hidden math', () => {
    const index = buildTextIndex(root('<p>a<button class="mdt-copy">Copy</button></p><span class="katex-mathml">x</span>'));
    expect(index.text).toBe('a');
  });

  it('ignores case on request, including Polish letters', () => {
    expect(findMatches('ŻÓŁĆ żółć', 'żółć', false)).toHaveLength(2);
    expect(findMatches('ŻÓŁĆ żółć', 'żółć', true)).toHaveLength(1);
  });

  it('treats the query as literal text', () => {
    expect(findMatches('a.b axb (c)', 'a.b', false)).toHaveLength(1);
    expect(findMatches('a.b (c)', '(c)', false)).toHaveLength(1);
    expect(findMatches('anything', '', false)).toEqual([]);
  });

  it('selects a range ending exactly at a node boundary', () => {
    const index = buildTextIndex(root('<b>ab</b><i>cd</i>'));
    expect(rangeFor(index, 0, 2)!.toString()).toBe('ab');
    expect(rangeFor(index, 2, 4)!.toString()).toBe('cd');
  });

  it('counts words in both languages', () => {
    expect(countWords('Zażółć gęślą jaźń')).toBe(3);
    expect(countWords("it's well-known, 42 times")).toBe(4);
    expect(countWords('   ...  ')).toBe(0);
  });
});

describe('buildTree', () => {
  const heading = (level: number, id: string) => ({ level, id, text: id });

  it('nests by level and tolerates skipped levels', () => {
    const tree = buildTree([heading(1, 'a'), heading(2, 'b'), heading(4, 'c'), heading(2, 'd'), heading(1, 'e')], null);
    expect(tree.map((node) => node.heading.id)).toEqual(['a', 'e']);
    expect(tree[0]!.children.map((node) => node.heading.id)).toEqual(['b', 'd']);
    expect(tree[0]!.children[0]!.children[0]!.heading.id).toBe('c');
  });

  it('copes with a document that starts at a deep level', () => {
    expect(buildTree([heading(3, 'a'), heading(2, 'b')], null).map((node) => node.heading.id)).toEqual(['a', 'b']);
  });

  it('matches the numbering of the stylesheet', () => {
    const tree = buildTree([heading(1, 't'), heading(2, 'a'), heading(3, 'b'), heading(3, 'c'), heading(2, 'd'), heading(3, 'e')], 2);
    const [title] = tree;
    expect(title!.number).toBe('');
    const [a, d] = title!.children;
    expect(a!.number).toBe('1');
    expect(a!.children.map((node) => node.number)).toEqual(['1.1', '1.2']);
    expect(d!.number).toBe('2');
    expect(d!.children[0]!.number).toBe('2.1');
  });
});

describe('i18n', () => {
  it('has the same keys in every language, with no empty strings', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(pl).filter((value) => !value.trim())).toEqual([]);
  });

  it('keeps placeholders identical across languages', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(pl[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('uses Polish plural forms', () => {
    setLanguage('pl');
    expect(wordCountLabel(1)).toBe('1 słowo');
    expect(wordCountLabel(3)).toBe('3 słowa');
    expect(wordCountLabel(5)).toBe('5 słów');
    expect(wordCountLabel(22)).toBe('22 słowa');
    expect(wordCountLabel(25)).toBe('25 słów');
  });

  it('uses English plural forms and fills parameters', () => {
    setLanguage('en');
    expect(wordCountLabel(1)).toBe('1 word');
    expect(wordCountLabel(2)).toBe('2 words');
    expect(t('status.minutes', { minutes: 4 })).toBe('4 min read');
  });
});
