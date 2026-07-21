// ══════════════════════════════════════════════════════════════
// SERVER LIBRARY — серверная библиотека (стриминг с диска через сервер)
// ══════════════════════════════════════════════════════════════
(() => {
  'use strict';

  const API = 'http://localhost:3001';
  // ⚠️ Тот же токен, что в backend/config.js (API_TOKEN / OWNTUBE_TOKEN)
  const API_TOKEN = 'ЗАМЕНИ_НА_СВОЙ_ДЛИННЫЙ_СЛУЧАЙНЫЙ_ТОКЕН';

  const navBtn = document.getElementById('serverLibBtn');
  const page = document.getElementById('serverLibPage');
  const grid = document.getElementById('slibGrid');
  const status = document.getElementById('slibStatus');
  const tabs = document.getElementById('slibTabs');

  const playerWrap = document.getElementById('slibPlayer');
  const videoEl = document.getElementById('slibVideo');
  const audioWrap = document.getElementById('slibAudioBar');
  const audioEl = document.getElementById('slibAudio');
  const audioTitle = document.getElementById('slibAudioTitle');

  let mode = 'video';
  let cache = { video: null, music: null };
  let opened = false;

  function fmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return (mb / 1024).toFixed(2) + ' ГБ';
    return mb.toFixed(1) + ' МБ';
  }

  function hideAllOtherPages() {
    document.getElementById('mainC')?.style.setProperty('display', 'none');
    document.getElementById('vp')?.classList.remove('on');
    document.getElementById('musicPage')?.classList.remove('on');
    document.getElementById('dlPage')?.classList.remove('on');
    document.querySelectorAll('.si.on').forEach(el => el.classList.remove('on'));
  }

  function showOwnPage() {
    page.classList.add('on');
    navBtn.classList.add('on');
  }

  function hideOwnPage() {
    page.classList.remove('on');
    navBtn.classList.remove('on');
    document.getElementById('mainC')?.style.removeProperty('display');
  }

  async function fetchLibrary(kind) {
    if (cache[kind]) return cache[kind];
    // ✅ /library/* теперь требует токен — добавлен заголовок Authorization.
    // Сам стриминг (streamUrl) заголовок не несёт и не должен — он открыт.
    const res = await fetch(`${API}/library/${kind}`, {
      headers: { 'Authorization': 'Bearer ' + API_TOKEN }
    });
    if (res.status === 401) throw new Error('неверный токен доступа');
    if (!res.ok) throw new Error('Сервер ответил ' + res.status);
    const data = await res.json();
    cache[kind] = data.items || [];
    return cache[kind];
  }

  function render(items) {
    grid.innerHTML = '';
    if (!items.length) {
      status.textContent = mode === 'video'
        ? 'В папке F:\\new DlB ничего не найдено'
        : 'В папке F:\\biz.negr-off.twc ничего не найдено';
      return;
    }
    status.textContent = `Найдено: ${items.length}`;

    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'slib-card' + (mode === 'music' ? ' music' : '');
      card.dataset.path = it.relativePath;
      card.innerHTML = `
        <div class="slib-ico">${mode === 'video' ? '🎬' : '🎵'}</div>
        <div class="slib-card-info">
          <div class="slib-card-title">${escapeHtml(it.name)}</div>
          <div class="slib-card-meta">${fmtSize(it.size)}</div>
        </div>
      `;
      card.addEventListener('click', () => play(it));
      grid.appendChild(card);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function markPlaying(relativePath) {
    document.querySelectorAll('.slib-card').forEach(c => {
      c.classList.toggle('playing', c.dataset.path === relativePath);
    });
  }

  function play(item) {
    // streamUrl грузится напрямую через src — без заголовков, это открытый роут
    // на backend (см. server.js), токен тут не нужен и не сработает.
    playerWrap.style.display = 'block';
    markPlaying(item.relativePath);

    if (mode === 'video') {
      audioWrap.style.display = 'none';
      audioEl.pause();
      videoEl.style.display = 'block';
      videoEl.src = API + item.streamUrl;
      videoEl.play().catch(() => {});
    } else {
      videoEl.style.display = 'none';
      videoEl.pause();
      audioWrap.style.display = 'block';
      audioTitle.textContent = item.name;
      audioEl.src = API + item.streamUrl;
      audioEl.play().catch(() => {});
    }
    playerWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function load() {
    status.textContent = 'Загрузка списка...';
    grid.innerHTML = '';
    try {
      const items = await fetchLibrary(mode);
      render(items);
    } catch (e) {
      status.textContent = '❌ Сервер не отвечает (' + e.message + '). Проверь, что backend запущен на :3001';
    }
  }

  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    mode = tab.dataset.slib;
    playerWrap.style.display = 'none';
    videoEl.pause();
    audioEl.pause();
    load();
  });

  navBtn.addEventListener('click', () => {
    if (opened) {
      hideOwnPage();
      opened = false;
      return;
    }
    hideAllOtherPages();
    showOwnPage();
    opened = true;
    load();
  });

  document.querySelectorAll('.si').forEach(el => {
    el.addEventListener('click', () => {
      if (opened) {
        page.classList.remove('on');
        navBtn.classList.remove('on');
        document.getElementById('mainC')?.style.removeProperty('display');
        opened = false;
      }
    });
  });
})();
