// =====================================================================
//  JUIT LAB — "Düşman Görüşü"  (video: "Oyunlardaki düşmanlar seni nasıl görüyor?")
//  Yukarıdan bakışlı gizlilik odası: bir muhafız, duvarlarla kesilen görüş konisi.
//  Sözleşme: src/lab/LAB_SPEC.md   ·   Mobu: ../mobu/mobu-draw.js (değiştirilmedi)
//
//  mountVisionLab(container, opts) → { destroy, reset, setOption, getOptions }
//  Seçenekler : showCone (bool, açık)  analysis (bool, kapalı)
//               fov (60|90|120 derece, 90)  range (240|320 px, 240)
//  Olaylar    : { type:'spotted', count, distance, coneVisible }
//               { type:'goal', count, spotted }
//               { type:'start' } (ilk girdi) · { type:'reset' } · { type:'toggle', key, value }
// =====================================================================
import {
  mk, stageMobu, walk, squash, setBoil, ARM_HEAD, ARM_HIP,
  eBack, eOut, lin, lerp, clamp, INK, PURPLE, GLOW, RED, RED2, GOLD,
} from '../mobu/mobu-draw.js';

// ---------------------------------------------------------------------
//  Sabitler
// ---------------------------------------------------------------------
const W = 960, H = 540;
const STEP = 1 / 120;                 // sabit fizik adımı
const MS = 0.22;                      // Mobu ölçeği (boy ≈ 104 px)
const START = { x: 80, y: 470 };      // Mobu başlangıç (ayak altı)
const DOOR = { x: 880, y: 70, base: 102 };   // çıkış kapısı (arka duvarda), bölge kapı tabanının önü
const GOAL_R = 38;
const MOBU_SPEED = 190;
const FOOT_X = 14, FOOT_Y = 7;        // Mobu'nun yer ayak izi (AABB yarı boyutları)
const GUARD_SPEED = 90;
const GR = 21;                        // muhafız yarıçapı
const PATH = [[580, 140], [780, 140], [780, 400], [580, 400]];   // sağ duvar bloğunu çevreler, ortadaki sütundan uzak
const ALERT_T = 0.8, WIN_T = 1.5;
const FONT_DISPLAY = (n) => `900 ${n}px "InterDisplay", Inter, system-ui, sans-serif`;
const FONT_MONO = (n) => `700 ${n}px "JetBrains Mono", ui-monospace, monospace`;

const HINT_KB = 'WASD / ok tuşları ile gizlen · Koniyi kapatıp tekrar dene';
const HINT_TOUCH = 'Düğmelerle hareket et · Duvar arkası kör noktadır';

// <geom> --------------------------------------------------------------
// Saf geometri: duvarlar, ışın atma, görüş çokgeni, görme testi (DOM'a dokunmaz).
const DEG = Math.PI / 180;
// Mobu'nun başı arka duvarın üstüne taşmasın diye arka duvar kalın (2.5D oda); ayak y ≥ 109.
const WALLS = [
  { x: 0, y: 0, w: 960, h: 102 },     // arka duvar
  { x: 0, y: 516, w: 960, h: 24 },    // ön duvar
  { x: 0, y: 0, w: 24, h: 540 },      // sol duvar
  { x: 936, y: 0, w: 24, h: 540 },    // sağ duvar
  { x: 420, y: 240, w: 120, h: 60 },  // orta sütun (x ekseni 480'e simetrik)
  { x: 240, y: 200, w: 40, h: 140 },  // sol levha
  { x: 680, y: 200, w: 40, h: 140 },  // sağ levha (sol levhanın aynası)
];

