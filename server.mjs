import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const defaultStorePath = join(root, 'data', 'store.json');
let storePath = process.env.STORE_PATH || defaultStorePath;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const emojiChoices = ['✈️', '🏝️', '🏔️', '🏯', '🌊', '🌺', '🧳', '🌏'];

function prepareStore(target) {
  try {
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(defaultStorePath, target);
    }
    return true;
  } catch (error) {
    console.error(`無法使用資料檔 ${target}：${error.message}`);
    return false;
  }
}

if (!prepareStore(storePath) && storePath !== defaultStorePath) {
  console.error(`改用 ${defaultStorePath}。請確認持久磁碟已掛載到 STORE_PATH 所在目錄，否則重新部署後票數會歸零。`);
  storePath = defaultStorePath;
  prepareStore(storePath);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function loadStore() {
  return JSON.parse(readFileSync(storePath, 'utf8'));
}

function saveStore(store) {
  const temporary = `${storePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(temporary, storePath);
}

function isClosed(store) {
  return Date.now() >= new Date(store.deadline).getTime();
}

function cleanText(value, length = 80) {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function slugify(value) {
  const base = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u3400-\u9fff]+/g, '-').replace(/^-|-$/g, '');
  return base || randomBytes(4).toString('hex');
}

function publicState(store, voter = '') {
  const closed = isClosed(store);
  const destinationIds = new Set(store.destinations.map((item) => item.id));
  const completed = store.voters.filter((name) => {
    const ranking = store.votes[name]?.ranking;
    return Array.isArray(ranking) && ranking.length === destinationIds.size && ranking.every((id) => destinationIds.has(id));
  });
  const response = {
    deadline: store.deadline,
    closed,
    voters: store.voters,
    destinations: store.destinations,
    turnout: { completed, total: store.voters.length },
    myVote: voter && store.voters.includes(voter) ? (store.votes[voter] || null) : null
  };
  if (closed) response.results = calculateResults(store, completed);
  return response;
}

function calculateResults(store, completed) {
  const scores = Object.fromEntries(store.destinations.map((item) => [item.id, { score: 0, firsts: 0 }]));
  for (const voter of completed) {
    const ranking = store.votes[voter].ranking;
    ranking.forEach((id, index) => {
      scores[id].score += ranking.length - index;
      if (index === 0) scores[id].firsts += 1;
    });
  }
  return store.destinations.map((item) => ({ ...item, ...scores[item.id] }))
    .sort((a, b) => b.score - a.score || b.firsts - a.firsts || a.createdAt.localeCompare(b.createdAt));
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function bodyJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 20_000) throw new Error('內容過大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('格式錯誤'); }
}

function authenticate(store, voter) {
  return store.voters.includes(voter);
}

async function api(req, res, url) {
  const store = loadStore();
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, publicState(store, cleanText(url.searchParams.get('voter'), 20)));
  }

  let body;
  try { body = await bodyJson(req); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }

  if (req.method === 'POST' && url.pathname === '/api/auth') {
    const voter = cleanText(body.voter, 20);
    if (!store.voters.includes(voter)) return sendJson(res, 403, { error: '這個名字不在投票名單中' });
    return sendJson(res, 200, { ok: true, state: publicState(store, voter) });
  }

  if (req.method === 'POST' && url.pathname === '/api/vote') {
    const voter = cleanText(body.voter, 20);
    if (!authenticate(store, voter)) return sendJson(res, 401, { error: '投票人身分不正確' });
    if (isClosed(store)) return sendJson(res, 403, { error: '投票已截止' });
    const ids = store.destinations.map((item) => item.id);
    const ranking = Array.isArray(body.ranking) ? body.ranking.map(String) : [];
    if (ranking.length !== ids.length || new Set(ranking).size !== ids.length || !ranking.every((id) => ids.includes(id))) {
      return sendJson(res, 400, { error: '請為每個地點排出不重複的名次' });
    }
    store.votes[voter] = { ranking, updatedAt: new Date().toISOString() };
    saveStore(store);
    return sendJson(res, 200, { ok: true, state: publicState(store, voter) });
  }

  if (req.method === 'POST' && url.pathname === '/api/destinations') {
    const voter = cleanText(body.voter, 20);
    if (voter !== '奕翔' || !authenticate(store, voter)) return sendJson(res, 403, { error: '只有奕翔可以新增行程' });
    if (isClosed(store)) return sendJson(res, 403, { error: '截止後不能新增行程' });
    const name = cleanText(body.name, 30);
    const subtitle = cleanText(body.subtitle, 100);
    const urlValue = cleanText(body.url, 500);
    if (!name) return sendJson(res, 400, { error: '請輸入國家或地點名稱' });
    if (urlValue && !/^https:\/\//i.test(urlValue)) return sendJson(res, 400, { error: '行程連結必須使用 https://' });
    let id = slugify(name);
    let suffix = 2;
    while (store.destinations.some((item) => item.id === id)) id = `${slugify(name)}-${suffix++}`;
    store.destinations.push({
      id,
      name,
      subtitle: subtitle || '旅行候選行程',
      url: urlValue,
      emoji: emojiChoices[store.destinations.length % emojiChoices.length],
      createdAt: new Date().toISOString()
    });
    saveStore(store);
    return sendJson(res, 201, { ok: true, state: publicState(store, voter) });
  }

  return sendJson(res, 404, { error: '找不到這個功能' });
}

function serveStatic(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(publicDir, requested));
  if (!filePath.startsWith(`${publicDir}${sep}`) && filePath !== join(publicDir, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end('Method not allowed'); }
    return serveStatic(res, decodeURIComponent(url.pathname));
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: '伺服器暫時發生問題' });
  }
});

server.listen(port, host, () => console.log(`旅遊投票已啟動：http://localhost:${port}`));
