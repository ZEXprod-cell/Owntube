// ══════════════════════════════════════════════════════════════
// AUTH GATE — экран входа/регистрации.
// Хранит JWT в localStorage, даёт остальным скриптам
// window.owntubeAuthHeader() для добавления Authorization в fetch.
// Подключать ПЕРВЫМ, до app.js и до скрипта скачивания.
//
// ПЕРЕДЕЛАНО по запросу:
//  1) Раньше это был непрозрачный полноэкранный блок на весь сайт,
//     похожий на заглушку-подтверждение возраста на "взрослых" сайтах.
//     Теперь — компактная карточка по центру с мягким блюром фона
//     в стиле остального интерфейса (акцентный зелёный, скругления),
//     а не сплошная чёрная заливка на всю страницу.
//  2) Раньше нигде в интерфейсе не было видно, что вы залогинены —
//     токен просто тихо лежал в localStorage. Добавлен компактный
//     блок в шапке (аватар + имя аккаунта + кнопка «Выйти»).
//  3) Кнопка скачивания в хедере была отодвинута от поля поиска
//     через margin-left:auto — теперь эта правка (через JS, без
//     трогания index.html) переносит margin-left:auto на блок
//     профиля, а кнопка скачивания встаёт вплотную к бару поиска.
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

  // ── ДОБАВЛЕНО: профиль в шапке (аватар + имя + «Выйти») ──────────
  function renderProfileBar() {
    const hdr = document.querySelector('.hdr');
    if (!hdr) return;
    const username = localStorage.getItem(STORAGE_USER_KEY);
    let bar = document.getElementById('authProfileBar');
    if (!username) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'authProfileBar';
      // margin-left:auto — именно этот блок теперь прижимается к правому
      // краю шапки; кнопка скачивания (repositionDownloadButton ниже)
      // остаётся рядом с полем поиска, а не улетает вправо.
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0;padding-left:10px;';
      hdr.appendChild(bar);
    }
    const initial = username.charAt(0).toUpperCase();
    bar.innerHTML = `
      <div style="width:28px;height:28px;border-radius:50%;background:#00ff85;color:#000;
        display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${initial}</div>
      <span title="${username}" style="color:#eee;font-size:13px;max-width:110px;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;">${username}</span>
      <button id="authLogoutBtn" style="background:transparent;border:1px solid #333;color:#aaa;
        padding:5px 10px;border-radius:7px;font-size:12px;cursor:pointer;transition:background .15s,color .15s;">Выйти</button>
    `;
    const btn = bar.querySelector('#authLogoutBtn');
    btn.onmouseenter = () => { btn.style.background = '#2a2a2a'; btn.style.color = '#fff'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = '#aaa'; };
    btn.onclick = window.owntubeLogout;
  }

  // ── ДОБАВЛЕНО: кнопку скачивания — вплотную к бару поиска ────────
  function repositionDownloadButton() {
    const dlBtn = document.getElementById('dlToggleBtn');
    if (dlBtn) dlBtn.style.marginLeft = '10px';
  }

  function applyHeaderTweaks() {
    renderProfileBar();
    repositionDownloadButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyHeaderTweaks);
  } else {
    // Скрипт подключён в конце body, поэтому обычно DOM уже готов —
    // на всякий случай пробуем сразу.
    applyHeaderTweaks();
  }

  const existingToken = localStorage.getItem(STORAGE_KEY);
  if (existingToken) {
    // Токен уже есть — не блокируем показ сайта, но в фоне проверим,
    // что он ещё не протух. Сервер офлайн — тоже не блокируем, реальные
    // запросы сами разберутся с 401, если что.
    fetch(`${API}/auth/me`, { headers: window.owntubeAuthHeader() })
      .then(r => { if (!r.ok) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_USER_KEY); showGate(); } })
      .catch(() => {});
    return;
  }

  showGate();

  function showGate() {
    if (document.getElementById('authGateOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'authGateOverlay';
    overlay.innerHTML = `
      <style>
        #authGateOverlay{position:fixed;inset:0;z-index:999999;
          background:rgba(8,8,10,.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
          display:flex;align-items:center;justify-content:center;
          font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
          opacity:0;transition:opacity .25s ease;}
        #authGateOverlay.in{opacity:1;}
        #authGateOverlay .ag-box{width:336px;max-width:90vw;padding:30px;border-radius:16px;
          background:#16161c;border:1px solid rgba(0,255,133,.18);
          box-shadow:0 20px 60px rgba(0,0,0,.55);
          transform:translateY(10px);transition:transform .25s ease;}
        #authGateOverlay.in .ag-box{transform:translateY(0);}
        #authGateOverlay .ag-brand{display:flex;align-items:center;gap:8px;margin-bottom:22px;}
        #authGateOverlay .ag-brand-ico{width:30px;height:22px;background:#00ff85;border-radius:6px;
          display:flex;align-items:center;justify-content:center;color:#000;font-size:12px;font-weight:800;}
        #authGateOverlay .ag-brand-name{font-size:18px;font-weight:800;color:#00ff85;}
        #authGateOverlay h2{margin:0 0 18px;font-size:16px;font-weight:500;color:#bbb;}
        #authGateOverlay input{width:100%;box-sizing:border-box;margin-bottom:10px;padding:11px 13px;
          border-radius:9px;border:1px solid #2a2a30;background:#0f0f13;color:#eee;font-size:14px;
          outline:0;transition:border-color .15s;}
        #authGateOverlay input:focus{border-color:#00ff85;}
        #authGateOverlay button#agSubmit{width:100%;padding:11px;border-radius:9px;border:none;
          background:#00ff85;color:#000;font-weight:700;cursor:pointer;margin-top:6px;font-size:14px;
          transition:background .15s;}
        #authGateOverlay button#agSubmit:hover{background:#00cc6a;}
        #authGateOverlay button#agSubmit:disabled{opacity:.6;cursor:default;}
        #authGateOverlay .ag-err{color:#ff5f5f;font-size:13px;margin-top:10px;min-height:16px;}
        #authGateOverlay .ag-tabs{display:flex;gap:6px;margin-bottom:18px;background:#101014;padding:4px;border-radius:10px;}
        #authGateOverlay .ag-tab{flex:1;text-align:center;padding:7px;border-radius:7px;cursor:pointer;
          color:#888;font-size:13px;transition:.15s;}
        #authGateOverlay .ag-tab.on{background:#242430;color:#fff;}
      </style>
      <div class="ag-box">
        <div class="ag-brand"><div class="ag-brand-ico">▶</div><div class="ag-brand-name">Owntube</div></div>
        <div class="ag-tabs">
          <div class="ag-tab on" data-mode="login">Вход</div>
          <div class="ag-tab" data-mode="register">Регистрация</div>
        </div>
        <h2 id="agTitle">Войдите в свой аккаунт</h2>
        <input id="agUser" placeholder="Логин" autocomplete="username" />
        <input id="agPass" type="password" placeholder="Пароль" autocomplete="current-password" />
        <input id="agCode" placeholder="Код регистрации" style="display:none" />
        <button id="agSubmit">Войти</button>
        <div class="ag-err" id="agErr"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));

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
      title.textContent = mode === 'login' ? 'Войдите в свой аккаунт' : 'Создайте аккаунт';
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
