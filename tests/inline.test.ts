import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/markdown/render';
import {
  appendRange, blockRange, lineEnding, replaceLines, sliceLines, toggleTask,
} from '../src/viewer/inline/source-range';
import { blocksOf, patchChildren } from '../src/viewer/patch';

const render = createRenderer({
  typographer: false,
  breaks: false,
  frontMatterLabel: 'Front matter',
  alertLabels: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
});

function renderedBlocks(source: string): Element[] {
  const template = document.createElement('template');
  template.innerHTML = render(source).html;
  return blocksOf(template.content);
}

const DOCUMENT = [
  '---',
  'title: Demo',
  '---',
  '',
  '# Heading',
  '',
  'A paragraph',
  'over two lines.',
  '',
  '- one',
  '- [ ] two',
  '  - [x] nested',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '$$',
  'x^2',
  '$$',
  '',
  '> [!NOTE]',
  '> Careful.',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '```mermaid',
  'graph TD; A-->B',
  '```',
  '',
].join('\n');

describe('block source ranges', () => {
  const blocks = renderedBlocks(DOCUMENT);
  const ranges = blocks.map((block) => blockRange(block)!);

  it('gives every top-level block a range', () => {
    expect(ranges.every(Boolean)).toBe(true);
    expect(blocks).toHaveLength(9);
  });

  it('slices exactly the source each block came from', () => {
    const slices = ranges.map((range) => sliceLines(DOCUMENT, range));
    expect(slices).toEqual([
      '---\ntitle: Demo\n---',
      '# Heading',
      'A paragraph\nover two lines.',
      '- one\n- [ ] two\n  - [x] nested',
      '```js\nconst a = 1;\n```',
      '$$\nx^2\n$$',
      '> [!NOTE]\n> Careful.',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '```mermaid\ngraph TD; A-->B\n```',
    ]);
  });

  it('never overlaps, so replacing a block cannot touch its neighbours', () => {
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]!.start).toBeGreaterThanOrEqual(ranges[index - 1]!.end);
    }
  });

  it('round-trips: writing a block back unchanged keeps the file identical', () => {
    for (const range of ranges) {
      expect(replaceLines(DOCUMENT, range, sliceLines(DOCUMENT, range))).toBe(DOCUMENT);
    }
  });

  // Regression: a list's range used to include the blank line after it, so
  // deleting that line in the block editor glued the next block onto the list.
  it('leaves the blank line after a list outside its range', () => {
    const source = '- a\n- b\n\nAfter the list\n';
    const [list] = renderedBlocks(source);
    expect(sliceLines(source, blockRange(list!)!)).toBe('- a\n- b');
  });

  it('reads nothing from elements without both attributes', () => {
    const element = document.createElement('p');
    expect(blockRange(element)).toBeNull();
    element.setAttribute('data-line', '3');
    expect(blockRange(element)).toBeNull();
    element.setAttribute('data-line-end', '2');
    expect(blockRange(element)).toBeNull();
  });
});

describe('replaceLines', () => {
  it('swaps only the given lines', () => {
    expect(replaceLines('a\nb\nc\n', { start: 1, end: 2 }, 'B1\nB2')).toBe('a\nB1\nB2\nc\n');
  });

  it('keeps Windows line endings', () => {
    const text = 'a\r\nb\r\nc\r\n';
    expect(lineEnding(text)).toBe('\r\n');
    expect(replaceLines(text, { start: 1, end: 2 }, 'x\ny')).toBe('a\r\nx\r\ny\r\nc\r\n');
    expect(sliceLines(text, { start: 0, end: 2 })).toBe('a\nb');
  });

  it('removes a block that was emptied', () => {
    expect(replaceLines('a\n\nb\n', { start: 2, end: 3 }, '')).toBe('a\n\n\n');
  });
});

describe('appendRange', () => {
  it('starts a new block after a blank line', () => {
    const { text, range } = appendRange('# Title\n');
    expect(replaceLines(text, range, 'New paragraph')).toBe('# Title\n\nNew paragraph\n');
  });

  it('ignores blank lines already at the end', () => {
    const { text, range } = appendRange('a\n\n\n\n');
    expect(replaceLines(text, range, 'b')).toBe('a\n\nb\n');
  });

  it('works on an empty document', () => {
    const { text, range } = appendRange('');
    expect(replaceLines(text, range, 'First')).toBe('First\n');
  });
});

describe('toggleTask', () => {
  const text = 'intro\n\n- [ ] one\n- plain\n  - [x] nested\n1. [ ] numbered\n';

  it('ticks and unticks the n-th task of a block', () => {
    const range = { start: 2, end: 6 };
    expect(toggleTask(text, range, 0)).toBe(text.replace('- [ ] one', '- [x] one'));
    expect(toggleTask(text, range, 1)).toBe(text.replace('- [x] nested', '- [ ] nested'));
    expect(toggleTask(text, range, 2)).toBe(text.replace('1. [ ] numbered', '1. [x] numbered'));
  });

  it('matches the order of the rendered checkboxes', () => {
    const [list] = renderedBlocks('- [ ] a\n- [x] b\n');
    const boxes = list!.querySelectorAll('input.mdt-task');
    expect(boxes).toHaveLength(2);
    expect(toggleTask('- [ ] a\n- [x] b\n', blockRange(list!)!, 1)).toBe('- [ ] a\n- [ ] b\n');
  });

  it('stays inside the block and reports a miss', () => {
    expect(toggleTask(text, { start: 0, end: 1 }, 0)).toBeNull();
    expect(toggleTask(text, { start: 2, end: 6 }, 9)).toBeNull();
  });
});

describe('patchChildren with line ranges', () => {
  it('keeps shifted blocks and updates both line attributes', () => {
    const container = document.createElement('div');
    patchChildren(container, renderedBlocks('one\n\ntwo\n'));
    const second = container.children[1]!;
    patchChildren(container, renderedBlocks('one\nmore\n\ntwo\n'));
    expect(container.children[1]).toBe(second);
    expect(blockRange(second)).toEqual({ start: 3, end: 4 });
  });
});
