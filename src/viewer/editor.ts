import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
  placeholder, type Command,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** Colours come from the active theme's variables, so the editor follows every theme for free. */
const highlighting = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--hl-function)' },
  { tag: tags.url, color: 'var(--hl-string)' },
  { tag: tags.monospace, color: 'var(--hl-string)' },
  { tag: tags.quote, color: 'var(--fg-muted)' },
  { tag: tags.list, color: 'var(--hl-keyword)' },
  { tag: tags.meta, color: 'var(--hl-comment)' },
  { tag: tags.processingInstruction, color: 'var(--hl-comment)' },
  { tag: tags.comment, color: 'var(--hl-comment)' },
  { tag: tags.contentSeparator, color: 'var(--hl-comment)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'var(--bg)', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--fg)', padding: '16px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '.cm-gutters': { color: 'var(--fg-muted)', backgroundColor: 'var(--bg)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--fg) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-placeholder': { color: 'var(--fg-muted)' },
});

/** Wraps the selection in a marker, or removes the marker if it is already there. */
function toggleWrap(marker: string): Command {
  return (view) => {
    view.dispatch(view.state.changeByRange((range) => {
      const size = marker.length;
      const before = view.state.sliceDoc(range.from - size, range.from);
      const after = view.state.sliceDoc(range.to, range.to + size);

      if (before === marker && after === marker) {
        return {
          changes: [{ from: range.from - size, to: range.from }, { from: range.to, to: range.to + size }],
          range: EditorSelection.range(range.from - size, range.to - size),
        };
      }
      return {
        changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
        range: EditorSelection.range(range.from + size, range.to + size),
      };
    }));
    return true;
  };
}

const insertLink: Command = (view) => {
  view.dispatch(view.state.changeByRange((range) => {
    const label = view.state.sliceDoc(range.from, range.to);
    const insert = `[${label}](url)`;
    const urlStart = range.from + label.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  }));
  return true;
};

export interface EditorCallbacks {
  placeholder: string;
  onChange(text: string): void;
  onScroll(): void;
}

export interface MarkdownEditor {
  readonly text: string;
  setText(text: string): void;
  focus(): void;
  /** Topmost visible position as a fractional, zero-based source line. */
  topLine(): number;
  scrollToLine(line: number): void;
}

export function createEditor(parent: HTMLElement, text: string, callbacks: EditorCallbacks): MarkdownEditor {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    bracketMatching(),
    EditorView.lineWrapping,
    markdown(),
    syntaxHighlighting(highlighting),
    theme,
    placeholder(callbacks.placeholder),
    keymap.of([
      { key: 'Mod-b', run: toggleWrap('**') },
      { key: 'Mod-i', run: toggleWrap('*') },
      { key: 'Mod-k', run: insertLink },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.onChange(update.state.doc.toString());
    }),
  ];

  const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions }) });
  view.scrollDOM.addEventListener('scroll', callbacks.onScroll, { passive: true });

  return {
    get text() {
      return view.state.doc.toString();
    },
    setText(next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
    focus() {
      view.focus();
    },
    topLine() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      const line = view.state.doc.lineAt(block.from).number - 1;
      return line + (view.scrollDOM.scrollTop - block.top) / Math.max(block.height, 1);
    },
    scrollToLine(line) {
      const clamped = Math.min(Math.max(Math.floor(line), 0), view.state.doc.lines - 1);
      const block = view.lineBlockAt(view.state.doc.line(clamped + 1).from);
      view.scrollDOM.scrollTop = block.top + (line - clamped) * block.height;
    },
  };
}
