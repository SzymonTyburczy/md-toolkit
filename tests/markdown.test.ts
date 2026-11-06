import { describe, expect, it } from 'vitest';
import { splitFrontMatter } from '../src/markdown/front-matter';
import { splitHighlightedLines } from '../src/markdown/highlight';
import { createRenderer } from '../src/markdown/render';
import { SlugRegistry, slugify } from '../src/markdown/slug';

const render = createRenderer({
  typographer: false,
  breaks: false,
  frontMatterLabel: 'Front matter',
  alertLabels: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
});

describe('slugs', () => {
  it('matches GitHub for punctuation and keeps Polish letters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('Zażółć gęślą jaźń')).toBe('zażółć-gęślą-jaźń');
    expect(slugify('API v2.0 (beta)')).toBe('api-v20-beta');
  });

  it('numbers duplicates and never reuses an id', () => {
    const slugs = new SlugRegistry();
    expect(['a', 'a', 'a'].map((text) => slugs.unique(text))).toEqual(['a', 'a-1', 'a-2']);
    const clash = new SlugRegistry();
    expect(['a-1', 'a', 'a'].map((text) => clash.unique(text))).toEqual(['a-1', 'a', 'a-2']);
  });

  it('falls back when a heading has no slug characters', () => {
    expect(new SlugRegistry().unique('!!!')).toBe('section');
  });
});

describe('front matter', () => {
  it('splits YAML and reports the removed lines', () => {
    const result = splitFrontMatter('---\ntitle: "My doc"\ntags: [a]\n---\n# Body\n');
    expect(result.frontMatter?.title).toBe('My doc');
    expect(result.body).toBe('# Body\n');
    expect(result.lineOffset).toBe(4);
  });

  it('does not mistake horizontal rules for front matter', () => {
    const source = '---\nJust some text\n---\nMore\n';
    expect(splitFrontMatter(source).frontMatter).toBeNull();
    expect(splitFrontMatter(source).body).toBe(source);
  });

  it('handles CRLF files and a BOM', () => {
    const result = splitFrontMatter('﻿---\r\ntitle: x\r\n---\r\nBody');
    expect(result.frontMatter?.title).toBe('x');
    expect(result.body).toBe('Body');
  });

  it('keeps source lines aligned with the original file', () => {
    const { html } = render('---\ntitle: x\n---\n\n# Heading\n');
    expect(html).toContain('<h1 id="heading" data-line="4">');
  });
});

describe('headings', () => {
  it('collects the outline and takes the title from the first h1', () => {
    const { headings, title } = render('# One\n\n## Two `code`\n\n## Two `code`\n');
    expect(title).toBe('One');
    expect(headings).toEqual([
      { level: 1, text: 'One', id: 'one' },
      { level: 2, text: 'Two code', id: 'two-code' },
      { level: 2, text: 'Two code', id: 'two-code-1' },
    ]);
  });

  it('prefers the front matter title', () => {
    expect(render('---\ntitle: FM\n---\n# H1\n').title).toBe('FM');
  });
});

describe('math', () => {
  it('renders inline and block placeholders', () => {
    const { html } = render('Euler: $e^{i\\pi}$\n\n$$\nx^2\n$$\n');
    expect(html).toContain('<span class="mdt-math">e^{i\\pi}</span>');
    expect(html).toContain('<div class="mdt-math" data-display="true" data-line="2">x^2</div>');
  });

  it('leaves prices alone', () => {
    const { html } = render('It costs $5 and then $10 more.');
    expect(html).not.toContain('mdt-math');
    expect(html).toContain('$5 and then $10');
  });

  it('respects escaped dollars', () => {
    expect(render('\\$5 and \\$6').html).not.toContain('mdt-math');
  });

  it('does not swallow the document on an unclosed block', () => {
    const { html } = render('$$\nunfinished\n\n# Heading\n');
    expect(html).toContain('<h1');
    expect(html).not.toContain('mdt-math');
  });

  it('keeps math out of code', () => {
    expect(render('`$x$`').html).not.toContain('mdt-math');
  });

  it('supports math fences and single-line blocks', () => {
    expect(render('```math\nx\n```\n').html).toContain('>x</div>');
    expect(render('$$ y $$\n').html).toContain('>y</div>');
  });

  it('escapes tex so it cannot inject markup', () => {
    expect(render('$"><img src=x>$').html).not.toContain('<img');
  });
});

