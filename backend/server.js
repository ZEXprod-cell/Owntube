const express = require('express');
const compression = require('compression');
const os = require('os');

const { PORT, DEFAULT_DOWNLOADS_DIR } = require('./config');
const corsMiddleware = require('./middleware/cors');
const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const downloadRoutes = require('./routes/download');
const libraryRoutes = require('./routes/library');

const app = express();

app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Лёгкое логирование медленных/ошибочных запросов
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 1000 || res.statusCode >= 400) {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// /auth/register и /auth/login выдают токен — сами не защищены токеном.
app.use(authRoutes);

app.use(authMiddleware);

app.use(filesRoutes);
app.use(downloadRoutes);
app.use(libraryRoutes);

// Лёгкий health-check для клиента (без токена)
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]', reason));
process.on('uncaughtException', (err) => console.error('[Uncaught Exception]', err));

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`\n✅ ZEX DOWNLOADER v1.0`);
  console.log(`   На этом ПК:     http://localhost:${PORT}`);
  if (lanIp) console.log(`   В локальной сети: http://${lanIp}:${PORT}`);
  console.log(`📁 Файлы хранятся в: ${DEFAULT_DOWNLOADS_DIR}`);
});

function shutdown() {
  console.log('\n⏹ Остановка сервера...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
