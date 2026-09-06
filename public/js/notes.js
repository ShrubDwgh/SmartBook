import { api } from './api.js';
import { escapeHtml, truncate, formatDate, debounce, navigateTo, confirmAction, showToast } from './utils.js';
import { emptyState } from './dashboard.js';

export async function renderNotes(container, initialQuery = {}) {
  const [{ projects }, categoriesRes] = await Promise.all([
    api.get('/api/projects'),
    api.get('/api/categories'),
  ]);
  const categories = categoriesRes.categories;

  container.innerHTML = `
    <div class="page-header">
      <h1>Notes</h1>
      <a href="#/notes/new" class="btn-primary">+ Catatan baru</a>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
      <select id="filterProject" style="max-width:220px;">
        <option value="">Semua proyek</option>
        ${projects.map((p) => `<option value="${p.id}" ${initialQuery.project === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <select id="filterCategory" style="max-width:180px;">
        <option value="">Semua kategori</option>
        ${categories.map((c) => `<option value="${escapeHtml(c)}" ${initialQuery.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <input type="text" id="filterSearch" placeholder="Cari judul, isi, atau tag…" style="max-width:240px;" value="${escapeHtml(initialQuery.search || '')}" />
    </div>
    <ul class="note-list" id="noteListWrap"><li class="loading">Memuat…</li></ul>
  `;

  async function loadNotes() {
    const projectId = document.getElementById('filterProject').value;
    const category = document.getElementById('filterCategory').value;
    const search = document.getElementById('filterSearch').value;
    const wrap = document.getElementById('noteListWrap');
    try {
      const { notes } = await api.get('/api/notes', { projectId, category, search });
      wrap.innerHTML = notes.length
        ? notes.map(noteRow).join('')
        : `<li>${emptyState('Tidak ada catatan yang cocok.', 'Buat catatan baru', 'notes/new')}</li>`;
    } catch (err) {
      wrap.innerHTML = `<li class="muted">Gagal memuat catatan.</li>`;
    }
  }

  container.oninput = debounce(loadNotes, 300);
  container.onchange = loadNotes;

  await loadNotes();
}

function noteRow(n) {
  const tagChips = (n.tags || []).map((t) => `<span class="chip chip-tag">#${escapeHtml(t)}</span>`).join('');
  return `
    <li>
      <a href="#/notes/${n.id}">
        <span class="note-title">${escapeHtml(n.title)}</span>
        <span class="note-snippet">${escapeHtml(truncate(n.content, 120))}</span>
        <span class="meta-row">
          <span class="chip">${escapeHtml(n.category)}</span>
          <span>${escapeHtml(n.projectName || 'Tanpa proyek')}</span>
          ${tagChips}
          <span>${formatDate(n.updatedAt)}</span>
        </span>
      </a>
    </li>
  `;
}

export async function renderNoteForm(container, noteId = null, presetQuery = {}) {
  const [{ projects }, categoriesRes] = await Promise.all([
    api.get('/api/projects'),
    api.get('/api/categories'),
  ]);
  const categories = categoriesRes.categories;

  if (!projects.length) {
    container.innerHTML = `
      <div class="page-header"><h1>${noteId ? 'Ubah catatan' : 'Catatan baru'}</h1></div>
      ${emptyState('Anda perlu membuat proyek terlebih dahulu sebelum menambah catatan.', 'Buat proyek baru', 'projects/new')}
    `;
    return;
  }

  let note = {
    title: '',
    content: '',
    projectId: presetQuery.project || projects[0].id,
    category: categories[0] || '',
    tags: [],
    isTask: false,
  };
  if (noteId) {
    const res = await api.get(`/api/notes/${noteId}`);
    note = res.note;
  }

  container.innerHTML = `
    <div class="page-header"><h1>${noteId ? 'Ubah catatan' : 'Catatan baru'}</h1></div>
    <form id="noteForm" style="max-width:620px;">
      <div class="field">
        <label for="nProject">Proyek</label>
        <select id="nProject" required>
          ${projects.map((p) => `<option value="${p.id}" ${note.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="nTitle">Judul</label>
        <input id="nTitle" type="text" required value="${escapeHtml(note.title)}" />
      </div>
      <div class="field">
        <label for="nContent">Isi</label>
        <textarea id="nContent" rows="8" required>${escapeHtml(note.content)}</textarea>
      </div>
      <div class="field">
        <label for="nCategory">Kategori</label>
        <select id="nCategory">
          ${categories.map((c) => `<option value="${escapeHtml(c)}" ${note.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="nTags">Tag (opsional, pisahkan dengan koma)</label>
        <input id="nTags" type="text" value="${escapeHtml((note.tags || []).join(', '))}" />
      </div>
      <div class="checkbox-row" style="margin-bottom:24px;">
        <input type="checkbox" id="nIsTask" ${note.isTask ? 'checked' : ''} />
        <label for="nIsTask">Tandai sebagai tugas (ikut muncul di checklist proyek)</label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Simpan</button>
        <a href="#/notes" class="btn-secondary">Batal</a>
        ${noteId ? '<button type="button" class="btn-danger" data-action="delete-note" style="margin-left:auto;">Hapus</button>' : ''}
      </div>
    </form>
  `;

  container.onsubmit = async (e) => {
    if (e.target.id !== 'noteForm') return;
    e.preventDefault();
    const payload = {
      projectId: document.getElementById('nProject').value,
      title: document.getElementById('nTitle').value.trim(),
      content: document.getElementById('nContent').value.trim(),
      category: document.getElementById('nCategory').value,
      tags: document
        .getElementById('nTags')
        .value.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isTask: document.getElementById('nIsTask').checked,
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (noteId) {
        await api.put(`/api/notes/${noteId}`, payload);
        showToast('Catatan diperbarui.', 'success');
      } else {
        await api.post('/api/notes', payload);
        showToast('Catatan dibuat.', 'success');
      }
      navigateTo('notes');
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
    }
  };

  container.onclick = async (e) => {
    if (e.target.closest('[data-action="delete-note"]')) {
      if (!confirmAction('Hapus catatan ini?')) return;
      await api.del(`/api/notes/${noteId}`);
      showToast('Catatan dihapus.', 'success');
      navigateTo('notes');
    }
  };
}
