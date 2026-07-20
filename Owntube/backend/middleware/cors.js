const cors = require('cors');
const { ALLOWED_ORIGINS } = require('../config');

// ИСПРАВЛЕНИЕ: раньше при заходе не с localhost:3000 (например, по IP из
// локальной сети — http://192.168.x.x:3000 с телефона/другого ПК) origin
// не входил в белый список, cb вызывался с Error(...), и пакет `cors`
// в связке с express превращал это в НЕОБРАБОТАННУЮ ОШИБКУ — express
// отвечал 500 БЕЗ заголовка Access-Control-Allow-Origin. Браузер видел
// именно это: "заблокирован политикой одного источника... статус 500".
// Теперь: 1) любой адрес локальной сети (192.168.*, 10.*, 172.16-31.*,
// localhost/127.0.0.1) разрешён автоматически, вне зависимости от порта;
// 2) отказ для остальных — это просто "не добавляем CORS-заголовки"
// (cb(null, false)), а не брошенная ошибка, так что 500 больше не будет.
function isLanOrigin(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

module.exports = cors({
  origin: (origin, cb) => {
    // origin === undefined — запросы без Origin (curl, тот же хост)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    try {
      const { hostname } = new URL(origin);
      if (isLanOrigin(hostname)) return cb(null, true);
    } catch (e) { /* некорректный Origin — просто отклоняем ниже */ }
    cb(null, false);
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  credentials: true
});
