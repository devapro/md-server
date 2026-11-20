import path from 'node:path';

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? '').trim());

export function loadConfig(env = process.env) {
  return {
    docsRoot: path.resolve(env.DOCS_ROOT || './docs'),
    host: env.HOST || '0.0.0.0',
    port: Number.parseInt(env.PORT || '3000', 10),
    siteTitle: env.SITE_TITLE || 'Docs',
    // Raw HTML inside Markdown is off by default: anything in the docs folder
    // would otherwise be able to inject scripts into the page.
    allowHtml: truthy(env.MD_ALLOW_HTML),
    // How long the sidebar tree is cached before the docs folder is re-scanned.
    treeCacheMs: Number.parseInt(env.TREE_CACHE_MS ?? '2000', 10),
  };
}
