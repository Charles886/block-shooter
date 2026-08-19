// ===== 方塊射擊 Block Shooter =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const hud = {
  score: document.getElementById('score'),
  hp: document.getElementById('hp'),
  wave: document.getElementById('wave'),
  combo: document.getElementById('combo'),
  weapon: document.getElementById('weapon'),
};
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovText = document.getElementById('ov-text');
const ovBtn = document.getElementById('ov-btn');

// ---------- 狀態 ----------
let running = false;
let score = 0, hp = 100, wave = 1, combo = 1, comboTimer = 0;
let enemiesToSpawn = 0, spawnCooldown = 0;
const player = { x: W / 2, y: H / 2, size: 26, speed: 260, fireCd: 0, inv: 0 };
let bullets = [];      // 玩家子彈 {x,y,vx,vy}
let ebullets = [];     // 敵方子彈
let enemies = [];      // 敵方方塊
let particles = [];    // 爆炸粒子
const mouse = { x: W / 2, y: H / 4, down: false };
const touch = { active: false }; // 觸控中（單指）：玩家跟隨並自動開火
const keys = {};
// 武器 / 掉落 / 暫停
let paused = false;
let power = { type: null, time: 0 };
let powerups = [];   // 掉落物 {x,y,vy,type,life}
const WEAPONS = {
  rapid:    { color: '#3fb950', label: '急速', cd: 0.07, desc: '射速提升' },
  triple:   { color: '#d29922', label: '三連', cd: 0.16, desc: '三向發射' },
  piercing: { color: '#bc8cff', label: '穿透', cd: 0.14, desc: '子彈穿透' },
  damage:   { color: '#f85149', label: '重擊', cd: 0.16, desc: '傷害翻倍' },
};

// ---------- 輸入 ----------
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
window.addEventListener('keydown', e => {
  if (e.key === ' ') {
    e.preventDefault();
    if (running) paused = !paused;
    return;
  }
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---------- 觸控（手機） ----------
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0] || e.changedTouches[0];
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length > 1) return;      // 多指：不處理
  const p = canvasPoint(e);
  mouse.x = p.x; mouse.y = p.y;
  touch.active = true;                    // 開始跟隨 + 自動開火
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length > 1) return;
  const p = canvasPoint(e);
  mouse.x = p.x; mouse.y = p.y;
}, { passive: false });
const touchEnd = e => {
  e.preventDefault();
  if (e.touches.length === 0) touch.active = false; // 放開：停止開火
};
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });

// ---------- 玩家 ----------
function playerFire() {
  const dx = mouse.x - player.x, dy = mouse.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = 640;
  const dmg = power.type === 'damage' ? 2 : 1;
  const pierce = power.type === 'piercing';
  const baseAng = Math.atan2(dy, dx);
  const angles = power.type === 'triple' ? [baseAng - 0.16, baseAng, baseAng + 0.16] : [baseAng];
  const mx = player.x + dx / d * 20, my = player.y + dy / d * 20;
  for (const a of angles) {
    bullets.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, pierce, hits: 0 });
  }
  // 槍口粒子
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: mx, y: my,
      vx: dx / d * 80 + rnd(-60, 60), vy: dy / d * 80 + rnd(-60, 60),
      life: 0.12, color: (power.type && WEAPONS[power.type].color) || '#ffd54f', size: 2,
    });
  }
}

function updatePlayer(dt) {
  // 滑鼠跟隨（平滑）
  player.x += (mouse.x - player.x) * Math.min(1, dt * 10);
  player.y += (mouse.y - player.y) * Math.min(1, dt * 10);
  player.x = Math.max(14, Math.min(W - 14, player.x));
  player.y = Math.max(14, Math.min(H - 14, player.y));
  // WASD 額外微調
  if (keys['w']) player.y -= player.speed * dt;
  if (keys['s']) player.y += player.speed * dt;
  if (keys['a']) player.x -= player.speed * dt;
  if (keys['d']) player.x += player.speed * dt;
  player.x = Math.max(14, Math.min(W - 14, player.x));
  player.y = Math.max(14, Math.min(H - 14, player.y));

  player.fireCd -= dt;
  if ((mouse.down || touch.active) && player.fireCd <= 0) {
    playerFire();
    player.fireCd = (power.type && WEAPONS[power.type].cd) || 0.16;
  }
  if (player.inv > 0) player.inv -= dt;
}

// ---------- 敵方 ----------
function spawnEnemy() {
  // 從邊界外生成
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = -30; y = rnd(0, H); }
  else if (side === 1) { x = W + 30; y = rnd(0, H); }
  else if (side === 2) { x = rnd(0, W); y = -30; }
  else { x = rnd(0, W); y = H + 30; }
  const t = wave; // 波次越高越兇
  enemies.push({
    x, y,
    size: rnd(18, 30),
    hp: 1 + Math.floor((t - 1) / 2),
    maxhp: 1 + Math.floor((t - 1) / 2),
    speed: rnd(50, 90) + t * 6,
    fireCd: rnd(1.2, 2.5),
    wobble: rnd(0, Math.PI * 2),
    color: ['#f85149', '#ff7b72', '#da3633'][Math.floor(Math.random() * 3)],
  });
}

