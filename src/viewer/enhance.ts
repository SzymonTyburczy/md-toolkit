import type { Mermaid } from 'mermaid';
import { h, icon } from '../shared/dom';
import { t } from '../shared/i18n';

/** Adds the copy button and heading links. These live only in the viewer, never in exports. */
export function enhanceBlocks(blocks: Element[]): void {
  for (const block of blocks) {
    const codeBlocks = block.matches('.mdt-code') ? [block] : [...block.querySelectorAll('.mdt-code')];
    for (const code of codeBlocks) {
      code.append(h('button', { class: 'mdt-copy', type: 'button', title: t('code.copy'), 'aria-label': t('code.copy') }, icon('copy')));
    }

    const headings = block.matches('h1,h2,h3,h4,h5,h6') ? [block] : [...block.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    for (const heading of headings) {
      if (heading.id) {
        heading.append(h('a', { class: 'mdt-anchor', href: `#${heading.id}`, title: t('heading.link'), 'aria-label': t('heading.link') }));
      }
    }
  }
}

type Katex = typeof import('katex').default;

let katexLoader: Promise<Katex> | undefined;

function loadKatex(): Promise<Katex> {
  katexLoader ??= (async () => {
    document.head.append(h('link', { rel: 'stylesheet', href: '/vendor/katex/katex.min.css' }));
    return (await import('katex')).default;
  })();
  return katexLoader;
}

const mathCache = new Map<string, string>();

export async function renderMath(root: Element): Promise<void> {
  const nodes = root.querySelectorAll<HTMLElement>('.mdt-math:not([data-rendered])');
  if (nodes.length === 0) return;
  const katex = await loadKatex();

  for (const node of nodes) {
    const tex = node.textContent ?? '';
    const displayMode = node.dataset.display === 'true';
    const key = `${displayMode}:${tex}`;
    let html = mathCache.get(key);
    if (html === undefined) {
      html = katex.renderToString(tex, { displayMode, throwOnError: false, trust: false, strict: 'ignore' });
      mathCache.set(key, html);
    }
    node.innerHTML = html;
    node.dataset.rendered = 'true';
  }
}

let mermaidLoader: Promise<Mermaid> | undefined;
let diagramCounter = 0;

function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import('mermaid').then((module) => module.default);
  return mermaidLoader;
}

const diagramCache = new Map<string, string>();

/** Draws diagrams in the colours and font of the active theme. */
function diagramThemeVariables(dark: boolean): Record<string, string | boolean> {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const [background, surface, raised, text, muted, accent] =
    ['--bg', '--bg-soft', '--bg-hover', '--fg', '--fg-muted', '--accent'].map(read) as [string, string, string, string, string, string];

  return {
    darkMode: dark,
    background,
    fontFamily: read('--font-body'),
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: raised,
    secondaryTextColor: text,
    secondaryBorderColor: muted,
    tertiaryColor: background,
    tertiaryTextColor: text,
    tertiaryBorderColor: muted,
    lineColor: muted,
    textColor: text,
    edgeLabelBackground: background,
    clusterBkg: surface,
    clusterBorder: muted,
    noteBkgColor: raised,
    noteTextColor: text,
    noteBorderColor: muted,
  };
}

/**
 * Mermaid measures a diagram in a scratch element, by default in <body>, where
 * it would briefly squeeze the page layout. This keeps that work off-screen.
 */
function diagramStage(): HTMLElement {
  const existing = document.getElementById('mdt-diagram-stage');
  if (existing) return existing;
  const stage = h('div', { id: 'mdt-diagram-stage', 'aria-hidden': 'true' });
  document.body.append(stage);
  return stage;
}

/** mermaid.initialize() is global state, so drawing runs strictly one pass at a time. */
let diagramQueue: Promise<void> = Promise.resolve();

/** `force` redraws diagrams that are already on the page, for when the theme changes. */
export function renderDiagrams(root: Element, dark: boolean, force = false): Promise<void> {
  diagramQueue = diagramQueue.then(() => drawDiagrams(root, dark, force)).catch(() => {});
  return diagramQueue;
}

async function drawDiagrams(root: Element, dark: boolean, force: boolean): Promise<void> {
  const selector = force ? '.mdt-mermaid' : '.mdt-mermaid:not([data-rendered])';
  const nodes = root.querySelectorAll<HTMLElement>(selector);
  if (nodes.length === 0) return;

  const mermaid = await loadMermaid();
  const themeVariables = diagramThemeVariables(dark);
  const signature = JSON.stringify(themeVariables);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables });

  for (const node of nodes) {
    // Drawing replaces the text, so keep the source for redraws on theme changes.
    const source = (node.dataset.source ??= node.textContent ?? '');
    const key = `${signature}:${source}`;
    node.dataset.rendered = 'true';

    const cached = diagramCache.get(key);
    if (cached !== undefined) {
      node.innerHTML = cached;
      continue;
    }

    const id = `mdt-diagram-${(diagramCounter += 1)}`;
    try {
      const { svg } = await mermaid.render(id, source, diagramStage());
      diagramCache.set(key, svg);
      node.innerHTML = svg;
    } catch (error) {
      // Mermaid leaves its scratch element behind when parsing fails.
      document.getElementById(`d${id}`)?.remove();
      node.replaceChildren(h('div', { class: 'mdt-render-error' }, error instanceof Error ? error.message : String(error)));
    }
  }
}
