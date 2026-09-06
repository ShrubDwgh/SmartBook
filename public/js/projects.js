import { api } from './api.js';
import { escapeHtml, truncate, navigateTo, confirmAction, showToast } from './utils.js';
import { emptyState } from './dashboard.js';

export async function renderProjects(container) {
  const { projects } = await api.get('/api/projects');

  container.innerHTML = `
    <div class="page-header">
      <h1>Projects</h1>
      <a href="#/projects/new" class="btn-primary">+ Proyek baru</a>
    </div>
    ${
      projects.length
        ? `<div class="project-grid">${projects.map(projectCard).join('')}</div>`
        : emptyState('Belum ada proyek.', 'Buat proyek pertama Anda', 'projects/new')
    }
  `;
}

function projectCard(p) {
  const barClass = p.status === 'Selesai' ? 'bar-fill success' : 'bar-fill';
  const badgeClass = p.status === 'Selesai' ? 'badge-success' : 'badge-primary';
  return `
    <a href="#/projects/${p.id}" class="project-card">
      <div class="project-card-top">
        <h3>${escapeHtml(p.name)}</h3>
        <span class="badge ${badgeClass}">${escapeHtml(p.status)}</span>
      </div>
      <p class="project-desc">${escapeHtml(truncate(p.description, 90))}</p>
      <div class="progress-bar"><div class="${barClass}" style="width:${p.progress}%"></div></div>
      <span class="progress-label">${p.progress}%</span>
    </a>
  `;
}

export async function renderProjectForm(container, projectId = null) {
  let project = { name: '', description: '' };
  if (projectId) {
    const res = await api.get(`/api/projects/${projectId}`);
    project = res.project;
  }

  container.innerHTML = `
    <div class="page-header"><h1>${projectId ? 'Ubah proyek' : 'Proyek baru'}</h1></div>
    <form id="projectForm" style="max-width:520px;">
      <div class="field">
        <label for="pName">Nama proyek</label>
        <input id="pName" type="text" required value="${escapeHtml(project.name)}" />
      </div>
      <div class="field">
        <label for="pDesc">Deskripsi</label>
        <textarea id="pDesc" rows="4">${escapeHtml(project.description)}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Simpan</button>
        <a href="#/${projectId ? `projects/${projectId}` : 'projects'}" class="btn-secondary">Batal</a>
      </div>
    </form>
  `;

  container.onsubmit = async (e) => {
    e.preventDefault();
    if (e.target.id !== 'projectForm') return;
    const name = document.getElementById('pName').value.trim();
    const description = document.getElementById('pDesc').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (projectId) {
        await api.put(`/api/projects/${projectId}`, { name, description });
        showToast('Proyek diperbarui.', 'success');
        navigateTo(`projects/${projectId}`);
      } else {
        const { project: created } = await api.post('/api/projects', { name, description });
        showToast('Proyek dibuat.', 'success');
        navigateTo(`projects/${created.id}`);
      }
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
    }
  };
}

export async function renderProjectDetail(container, projectId) {
  const { project } = await api.get(`/api/projects/${projectId}`);
  paint(container, project);
}

async function refresh(container, projectId) {
  const { project } = await api.get(`/api/projects/${projectId}`);
  paint(container, project);
}

function paint(container, project) {
  const badgeClass = project.status === 'Selesai' ? 'badge-success' : 'badge-primary';
  const barClass = project.status === 'Selesai' ? 'bar-fill success' : 'bar-fill';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(project.name)}</h1>
        <span class="badge ${badgeClass}" style="margin-top:8px;">${escapeHtml(project.status)}</span>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="#/projects/${project.id}/edit" class="btn-secondary">Ubah</a>
        <button type="button" class="btn-danger" data-action="delete-project">Hapus</button>
      </div>
    </div>

    ${project.description ? `<p class="muted" style="margin-bottom:20px;max-width:640px;">${escapeHtml(project.description)}</p>` : ''}

    <div class="progress-bar" style="max-width:400px;"><div class="${barClass}" style="width:${project.progress}%"></div></div>
    <span class="progress-label">${project.progress}% selesai</span>

    <section class="dash-section" style="margin-top:32px;">
      <div class="section-heading"><h2>Checklist</h2></div>
      <div class="checklist">
        ${project.checklist.length ? project.checklist.map(taskRow).join('') : '<p class="muted">Belum ada checklist.</p>'}
      </div>
      <form class="checklist-add" id="taskForm">
        <input type="text" id="newTaskTitle" placeholder="Tambah item checklist…" required />
        <button type="submit" class="btn-secondary">Tambah</button>
      </form>
    </section>

    <section class="dash-section">
      <div class="section-heading">
        <h2>Catatan di proyek ini</h2>
        <a class="link-more" href="#/notes/new?project=${project.id}">+ Catatan baru</a>
      </div>
      ${
        project.recentNotes.length
          ? `<ul class="note-list">${project.recentNotes.map(noteRow).join('')}</ul>`
          : '<p class="muted">Belum ada catatan di proyek ini.</p>'
      }
    </section>
  `;

  container.onclick = async (e) => {
    const del = e.target.closest('[data-action="delete-project"]');
    if (del) {
      if (!confirmAction(`Hapus proyek "${project.name}"? Semua checklist dan catatan di dalamnya akan ikut terhapus.`)) return;
      await api.del(`/api/projects/${project.id}`);
      showToast('Proyek dihapus.', 'success');
      navigateTo('projects');
      return;
    }

    const removeTaskBtn = e.target.closest('[data-remove-task]');
    if (removeTaskBtn) {
      if (!confirmAction('Hapus item checklist ini?')) return;
      await api.del(`/api/tasks/${removeTaskBtn.dataset.removeTask}`);
      await refresh(container, project.id);
    }
  };

  container.onchange = async (e) => {
    const checkbox = e.target.closest('[data-task-checkbox]');
    if (checkbox) {
      await api.put(`/api/tasks/${checkbox.dataset.taskCheckbox}`, { completed: checkbox.checked });
      await refresh(container, project.id);
    }
  };

  container.onsubmit = async (e) => {
    if (e.target.id !== 'taskForm') return;
    e.preventDefault();
    const input = document.getElementById('newTaskTitle');
    const title = input.value.trim();
    if (!title) return;
    await api.post('/api/tasks', { projectId: project.id, title });
    await refresh(container, project.id);
  };
}

function taskRow(t) {
  const inputId = `task-${t.id}`;
  return `
    <div class="checklist-item ${t.completed ? 'completed' : ''}">
      <input type="checkbox" id="${inputId}" data-task-checkbox="${t.id}" ${t.completed ? 'checked' : ''} />
      <label for="${inputId}">${escapeHtml(t.title)}</label>
      <button type="button" class="btn-icon" data-remove-task="${t.id}" aria-label="Hapus checklist">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><path d="M5 5l10 10M15 5L5 15"/></svg>
      </button>
    </div>
  `;
}

function noteRow(n) {
  return `
    <li>
      <a href="#/notes/${n.id}">
        <span class="note-title">${escapeHtml(n.title)}</span>
        <span class="meta-row"><span class="chip">${escapeHtml(n.category)}</span></span>
      </a>
    </li>
  `;
}
