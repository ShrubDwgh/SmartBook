const { withHandler, methodGuard, badRequest } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const tasksService = require('../../lib/tasksService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const decoded = await verifyAuth(req);

  if (req.method === 'GET') {
    const { projectId } = req.query;
    if (!projectId) throw badRequest('projectId wajib diisi.');
    const tasks = await tasksService.listTasksForProject(decoded.uid, projectId);
    return res.status(200).json({ tasks });
  }

  const { projectId, title } = req.body || {};
  const task = await tasksService.createTask(decoded.uid, { projectId, title });
  return res.status(201).json({ task });
});
