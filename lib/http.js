/**
 * Helper response HTTP yang konsisten untuk semua endpoint di /api.
 * Error 5xx selalu dikirim ke client dengan pesan generik (detail asli hanya
 * masuk ke server log) supaya tidak membocorkan informasi internal yang sensitif.
 */

class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

function badRequest(message) {
  return new HttpError(400, message || 'Permintaan tidak valid.');
}

function notFound(message) {
  return new HttpError(404, message || 'Data tidak ditemukan.');
}

function unauthorized(message, code) {
  return new HttpError(401, message || 'Anda perlu login.', code);
}

function forbidden(message) {
  return new HttpError(403, message || 'Anda tidak memiliki akses ke data ini.');
}

function tooMany(message) {
  return new HttpError(429, message || 'Terlalu banyak permintaan, coba lagi sebentar lagi.');
}

function sendError(res, err) {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    // Detail lengkap (stack trace, dll) hanya dicatat di log server.
    console.error(err);
  }
  const message = statusCode >= 500 ? 'Terjadi kesalahan pada server.' : err.message;
  const payload = { error: message };
  if (err.code) payload.code = err.code;
  res.status(statusCode).json(payload);
}

function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: 'Method tidak diizinkan.' });
    return false;
  }
  return true;
}

/** Bungkus handler async supaya semua error (termasuk yang tak terduga) tertangani rapi. */
function withHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };
}

module.exports = {
  HttpError,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  tooMany,
  sendError,
  methodGuard,
  withHandler,
};
