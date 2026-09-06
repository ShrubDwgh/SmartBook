const { db, admin } = require('./firebaseAdmin');
const { assertProjectOwnership, PROJECTS_COLLECTION } = require('./ownership');
const { listTasksForProject } = require('./tasksService');
const { deleteAllNotesForProject } = require('./notesService');
const { badRequest } = require('./http');
const { serializeDoc, toMillis } = require('./serialize');

const PROJECTS = PROJECTS_COLLECTION;
const TASKS = 'tasks';
const NOTES = 'notes';

async function listProjects(uid) {
  const snap = await db.collection(PROJECTS).where('ownerId', '==', uid).get();
  const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  projects.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  return projects.map((p) => serializeDoc(p.id, p));
}

/** Daftar ringkas catatan milik satu proyek (untuk halaman detail proyek). */
async function listRecentNotesForProject(uid, projectId, limit = 20) {
  const snap = await db.collection(NOTES).where('projectId', '==', projectId).get();
  const notes = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => n.ownerId === uid);
  notes.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  return notes.slice(0, limit).map((n) => serializeDoc(n.id, n));
}

async function getProject(uid, projectId) {
  const { doc } = await assertProjectOwnership(uid, projectId);
  const [checklist, recentNotes] = await Promise.all([
    listTasksForProject(uid, projectId),
    listRecentNotesForProject(uid, projectId),
  ]);
  return { ...serializeDoc(doc.id, doc.data()), checklist, recentNotes };
}

async function createProject(uid, { name, description }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw badRequest('Nama proyek wajib diisi.');

  const ref = await db.collection(PROJECTS).add({
    ownerId: uid,
    name: cleanName,
    description: (description || '').trim(),
    status: 'Aktif',
    progress: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return serializeDoc(doc.id, doc.data());
}

/**
 * Update proyek. Sengaja HANYA mengizinkan ubah name/description dari sini —
 * "status" dan "progress" murni dihitung otomatis dari checklist (lihat tasksService)
 * supaya nilainya tidak pernah tidak konsisten dengan checklist yang sebenarnya.
 */
async function updateProject(uid, projectId, { name, description } = {}) {
  const { ref } = await assertProjectOwnership(uid, projectId);
  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (typeof name === 'string') {
    if (!name.trim()) throw badRequest('Nama proyek tidak boleh kosong.');
    update.name = name.trim();
  }
  if (typeof description === 'string') {
    update.description = description.trim();
  }

  await ref.update(update);
  const updated = await ref.get();
  return serializeDoc(updated.id, updated.data());
}

/** Hapus proyek beserta seluruh checklist dan catatan yang terhubung dengannya. */
async function deleteProject(uid, projectId) {
  const { ref } = await assertProjectOwnership(uid, projectId);

  const tasksSnap = await db.collection(TASKS).where('projectId', '==', projectId).get();
  if (!tasksSnap.empty) {
    const batch = db.batch();
    tasksSnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteAllNotesForProject(projectId);
  await ref.delete();
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject };
