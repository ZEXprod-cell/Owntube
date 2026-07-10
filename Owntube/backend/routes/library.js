const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const mm = require('music-metadata');
const {
  LIBRARY_VIDEO_DIR,
  LIBRARY_MUSIC_DIR,
  VIDEO_EXTENSIONS,
  MUSIC_EXTENSIONS,
} = require('../config');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const router = express.Router();

// ============================================================
// ДИСК-КЭШИ (переживают перезапуск сервера)
// ============================================================
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const COVERS_DIR = path.join(CACHE_DIR, 'covers');
const DIMS_CACHE_PATH = path.join(CACHE_DIR, 'dims_cache.json');
const MUSIC_CACHE_PATH = path.join(CACHE_DIR, 'music_cache.json');

for (const dir of [CACHE_DIR, COVERS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.warn(`[cache] не удалось прочитать ${filePath}:`, e.message);
  }
  return fallback;
}

function makeDebouncedSaver(filePath, getData, delayMs = 3000) {
  let dirty = false, timer = null;
  return function markDirty() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) return;
      dirty = false;
      fs.writeFile(filePath, JSON.stringify(getData()), (err) => {
        if (err) console.warn(`[cache] ошибка записи ${filePath}:`, err.message);
      });
    }, delayMs);
  };
}

// ---------------- Ориентация видео (ffprobe) ----------------
let dimsCache = loadJsonSafe(DIMS_CACHE_PATH, {});
const markDimsDirty = makeDebouncedSaver(DIMS_CACHE_PATH, () => dimsCache);

function probeDimensions(absPath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      absPath
    ], { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const [w, h] = stdout.trim().split(',').map(Number);
      if (!w || !h) return resolve(null);
      resolve({ width: w, height: h, vertical: h > w });
    });
  });
}

const probeQueue = [];
const probeInFlight = new Set();
let probeRunning = false;

function enqueueProbe(relativePath, absPath, size, mtime) {
  if (probeInFlight.has(relativePath)) return;
  probeInFlight.add(relativePath);
  probeQueue.push({ relativePath, absPath, size, mtime });
  if (!probeRunning) runProbeQueue();
}

async function runProbeQueue() {
  probeRunning = true;
  const CONC = 4;
  while (probeQueue.length) {
    const batch = probeQueue.splice(0, CONC);
    await Promise.all(batch.map(async ({ relativePath, absPath, size, mtime }) => {
      const dims = await probeDimensions(absPath);
      dimsCache[relativePath] = { size, mtime, vertical: dims ? dims.vertical : false };
      probeInFlight.delete(relativePath);
      markDimsDirty();
    }));
  }
  probeRunning = false;
}

function getVerticalFast(relativePath, absPath, size, mtime) {
  const cached = dimsCache[relativePath];
  if (cached && cached.size === size && cached.mtime === mtime) return cached.vertical;
  enqueueProbe(relativePath, absPath, size, mtime);
  return cached ? cached.vertical : false; // отдаём старое значение, пока считается новое
}

// ---------------- Обход директории ----------------
async function walkLibrary(dir, extensions, base = '') {
  if (!fs.existsSync(dir)) return [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (e) => {
      const rel = path.join(base, e.name);
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) return walkLibrary(abs, extensions, rel);
      const ext = path.extname(e.name).toLowerCase();
      if (!extensions.includes(ext)) return [];
      let stat;
      try { stat = await fs.promises.stat(abs); } catch { return []; }
      return [{
        name: path.basename(e.name, ext),
        fullName: e.name,
        relativePath: rel.replace(/\\/g, '/'),
        size: stat.size,
        mtime: stat.mtimeMs,
      }];
    })
  );
  return results.flat();
}

// ============================================================
// ВИДЕО
// ============================================================
router.get('/library/video', async (req, res) => {
  try {
    const items = await walkLibrary(LIBRARY_VIDEO_DIR, VIDEO_EXTENSIONS);
    const withUrls = items.map(it => {
      const absPath = path.join(LIBRARY_VIDEO_DIR, it.relativePath);
      const vertical = getVerticalFast(it.relativePath, absPath, it.size, it.mtime);
      return {
        ...it,
        vertical,
        streamUrl: `/stream/video/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`,
      };
    });
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: withUrls });
  } catch (err) {
    console.error('[ОШИБКА /library/video]', err);
    res.status(500).json({ error: 'Не удалось прочитать видео-библиотеку' });
  }
});

// ============================================================
// МУЗЫКА — теги (без base64!) + обложки на диске
// ============================================================
const audioTagsCache = new Map(); // relativePath -> { size, mtime, tags }

function coverCacheBase(relativePath) {
  const hash = crypto.createHash('md5').update(relativePath).digest('hex');
  return path.join(COVERS_DIR, hash);
}

// Извлекает обложку один раз и кладёт на диск. При повторных вызовах — просто читает существующий файл.
async function extractAndCacheCover(absPath, relativePath) {
  const base = coverCacheBase(relativePath);
  for (const ext of ['.jpg', '.png', '.none']) {
    if (fs.existsSync(base + ext)) return ext === '.none' ? null : base + ext;
  }
  try {
    const metadata = await mm.parseFile(absPath, { duration: false, skipCovers: false });
    const pic = metadata.common.picture && metadata.common.picture[0];
    if (!pic) { fs.writeFileSync(base + '.none', ''); return null; }
    const ext = (pic.format || 'image/jpeg').includes('png') ? '.png' : '.jpg';
    const filePath = base + ext;
    fs.writeFileSync(filePath, pic.data);
    return filePath;
  } catch (e) {
    fs.writeFileSync(base + '.none', '');
    return null;
  }
}

