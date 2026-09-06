const { db, admin } = require('./firebaseAdmin');
const { tooMany } = require('./http');

const COLLECTION = 'rateLimits';
const WINDOW_MS = 60 * 1000;

/**
 * Rate limit sederhana berbasis Firestore (tanpa layanan/infra tambahan,
 * sesuai prinsip "stack sesederhana mungkin").
 *
 * Membatasi jumlah request per user per menit untuk endpoint yang memanggil
 * OpenAI, supaya bug di frontend (mis. tombol terpencet berkali-kali) atau
 * penyalahgunaan tidak membengkakkan biaya API secara tak terkendali.
 */
async function checkRateLimit(uid, key, limitPerMinute) {
  const ref = db.collection(COLLECTION).doc(`${uid}_${key}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();

    if (!snap.exists) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }

    const data = snap.data();
    if (now - data.windowStart > WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }

    if (data.count >= limitPerMinute) {
      throw tooMany('Terlalu banyak permintaan ke AI Secretary. Tunggu sebentar lalu coba lagi.');
    }

    tx.update(ref, { count: admin.firestore.FieldValue.increment(1) });
  });
}

module.exports = { checkRateLimit };
