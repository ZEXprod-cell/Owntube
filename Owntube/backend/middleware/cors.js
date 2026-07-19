const cors = require('cors');
const { ALLOWED_ORIGINS } = require('../config');

// Раньше было origin: true (разрешён любой источник) — сужено до whitelist'а.
module.exports = cors({
  origin: (origin, cb) => {
    // origin === undefined — запросы без Origin (curl, тот же хост)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed: ' + origin));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  credentials: true
});
