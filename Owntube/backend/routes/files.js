const express = require('express');
const fs = require('fs');
const path = require('path');
const { PORT, DEFAULT_DOWNLOADS_DIR, COVERS_DIR } = require('../config');
 
const router = express.Router();
 
// ====================== РАЗДАЧА СТАТИКИ ======================
router.use('/files', express.static(DEFAULT_DOWNLOADS_DIR, {
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));
 
router.use('/covers', express.static(COVERS_DIR));
 
// ====================== СПИСОК ФАЙЛОВ ======================
router.get('/list', async (req, res) => {
  try {
    if (!fs.existsSync(DEFAULT_DOWNLOADS_DIR)) {
      return res.json({ files: [] });
    }
 
    const walk = async (dir, base = '') => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(
        entries.map(async (e) => {
          const rel = path.join(base, e.name);
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) {
            return walk(abs, rel);
          } else {
            const stat = await fs.promises.stat(abs);
            return {
              name: e.name,
              path: rel.replace(/\\/g, '/'),
              url: `http://localhost:${PORT}/files/${rel.replace(/\\/g, '/')}`,
              size: stat.size,
              mtime: stat.mtimeMs
            };
          }
        })
      );
      return results.flat();
    };
 
    const files = await walk(DEFAULT_DOWNLOADS_DIR);
    res.json({ files });
  } catch (err) {
    console.error('[ОШИБКА /list]', err);
    res.status(500).json({ error: 'Не удалось прочитать папку загрузок' });
  }
});
 
// ====================== УДАЛЕНИЕ ======================
router.delete('/file', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'не указан путь к файлу' });
 
  const abs = path.resolve(DEFAULT_DOWNLOADS_DIR, filePath);
  const safeRoot = DEFAULT_DOWNLOADS_DIR + path.sep;
  if (!abs.startsWith(safeRoot)) {
    return res.status(403).json({ error: 'доступ запрещён' });
  }
 
  try {
    fs.unlinkSync(abs);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
 
module.exports = router;