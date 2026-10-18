// Servidor do protótipo MMO: serve a pasta /public e sincroniza jogadores por WebSocket.
// O servidor é quem move os jogadores (o cliente só envia a direção desejada).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const SPEED = 5;   // metros por segundo
const LIMIT = 48;  // limite do mapa (100x100)
const TICK = 20;   // atualizações por segundo
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const players = new Map();
let nextId = 1;
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const clamp = (v) => Math.max(-LIMIT, Math.min(LIMIT, v));

wss.on('connection', (ws) => {
  const id = nextId++;
  const p = { id, name: 'Herói', color: Math.floor(Math.random() * 0xffffff), x: 0, z: 0, ry: 0, dx: 0, dz: 0 };
  players.set(id, p);
  ws.send(JSON.stringify({ t: 'welcome', id }));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && typeof m.name === 'string') {
      p.name = m.name.slice(0, 16);
    } else if (m.t === 'input') {
      let dx = num(m.dx), dz = num(m.dz);
      const len = Math.hypot(dx, dz);
      if (len > 1) { dx /= len; dz /= len; }
      p.dx = dx; p.dz = dz; p.ry = num(m.ry);
    }
  });
  ws.on('close', () => players.delete(id));
});

setInterval(() => {
  for (const p of players.values()) {
    p.x = clamp(p.x + (p.dx * SPEED) / TICK);
    p.z = clamp(p.z + (p.dz * SPEED) / TICK);
  }
  const msg = JSON.stringify({
    t: 'state',
    players: [...players.values()].map(({ id, name, color, x, z, ry }) => ({ id, name, color, x, z, ry })),
  });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}, 1000 / TICK);

server.listen(PORT, () => console.log('Servidor em http://localhost:' + PORT));
