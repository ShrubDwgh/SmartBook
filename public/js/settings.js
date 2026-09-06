import { api } from './api.js';
import { escapeHtml, showToast, confirmAction } from './utils.js';
import { auth } from './firebase-init.js';

const EDIT_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M4 16l.7-3L13 4.7a1.5 1.5 0 0 1 2.1 0l.2.2a1.5 1.5 0 0 1 0 2.1L7 15.3z"/></svg>';

export async function renderSettings(container) {
  await paint(container);
}

async function paint(container) {
  const { categories } = await api.get('/api/categories');
  const email = auth.currentUser ? auth.currentUser.email : '';

  container.innerHTML = `
    <div class="page-header"><h1>Settings</h1></div>

    <section class="settings-section">
      <h2>Akun</h2>
      <p class="muted">Masuk sebagai <strong>${escapeHtml(email)}</strong></p>
    </section>

    <section class="settings-section">
      <h2>Kategori catatan</h2>
      <p class="muted">Tambah, ubah nama, atau hapus kategori. Kategori "Lainnya" tidak bisa dihapus karena dipakai sebagai kategori cadangan saat kategori lain dihapus.</p>
      <div class="category-list">${categories.map(categoryPill).join('')}</div>
      <form id="addCategoryForm" style="display:flex;gap:8px;max-width:360px;">
        <input type="text" id="newCategoryName" placeholder="Nama kategori baru" required />
        <button type="submit" class="btn-secondary">Tambah</button>
      </form>
    </section>

    <section class="settings-section">
      <h2>Backup</h2>
      <p class="muted">Unduh salinan seluruh proyek, catatan, dan checklist Anda sebagai satu file JSON. Isi Secrets Vault sengaja tidak disertakan demi keamanan.</p>
      <button type="button" class="btn-secondary" id="downloadBackupBtn">Unduh backup (.json)</button>
    </section>
  `;

  container.onclick = async (e) => {
    if (e.target.closest('#downloadBackupBtn')) {
      await downloadBackup();
      return;
    }

    const renameBtn = e.target.closest('[data-rename-category]');
    if (renameBtn) {
      const oldName = renameBtn.dataset.renameCategory;
      const newName = window.prompt('Nama baru untuk kategori:', oldName);
      if (!newName || !newName.trim() || newName.trim() === oldName) return;
      try {
        await api.post('/api/categories', { action: 'rename', name: oldName, newName: newName.trim() });
        showToast('Kategori diperbarui.', 'success');
        await paint(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    const delBtn = e.target.closest('[data-delete-category]');
    if (delBtn) {
      const name = delBtn.dataset.deleteCategory;
      if (!confirmAction(`Hapus kategori "${name}"? Catatan yang memakainya akan dipindah ke "Lainnya".`)) return;
      try {
        await api.post('/api/categories', { action: 'delete', name });
        showToast('Kategori dihapus.', 'success');
        await paint(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  };

  container.onsubmit = async (e) => {
    if (e.target.id !== 'addCategoryForm') return;
    e.preventDefault();
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    if (!name) return;
    try {
      await api.post('/api/categories', { action: 'add', name });
      showToast('Kategori ditambahkan.', 'success');
      await paint(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

function categoryPill(name) {
  const locked = name === 'Lainnya';
  return `
    <span class="category-pill ${locked ? 'locked' : ''}">
      ${escapeHtml(name)}
      ${!locked ? `<button type="button" data-rename-category="${escapeHtml(name)}" aria-label="Ubah nama" title="Ubah nama">${EDIT_ICON}</button>` : ''}
      ${!locked ? `<button type="button" data-delete-category="${escapeHtml(name)}" aria-label="Hapus" title="Hapus">×</button>` : ''}
    </span>
  `;
}

async function downloadBackup() {
  try {
    const data = await api.get('/api/backup/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `smartbook-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Backup diunduh.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
