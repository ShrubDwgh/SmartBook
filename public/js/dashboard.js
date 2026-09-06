import { api } from './api.js';
import { escapeHtml, truncate, formatDate } from './utils.js';

export async function renderDashboard(container) {
  const [{ projects }, { notes }] = await Promise.all([api.get('/api/projects'), api.get('/api/notes')]);

  const activeProjects = projects.filter((p) => p.status === 'Aktif');
  const recentNotes = notes.slice(0, 5);

  const taskGroups = await Promise.all(
    activeProjects.map((p) =>
      api.get('/api/tasks', { projectId: p.id }).then((r) => ({ project: p, tasks: r.tasks }))
    )
  );
  const incomplete = [];
  taskGroups.forEach(({ project, tasks }) => {
    tasks
      .filter((t) => !t.completed)
      .forEach((t) => incomplete.push({ ...t, projectName: project.name }));
  });
  const incompletePreview = incomplete.slice(0, 8);

  container.innerHTML = `
    <div class="page-header"><h1>Dashboard</h1></div>

    <section class="dash-section">
      <div class="section-heading">
        <h2>Proyek aktif</h2>
        <a class="link-more" href="#/projects">Lihat semua</a>
      </div>
      ${
        activeProjects.length
          ? `<div class="project-grid">${activeProjects.map(projectCard).join('')}</div>`
          : emptyState('Belum ada proyek aktif.', 'Buat proyek baru', 'projects/new')
      }
    </section>

    <div class="dash-columns">
      <section class="dash-section">
        <div class="section-heading"><h2>Checklist belum selesai</h2></div>
        ${
          incompletePreview.length
            ? `<ul class="task-preview-list">${incompletePreview.map(taskPreviewItem).join('')}</ul>`
            : `<p class="muted">Semua checklist di proyek aktif sudah selesai.</p>`
        }
      </section>

      <section class="dash-section">
        <div class="section-heading">
          <h2>Catatan terbaru</h2>
          <a class="link-more" href="#/notes">Lihat semua</a>
        </div>
        ${
          recentNotes.length
            ? `<ul class="note-preview-list">${recentNotes.map(notePreviewItem).join('')}</ul>`
            : emptyState('Belum ada catatan.', 'Buat catatan baru', 'notes/new')
        }
      </section>
    </div>
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
      <p class="project-desc">${escapeHtml(truncate(p.description, 80))}</p>
      <div class="progress-bar"><div class="${barClass}" style="width:${p.progress}%"></div></div>
      <span class="progress-label">${p.progress}%</span>
    </a>
  `;
}

function taskPreviewItem(t) {
  return `
    <li class="task-preview-item">
      <span class="task-project">${escapeHtml(t.projectName)}</span>
      <span>${escapeHtml(t.title)}</span>
    </li>
  `;
}

function notePreviewItem(n) {
  return `
    <li>
      <a href="#/notes/${n.id}">
        <span class="note-preview-title">${escapeHtml(n.title)}</span>
        <span class="meta-row">
          <span class="chip">${escapeHtml(n.category)}</span>
          <span>${escapeHtml(n.projectName || 'Tanpa proyek')}</span>
          <span>${formatDate(n.updatedAt)}</span>
        </span>
      </a>
    </li>
  `;
}

export function emptyState(message, actionLabel, actionPath) {
  return `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
      <a href="#/${actionPath}" class="btn-secondary">${escapeHtml(actionLabel)}</a>
    </div>
  `;
}
