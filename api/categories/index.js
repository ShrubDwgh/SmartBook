const { withHandler, methodGuard, badRequest } = require('../../lib/http');
const { verifyAuth } = require('../../lib/auth');
const categoriesService = require('../../lib/categoriesService');

module.exports = withHandler(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const decoded = await verifyAuth(req);

  if (req.method === 'GET') {
    const categories = await categoriesService.listCategories(decoded.uid);
    return res.status(200).json({ categories });
  }

  const { action, name, newName } = req.body || {};
  let categories;
  if (action === 'add') {
    categories = await categoriesService.addCategory(decoded.uid, name);
  } else if (action === 'rename') {
    categories = await categoriesService.renameCategory(decoded.uid, name, newName);
  } else if (action === 'delete') {
    categories = await categoriesService.deleteCategory(decoded.uid, name);
  } else {
    throw badRequest('action harus salah satu dari: add, rename, delete.');
  }
  return res.status(200).json({ categories });
});
