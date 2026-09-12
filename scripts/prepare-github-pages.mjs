import { access, copyFile, rm } from 'node:fs/promises';

try {
  await access('static-dist/static/index.html');
  await copyFile('static-dist/static/index.html', 'static-dist/index.html');
  await rm('static-dist/static', { recursive: true, force: true });
} catch {
  // Vite emits the HTML at the root when the static config uses a root input.
}
