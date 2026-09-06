const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const projectsService = require('../../lib/projectsService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const decoded = await verifyAuth(req);

  if (req.method === 'GET') {
    const projects = await projectsService.listProjects(decoded.uid);
    return res.status(200).json({ projects });
  }

  const { name, description } = req.body || {};
  const project = await projectsService.createProject(decoded.uid, { name, description });
  return res.status(201).json({ project });
});
