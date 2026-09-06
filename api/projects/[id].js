const { withHandler, methodGuard } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const projectsService = require('../../lib/projectsService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PUT', 'DELETE'])) return;
  const decoded = await verifyAuth(req);
  const { id } = req.query;

  if (req.method === 'GET') {
    const project = await projectsService.getProject(decoded.uid, id);
    return res.status(200).json({ project });
  }

  if (req.method === 'PUT') {
    const { name, description } = req.body || {};
    const project = await projectsService.updateProject(decoded.uid, id, { name, description });
    return res.status(200).json({ project });
  }

  // DELETE — juga menghapus checklist & catatan yang terhubung ke proyek ini.
  await projectsService.deleteProject(decoded.uid, id);
  return res.status(200).json({ success: true });
});
