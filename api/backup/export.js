const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const { db } = require('../../lib/firebaseAdmin');
const { serializeDoc } = require('../../lib/serialize');
const categoriesService = require('../../lib/categoriesService');

/**
 * Export seluruh data SmartBook milik user (proyek, catatan, checklist, kategori)
 * sebagai satu file JSON.
 *
 * SENGAJA TIDAK menyertakan isi Secrets Vault: kalau file backup ini tersimpan
 * atau terkirim ke tempat yang kurang aman, password/API key Anda tidak akan
 * ikut bocor. Kelola/backup Secrets secara terpisah lewat halaman Secrets.
 */
module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return;
  const decoded = await verifyAuth(req);
  const uid = decoded.uid;

  const [projectsSnap, notesSnap, tasksSnap, categories] = await Promise.all([
    db.collection('projects').where('ownerId', '==', uid).get(),
    db.collection('notes').where('ownerId', '==', uid).get(),
    db.collection('tasks').where('ownerId', '==', uid).get(),
    categoriesService.listCategories(uid),
  ]);

  const backup = {
    app: 'SmartBook',
    exportedAt: new Date().toISOString(),
    note: 'Backup ini tidak menyertakan isi Secrets Vault demi keamanan.',
    projects: projectsSnap.docs.map((d) => serializeDoc(d.id, d.data())),
    notes: notesSnap.docs.map((d) => serializeDoc(d.id, d.data())),
    tasks: tasksSnap.docs.map((d) => serializeDoc(d.id, d.data())),
    categories,
  };

  return res.status(200).json(backup);
});
