/**
 * Zips the built extension for the Chrome Web Store or a GitHub release.
 * Run through `npm run package`, which builds first.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function collect(directory, files = {}) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) collect(path, files);
    else files[relative(dist, path).replaceAll('\\', '/')] = readFileSync(path);
  }
  return files;
}

const files = collect(dist);
if (!files['manifest.json']) throw new Error('dist/manifest.json is missing. Run the build first.');

const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
if (manifest.version !== version) throw new Error(`Stale build: manifest is ${manifest.version}, package.json is ${version}.`);

mkdirSync(resolve(root, 'release'), { recursive: true });
const output = resolve(root, 'release', `md-toolkit-${version}.zip`);
writeFileSync(output, zipSync(files, { level: 9 }));

const megabytes = (statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`${relative(root, output)}: ${Object.keys(files).length} files, ${megabytes} MB`);
