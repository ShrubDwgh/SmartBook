const { withHandler, methodGuard, badRequest } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const { checkRateLimit } = require('../../lib/rateLimit');
const { runSecretary } = require('../../lib/aiSecretary');

const LIMIT_PER_MINUTE = 15;

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return;
  const decoded = await verifyAuth(req);
  await checkRateLimit(decoded.uid, 'ai-secretary', LIMIT_PER_MINUTE);

  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    throw badRequest('Pesan wajib diisi.');
  }

  const { reply, actions } = await runSecretary(decoded.uid, message, history);
  return res.status(200).json({ reply, actions });
});
