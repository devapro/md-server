import fs from 'node:fs/promises';
import path from 'node:path';

export const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);
const IGNORED_NAMES = new Set(['node_modules']);
const MAX_DEPTH = 20; // guards against symlink loops

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const isMarkdown = (name) => MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());

/** Hidden entries (dotfiles, .git, ...) are never listed or served. */
export const isHidden = (name) => name.startsWith('.') || IGNORED_NAMES.has(name);

/** Directories first, then files, natural sort ("2" before "10"). */
export function compareEntries(a, b) {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

export function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Like fs.stat but returns null when the path does not exist. */
export async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

/** Builds a URL path from a docs-relative path, encoding each segment. */
export function toUrl(relPath, { dir = false } = {}) {
  const encoded = relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  if (!encoded) return '/';
  return `/${encoded}${dir ? '/' : ''}`;
}

/** Lists one directory (all visible entries) with type, size and mtime. */
export async function listDirectory(absDir, relDir) {
  const dirents = await fs.readdir(absDir, { withFileTypes: true });
  const entries = await Promise.all(
    dirents
      .filter((d) => !isHidden(d.name))
      .map(async (d) => {
        const st = await statOrNull(path.join(absDir, d.name)); // follows symlinks
        if (!st || !(st.isDirectory() || st.isFile())) return null;
        return {
          name: d.name,
          path: relDir ? `${relDir}/${d.name}` : d.name,
          type: st.isDirectory() ? 'dir' : 'file',
          size: st.size,
          mtime: st.mtime,
        };
      }),
  );
  return entries.filter(Boolean).sort(compareEntries);
}

/**
 * Recursively builds the sidebar tree: Markdown files plus every folder that
 * (somewhere below it) contains at least one Markdown file.
 */
export async function buildTree(root, relDir = '', depth = 0) {
  let dirents;
  try {
    dirents = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes = [];
  for (const d of dirents) {
    if (isHidden(d.name)) continue;
    const relPath = relDir ? `${relDir}/${d.name}` : d.name;

    let isDir = d.isDirectory();
    let isFile = d.isFile();
    if (d.isSymbolicLink()) {
      const st = await statOrNull(path.join(root, relPath));
      isDir = Boolean(st?.isDirectory());
      isFile = Boolean(st?.isFile());
    }

    if (isDir && depth < MAX_DEPTH) {
      const children = await buildTree(root, relPath, depth + 1);
      if (children.length) nodes.push({ type: 'dir', name: d.name, path: relPath, children });
    } else if (isFile && isMarkdown(d.name)) {
      nodes.push({ type: 'file', name: d.name, path: relPath });
    }
  }
  return nodes.sort(compareEntries);
}

/** Memoises buildTree for `ttlMs` and collapses concurrent rebuilds into one. */
export function createTreeCache(root, ttlMs) {
  let tree = null;
  let builtAt = 0;
  let pending = null;

  return async function getTree() {
    if (tree && Date.now() - builtAt < ttlMs) return tree;
    pending ??= buildTree(root)
      .then((result) => {
        tree = result;
        builtAt = Date.now();
        return result;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
