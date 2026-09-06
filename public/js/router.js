import { api } from './api.js';
import { escapeHtml, debounce, navigateTo } from './utils.js';
import { renderDashboard } from './dashboard.js';
import { renderProjects, renderProjectForm, renderProjectDetail } from './projects.js';
import { renderNotes, renderNoteForm } from './notes.js';
import { renderSecretary } from './secretary.js';
import { renderSecrets } from './secrets.js';
import { renderSettings } from './settings.js';

const mainContent = document.getElementById('mainContent');
const navLinks = document.querySelectorAll('[data-route]');
const sideNav = document.getElementById('sideNav');
const navOverlay = document.querySelector('.nav-overlay');
const menuToggle = document.getElementById('menuToggle');
const globalSearch = document.getElementById('globalSearch');
const searchResults = document.getElementById('searchResults');
const addBtn = document.getElementById('addBtn');
const addMenu = document.getElementById('addMenu');

function parseHash() {
  const raw = (window.location.hash || '#/dashboard').slice(1);
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.replace(/^\//, '').split('/').filter(Boolean);
  const route = segments[0] || 'dashboard';
  const params = segments.slice(1);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { route, params, query };
}

const routes = {
  dashboard: () => renderDashboard(mainContent),
  projects: (params, query) => {
    if (params[0] === 'new') return renderProjectForm(mainContent);
    if (params[0] && params[1] === 'edit') return renderProjectForm(mainContent, params[0]);
    if (params[0]) return renderProjectDetail(mainContent, params[0]);
    return renderProjects(mainContent);
  },
  notes: (params, query) => {
    if (params[0] === 'new') return renderNoteForm(mainContent, null, query);
    if (params[0]) return renderNoteForm(mainContent, params[0], query);
    return renderNotes(mainContent, query);
  },
  secretary: () => renderSecretary(mainContent),
  secrets: () => renderSecrets(mainContent),
  settings: () => renderSettings(mainContent),
};

function updateActiveNav(route) {
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.route === route));
}

async function render() {
  const { route, params, query } = parseHash();
  updateActiveNav(route);
  sideNav.classList.remove('open');
  closeAddMenu();
  hideSearchResults();

  const handler = routes[route] || routes.dashboard;
  mainContent.innerHTML = '<div class="loading">Memuat…</div>';
  window.scrollTo(0, 0);

  try {
    await handler(params, query);
  } catch (err) {
    console.error(err);
    mainContent.innerHTML = `
      <div class="empty-state">
        <p>Gagal memuat halaman ini. ${escapeHtml(err.message || '')}</p>
        <button class="btn-secondary" onclick="location.reload()">Muat ulang</button>
      </div>`;
  }
}

window.addEventListener('hashchange', render);
document.addEventListener('smartbook:auth-ready', render);

// ---- Sidebar (mobile) ----
menuToggle.addEventListener('click', () => sideNav.classList.toggle('open'));
navOverlay.addEventListener('click', () => sideNav.classList.remove('open'));

// ---- Tombol "+ Tambah" ----
function closeAddMenu() {
  addMenu.classList.add('hidden');
}
addBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  addMenu.classList.toggle('hidden');
});
document.addEventListener('click', () => closeAddMenu());

// ---- Pencarian global ----
function hideSearchResults() {
  searchResults.classList.add('hidden');
  searchResults.innerHTML = '';
}

function renderSearchResults(notes) {
  if (!notes.length) {
    searchResults.innerHTML = '<div class="search-empty">Tidak ada catatan yang cocok.</div>';
  } else {
    searchResults.innerHTML = notes
      .slice(0, 8)
      .map(
        (n) => `
        <a class="search-result-item" href="#/notes/${n.id}">
          <span class="search-result-title">${escapeHtml(n.title)}</span>
          <span class="meta-row">
            <span class="chip">${escapeHtml(n.category)}</span>
            <span>${escapeHtml(n.projectName || 'Tanpa proyek')}</span>
          </span>
        </a>`
      )
      .join('');
  }
  searchResults.classList.remove('hidden');
}

const runSearch = debounce(async (value) => {
  if (!value || value.trim().length < 2) {
    hideSearchResults();
    return;
  }
  try {
    const { notes } = await api.get('/api/notes', { search: value.trim() });
    renderSearchResults(notes);
  } catch (err) {
    hideSearchResults();
  }
}, 300);

globalSearch.addEventListener('input', (e) => runSearch(e.target.value));
globalSearch.addEventListener('focus', (e) => {
  if (e.target.value.trim().length >= 2) runSearch(e.target.value);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSearchResults();
});
searchResults.addEventListener('click', () => hideSearchResults());