function updateEnemies(dt) {
  for (const e of enemies) {
    // 追擊玩家 + 輕微游動
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.wobble += dt * 2;
    const px = -dy / d, py = dx / d; // 垂直方向
    const wob = Math.sin(e.wobble) * 40;
    e.x += (dx / d * e.speed + px * wob) * dt;
    e.y += (dy / d * e.speed + py * wob) * dt;

    // 開火：保持距離
    e.fireCd -= dt;
    if (e.fireCd <= 0 && d < 420) {
      const sp = 220 + wave * 8;
      ebullets.push({ x: e.x, y: e.y, vx: dx / d * sp, vy: dy / d * sp, r: 4 });
      e.fireCd = rnd(1.4, 2.6) - Math.min(0.8, wave * 0.05);
    }
  }
}

// ---------- 子彈 / 粒子 ----------
function updateBullets(dt) {
  for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  bullets = bullets.filter(b => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  for (const b of ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  ebullets = ebullets.filter(b => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    p.vx *= 0.94; p.vy *= 0.94;
  }
  particles = particles.filter(p => p.life > 0);
}

// ---------- 碰撞 ----------
function explode(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(40, 180);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.6), color, size: rnd(2, 4) });
  }
}

function collide() {
  // 玩家子彈 vs 敵方
  for (const b of bullets) {
    for (const e of enemies) {
      if (b.lastHit === e) continue; // 穿透子彈跳過已擊中的敵方
      if (Math.abs(b.x - e.x) < e.size / 2 + 4 && Math.abs(b.y - e.y) < e.size / 2 + 4) {
        e.hp -= b.dmg || 1;
        const hx = b.x, hy = b.y;
        if (b.pierce) b.lastHit = e; else b.x = -999;
        explode(hx, hy, e.color, 4);
        if (e.hp <= 0) {
          explode(e.x, e.y, e.color, 16);
          score += 10 * combo;
          combo = Math.min(20, combo + 1);
          comboTimer = 2.5;
          maybeDrop(e.x, e.y);
        }
        break;
      }
    }
  }
  enemies = enemies.filter(e => e.hp > 0);

  // 敵方子彈 vs 玩家
  if (player.inv <= 0) {
    for (const b of ebullets) {
      if (Math.abs(b.x - player.x) < player.size / 2 + b.r && Math.abs(b.y - player.y) < player.size / 2 + b.r) {
        hp -= 12;
        b.x = -999;
        explode(player.x, player.y, '#58a6ff', 8);
        combo = 1;
        player.inv = 0.6;
        if (hp <= 0) { hp = 0; gameOver(); }
        break;
      }
    }
    ebullets = ebullets.filter(b => b.x > -900);
    // 敵方方塊撞玩家
    for (const e of enemies) {
      if (Math.abs(e.x - player.x) < (e.size + player.size) / 2 && Math.abs(e.y - player.y) < (e.size + player.size) / 2) {
        hp -= 20;
        e.hp = 0;
        explode(e.x, e.y, e.color, 14);
        combo = 1;
        player.inv = 0.8;
        if (hp <= 0) { hp = 0; gameOver(); }
        break;
      }
    }
    enemies = enemies.filter(e => e.hp > 0);
  }
}

// ---------- 武器掉落 ----------
function maybeDrop(x, y) {
  if (powerups.length >= 3) return;
  if (Math.random() < 0.18) {
    const types = Object.keys(WEAPONS);
    powerups.push({ x, y, type: types[Math.floor(Math.random() * types.length)], life: 9, vy: 40 });
  }
}
function updatePowerups(dt) {
  if (power.time > 0) {
    power.time -= dt;
    if (power.time <= 0) power.type = null;
  }
  for (const p of powerups) { p.y += p.vy * dt; p.life -= dt; }
  // 玩家撿取
  for (const p of powerups) {
    if (Math.abs(p.x - player.x) < 26 && Math.abs(p.y - player.y) < 26) {
      power.type = p.type; power.time = 8; p.life = 0;
      explode(player.x, player.y, WEAPONS[p.type].color, 12);
    }
  }
  powerups = powerups.filter(p => p.life > 0 && p.y < H + 30);
  hud.weapon.textContent = power.type ? `${WEAPONS[power.type].label} ${Math.ceil(power.time)}s` : '-';
}

