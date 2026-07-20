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

// ══════════════════════════════════════════════════════════════
// ДОБАВЛЕНО: helpers для пользователей и лайков-по-аккаунту.
// Причина: раньше нигде не было единого способа найти пользователя
// по логину (регистр буквенный не нормализовался) и не было вообще
// никакого хранилища лайков на сервере — "нравится" жили только в
// localStorage/IndexedDB браузера (см. frontend/js/app.js,
// TRACK_LIKES_KEY). Из-за этого лайки терялись при заходе с другого
// браузера/устройства под тем же аккаунтом. Теперь лайки хранятся
// прямо в записи пользователя в users.json — переживают смену
// браузера, привязаны к логину, а не к конкретному фронтенду.
// ══════════════════════════════════════════════════════════════
function normUsername(u) {
  return String(u || '').trim().toLowerCase();
}

function getLikes(username) {
  const users = loadUsers();
  const u = users[normUsername(username)];
  return (u && u.likes) ? u.likes : { video: {}, music: {} };
}

// state: 1 (нравится), -1 (не нравится), 0 (снять отметку)
function setLike(username, type, id, state) {
  if (type !== 'video' && type !== 'music') return null;
  const users = loadUsers();
  const key = normUsername(username);
  const u = users[key];
  if (!u) return null;
  if (!u.likes) u.likes = { video: {}, music: {} };
  if (!u.likes[type]) u.likes[type] = {};
  if (!state) delete u.likes[type][id];
  else u.likes[type][id] = state;
  saveUsers(users);
  return u.likes;
}

module.exports = { loadUsers, saveUsers, getJwtSecret, normUsername, getLikes, setLike };
