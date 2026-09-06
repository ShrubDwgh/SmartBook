import { api } from './api.js';
import { escapeHtml, confirmAction, showToast } from './utils.js';
import { reauthenticate } from './auth.js';

// Nilai yang sudah di-reveal hanya disimpan di memori tab ini (tidak pernah di localStorage),
// dan direset setiap kali halaman Secrets dibuka ulang supaya tidak "nyangkut" kebuka.
let revealedCache = {};

const ICONS = {
  copy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="16" height="16"><rect x="7" y="7" width="9" height="9" rx="1.2"/><path d="M4.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5"/></svg>',
  hide: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" width="16" height="16"><path d="M3 3l14 14M9 9.5a1.8 1.8 0 0 0 2.5 2.5M6.2 6.5C4.3 7.7 3 10 3 10s2.8 5 7 5c1.2 0 2.3-.3 3.3-.9M12.3 5.3C11.6 5.1 10.8 5 10 5c-.6 0-1.2.06-1.7.17M17 10s-.7 1.3-2 2.6"/></svg>',
  edit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 16l.7-3L13 4.7a1.5 1.5 0 0 1 2.1 0l.2.2a1.5 1.5 0 0 1 0 2.1L7 15.3z"/><path d="M11.5 6.2l2.3 2.3"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" width="16" height="16"><path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6 6l.6 9.4a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L14 6"/></svg>',
};

export async function renderSecrets(container) {
  revealedCache = {};
  await paint(container);
}

async function paint(container) {
  const { secrets } = await api.get('/api/secrets');

  container.innerHTML = `
    <div class="page-header">
      <h1>Secrets</h1>
      <button type="button" class="btn-primary" id="openAddSecret">+ Tambah secret</button>
    </div>
    <div class="secrets-warning">
      <span>Tersimpan terenkripsi dan terpisah dari catatan biasa. AI Secretary tidak pernah bisa membacanya.</span>
    </div>
    ${secrets.length ? `<ul class="secret-list">${secrets.map(secretRow).join('')}</ul>` : '<div class="empty-state"><p>Belum ada secret tersimpan.</p></div>'}
  `;

  container.onclick = async (e) => {
    if (e.target.closest('#openAddSecret')) {
      openSecretModal(container, null);
      return;
    }

    const revealBtn = e.target.closest('[data-reveal]');
    if (revealBtn) {
      await handleReveal(container, revealBtn.dataset.reveal);
      return;
    }

    const hideBtn = e.target.closest('[data-hide]');
    if (hideBtn) {
      delete revealedCache[hideBtn.dataset.hide];
      await paint(container);
      return;
    }

    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const value = revealedCache[copyBtn.dataset.copy];
      if (value) navigator.clipboard.writeText(value).then(() => showToast('Disalin ke clipboard.', 'success'));
      return;
    }

    const editBtn = e.target.closest('[data-edit-secret]');
    if (editBtn) {
      const found = secrets.find((s) => s.id === editBtn.dataset.editSecret);
      openSecretModal(container, found);
      return;
    }

    const delBtn = e.target.closest('[data-delete-secret]');
    if (delBtn) {
      if (!confirmAction('Hapus secret ini? Tindakan ini tidak bisa dibatalkan.')) return;
      const id = delBtn.dataset.deleteSecret;
      await api.del(`/api/secrets/${id}`);
      delete revealedCache[id];
      showToast('Secret dihapus.', 'success');
      await paint(container);
    }
  };
}

function secretRow(s) {
  const revealed = revealedCache[s.id];
  return `
    <li class="secret-list-item">
      <div class="secret-info">
        <span class="secret-label">${escapeHtml(s.label)}</span>
        <span class="badge badge-secret">${typeLabel(s.type)}</span>
        ${
          revealed
            ? `<div class="secret-value-row">
                <span class="secret-value-box">${escapeHtml(revealed)}</span>
                <button type="button" class="btn-icon" data-copy="${s.id}" aria-label="Salin">${ICONS.copy}</button>
                <button type="button" class="btn-icon" data-hide="${s.id}" aria-label="Sembunyikan">${ICONS.hide}</button>
              </div>`
            : ''
        }
      </div>
      <div class="secret-actions">
        ${!revealed ? `<button type="button" class="btn-secondary" data-reveal="${s.id}">Lihat</button>` : ''}
        <button type="button" class="btn-icon" data-edit-secret="${s.id}" aria-label="Ubah">${ICONS.edit}</button>
        <button type="button" class="btn-icon" data-delete-secret="${s.id}" aria-label="Hapus">${ICONS.trash}</button>
      </div>
    </li>
  `;
}

