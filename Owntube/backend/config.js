const path = require('path');

module.exports = {
  PORT: 3001,
  DEFAULT_DOWNLOADS_DIR: path.resolve('./downloads'),

  COVERS_DIR: 'F:/(8 фелиал АДА)sLOW/covers',
  ANIM_DIR:  'F:/(8 фелиал АДА)sLOW/anim',
  // ДОБАВЛЕНО: папка со статичными обложками для видео (jpg/png/webp).
  // Имя файла обложки сопоставляется с именем видео так же, как ANIM_DIR
  // сопоставляется по имени (backend/routes/library.js: findCoverForVideo).
  // Если папки не существует — просто не будет обложек, ничего не сломается.
  VIDEO_COVERS_DIR: 'F:/(8 фелиал АДА)sLOW/vid cover',

  LIBRARY_VIDEO_DIR: 'F:/new DlB',
  LIBRARY_MUSIC_DIR: 'F:/biz.negr-off.twc',

  VIDEO_EXTENSIONS: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'],
  MUSIC_EXTENSIONS: ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac'],

  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://owntube.ai',
    'http://www.owntube.ai',
  ],

  ALLOWED_BROWSERS: ['firefox', 'chrome', 'edge', 'brave'],
  REGISTRATION_CODE: 'пенис негра',
};