# Internals

Every request path maps 1:1 onto the docs folder:

1. Folders show a listing plus their `README.md` / `index.md`.
2. Markdown files are rendered to HTML. Add `?raw` to get the source.
3. Anything else (images, PDFs, …) is sent as-is.
