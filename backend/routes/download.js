const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DEFAULT_DOWNLOADS_DIR, LIBRARY_VIDEO_DIR, LIBRARY_MUSIC_DIR, ALLOWED_BROWSERS } = require('../config');
const { listFiles, postProcessThumbs } = require('../lib/coverProcessing');

const router = express.Router();

const VIDEO_FORMATS = {
  'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
  '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]',
  '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]',
  '480':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]',
  '360':  'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]',
};
const ALLOWED_BITRATES = [64, 128, 192, 256, 320];

// Белый список папок, куда вообще разрешено скачивать (раньше outputDir
// принимался из req.body почти без проверки).
const ALLOWED_DOWNLOAD_DIRS = [DEFAULT_DOWNLOADS_DIR, LIBRARY_VIDEO_DIR, LIBRARY_MUSIC_DIR]
  .map(d => path.resolve(d));

// ИСПРАВЛЕНИЕ: на Windows файловая система нечувствительна к регистру, но
// строгое сравнение resolved-путей (===) — чувствительно. Путь с другим
// регистром букв (например, скопированный из другого места интерфейса),
// хотя и указывает на ту же самую папку на диске, раньше отклонялся как
// "недопустимая папка назначения". Сравниваем без учёта регистра на win32.
function normDir(p) {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}
const ALLOWED_DOWNLOAD_DIRS_NORM = ALLOWED_DOWNLOAD_DIRS.map(normDir);

// ДОБАВЛЕНО: разрешаем подпапки внутри разрешённых каталогов (например,
// "F:\new DlB\кибитка" — подпапка внутри LIBRARY_VIDEO_DIR), а не только
// точное совпадение с корнем. Раньше в такую подпапку скачать было нельзя —
// isAllowedDownloadDir признавала только буквальный корневой путь.
function isAllowedDownloadDir(dir) {
  const resolved = normDir(dir);
  return ALLOWED_DOWNLOAD_DIRS_NORM.some(
    root => resolved === root || resolved.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))
  );
}

// (embedThumb больше не принимаем — параметр был мёртвым: обложка встраивается
// по thumbMode, embedThumb ни на что не влиял.)
function buildArgs({ type, quality, numbering, browser, dir, url, noPlaylist }) {
  const args = [
    '--no-mtime',
    '--ignore-errors',
    '--windows-filenames',
    '--no-part',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '30',
    '--concurrent-fragments', '4',
    '--cookies-from-browser', browser
  ];

  if (noPlaylist) {
    args.push('--no-playlist');
    numbering = false;
  }

  if (type === 'music' || type === 'audio') {
    const bitrateNum = parseInt(quality, 10);
    const bitrate = ALLOWED_BITRATES.includes(bitrateNum) ? bitrateNum : 192;

    args.push(
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '-x', '--audio-format', 'mp3',
      '--postprocessor-args', `ffmpeg:-b:a ${bitrate}k -id3v2_version 3`,
      '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '--embed-metadata',
      '--parse-metadata', '%(playlist_title,playlist|)s:%(meta_album)s'
    );
    if (numbering) {
      args.push('--parse-metadata', '%(playlist_index|)s:%(meta_track)s');
    }
  } else {
    const fmt = VIDEO_FORMATS[quality] || VIDEO_FORMATS.best;
    args.push(
      '-f', fmt, '--merge-output-format', 'mp4', '--write-thumbnail', '--no-embed-thumbnail',
      // ДОБАВЛЕНО: запись автора и названия видео в метаданные файла
      // (не только в имя файла) — title/artist-теги внутри самого mp4.
      '--embed-metadata',
      '--parse-metadata', '%(uploader,channel,artist|Неизвестно)s:%(meta_artist)s',
      '--parse-metadata', '%(title)s:%(meta_title)s'
    );
  }

  const nameTemplate = numbering
    ? '%(playlist_index)02d - %(artist,uploader)s - %(title)s.%(ext)s'
    : '%(artist,uploader)s - %(title)s.%(ext)s';

  args.push('-o', path.join(dir, nameTemplate), url);
  return args;
}

router.post('/download', async (req, res) => {
  const {
    url,
    type = 'video',
    quality = 'best',
    numbering = true,
    thumbMode = 2,
    outputDir = DEFAULT_DOWNLOADS_DIR,
    browser = 'firefox',
    noPlaylist = false
  } = req.body;

  if (!url) return res.status(400).json({ error: 'URL не передан' });

  const dir = path.resolve(outputDir);
  if (!isAllowedDownloadDir(dir)) {
    console.warn('[download] отклонён путь:', dir, '| разрешены:', ALLOWED_DOWNLOAD_DIRS);
    return res.status(403).json({
      error: 'Недопустимая папка назначения',
      received: dir,
      allowed: ALLOWED_DOWNLOAD_DIRS,
    });
  }

  const safeBrowser = ALLOWED_BROWSERS.includes(browser) ? browser : 'firefox';

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const isMusic = type === 'music' || type === 'audio';
  const beforeExts = isMusic ? ['.mp3'] : ['.mp4', '.webm', '.mkv'];
  const before = new Set(listFiles(dir, beforeExts));

  const args = buildArgs({ type, quality, numbering, browser: safeBrowser, dir, url, noPlaylist });
  console.log(`\n[ЗАПУСК] ${type.toUpperCase()} → ${url}${noPlaylist ? ' (только одно видео)' : ''}`);

  // spawn с массивом аргументов (не строкой) — уже безопасен от shell-инъекций.
  const yt = spawn('yt-dlp', args, {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  const logs = [];

  yt.stdout.setEncoding('utf8');
  yt.stderr.setEncoding('utf8');
  yt.stdout.on('data', data => {
    const line = data.toString().trim();
    if (line) { console.log(line); logs.push(line); }
  });
  yt.stderr.on('data', data => console.error(data.toString().trim()));

  yt.on('close', async code => {
    console.log(`[ГОТОВО] Код выхода: ${code}`);
    try {
      if (isMusic && code === 0) {
        const after = listFiles(dir, ['.mp3']);
        const newMp3 = after.filter(f => !before.has(f));
        await postProcessThumbs(dir, newMp3, thumbMode);
      }
    } catch (e) {
      console.error('[ОШИБКА постобработки обложек]', e);
    }
    res.json({ success: code === 0, code, logs });
  });

  yt.on('error', err => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: err.message });
  });
});

module.exports = router;