// ---------- 波次 ----------
function startWave() {
  enemiesToSpawn = 4 + wave * 2;
  spawnCooldown = 0.5;
}
function updateWave(dt) {
  if (enemies.length === 0 && enemiesToSpawn === 0) {
    // 波次結束，短暫停頓後進下一波
    wave++;
    hp = Math.min(100, hp + 10);
    startWave();
  }
  spawnCooldown -= dt;
  if (enemiesToSpawn > 0 && spawnCooldown <= 0 && enemies.length < 6 + wave) {
    spawnEnemy();
    enemiesToSpawn--;
    spawnCooldown = rnd(0.4, 1.0) / (1 + wave * 0.05);
  }
}

// ---------- 畫面 ----------
function draw() {
  ctx.clearRect(0, 0, W, H);
  // 網格背景
  ctx.strokeStyle = 'rgba(88,166,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // 粒子
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // 敵方
  for (const e of enemies) {
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
    // 血量條
    if (e.maxhp > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 8, e.size, 4);
      ctx.fillStyle = '#3fb950';
      ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 8, e.size * (e.hp / e.maxhp), 4);
    }
  }

  // 子彈
  ctx.fillStyle = '#ffd54f';
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff7b72';
  for (const b of ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }

  // 武器掉落物
  for (const p of powerups) {
    const c = WEAPONS[p.type].color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(performance.now() / 300) * 0.3);
    ctx.fillStyle = c;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.fillStyle = '#0d1117';
    ctx.font = 'bold 12px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(WEAPONS[p.type].label[0], 0, 1);
    ctx.restore();
  }

  // 玩家（閃爍表示無敵）
  const blink = player.inv > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  if (!blink) {
    ctx.save();
    ctx.translate(player.x, player.y);
    // 指向滑鼠
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    ctx.rotate(ang);
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(-player.size / 2, -player.size / 2, player.size, player.size);
    // 槍管
    ctx.fillStyle = '#9ecbff';
    ctx.fillRect(player.size / 2 - 4, -4, 16, 8);
    ctx.restore();
  }

  // 暫停遮罩
  if (paused) {
    ctx.fillStyle = 'rgba(13, 17, 23, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f0f6fc';
    ctx.font = 'bold 34px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('已暫停 — 按空白鍵繼續', W / 2, H / 2);
  }

  // HUD 更新
  hud.score.textContent = score;
  hud.hp.textContent = Math.max(0, Math.round(hp));
  hud.wave.textContent = wave;
  hud.combo.textContent = 'x' + combo;
}

// ---------- 主迴圈 ----------
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (running && !paused) {
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 1; }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    collide();
    updateWave(dt);
    updatePowerups(dt);
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- 開始 / 結束 / 排行榜 ----------
const LS_KEY = 'blockShooterHighScores';
function loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderLeaderboard(top, myScore) {
  const lb = document.getElementById('leaderboard');
  if (!top.length) { lb.classList.add('hidden'); return; }
  const rows = top.slice(0, 10).map((s, i) =>
    `<tr class="${s.score === myScore ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${s.score}</td><td>${s.wave}</td></tr>`
  ).join('');
  lb.innerHTML = `<table><tr><th>#</th><th>名字</th><th>分數</th><th>波次</th></tr>${rows}</table>`;
  lb.classList.remove('hidden');
}
function doSaveScore() {
  const name = document.getElementById('name-input').value.trim() || '匿名';
  const list = loadScores();
  list.push({ name, score, wave });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  localStorage.setItem(LS_KEY, JSON.stringify(top));
  renderLeaderboard(top, score);
  document.getElementById('score-entry').classList.add('hidden');
}
document.getElementById('save-score').addEventListener('click', doSaveScore);
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSaveScore();
  e.stopPropagation(); // 打字時空白鍵不要觸發暫停
});

function start() {
  score = 0; hp = 100; wave = 1; combo = 1; comboTimer = 0;
  bullets = []; ebullets = []; enemies = []; particles = [];
  powerups = []; power = { type: null, time: 0 }; paused = false;
  player.x = W / 2; player.y = H / 2;
  running = true;
  overlay.classList.add('hidden');
  hud.weapon.textContent = '-';
  startWave();
}
function gameOver() {
  running = false;
  paused = false;
  ovTitle.textContent = '遊戲結束';
  ovText.innerHTML = `最終分數 <b style="color:#58a6ff">${score}</b> &nbsp;·&nbsp; 撐到第 <b style="color:#58a6ff">${wave}</b> 波`;
  ovBtn.textContent = '再玩一次';
  renderLeaderboard(loadScores(), score);
  document.getElementById('score-entry').classList.remove('hidden');
  document.getElementById('name-input').value = '';
  overlay.classList.remove('hidden');
  document.getElementById('name-input').focus();
}
ovBtn.addEventListener('click', start);
// 開始畫面先顯示既有排行榜
renderLeaderboard(loadScores(), 0);

// 小工具
function rnd(a, b) { return a + Math.random() * (b - a); }