async function readAudioTags(absPath, relativePath, size, mtime) {
  const cached = audioTagsCache.get(relativePath);
  if (cached && cached.size === size && cached.mtime === mtime) return cached.tags;
  let tags;
  try {
    const metadata = await mm.parseFile(absPath, { duration: false, skipCovers: true });
    const c = metadata.common;
    tags = {
      title: c.title || null,
      artist: c.artist || null,
      album: c.album || null,
      // Неправдоподобные номера (> 100) — почти всегда артефакт старых скачиваний,
      // где в TRCK записывался playlist_index YouTube-плейлиста, а не реальный № трека в альбоме.
      trackNumber: (c.track && c.track.no && c.track.no <= 100) ? c.track.no : null,
    };
  } catch {
    tags = { title: null, artist: null, album: null, trackNumber: null };
  }
  audioTagsCache.set(relativePath, { size, mtime, tags });
  return tags;
}

// ---------------- Снапшот директории для быстрой проверки изменений ----------------
let musicSnapshot = null;
let musicLibraryCache = loadJsonSafe(MUSIC_CACHE_PATH, null);
let musicBuilding = false;

function computeSnapshot(items) {
  const m = new Map();
  items.forEach(it => m.set(it.relativePath, `${it.size}_${it.mtime}`));
  return m;
}
function snapshotsEqual(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

async function buildMusicLibrary() {
  const items = await walkLibrary(LIBRARY_MUSIC_DIR, MUSIC_EXTENSIONS);
  const concurrency = 8;
  const results = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (it) => {
        const absPath = path.join(LIBRARY_MUSIC_DIR, it.relativePath);
        const tags = await readAudioTags(absPath, it.relativePath, it.size, it.mtime);
        const coverPath = await extractAndCacheCover(absPath, it.relativePath);
        return {
          ...it,
          ...tags,
          hasCover: !!coverPath,
          coverUrl: coverPath
            ? `/cover/music/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`
            : null,
          streamUrl: `/stream/music/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`,
        };
      })
    );
    results.push(...chunkResults);
  }
  return { items: results, snapshot: computeSnapshot(items) };
}

const markMusicCacheDirty = makeDebouncedSaver(MUSIC_CACHE_PATH, () => musicLibraryCache, 2000);

async function refreshMusicLibrary() {
  if (musicBuilding) return;
  musicBuilding = true;
  try {
    const { items, snapshot } = await buildMusicLibrary();
    musicLibraryCache = items;
    musicSnapshot = snapshot;
    markMusicCacheDirty();
    console.log(`[music] библиотека обновлена: ${items.length} треков`);
  } catch (e) {
    console.warn('[music] ошибка обновления библиотеки:', e.message);
  } finally {
    musicBuilding = false;
  }
}

// Быстрая (без парсинга тегов) проверка — изменилась ли папка вообще
async function hasLibraryChanged() {
  try {
    const items = await walkLibrary(LIBRARY_MUSIC_DIR, MUSIC_EXTENSIONS);
    const snap = computeSnapshot(items);
    const changed = !musicSnapshot || !snapshotsEqual(musicSnapshot, snap);
    if (changed) musicSnapshot = snap;
    return changed;
  } catch {
    return false;
  }
}

// Отдаём кэш МГНОВЕННО, обновляем в фоне (stale-while-revalidate)
router.get('/library/music', async (req, res) => {
  try {
    if (!musicLibraryCache) {
      await refreshMusicLibrary(); // первый холодный запуск — ждём
      return res.json({ items: musicLibraryCache || [] });
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: musicLibraryCache });

    hasLibraryChanged().then(changed => { if (changed) refreshMusicLibrary(); });

  } catch (err) {
    console.error('[ОШИБКА /library/music]', err);
    if (musicLibraryCache) return res.json({ items: musicLibraryCache });
    res.status(500).json({ error: 'Не удалось прочитать музыкальную библиотеку' });
  }
});

// Ручное принудительное обновление (можно дёрнуть с фронта кнопкой "Обновить")
router.post('/library/music/refresh', async (req, res) => {
  await refreshMusicLibrary();
  res.json({ ok: true, count: (musicLibraryCache || []).length });
});

// ============================================================
// ОБЛОЖКИ — читаем уже извлечённый файл с диска (быстро, кэшируется браузером)
// ============================================================
router.get('/cover/music/*', (req, res) => {
  try {
    const relativePath = decodeURIComponent(req.params[0]);
    const base = coverCacheBase(relativePath);
    for (const ext of ['.jpg', '.png']) {
      if (fs.existsSync(base + ext)) {
        res.setHeader('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return fs.createReadStream(base + ext).pipe(res);
      }
    }
    res.status(404).end();
  } catch (err) {
    console.error('[ОШИБКА /cover/music]', err);
    res.status(500).end();
  }
});

// ============================================================
// СТРИМИНГ ФАЙЛОВ
// ============================================================
router.use('/stream/video', express.static(LIBRARY_VIDEO_DIR, {
  setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes'),
}));
router.use('/stream/music', express.static(LIBRARY_MUSIC_DIR, {
  setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes'),
}));

// Прогрев кэша при старте
setTimeout(() => { console.log('[music] прогрев кэша...'); refreshMusicLibrary(); }, 1500);

module.exports = router;