import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildManifest } from './manifest.config.ts';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

/** Every bundled font ships only its Latin and Latin Extended subsets (Polish needs the latter). */
const FONT_FILES: Record<string, string[]> = {
  '@fontsource-variable/inter': ['inter-latin-wght-normal', 'inter-latin-ext-wght-normal', 'inter-latin-wght-italic', 'inter-latin-ext-wght-italic'],
  '@fontsource-variable/source-serif-4': ['source-serif-4-latin-wght-normal', 'source-serif-4-latin-ext-wght-normal', 'source-serif-4-latin-wght-italic', 'source-serif-4-latin-ext-wght-italic'],
  '@fontsource-variable/literata': ['literata-latin-wght-normal', 'literata-latin-ext-wght-normal', 'literata-latin-wght-italic', 'literata-latin-ext-wght-italic'],
  '@fontsource-variable/jetbrains-mono': ['jetbrains-mono-latin-wght-normal', 'jetbrains-mono-latin-ext-wght-normal', 'jetbrains-mono-latin-wght-italic', 'jetbrains-mono-latin-ext-wght-italic'],
  '@fontsource-variable/fira-code': ['fira-code-latin-wght-normal', 'fira-code-latin-ext-wght-normal'],
  '@fontsource/atkinson-hyperlegible': [
    'atkinson-hyperlegible-latin-400-normal', 'atkinson-hyperlegible-latin-ext-400-normal',
    'atkinson-hyperlegible-latin-700-normal', 'atkinson-hyperlegible-latin-ext-700-normal',
    'atkinson-hyperlegible-latin-400-italic', 'atkinson-hyperlegible-latin-ext-400-italic',
  ],
};

/** Emits manifest.json and copies vendored fonts and KaTeX assets next to the bundle. */
function extensionAssets(): Plugin {
  return {
    name: 'md-toolkit:extension-assets',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest(pkg.version), null, 2),
      });
    },
    closeBundle() {
      const out = resolve(root, 'dist');
      if (!existsSync(out)) return;
      mkdirSync(resolve(out, 'fonts'), { recursive: true });
      for (const [pkgName, files] of Object.entries(FONT_FILES)) {
        for (const file of files) {
          cpSync(resolve(root, 'node_modules', pkgName, 'files', `${file}.woff2`), resolve(out, 'fonts', `${file}.woff2`));
        }
      }
      const katex = resolve(root, 'node_modules/katex/dist');
      mkdirSync(resolve(out, 'vendor/katex/fonts'), { recursive: true });
      cpSync(resolve(katex, 'katex.min.css'), resolve(out, 'vendor/katex/katex.min.css'));
      cpSync(resolve(katex, 'fonts'), resolve(out, 'vendor/katex/fonts'), {
        recursive: true,
        filter: (source) => !/\.(ttf|woff)$/.test(source),
      });

      // The fonts' licences require their text to travel with every copy.
      mkdirSync(resolve(out, 'licenses'), { recursive: true });
      for (const pkgName of [...Object.keys(FONT_FILES), 'katex']) {
        const name = pkgName.split('/').pop()!;
        cpSync(resolve(root, 'node_modules', pkgName, 'LICENSE'), resolve(out, 'licenses', `${name}.txt`));
      }
    },
  };
}

export default defineConfig({
  plugins: [extensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        viewer: resolve(root, 'viewer.html'),
        options: resolve(root, 'options.html'),
        popup: resolve(root, 'popup.html'),
        background: resolve(root, 'src/background/index.ts'),
        content: resolve(root, 'src/content/redirect.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' || chunk.name === 'content' ? '[name].js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/*.test.ts'],
  },
});
