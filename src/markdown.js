import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';

const FRONT_MATTER = /^﻿?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const TASK_MARKER = /^\[([ xX])\][  ]/;

/** GitHub-style task lists: "- [ ] todo" / "- [x] done" become disabled checkboxes. */
function taskLists(state) {
  const { tokens } = state;
  for (let i = 2; i < tokens.length; i += 1) {
    const inline = tokens[i];
    const item = tokens[i - 2];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || item.type !== 'list_item_open') continue;

    const first = inline.children?.[0];
    const match = first?.type === 'text' && TASK_MARKER.exec(first.content);
    if (!match) continue;

    first.content = first.content.slice(match[0].length);
    const checkbox = new state.Token('html_inline', '', 0);
    checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${match[1] === ' ' ? '' : ' checked'}> `;
    inline.children.unshift(checkbox);
    item.attrJoin('class', 'task-list-item');

    for (let j = i - 3; j >= 0; j -= 1) {
      if (tokens[j].level === item.level - 1 && tokens[j].type.endsWith('_list_open')) {
        if (!(tokens[j].attrGet('class') || '').includes('contains-task-list')) tokens[j].attrJoin('class', 'contains-task-list');
        break;
      }
    }
  }
}

export function createMarkdownRenderer({ allowHtml = false } = {}) {
  const md = new MarkdownIt({
    html: allowHtml,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      const language = (lang || '').trim().toLowerCase();
      if (language && hljs.getLanguage(language)) {
        try {
          const { value } = hljs.highlight(code, { language, ignoreIllegals: true });
          return `<pre><code class="hljs language-${md.utils.escapeHtml(language)}">${value}</code></pre>`;
        } catch {
          // fall through to markdown-it's default escaping
        }
      }
      return '';
    },
  });

  md.core.ruler.push('task_lists', taskLists);

  md.use(anchor, {
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'before',
      class: 'header-anchor',
      ariaHidden: true,
    }),
  });

  /**
   * Renders Markdown source to HTML.
   * Returns the HTML and the text of the first H1 (used as the page title).
   */
  return function render(source) {
    const body = source.replace(FRONT_MATTER, '');
    const env = {};
    const tokens = md.parse(body, env);

    let title = null;
    const h1 = tokens.findIndex((t) => t.type === 'heading_open' && t.tag === 'h1');
    if (h1 !== -1) {
      title = tokens[h1 + 1]?.children
        ?.filter((t) => t.type === 'text' || t.type === 'code_inline')
        .map((t) => t.content)
        .join('')
        .trim() || null;
    }

    return { html: md.renderer.render(tokens, md.options, env), title };
  };
}
