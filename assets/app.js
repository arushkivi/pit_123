/* Simple SPA to browse folders and view PDFs using PDF.js viewer */
const state = {
  tree: null,
  index: [], // flat list for search
  view: (typeof localStorage !== 'undefined' && localStorage.getItem('pdf_view_mode')) || 'grid', // 'grid' | 'list'
  currentPath: '.',
};

const els = {
  tree: () => document.getElementById('tree'),
  content: () => document.getElementById('content'),
  breadcrumbs: () => document.getElementById('breadcrumbs'),
  search: () => document.getElementById('search'),
};

function createEl(tag, className, children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (children !== undefined) {
    if (Array.isArray(children)) children.forEach(c => el.appendChild(c));
    else if (children instanceof Node) el.appendChild(children);
    else el.textContent = children;
  }
  return el;
}

function buildIndex(node, parentPath = []) {
  if (node.type === 'folder') {
    const path = [...parentPath, node.name === 'root' ? '' : node.name].filter(Boolean);
    state.index.push({ type: 'folder', name: node.name, path: node.path, tokens: (node.name || '').toLowerCase() });
    (node.children || []).forEach(ch => buildIndex(ch, path));
  } else {
    state.index.push({ type: 'pdf', name: node.name, path: node.path, tokens: (node.name || '').toLowerCase() });
  }
}

