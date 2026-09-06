/**
 * Inisialisasi Firebase Admin SDK.
 *
 * PENTING: file ini HANYA boleh dipakai oleh kode backend (folder /api dan /lib).
 * JANGAN PERNAH di-import oleh kode frontend (folder /public) karena berisi
 * akses penuh ke database menggunakan service account.
 *
 * Kredensial diambil dari environment variable (lihat .env.example),
 * bukan dari file JSON service account yang di-commit ke repo.
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private key disimpan di env var dengan karakter \n literal, perlu di-unescape.
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    // Tidak melempar error di sini supaya build tidak gagal; error yang jelas
    // akan muncul saat endpoint benar-benar dipanggil tanpa konfigurasi.
    console.error(
      '[firebaseAdmin] Konfigurasi belum lengkap. Pastikan FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY sudah diatur di environment variables.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

const db = admin.firestore();
const authAdmin = admin.auth();

module.exports = { admin, db, authAdmin };
