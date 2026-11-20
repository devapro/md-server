(() => {
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  const filter = document.querySelector('.tree-filter');
  const tree = document.querySelector('.tree');

  // ----- mobile sidebar toggle -----
  toggle?.addEventListener('click', () => {
    const open = body.classList.toggle('sidebar-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!body.classList.contains('sidebar-open')) return;
    if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
    body.classList.remove('sidebar-open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  // ----- keep the current page visible in a long tree -----
  tree?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });

  // ----- filter the tree by name -----
  if (!filter || !tree) return;
  const details = [...tree.querySelectorAll('details')];
  const initiallyOpen = new Map(details.map((d) => [d, d.open]));

  // Returns true when this <li> (or anything below it) matches the query.
  const applyFilter = (li, query) => {
    const label = li.querySelector(':scope > a, :scope > details > summary')?.textContent.toLowerCase() ?? '';
    const selfMatch = label.includes(query);
    let childMatch = false;
    li.querySelectorAll(':scope > details > ul > li').forEach((child) => {
      // A matching folder shows all its contents.
      if (applyFilter(child, selfMatch ? '' : query)) childMatch = true;
    });
    const visible = selfMatch || childMatch;
    li.classList.toggle('hidden', !visible);
    const d = li.querySelector(':scope > details');
    if (d && query) d.open = childMatch;
    return visible;
  };

  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    tree.querySelectorAll(':scope > ul > li').forEach((li) => applyFilter(li, query));
    if (!query) details.forEach((d) => { d.open = initiallyOpen.get(d); });
  });

  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      filter.value = '';
      filter.dispatchEvent(new Event('input'));
    }
  });
})();
