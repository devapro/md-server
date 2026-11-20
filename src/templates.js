import path from 'node:path';
import { isMarkdown, toUrl } from './fs-utils.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const ICONS = {
  dir: '<svg class="icon icon-dir" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>',
  md: '<svg class="icon icon-md" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>',
  file: '<svg class="icon icon-file" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Z"/></svg>',
};

const iconFor = (entry) => (entry.type === 'dir' ? ICONS.dir : isMarkdown(entry.name) ? ICONS.md : ICONS.file);

/** File name without its Markdown extension, for the sidebar. */
const displayName = (node) => (node.type === 'file' ? node.name.slice(0, -path.extname(node.name).length) : node.name);

function renderTree(nodes, currentPath) {
  const items = nodes.map((node) => {
    const isCurrent = node.path === currentPath;
    const current = isCurrent ? ' aria-current="page"' : '';
    const label = escapeHtml(displayName(node));

    if (node.type === 'dir') {
      const open = isCurrent || currentPath.startsWith(`${node.path}/`);
      return `<li class="tree-dir"><details${open ? ' open' : ''}><summary>${ICONS.dir}<a href="${toUrl(node.path, { dir: true })}"${current}>${label}</a></summary>${renderTree(node.children, currentPath)}</details></li>`;
    }
    return `<li class="tree-file"><a href="${toUrl(node.path)}"${current} title="${escapeHtml(node.name)}">${ICONS.md}<span>${label}</span></a></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function renderBreadcrumbs(relPath, siteTitle) {
  const parts = relPath.split('/').filter(Boolean);
  const crumbs = [`<a href="/">${escapeHtml(siteTitle)}</a>`];
  parts.forEach((part, i) => {
    const partPath = parts.slice(0, i + 1).join('/');
    const isLast = i === parts.length - 1;
    crumbs.push(isLast
      ? `<span aria-current="page">${escapeHtml(part)}</span>`
      : `<a href="${toUrl(partPath, { dir: true })}">${escapeHtml(part)}</a>`);
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.join('<span class="sep">/</span>')}</nav>`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const formatDate = (date) => date.toISOString().slice(0, 16).replace('T', ' ');

export function renderListing(entries, relDir) {
  const rows = [];
  if (relDir) {
    const parent = relDir.split('/').slice(0, -1).join('/');
    rows.push(`<tr><td colspan="3"><a href="${toUrl(parent, { dir: true })}">${ICONS.dir}..</a></td></tr>`);
  }
  for (const entry of entries) {
    const href = toUrl(entry.path, { dir: entry.type === 'dir' });
    rows.push(`<tr>
      <td><a href="${href}">${iconFor(entry)}${escapeHtml(entry.name)}${entry.type === 'dir' ? '/' : ''}</a></td>
      <td class="num">${entry.type === 'dir' ? '' : formatSize(entry.size)}</td>
      <td class="num">${formatDate(entry.mtime)}</td>
    </tr>`);
  }
  if (!entries.length) rows.push('<tr><td colspan="3" class="empty">This folder is empty.</td></tr>');

  return `<table class="listing">
    <thead><tr><th>Name</th><th class="num">Size</th><th class="num">Modified (UTC)</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

export function renderPage({ siteTitle, title, tree, currentPath, breadcrumbPath, body, rawUrl, assetVersion = '' }) {
  const v = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : '';
  const pageTitle = title && title !== siteTitle ? `${title} · ${siteTitle}` : siteTitle;
  const actions = rawUrl ? `<a class="action" href="${rawUrl}">Raw</a>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="stylesheet" href="/_assets/vendor/github-markdown.css${v}">
  <link rel="stylesheet" href="/_assets/vendor/hljs-light.css${v}" media="(prefers-color-scheme: light)">
  <link rel="stylesheet" href="/_assets/vendor/hljs-dark.css${v}" media="(prefers-color-scheme: dark)">
  <link rel="stylesheet" href="/_assets/style.css${v}">
</head>
<body>
  <header class="topbar">
    <button class="sidebar-toggle" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="Toggle file tree">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z"/></svg>
    </button>
    ${renderBreadcrumbs(breadcrumbPath, siteTitle)}
    <div class="actions">${actions}</div>
  </header>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <input class="tree-filter" type="search" placeholder="Filter files…" aria-label="Filter files">
      <nav class="tree" aria-label="Documents">
        ${tree.length ? renderTree(tree, currentPath) : '<p class="empty">No Markdown files found.</p>'}
      </nav>
    </aside>
    <main class="content">
      ${body}
    </main>
  </div>
  <script src="/_assets/app.js${v}" defer></script>
</body>
</html>`;
}