describe('alerts', () => {
  it('turns markers into titled callouts', () => {
    const { html } = render('> [!WARNING]\n> Careful now\n');
    expect(html).toContain('<div class="mdt-alert mdt-alert-warning"');
    expect(html).toContain('<p class="mdt-alert-title">Warning</p>');
    expect(html).toContain('Careful now');
    expect(html).not.toContain('[!WARNING]');
    expect(html).not.toContain('blockquote');
  });

  it('handles a marker with no text of its own, followed by a paragraph', () => {
    const { html } = render('> [!NOTE]\n>\n> Second paragraph\n');
    expect(html).toContain('Second paragraph');
    expect(html).not.toContain('<p></p>');
  });

  it('leaves ordinary quotes alone', () => {
    expect(render('> Just a quote').html).toContain('<blockquote');
  });

  it('closes nested quotes correctly', () => {
    const { html } = render('> [!TIP]\n> text\n>\n> > inner\n');
    expect(html.match(/<blockquote/g)).toHaveLength(1);
    expect(html.match(/<\/blockquote>/g)).toHaveLength(1);
  });
});

describe('task lists', () => {
  it('renders read-only checkboxes', () => {
    const { html } = render('- [ ] todo\n- [x] done\n- plain\n');
    expect(html).toContain('<ul class="mdt-task-list"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain('disabled checked');
    expect(html).not.toContain('[ ]');
    expect(html).toContain('plain');
  });

  it('works when the first word is formatted', () => {
    expect(render('- [x] **bold** task').html).toContain('<strong>bold</strong>');
  });
});

describe('code', () => {
  it('highlights known languages and wraps each line', () => {
    const { html } = render('```js\nconst a = 1;\nlet b;\n```\n');
    expect(html).toContain('data-lang="js"');
    expect(html).toContain('hljs-keyword');
    expect(html.match(/mdt-code-line/g)).toHaveLength(2);
  });

  it('escapes unknown languages', () => {
    const { html } = render('```nope\n<script>\n```\n');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('turns mermaid fences into placeholders with escaped source', () => {
    const { html } = render('```mermaid\ngraph TD; A-->B\n```\n');
    expect(html).toContain('class="mdt-mermaid"');
    expect(html).toContain('<pre>graph TD; A--&gt;B</pre>');
  });

  it('keeps tokens balanced across lines', () => {
    const lines = splitHighlightedLines('<span class="c">/* a\nb */</span> x');
    expect(lines).toEqual(['<span class="c">/* a</span>', '<span class="c">b */</span> x']);
  });

  it('survives nested spans over line breaks', () => {
    const lines = splitHighlightedLines('<span a><span b>1\n2</span>3\n4</span>');
    expect(lines).toEqual([
      '<span a><span b>1</span></span>',
      '<span a><span b>2</span>3</span>',
      '<span a>4</span>',
    ]);
  });
});

describe('other syntax', () => {
  it('renders tables, footnotes, emoji and strikethrough', () => {
    const { html } = render('| a |\n|---|\n| b |\n\nNote[^1] :smile: ~~gone~~\n\n[^1]: Footnote text\n');
    expect(html).toContain('<table');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('😄');
    expect(html).toContain('<s>gone</s>');
  });

  it('tags only top-level blocks with source lines', () => {
    const { html } = render('para\n\n- item\n\n  nested para\n');
    expect(html).toContain('<p data-line="0">');
    expect(html).toContain('<ul data-line="2">');
    expect(html.match(/data-line/g)).toHaveLength(2);
  });

  it('renders front matter collapsed', () => {
    expect(render('---\na: 1\n---\ntext').html).toContain('<details class="mdt-front-matter"');
  });

  it('applies the breaks option', () => {
    const withBreaks = createRenderer({
      typographer: false,
      breaks: true,
      frontMatterLabel: 'x',
      alertLabels: { note: '', tip: '', important: '', warning: '', caution: '' },
    });
    expect(withBreaks('a\nb').html).toContain('<br');
    expect(render('a\nb').html).not.toContain('<br');
  });
});
