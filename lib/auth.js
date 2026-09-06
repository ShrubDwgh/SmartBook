const { authAdmin } = require('./firebaseAdmin');
const { unauthorized } = require('./http');

const RECENT_AUTH_WINDOW_SECONDS = 10 * 60; // 10 menit

/**
 * Verifikasi Firebase ID token dari header "Authorization: Bearer <token>".
 *
 * PENTING (keamanan): uid HANYA PERNAH diambil dari token yang berhasil
 * diverifikasi di sini. Tidak ada endpoint atau AI tool di aplikasi ini yang
 * menerima uid/ownerId dari body, query, atau argumen tool-call — semua
 * query database di-scope memakai uid dari fungsi ini, bukan dari input user.
 */
async function verifyAuth(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    throw unauthorized('Token tidak ditemukan. Silakan login.');
  }
  try {
    const decoded = await authAdmin.verifyIdToken(match[1]);
    return decoded; // berisi { uid, email, auth_time, ... }
  } catch (err) {
    throw unauthorized('Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
  }
}

/**
 * Untuk aksi sensitif (reveal secret): wajib sudah login dalam beberapa menit terakhir.
 * Jika tidak, frontend akan diminta melakukan re-autentikasi lalu mencoba lagi
 * dengan ID token yang baru (auth_time akan ter-refresh).
 */
function requireRecentAuth(decoded) {
  const now = Math.floor(Date.now() / 1000);
  const authTime = decoded.auth_time || 0;
  if (now - authTime > RECENT_AUTH_WINDOW_SECONDS) {
    throw unauthorized(
      'Untuk melihat secret ini, silakan konfirmasi ulang kata sandi Anda.',
      'reauth_required'
    );
  }
}

module.exports = { verifyAuth, requireRecentAuth };
