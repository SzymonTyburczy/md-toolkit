import MarkdownIt from 'markdown-it';
import { full as emoji } from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import { splitFrontMatter, type FrontMatter } from './front-matter';
import { escapeHtml, highlightCode, splitHighlightedLines } from './highlight';
import { alertsPlugin, type AlertLabels } from './plugins/alerts';
import { fencePlugin } from './plugins/fence';
import { mathPlugin } from './plugins/math';
import {
  headingsPlugin,
  sourceLinesPlugin,
  taskListsPlugin,
  type Heading,
  type RenderEnv,
} from './plugins/structure';

export type { Heading } from './plugins/structure';

export interface RendererOptions {
  typographer: boolean;
  breaks: boolean;
  alertLabels: AlertLabels;
  frontMatterLabel: string;
}

export interface RenderedDocument {
  /** Unsanitized HTML. Always pass it through sanitizeToFragment before use. */
  html: string;
  headings: Heading[];
  title: string | null;
  frontMatter: FrontMatter | null;
}

export type Renderer = (source: string) => RenderedDocument;

function frontMatterHtml(frontMatter: FrontMatter, label: string): string {
  const lines = splitHighlightedLines(highlightCode(frontMatter.raw, 'yaml'))
    .map((html) => `<span class="mdt-code-line">${html}\n</span>`)
    .join('');
  return `<details class="mdt-front-matter" data-line="0"><summary>${escapeHtml(label)}</summary><div class="mdt-code" data-lang="yaml"><pre><code class="hljs">${lines}</code></pre></div></details>\n`;
}

export function createRenderer(options: RendererOptions): Renderer {
  const md = MarkdownIt({
    html: true,
    linkify: true,
    typographer: options.typographer,
    breaks: options.breaks,
  });

  // Local notes often use absolute file: images. The sanitizer decides whether a
  // document may use them, based on where it came from, so they pass through here.
  const validateLink = md.validateLink.bind(md);
  md.validateLink = (url) => /^file:/i.test(url.trim()) || validateLink(url);

  md.use(footnote)
    .use(emoji)
    .use(mathPlugin)
    .use(taskListsPlugin)
    .use(alertsPlugin, options.alertLabels)
    .use(headingsPlugin)
    .use(sourceLinesPlugin)
    .use(fencePlugin);

  return (source) => {
    const { frontMatter, body, lineOffset } = splitFrontMatter(source);
    const env: RenderEnv = { headings: [], lineOffset };
    const html = md.render(body, env);
    const firstTitle = env.headings.find((heading) => heading.level === 1)?.text ?? null;

    return {
      html: (frontMatter ? frontMatterHtml(frontMatter, options.frontMatterLabel) : '') + html,
      headings: env.headings,
      title: frontMatter?.title ?? firstTitle,
      frontMatter,
    };
  };
}
