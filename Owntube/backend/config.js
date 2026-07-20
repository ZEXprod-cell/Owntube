const path = require('path');

module.exports = {
  PORT: 3001,
  DEFAULT_DOWNLOADS_DIR: path.resolve('./downloads'),

  COVERS_DIR: path.resolve('F:/(8 фелиал АДА)sLOW/covers'),
  ANIM_DIR:  path.resolve('F:/(8 фелиал АДА)sLOW/anim'),

  LIBRARY_VIDEO_DIR: path.resolve('F:/new DlB'),
  LIBRARY_MUSIC_DIR: path.resolve('F:/biz.negr-off.twc'),

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