function renderTree(node, level = 0) {
  const container = createEl('div');
  if (node.type !== 'folder') return container;
  const isRoot = node.path === '.' || node.name === 'root';
  const ul = createEl('ul', level === 0 ? 'space-y-1' : 'ml-4 space-y-1');

  (node.children || []).forEach(ch => {
    if (ch.type === 'folder') {
      const li = createEl('li');
      const btn = createEl('button', 'group w-full flex items-center justify-between gap-2 px-3 py-2 rounded transition-transform hover:scale-[1.02] hover:bg-slate-100 dark:hover:bg-slate-800');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate('#/folder/' + encodeURIComponent(ch.path));
      });
      const toggle = createEl('span', 'folder-toggle text-slate-500 transition-transform', '▶');
      toggle.setAttribute('aria-expanded', 'false');
      const name = createEl('span', 'font-medium truncate', ch.name);
      const leftWrap = createEl('div', 'flex items-center gap-2 min-w-0');
      leftWrap.append(toggle, name);
      const rightIcon = createEl('span', 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors', '↗');
      btn.append(leftWrap, rightIcon);

      const sub = renderTree(ch, level + 1);
      sub.style.display = 'none';

      // Expand/collapse only when clicking the caret, not the whole row
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = sub.style.display !== 'none';
        sub.style.display = expanded ? 'none' : '';
        toggle.setAttribute('aria-expanded', String(!expanded));
      });

      li.append(btn, sub);
      ul.append(li);
    } else if (ch.type === 'pdf') {
      const li = createEl('li');
      const a = createEl('a', 'group w-full flex items-center justify-between gap-2 px-3 py-2 rounded transition-transform hover:scale-[1.02] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200');
      a.href = '#/view/' + encodeURIComponent(ch.path);
      const left = createEl('div', 'flex items-center gap-2 min-w-0');
      const icon = createEl('span', 'text-slate-500', '📄');
      const name = createEl('span', 'truncate', ch.name);
      left.append(icon, name);
      const right = createEl('span', 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors', '↗');
      a.append(left, right);
      li.append(a);
      ul.append(li);
    }
  });

  container.append(ul);
  if (isRoot) {
    // expand first level by default
    [...ul.children].forEach(li => {
      const btn = li.querySelector('button');
      const sub = li.querySelector('div > ul, ul');
      const toggle = li.querySelector('.folder-toggle');
      if (btn && sub && toggle) {
        sub.style.display = '';
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  }
  return container;
}

function setBreadcrumb(parts) {
  const frag = [];
  frag.push(link('Home', '#/'));
  for (let i = 0; i < parts.length; i++) {
    frag.push(' / ');
    const [label, href] = parts[i];
    frag.push(link(label, href));
  }
  const bc = els.breadcrumbs();
  bc.innerHTML = '';
  frag.forEach(node => bc.append(node instanceof Node ? node : document.createTextNode(node)));
}

function link(text, href) {
  const a = createEl('a', 'text-blue-600 dark:text-blue-400 hover:underline');
  a.textContent = text;
  a.href = href;
  return a;
}

function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderFolder(path) {
  state.currentPath = path || '.';
  const node = findNodeByPath(state.tree, path || '.');
  if (!node) return renderNotFound();
  setBreadcrumb(buildBreadcrumb(path));

  const content = els.content();
  content.innerHTML = '';

  const container = createEl('div', 'max-w-5xl mx-auto');

  const title = createEl('h2', 'text-2xl md:text-3xl font-semibold mb-6 flex items-center gap-2 justify-center text-center');
  title.append('📁 ', node.name === 'root' ? 'All PDFs' : node.name);

  const grid = state.view === 'grid'
    ? createEl('div', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5')
    : createEl('div', 'divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 overflow-hidden');

  const subfolders = (node.children || []).filter(c => c.type === 'folder');
  const pdfs = (node.children || []).filter(c => c.type === 'pdf');

  // Subfolders first
  subfolders.forEach(f => {
    if (state.view === 'grid') {
      // Make the entire folder card clickable with a gentle scale on hover
      const card = createEl('a', 'block rounded-2xl border border-slate-200 dark:border-slate-800 p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur text-center transition transform hover:scale-[1.05] hover:shadow-lg active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-500', []);
      card.href = '#/folder/' + encodeURIComponent(f.path);
      const icon = createEl('div', 'text-6xl mb-3', '📂');
      const name = createEl('div', 'font-medium mb-1 truncate');
      name.textContent = f.name;
      const hint = createEl('div', 'text-sm text-slate-500 dark:text-slate-400', 'Open Folder');
      card.append(icon, name, hint);
      grid.append(card);
    } else {
      // Entire row is clickable; add subtle scale on hover
      const row = createEl('a', 'flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-xl transition-transform hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500', []);
      row.href = '#/folder/' + encodeURIComponent(f.path);
      const icon = createEl('div', 'text-3xl', '📂');
      const name = createEl('div', 'font-medium truncate');
      name.textContent = f.name;
      row.append(icon, name);
      grid.append(row);
    }
  });

  // PDFs
  pdfs.forEach(p => {
    if (state.view === 'grid') {
      const card = createEl('div', 'rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-sm bg-white dark:bg-slate-800 flex flex-col text-center');
      const icon = createEl('div', 'text-3xl mb-2', '📄');
      const name = createEl('div', 'font-medium mb-1 truncate');
      name.textContent = p.name;

      const size = createEl('div', 'text-xs text-slate-500 dark:text-slate-400 mb-4');
      size.textContent = humanSize(p.size);

      const actions = createEl('div', 'mt-auto flex items-center justify-center gap-2');
      const view = createEl('a', 'px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700', 'View');
      view.href = '#/view/' + encodeURIComponent(p.path);
      const dl = createEl('a', 'px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-sm hover:bg-slate-300 dark:hover:bg-slate-600', 'Download');
      dl.href = p.path;
      dl.setAttribute('download', p.name);
      actions.append(view, dl);

      card.append(icon, name, size, actions);
      grid.append(card);
    } else {
      const row = createEl('div', 'flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50');
      const left = createEl('a', 'flex items-center gap-3 min-w-0 flex-1', []);
      left.href = '#/view/' + encodeURIComponent(p.path);
      const icon = createEl('div', 'text-2xl', '📄');
      const name = createEl('div', 'truncate');
      name.textContent = p.name;
      left.append(icon, name);
      const right = createEl('div', 'ml-3 flex items-center gap-3');
      const size = createEl('div', 'text-xs text-slate-500 dark:text-slate-400');
      size.textContent = humanSize(p.size);
      const dl = createEl('a', 'px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-xs hover:bg-slate-300 dark:hover:bg-slate-600', 'Download');
      dl.href = p.path;
      dl.setAttribute('download', p.name);
      right.append(size, dl);
      row.append(left, right);
      grid.append(row);
    }
  });

  if (subfolders.length === 0 && pdfs.length === 0) {
    const empty = createEl('div', 'text-center text-slate-500 dark:text-slate-400 py-16');
    empty.textContent = 'No PDFs here yet. Folders will appear as they are added.';
    container.append(title, empty);
  } else {
    container.append(title, grid);
  }
  content.append(container);
}

function openPdfModal(node) {
  const modal = document.getElementById('pdfModal');
  const frame = document.getElementById('pdfModalFrame');
  const title = document.getElementById('pdfModalTitle');
  const dl = document.getElementById('pdfModalDownload');
  title.textContent = node.name;
  dl.href = node.path;
  dl.setAttribute('download', node.name);
  frame.src = node.path;
  modal.classList.remove('hidden');

  // ESC to close
  function onKey(e) { if (e.key === 'Escape') { closePdfModal(); } }
  document.addEventListener('keydown', onKey, { once: true });
}

function closePdfModal() {
  const modal = document.getElementById('pdfModal');
  const frame = document.getElementById('pdfModalFrame');
  modal.classList.add('hidden');
  // Clear src to release memory on mobile
  frame.src = '';
  // Navigate back to previous state if hash is a view
  if ((location.hash || '').startsWith('#/view/')) {
    // try history back, fall back to root
    if (history.length > 1) history.back(); else location.hash = '#/';
  }
}

function renderPdf(path) {
  const node = findNodeByPath(state.tree, path);
  if (!node) return renderNotFound();
  // Open in modal over current content
  openPdfModal(node);
}

function renderNotFound() {
  const content = els.content();
  content.innerHTML = '';
  content.append(
    createEl('div', 'p-8 text-center text-slate-500', 'Not found')
  );
}

function buildBreadcrumb(path) {
  if (!path || path === '.') return [];
  const parts = decodeURIComponent(path).split('/');
  const crumbs = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts.slice(0, i + 1).join('/') || '.';
    const label = parts[i] || 'root';
    crumbs.push([label, '#/folder/' + encodeURIComponent(p)]);
  }
  return crumbs;
}

function findNodeByPath(node, path) {
  if (!node) return null;
  if (node.path === path) return node;
  if (node.type === 'folder') {
    for (const ch of node.children || []) {
      const found = findNodeByPath(ch, path);
      if (found) return found;
    }
  }
  return null;
}

function route() {
  const hash = location.hash || '#/';
  const [, action, rawPath] = hash.split('/');
  const path = rawPath ? decodeURIComponent(rawPath) : '.';
  if (!action) {
    setBreadcrumb([]);
    renderFolder('.');
  } else if (action === 'folder') {
    renderFolder(path);
  } else if (action === 'view') {
    renderPdf(path);
  } else {
    renderNotFound();
  }
}

function onSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  const content = els.content();
  if (!q) {
    route();
    return;
  }
  const results = state.index.filter(item => item.tokens.includes(q) || item.name.toLowerCase().includes(q));
  setBreadcrumb([[`Search: ${q}`, '#/']]);
  content.innerHTML = '';
  const title = createEl('h2', 'text-xl font-semibold mb-4', `Search results for "${q}"`);
  const list = createEl('div', 'space-y-2');
  results.slice(0, 200).forEach(r => {
    const row = createEl('div', 'flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 p-3');
    const left = createEl('div');
    const name = createEl('div', 'font-medium');
    name.textContent = (r.type === 'pdf' ? '📄 ' : '📂 ') + r.name;
    const path = createEl('div', 'text-xs text-slate-500');
    path.textContent = r.path;
    left.append(name, path);
    const right = createEl('div');
    const open = createEl('a', 'text-sm px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700');
    open.textContent = 'Open';
    open.href = (r.type === 'pdf' ? '#/view/' : '#/folder/') + encodeURIComponent(r.path);
    right.append(open);
    row.append(left, right);
    list.append(row);
  });
  content.append(title, list);
}

function setupMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  const openBtn = document.getElementById('openSidebar');
  const closeBtn = document.getElementById('closeSidebar');

  function open() {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    // Focus search for quick access
    setTimeout(() => els.search().focus(), 50);
  }
  function close() {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  }
  openBtn?.addEventListener('click', open);
  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  // Close sidebar on navigation
  window.addEventListener('hashchange', close);
}

