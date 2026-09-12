import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('GitHub Pages static entrypoint is configured', () => {
  assert.equal(existsSync('static/index.html'), true);
  assert.equal(existsSync('static/main.tsx'), true);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
  assert.match(pkg.scripts?.['build:static'] ?? '', /vite.*vite\.static\.config/);
  assert.match(pkg.scripts?.['preview:static'] ?? '', /vite.*vite\.static\.config/);
  assert.equal(existsSync('scripts/prepare-github-pages.mjs'), true);
});
