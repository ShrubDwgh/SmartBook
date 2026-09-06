const { db, admin } = require('./firebaseAdmin');
const { badRequest } = require('./http');

const SETTINGS = 'userSettings';
const NOTES = 'notes';
const FALLBACK_CATEGORY = 'Lainnya';

const DEFAULT_CATEGORIES = [
  'Prompt',
  'Update',
  'Ide',
  'Bug',
  'Informasi',
  'Tutorial',
  'Checklist',
  'Lainnya',
];

/** Ambil dokumen setting user, seed dengan kategori default jika belum ada. */
async function getOrInitSettings(uid) {
  const ref = db.collection(SETTINGS).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) {
    const initial = {
      categories: DEFAULT_CATEGORIES,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(initial);
    return { ref, categories: DEFAULT_CATEGORIES.slice() };
  }
  const data = doc.data();
  const categories = Array.isArray(data.categories) && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
  return { ref, categories };
}

async function listCategories(uid) {
  const { categories } = await getOrInitSettings(uid);
  return categories;
}

async function addCategory(uid, name) {
  const clean = (name || '').trim();
  if (!clean) throw badRequest('Nama kategori wajib diisi.');
  const { ref, categories } = await getOrInitSettings(uid);
  if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    throw badRequest('Kategori tersebut sudah ada.');
  }
  const updated = [...categories, clean];
  await ref.set({ categories: updated }, { merge: true });
  return updated;
}

async function renameCategory(uid, oldName, newName) {
  const cleanOld = (oldName || '').trim();
  const cleanNew = (newName || '').trim();
  if (!cleanOld || !cleanNew) throw badRequest('Nama kategori tidak boleh kosong.');

  const { ref, categories } = await getOrInitSettings(uid);
  if (!categories.includes(cleanOld)) throw badRequest('Kategori tidak ditemukan.');
  if (categories.some((c) => c.toLowerCase() === cleanNew.toLowerCase() && c !== cleanOld)) {
    throw badRequest('Nama kategori baru sudah dipakai.');
  }

  const updated = categories.map((c) => (c === cleanOld ? cleanNew : c));
  await ref.set({ categories: updated }, { merge: true });

  // Perbarui semua catatan yang memakai nama kategori lama, agar tetap konsisten.
  await reassignNotesCategory(uid, cleanOld, cleanNew);
  return updated;
}

async function deleteCategory(uid, name) {
  const clean = (name || '').trim();
  if (!clean) throw badRequest('Nama kategori wajib diisi.');
  if (clean === FALLBACK_CATEGORY) {
    throw badRequest(`Kategori "${FALLBACK_CATEGORY}" tidak bisa dihapus karena dipakai sebagai kategori cadangan.`);
  }

  const { ref, categories } = await getOrInitSettings(uid);
  if (!categories.includes(clean)) throw badRequest('Kategori tidak ditemukan.');

  const updated = categories.filter((c) => c !== clean);
  await ref.set({ categories: updated }, { merge: true });

  // Catatan yang memakai kategori ini dipindahkan ke kategori cadangan "Lainnya".
  await reassignNotesCategory(uid, clean, FALLBACK_CATEGORY);
  return updated;
}

async function reassignNotesCategory(uid, fromCategory, toCategory) {
  const snap = await db.collection(NOTES).where('ownerId', '==', uid).get();
  const batch = db.batch();
  let hasWrites = false;
  snap.forEach((doc) => {
    if (doc.data().category === fromCategory) {
      batch.update(doc.ref, { category: toCategory });
      hasWrites = true;
    }
  });
  if (hasWrites) await batch.commit();
}

module.exports = {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  listCategories,
  addCategory,
  renameCategory,
  deleteCategory,
};
