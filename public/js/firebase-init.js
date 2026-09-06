import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

/**
 * GANTI nilai-nilai di bawah ini dengan konfigurasi project Firebase Anda sendiri:
 * Firebase Console -> Project Settings -> General -> "Your apps" -> tambah Web app.
 *
 * PENTING: nilai-nilai ini (apiKey, dst) AMAN berada di kode frontend/publik.
 * ini BUKAN kredensial rahasia seperti OPENAI_API_KEY. Keamanan aplikasi ini
 * ditegakkan lewat verifikasi token & pengecekan kepemilikan data di backend
 * (lihat /lib/auth.js dan /lib/ownership.js), bukan dengan menyembunyikan config ini.
 * Frontend juga TIDAK mengakses Firestore sama sekali — hanya Firebase Auth,
 * semua data lewat /api/* (lihat README bagian Arsitektur).
 */
const firebaseConfig = {
  apiKey: 'GANTI_DENGAN_API_KEY_ANDA',
  authDomain: 'GANTI_DENGAN_PROJECT_ID.firebaseapp.com',
  projectId: 'GANTI_DENGAN_PROJECT_ID',
  storageBucket: 'GANTI_DENGAN_PROJECT_ID.appspot.com',
  messagingSenderId: 'GANTI_DENGAN_SENDER_ID',
  appId: 'GANTI_DENGAN_APP_ID',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
