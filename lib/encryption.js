const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Ambil kunci enkripsi 32-byte dari env var SECRETS_ENCRYPTION_KEY (base64).
 * Generate kunci baru dengan:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getKey() {
  const keyB64 = process.env.SECRETS_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error('SECRETS_ENCRYPTION_KEY belum diatur di environment variables.');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY harus berupa 32 byte yang di-encode base64.');
  }
  return key;
}

/**
 * Enkripsi teks polos (mis. isi password/API key).
 * IV dibuat acak setiap kali sehingga hasil enkripsi selalu berbeda walau isinya sama.
 */
function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/** Dekripsi kembali menjadi teks polos. Melempar error jika data rusak/authTag tidak cocok. */
function decryptText({ encryptedValue, iv, authTag }) {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encryptText, decryptText };
