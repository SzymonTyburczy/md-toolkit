export interface FrontMatter {
  raw: string;
  title?: string;
}

export interface SplitDocument {
  frontMatter: FrontMatter | null;
  body: string;
  /** Lines removed from the top, so source positions still match the original file. */
  lineOffset: number;
}

const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const YAML_KEY = /^[\w.-]+[ \t]*:/m;
const TITLE = /^title[ \t]*:[ \t]*(.+?)[ \t]*$/m;

/**
 * Splits YAML front matter from the body. A leading `---` is also a valid
 * horizontal rule, so the block only counts when it contains a YAML key.
 */
export function splitFrontMatter(source: string): SplitDocument {
  const text = source.replace(/^﻿/, '');
  const match = BLOCK.exec(text);
  const raw = match?.[1];

  if (!match || raw === undefined || !YAML_KEY.test(raw)) {
    return { frontMatter: null, body: text, lineOffset: 0 };
  }

  const title = TITLE.exec(raw)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
  return {
    frontMatter: title ? { raw, title } : { raw },
    body: text.slice(match[0].length),
    lineOffset: match[0].split('\n').length - 1,
  };
}