// Işın–dikdörtgen kesişimi (slab). Dönen: giriş parametresi t (≥0) ya da Infinity.
function rayRect(ox, oy, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < r.x || ox > r.x + r.w) return Infinity;
  } else {
    let a = (r.x - ox) / dx, b = (r.x + r.w - ox) / dx;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < r.y || oy > r.y + r.h) return Infinity;
  } else {
    let a = (r.y - oy) / dy, b = (r.y + r.h - oy) / dy;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function castRay(ox, oy, dx, dy, maxT) {
  let best = maxT;
  for (let i = 0; i < WALLS.length; i++) {
    const t = rayRect(ox, oy, dx, dy, WALLS[i]);
    if (t < best) best = t;
  }
  return best;
}
function segBlocked(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  for (let i = 0; i < WALLS.length; i++) if (rayRect(x1, y1, dx, dy, WALLS[i]) < 0.9999) return true;
  return false;
}
function wrapPi(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}
// Görme: mesafe + açı + duvar engeli (görüş çokgeniyle aynı sonucu verir).
function canSee(gx, gy, ang, fovDeg, range, px, py) {
  const dx = px - gx, dy = py - gy, d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d < 1) return true;
  if (Math.abs(wrapPi(Math.atan2(dy, dx) - ang)) > fovDeg * DEG / 2) return false;
  return !segBlocked(gx, gy, px, py);
}
// Görüş çokgeni: düzenli ~1.5° ışınlar + her duvar köşesine (±ε) ek ışın → keskin gölge kenarları.
function buildCone(gx, gy, ang, fovDeg, range) {
  const fov = fovDeg * DEG, a0 = ang - fov / 2;
  const rel = [];
  const N = Math.max(60, Math.ceil(fovDeg / 1.5));
  for (let i = 0; i <= N; i++) rel.push(i / N * fov);
  const eps = 1e-4;
  for (let i = 0; i < WALLS.length; i++) {
    const r = WALLS[i];
    const cs = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    for (let c = 0; c < 4; c++) {
      const dx = cs[c][0] - gx, dy = cs[c][1] - gy;
      if (dx * dx + dy * dy > range * range) continue;
      const a = wrapPi(Math.atan2(dy, dx) - a0);
      if (a < -0.01 || a > fov + 0.01) continue;
      rel.push(Math.min(fov, Math.max(0, a - eps)), Math.min(fov, Math.max(0, a + eps)));
    }
  }
  rel.sort((p, q) => p - q);
  const pts = [];
  for (let i = 0; i < rel.length; i++) {
    const ra = a0 + rel[i], cx = Math.cos(ra), sy = Math.sin(ra);
    const t = castRay(gx, gy, cx, sy, range);
    pts.push([gx + cx * t, gy + sy * t]);
  }
  return pts;
}
// </geom> -------------------------------------------------------------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ---------------------------------------------------------------------
//  Modül
// ---------------------------------------------------------------------
export function mountVisionLab(container, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const sfx = (name) => { try { opts.sfx?.play?.(name); } catch (_) { /* ses hatası oyunu bozmasın */ } };
  const emit = (ev) => { try { opts.onEvent?.(ev); } catch (_) { /* olay hatası oyunu bozmasın */ } };

  const options = { showCone: true, analysis: false, fov: 90, range: 240 };

  // ---------- DOM ----------
  try { container.replaceChildren(); } catch (_) { container.innerHTML = ''; }

  const stage = el('div', 'lab-stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'lab-vision-canvas';
  canvas.width = W; canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Düşman Görüşü: Mobu\'yu muhafızın görüş konisinden gizleyerek çıkışa ulaştır');
  canvas.style.cssText = 'display:block;width:100%;height:auto;outline:none;';
  stage.appendChild(canvas);

  const panel = el('div', 'lab-panel');
  panel.appendChild(el('div', 'lab-panel-title', 'OYUN AYARLARI'));
  const switchBox = el('div', 'lab-switches');
  panel.appendChild(switchBox);

  const switchDefs = [
    { key: 'showCone', label: 'KONİYİ GÖSTER', on: () => options.showCone },
    { key: 'analysis', label: 'ANALİZ', on: () => options.analysis },
    { key: 'fov', label: 'GENİŞ AÇI', on: () => options.fov > 100 },
    { key: 'range', label: 'UZUN MESAFE', on: () => options.range > 280 },
  ];
  const switches = switchDefs.map((d) => {
    const b = el('button', 'lab-switch', d.label);
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', 'false');
    b.dataset.key = d.key;
    switchBox.appendChild(b);
    return { d, b };
  });

  const statBox = el('div', 'lab-stats');
  const statGood = el('span', 'lab-stat is-good');
  statGood.append('KAÇIŞ ');
  const goodVal = el('b', '', '0');
  statGood.appendChild(goodVal);
  const statBad = el('span', 'lab-stat is-bad');
  statBad.append('FARK EDİLME ');
  const badVal = el('b', '', '0');
  statBad.appendChild(badVal);
  statBox.append(statGood, statBad);
  panel.appendChild(statBox);

  const resetBtn = el('button', 'lab-btn', 'Sıfırla');
  resetBtn.type = 'button';
  panel.appendChild(resetBtn);

  const touch = el('div', 'lab-touch');
  const pad = el('div', 'lab-vision-dpad');
  pad.style.cssText = 'display:grid;grid-template-columns:repeat(3,auto);grid-template-areas:". up ." "left down right";gap:6px;justify-content:center;';
  const keyDefs = [['up', '↑', 'Yukarı'], ['left', '←', 'Sol'], ['down', '↓', 'Aşağı'], ['right', '→', 'Sağ']];
  const keyBtns = {};
  for (const [k, glyph, name] of keyDefs) {
    const b = el('button', 'lab-key', glyph);
    b.type = 'button';
    b.dataset.key = k;
    b.setAttribute('aria-label', name);
    b.style.gridArea = k;
    b.style.touchAction = 'none';
    pad.appendChild(b);
    keyBtns[k] = b;
  }
  touch.appendChild(pad);

  const hint = el('p', 'lab-hint');
  container.append(stage, panel, touch, hint);

  const ctx = canvas.getContext('2d');

  // ---------- olay dinleyici takibi ----------
  const offs = [];
  const on = (target, type, fn, o) => {
    target.addEventListener(type, fn, o);
    offs.push(() => target.removeEventListener(type, fn, o));
  };

  // ---------- oyun durumu ----------
  const mob = { x: START.x, y: START.y, look: 1, dir: 1, phase: 0, amp: 0 };
  const g = { x: PATH[0][0], y: PATH[0][1], wp: 0, s: 0, ang: 0, stepPh: 0 };
  const stats = { escapes: 0, spotted: 0 };
  let mode = 'play';            // 'play' | 'alert' | 'win'
  let alertT = 0, alertTime0 = 0, winT = 0;
  let time = 0;
  let coneK = 1, anaK = 0;      // koni / analiz katmanı solma değerleri
  let started = false, promptA = 1;
  let scale = 1;
  let destroyed = false;
  let inView = true;
  let raf = 0, last = 0, acc = 0;

  function initGuard() {
    g.wp = 0; g.s = 0;
    g.x = PATH[0][0]; g.y = PATH[0][1];
    g.ang = Math.atan2(PATH[1][1] - PATH[0][1], PATH[1][0] - PATH[0][0]);
    g.stepPh = 0;
  }
  initGuard();

  function resetMobu() {
    mob.x = START.x; mob.y = START.y;
    mob.look = 1; mob.dir = 1; mob.phase = 0; mob.amp = 0;
  }
  function syncStats() {
    goodVal.textContent = String(stats.escapes);
    badVal.textContent = String(stats.spotted);
  }
  function syncSwitches() {
    for (const { d, b } of switches) {
      const v = !!d.on();
      b.setAttribute('aria-checked', v ? 'true' : 'false');
      b.classList.toggle('is-on', v);
    }
  }
  syncSwitches();
  syncStats();

  // ---------- girdi ----------
  const CODES = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  };
  const codeToDir = {};
  for (const k of Object.keys(CODES)) for (const c of CODES[k]) codeToDir[c] = k;
  const kbCodes = new Set();
  const touchHeld = { left: false, right: false, up: false, down: false };
  const isDown = (k) => touchHeld[k] || CODES[k].some((c) => kbCodes.has(c));

  function noteInput() {
    if (started) return;
    started = true;
    emit({ type: 'start' });
  }
  function releaseAll() {
    kbCodes.clear();
    for (const k of Object.keys(touchHeld)) touchHeld[k] = false;
    for (const k of Object.keys(keyBtns)) keyBtns[k].classList.remove('is-down');
  }

  on(canvas, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (codeToDir[e.code]) {
      e.preventDefault();
      kbCodes.add(e.code);
      noteInput();
    } else if (e.code === 'Space') {
      e.preventDefault();       // sayfa kaymasın
    }
  });
  on(canvas, 'keyup', (e) => {
    if (codeToDir[e.code]) { e.preventDefault(); kbCodes.delete(e.code); }
  });
  on(canvas, 'blur', () => { kbCodes.clear(); });
  on(canvas, 'pointerdown', () => { try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); } });

  let hintFlashed = false, hintTimer = 0;
  on(canvas, 'focus', () => {
    if (hintFlashed) return;
    hintFlashed = true;
    hint.classList.add('is-lit');
    hint.style.color = '#F5F5F5';
    hintTimer = setTimeout(() => { hint.classList.remove('is-lit'); hint.style.color = ''; }, 1600);
  });

  for (const k of Object.keys(keyBtns)) {
    const b = keyBtns[k];
    on(b, 'pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* yoksay */ }
      touchHeld[k] = true;
      b.classList.add('is-down');
      noteInput();
    });
    const up = () => { touchHeld[k] = false; b.classList.remove('is-down'); };
    on(b, 'pointerup', up);
    on(b, 'pointercancel', up);
    on(b, 'lostpointercapture', up);
    on(b, 'contextmenu', (e) => e.preventDefault());
  }

  // ---------- panel ----------
  function uiToggle(key) {
    let v;
    if (key === 'showCone' || key === 'analysis') { options[key] = !options[key]; v = options[key]; }
    else if (key === 'fov') { options.fov = options.fov > 100 ? 90 : 120; v = options.fov; }
    else if (key === 'range') { options.range = options.range > 280 ? 240 : 320; v = options.range; }
    else return;
    sfx('switch');
    syncSwitches();
    emit({ type: 'toggle', key, value: v });
  }
  for (const { d, b } of switches) on(b, 'click', () => uiToggle(d.key));
  on(resetBtn, 'click', () => { handle.reset(); });

  // ---------- ipucu (klavye / dokunmatik) ----------
  const mqCoarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  const coarse = () => !!(mqCoarse && mqCoarse.matches);
  function syncHint() { hint.textContent = coarse() ? HINT_TOUCH : HINT_KB; }
  syncHint();
  if (mqCoarse) {
    if (mqCoarse.addEventListener) on(mqCoarse, 'change', syncHint);
    else if (mqCoarse.addListener) { mqCoarse.addListener(syncHint); offs.push(() => mqCoarse.removeListener(syncHint)); }
  }

  // ---------- boyutlandırma ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || stage.clientWidth || W);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(2, Math.round(cssW * dpr)), ph = Math.max(2, Math.round(pw * H / W));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    scale = pw / W;
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (destroyed) return; resize(); draw(); });
    ro.observe(canvas);
  } else {
    on(window, 'resize', () => { resize(); draw(); });
  }

  // ---------- fizik / mantık ----------
  const hitsFoot = (r) =>
    mob.x - FOOT_X < r.x + r.w && mob.x + FOOT_X > r.x && mob.y - FOOT_Y < r.y + r.h && mob.y + FOOT_Y > r.y;

  function moveAxis(axis, delta) {
    if (!delta) return;
    if (axis === 0) mob.x += delta; else mob.y += delta;
    for (let i = 0; i < WALLS.length; i++) {
      const r = WALLS[i];
      if (!hitsFoot(r)) continue;
      if (axis === 0) mob.x = delta > 0 ? r.x - FOOT_X : r.x + r.w + FOOT_X;
      else mob.y = delta > 0 ? r.y - FOOT_Y : r.y + r.h + FOOT_Y;
    }
  }

  function advanceGuard(dt) {
    const n = PATH.length;
    let rem = GUARD_SPEED * dt;
    g.stepPh += rem * 0.12;
    while (rem > 0) {
      const a = PATH[g.wp], b = PATH[(g.wp + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const left = len - g.s;
      if (rem < left) { g.s += rem; rem = 0; } else { rem -= left; g.s = 0; g.wp = (g.wp + 1) % n; }
    }
    const a = PATH[g.wp], b = PATH[(g.wp + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = len ? g.s / len : 0;
    g.x = a[0] + (b[0] - a[0]) * u;
    g.y = a[1] + (b[1] - a[1]) * u;
    const tgt = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.ang += wrapPi(tgt - g.ang) * (1 - Math.exp(-5.5 * dt));    // yumuşak dönüş
  }

  function spot() {
    mode = 'alert';
    alertT = 0;
    alertTime0 = time;
    mob.amp = 0;
    stats.spotted++;
    syncStats();
    sfx('alarm');
    emit({
      type: 'spotted', count: stats.spotted,
      distance: Math.round(Math.hypot(mob.x - g.x, mob.y - g.y)),
      coneVisible: options.showCone,
    });
  }
  function goal() {
    mode = 'win';
    winT = 0;
    mob.amp = 0;
    stats.escapes++;
    syncStats();
    sfx('win');
    emit({ type: 'goal', count: stats.escapes, spotted: stats.spotted });
  }

  function update(dt) {
    time += dt;

    // katman solmaları
    const kf = reduced ? 1 : 1 - Math.exp(-14 * dt);
    coneK += ((options.showCone ? 1 : 0) - coneK) * kf;
    anaK += ((options.analysis ? 1 : 0) - anaK) * kf;
    promptA += ((started ? 0 : 1) - promptA) * (1 - Math.exp(-12 * dt));

    if (mode !== 'alert') advanceGuard(dt);       // uyarı anında her şey donar

    if (mode === 'play') {
      let ix = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
      let iy = (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0);
      if (ix && iy) { ix *= Math.SQRT1_2; iy *= Math.SQRT1_2; }
      const x0 = mob.x, y0 = mob.y;
      moveAxis(0, ix * MOBU_SPEED * dt);
      moveAxis(1, iy * MOBU_SPEED * dt);
      const moved = Math.hypot(mob.x - x0, mob.y - y0);
      mob.phase += moved * 0.045;
      if (ix) mob.dir = ix > 0 ? 1 : -1;
      const lt = ix > 0 ? 1 : ix < 0 ? -1 : mob.look;
      mob.look += (lt - mob.look) * (1 - Math.exp(-14 * dt));
      const walking = moved > 1e-4;
      mob.amp += ((walking ? 1 : 0) - mob.amp) * (1 - Math.exp(-(walking ? 25 : 14) * dt));

      if (Math.hypot(mob.x - DOOR.x, mob.y - DOOR.base) < GOAL_R) goal();
      else if (canSee(g.x, g.y, g.ang, options.fov, options.range, mob.x, mob.y)) spot();
    } else if (mode === 'alert') {
      alertT += dt;
      if (alertT >= ALERT_T) { resetMobu(); mode = 'play'; alertT = 0; }
    } else if (mode === 'win') {
      winT += dt;
      if (winT >= WIN_T) { resetMobu(); mode = 'play'; winT = 0; }
    }
  }

  // ---------- çizim yardımcıları ----------
  function capsule(text, cx, cy, color, stroke, free) {
    ctx.font = FONT_MONO(free ? 14 : 12);
    const w = ctx.measureText(text).width + 16, h = free ? 22 : 19;
    // free: çağıran kendi dönüşümünü kurdu (kırpma yok); aksi halde kadraj içinde tut
    const x = (free ? cx : clamp(cx, w / 2 + 4, W - w / 2 - 4)) - w / 2;
    const y = (free ? cy : clamp(cy, h / 2 + 4, H - h / 2 - 4)) - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 9.5); else ctx.rect(x, y, w, h);
    ctx.fillStyle = 'rgba(10,10,10,.84)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke || 'rgba(182,124,255,.7)';
    ctx.stroke();
    ctx.fillStyle = color || '#F5F5F5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }

  function polyPath(pts) {
    ctx.moveTo(g.x, g.y);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawFloor() {
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(-10, -10, W + 20, H + 20);
    const tint = ctx.createRadialGradient(480, 310, 0, 480, 310, 540);
    tint.addColorStop(0, 'rgba(139,61,255,.06)');
    tint.addColorStop(1, 'rgba(139,61,255,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(-10, -10, W + 20, H + 20);
  }

  function drawGrid(k) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(24, 102, 912, 414);
    ctx.clip();
    ctx.strokeStyle = `rgba(182,124,255,${0.07 * k})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 48) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  }

  // Kör nokta: koninin duvarsız (tam) dilimi eksi görünen çokgen → mor tarama.
  function drawHatch(poly, k) {
    const half = options.fov * DEG / 2, a0 = g.ang - half, a1 = g.ang + half, R = options.range;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.arc(g.x, g.y, R, a0, a1);
    ctx.closePath();
    polyPath(poly);
    ctx.clip('evenodd');
    ctx.strokeStyle = `rgba(139,61,255,${0.32 * k})`;
    ctx.lineWidth = 1.5;
    const bx0 = g.x - R, bx1 = g.x + R, by0 = g.y - R, by1 = g.y + R, hh = by1 - by0;
    ctx.beginPath();
    for (let o = -hh; o < bx1 - bx0; o += 9) {
      ctx.moveTo(bx0 + o, by1);
      ctx.lineTo(bx0 + o + hh, by0);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCone(poly, alpha, flash) {
    ctx.save();
    ctx.beginPath();
    polyPath(poly);
    ctx.fillStyle = `rgba(239,74,92,${(0.14 + 0.36 * flash) * alpha})`;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(239,74,92,${(0.55 + 0.4 * flash) * alpha})`;
    ctx.stroke();
    ctx.restore();
  }

  function drawWalls() {
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    for (const r of WALLS) ctx.strokeRect(r.x, r.y, r.w, r.h);   // kontur önce (yarısı duvarın altında kalır)
    ctx.fillStyle = '#2B2B2B';
    for (const r of WALLS) ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  function drawDoor() {
    const cx = DOOR.x, top = DOOR.y - 32, bot = DOOR.base, w = 48;
    const pul = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 2.6);
    // kapının önündeki zemin parıltısı (çıkış bölgesi)
    const gl = ctx.createRadialGradient(cx, bot, 4, cx, bot, 78);
    gl.addColorStop(0, `rgba(182,124,255,${0.32 + 0.12 * pul})`);
    gl.addColorStop(1, 'rgba(182,124,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(cx - 80, bot, 160, 84);
    // kapı
    ctx.save();
    const gr = ctx.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, GLOW);
    gr.addColorStop(1, PURPLE);
    ctx.shadowColor = 'rgba(182,124,255,.9)';
    ctx.shadowBlur = (14 + 8 * pul) * scale;
    ctx.fillStyle = gr;
    ctx.fillRect(cx - w / 2, top, w, bot - top);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeRect(cx - w / 2, top, w, bot - top);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(233,221,255,.55)';
    ctx.strokeRect(cx - w / 2 + 7, top + 7, w - 14, bot - top - 7);
  }

  function drawGuard() {
    const alert = mode === 'alert';
    const wide = alert ? eBack(lin(alertT, 0, 0.16)) : 0;     // göz büyümesi
    const fx = Math.cos(g.ang), fy = Math.sin(g.ang);
    const ox = fx * 5, oy = fy * 3.5;                         // yüz, baktığı yöne kayar
    const stepK = alert ? 0 : Math.sin(g.stepPh);

    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + GR + 4, GR * 1.02, GR * 0.28, 0, 0, 7);
    ctx.fill();

    ctx.save();
    ctx.translate(g.x, g.y);

    // ayaklar
    ctx.fillStyle = RED2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sd * 9, GR + 1 + sd * stepK * 2.5, 7, 5, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
    }

    // gövde
    ctx.beginPath();
    ctx.arc(0, 0, GR, 0, 7);
    ctx.fillStyle = RED;
    ctx.fill();

    // şapka (koyu, küçük) — gövdeye kırpılır
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, GR - 1, 0, 7);
    ctx.clip();
    const cb = -GR * 0.36 + oy * 0.7;
    ctx.beginPath();
    ctx.moveTo(-GR - 3, -GR - 3);
    ctx.lineTo(GR + 3, -GR - 3);
    ctx.lineTo(GR + 3, cb);
    ctx.quadraticCurveTo(ox * 0.8, cb + 6 + oy * 2, -GR - 3, cb);
    ctx.closePath();
    ctx.fillStyle = '#2B2B2B';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-GR - 3, cb);
    ctx.quadraticCurveTo(ox * 0.8, cb + 6 + oy * 2, GR + 3, cb);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();

    // kontur
    ctx.beginPath();
    ctx.arc(0, 0, GR, 0, 7);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // gözler
    const ex = 6.5, ey = 2 + oy - wide * 1.5;
    const rx = 5 + wide * 2, ry = 5.5 + wide * 3;
    for (const sd of [-1, 1]) {
      const cx = sd * ex + ox;
      ctx.beginPath();
      ctx.ellipse(cx, ey, rx, ry, 0, 0, 7);
      ctx.fillStyle = '#F5F5F5';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      const pr = 2.3 - wide * 0.7;
      ctx.arc(cx + fx * 1.8 * (1 - wide), ey + fy * 1.8 * (1 - wide), pr, 0, 7);
      ctx.fillStyle = INK;
      ctx.fill();
      // kaşlar: öfkeli eğik; uyarıda yukarı kalkar
      ctx.beginPath();
      const bo = sd * 11.5 + ox, bi = sd * 1.5 + ox;
      const by0 = ey - ry - 1 - wide * 3, slant = 6 * (1 - wide * 0.85);
      ctx.moveTo(bo, by0 - slant * 0.4);
      ctx.lineTo(bi, by0 + slant * 0.6);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBang() {
    const k = eBack(lin(alertT, 0, 0.28));
    if (k <= 0) return;
    const x = g.x, y = g.y - GR - 30;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.rotate(-0.1);
    ctx.font = FONT_DISPLAY(38);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.strokeText('!', 0, 0);
    ctx.fillStyle = GOLD;
    ctx.fillText('!', 0, 0);
    ctx.restore();
  }

  function drawMobu() {
    const alert = mode === 'alert';
    const tt = alert ? alertTime0 : time;       // uyarıda nefes/titreşim de donar
    setBoil(Math.floor(tt * 8));
    const m = mk(tt, mob.x, mob.y, MS);
    m.look = mob.look;
    if (alert) {
      m.face = 'scared';
      m.armR = ARM_HEAD;
      squash(m, Math.max(0, 1 - alertT / 0.25));
    } else if (mode === 'win') {
      m.face = 'proud';
      m.armR = ARM_HIP;
      squash(m, Math.max(0, 1 - winT / 0.25) * 0.8);
    } else if (mob.amp > 0.04) {
      walk(m, mob.phase, mob.dir, 1, mob.amp);
    }
    stageMobu(ctx, m);
  }

  function drawAnalysis(k, seen) {
    // muhafızın bakış çizgisi
    const fx = Math.cos(g.ang), fy = Math.sin(g.ang);
    const L = Math.max(GR, castRay(g.x, g.y, fx, fy, options.range));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(245,245,245,${0.55 * k})`;
    ctx.beginPath();
    ctx.moveTo(g.x + fx * GR, g.y + fy * GR);
    ctx.lineTo(g.x + fx * L, g.y + fy * L);
    ctx.stroke();

    // muhafız → Mobu kesikli çizgi + mesafe
    const tx = mob.x, ty = mob.y - 2;
    const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = seen ? `rgba(239,74,92,${0.9 * k})` : `rgba(245,245,245,${0.42 * k})`;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    if (d > 4) {
      const fxp = mob.x, fyp = mob.y - 326 * MS;          // yüz merkezi: etiket yüzün üstüne gelmesin
      let q = 0.5, lx = g.x + dx * q, ly = g.y + dy * q;
      while (Math.hypot(lx - fxp, ly - fyp) < 62 && q > 0.12) {
        q -= 0.07; lx = g.x + dx * q; ly = g.y + dy * q;
      }
      ctx.globalAlpha = k;
      capsule(`${Math.round(Math.hypot(mob.x - g.x, mob.y - g.y))} px`, lx, ly - 14,
        seen ? '#EF4A5C' : '#F5F5F5', seen ? 'rgba(239,74,92,.8)' : 'rgba(182,124,255,.7)');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(480, 300, 240, 480, 300, 640);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = v;
    ctx.fillRect(-10, -10, W + 20, H + 20);
  }

  function drawWin() {
    const bx = mob.x, by = mob.y - 40;
    if (!reduced) {
      for (let i = 0; i < 2; i++) {
        const u = lin(winT, i * 0.12, i * 0.12 + 0.7);
        if (u <= 0 || u >= 1) continue;
        ctx.beginPath();
        ctx.arc(bx, by, lerp(26, 170, eOut(u)), 0, 7);
        ctx.lineWidth = 2 + 7 * (1 - u);
        ctx.strokeStyle = `rgba(182,124,255,${0.9 * (1 - u)})`;
        ctx.stroke();
      }
    }
    // "KAÇTIN!" — Mobu'nun yüzünü kapatmasın: solunda
    const k = reduced ? 1 : clamp(eBack(lin(winT, 0.05, 0.35)), 0, 1.15);
    const fade = 1 - lin(winT, WIN_T - 0.3, WIN_T);
    if (k <= 0 || fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(bx - 58, by + 6);
    ctx.scale(k, k);
    ctx.font = FONT_DISPLAY(44);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.strokeText('KAÇTIN!', 0, 0);
    ctx.shadowColor = 'rgba(139,61,255,.9)';
    ctx.shadowBlur = 14 * scale;
    ctx.fillStyle = GLOW;
    ctx.fillText('KAÇTIN!', 0, 0);
    ctx.restore();
  }

  function drawPrompt() {
    if (promptA < 0.02) return;
    const pul = reduced ? 1 : 0.5 + 0.5 * Math.sin(time * 5);
    const label = coarse() ? '← ↑ ↓ →' : 'WASD';
    ctx.save();
    ctx.globalAlpha = promptA * (0.6 + 0.4 * pul);
    const s = reduced ? 1 : 1 + 0.04 * pul;
    ctx.translate(mob.x, Math.min(mob.y + 25, H - 20));
    ctx.scale(s, s);
    capsule(label, 0, 0, '#F5F5F5', GLOW, true);
    ctx.restore();
  }

  function draw() {
    if (destroyed || !ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (!reduced && mode === 'alert' && alertT < 0.3) {
      const k = 1 - alertT / 0.3;
      ctx.translate(Math.sin(time * 97) * 2.4 * k, Math.cos(time * 83) * 2.4 * k);
    }

    drawFloor();
    const alert = mode === 'alert';
    const coneAlpha = alert ? 1 : coneK;
    const wantPoly = coneAlpha > 0.01 || anaK > 0.01;
    const poly = wantPoly ? buildCone(g.x, g.y, g.ang, options.fov, options.range) : null;

    if (anaK > 0.01) { drawGrid(anaK); drawHatch(poly, anaK); }
    if (coneAlpha > 0.01) {
      const flash = alert ? (reduced ? 1 : Math.abs(Math.sin(alertT * Math.PI * 3.5))) : 0;
      drawCone(poly, coneAlpha, flash);
    }

    drawWalls();
    drawDoor();

    // derinlik sırası: önce yukarıdaki (küçük y), sonra aşağıdaki
    const guardFirst = g.y + GR <= mob.y;
    if (guardFirst) { drawGuard(); drawMobu(); } else { drawMobu(); drawGuard(); }
    if (alert) drawBang();

    if (anaK > 0.01) drawAnalysis(anaK, alert || canSee(g.x, g.y, g.ang, options.fov, options.range, mob.x, mob.y));

    drawVignette();
    ctx.restore();

    if (mode === 'win') drawWin();
    drawPrompt();
  }

  // ---------- döngü ----------
  const active = () => inView && !document.hidden;
  function frame(ts) {
    raf = 0;
    if (destroyed || !active()) return;
    const now = ts / 1000;
    const dt = last ? Math.min(now - last, 0.1) : 0;
    last = now;
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    draw();
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || destroyed || !active()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  let io = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      inView = !!(e && e.isIntersecting);
      if (inView) kick(); else releaseAll();
    }, { threshold: 0 });
    io.observe(container);
  }
  on(document, 'visibilitychange', () => { if (document.hidden) releaseAll(); else kick(); });
  on(window, 'blur', () => { kbCodes.clear(); });

  resize();
  draw();
  kick();

  // ---------- dış arayüz ----------
  const handle = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(hintTimer);
      for (const off of offs) { try { off(); } catch (_) { /* yoksay */ } }
      offs.length = 0;
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      kbCodes.clear();
      try { container.replaceChildren(); } catch (_) { container.innerHTML = ''; }
    },
    reset() {
      if (destroyed) return;
      stats.escapes = 0;
      stats.spotted = 0;
      syncStats();
      resetMobu();
      initGuard();
      mode = 'play';
      alertT = 0;
      winT = 0;
      emit({ type: 'reset' });
    },
    setOption(key, value) {
      if (destroyed) return;
      switch (key) {
        case 'showCone':
        case 'analysis':
          options[key] = !!value;
          break;
        case 'fov': {
          const n = Number(value);
          if (!Number.isFinite(n)) return;
          options.fov = clamp(n, 20, 170);
          break;
        }
        case 'range': {
          const n = Number(value);
          if (!Number.isFinite(n)) return;
          options.range = clamp(n, 80, 600);
          break;
        }
        default:
          return;
      }
      syncSwitches();
    },
    getOptions() {
      return { showCone: options.showCone, analysis: options.analysis, fov: options.fov, range: options.range };
    },
  };
  return handle;
}
