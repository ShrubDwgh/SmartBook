/**
 * Helper untuk mengubah dokumen Firestore menjadi objek JSON yang aman dikirim ke client.
 * Firestore Timestamp diubah menjadi string ISO 8601 agar mudah dipakai di frontend.
 */

function serializeValue(value) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  return value;
}

/** Ubah { id, ...data } Firestore menjadi objek JSON yang bersih. */
function serializeDoc(id, data) {
  const out = { id };
  for (const [key, value] of Object.entries(data || {})) {
    out[key] = serializeValue(value);
  }
  return out;
}

/** Ambil milidetik dari Firestore Timestamp untuk keperluan sorting di memori. */
function toMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return 0;
}

module.exports = { serializeDoc, toMillis };
