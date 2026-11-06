import type { MarkdownIt, StateCore } from 'markdown-it';

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';
export type AlertLabels = Record<AlertKind, string>;

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

/** Turns GitHub-style `> [!NOTE]` blockquotes into titled callouts. */
export function alertsPlugin(md: MarkdownIt, labels: AlertLabels): void {
  md.core.ruler.after('inline', 'mdt_alerts', (state: StateCore) => {
    const tokens = state.tokens;

    for (let index = 0; index + 2 < tokens.length; index += 1) {
      const open = tokens[index]!;
      const paragraph = tokens[index + 1]!;
      const inline = tokens[index + 2]!;
      if (open.type !== 'blockquote_open' || paragraph.type !== 'paragraph_open' || inline.type !== 'inline') continue;

      const match = MARKER.exec(inline.content);
      if (!match) continue;
      const kind = match[1]!.toLowerCase() as AlertKind;

      let depth = 0;
      for (let close = index; close < tokens.length; close += 1) {
        const token = tokens[close]!;
        if (token.type === 'blockquote_open') depth += 1;
        if (token.type === 'blockquote_close') depth -= 1;
        if (depth === 0) {
          token.tag = 'div';
          break;
        }
      }

      open.tag = 'div';
      open.attrJoin('class', `mdt-alert mdt-alert-${kind}`);

      const title = new state.Token('html_block', '', 0);
      title.content = `<p class="mdt-alert-title">${md.utils.escapeHtml(labels[kind])}</p>\n`;
      tokens.splice(index + 1, 0, title);

      const children = inline.children ?? [];
      children[0]!.content = children[0]!.content.replace(/^\[![a-z]+\][ \t]*/i, '');
      if (children[0]!.content === '') children.shift();
      if (children[0]?.type === 'softbreak') children.shift();
      inline.content = inline.content.slice(match[0].length);
      inline.children = children;

      // A marker on its own line leaves an empty paragraph behind.
      if (children.length === 0) tokens.splice(index + 2, 3);
    }
  });
}
