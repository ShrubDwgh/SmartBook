const { db, admin } = require('./firebaseAdmin');
const { assertProjectOwnership, PROJECTS_COLLECTION } = require('./ownership');
const { createTask, updateTask, deleteTaskIfOwned } = require('./tasksService');
const { badRequest, notFound } = require('./http');
const { serializeDoc, toMillis } = require('./serialize');

const NOTES = 'notes';

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
}

/** Ambil nama proyek untuk sekumpulan projectId (hanya milik uid ini), untuk ditampilkan/di-cari. */
async function getProjectNameMap(uid, projectIds) {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  const map = {};
  await Promise.all(
    uniqueIds.map(async (id) => {
      const doc = await db.collection(PROJECTS_COLLECTION).doc(id).get();
      if (doc.exists && doc.data().ownerId === uid) {
        map[id] = doc.data().name;
      }
    })
  );
  return map;
}

function matchesQuery(note, projectName, needle) {
  const haystacks = [
    note.title || '',
    note.content || '',
    note.category || '',
    projectName || '',
    ...(Array.isArray(note.tags) ? note.tags : []),
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

/**
 * Cari/filter catatan milik user.
 * Hanya satu filter equality ("ownerId") yang dikirim ke Firestore — sisanya
 * (project, kategori, tag, teks) difilter di memori. Ini sengaja dipilih agar
 * TIDAK butuh composite index Firestore sama sekali (lebih sederhana untuk di-maintain),
 * dan cukup cepat untuk skala data catatan pribadi.
 */
async function searchNotes(uid, { query, projectId, category, tag, limit = 50 } = {}) {
  const snap = await db.collection(NOTES).where('ownerId', '==', uid).get();
  let notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (projectId) notes = notes.filter((n) => n.projectId === projectId);
  if (category) notes = notes.filter((n) => n.category === category);
  if (tag) notes = notes.filter((n) => Array.isArray(n.tags) && n.tags.includes(tag));

  const nameMap = await getProjectNameMap(uid, notes.map((n) => n.projectId));

  if (query && query.trim()) {
    const needle = query.trim().toLowerCase();
    notes = notes.filter((n) => matchesQuery(n, nameMap[n.projectId], needle));
  }

  notes.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  notes = notes.slice(0, limit);

  return notes.map((n) => ({
    ...serializeDoc(n.id, n),
    projectName: nameMap[n.projectId] || null,
  }));
}

async function getNote(uid, noteId) {
  const doc = await db.collection(NOTES).doc(noteId).get();
  if (!doc.exists || doc.data().ownerId !== uid) {
    throw notFound('Catatan tidak ditemukan.');
  }
  const data = doc.data();
  const nameMap = await getProjectNameMap(uid, [data.projectId]);
  return { ...serializeDoc(doc.id, data), projectName: nameMap[data.projectId] || null };
}

async function createNote(uid, { title, content, projectId, category, tags, isTask }) {
  const cleanTitle = (title || '').trim();
  const cleanContent = (content || '').trim();
  if (!cleanTitle) throw badRequest('Judul catatan wajib diisi.');
  if (!cleanContent) throw badRequest('Isi catatan wajib diisi.');
  if (!category || !String(category).trim()) throw badRequest('Kategori wajib dipilih.');

  const { doc: projectDoc } = await assertProjectOwnership(uid, projectId);

  const ref = db.collection(NOTES).doc();
  const noteData = {
    ownerId: uid,
    projectId,
    title: cleanTitle,
    content: cleanContent,
    category: String(category).trim(),
    tags: cleanTags(tags),
    isTask: Boolean(isTask),
    linkedTaskId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (noteData.isTask) {
    const task = await createTask(uid, { projectId, title: cleanTitle, sourceNoteId: ref.id });
    noteData.linkedTaskId = task.id;
  }

  await ref.set(noteData);
  const doc = await ref.get();
  return { ...serializeDoc(doc.id, doc.data()), projectName: projectDoc.data().name };
}

async function getOwnedNoteRef(uid, noteId) {
  const ref = db.collection(NOTES).doc(noteId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== uid) {
    throw notFound('Catatan tidak ditemukan.');
  }
  return { ref, doc };
}

async function updateNote(uid, noteId, { title, content, category, tags, isTask } = {}) {
  const { ref, doc } = await getOwnedNoteRef(uid, noteId);
  const current = doc.data();
  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (typeof title === 'string') {
    if (!title.trim()) throw badRequest('Judul catatan tidak boleh kosong.');
    update.title = title.trim();
  }
  if (typeof content === 'string') {
    if (!content.trim()) throw badRequest('Isi catatan tidak boleh kosong.');
    update.content = content.trim();
  }
  if (typeof category === 'string' && category.trim()) {
    update.category = category.trim();
  }
  if (typeof tags !== 'undefined') {
    update.tags = cleanTags(tags);
  }

  // Kelola keterkaitan dengan checklist proyek saat status "tandai sebagai tugas" berubah.
  if (typeof isTask === 'boolean' && isTask !== current.isTask) {
    update.isTask = isTask;
    if (isTask) {
      const task = await createTask(uid, {
        projectId: current.projectId,
        title: update.title || current.title,
      });
      update.linkedTaskId = task.id;
    } else if (current.linkedTaskId) {
      await deleteTaskIfOwned(uid, current.linkedTaskId);
      update.linkedTaskId = null;
    }
  } else if (current.isTask && current.linkedTaskId && typeof update.title === 'string') {
    // Judul berubah tapi masih berstatus tugas: sinkronkan judul checklist-nya.
    await updateTask(uid, current.linkedTaskId, { title: update.title }).catch(() => {});
  }

  await ref.update(update);
  const updated = await ref.get();
  const nameMap = await getProjectNameMap(uid, [updated.data().projectId]);
  return { ...serializeDoc(updated.id, updated.data()), projectName: nameMap[updated.data().projectId] || null };
}

async function deleteNote(uid, noteId) {
  const { ref, doc } = await getOwnedNoteRef(uid, noteId);
  const data = doc.data();
  if (data.linkedTaskId) {
    await deleteTaskIfOwned(uid, data.linkedTaskId);
  }
  await ref.delete();
}

/** Dipakai saat sebuah proyek dihapus, untuk membersihkan semua catatannya (lihat projectsService). */
async function deleteAllNotesForProject(projectId) {
  const snap = await db.collection(NOTES).where('projectId', '==', projectId).get();
  const batch = db.batch();
  snap.forEach((d) => batch.delete(d.ref));
  if (!snap.empty) await batch.commit();
}

module.exports = {
  searchNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  deleteAllNotesForProject,
};
