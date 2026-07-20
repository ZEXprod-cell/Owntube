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

// === ПУТИ — РЕШАЕМ ОДИН РАЗ И РАНО ===
const VIDEO_DIR = path.resolve(LIBRARY_VIDEO_DIR);
const MUSIC_DIR = path.resolve(LIBRARY_MUSIC_DIR);
let ANIM_DIR = null;
try { ANIM_DIR = require('../config').ANIM_DIR; } catch (e) {}
if (!ANIM_DIR) ANIM_DIR = 'F:/(8 фелиал АДА)sLOW/anim';
ANIM_DIR = path.resolve(ANIM_DIR);

console.log('[config] VIDEO_DIR =', VIDEO_DIR);
console.log('[config] MUSIC_DIR =', MUSIC_DIR);
console.log('[config] ANIM_DIR  =', ANIM_DIR);

// === АНИМИРОВАННЫЕ ОБЛОЖКИ ===
const ANIM_EXTENSIONS = ['.gif', '.webm'];

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const router = express.Router();

// === КЭШИ ===
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const COVERS_DIR = path.join(CACHE_DIR, 'covers');
const DIMS_CACHE_PATH = path.join(CACHE_DIR, 'dims_cache.json');
const MUSIC_CACHE_PATH = path.join(CACHE_DIR, 'music_cache.json');
const ANIM_MATCHES_CACHE_PATH = path.join(CACHE_DIR, 'anim_matches_cache.json');

for (const dir of [CACHE_DIR, COVERS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {}
  return fallback;
}

function saveJsonSync(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8'); } catch (e) {}
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
      fs.writeFile(filePath, JSON.stringify(getData()), (err) => {});
    }, delayMs);
  };
}

function norm(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9а-яё\u0400-\u04FF]/g, ' ').replace(/\s+/g, ' ').trim();
}

// === АНИМ-ОБЛОЖКИ (асинхронный скан) ===
let animMap = new Map();
const ANIM_CACHE_TTL = 60000;

async function refreshAnimMapAsync() {
  const next = new Map();
  if (!fs.existsSync(ANIM_DIR)) {
    console.warn('[anim] папка НЕ НАЙДЕНА:', ANIM_DIR);
    animMap = next;
    return;
  }
  try {
    async function walk(dir) {
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!ANIM_EXTENSIONS.includes(ext)) continue;
        const nameNorm = norm(path.basename(e.name, ext));
        const type = ext === '.gif' ? 'image/gif' : 'video/webm';
        const rel = path.relative(ANIM_DIR, abs).replace(/\\/g, '/');
        if (!next.has(nameNorm) || ext === '.webm') {
          next.set(nameNorm, {
            filename: e.name,
            relPath: rel,
            type,
            streamUrl: '/stream/anim/' + encodeURIComponent(rel).replace(/%2F/g, '/'),
          });
        }
      }
    }
    await walk(ANIM_DIR);
    animMap = next;
    console.log(`[anim] найдено ${animMap.size} аним-обложек в ${ANIM_DIR}`);
  } catch (err) {
    console.error('[anim] ошибка сканирования:', err.message);
  }
}

function scanAnimDir() { return animMap; }

refreshAnimMapAsync();
setInterval(refreshAnimMapAsync, ANIM_CACHE_TTL);

function findAnimCoverForTrack(tags, name) {
  const map = scanAnimDir();
  if (tags && tags.album) { const h = map.get(norm(tags.album)); if (h) return h; }
  if (tags && tags.title) { const h = map.get(norm(tags.title)); if (h) return h; }
  if (name) { const h = map.get(norm(name)); if (h) return h; }
  return null;
}

function findAnimCoverForVideo(name) {
  if (!name) return null;
  return scanAnimDir().get(norm(name)) || null;
}

// === ВЕРТИКАЛЬНОЕ ВИДЕО ===
const dimsCache = loadJsonSafe(DIMS_CACHE_PATH, {});
function getVerticalFast(relativePath, absPath, size, mtime) {
  const key = relativePath;
  const cached = dimsCache[key];
  if (cached && cached.size === size && cached.mtime === mtime) return !!cached.vertical;
  return false;
}

// === ОБХОД ПАПОК ===
async function walkLibrary(dir, extensions, base = '') {
  if (!fs.existsSync(dir)) {
    console.log('[library] НЕ НАЙДЕНА:', dir);
    return [];
  }
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.log('[library] ОШИБКА чтения:', dir, e.message);
    return [];
  }
  const files = entries.filter(e => !e.isDirectory());
  const matched = files.filter(e => extensions.includes(path.extname(e.name).toLowerCase()));
  console.log(`[library] ${dir} — всего файлов: ${files.length}, подошло: ${matched.length}`);
  if (files.length > 0 && matched.length === 0) {
    console.log('[library] Файлы есть, но НИ ОДИН не прошёл по расширениям. Примеры:', files.slice(0, 5).map(e => e.name));
  }

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

