const express = require('express');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DEFAULT_DOWNLOADS_DIR } = require('../config');

const router = express.Router();

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

const VIDEO_FORMATS = {
  'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
  '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]',
  '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]',
  '480':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]',
  '360':  'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]',
};
const ALLOWED_BITRATES = [64, 128, 192, 256, 320];

function buildArgs({ type, quality, numbering, embedThumb, browser, dir, url, noPlaylist }) {
  // --no-playlist добавляем ТОЛЬКО если явно попросили скачать одно видео,
  // а не весь плейлист по ссылке. При этом принудительно отключаем нумерацию
  // (playlist_index в шаблоне имени) — иначе именно комбинация
  // "--no-playlist + playlist_index в шаблоне" вызывала артефакт нумерации
  // (все файлы получали один и тот же индекс).
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
    args.push('-f', fmt, '--merge-output-format', 'mp4', '--write-thumbnail', '--no-embed-thumbnail');
  }

  const nameTemplate = numbering
    ? '%(playlist_index)02d - %(artist,uploader)s - %(title)s.%(ext)s'
    : '%(artist,uploader)s - %(title)s.%(ext)s';

  args.push('-o', path.join(dir, nameTemplate), url);
  return args;
}

function processCover(srcPath, dstPath, size = 512) {
  return new Promise((resolve) => {
    const vf = `crop=min(iw\\,ih):min(iw\\,ih):(iw-ow)/2:(ih-oh)/2,scale=${size}:${size}:flags=lanczos`;
    execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', srcPath, '-vf', vf, '-frames:v', '1', '-q:v', '2', dstPath, '-y'],
      (err) => resolve(!err && fs.existsSync(dstPath)));
  });
}

// ВАЖНО: обложку вшиваем через node-id3, а не через ffmpeg-муксинг.
// ffmpeg иногда пишет APIC-фрейм так, что его не может прочитать music-metadata
// на бэкенде (сайт не видит обложку), хотя Проводник Windows её показывает —
// он гораздо терпимее к нестандартным ID3-фреймам. node-id3 пишет по спеке чётко.
let NodeID3;
try { NodeID3 = require('node-id3'); } catch { NodeID3 = null; }

function embedCoverIntoMp3(mp3Path, coverPath) {
  return new Promise((resolve) => {
    if (!NodeID3) {
      console.error('[ОБЛОЖКА] Пакет node-id3 не установлен — выполните: npm install node-id3');
      return resolve(false);
    }
    try {
      const imageBuffer = fs.readFileSync(coverPath);
      const ok = NodeID3.update({
        image: {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: '',
          imageBuffer
        }
      }, mp3Path);
      resolve(!!ok);
    } catch (e) {
      console.error('[ОШИБКА вшивания обложки]', e);
      resolve(false);
    }
  });
}

function listFiles(dir, exts) {
  try {
    return fs.readdirSync(dir).filter(f => exts.includes(path.extname(f).toLowerCase()));
  } catch { return []; }
}

async function postProcessThumbs(dir, newMp3Names, thumbMode) {
  if (thumbMode === 3 || thumbMode === '3') return;

  const rawThumbs = listFiles(dir, ['.jpg', '.jpeg', '.webp', '.png']);

  if (thumbMode === 1 || thumbMode === '1') {
    const first = rawThumbs[0];
    if (!first) return;
    const folderCover = path.join(dir, '_folder_cover_512.jpg');
    const ok = await processCover(path.join(dir, first), folderCover, 512);
    if (!ok) return;
    for (const name of newMp3Names) {
      await embedCoverIntoMp3(path.join(dir, name), folderCover);
    }
    try { fs.unlinkSync(folderCover); } catch {}
  } else {
    for (const name of newMp3Names) {
      const base = path.basename(name, path.extname(name));
      const rawCover = rawThumbs.find(t => path.basename(t, path.extname(t)) === base);
      if (!rawCover) continue;
      const cropped = path.join(dir, base + '_cvr_512.jpg');
      const ok = await processCover(path.join(dir, rawCover), cropped, 512);
      if (ok) {
        await embedCoverIntoMp3(path.join(dir, name), cropped);
        try { fs.unlinkSync(cropped); } catch {}
      }
    }
  }
  for (const t of listFiles(dir, ['.jpg', '.jpeg', '.webp', '.png'])) {
    try { fs.unlinkSync(path.join(dir, t)); } catch {}
  }
}

router.post('/download', async (req, res) => {
  const {
    url,
    type = 'video',
    quality = 'best',
    numbering = true,
    embedThumb = true,
    thumbMode = 2,
    outputDir = DEFAULT_DOWNLOADS_DIR,
    browser = 'firefox',
    noPlaylist = false
  } = req.body;

  if (!url) return res.status(400).json({ error: 'URL не передан' });

  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const isMusic = type === 'music' || type === 'audio';
  const beforeExts = isMusic ? ['.mp3'] : ['.mp4', '.webm', '.mkv'];
  const before = new Set(listFiles(dir, beforeExts));

  const args = buildArgs({ type, quality, numbering, embedThumb, browser, dir, url, noPlaylist });
  console.log(`\n[ЗАПУСК] ${type.toUpperCase()} → ${url}${noPlaylist ? ' (только одно видео)' : ''}`);

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
