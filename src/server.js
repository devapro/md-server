import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { loadConfig } from './config.js';
import {
  createTreeCache,
  isHidden,
  isInside,
  isMarkdown,
  listDirectory,
  statOrNull,
  toUrl,
} from './fs-utils.js';
import { createMarkdownRenderer } from './markdown.js';
import { escapeHtml, renderListing, renderPage } from './templates.js';

const require = createRequire(import.meta.url);
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const VENDOR_FILES = {
  'github-markdown.css': require.resolve('github-markdown-css/github-markdown.css'),
  'hljs-light.css': require.resolve('highlight.js/styles/github.css'),
  'hljs-dark.css': require.resolve('highlight.js/styles/github-dark.css'),
};
const INDEX_FILES = ['index.md', 'readme.md', 'index.markdown', 'readme.markdown'];

// Content hash appended to asset URLs (?v=...) so long browser caching never serves stale CSS/JS.
const ASSET_VERSION = (() => {
  const hash = createHash('sha256');
  const files = [...readdirSync(PUBLIC_DIR).sort().map((f) => path.join(PUBLIC_DIR, f)), ...Object.values(VENDOR_FILES)];
  for (const file of files) hash.update(readFileSync(file));
  return hash.digest('hex').slice(0, 10);
})();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApp(config) {
  const app = express();
  const renderMarkdown = createMarkdownRenderer(config);
  const getTree = createTreeCache(config.docsRoot, config.treeCacheMs);
  let realRootPromise;
  const getRealRoot = () => (realRootPromise ??= fs.realpath(config.docsRoot));

  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

  app.get('/_assets/vendor/:file', (req, res, next) => {
    const file = VENDOR_FILES[req.params.file];
    if (!file) return next();
    res.sendFile(file, { maxAge: '7d' });
  });
  app.use('/_assets', express.static(PUBLIC_DIR, { maxAge: '7d', index: false }));

  const page = async (opts) => renderPage({
    siteTitle: config.siteTitle,
    assetVersion: ASSET_VERSION,
    tree: await getTree(),
    ...opts,
  });

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    try {
      // --- resolve the request path safely inside the docs root ---------------
      let decoded;
      try {
        decoded = decodeURIComponent(req.path);
      } catch {
        throw new HttpError(400, 'Malformed URL');
      }
      if (decoded.includes('\0') || decoded.includes('\\')) throw new HttpError(400, 'Malformed URL');

      const segments = decoded.split('/').filter(Boolean);
      if (segments.some(isHidden)) throw new HttpError(404, 'Not found'); // also rejects "." and ".."

      let relPath = segments.join('/');
      let absPath = path.resolve(config.docsRoot, ...segments);
      if (!isInside(config.docsRoot, absPath)) throw new HttpError(404, 'Not found');

      let stat = await statOrNull(absPath);
      // "/guide/setup" -> "/guide/setup.md" when no such file/folder exists.
      if (!stat && segments.length && !path.extname(absPath)) {
        const withExt = await statOrNull(`${absPath}.md`);
        if (withExt?.isFile()) {
          absPath += '.md';
          relPath += '.md';
          stat = withExt;
        }
      }
      if (!stat) throw new HttpError(404, 'Not found');

      // Symlinks may only point to targets that are still inside the docs root.
      const realPath = await fs.realpath(absPath);
      if (!isInside(await getRealRoot(), realPath)) throw new HttpError(404, 'Not found');

      // --- folder: listing + README/index ----------------------------------
      if (stat.isDirectory()) {
        if (!req.path.endsWith('/')) {
          // Trailing slash keeps relative links inside the README working.
          // Built from the normalised path, so "//evil.example" can't become an open redirect.
          const queryStart = req.originalUrl.indexOf('?');
          const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
          return res.redirect(301, toUrl(relPath, { dir: true }) + query);
        }

        const entries = await listDirectory(absPath, relPath);
        const indexEntry = INDEX_FILES
          .map((name) => entries.find((e) => e.type === 'file' && e.name.toLowerCase() === name))
          .find(Boolean);

        let readme = '';
        let title = segments.at(-1) || config.siteTitle;
        if (indexEntry) {
          const rendered = renderMarkdown(await fs.readFile(path.join(absPath, indexEntry.name), 'utf8'));
          title = rendered.title || title;
          readme = `<article class="markdown-body readme">
            <div class="readme-header">${escapeHtml(indexEntry.name)}</div>
            ${rendered.html}
          </article>`;
        }

        return res.type('html').send(await page({
          title,
          currentPath: relPath,
          breadcrumbPath: relPath,
          body: renderListing(entries, relPath) + readme,
        }));
      }

      if (!stat.isFile()) throw new HttpError(404, 'Not found');

      // --- Markdown file: render (or raw with ?raw) --------------------------
      if (isMarkdown(absPath) && req.query.raw === undefined) {
        const rendered = renderMarkdown(await fs.readFile(absPath, 'utf8'));
        return res.type('html').send(await page({
          title: rendered.title || path.basename(relPath),
          currentPath: relPath,
          breadcrumbPath: relPath,
          rawUrl: `${toUrl(relPath)}?raw`,
          body: `<article class="markdown-body">${rendered.html}</article>`,
        }));
      }

      // --- anything else (images, PDFs, raw Markdown): send as-is --------------
      if (isMarkdown(absPath)) res.type('text/plain; charset=utf-8');
      return res.sendFile(realPath, { dotfiles: 'deny', lastModified: true });
    } catch (err) {
      return next(err);
    }
  });

  // 404 for anything that fell through (non-GET methods, unknown assets).
  app.use((req, res, next) => next(new HttpError(404, 'Not found')));

  // eslint-disable-next-line no-unused-vars
  app.use(async (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Internal server error' : err.message || 'Error';
    if (res.headersSent) return res.end();

    let html;
    try {
      html = await page({
        title: `${status} ${message}`,
        currentPath: '',
        breadcrumbPath: '',
        body: `<article class="markdown-body error-page"><h1>${status}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to start</a></p></article>`,
      });
    } catch {
      html = `<h1>${status}</h1><p>${escapeHtml(message)}</p>`;
    }
    res.status(status).type('html').send(html);
  });

  return app;
}

async function main() {
  const config = loadConfig();
  const rootStat = await statOrNull(config.docsRoot);
  if (!rootStat?.isDirectory()) {
    console.error(`Docs folder not found or not a directory: ${config.docsRoot}`);
    process.exit(1);
  }

  const server = createApp(config).listen(config.port, config.host, () => {
    console.log(`md-server: serving ${config.docsRoot} on http://${config.host}:${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`md-server: received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
