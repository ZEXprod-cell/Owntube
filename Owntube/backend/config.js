const path = require('path');

module.exports = {
  PORT: 3001,
  DEFAULT_DOWNLOADS_DIR: path.resolve('./downloads'),
  // ⚠️ Жёстко зашитый путь — если переносишь сервер на другую машину/диск, поправь здесь
  COVERS_DIR: 'F:\\(8 фелиал АДА)sLOW\\covers',
  ANIM_DIR: String.raw`F:\(8 фелиал АДА)sLOW\anim`,

  // ====================== СЕРВЕРНАЯ БИБЛИОТЕКА (стриминг с диска) ======================
  // Папки, которые сервер сканирует сам и стримит напрямую, без скачивания/IndexedDB
  LIBRARY_VIDEO_DIR: 'F:\\new DlB',
  LIBRARY_MUSIC_DIR: 'F:\\biz.negr-off.twc',

  VIDEO_EXTENSIONS: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'],
  MUSIC_EXTENSIONS: ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac'],
};
const path = require('path');

module.exports = {
  PORT: 3001,
  DEFAULT_DOWNLOADS_DIR: path.resolve('./downloads'),
  // ⚠️ Жёстко зашитый путь — если переносишь сервер на другую машину/диск, поправь здесь
  COVERS_DIR: 'F:\\(8 фелиал АДА)sLOW\\covers',

  // ====================== СЕРВЕРНАЯ БИБЛИОТЕКА (стриминг с диска) ======================
  // Папки, которые сервер сканирует сам и стримит напрямую, без скачивания/IndexedDB
  LIBRARY_VIDEO_DIR: 'F:\\new DlB',
  LIBRARY_MUSIC_DIR: 'F:\\biz.negr-off.twc',

  VIDEO_EXTENSIONS: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'],
  MUSIC_EXTENSIONS: ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac'],
};