function updateToggleButton() {
  const btn = document.getElementById('toggleView');
  if (!btn) return;
  const isList = state.view === 'list';
  btn.textContent = isList ? 'Grid View' : 'List View';
  btn.setAttribute('aria-pressed', String(isList));
}

async function init() {
  try {
    const res = await fetch('assets/data.json', { cache: 'no-store' });
    const data = await res.json();
    state.tree = data.tree;
    buildIndex(state.tree);
    els.tree().appendChild(renderTree(state.tree));
    window.addEventListener('hashchange', route);
    els.search().addEventListener('input', onSearch);

    // Modal events
    document.getElementById('pdfModalBackdrop').addEventListener('click', closePdfModal);
    document.getElementById('pdfModalClose').addEventListener('click', closePdfModal);

    // View toggle
    const toggle = document.getElementById('toggleView');
    if (toggle) {
      updateToggleButton();
      toggle.addEventListener('click', () => {
        state.view = state.view === 'grid' ? 'list' : 'grid';
        try { localStorage.setItem('pdf_view_mode', state.view); } catch {}
        updateToggleButton();
        // Re-render current folder without changing route
        renderFolder(state.currentPath);
      });
    }

    setupMobileSidebar();
    route();
  } catch (e) {
    console.error(e);
    els.content().textContent = 'Failed to load data.json. Run build_pdf_index.py to generate it.';
  }
}

init();
