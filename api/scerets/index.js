const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const secretsService = require('../../lib/secretsService');

// Catatan: endpoint ini HANYA pernah mengembalikan metadata (label, type, tanggal),
// TIDAK PERNAH nilai asli secret. Nilai asli hanya keluar lewat POST /api/secrets/[id] (reveal).
module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const decoded = await verifyAuth(req);

  if (req.method === 'GET') {
    const secrets = await secretsService.listSecrets(decoded.uid);
    return res.status(200).json({ secrets });
  }

  const { label, type, value } = req.body || {};
  const secret = await secretsService.createSecret(decoded.uid, { label, type, value });
  return res.status(201).json({ secret });
});
