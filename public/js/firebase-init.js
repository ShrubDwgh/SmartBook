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
  apiKey: 'AIzaSyCjzwYKHAFFefJLC0Vb9x46Olkx8Ay2Mpk',
  authDomain: 'smartbook-3f3b1.firebaseapp.com',
  projectId: 'smartbook-3f3b1',
  storageBucket: 'smartbook-3f3b1.firebasestorage.app',
  messagingSenderId: '667259316808',
  appId: '1:667259316808:web:477432f511be4f85f7c67d',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
