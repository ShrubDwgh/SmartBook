const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const notesService = require('../../lib/notesService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const decoded = await verifyAuth(req);

  if (req.method === 'GET') {
    const { search, projectId, category, tag } = req.query;
    const notes = await notesService.searchNotes(decoded.uid, { query: search, projectId, category, tag });
    return res.status(200).json({ notes });
  }

  const note = await notesService.createNote(decoded.uid, req.body || {});
  return res.status(201).json({ note });
});
