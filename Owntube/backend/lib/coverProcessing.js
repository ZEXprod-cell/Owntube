const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Обложку вшиваем через node-id3, а не через ffmpeg-муксинг: ffmpeg иногда
// пишет APIC-фрейм так, что его не читает music-metadata на бэкенде (сайт не
// видит обложку), хотя Проводник Windows её показывает. node-id3 пишет по спеке чётко.
let NodeID3;
try { NodeID3 = require('node-id3'); } catch { NodeID3 = null; }

function listFiles(dir, exts) {
  try {
    return fs.readdirSync(dir).filter(f => exts.includes(path.extname(f).toLowerCase()));
  } catch { return []; }
}

function processCover(srcPath, dstPath, size = 512) {
  return new Promise((resolve) => {
    const vf = `crop=min(iw\\,ih):min(iw\\,ih):(iw-ow)/2:(ih-oh)/2,scale=${size}:${size}:flags=lanczos`;
    execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', srcPath, '-vf', vf, '-frames:v', '1', '-q:v', '2', dstPath, '-y'],
      (err) => resolve(!err && fs.existsSync(dstPath)));
  });
}

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

module.exports = { listFiles, postProcessThumbs };
