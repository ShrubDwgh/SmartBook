const { db, admin } = require('./firebaseAdmin');
const { assertProjectOwnership, PROJECTS_COLLECTION } = require('./ownership');
const { badRequest, notFound } = require('./http');
const { serializeDoc, toMillis } = require('./serialize');

const TASKS = 'tasks';

/**
 * Hitung ulang progress & status proyek berdasarkan checklist-nya.
 * Progress = (jumlah checklist selesai / total checklist) * 100.
 * Jika semua checklist selesai (dan minimal ada 1), status otomatis "Selesai".
 * Jika belum semua selesai, status otomatis kembali ke "Aktif".
 */
async function recalcProjectProgress(projectId) {
  const snap = await db.collection(TASKS).where('projectId', '==', projectId).get();
  let total = 0;
  let completed = 0;
  snap.forEach((doc) => {
    total += 1;
    if (doc.data().completed) completed += 1;
  });
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  const status = total > 0 && completed === total ? 'Selesai' : 'Aktif';

  await db
    .collection(PROJECTS_COLLECTION)
    .doc(projectId)
    .update({ progress, status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  return { progress, status };
}

/** Daftar checklist milik satu proyek, diurutkan dari yang paling lama dibuat. */
async function listTasksForProject(uid, projectId) {
  await assertProjectOwnership(uid, projectId);
  const snap = await db.collection(TASKS).where('projectId', '==', projectId).get();
  const tasks = snap.docs.map((d) => ({ _doc: d, millis: toMillis(d.data().createdAt) }));
  tasks.sort((a, b) => a.millis - b.millis);
  return tasks.map(({ _doc }) => serializeDoc(_doc.id, _doc.data()));
}

async function createTask(uid, { projectId, title, sourceNoteId = null }) {
  if (!title || !title.trim()) {
    throw badRequest('Judul checklist wajib diisi.');
  }
  await assertProjectOwnership(uid, projectId);

  const ref = await db.collection(TASKS).add({
    ownerId: uid,
    projectId,
    title: title.trim(),
    completed: false,
    sourceNoteId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    completedAt: null,
  });

  await recalcProjectProgress(projectId);
  const doc = await ref.get();
  return serializeDoc(doc.id, doc.data());
}

async function getOwnedTaskRef(uid, taskId) {
  const ref = db.collection(TASKS).doc(taskId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== uid) {
    throw notFound('Checklist tidak ditemukan.');
  }
  return { ref, doc };
}

async function updateTask(uid, taskId, { title, completed } = {}) {
  const { ref, doc } = await getOwnedTaskRef(uid, taskId);
  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (typeof title === 'string') {
    if (!title.trim()) throw badRequest('Judul checklist tidak boleh kosong.');
    update.title = title.trim();
  }
  if (typeof completed === 'boolean') {
    update.completed = completed;
    update.completedAt = completed ? admin.firestore.FieldValue.serverTimestamp() : null;
  }

  await ref.update(update);
  await recalcProjectProgress(doc.data().projectId);

  const updated = await ref.get();
  return serializeDoc(updated.id, updated.data());
}

async function deleteTask(uid, taskId) {
  const { ref, doc } = await getOwnedTaskRef(uid, taskId);
  const projectId = doc.data().projectId;
  await ref.delete();
  await recalcProjectProgress(projectId);
}

/** Dipakai notesService saat sebuah catatan yang ditandai "tugas" dihapus/diubah. */
async function deleteTaskIfOwned(uid, taskId) {
  if (!taskId) return;
  try {
    await deleteTask(uid, taskId);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

module.exports = {
  listTasksForProject,
  createTask,
  updateTask,
  deleteTask,
  deleteTaskIfOwned,
  recalcProjectProgress,
};
