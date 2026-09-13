import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';

const outputDirectory = path.resolve('dist-remote-fastapi');
const indexFile = path.join(outputDirectory, 'index.html');

if (!fs.existsSync(indexFile)) {
  throw new Error(`Production demo build is missing: ${indexFile}`);
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const browserFiles = filesUnder(outputDirectory).filter((file) => /\.(?:html|js|css)$/.test(file));
const builtText = browserFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

if (builtText.includes('http://127.0.0.1:8000')) {
  throw new Error('Production demo build contains the development API origin.');
}
if (!builtText.includes('/api') || !builtText.includes('/customers/grid')) {
  throw new Error('Production demo build does not contain the same-origin grid API path.');
}

console.log(
  `Verified ${browserFiles.length} production browser files: same-origin /api, no localhost:8000 dependency.`
);
