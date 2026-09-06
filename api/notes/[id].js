const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const notesService = require('../../lib/notesService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PUT', 'DELETE'])) return;
  const decoded = await verifyAuth(req);
  const { id } = req.query;

  if (req.method === 'GET') {
    const note = await notesService.getNote(decoded.uid, id);
    return res.status(200).json({ note });
  }

  if (req.method === 'PUT') {
    const note = await notesService.updateNote(decoded.uid, id, req.body || {});
    return res.status(200).json({ note });
  }

  await notesService.deleteNote(decoded.uid, id);
  return res.status(200).json({ success: true });
});
