const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const tasksService = require('../../lib/tasksService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['PUT', 'DELETE'])) return;
  const decoded = await verifyAuth(req);
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { title, completed } = req.body || {};
    const task = await tasksService.updateTask(decoded.uid, id, { title, completed });
    return res.status(200).json({ task });
  }

  await tasksService.deleteTask(decoded.uid, id);
  return res.status(200).json({ success: true });
});
