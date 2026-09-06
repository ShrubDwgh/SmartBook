const { db } = require('./firebaseAdmin');
const { notFound } = require('./http');

const PROJECTS = 'projects';

/**
 * Pastikan projectId benar-benar ada dan dimiliki oleh uid ini.
 * Dipakai oleh notesService & tasksService supaya satu user tidak bisa
 * menempelkan catatan/checklist ke proyek milik user lain, walaupun
 * projectId ditebak/diketahui.
 */
async function assertProjectOwnership(uid, projectId) {
  if (!projectId || typeof projectId !== 'string') {
    throw notFound('Proyek tidak ditemukan.');
  }
  const ref = db.collection(PROJECTS).doc(projectId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== uid) {
    throw notFound('Proyek tidak ditemukan.');
  }
  return { ref, doc };
}

module.exports = { assertProjectOwnership, PROJECTS_COLLECTION: PROJECTS };
