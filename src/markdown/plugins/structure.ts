import type { Env, MarkdownIt, StateCore, Token } from 'markdown-it';
import { SlugRegistry } from '../slug';

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export type RenderEnv = Env & {
  headings: Heading[];
  lineOffset: number;
};

function plainText(inline: Token): string {
  return (inline.children ?? [])
    .filter((child) => ['text', 'code_inline', 'emoji', 'math_inline'].includes(child.type))
    .map((child) => child.content)
    .join('');
}

/** Gives every heading a stable id and collects the outline for the table of contents. */
export function headingsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('mdt_headings', (state: StateCore) => {
    const env = state.env as RenderEnv;
    const slugs = new SlugRegistry();

    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const inline = state.tokens[index + 1];
      if (!inline) return;
      const text = plainText(inline);
      const id = slugs.unique(text);
      token.attrSet('id', id);
      env.headings.push({ level: Number(token.tag.slice(1)), text, id });
    });
  });
}

/**
 * Tags top-level blocks with their source line. Editor scroll sync reads these,
 * and only top-level blocks need them, which keeps preview diffing simple.
 */
export function sourceLinesPlugin(md: MarkdownIt): void {
  md.core.ruler.push('mdt_source_lines', (state: StateCore) => {
    const { lineOffset } = state.env as RenderEnv;
    for (const token of state.tokens) {
      if (token.level === 0 && token.map && token.nesting >= 0 && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0] + lineOffset));
      }
    }
  });
}

const TASK_MARKER = /^\[([ xX])\][ \t]+/;

/** Renders GitHub task lists. The boxes are read-only, the source file stays the source of truth. */
export function taskListsPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'mdt_task_lists', (state: StateCore) => {
    const tokens = state.tokens;

    for (let index = 2; index < tokens.length; index += 1) {
      const inline = tokens[index]!;
      const item = tokens[index - 2]!;
      if (inline.type !== 'inline' || tokens[index - 1]!.type !== 'paragraph_open' || item.type !== 'list_item_open') continue;

      const match = TASK_MARKER.exec(inline.content);
      const first = inline.children?.[0];
      if (!match || first?.type !== 'text') continue;

      first.content = first.content.slice(match[0].length);
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" class="mdt-task" disabled${match[1] === ' ' ? '' : ' checked'}> `;
      inline.children!.unshift(checkbox);
      item.attrJoin('class', 'mdt-task-item');

      for (let parent = index - 3; parent >= 0; parent -= 1) {
        const candidate = tokens[parent]!;
        if (candidate.level === item.level - 1 && /_list_open$/.test(candidate.type)) {
          if (!String(candidate.attrGet('class')).includes('mdt-task-list')) candidate.attrJoin('class', 'mdt-task-list');
          break;
        }
      }
    }
  });
}
