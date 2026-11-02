// Dossier mutuo SAL · server minimale senza dipendenze esterne.
// Serve l'app, salva lo stato in data/state.json e i documenti in data/documenti/.
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8790', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PASSWORD = process.env.DOSSIER_PASSWORD || '';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '200', 10);
const KEEP_BACKUPS = parseInt(process.env.KEEP_BACKUPS || '60', 10);

const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const FILES_DIR = DATA_DIR; // le cartelle documenti/ e banche/ vivono direttamente in data/
const TRASH_DIR = path.join(DATA_DIR, 'cestino');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip', '.dwg': 'application/acad', '.p7m': 'application/pkcs7-mime'
};

// ---------- utilità ----------
function send(res, code, body, headers = {}) {
  const isObj = body && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// Nome sicuro per file e cartelle: niente separatori, niente "..", niente caratteri di controllo.
function safeName(s, fallback = 'senza-nome') {
  const out = String(s || '').normalize('NFC').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').replace(/^\.+/, '').trim().slice(0, 120);
  return out || fallback;
}
function safeRel(rel) {
  const parts = String(rel || '').split('/').filter(Boolean).map((p) => safeName(p));
  return parts.join('/');
}
function insideData(abs) {
  const rel = path.relative(DATA_DIR, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
async function uniquePath(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name), i = 2;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${base} (${i++})${ext}`);
  return candidate;
}
async function readState() {
  try { return JSON.parse(await fsp.readFile(STATE_FILE, 'utf8')); } catch (e) { return null; }
}
async function writeAtomic(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}
let lastBackupAt = 0;
async function backupState() {
  if (!fs.existsSync(STATE_FILE)) return;
  const now = Date.now();
  if (now - lastBackupAt < 5 * 60 * 1000) return; // al massimo un backup ogni 5 minuti
  lastBackupAt = now;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await fsp.copyFile(STATE_FILE, path.join(BACKUP_DIR, `state-${stamp}.json`));
  const list = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.startsWith('state-')).sort();
  for (const old of list.slice(0, Math.max(0, list.length - KEEP_BACKUPS))) await fsp.unlink(path.join(BACKUP_DIR, old)).catch(() => {});
}
function checkAuth(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [, pass] = Buffer.from(h.slice(6), 'base64').toString().split(/:(.*)/s);
  const a = Buffer.from(pass || ''), b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- API ----------
let writing = Promise.resolve();

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/health') return send(res, 200, { ok: true, mode: 'server', dataDir: DATA_DIR, maxUploadMb: MAX_UPLOAD_MB });

  if (p === '/api/state' && req.method === 'GET') {
    const s = await readState();
    return s ? send(res, 200, s) : send(res, 404, { error: 'empty' });
  }

  if (p === '/api/state' && req.method === 'PUT') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return send(res, 400, { error: 'json' }); }
    if (!body || typeof body.state !== 'object' || !Array.isArray(body.state.banks)) return send(res, 400, { error: 'invalid' });
    // Serializza le scritture per evitare corse tra richieste ravvicinate.
    const result = await (writing = writing.then(async () => {
      const cur = await readState();
      const curRev = cur ? (cur.rev || 0) : 0;
      if (!body.force && cur && body.rev !== curRev) return { conflict: true, rev: curRev };
      await backupState();
      const next = Object.assign({}, body.state, { rev: curRev + 1, savedAt: new Date().toISOString() });
      await writeAtomic(STATE_FILE, JSON.stringify(next, null, 2));
      return { rev: next.rev, savedAt: next.savedAt };
    }).catch((e) => ({ error: String(e) })));
    if (result.conflict) return send(res, 409, { error: 'conflict', rev: result.rev });
    if (result.error) return send(res, 500, result);
    return send(res, 200, result);
  }

  if (p === '/api/files' && req.method === 'POST') {
    const folder = safeRel(url.searchParams.get('folder') || 'documenti/Altro');
    const name = safeName(url.searchParams.get('name') || 'file');
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len > MAX_UPLOAD_MB * 1024 * 1024) return send(res, 413, { error: 'too_large', maxUploadMb: MAX_UPLOAD_MB });
    const dir = path.join(FILES_DIR, folder);
    if (!insideData(dir)) return send(res, 400, { error: 'path' });
    await fsp.mkdir(dir, { recursive: true });
    const dest = await uniquePath(dir, name);
    const tmp = dest + '.uploading';
    let size = 0, aborted = false;
    await new Promise((resolve) => {
      const out = fs.createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD_MB * 1024 * 1024) { aborted = true; req.destroy(); out.destroy(); } });
      req.pipe(out);
      out.on('finish', resolve); out.on('close', resolve); out.on('error', () => { aborted = true; resolve(); });
      req.on('aborted', () => { aborted = true; resolve(); });
    });
    if (aborted) { await fsp.unlink(tmp).catch(() => {}); return send(res, 413, { error: 'upload_failed' }); }
    await fsp.rename(tmp, dest);
    const rel = path.relative(DATA_DIR, dest).split(path.sep).join('/');
    return send(res, 200, { name: path.basename(dest), path: rel, size, uploadedAt: new Date().toISOString() });
  }

  if (p === '/api/files' && req.method === 'DELETE') {
    const rel = safeRel(url.searchParams.get('path'));
    const abs = path.join(DATA_DIR, rel);
    if (!insideData(abs) || rel.startsWith('backup/') || rel === 'state.json') return send(res, 400, { error: 'path' });
    if (!fs.existsSync(abs)) return send(res, 200, { ok: true, missing: true });
    // Non cancella: sposta nel cestino, mantenendo la struttura.
    const dest = await uniquePath(path.dirname(path.join(TRASH_DIR, rel)), path.basename(rel));
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(abs, dest);
    return send(res, 200, { ok: true, trashed: path.relative(DATA_DIR, dest) });
  }

  if (p === '/api/backups' && req.method === 'GET') {
    const list = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.startsWith('state-')).sort().reverse();
    return send(res, 200, { backups: list });
  }

  return send(res, 404, { error: 'not_found' });
}

// ---------- file statici e documenti ----------
async function serveFile(res, abs, download) {
  try {
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw 0;
    const ext = path.extname(abs).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size };
    if (download !== undefined) headers['Content-Disposition'] = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`;
    res.writeHead(200, headers);
    fs.createReadStream(abs).pipe(res);
  } catch (e) { send(res, 404, 'Non trovato'); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!checkAuth(req)) return send(res, 401, 'Accesso richiesto', { 'WWW-Authenticate': 'Basic realm="Dossier mutuo", charset="UTF-8"' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const rel = decodeURIComponent(url.pathname.slice(7));
      const abs = path.join(DATA_DIR, rel);
      if (!insideData(abs) || rel.startsWith('backup/')) return send(res, 400, 'Percorso non valido');
      return serveFile(res, abs, url.searchParams.has('download'));
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!abs.startsWith(PUBLIC_DIR)) return send(res, 400, 'Percorso non valido');
    return serveFile(res, abs);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
});

(async () => {
  for (const d of [DATA_DIR, BACKUP_DIR, path.join(DATA_DIR, 'documenti'), path.join(DATA_DIR, 'banche')]) await fsp.mkdir(d, { recursive: true });
  server.listen(PORT, () => console.log(`Dossier mutuo in ascolto su :${PORT} · dati in ${DATA_DIR}${PASSWORD ? ' · password attiva' : ''}`));
})();
