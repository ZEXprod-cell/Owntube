// ══════════════════════════════════════════════════════════════
// AUTH GATE — экран входа/регистрации поверх сайта.
// Хранит JWT в localStorage, даёт остальным скриптам
// window.owntubeAuthHeader() для добавления Authorization в fetch.
// Подключать ПЕРВЫМ, до app.js и до скрипта скачивания.
// ══════════════════════════════════════════════════════════════
(() => {
  'use strict';

  const API = 'http://localhost:3001';
  const STORAGE_KEY = 'owntube_jwt';
  const STORAGE_USER_KEY = 'owntube_username';

  window.owntubeAuthHeader = function () {
    const token = localStorage.getItem(STORAGE_KEY);
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  };

  window.owntubeLogout = function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    location.reload();
  };

  const existingToken = localStorage.getItem(STORAGE_KEY);
  if (existingToken) {
    // Токен уже есть — не блокируем показ сайта, но в фоне проверим,
    // что он ещё не протух (сервер офлайн — тоже не блокируем, реальные
    // запросы сами разберутся с 401, если что).
    fetch(`${API}/auth/me`, { headers: window.owntubeAuthHeader() })
      .then(r => { if (!r.ok) showGate(); })
      .catch(() => {});
    return;
  }

  showGate();

  function showGate() {
    const overlay = document.createElement('div');
    overlay.id = 'authGateOverlay';
    overlay.innerHTML = `
      <style>
        #authGateOverlay{position:fixed;inset:0;z-index:999999;background:#0b0b0e;color:#eee;
          display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;}
        #authGateOverlay .ag-box{width:320px;padding:28px;border-radius:14px;background:#16161c;
          box-shadow:0 10px 40px rgba(0,0,0,.5);}
        #authGateOverlay h2{margin:0 0 18px;font-size:20px;}
        #authGateOverlay input{width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px 12px;
          border-radius:8px;border:1px solid #333;background:#0f0f13;color:#eee;font-size:14px;}
        #authGateOverlay button{width:100%;padding:10px;border-radius:8px;border:none;
          background:#6c5ce7;color:#fff;font-weight:600;cursor:pointer;margin-top:4px;font-size:14px;}
        #authGateOverlay .ag-err{color:#f44;font-size:13px;margin-top:8px;min-height:16px;}
        #authGateOverlay .ag-tabs{display:flex;gap:8px;margin-bottom:16px;}
        #authGateOverlay .ag-tab{flex:1;text-align:center;padding:6px;border-radius:8px;cursor:pointer;color:#888;}
        #authGateOverlay .ag-tab.on{background:#2a2a35;color:#fff;}
      </style>
      <div class="ag-box">
        <div class="ag-tabs">
          <div class="ag-tab on" data-mode="login">Вход</div>
          <div class="ag-tab" data-mode="register">Регистрация</div>
        </div>
        <h2 id="agTitle">Вход в Owntube</h2>
        <input id="agUser" placeholder="Логин" autocomplete="username" />
        <input id="agPass" type="password" placeholder="Пароль" autocomplete="current-password" />
        <input id="agCode" placeholder="Код регистрации" style="display:none" />
        <button id="agSubmit">Войти</button>
        <div class="ag-err" id="agErr"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    let mode = 'login';
    const tabs = overlay.querySelectorAll('.ag-tab');
    const title = overlay.querySelector('#agTitle');
    const codeInput = overlay.querySelector('#agCode');
    const submitBtn = overlay.querySelector('#agSubmit');
    const errEl = overlay.querySelector('#agErr');

    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      mode = tab.dataset.mode;
      title.textContent = mode === 'login' ? 'Вход в Owntube' : 'Регистрация';
      codeInput.style.display = mode === 'register' ? 'block' : 'none';
      submitBtn.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
      errEl.textContent = '';
    }));

    submitBtn.addEventListener('click', submit);
    overlay.querySelector('#agPass').addEventListener('keypress', e => { if (e.key === 'Enter') submit(); });

    async function submit() {
      const username = overlay.querySelector('#agUser').value.trim();
      const password = overlay.querySelector('#agPass').value;
      const code = overlay.querySelector('#agCode').value.trim();
      errEl.textContent = '';

      if (!username || !password) {
        errEl.textContent = 'Заполни логин и пароль';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      try {
        const urlPath = mode === 'login' ? '/auth/login' : '/auth/register';
        const res = await fetch(`${API}${urlPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, code })
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Ошибка';
          return;
        }
        localStorage.setItem(STORAGE_KEY, data.token);
        localStorage.setItem(STORAGE_USER_KEY, data.username);
        location.reload();
      } catch (e) {
        errEl.textContent = 'Сервер не отвечает (проверь backend на :3001)';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
      }
    }
  }
})();
