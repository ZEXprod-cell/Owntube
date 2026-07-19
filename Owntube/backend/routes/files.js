const express = require('express');
const { DEFAULT_DOWNLOADS_DIR, COVERS_DIR } = require('../config');

const router = express.Router();

// Раздача статики — грузится напрямую через <video>/<audio>/<img> src,
// поэтому осознанно без токена (см. middleware/auth.js).
//
// Удалены (были мёртвым кодом, не вызывались нигде во фронте):
//   GET    /list  — список файлов в DEFAULT_DOWNLOADS_DIR
//   DELETE /file  — удаление файла по пути
// Если понадобится страница «управление загрузками» — эти два роута
// несложно вернуть, только сразу добавить их в PROTECTED_PATHS в auth.js.

router.use('/files', express.static(DEFAULT_DOWNLOADS_DIR, {
  setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes')
}));

router.use('/covers', express.static(COVERS_DIR));

module.exports = router;
