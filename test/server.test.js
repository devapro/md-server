import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/server.js';
import { createMarkdownRenderer } from '../src/markdown.js';

let tmp;
let docsRoot;
let server;
let base;

const get = (urlPath, init) => fetch(base + urlPath, { redirect: 'manual', ...init });

async function write(rel, content) {
  const abs = path.join(docsRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'md-server-test-'));
  docsRoot = path.join(tmp, 'docs');
  await write('README.md', '# Home\n\nSee [guide](guide/intro.md).\n');
  await write('guide/intro.md', '---\ntitle: x\n---\n# Intro\n\n```js\nconst a = 1;\n```\n');
  await write('guide/sub folder/deep.md', '# Deep\n');
  await write('assets/logo.txt', 'not markdown');
  await write('empty-dir/.keep', '');
  await write('.secret/hidden.md', '# Hidden\n');
  await write('script.md', '# XSS\n\n<script>alert(1)</script>\n');
  await fs.writeFile(path.join(tmp, 'outside.md'), '# Outside\n');
  await fs.symlink(path.join(tmp, 'outside.md'), path.join(docsRoot, 'escape.md'));

  const app = createApp({ docsRoot, siteTitle: 'Test Docs', allowHtml: false, treeCacheMs: 0 });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('rendering', () => {
  test('root shows listing and renders README', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Home · Test Docs<\/title>/);
    assert.match(html, /class="listing"/);
    assert.match(html, /<h1[^>]*id="home"/);
    assert.match(html, /href="guide\/intro.md"/);
  });

  test('markdown file is rendered with highlighting and front matter stripped', async () => {
    const res = await get('/guide/intro.md');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Intro · Test Docs<\/title>/);
    assert.match(html, /class="hljs language-js"/);
    assert.doesNotMatch(html, /title: x/);
    assert.match(html, /href="\/guide\/intro.md\?raw"/);
  });

  test('?raw returns the Markdown source', async () => {
    const res = await get('/guide/intro.md?raw');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/plain/);
    assert.match(await res.text(), /^---\ntitle: x/);
  });

  test('extension-less URL falls back to .md', async () => {
    const res = await get('/guide/intro');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Intro/);
  });

  test('raw HTML is escaped unless MD_ALLOW_HTML is on', async () => {
    const html = await (await get('/script.md')).text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert/);
  });

  test('non-markdown files are served as-is', async () => {
    const res = await get('/assets/logo.txt');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'not markdown');
  });

  test('task lists render as checkboxes', () => {
    const { html } = createMarkdownRenderer()('- [x] done\n- [ ] todo\n');
    assert.match(html, /<ul class="contains-task-list">/);
    assert.match(html, /<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled checked> done/);
    assert.match(html, /disabled> todo/);
  });
});

describe('folders', () => {
  test('folder without trailing slash redirects', async () => {
    const res = await get('/guide?x=1');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/guide/?x=1');
  });

  test('folder with spaces is listed', async () => {
    const res = await get('/guide/sub%20folder/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /href="\/guide\/sub%20folder\/deep.md"/);
  });

  test('sidebar tree contains nested markdown, skips hidden and md-less folders', async () => {
    const html = await (await get('/guide/intro.md')).text();
    const tree = html.slice(html.indexOf('<nav class="tree"'), html.indexOf('</aside>'));
    assert.match(tree, /href="\/guide\/sub%20folder\/deep.md"/);
    assert.match(tree, /<details open><summary>.*?href="\/guide\/"/s);
    assert.match(tree, /href="\/guide\/intro.md" aria-current="page"/);
    assert.doesNotMatch(tree, /\.secret|empty-dir|assets/);
  });
});

describe('path safety', () => {
  for (const url of ['/../outside.md', '/%2e%2e/outside.md', '/guide/..%2f..%2foutside.md', '/.secret/hidden.md']) {
    test(`blocks ${url}`, async () => {
      const res = await get(url);
      assert.equal(res.status, 404);
      assert.doesNotMatch(await res.text(), /Outside|Hidden/);
    });
  }

  test('blocks symlinks that point outside the docs root', async () => {
    assert.equal((await get('/escape.md')).status, 404);
  });

  test('malformed URL encoding is a 400', async () => {
    assert.equal((await get('/%E0%A4%A')).status, 400);
  });

  test('protocol-relative paths cannot become open redirects', async () => {
    const res = await get('//guide');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/guide/');
  });
});