function typeLabel(type) {
  const map = { password: 'Password', api_key: 'API Key', token: 'Token', other: 'Lainnya' };
  return map[type] || 'Lainnya';
}

async function handleReveal(container, id) {
  try {
    const { secret } = await api.post(`/api/secrets/${id}`);
    revealedCache[id] = secret.value;
    await paint(container);
  } catch (err) {
    if (err.code === 'reauth_required') {
      openReauthModal(async (password) => {
        try {
          await reauthenticate(password);
          await handleReveal(container, id);
        } catch (e) {
          showToast('Kata sandi salah atau gagal konfirmasi ulang.', 'error');
        }
      });
    } else {
      showToast(err.message, 'error');
    }
  }
}

function openSecretModal(container, existing) {
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="secretModalBackdrop">
      <div class="modal-card">
        <h2>${existing ? 'Ubah secret' : 'Tambah secret'}</h2>
        <form id="secretForm">
          <div class="field">
            <label for="sLabel">Nama/label</label>
            <input id="sLabel" type="text" required value="${existing ? escapeHtml(existing.label) : ''}" placeholder="mis. OpenAI API Key" />
          </div>
          <div class="field">
            <label for="sType">Jenis</label>
            <select id="sType">
              <option value="password" ${existing && existing.type === 'password' ? 'selected' : ''}>Password</option>
              <option value="api_key" ${!existing || existing.type === 'api_key' ? 'selected' : ''}>API Key</option>
              <option value="token" ${existing && existing.type === 'token' ? 'selected' : ''}>Token</option>
              <option value="other" ${existing && existing.type === 'other' ? 'selected' : ''}>Lainnya</option>
            </select>
          </div>
          <div class="field">
            <label for="sValue">Nilai${existing ? ' (kosongkan jika tidak diubah)' : ''}</label>
            <input id="sValue" type="text" ${existing ? '' : 'required'} placeholder="Isi password/API key/token" autocomplete="off" />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Simpan</button>
            <button type="button" class="btn-secondary" id="closeSecretModal">Batal</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const backdrop = document.getElementById('secretModalBackdrop');
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) modalRoot.innerHTML = '';
  });
  document.getElementById('closeSecretModal').addEventListener('click', () => {
    modalRoot.innerHTML = '';
  });
  document.getElementById('secretForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('sLabel').value.trim();
    const type = document.getElementById('sType').value;
    const value = document.getElementById('sValue').value;
    try {
      if (existing) {
        await api.put(`/api/secrets/${existing.id}`, { label, type, value: value || undefined });
      } else {
        await api.post('/api/secrets', { label, type, value });
      }
      modalRoot.innerHTML = '';
      showToast('Secret disimpan.', 'success');
      await paint(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openReauthModal(onConfirm) {
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="reauthBackdrop">
      <div class="modal-card">
        <h2>Konfirmasi kata sandi</h2>
        <p class="muted" style="margin-bottom:16px;">Demi keamanan, masukkan kembali kata sandi Anda untuk melihat secret ini.</p>
        <form id="reauthForm">
          <div class="field">
            <label for="reauthPassword">Kata sandi</label>
            <input id="reauthPassword" type="password" required autofocus />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Konfirmasi</button>
            <button type="button" class="btn-secondary" id="closeReauthModal">Batal</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('closeReauthModal').addEventListener('click', () => {
    modalRoot.innerHTML = '';
  });
  document.getElementById('reauthForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('reauthPassword').value;
    modalRoot.innerHTML = '';
    await onConfirm(password);
  });
}