// === ВИДЕО ===
router.get('/library/video', async (req, res) => {
  try {
    const items = await walkLibrary(VIDEO_DIR, VIDEO_EXTENSIONS);
    console.log(`[library/video] итого: ${items.length}`);
    const withUrls = items.map(it => {
      const absPath = path.join(VIDEO_DIR, it.relativePath);
      const vertical = getVerticalFast(it.relativePath, absPath, it.size, it.mtime);
      const anim = findAnimCoverForVideo(it.name);
      return {
        id: it.relativePath,
        ...it,
        vertical,
        streamUrl: `/stream/video/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`,
        animCoverUrl: anim ? anim.streamUrl : null,
        animCoverType: anim ? anim.type : null,
      };
    });
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items: withUrls });
  } catch (err) {
    console.error('[ОШИБКА /library/video]', err);
    res.status(500).json({ error: 'Не удалось прочитать видео-библиотеку' });
  }
});

// === МУЗЫКА ===
const audioTagsCache = new Map();

function coverCacheBase(relativePath) {
  const hash = crypto.createHash('md5').update(relativePath).digest('hex');
  return path.join(COVERS_DIR, hash);
}

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
      trackNumber: (c.track && c.track.no && c.track.no <= 100) ? c.track.no : null,
    };
  } catch {
    tags = { title: null, artist: null, album: null, trackNumber: null };
  }
  audioTagsCache.set(relativePath, { size, mtime, tags });
  return tags;
}

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
  const items = await walkLibrary(MUSIC_DIR, MUSIC_EXTENSIONS);
  const concurrency = 8;
  const results = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (it) => {
        const absPath = path.join(MUSIC_DIR, it.relativePath);
        const tags = await readAudioTags(absPath, it.relativePath, it.size, it.mtime);
        const coverPath = await extractAndCacheCover(absPath, it.relativePath);
        const anim = findAnimCoverForTrack(tags, it.name);
        return {
          id: it.relativePath,
          ...it,
          ...tags,
          hasCover: !!coverPath,
          coverUrl: coverPath ? `/cover/music/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}` : null,
          streamUrl: `/stream/music/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`,
          animCoverUrl: anim ? anim.streamUrl : null,
          animCoverType: anim ? anim.type : null,
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

async function hasLibraryChanged() {
  try {
    const items = await walkLibrary(MUSIC_DIR, MUSIC_EXTENSIONS);
    const snap = computeSnapshot(items);
    const changed = !musicSnapshot || !snapshotsEqual(musicSnapshot, snap);
    if (changed) musicSnapshot = snap;
    return changed;
  } catch {
    return false;
  }
}

router.get('/library/music', async (req, res) => {
  try {
    if (!musicLibraryCache) {
      await refreshMusicLibrary();
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

router.post('/library/music/refresh', async (req, res) => {
  await refreshMusicLibrary();
  res.json({ ok: true, count: (musicLibraryCache || []).length });
});

// === МЕТА (normGain и т.д.) ===
const ALLOWED_META_FIELDS = ['normGain', 'liked', 'userNote'];
router.patch('/library/music/meta', (req, res) => {
  try {
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ error: 'нет id' });
    if (!musicLibraryCache) return res.status(503).json({ error: 'библиотека не загружена' });

    const track = musicLibraryCache.find(t => t.id === id);
    if (!track) return res.status(404).json({ error: 'трек не найден' });

    for (const [k, v] of Object.entries(fields)) {
      if (ALLOWED_META_FIELDS.includes(k)) track[k] = v;
    }
    markMusicCacheDirty();
    res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /library/music/meta]', e);
    res.status(500).json({ error: 'ошибка' });
  }
});

// === АНИМ МЕТА (для фронта) ===
router.get('/library/anim-covers', (req, res) => {
  try {
    const map = scanAnimDir();
    const items = [];
    for (const [normName, info] of map) {
      items.push({
        normName,
        filename: info.filename,
        streamUrl: info.streamUrl,
        type: info.type,
      });
    }
    res.json({ items });
  } catch (e) {
    res.json({ items: [] });
  }
});

// === СТАТИКА ===
router.use('/stream/video', express.static(VIDEO_DIR, { setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes') }));
router.use('/stream/music', express.static(MUSIC_DIR, { setHeaders: (res) => res.setHeader('Accept-Ranges', 'bytes') }));
router.use('/stream/anim', (req, res, next) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const absPath = path.join(ANIM_DIR, relPath);
  const resolved = path.resolve(absPath);
  const animDirResolved = path.resolve(ANIM_DIR);
  if (!resolved.startsWith(animDirResolved + path.sep) && resolved !== animDirResolved) {
    return res.status(403).end();
  }
  res.sendFile(resolved, { headers: { 'Accept-Ranges': 'bytes' } }, (err) => {
    if (err) res.status(404).end();
  });
});

// === ОБЛОЖКИ МУЗЫКИ ===
router.get('/cover/music/*', (req, res) => {
  const rel = decodeURIComponent(req.params[0] || '');
  const base = coverCacheBase(rel);
  for (const ext of ['.jpg', '.png']) {
    const p = base + ext;
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).end();
});

// Прогрев
setTimeout(() => { console.log('[music] прогрев кэша...'); refreshMusicLibrary(); }, 1200);

module.exports = router;
