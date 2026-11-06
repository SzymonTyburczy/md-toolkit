import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/markdown/render';
import { resolveRelativeUrls, sanitizeToFragment } from '../src/markdown/sanitize';

const render = createRenderer({
  typographer: false,
  breaks: false,
  frontMatterLabel: '',
  alertLabels: { note: '', tip: '', important: '', warning: '', caution: '' },
});

function html(fragment: DocumentFragment): string {
  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}

const WEB = 'https://example.com/docs/readme.md';
const LOCAL = 'file:///C:/notes/readme.md';

describe('sanitizeToFragment', () => {
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror=alert(1)>', 'onerror'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<iframe src="https://evil.test"></iframe>', 'iframe'],
    ['<style>body{display:none}</style>', 'style'],
    ['<form action="https://evil.test"><input name=a></form>', 'form'],
    ['<base href="https://evil.test/">', 'base'],
    ['<p style="position:fixed;inset:0">x</p>', 'position:fixed'],
    ['<svg><script>alert(1)</script></svg>', 'alert'],
    ['<meta http-equiv="refresh" content="0;url=https://evil.test">', 'refresh'],
  ])('strips %s', (input, forbidden) => {
    expect(html(sanitizeToFragment(input, WEB))).not.toContain(forbidden);
  });

  it('keeps what README files rely on', () => {
    const out = html(sanitizeToFragment(
      '<p align="center"><img src="a.png" width="100"></p><details open><summary>s</summary>x</details><kbd>k</kbd>',
      WEB,
    ));
    expect(out).toContain('align="center"');
    expect(out).toContain('width="100"');
    expect(out).toContain('<details');
    expect(out).toContain('<kbd>');
  });

  it('keeps the attributes the viewer depends on', () => {
    const out = html(sanitizeToFragment('<div class="mdt-math" data-display="true" data-line="3">y</div>', WEB));
    expect(out).toContain('class="mdt-math"');
    expect(out).toContain('data-display="true"');
    expect(out).toContain('data-line="3"');
  });

  // Regression: the sanitizer treats these values as suspicious in attributes.
  it('keeps the rendered source of diagrams and formulas intact', () => {
    const mermaid = render('```mermaid\ngraph TD; A-->B\n```\n').html;
    expect(sanitizeToFragment(mermaid, WEB).textContent).toContain('A-->B');
    expect(sanitizeToFragment(render('$$\nx --> y\n$$\n').html, WEB).textContent).toContain('x --> y');
  });

  // Regression: these words are DOM properties, so ids were stripped as clobbering.
  it.each(['target', 'name', 'action', 'method', 'links', 'images', 'title', 'body', 'cookie'])(
    'keeps the id of a heading called %s',
    (word) => {
      const fragment = sanitizeToFragment(render(`## ${word}\n`).html, WEB);
      expect(fragment.querySelector('h2')?.id).toBe(word);
    },
  );

  it('still blocks DOM clobbering from anything but headings', () => {
    const out = html(sanitizeToFragment('<img name="body" src="a.png"><a id="cookie">x</a>', WEB));
    expect(out).not.toContain('name="body"');
    expect(out).not.toContain('id="cookie"');
  });

  it('blocks file: URLs in documents from the web', () => {
    const out = html(sanitizeToFragment('<img src="file:///C:/secret.png"><a href="file:///etc/passwd">x</a>', WEB));
    expect(out).not.toContain('file:');
  });

  it('blocks file: URLs in pasted text with no base', () => {
    expect(html(sanitizeToFragment('<img src="file:///C:/secret.png">', null))).not.toContain('file:');
  });

  it('allows file: URLs in local documents', () => {
    expect(html(sanitizeToFragment('<img src="file:///C:/notes/a.png">', LOCAL))).toContain('file:///C:/notes/a.png');
  });

  it('applies the same rule to Markdown image syntax', () => {
    const { html: rendered } = render('![a](file:///C:/notes/a.png)');
    expect(html(sanitizeToFragment(rendered, LOCAL))).toContain('src="file:///C:/notes/a.png"');
    expect(html(sanitizeToFragment(rendered, WEB))).not.toContain('file:');
  });

  it('still blocks javascript: in local documents', () => {
    expect(html(sanitizeToFragment('<a href="javascript:alert(1)">x</a>', LOCAL))).not.toContain('javascript:');
  });
});

describe('resolveRelativeUrls', () => {
  function resolve(input: string, base: string): string {
    const fragment = sanitizeToFragment(input, base);
    resolveRelativeUrls(fragment, base);
    return html(fragment);
  }

  it('resolves images and links against the document', () => {
    const out = resolve('<img src="img/a.png"><a href="../b.md">b</a>', WEB);
    expect(out).toContain('src="https://example.com/docs/img/a.png"');
    expect(out).toContain('href="https://example.com/b.md"');
  });

  it('works for local files', () => {
    expect(resolve('<img src="a b.png">', LOCAL)).toContain('src="file:///C:/notes/a%20b.png"');
  });

  it('leaves in-page anchors and data URLs untouched', () => {
    const out = resolve('<a href="#x">x</a><img src="data:image/png;base64,AAAA">', WEB);
    expect(out).toContain('href="#x"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });

  it('rewrites srcset candidates and keeps descriptors', () => {
    const out = resolve('<picture><source srcset="a.png 1x, b.png 2x"><img src="a.png"></picture>', WEB);
    expect(out).toContain('srcset="https://example.com/docs/a.png 1x, https://example.com/docs/b.png 2x"');
  });

  it('never yields a file: URL from a web document', () => {
    const fragment = sanitizeToFragment('<img src="file:///C:/x.png">', WEB);
    resolveRelativeUrls(fragment, WEB);
    expect(html(fragment)).not.toContain('file:');
  });
});
