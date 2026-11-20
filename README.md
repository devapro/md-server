# md-server

A small web server that renders a folder of Markdown files as HTML, with a
collapsible folder tree in the sidebar.

- Markdown → HTML (GFM tables, strikethrough, task lists, autolinks) via `markdown-it`
- Syntax highlighting for fenced code blocks (`highlight.js`)
- Sidebar with the folder structure, current page highlighted, filter box
- Folder pages: file listing plus the folder's `README.md` / `index.md`
- Relative links between documents and images just work (URLs mirror the folder layout)
- YAML front matter is stripped; `?raw` on any `.md` URL returns the source
- Light/dark theme follows the OS; mobile layout with a slide-out sidebar
- Read-only mount, hidden files (`.git`, `.env`, …) are never served, path traversal and
  symlinks pointing outside the docs folder are blocked

## Quick start (Docker Compose)

```bash
cp .env.example .env        # then set DOCS_DIR to your docs folder
docker compose up -d --build
```

Open <http://localhost:8080>.

The docs folder is mounted read-only, so edits to the files show up on the next page load.
The sidebar is re-scanned at most every `TREE_CACHE_MS` milliseconds.

## Configuration (`.env`)

| Variable        | Default  | Description                                                          |
| --------------- | -------- | -------------------------------------------------------------------- |
| `DOCS_DIR`      | `./docs` | Host folder with the Markdown files (absolute or relative path)      |
| `HOST_PORT`     | `8080`   | Host port the server is published on                                 |
| `SITE_TITLE`    | `Docs`   | Name shown in the top bar and browser tab                            |
| `MD_ALLOW_HTML` | `false`  | Render raw HTML inside Markdown. Enable only for docs you trust      |
| `TREE_CACHE_MS` | `2000`   | How long the sidebar tree is cached before the folder is re-scanned  |

## URL layout

| URL                         | Result                                              |
| --------------------------- | --------------------------------------------------- |
| `/`, `/guide/`              | Folder listing + `index.md` / `README.md` if present |
| `/guide/setup.md`           | Rendered page                                       |
| `/guide/setup`              | Same as above (`.md` is optional)                   |
| `/guide/setup.md?raw`       | Markdown source as `text/plain`                     |
| `/images/diagram.png`       | Any other file is served as-is                      |
| `/healthz`                  | Health check used by the container                  |

The sidebar lists Markdown files and every folder that contains Markdown somewhere
below it. The folder listing page shows all (non-hidden) files.

## Running without Docker

Requires Node.js 20+.

```bash
npm install
DOCS_ROOT=./docs PORT=3000 npm start     # or: npm run dev (restarts on code changes)
npm test
```

## Project layout

```
src/server.js      Express app: path resolution, routing, error pages
src/markdown.js    markdown-it setup (highlighting, anchors, task lists, front matter)
src/fs-utils.js    folder tree, directory listing, path-safety helpers
src/templates.js   HTML layout, sidebar tree, breadcrumbs, listing table
src/config.js      environment variables
public/            CSS and the small sidebar script
test/              node:test integration tests
docs/              sample docs (default DOCS_DIR)
```
