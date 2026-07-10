// ══════════ СКРИПТ ДЛЯ НОВОЙ СКАЧИВАЛКИ В ХЕДЕРЕ ══════════

// === ПУТИ ПО УМОЛЧАНИЮ (изменено: audio → music) ===
// Пути соответствуют LIBRARY_MUSIC_DIR / LIBRARY_VIDEO_DIR из backend/config.js —
// именно эти папки сканирует /library/video и /library/music
const DEFAULT_PATHS = {
  music: "F:\\biz.negr-off.twc",
  video: "F:\\new DlB"
};

// Качества по твоим требованиям
function updateQualityOptions() {
  const typeSel = document.getElementById('dlTypeInline');
  const qualSel = document.getElementById('dlQualityInline');
  qualSel.innerHTML = '';

  if (typeSel.value === 'audio') {
    qualSel.innerHTML = `
      <option value="320">320 kbps</option>
      <option value="256">256 kbps</option>
      <option value="192" selected>192 kbps</option>
      <option value="128">128 kbps</option>
    `;
  } else {
    qualSel.innerHTML = `
      <option value="best">Лучшее</option>
      <option value="1080">1080p</option>
      <option value="720" selected>720p</option>
      <option value="480">480p</option>
      <option value="360">360p</option>
    `;
  }
}

document.getElementById('dlTypeInline').addEventListener('change', updateQualityOptions);
updateQualityOptions();

// Само скачивание (обновлённая версия)
async function startDownloadInline() {
  const url = document.getElementById('dlUrlInline').value.trim();
  if (!url) { 
    alert('Кинь ссылку, мудила'); 
    return; 
  }

  // ========== ИЗМЕНЕНИЕ ТУТ ==========
  let type = document.getElementById('dlTypeInline').value;
  if (type === 'audio') type = 'music';
  // ===================================

  const quality = document.getElementById('dlQualityInline').value;
  const numbering = document.getElementById('dlNumberingInline').checked;
  const thumbMode = document.getElementById('dlThumbModeInline')
    ? document.getElementById('dlThumbModeInline').value
    : 2;

  const prog = document.getElementById('dlProgressInline');
  const fill = document.getElementById('dlProgFill');
  const text = document.getElementById('dlProgText');

  prog.style.display = 'flex';
  fill.style.width = '10%';
  text.textContent = 'Запуск yt-dlp...';

  try {
    const res = await fetch('http://localhost:3001/download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url, 
        type, 
        quality, 
        numbering,
        thumbMode,
        embedThumb: true, 
        browser: 'firefox',
        outputDir: DEFAULT_PATHS[type] || DEFAULT_PATHS.music   // защита
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      fill.style.width = '100%';
      text.textContent = `✅ ${type.toUpperCase()} (${numbering ? 'с №' : 'без'})`;
      console.log(`%c[ЗАКАЧАНО → ${DEFAULT_PATHS[type] || 'default'}]`, 'color:#00ff85; font-weight:bold');
    } else {
      text.textContent = '❌ Ошибка';
      alert('Ошибка скачивания: ' + (data.error || data.logs?.join('\n') || 'неизвестно'));
    }
  } catch(e) {
    text.textContent = '❌ Нет соединения';
    alert('Сервер не отвечает. Запусти server.js заново');
  } finally {
    setTimeout(() => {
      prog.style.display = 'none';
      document.getElementById('dlUrlInline').value = '';
    }, 2800);
  }
}

document.getElementById('dlBtnInline').addEventListener('click', startDownloadInline);
// Toggle
const _dlp = document.getElementById('dlInline');
const _dlb = document.getElementById('dlToggleBtn');
function _dlOpen(){
  _dlp.style.transition='transform .22s cubic-bezier(0,0,.4,1),opacity .22s cubic-bezier(0,0,.4,1)';
  _dlp.classList.add('open');
  setTimeout(()=>document.getElementById('dlUrlInline').focus(),40);
}
function _dlClose(){
  _dlp.style.transition='transform .18s cubic-bezier(.6,0,1,1),opacity .18s cubic-bezier(.6,0,1,1)';
  _dlp.classList.remove('open');
}
_dlb.addEventListener('click',e=>{e.stopPropagation();_dlp.classList.contains('open')?_dlClose():_dlOpen();});
document.addEventListener('click',e=>{if(_dlp.classList.contains('open')&&!_dlp.contains(e.target)&&e.target!==_dlb)_dlClose();});
document.getElementById('dlUrlInline').addEventListener('keypress', e => {
  if (e.key === 'Enter') startDownloadInline();
});
