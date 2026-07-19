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

// ═══ АНИМИРОВАННЫЕ ОБЛОЖКИ ═══
const ANIM_DIR = (() => {
  try { return require('../config').ANIM_DIR; } catch(e) { return null; }
})() || String.raw`F:\(8 фелиал АДА)\sLOW\anim`;

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const router = express.Router();

// ============================================================
// ДИСК-КЭШИ (переживают перезапуск сервера)
// ============================================================
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
  } catch (e) {
    console.warn('[cache] не удалось прочитать', filePath, e.message);
  }
  return fallback;
}

function saveJsonSync(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[cache] ошибка записи', filePath, e.message);
  }
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
        if (err) console.warn('[cache] ошибка записи', filePath, err.message);
      });
    }, delayMs);
  };
}

// ════════════════════════════════════════════════════════════
// АНИМ-ОБЛОЖКИ: сканирование, нормализация, мэтчинг
// ════════════════════════════════════════════════════════════
const ANIM_EXTENSIONS = ['.gif', '.webm'];

// Нормализация: нижний регистр, убрать спецсимволы, сжать пробелы
function norm(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[^a-z0-9а-яё\u0400-\u04FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ───────────────────── НОВЫЙ АСИНХРОННЫЙ СКАН ─────────────────────
let animMap = new Map(); // всегда актуальный, готовый к чтению снапшот
const ANIM_CACHE_TTL = 60000;

// Асинхронный скан — НЕ блокирует event loop. Работает только в фоне,
// никогда не вызывается изнутри обработки запроса.
async function refreshAnimMapAsync() {
  const next = new Map();

  if (!fs.existsSync(ANIM_DIR)) {
    console.warn('[anim] папка не найдена:', ANIM_DIR);
    animMap = next;
    return;
  }

  try {
    async function walk(dir) {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (!ANIM_EXTENSIONS.includes(ext)) continue;
        const nameNorm = norm(path.basename(e.name, ext));
        const type = ext === '.gif' ? 'image/gif' : 'video/webm';
        const relFromAnim = path.relative(ANIM_DIR, abs).replace(/\\/g, '/');
        const existing = next.get(nameNorm);
        if (!existing || ext === '.webm') {
          next.set(nameNorm, {
            filename: e.name,
            relPath: relFromAnim,
            type,
            streamUrl: '/stream/anim/' + encodeURIComponent(relFromAnim).replace(/%2F/g, '/'),
          });
        }
      }
    }
    await walk(ANIM_DIR);
    animMap = next;
    console.log(`[anim] найдено ${animMap.size} аним. обложек в ${ANIM_DIR}`);
  } catch (err) {
    console.error('[anim] ошибка сканирования:', err.message);
  }
}

// Синхронный геттер — просто отдаёт текущий снапшот, ничего не читает с диска.
function scanAnimDir() {
  return animMap;
}

// Фоновое обновление: сразу при старте (не блокируя запуск сервера — не awaitим)
// и затем каждые ANIM_CACHE_TTL.
refreshAnimMapAsync();
setInterval(refreshAnimMapAsync, ANIM_CACHE_TTL);
// ──────────────────── КОНЕЦ НОВОГО БЛОКА ─────────────────────

// Найти аним-обложку для музыкального трека
function findAnimCoverForTrack(tags, name) {
  const map = scanAnimDir();
  if (tags && tags.album) {
    const hit = map.get(norm(tags.album));
    if (hit) return hit;
  }
  if (tags && tags.title) {
    const hit = map.get(norm(tags.title));
    if (hit) return hit;
  }
  if (name) {
    const hit = map.get(norm(name));
    if (hit) return hit;
  }
  return null;
}

function findAnimCoverForVideo(name) {
  const map = scanAnimDir();
  if (!name) return null;
  return map.get(norm(name)) || null;
}

// ═══ ЛОГИРОВАНИЕ ПРИВЯЗКИ + ДИФФ ПРИ ПЕРЕЗАПУСКЕ ═══
// Структура кэша: { [normName]: { filename, type, albums:[], artists:[], trackCount, matchTypes:[] } }
let prevMatchesCache = loadJsonSafe(ANIM_MATCHES_CACHE_PATH, {});

function logAnimMatches(items) {
  const map = scanAnimDir();
  const newCache = {};

  if (!map.size) {
    console.log('[anim] папка пуста или не найдена — аним. обложек нет');
    return;
  }

  // Строим текущие привязки
  for (const [normName, info] of map) {
    const matches = items.filter(t =>
      norm(t.album) === normName || norm(t.title) === normName || norm(t.name) === normName
    );
    const matchedAlbums = [...new Set(matches.map(t => t.album).filter(Boolean))];
    const matchedArtists = [...new Set(matches.map(t => t.artist).filter(Boolean))];
    const matchTypes = [];
    if (matches.some(t => norm(t.album) === normName)) matchTypes.push('album');
    if (matches.some(t => norm(t.title) === normName)) matchTypes.push('title');
    if (matches.some(t => norm(t.name) === normName && norm(t.album) !== normName && norm(t.title) !== normName)) matchTypes.push('filename');

    newCache[normName] = {
      filename: info.filename,
      type: info.type,
      albums: matchedAlbums,
      artists: matchedArtists,
      trackCount: matches.length,
      matchTypes,
    };
  }

  // ═══ ДИФФ: что изменилось с предыдущего запуска ═══
  const prev = prevMatchesCache;
  const added = [];      // новые файлы, которых не было
  const removed = [];    // файлы, которые исчезли
  const changed = [];    // файлы, привязка которых изменилась
  const unchanged = [];  // без изменений

  for (const [normName, cur] of Object.entries(newCache)) {
    if (!prev[normName]) {
      added.push(cur);
    } else {
      const p = prev[normName];
      if (p.trackCount !== cur.trackCount ||
          JSON.stringify(p.albums) !== JSON.stringify(cur.albums) ||
          JSON.stringify(p.matchTypes) !== JSON.stringify(cur.matchTypes) ||
          p.filename !== cur.filename) {
        changed.push({ cur, prev: p });
      } else {
        unchanged.push(cur);
      }
    }
  }
  for (const [normName, p] of Object.entries(prev)) {
    if (!newCache[normName]) {
      removed.push(p);
    }
  }

  // ═══ ВЫВОД В КОНСОЛЬ ═══
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║            АНИМИРОВАННЫЕ ОБЛОЖКИ — ПРИВЯЗКА                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const c of added) {
    const label = c.matchTypes.includes('album') ? 'альбом' : c.matchTypes.includes('title') ? 'трек' : 'файл';
    const info = c.albums.length ? ` → ${label}: ${c.albums.join(', ')}` : ' → нет совпадений';
    console.log(`║ 🆕 ${c.filename}${info}`);
    if (c.trackCount > 0) {
      const arts = c.artists.slice(0, 3).join(', ');
      console.log(`║    (${c.trackCount} треков${arts ? ', ' + arts : ''})`);
    }
  }

  for (const { cur, prev: p } of changed) {
    const prevLabel = p.matchTypes.includes('album') ? 'альбом' : p.matchTypes.includes('title') ? 'трек' : 'файл';
    const curLabel = cur.matchTypes.includes('album') ? 'альбом' : cur.matchTypes.includes('title') ? 'трек' : 'файл';
    console.log(`║ 🔄 ${cur.filename} — ИЗМЕНЕНИЕ:`);
    if (p.filename !== cur.filename) {
      console.log(`║    файл: ${p.filename} → ${cur.filename}`);
    }
    if (p.trackCount !== cur.trackCount || JSON.stringify(p.albums) !== JSON.stringify(cur.albums)) {
      const prevInfo = p.trackCount > 0 ? `${prevLabel}: ${p.albums.join(', ')} (${p.trackCount} тр.)` : 'нет совпадений';
      const curInfo = cur.trackCount > 0 ? `${curLabel}: ${cur.albums.join(', ')} (${cur.trackCount} тр.)` : 'нет совпадений';
      console.log(`║    было: ${prevInfo}`);
      console.log(`║    стало: ${curInfo}`);
    }
  }

  for (const r of removed) {
    console.log(`║ ❌ ${r.filename} — ФАЙЛ УДАЛЁН (было: ${r.trackCount} треков)`);
  }

  for (const c of unchanged) {
    if (c.trackCount > 0) {
      const label = c.matchTypes.includes('album') ? 'альбом' : c.matchTypes.includes('title') ? 'трек' : 'файл';
      const arts = c.artists.slice(0, 3).join(', ');
      console.log(`║ ✅ ${c.filename} → ${label}: ${c.albums.join(', ')} (${c.trackCount} тр.${arts ? ', ' + arts : ''})`);
    } else {
      console.log(`║ ⚠  ${c.filename} — нет совпадений`);
    }
  }

  const totalMatched = Object.values(newCache).filter(c => c.trackCount > 0).length;
  console.log('╠══════════════════════════════════════════════════════════════╣');
  if (added.length || removed.length || changed.length) {
    console.log(`║ Сводка: 🆕${added.length} 🔄${changed.length} ❌${removed.length} ✅${unchanged.length} без изменений`);
  }
  console.log(`║ Итого: ${totalMatched}/${map.size} файлов привязаны к трекам`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Сохраняем текущее состояние для следующего запуска
  prevMatchesCache = newCache;
  saveJsonSync(ANIM_MATCHES_CACHE_PATH, newCache);
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
  return cached ? cached.vertical : false;
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
      const anim = findAnimCoverForVideo(it.name);
      return {
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

// ============================================================
// МУЗЫКА — теги + обложки + аним-обложки
// ============================================================
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
        const anim = findAnimCoverForTrack(tags, it.name);
        return {
          ...it,
          ...tags,
          hasCover: !!coverPath,
          coverUrl: coverPath
            ? `/cover/music/${encodeURIComponent(it.relativePath).replace(/%2F/g, '/')}`
            : null,
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
    logAnimMatches(items);
  } catch (e) {
    console.warn('[music] ошибка обновления библиотеки:', e.message);
  } finally {
    musicBuilding = false;
  }
}

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

// Обновление мета-полей трека (normGain и т.д.) — не трогает теги файла, только кэш
const ALLOWED_META_FIELDS = ['normGain', 'liked', 'userNote'];
router.patch('/library/music/meta', (req, res) => {
  try {
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ error: 'нет id' });
    if (!musicLibraryCache) return res.status(503).json({ error: 'библиотека не загружена' });

    const track = musicLibraryCache.find(t => t.id === id);
    if (!track) return res.status(404).json({ error: 'трек не найден' });

    // Обновляем только разрешённые поля
    for (const [k, v] of Object.entries(fields)) {
      if (ALLOWED_META_FIELDS.includes(k)) track[k] = v;
    }
    markMusicCacheDirty();
    res.json({ ok: true, id, updated: Object.keys(fields).filter(k => ALLOWED_META_FIELDS.includes(k)) });
  } catch(e) {
    console.error('[PATCH /library/music/meta]', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ОБЛОЖКИ — с диска
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
// ═══ АНИМ-ОБЛОЖКИ: API + стриминг ═══
// ============================================================

router.get('/library/anim-covers', (req, res) => {
  try {
    const map = scanAnimDir();
    const items = [];
    for (const [normName, info] of map) {
      const matches = (musicLibraryCache || []).filter(t =>
        norm(t.album) === normName || norm(t.title) === normName || norm(t.name) === normName
      );
      const matchedAlbums = [...new Set(matches.map(t => t.album).filter(Boolean))];
      const matchedArtists = [...new Set(matches.map(t => t.artist).filter(Boolean))];
      const matchTypes = [];
      if (matches.some(t => norm(t.album) === normName)) matchTypes.push('album');
      if (matches.some(t => norm(t.title) === normName)) matchTypes.push('title');
      if (matches.some(t => norm(t.name) === normName && norm(t.album) !== normName && norm(t.title) !== normName)) matchTypes.push('filename');
      items.push({
        ...info,
        name: normName,
        matchedAlbums,
        matchedArtists,
        matchedTrackCount: matches.length,
        matchTypes,
      });
    }
    res.json({ items });
  } catch (err) {
    console.error('[ОШИБКА /library/anim-covers]', err);
    res.status(500).json({ error: 'Ошибка сканирования anim-папки' });
  }
});

// Стриминг файлов из ANIM_DIR
router.use('/stream/anim', (req, res, next) => {
  const relPath = decodeURIComponent(req.path.replace(/^\//, ''));
  const absPath = path.join(ANIM_DIR, relPath);
  const resolved = path.resolve(absPath);
  const animDirResolved = path.resolve(ANIM_DIR);
  if (!resolved.startsWith(animDirResolved + path.sep) && resolved !== animDirResolved) {
    return res.status(403).end();
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).end();
  }
  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.webm') res.setHeader('Content-Type', 'video/webm');
  else if (ext === '.gif') res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  fs.createReadStream(resolved).pipe(res);
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