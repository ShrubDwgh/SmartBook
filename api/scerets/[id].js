const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth, requireRecentAuth } = require('../../lib/auth');
const secretsService = require('../../lib/secretsService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['PUT', 'DELETE', 'POST'])) return;
  const decoded = await verifyAuth(req);
  const { id } = req.query;

  if (req.method === 'POST') {
    // POST di sini artinya "reveal" (lihat isi asli). Wajib login baru-baru ini —
    // jika tidak, requireRecentAuth melempar 401 dengan code "reauth_required"
    // dan frontend akan meminta user konfirmasi ulang kata sandi.
    requireRecentAuth(decoded);
    const secret = await secretsService.revealSecret(decoded.uid, id);
    return res.status(200).json({ secret });
  }

  if (req.method === 'PUT') {
    const { label, type, value } = req.body || {};
    const secret = await secretsService.updateSecret(decoded.uid, id, { label, type, value });
    return res.status(200).json({ secret });
  }

  await secretsService.deleteSecret(decoded.uid, id);
  return res.status(200).json({ success: true });
});
