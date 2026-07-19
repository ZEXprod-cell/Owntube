const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Всё лежит в backend/.data — не трогать руками, это база пользователей
// и секретный ключ подписи JWT. Добавь .data/ в .gitignore.
const DATA_DIR = path.join(__dirname, '..', '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'jwt_secret.txt');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    console.warn('[auth] не удалось прочитать users.json:', e.message);
  }
  return {};
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// ✅ Больше НЕ нужно вручную копировать один и тот же токен в config.js и
// в app.js — секрет генерируется один раз при первом запуске и хранится в
// файле, переживает перезапуски. Именно рассинхрон двух copy-paste копий
// был причиной повторяющихся 401 выше.
function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } catch {}
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, 'utf-8');
  console.log('[auth] Сгенерирован новый JWT-секрет → backend/.data/jwt_secret.txt');
  return secret;
}

module.exports = { loadUsers, saveUsers, getJwtSecret };
