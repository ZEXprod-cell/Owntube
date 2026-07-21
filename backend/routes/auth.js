// ══════════════════════════════════════════════════════════════
// АУТЕНТИФИКАЦИЯ — /auth/register, /auth/login, /auth/me
//
// ИСПРАВЛЕНИЕ БАГА: раньше этот файл был случайной копией
// middleware/auth.js (тем же самым проверяющим токен мидлваром),
// без единого реального роута. server.js подключал его как
// `app.use(authRoutes)`, ожидая эндпоинты /auth/register и
// /auth/login — их не существовало, поэтому ЛЮБАЯ попытка входа
// или регистрации получала 404 "Route not found". Это и была
// причина того, что сайт "не работал": войти было физически
// невозможно ни при каких вводимых данных.
//
// Ниже — настоящая реализация: bcrypt-хеширование пароля,
// проверка кода регистрации из config.js, выдача JWT через тот же
// getJwtSecret(), что использует middleware/auth.js.
// ══════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { loadUsers, saveUsers, getJwtSecret, normUsername } = require('../lib/authStore');
const { REGISTRATION_CODE } = require('../config');

const JWT_SECRET = getJwtSecret();
const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, code } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }
    if (code !== REGISTRATION_CODE) {
      return res.status(403).json({ error: 'Неверный код регистрации' });
    }
    const key = normUsername(username);
    if (key.length < 3) {
      return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 4 символов' });
    }

    const users = loadUsers();
    if (users[key]) {
      return res.status(409).json({ error: 'Такой логин уже занят' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = {
      id: crypto.randomUUID(),
      username: String(username).trim(),
      passwordHash,
      createdAt: Date.now(),
      // Лайки/избранное теперь хранятся здесь — привязаны к аккаунту,
      // а не к браузеру (см. backend/routes/library.js: /library/likes).
      likes: { video: {}, music: {} },
    };
    users[key] = user;
    saveUsers(users);

    res.json({ token: signToken(user), username: user.username });
  } catch (e) {
    console.error('[ОШИБКА /auth/register]', e);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }
    const users = loadUsers();
    const user = users[normUsername(username)];
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ token: signToken(user), username: user.username });
  } catch (e) {
    console.error('[ОШИБКА /auth/login]', e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Используется auth-gate.js на фронте, чтобы молча проверить, не протух ли
// токен, лежащий в localStorage, без обязательной блокировки страницы.
router.get('/auth/me', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ username: payload.username });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

module.exports = router;
