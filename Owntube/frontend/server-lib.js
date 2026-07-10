// ══════════════════════════════════════════════════════════════
// SERVER LIBRARY — серверная библиотека (стриминг с диска через сервер)
// Полностью независим от основной системы (IndexedDB/локальные папки),
// поэтому ничего в app.js не трогает.
// ══════════════════════════════════════════════════════════════
(() => {
  'use strict';

  // Адрес сервера вычисляем динамически: с какого хоста открыт сайт (ПК или телефон
  // в локальной сети), на тот же хост и стучимся, просто на порт 3001
  const API = `${location.protocol}//${location.hostname}:3001`;

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

  let mode = 'video'; // 'video' | 'music'
  let cache = { video: null, music: null };
  let opened = false;

  function fmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return (mb / 1024).toFixed(2) + ' ГБ';
    return mb.toFixed(1) + ' МБ';
  }

  function hideAllOtherPages() {
    // Скрываем стандартные страницы так же, как это делает их собственный CSS-класс,
    // не вызывая внутренние функции app.js (они в замкнутой области видимости).
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
    const res = await fetch(`${API}/library/${kind}`);
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

  // Если пользователь ушёл на другой обычный пункт меню — закрываем нашу страницу
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
