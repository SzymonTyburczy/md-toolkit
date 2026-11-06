import type { MarkdownIt } from 'markdown-it';
import { escapeHtml, highlightCode, splitHighlightedLines } from '../highlight';

/**
 * Renders code fences. Mermaid and math fences become placeholders that the
 * viewer fills in later, so their large libraries load only when a document
 * actually uses them.
 */
export function fencePlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index]!;
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const line = token.attrGet('data-line');
    const lineAttribute = line === null ? '' : ` data-line="${line}"`;
    const code = token.content.replace(/\n$/, '');

    // Sources stay in the element's text, not an attribute: the sanitizer removes
    // attributes containing "-->", which is how every Mermaid arrow is written.
    if (language === 'mermaid') {
      return `<div class="mdt-mermaid"${lineAttribute}><pre>${escapeHtml(code)}</pre></div>\n`;
    }

    if (language === 'math') {
      return `<div class="mdt-math" data-display="true"${lineAttribute}>${escapeHtml(code)}</div>\n`;
    }

    const lines = splitHighlightedLines(highlightCode(code, language))
      .map((html) => `<span class="mdt-code-line">${html}\n</span>`)
      .join('');
    return `<div class="mdt-code"${lineAttribute} data-lang="${escapeHtml(language)}"><pre><code class="hljs">${lines}</code></pre></div>\n`;
  };
}
