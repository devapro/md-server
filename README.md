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

## How to run (Docker Compose)

Requirements: [Docker](https://docs.docker.com/get-docker/) with the Compose plugin
(`docker compose version` should work).

1. Get the code:

   ```bash
   git clone git@github.com:devapro/md-server.git
   cd md-server
   ```

2. Create your config and point it at your docs folder:

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:

   ```dotenv
   DOCS_DIR=/home/me/my-notes   # folder with your .md files (absolute, or relative to this folder)
   HOST_PORT=8080               # port to open in the browser
   ```

   Leave `DOCS_DIR=./docs` to try it with the bundled sample docs.

3. Build and start:

   ```bash
   docker compose up -d --build
   ```

4. Open <http://localhost:8080> (or whichever `HOST_PORT` you chose).

The docs folder is mounted read-only, so edits to the files show up on the next page load
without a restart. The sidebar is re-scanned at most every `TREE_CACHE_MS` milliseconds.

### Everyday commands

```bash
docker compose logs -f          # follow the server log
docker compose up -d            # apply changes made to .env (recreates the container)
docker compose up -d --build    # rebuild after pulling new code
docker compose down             # stop and remove the container
```

### Troubleshooting

- **`Bind for 0.0.0.0:8080 failed: port is already allocated`**: another program uses that
  port. Set a different `HOST_PORT` in `.env` and run `docker compose up -d` again.
- **Empty sidebar / "No Markdown files found"**: check `DOCS_DIR` points at the right folder
  (`docker compose exec md-server ls /docs` shows what the container sees).
- **500 errors with `EACCES` in the log**: the files must be readable by the container user
  (uid 1000), e.g. `chmod -R a+rX /path/to/docs`.

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
