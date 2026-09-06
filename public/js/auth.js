import { auth } from './firebase-init.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { showToast } from './utils.js';

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authError = document.getElementById('authError');
const toggleBtn = document.getElementById('toggleAuthMode');
const forgotBtn = document.getElementById('forgotPasswordBtn');
const userEmailLabel = document.getElementById('userEmailLabel');

let isSignupMode = false;

function setAuthError(message) {
  if (!message) {
    authError.classList.add('hidden');
    authError.textContent = '';
    return;
  }
  authError.textContent = message;
  authError.classList.remove('hidden');
}

function friendlyAuthMessage(err) {
  const map = {
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/user-not-found': 'Email atau kata sandi salah.',
    'auth/wrong-password': 'Email atau kata sandi salah.',
    'auth/invalid-credential': 'Email atau kata sandi salah.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba masuk saja.',
    'auth/weak-password': 'Kata sandi minimal 6 karakter.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',
  };
  return map[err && err.code] || 'Terjadi kesalahan. Coba lagi.';
}

toggleBtn.addEventListener('click', () => {
  isSignupMode = !isSignupMode;
  loginForm.classList.toggle('hidden', isSignupMode);
  signupForm.classList.toggle('hidden', !isSignupMode);
  toggleBtn.textContent = isSignupMode ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
  setAuthError(null);
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError(null);
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthError(friendlyAuthMessage(err));
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError(null);
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthError(friendlyAuthMessage(err));
  }
});

forgotBtn.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    setAuthError('Isi email Anda dulu, lalu klik "Lupa kata sandi?" lagi.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Link reset kata sandi sudah dikirim ke email Anda.', 'success');
  } catch (err) {
    setAuthError(friendlyAuthMessage(err));
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="logout"]')) signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    if (userEmailLabel) userEmailLabel.textContent = user.email || '';
    document.dispatchEvent(new CustomEvent('smartbook:auth-ready'));
  } else {
    authScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
  }
});

/** Dipakai halaman Secrets untuk konfirmasi ulang kata sandi sebelum reveal secret. */
export async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Tidak ada sesi aktif.');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}
