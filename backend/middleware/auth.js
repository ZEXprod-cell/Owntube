const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/authStore');

const JWT_SECRET = getJwtSecret();

// Токен нужен только там, где фронт вызывает через fetch(). /stream/*,
// /files/*, /covers/*, /cover/music/* — не входят: это статика, грузится
// напрямую через <video>/<audio>/<img> src, заголовок туда не добавить.
const PROTECTED_PATHS = [
  '/download',
  '/library/video',
  '/library/music',
  '/library/anim-covers',
  '/library/music/meta',
  // ДОБАВЛЕНО: лайки/избранное теперь привязаны к аккаунту (req.user.username),
  // поэтому эндпоинт тоже должен требовать валидный JWT.
  '/library/likes',
];

module.exports = function authMiddleware(req, res, next) {
  const needsAuth = PROTECTED_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'));
  if (!needsAuth) return next();

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    req.user = jwt.verify(token, JWT_SECRET); // { sub, username }
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};