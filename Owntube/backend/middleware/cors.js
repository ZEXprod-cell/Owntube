const cors = require('cors');
const { ALLOWED_ORIGINS } = require('../config');

function isLocalNetworkOrigin(origin) {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (/^192\.168\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

module.exports = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (isLocalNetworkOrigin(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed: ' + origin));
  },
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  credentials: true
});
