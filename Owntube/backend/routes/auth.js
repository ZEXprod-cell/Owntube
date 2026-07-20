const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { REGISTRATION_CODE } = require('../config');
const { loadUsers, saveUsers, getJwtSecret } = require('../lib/authStore');

const router = express.Router();
const JWT_SECRET = getJwtSecret();

router.post('/auth/register', async (req, res) => {
  const { username, password, code } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  if (code !== REGISTRATION_CODE) return res.status(403).json({ error: 'Неверный код регистрации' });
  const users = loadUsers();
  if (users[username]) return res.status(409).json({ error: 'Пользователь уже существует' });
  users[username] = { hash: await bcrypt.hash(password, 10), createdAt: Date.now() };
  saveUsers(users);
  const token = jwt.sign({ sub: username, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  const users = loadUsers();
  const user = users[username];
  if (!user || !(await bcrypt.compare(password, user.hash))) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ sub: username, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

router.get('/auth/me', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const p = jwt.verify(token, JWT_SECRET);
    res.json({ username: p.username, sub: p.sub });
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
});

module.exports = router;
