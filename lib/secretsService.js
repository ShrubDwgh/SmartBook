const { db, admin } = require('./firebaseAdmin');
const { encryptText, decryptText } = require('./encryption');
const { badRequest, notFound } = require('./http');
const { toMillis } = require('./serialize');

const SECRETS = 'secrets';
const VALID_TYPES = ['password', 'api_key', 'token', 'other'];

function toMetadata(id, data) {
  // SENGAJA tidak menyertakan encryptedValue/iv/authTag di sini.
  // Nilai asli hanya pernah dikembalikan lewat revealSecret().
  return {
    id,
    label: data.label,
    type: data.type,
    createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt && data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

async function listSecrets(uid) {
  const snap = await db.collection(SECRETS).where('ownerId', '==', uid).get();
  const items = snap.docs.map((d) => ({ _doc: d, millis: toMillis(d.data().createdAt) }));
  items.sort((a, b) => b.millis - a.millis);
  return items.map(({ _doc }) => toMetadata(_doc.id, _doc.data()));
}

async function createSecret(uid, { label, type, value }) {
  const cleanLabel = (label || '').trim();
  if (!cleanLabel) throw badRequest('Nama/label secret wajib diisi.');
  if (!value) throw badRequest('Isi secret wajib diisi.');
  const cleanType = VALID_TYPES.includes(type) ? type : 'other';

  const { encryptedValue, iv, authTag } = encryptText(value);
  const ref = await db.collection(SECRETS).add({
    ownerId: uid,
    label: cleanLabel,
    type: cleanType,
    encryptedValue,
    iv,
    authTag,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return toMetadata(doc.id, doc.data());
}

async function getOwnedSecretRef(uid, secretId) {
  const ref = db.collection(SECRETS).doc(secretId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().ownerId !== uid) {
    throw notFound('Secret tidak ditemukan.');
  }
  return { ref, doc };
}

async function updateSecret(uid, secretId, { label, type, value }) {
  const { ref } = await getOwnedSecretRef(uid, secretId);
  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (typeof label === 'string') {
    if (!label.trim()) throw badRequest('Nama/label secret tidak boleh kosong.');
    update.label = label.trim();
  }
  if (typeof type === 'string' && VALID_TYPES.includes(type)) {
    update.type = type;
  }
  if (typeof value === 'string' && value) {
    const { encryptedValue, iv, authTag } = encryptText(value);
    update.encryptedValue = encryptedValue;
    update.iv = iv;
    update.authTag = authTag;
  }

  await ref.update(update);
  const updated = await ref.get();
  return toMetadata(updated.id, updated.data());
}

async function deleteSecret(uid, secretId) {
  const { ref } = await getOwnedSecretRef(uid, secretId);
  await ref.delete();
}

/**
 * Kembalikan isi asli (terdekripsi) satu secret.
 * Pemanggil (api/secrets/[id].js) WAJIB memastikan requireRecentAuth sebelum memanggil ini.
 */
async function revealSecret(uid, secretId) {
  const { doc } = await getOwnedSecretRef(uid, secretId);
  const data = doc.data();
  const value = decryptText({ encryptedValue: data.encryptedValue, iv: data.iv, authTag: data.authTag });
  return { id: doc.id, label: data.label, type: data.type, value };
}

module.exports = { listSecrets, createSecret, updateSecret, deleteSecret, revealSecret };
