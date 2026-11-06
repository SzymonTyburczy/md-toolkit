import hljs from 'highlight.js/lib/common';
import clojure from 'highlight.js/lib/languages/clojure';
import dart from 'highlight.js/lib/languages/dart';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import haskell from 'highlight.js/lib/languages/haskell';
import latex from 'highlight.js/lib/languages/latex';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import ocaml from 'highlight.js/lib/languages/ocaml';
import powershell from 'highlight.js/lib/languages/powershell';
import protobuf from 'highlight.js/lib/languages/protobuf';
import scala from 'highlight.js/lib/languages/scala';
import vim from 'highlight.js/lib/languages/vim';

const EXTRA_LANGUAGES = { clojure, dart, dockerfile, elixir, erlang, haskell, latex, matlab, nginx, ocaml, powershell, protobuf, scala, vim };

for (const [name, language] of Object.entries(EXTRA_LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns highlighted HTML, or escaped text when the language is unknown. */
export function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
  return escapeHtml(code);
}

/**
 * Splits highlighted HTML into one string per source line. A token such as a
 * block comment can span several lines, so open spans are closed at each line
 * end and reopened on the next line to keep every line well formed.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';

  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else if (part === '</span>') {
      open.pop();
      current += part;
    } else if (part.startsWith('<span')) {
      open.push(part);
      current += part;
    } else {
      current += part;
    }
  }
  lines.push(current);
  return lines;
}
