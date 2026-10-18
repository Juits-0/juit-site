// =====================================================================
//  JUIT LAB · TELEGRAF DENEYİ
//  Video: "Bosslar neden saldırmadan önce haber veriyor?"
//  Mobu bir taş golemin vuruşlarından kaçar. TELEGRAF açıkken golem
//  önce durur, kolunu kaldırır, gözleri kızarır, yerde kırmızı daire
//  dolar (0.85 sn). Kapalıyken yumruk 0.12 sn'de, uyarısız iner.
//
//  mountTelegraphLab(container, { onEvent, reducedMotion, sfx }) → handle
//  Seçenek: telegraph (bool, varsayılan true)
//  Olaylar: start, reset, toggle{key,value}, dodge, hit, ko, goal
// =====================================================================
import {
  mk, stageMobu, walk, airPose, squash, pancake, setBoil, nz, hash, heart, smooth,
  ARM_UPS, ARM_HEAD, ARM_HIP, eBack, eOut, eIO, S3, lerp, clamp, lin,
  INK, GLOW, RED, GOLD,
} from '../mobu/mobu-draw.js';

// ---------- sabitler ----------
const W = 960, H = 540, FLOOR = 430, MS = 0.28;
const X_MIN = 60, X_MAX = 620, START_X = 240;
const STEP = 1 / 120;
const SPEED = 300, GRAV = 1900, JUMP = -600;
const HIT_R = 110, HIT_H = 60;
const WIND = 0.85, SLAM_ON = 0.14, SLAM_OFF = 0.12, HOLD = 0.3, RECOVER = 0.6;
const GOAL = 8, MAX_HEARTS = 3;
const D2R = Math.PI / 180;

const HUDX = 420;                       // HUD ve altyazı ekseni (golemden uzak)
const HX = 800, HY = 346;               // golem kalça noktası (üst gövde bunun etrafında eğilir)
const L1B = 118, L2B = 96, RF = 22;     // üst kol, ön kol, bilek→yumruk merkezi
const IDLE_A = 118 * D2R, IDLE_B = 64 * D2R;
const RAISE_A = 200 * D2R, RAISE_B = 310 * D2R, RAISE_LEAN = 0.07;
const R_A = 58 * D2R, R_B = 96 * D2R;   // uzak (sağ) kol, sarkık
const ARM_MAX = 1.15;                   // kol, dinlenme uzunluğunun en çok 1.15 katı
const STRIDE_MOVE = 0.72;               // adımın kayma kısmı; kalanı yere basış

const STONE = '#3a3a44', STONE_D = '#2c2c36', STONE_L = '#464653';
const EYE_DIM = '#7a56b8';

const fd = n => `900 ${n}px "InterDisplay", Inter, system-ui, sans-serif`;
const fm = n => `700 ${n}px "JetBrains Mono", ui-monospace, monospace`;

const HINT_KB = '← → kaç · Boşluk zıpla · Önce AÇIK, sonra KAPALI dene';
const HINT_TOUCH = 'Düğmelerle kaç ve zıpla · Uyarıyı kapatıp farkı hisset';

// ---------- yardımcılar ----------
const hexRgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mixHex = (a, b, k) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`;
};
const wrapPi = x => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function label(g, s, x, y, o) {
  g.save();
  g.font = o.font;
  g.textAlign = o.align || 'center';
  g.textBaseline = 'middle';
  g.globalAlpha *= o.a == null ? 1 : o.a;
  if (o.sc != null && o.sc !== 1) { g.translate(x, y); g.scale(o.sc, o.sc); x = 0; y = 0; }
  g.lineJoin = 'round';
  if (o.stroke) { g.lineWidth = o.sw || 6; g.strokeStyle = o.stroke; g.strokeText(s, x, y); }
  if (o.shadow) { g.shadowColor = o.shadow; g.shadowBlur = o.sb || 14; }
  g.fillStyle = o.fill || '#F5F5F5';
  g.fillText(s, x, y);
  g.restore();
}

function star(g, cx, cy, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

// pozlar: a/b = üst kol/ön kol mutlak açısı (tuval radyanı, 90° = aşağı, 180° = sol), l1/l2 = uzunluk
const mixP = (p, q, k) => ({
  a: lerp(p.a, q.a, k), b: lerp(p.b, q.b, k), l1: lerp(p.l1, q.l1, k), l2: lerp(p.l2, q.l2, k),
  lean: lerp(p.lean, q.lean, k), bob: lerp(p.bob, q.bob, k), ex: lerp(p.ex, q.ex, k),
});
const RAISED = { a: RAISE_A, b: RAISE_B, l1: L1B, l2: L2B, lean: RAISE_LEAN, bob: 0, ex: 1 };
const idlePose = (rt, sw) => ({
  a: IDLE_A + Math.sin(rt * 1.3) * 0.035 * sw,
  b: IDLE_B + Math.sin(rt * 1.3 + 0.9) * 0.045 * sw,
  l1: L1B, l2: L2B,
  lean: Math.sin(rt * 0.9) * 0.006 * sw,
  bob: Math.sin(rt * 1.9) * 2.2 * sw,
  ex: 0,
});

// Omuz noktası (dünya): üst gövde kalçada eğilir; ox = golemin ev konumundan yatay kayması
function shoulderPt(relX, lean, bob, jx, jy, ox = 0) {
  const c = Math.cos(lean), s = Math.sin(lean);
  return [HX + ox + jx + relX * c + 160 * s, HY + bob + jy + relX * s - 160 * c];
}

// n adımlı yürüyüş eğrisi: her adımda ağır kayma + yere basış durağı
const stepCurve = (u, n) => {
  const w = clamp(u) * n, j = Math.min(n - 1, Math.floor(w));
  return (j + eIO(clamp((w - j) / STRIDE_MOVE))) / n;
};

// İki kemikli ters kinematik (üst kol l1, ön kol l2, yumruk merkezi Fc). Dirsek hep sol-üst tarafa bükülür.
function ikArm(S, Fc, l1, l2) {
  let a = 2.9, b = 1.9;
  for (let it = 0; it < 3; it++) {
    const dx = Fc[0] - Math.cos(b) * RF - S[0], dy = Fc[1] - Math.sin(b) * RF - S[1];
    const d = Math.hypot(dx, dy) || 1;
    const dc = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(d, l1 + l2 - 0.5));
    const aa = (dc * dc + l1 * l1 - l2 * l2) / (2 * dc);
    const h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    const ux = dx / d, uy = dy / d;
    const p = 2 * uy > ux ? [-uy, ux] : [uy, -ux];
    const Ex = S[0] + ux * aa + p[0] * h, Ey = S[1] + uy * aa + p[1] * h;
    a = Math.atan2(Ey - S[1], Ex - S[0]);
    b = Math.atan2(S[1] + uy * dc - Ey, S[0] + ux * dc - Ex);
  }
  return { a, b };
}

// Yumruk merkezi (dünya): omuz + iki segment + bilek→yumruk
function fistOf(S, a, b, l1, l2) {
  return [
    S[0] + Math.cos(a) * l1 + Math.cos(b) * (l2 + RF),
    S[1] + Math.sin(a) * l1 + Math.sin(b) * (l2 + RF),
  ];
}

// Yere vuruş pozu. Kol en çok ARM_MAX kadar uzar; erişilemeyen hedefe golem YÜRÜR (ox = gereken kayma),
// kol omuz→dirsek→bilek→yumruk zinciri olarak dışa/yukarı bükülür.
function solveSlam(tx) {
  const lean = -0.17;
  let ox = clamp(tx + 85 - shoulderPt(-60, lean, 0, 0, 0, 0)[0], -600, 0);
  if (ox > -14) ox = 0;
  const S = shoulderPt(-60, lean, 0, 0, 0, ox);
  const Fc = [tx, FLOOR - 25];
  const k = clamp((Math.hypot(Fc[0] - S[0], Fc[1] - S[1]) - RF) * 1.2 / (L1B + L2B), 1, ARM_MAX);
  const l1 = L1B * k, l2 = L2B * k;
  let { a, b } = ikArm(S, Fc, l1, l2);
  a = RAISE_A + wrapPi(a - RAISE_A);
  let diff = (((RAISE_B - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (diff < 0.3) diff += 2 * Math.PI;
  b = RAISE_B - diff;                                // ön kol tepeden öne doğru savrulur
  return { a, b, l1, l2, lean, bob: 0, ex: 1, ox };
}

// =====================================================================
export function mountTelegraphLab(container, opts = {}) {
  const rm = () => !!opts.reducedMotion;
  const sfx = n => { try { opts.sfx?.play?.(n); } catch (e) { /* ses isteğe bağlı */ } };
  const emit = ev => { try { opts.onEvent?.(ev); } catch (e) { /* dinleyici hatası oyunu bozmasın */ } };
  const doc = container.ownerDocument || document;
  const disposers = [];
  let destroyed = false;

  // ---------- DOM ----------
  const mkEl = (tag, cls, txt) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  container.textContent = '';

  const style = mkEl('style');
  style.textContent = `
.lab-telegraph-title{font:700 12px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.14em;color:#8C8C8C;margin:0 0 10px}
.lab-telegraph-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 12px}
.lab-telegraph-label{font:700 13px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em;color:#F5F5F5}
.lab-telegraph-stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.lab-telegraph-stat-v{margin-left:6px;font-variant-numeric:tabular-nums}`;

  const stage = mkEl('div', 'lab-stage');
  const canvas = mkEl('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Telegraf deneyi: Mobu taş golemin vuruşlarından kaçıyor');
  canvas.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:16/9;-webkit-tap-highlight-color:transparent';
  stage.appendChild(canvas);

  const panel = mkEl('div', 'lab-panel');
  panel.appendChild(mkEl('div', 'lab-panel-title lab-telegraph-title', 'OYUN AYARLARI'));
  const row = mkEl('div', 'lab-row lab-telegraph-row');
  row.appendChild(mkEl('span', 'lab-label lab-telegraph-label', 'TELEGRAF'));
  const sw = mkEl('button', 'lab-switch');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', 'true');
  sw.setAttribute('aria-label', 'Telegraf');
  row.appendChild(sw);
  panel.appendChild(row);

  const statsBox = mkEl('div', 'lab-stats lab-telegraph-stats');
  const mkStat = (cls, name) => {
    const s = mkEl('span', 'lab-stat' + (cls ? ' ' + cls : ''));
    s.appendChild(doc.createTextNode(name));
    const v = mkEl('b', 'lab-telegraph-stat-v', '0');
    s.appendChild(v);
    statsBox.appendChild(s);
    return v;
  };
  const vDodge = mkStat('is-good', 'KAÇIŞ');
  const vHit = mkStat('is-bad', 'VURULMA');
  const vStreak = mkStat('', 'SERİ');
  panel.appendChild(statsBox);
  const btnReset = mkEl('button', 'lab-btn', 'Sıfırla');
  btnReset.type = 'button';
  panel.appendChild(btnReset);

  const touchBox = mkEl('div', 'lab-touch');
  const touchBtns = [];
  for (const [k, sym, aria] of [['left', '◀', 'Sola git'], ['right', '▶', 'Sağa git'], ['jump', '▲', 'Zıpla']]) {
    const b = mkEl('button', 'lab-key', sym);
    b.type = 'button';
    b.dataset.key = k;
    b.setAttribute('aria-label', aria);
    b.style.touchAction = 'none';
    touchBox.appendChild(b);
    touchBtns.push(b);
  }

  const hint = mkEl('p', 'lab-hint');
  container.append(style, stage, panel, touchBox, hint);

  const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  const isCoarse = () => !!(mq && mq.matches);
  const updHint = () => { hint.textContent = isCoarse() ? HINT_TOUCH : HINT_KB; };
  updHint();
  if (mq && mq.addEventListener) { mq.addEventListener('change', updHint); disposers.push(() => mq.removeEventListener('change', updHint)); }

  const ctx = canvas.getContext('2d');
  let sc = 1;

  // ---------- oyun durumu ----------
  const opt = { telegraph: true };
  let T = 0, acc = 0;
  let started = false, startT = -9, focused = false;
  let hearts = MAX_HEARTS, nDodge = 0, nHit = 0, streak = 0;
  let ov = null;                                 // { kind:'ko'|'goal', t0, dur }
  let flash = null, shake = null, chip = null;
  const queue = [];
  const later = (d, fn) => { queue.push({ at: T + d, fn }); };

  const M = {
    x: START_X, px: START_X, h: 0, ph: 0, vx: 0, vy: 0, grounded: true, face: 1, wph: 0,
    jumpBuf: 0, coyote: 0, cut: false, stunUntil: 0, hurtT: -9, landT: -9, ko: false, koT: -9, stepT: -9,
  };
  const B = {
    phase: 'idle', t0: 0, wait: 1.5, tx: 400, tele: true, dur: SLAM_ON, sp: null, from: null, eyeFrom: 0, gap: 2.6, slamT0: 0,
    ox: 0, mv: null, dipT: -9,                    // golemin yatay kayması / yürüyüş hareketi / son adım zamanı
  };
  let bossFist = null;                            // sol yumruk Mobu'dan SONRA çizilir
  let rings = [], debris = [], dust = [], pops = [];

  const keys = { left: false, right: false, jump: false };
  const touch = { left: false, right: false, jump: false };
  const isDown = k => keys[k] || touch[k];

  function syncStats() {
    vDodge.textContent = String(nDodge);
    vHit.textContent = String(nHit);
    vStreak.textContent = streak + '/' + GOAL;
  }
  syncStats();

  function syncSwitch() {
    sw.setAttribute('aria-checked', opt.telegraph ? 'true' : 'false');
    sw.classList.toggle('is-on', opt.telegraph);
  }
  syncSwitch();

  // ---------- giriş ----------
  function firstInput() {
    if (started) return;
    started = true;
    startT = T;
    B.wait = Math.max(B.wait, 1.3);
    emit({ type: 'start' });
  }
  function press(k) {
    firstInput();
    if (k === 'jump') M.jumpBuf = 0.12;
  }
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  };
  const keyOf = e => KEYMAP[e.code] || (e.key === ' ' ? 'jump' : null);
  const onKeyDown = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    press(k);
  };
  const onKeyUp = e => {
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    keys[k] = false;
  };
  const clearKeys = () => { keys.left = keys.right = keys.jump = false; };
  let hintTimer = 0;
  disposers.push(() => clearTimeout(hintTimer));
  const onFocus = () => {
    focused = true;
    clearTimeout(hintTimer);
    hint.classList.add('is-flash');
    hint.style.color = '#F5F5F5';
    hintTimer = setTimeout(() => { hint.classList.remove('is-flash'); hint.style.color = ''; }, 1600);
  };
  const onBlur = () => { focused = false; clearKeys(); };
  const onCanvasDown = () => { try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); } };
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onCanvasDown);
  disposers.push(() => {
    canvas.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('focus', onFocus);
    canvas.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onCanvasDown);
  });

  for (const b of touchBtns) {
    const k = b.dataset.key;
    const onDown = e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
      if (!touch[k]) { touch[k] = true; press(k); }
      b.classList.add('is-down');
    };
    const onUp = () => { touch[k] = false; b.classList.remove('is-down'); };
    const noMenu = e => e.preventDefault();
    b.addEventListener('pointerdown', onDown);
    b.addEventListener('pointerup', onUp);
    b.addEventListener('pointercancel', onUp);
    b.addEventListener('lostpointercapture', onUp);
    b.addEventListener('contextmenu', noMenu);
    disposers.push(() => {
      b.removeEventListener('pointerdown', onDown);
      b.removeEventListener('pointerup', onUp);
      b.removeEventListener('pointercancel', onUp);
      b.removeEventListener('lostpointercapture', onUp);
      b.removeEventListener('contextmenu', noMenu);
    });
  }

  // ---------- seçenek / panel ----------
  function applyTele(v, fromUI) {
    v = !!v;
    if (v === opt.telegraph) return;
    opt.telegraph = v;
    syncSwitch();
    chip = { t0: T, on: v };
    if (B.phase === 'wind') {                     // uyarı sürerken kapanırsa: kol yumuşakça iner
      B.from = bossPose(T);
      B.eyeFrom = eyeK(T);
      B.phase = 'abort';
      B.t0 = T;
      B.wait = 1.1;
      startMove(0, T, 0.9, 2);
    }
    if (fromUI) {
      sfx('switch');
      emit({ type: 'toggle', key: 'telegraph', value: v });
    }
  }
  const onSwitch = e => {
    applyTele(!opt.telegraph, true);
    if (e.detail) onCanvasDown();
  };
  const onResetBtn = e => {
    resetAll(true);
    if (e.detail) onCanvasDown();
  };
  sw.addEventListener('click', onSwitch);
  btnReset.addEventListener('click', onResetBtn);
  disposers.push(() => { sw.removeEventListener('click', onSwitch); btnReset.removeEventListener('click', onResetBtn); });

  // ---------- oyun mantığı ----------
  function resetPlayer() {
    hearts = MAX_HEARTS;
    M.x = M.px = START_X; M.h = M.ph = 0; M.vx = 0; M.vy = 0; M.grounded = true; M.cut = false;
    M.jumpBuf = 0; M.stunUntil = 0; M.ko = false; M.hurtT = -9; M.landT = -9; M.face = 1;
    ov = null; flash = null;
    B.wait = Math.max(B.wait, 1.4);
  }

  function resetAll(announce) {
    queue.length = 0;
    nDodge = 0; nHit = 0; streak = 0;
    rings = []; debris = []; dust = []; pops = [];
    shake = null; chip = null;
    B.phase = 'idle'; B.t0 = T; B.wait = 1.5; B.sp = null; B.from = null;
    B.ox = 0; B.mv = null; B.dipT = -9; bossFist = null;
    resetPlayer();
    syncStats();
    if (announce) emit({ type: 'reset' });
  }

  function addPop(text, col, dy = 0) {
    pops.push({ text, col, t0: T, dur: 1, dy });
  }

  function spawnDust(x, n, power) {
    if (rm()) return;
    for (let i = 0; i < n; i++) {
      dust.push({ x: x + rnd(-14, 14), y: FLOOR - 2, vx: rnd(-1, 1) * power, vy: -rnd(18, 60), r: rnd(6, 11), t0: T });
    }
  }

  function doHit() {
    hearts = Math.max(0, hearts - 1);
    nHit++; streak = 0;
    M.stunUntil = T + 0.42; M.hurtT = T; M.vx = 0;
    if (!rm()) flash = { t0: T };
    syncStats();
    emit({ type: 'hit', hearts });
    later(0.05, () => sfx('hit'));
    if (hearts <= 0) {
      M.ko = true; M.koT = T;
      ov = { kind: 'ko', t0: T, dur: 1.2 };
      emit({ type: 'ko' });
      later(0.4, () => sfx('fail'));
      later(1.2, resetPlayer);
    }
  }

  function doDodge() {
    nDodge++; streak++;
    if (streak < GOAL) addPop('KAÇTI!', GLOW);
    emit({ type: 'dodge', streak });
    later(0.05, () => sfx('save'));
    if (streak >= GOAL) {
      streak = 0;
      ov = { kind: 'goal', t0: T, dur: 2.6 };
      emit({ type: 'goal' });
      later(0.3, () => sfx('win'));
    }
    syncStats();
  }

  function impact() {
    const tx = B.tx;
    rings.push({ t0: T, x: tx });
    if (!rm()) {
      shake = { t0: T };
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        debris.push({
          x: tx + rnd(-26, 26), y: FLOOR - 8, vx: rnd(-250, 250), vy: -rnd(300, 560),
          r: rnd(5, 9), rot: rnd(0, 6), vr: rnd(-12, 12), t0: T,
        });
      }
      spawnDust(tx, 8, 120);
    }
    sfx('land');
    B.gap = rnd(2.2, 3.0);
    if (!M.ko && Math.abs(M.x - tx) <= HIT_R && M.h <= HIT_H) doHit();
    else if (!M.ko) doDodge();
  }

  function beginAttack() {
    B.tx = clamp(M.x, X_MIN, X_MAX);
    B.tele = opt.telegraph;
    B.sp = solveSlam(B.tx);
    if (B.tele) {
      B.phase = 'wind'; B.t0 = T;
      sfx('alarm');
      startMove(B.sp.ox, T + 0.22, WIND - 0.22, 2);     // 2 · KOLUNU KALDIRIR sırasında iki ağır adım
    } else {
      B.phase = 'slam'; B.t0 = T; B.dur = SLAM_OFF; B.slamT0 = T;
      startMove(B.sp.ox, T, SLAM_OFF, 1);                // uyarısız: tek adımda atılma
    }
  }

  // ---------- golem yürüyüşü ----------
  function oxAt(rt) {
    const m = B.mv;
    return m ? lerp(m.from, m.to, stepCurve((rt - m.t0) / m.dur, m.n)) : B.ox;
  }
  function startMove(to, t0, dur, n) {
    const from = oxAt(t0);
    if (Math.abs(to - from) < 6) { B.ox = to; B.mv = null; return; }
    B.mv = { from, to, t0, dur, n: Math.abs(to - from) < 60 ? 1 : n, next: 0 };
  }
  function plant(m, j) {                                  // adım yere basar: toz + ses + gövde çökmesi
    const leftLead = (Math.sign(m.to - m.from) || -1) < 0 ? j % 2 === 0 : j % 2 === 1;
    B.dipT = T;
    sfx('step');
    spawnDust(HX + oxAt(T) + (leftLead ? -27 : 27), 5, 90);
  }
  function stepMove() {
    const m = B.mv;
    if (!m) return;
    while (m.next < m.n && T >= m.t0 + m.dur * (m.next + STRIDE_MOVE) / m.n) plant(m, m.next++);
    if (T >= m.t0 + m.dur) { B.ox = m.to; B.mv = null; }
  }

  function stepBoss(dt) {
    const b = B, el = T - b.t0;
    stepMove();
    switch (b.phase) {
      case 'idle': {
        if (started && !ov && !M.ko) {
          b.wait -= dt;
          if (b.wait <= 0) beginAttack();
        }
        break;
      }
      case 'wind':
        if (el >= WIND) { b.phase = 'slam'; b.t0 = T; b.dur = SLAM_ON; b.slamT0 = T; }
        break;
      case 'slam':
        if (el >= b.dur) { impact(); b.phase = 'hold'; b.t0 = T; }
        break;
      case 'hold':
        if (el >= HOLD) { b.phase = 'recover'; b.t0 = T; startMove(0, T, 0.9, 2); }   // ~1 sn'de ev konumuna döner
        break;
      case 'recover':
        if (el >= RECOVER) {
          const lead = opt.telegraph ? WIND + SLAM_ON : SLAM_OFF;
          b.phase = 'idle'; b.t0 = T;
          b.wait = Math.max(0.25, b.gap - HOLD - RECOVER - lead);
        }
        break;
      case 'abort':
        if (el >= 0.35) { b.phase = 'idle'; b.t0 = T; }
        break;
      default: break;
    }
  }

  function stepMobu(dt) {
    M.px = M.x; M.ph = M.h;
    const locked = M.ko || T < M.stunUntil;
    let dir = 0;
    if (!locked) { if (isDown('left')) dir -= 1; if (isDown('right')) dir += 1; }
    const accel = locked ? 6000 : (M.grounded ? 4200 : 2400);
    M.vx += clamp(dir * SPEED - M.vx, -accel * dt, accel * dt);
    if (dir) M.face = dir;
    let nx = M.x + M.vx * dt;
    if (nx < X_MIN) { nx = X_MIN; if (M.vx < 0) M.vx = 0; }
    if (nx > X_MAX) { nx = X_MAX; if (M.vx > 0) M.vx = 0; }
    M.x = nx;

    if (M.jumpBuf > 0) M.jumpBuf -= dt;
    M.coyote = M.grounded ? 0.08 : M.coyote - dt;
    if (!locked && M.jumpBuf > 0 && M.coyote > 0) {
      M.vy = JUMP; M.grounded = false; M.coyote = 0; M.jumpBuf = 0; M.cut = false;
      sfx('jump');
    }
    if (!M.grounded) {
      if (!M.cut && M.vy < -220 && !isDown('jump')) { M.vy *= 0.45; M.cut = true; }   // değişken zıplama
      M.vy += GRAV * dt;
      M.h -= M.vy * dt;
      if (M.h <= 0) {
        const vl = M.vy;
        M.h = 0; M.vy = 0; M.grounded = true; M.cut = false;
        if (vl > 280) { M.landT = T; sfx('land'); spawnDust(M.x, 5, 90); }
      }
    }
    if (M.grounded && Math.abs(M.vx) > 40) {
      M.wph += Math.abs(M.vx) * dt * 0.05;
      if (T - M.stepT > 0.3) { M.stepT = T; sfx('step'); }
    }
  }

  function stepFx(dt) {
    for (const d of debris) {
      d.vy += 1700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
      if (d.y > FLOOR - 3 && d.vy > 0) { d.y = FLOOR - 3; d.vy *= -0.25; d.vx *= 0.55; d.vr *= 0.5; }
    }
    for (const p of dust) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; }
    if (debris.length || dust.length || rings.length || pops.length) {
      debris = debris.filter(d => T - d.t0 < 1.1);
      dust = dust.filter(p => T - p.t0 < 0.55);
      rings = rings.filter(r => T - r.t0 < 0.7);
      pops = pops.filter(p => T - p.t0 < p.dur);
    }
    if (ov && T - ov.t0 > ov.dur) ov = null;
  }

  function runLater() {
    for (let i = 0; i < queue.length;) {
      if (queue[i].at <= T) {
        const q = queue.splice(i, 1)[0];
        try { q.fn(); } catch (e) { /* yok say */ }
      } else i++;
    }
  }

  function step(dt) {
    T += dt;
    runLater();
    stepMobu(dt);
    stepBoss(dt);
    stepFx(dt);
  }

  // ---------- golem pozu ----------
  // Yürüyüş görünümü: kayma (ox), kalkan bacak, gövde zıplaması ve her basışta çökme
  function strideVis(rt) {
    const m = B.mv;
    let liftL = 0, liftR = 0, bob = 0;
    if (m) {
      const u = (rt - m.t0) / m.dur;
      if (u > 0 && u < 1) {
        const w = u * m.n, j = Math.min(m.n - 1, Math.floor(w)), f = w - j;
        if (f < STRIDE_MOVE) {
          const sn = Math.sin(Math.PI * f / STRIDE_MOVE);
          const leftLead = (Math.sign(m.to - m.from) || -1) < 0 ? j % 2 === 0 : j % 2 === 1;
          if (leftLead) liftL = 24 * sn; else liftR = 24 * sn;
          bob = -4 * sn;
        }
      }
    }
    const dd = rt - B.dipT;
    if (dd >= 0 && dd < 0.5) bob += 5 * Math.exp(-dd * 14);
    return { ox: oxAt(rt), liftL, liftR, bob };
  }
  function bossPose(rt) {
    const p = bossPoseBase(rt), sv = strideVis(rt);
    const frozen = B.phase === 'slam' || B.phase === 'hold';        // yumruk zemine tam otursun
    return { ...p, ox: sv.ox, liftL: sv.liftL, liftR: sv.liftR, bob: p.bob + (frozen ? 0 : sv.bob) };
  }
  function bossPoseBase(rt) {
    const el = Math.max(0, rt - B.t0);
    switch (B.phase) {
      case 'wind': {
        const base = idlePose(rt, 1 - S3(el / 0.1));            // 1 · DURUR: nefes ve sallanma kesilir
        const k = eIO(lin(el, 0.22, 0.74));                      // 2 · KOLUNU KALDIRIR
        const p = mixP(base, RAISED, k);
        if (el > 0.74 && !rm()) { const tr = Math.sin(el * 90) * 0.02; p.a += tr; p.b -= tr * 1.2; }
        return p;
      }
      case 'slam': {
        const u = clamp(el / B.dur);
        if (B.tele) return mixP(RAISED, B.sp, Math.pow(u, 2.2));
        if (u < 0.3) return mixP(idlePose(rt, 1), RAISED, eOut(u / 0.3));   // uyarısız: bir anda kalkıp iner
        return mixP(RAISED, B.sp, Math.pow((u - 0.3) / 0.7, 2));
      }
      case 'hold':
        return { ...B.sp, bob: 7 * Math.exp(-el * 9) };
      case 'recover': {
        // yumruk zemini sürtmeden, hafif kalkarak geri çekilir; kol kısalırken zincir her karede çözülür
        const e = eIO(clamp(el / RECOVER)), I = idlePose(rt, 1), ox = oxAt(rt);
        const lean = lerp(B.sp.lean, I.lean, e), bob = lerp(0, I.bob, e);
        const l1 = lerp(B.sp.l1, L1B, e), l2 = lerp(B.sp.l2, L2B, e);
        const Fi = fistOf(shoulderPt(-60, I.lean, I.bob, 0, 0, ox), I.a, I.b, L1B, L2B);
        const Fc = [lerp(B.tx, Fi[0], e), lerp(FLOOR - 25, Fi[1], e) - 80 * Math.sin(Math.PI * e)];
        const { a, b } = ikArm(shoulderPt(-60, lean, bob, 0, 0, ox), Fc, l1, l2);
        return { a, b, l1, l2, lean, bob, ex: 1 - e };
      }
      case 'abort':
        return mixP(B.from, idlePose(rt, 1), eIO(clamp(el / 0.35)));
      default:
        return idlePose(rt, 1);
    }
  }
  function eyeK(rt) {
    const el = Math.max(0, rt - B.t0);
    switch (B.phase) {
      case 'wind': return S3(el / 0.08);
      case 'slam': case 'hold': return B.tele ? 1 : 0;
      case 'recover': return B.tele ? 1 - S3(el / 0.4) : 0;
      case 'abort': return B.eyeFrom * (1 - S3(el / 0.2));
      default: return 0;
    }
  }

  // ---------- çizim: dünya ----------
  function drawBackdrop(g) {
    g.fillStyle = '#0A0A0A';
    g.fillRect(-20, -20, W + 40, H + 40);
    const gl = g.createRadialGradient(480, -20, 0, 480, -20, 520);
    gl.addColorStop(0, 'rgba(139,61,255,.16)');
    gl.addColorStop(1, 'rgba(139,61,255,0)');
    g.fillStyle = gl;
    g.fillRect(-20, -20, W + 40, H + 40);
  }

  function drawFloor(g) {
    g.fillStyle = '#2B2B2B';
    g.fillRect(-20, FLOOR, W + 40, H - FLOOR + 20);
    g.fillStyle = '#363636';
    g.fillRect(-20, FLOOR, W + 40, 14);
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(-20, 444); g.lineTo(W + 20, 444);
    g.moveTo(-20, 492); g.lineTo(W + 20, 492);
    for (let x = 0; x <= W; x += 120) { g.moveTo(x, 444); g.lineTo(x, 492); }
    for (let x = 60; x <= W; x += 120) { g.moveTo(x, 492); g.lineTo(x, H + 10); }
    g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(-20, FLOOR); g.lineTo(W + 20, FLOOR); g.stroke();
  }

  function drawArm(g, S, a, b, l1, l2, tag, defer) {
    const E = [S[0] + Math.cos(a) * l1, S[1] + Math.sin(a) * l1];
    const Wr = [E[0] + Math.cos(b) * l2, E[1] + Math.sin(b) * l2];
    const F = [Wr[0] + Math.cos(b) * RF + nz(tag) * 0.7, Wr[1] + Math.sin(b) * RF + nz(tag + 1) * 0.7];
    g.lineCap = 'round'; g.lineJoin = 'round';
    const seg = (p, q) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
    const ws = Math.min(1.7, 1 + 0.3 * (l1 / L1B - 1));        // uzayan kol incelmez, kalınlaşır (ağır taş)
    g.strokeStyle = INK;
    g.lineWidth = 40 * ws; seg(S, E);
    g.lineWidth = 36 * ws; seg(E, Wr);
    g.strokeStyle = STONE;
    g.lineWidth = 31 * ws; seg(S, E);
    g.lineWidth = 27 * ws; seg(E, Wr);
    // taş segment çizgileri
    g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'butt';
    for (const [p, q, w] of [[S, E, 14 * ws], [E, Wr, 12 * ws]]) {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.floor(len / 64));
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
      for (let i = 1; i <= n; i++) {
        const t = (i / (n + 1)) * len, cx = p[0] + ux * t, cy = p[1] + uy * t;
        g.beginPath(); g.moveTo(cx - uy * w, cy + ux * w); g.lineTo(cx + uy * w, cy - ux * w); g.stroke();
      }
    }
    // yuvarlak eklemler
    g.lineWidth = 4.5;
    g.fillStyle = STONE_L;
    const wj = Math.min(ws, 1.4);
    for (const [p, r] of [[S, 23], [E, 19 * wj], [Wr, 16 * wj]]) {
      g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); g.stroke();
    }
    if (!defer) drawFist(g, F, 0);
    return F;
  }

  // Yumruk (öndeki kolun yumruğu Mobu'dan sonra çizilir; tint = kırmızı flaş payı)
  function drawFist(g, F, tint) {
    g.strokeStyle = INK; g.fillStyle = STONE_L; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); rr(g, F[0] - 27, F[1] - 25, 54, 50, 16); g.fill(); g.stroke();
    if (tint > 0) { g.fillStyle = `rgba(239,74,92,${tint})`; g.fill(); }
    g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    for (const dx of [-10, 0, 10]) { g.moveTo(F[0] + dx, F[1] + 2); g.lineTo(F[0] + dx, F[1] + 19); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(F[0] - 17, F[1] - 15); g.lineTo(F[0] + 5, F[1] - 17); g.stroke();
  }

  function crack(g, pts, a) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.globalAlpha = a;
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawBoss(g, rt) {
    const P = bossPose(rt), eye = eyeK(rt);
    const lean = P.lean, bob = P.bob;
    const jx = nz(41) * 0.8, jy = nz(42) * 0.8;
    const ox = P.ox;
    const SL = shoulderPt(-60, lean, bob, jx, jy, ox), SR = shoulderPt(60, lean, bob, jx, jy, ox);

    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(HX + ox, FLOOR + 3, 84, 12, 0, 0, 7); g.fill();

    // uzak kol (arkada, sarkık)
    drawArm(g, SR, R_A + 0.28 * P.ex + Math.sin(rt * 1.3 + 2) * 0.03 * (1 - P.ex), R_B + 0.2 * P.ex, L1B, L2B, 51);

    // bacaklar (yere basar, eğilmez)
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = INK; g.fillStyle = STONE_D;
    g.beginPath(); rr(g, 750 + ox, 326 - P.liftL, 46, 104, 9); g.fill(); g.stroke();
    g.beginPath(); rr(g, 804 + ox, 326 - P.liftR, 46, 104, 9); g.fill(); g.stroke();
    g.fillStyle = STONE;
    g.beginPath(); rr(g, 742 + ox, 414 - P.liftL, 56, 16, 6); g.fill(); g.stroke();
    g.beginPath(); rr(g, 802 + ox, 414 - P.liftR, 56, 16, 6); g.fill(); g.stroke();

    // üst gövde: kalçada eğilir
    g.save();
    g.translate(HX + ox + jx, HY + bob + jy);
    g.rotate(lean);
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = STONE_D;
    g.beginPath(); rr(g, -62, -26, 124, 34, 8); g.fill(); g.stroke();                 // kalça bloğu
    g.fillStyle = STONE;
    g.beginPath(); rr(g, -72, -196, 144, 200, 26); g.fill(); g.stroke();              // gövde
    g.fillStyle = '#43434f'; g.lineWidth = 3.5;
    g.beginPath(); rr(g, -52, -178, 104, 90, 14); g.fill(); g.stroke();               // göğüs plakası
    g.strokeStyle = '#25252d'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-62, -64); g.lineTo(-12, -64); g.moveTo(12, -64); g.lineTo(62, -64);
    g.moveTo(-30, -64); g.lineTo(-30, -38); g.moveTo(34, -64); g.lineTo(34, -34);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-60, -170); g.lineTo(-60, -110); g.stroke();
    // omuz başlığı (uzak taraf)
    g.strokeStyle = INK; g.lineWidth = 5; g.fillStyle = STONE_L;
    g.beginPath(); g.arc(60, -160, 24, 0, 7); g.fill(); g.stroke();
    // baş
    g.fillStyle = STONE; g.lineWidth = 5;
    g.beginPath(); rr(g, -45, -258, 90, 68, 18); g.fill(); g.stroke();
    g.fillStyle = STONE_D;
    g.beginPath(); rr(g, -40, -240, 80, 13, 6); g.fill();
    g.strokeStyle = INK; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(-22, -202); g.lineTo(22, -202); g.stroke();
    // gözler
    const col = mixHex(EYE_DIM, RED, eye);
    g.save();
    g.shadowColor = col; g.shadowBlur = 6 + 18 * eye;
    g.fillStyle = col;
    g.beginPath(); rr(g, -30, -222, 19, 12, 5); rr(g, 11, -222, 19, 12, 5); g.fill();
    g.restore();
    if (eye > 0.3) {                                                                   // kızgın kaş
      g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.globalAlpha = clamp(eye);
      g.beginPath(); g.moveTo(-36, -229); g.lineTo(-8, -217); g.moveTo(36, -229); g.lineTo(8, -217); g.stroke();
      g.globalAlpha = 1;
    }
    // parlayan çatlaklar
    const pulse = 0.78 + 0.22 * Math.sin(rt * (3 + 5 * P.ex));
    g.save();
    g.strokeStyle = GLOW; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = GLOW; g.shadowBlur = 9;
    crack(g, [[-8, -172], [2, -150], [-10, -132], [0, -110], [-14, -92]], pulse);
    crack(g, [[2, -150], [16, -142], [22, -124]], pulse);
    crack(g, [[22, -52], [14, -38], [24, -22]], pulse);
    crack(g, [[22, -256], [16, -246], [27, -238]], pulse);
    g.restore();
    g.restore();

    // sol (öndeki) kol: omuz → dirsek → bilek → yumruk, hep gövdeye bağlı
    bossFist = drawArm(g, SL, P.a, P.b, P.l1, P.l2, 61, true);
  }

  function drawZone(g, rt) {
    if (!B.tele) return;
    const el = rt - B.t0;
    let p, al = 1;
    if (B.phase === 'wind') p = clamp(el / WIND);
    else if (B.phase === 'slam') p = 1;
    else if (B.phase === 'hold' && el < 0.18) { p = 1; al = 1 - el / 0.18; }
    else return;
    const cx = B.tx, cy = FLOOR + 4, rx = HIT_R, ry = 19;
    g.save();
    g.globalAlpha = al;
    g.fillStyle = `rgba(239,74,92,${0.2 + 0.2 * p})`;
    g.beginPath(); g.ellipse(cx, cy, Math.max(1, rx * p), Math.max(1, ry * p), 0, 0, 7); g.fill();
    g.globalAlpha = al * (0.7 + 0.3 * Math.sin(el * (12 + 26 * p)));
    g.strokeStyle = RED; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke();
    g.restore();
  }

  function drawRings(g, rt) {
    for (const r of rings) {
      const u = (rt - r.t0) / 0.6;
      if (u < 0 || u > 1) continue;
      const e = eOut(u), rx = 24 + 150 * e;
      g.save();
      g.globalAlpha = 1 - u;
      g.strokeStyle = GLOW; g.lineWidth = 2 + 7 * (1 - u);
      g.beginPath(); g.ellipse(r.x, FLOOR + 4, rx, rx * 0.17, 0, 0, 7); g.stroke();
      g.strokeStyle = '#F5F5F5'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(r.x, FLOOR + 4, rx * 0.72, rx * 0.72 * 0.17, 0, 0, 7); g.stroke();
      g.restore();
    }
  }

  function drawDebris(g, rt) {
    for (const d of debris) {
      const age = rt - d.t0;
      g.save();
      g.globalAlpha = age > 0.8 ? clamp(1 - (age - 0.8) / 0.3) : 1;
      g.translate(d.x, d.y); g.rotate(d.rot);
      g.fillStyle = STONE; g.strokeStyle = INK; g.lineWidth = 2.5; g.lineJoin = 'round';
      g.beginPath(); g.rect(-d.r, -d.r * 0.8, d.r * 2, d.r * 1.6); g.fill(); g.stroke();
      g.restore();
    }
  }

  function drawDust(g, rt) {
    for (const p of dust) {
      const u = (rt - p.t0) / 0.5;
      if (u < 0 || u > 1) continue;
      g.fillStyle = `rgba(182,160,210,${0.4 * (1 - u)})`;
      g.beginPath(); g.arc(p.x + p.vx * u * 0.2, p.y + p.vy * u * 0.4, p.r * (0.7 + u), 0, 7); g.fill();
    }
  }

  // ---------- çizim: Mobu ----------
  function mobuLook(rt, x, h) {
    const m = mk(rt, x, FLOOR - h, MS);
    m.gy = FLOOR;
    m.look = M.face;
    let face = 'calm';
    const hurtEl = rt - M.hurtT;
    const zoneOn = B.tele && (B.phase === 'wind' || B.phase === 'slam');
    const near = zoneOn && Math.abs(x - B.tx) < HIT_R + 80;
    if (M.ko) {
      pancake(m, eOut(clamp((rt - M.koT) / 0.28)));
      face = 'x';
    } else if (hurtEl >= 0 && hurtEl < 0.7) {
      squash(m, 1 - S3(hurtEl / 0.45));
      face = 'x';
    } else if (!M.grounded) {
      airPose(m, clamp(0.5 + M.vy / 1200));
      if (M.vy > 150) { face = 'scared'; m.armR = m.armL = ARM_HEAD; }
      else { face = near ? 'o' : 'calm'; m.armR = m.armL = ARM_UPS; }
    } else {
      const moving = Math.abs(M.vx) > 40;
      if (moving) walk(m, M.wph, M.face < 0 ? -1 : 1, 1);
      const le = rt - M.landT;
      if (le >= 0 && le < 0.25) squash(m, 1 - le / 0.25);
      if (ov && ov.kind === 'goal' && !moving) { face = 'proud'; m.armR = m.armL = ARM_HIP; }
      else if (near) face = 'o';
    }
    m.face = face;
    return m;
  }

  function drawStars(g, rt, m) {
    const hurtEl = rt - M.hurtT;
    if (!M.ko && !(hurtEl >= 0 && hurtEl < 0.9)) return;
    const sy = M.ko ? lerp(1, 0.26, eOut(clamp((rt - M.koT) / 0.28))) : 1 - 0.22 * (1 - S3(clamp(hurtEl / 0.45)));
    const topY = FLOOR - M.h - 132 * sy - 14;
    for (let i = 0; i < 3; i++) {
      const ang = (rm() ? 0 : rt * 7) + i * 2.094;
      const x = m.x + Math.cos(ang) * 36, y = topY + Math.sin(ang) * 8;
      g.fillStyle = GOLD; g.strokeStyle = INK; g.lineWidth = 2.5; g.lineJoin = 'round';
      star(g, x, y, 9, rm() ? 0 : rt * 4 + i);
      g.fill(); g.stroke();
    }
  }

  // ---------- çizim: arayüz ----------
  function drawHearts(g, rt) {
    for (let i = 0; i < MAX_HEARTS; i++) {
      const alive = i < hearts;
      let cy = 30, w = 30, hh = 28;
      const he = rt - M.hurtT;
      if (i === hearts && he >= 0 && he < 0.45 && !rm()) { cy += Math.sin(he * 70) * 2.5; w *= 1 + 0.2 * (1 - he / 0.45); hh *= 1 + 0.2 * (1 - he / 0.45); }
      g.beginPath(); smooth(g, heart(38 + i * 36, cy, w, hh));
      g.lineJoin = 'round';
      if (alive) {
        g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
        g.fillStyle = RED; g.fill();
      } else {
        g.fillStyle = 'rgba(27,20,38,.55)'; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(239,74,92,.6)'; g.stroke();
      }
    }
    const lit = ov && ov.kind === 'goal' ? GOAL : streak;
    for (let i = 0; i < GOAL; i++) {
      g.beginPath(); g.arc(30 + i * 15, 64, 4.2, 0, 7);
      if (i < lit) { g.fillStyle = GLOW; g.fill(); }
      else { g.lineWidth = 1.8; g.strokeStyle = '#4a4a56'; g.stroke(); }
    }
  }

  function drawTimeline(g, rt) {
    const x0 = HUDX - 170, y0 = 14, w = 340, h = 28;
    g.save();
    g.beginPath(); rr(g, x0, y0, w, h, 14);
    if (!opt.telegraph) {
      g.fillStyle = 'rgba(239,74,92,.14)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = RED; g.stroke();
      label(g, 'TELEGRAF YOK', HUDX, y0 + h / 2 + 1, { font: fm(14), fill: RED });
      g.restore();
      return;
    }
    const el = rt - B.t0;
    let p = 0, act = 0;
    if (B.phase === 'wind' && B.tele) { p = clamp(el / WIND); act = 1; }
    else if ((B.phase === 'slam' || B.phase === 'hold') && B.tele) { p = 1; act = 1; }
    else if (B.phase === 'recover' && B.tele) { p = 1; act = 1 - clamp(el / 0.4); }
    g.fillStyle = 'rgba(10,10,10,.8)'; g.fill();
    g.lineWidth = 3;
    g.strokeStyle = act > 0 ? mixHex('#6b4aa8', RED, act) : 'rgba(182,124,255,.4)';
    g.stroke();
    label(g, 'HAZIRLIK', x0 + 14, y0 + h / 2 + 1, { font: fm(11), fill: act > 0 ? '#F5F5F5' : '#8C8C8C', align: 'left' });
    label(g, 'VURUŞ', x0 + w - 14, y0 + h / 2 + 1, { font: fm(11), fill: p >= 1 && act > 0 ? RED : '#8C8C8C', align: 'right' });
    const tx0 = x0 + 82, tw = 196, ty = y0 + h / 2 - 4;
    g.beginPath(); rr(g, tx0, ty, tw, 8, 4); g.fillStyle = 'rgba(255,255,255,.1)'; g.fill();
    if (p > 0) {
      g.beginPath(); rr(g, tx0, ty, Math.max(8, tw * p), 8, 4); g.fillStyle = RED; g.fill();
    }
    g.strokeStyle = 'rgba(245,245,245,.35)'; g.lineWidth = 1.5;
    const tk = tx0 + tw * (0.22 / WIND);
    g.beginPath(); g.moveTo(tk, ty - 3); g.lineTo(tk, ty + 11); g.stroke();
    g.fillStyle = act > 0 && p >= 1 ? RED : '#8C8C8C';
    g.beginPath(); g.moveTo(tx0 + tw + 5, ty - 1); g.lineTo(tx0 + tw + 13, ty + 4); g.lineTo(tx0 + tw + 5, ty + 9); g.closePath(); g.fill();
    g.restore();

    // adım yazısı
    let s = null, t0 = 0, a = 1;
    if (B.phase === 'wind' && B.tele) {
      if (el < 0.22) { s = '1 · DURUR'; t0 = B.t0; } else { s = '2 · KOLUNU KALDIRIR'; t0 = B.t0 + 0.22; }
    } else if ((B.phase === 'slam' || B.phase === 'hold') && B.tele) { s = '3 · VURUR'; t0 = B.slamT0; }
    else if (B.phase === 'recover' && B.tele && el < 0.4) { s = '3 · VURUR'; t0 = B.slamT0; a = 1 - el / 0.4; }
    if (s) label(g, s, HUDX, 60, { font: fm(14), fill: RED, a, sc: 0.8 + 0.2 * eBack(lin(rt, t0, t0 + 0.18)) });
  }

  function drawChip(g, rt) {
    if (!chip) return;
    const el = rt - chip.t0;
    if (el > 1.7) { chip = null; return; }
    const a = el > 1.35 ? 1 - (el - 1.35) / 0.35 : 1;
    const txt = chip.on ? 'TELEGRAF: AÇIK' : 'TELEGRAF: KAPALI';
    const col = chip.on ? GLOW : RED;
    g.save();
    g.globalAlpha = a;
    g.translate(HUDX, 104);
    const s = eBack(lin(el, 0, 0.22));
    g.scale(s, s);
    g.beginPath(); rr(g, -88, -14, 176, 28, 14);
    g.fillStyle = 'rgba(10,10,10,.85)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = col; g.stroke();
    label(g, txt, 0, 1, { font: fm(13), fill: col });
    g.restore();
  }

  function drawPops(g, rt, mx, mh) {
    for (const p of pops) {
      const el = rt - p.t0;
      const a = el > 0.7 ? clamp(1 - (el - 0.7) / 0.3) : 1;
      const x = clamp(mx, 90, 870), y = Math.min(262, FLOOR - mh - 170) - 34 * eOut(clamp(el / 0.9));
      label(g, p.text, x, y, {
        font: fd(36), fill: p.col, stroke: INK, sw: 7, a, sc: Math.max(0.01, eBack(lin(el, 0, 0.26))),
        shadow: 'rgba(139,61,255,.7)', sb: 14,
      });
    }
  }

  function drawPrompt(g, rt, mx) {
    const a = started ? 1 - clamp((rt - startT) / 0.3) : 1;
    if (a <= 0) return;
    const pul = 0.5 + 0.5 * Math.sin(rt * 5);
    g.save();
    g.globalAlpha = a * (0.65 + 0.35 * pul);
    g.translate(mx, 262);
    const s = 1 + 0.07 * pul;
    g.scale(s, s);
    g.beginPath(); rr(g, -44, -17, 88, 34, 17);
    g.fillStyle = 'rgba(10,10,10,.8)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = GLOW; g.stroke();
    label(g, '← →', 0, 1, { font: fd(20), fill: '#F5F5F5' });
    g.restore();
    if (!focused && !isCoarse()) {
      label(g, 'oynamak için tıkla', mx, 232, { font: fm(11), fill: '#8C8C8C', a });
    }
  }

  function drawCaptions(g, rt) {
    if (!ov) return;
    const el = rt - ov.t0;
    const fade = el > ov.dur - 0.3 ? clamp((ov.dur - el) / 0.3) : 1;
    if (ov.kind === 'ko') {
      label(g, 'K.O.', HUDX, 190, {
        font: fd(96), fill: RED, stroke: INK, sw: 12, a: fade, sc: Math.max(0.01, eBack(lin(el, 0, 0.26))),
        shadow: 'rgba(239,74,92,.55)', sb: 22,
      });
    } else {
      g.save();
      g.font = fd(30);
      const words = ['OKUDUN', 'KAÇTIN', 'KAZANDIN'];
      const dot = ' · ';
      const ww = words.map(w => g.measureText(w).width), dw = g.measureText(dot).width;
      const total = ww[0] + ww[1] + ww[2] + dw * 2;
      g.restore();
      const capW = total + 56, capH = 62;
      g.save();
      g.globalAlpha = fade;
      const cs = Math.max(0.01, eBack(lin(el, 0, 0.3)));
      g.translate(HUDX, 188); g.scale(cs, cs);
      g.beginPath(); rr(g, -capW / 2, -capH / 2, capW, capH, capH / 2);
      g.fillStyle = 'rgba(10,10,10,.82)'; g.fill();
      g.lineWidth = 4; g.strokeStyle = GLOW;
      g.shadowColor = GLOW; g.shadowBlur = 16; g.stroke();
      g.restore();
      let x = HUDX - total / 2;
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0.01, eBack(lin(el, 0.12 + i * 0.18, 0.12 + i * 0.18 + 0.24)));
        label(g, words[i], x + ww[i] / 2, 189, {
          font: fd(30), fill: i === 2 ? GLOW : '#F5F5F5', a: fade, sc: k, shadow: 'rgba(139,61,255,.8)', sb: 12,
        });
        x += ww[i];
        if (i < 2) { label(g, dot, x + dw / 2, 189, { font: fd(30), fill: '#8C8C8C', a: fade * clamp((el - 0.3 - i * 0.18) * 6) }); x += dw; }
      }
    }
  }

  // ---------- çerçeve ----------
  function render() {
    if (!ctx) return;
    const rt = T + acc, al = clamp(acc / STEP);
    setBoil(Math.floor(rt * 8));
    const g = ctx;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 1;
    drawBackdrop(g);

    let sx = 0, sy = 0;
    if (shake && !rm()) {
      const el = rt - shake.t0;
      if (el < 0.32) { const a = 7 * Math.exp(-el * 11), n = Math.floor(el * 60); sx = hash(n * 3 + 1) * a; sy = hash(n * 3 + 2) * a * 0.7; }
      else shake = null;
    }

    g.save();
    g.translate(sx, sy);
    drawFloor(g);
    drawBoss(g, rt);
    drawZone(g, rt);
    drawDebris(g, rt);

    const mx = lerp(M.px, M.x, al), mh = lerp(M.ph, M.h, al);
    if (ov && ov.kind === 'goal') {                       // mor halka Mobu'nun etrafında
      for (let i = 0; i < 2; i++) {
        const el = rt - ov.t0 - i * 0.35;
        if (el < 0 || el > 1.1) continue;
        const u = el / 1.1;
        g.save();
        g.globalAlpha = (1 - u) * 0.9;
        g.strokeStyle = GLOW; g.lineWidth = 1.5 + 6 * (1 - u);
        g.beginPath(); g.arc(mx, FLOOR - 64 - mh, rm() ? 120 : 40 + 170 * eOut(u), 0, 7); g.stroke();
        g.restore();
      }
    }
    let tint = 0;
    if (flash && !rm()) {                                 // kırmızı flaş: Mobu bunun ÜSTÜNE çizilir
      const el = rt - flash.t0;
      if (el < 0.32) { tint = 0.34 * (1 - el / 0.32); g.fillStyle = `rgba(239,74,92,${tint})`; g.fillRect(-30, -30, W + 60, H + 60); }
      else flash = null;
    }
    const m = mobuLook(rt, mx, mh);
    stageMobu(g, m);
    drawStars(g, rt, m);
    drawRings(g, rt);                                     // şok halkası ve yumruk Mobu'nun ÖNÜNDE
    if (bossFist) drawFist(g, bossFist, tint);
    drawDust(g, rt);
    g.restore();

    // vinyet
    const vg = g.createRadialGradient(480, 270, 250, 480, 270, 620);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.62)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    drawHearts(g, rt);
    drawTimeline(g, rt);
    drawChip(g, rt);
    drawPops(g, rt, mx, mh);
    drawPrompt(g, rt, mx);
    drawCaptions(g, rt);
  }

  // ---------- döngü / boyut ----------
  let raf = 0, last = 0, running = false, visible = true;
  function loop(ts) {
    raf = 0;
    if (!running || destroyed) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 24) { step(STEP); acc -= STEP; n++; }
    if (n >= 24) acc = 0;
    render();
  }
  function setRunning(v) {
    if (v === running) return;
    running = v;
    if (v) { last = 0; raf = requestAnimationFrame(loop); }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  const updateRun = () => setRunning(visible && !doc.hidden && !destroyed);

  function resize() {
    if (destroyed) return;
    const r = stage.getBoundingClientRect();
    const cw = Math.max(1, r.width || canvas.clientWidth || W);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(2, Math.round(cw * dpr)), ph = Math.round(pw * H / W);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    sc = pw / W;
    render();
  }

  let ro = null, io = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(resize); ro.observe(stage); }
  else { window.addEventListener('resize', resize); disposers.push(() => window.removeEventListener('resize', resize)); }
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; updateRun(); }, { threshold: 0.05 });
    io.observe(container);
  }
  doc.addEventListener('visibilitychange', updateRun);
  disposers.push(() => doc.removeEventListener('visibilitychange', updateRun));

  resetAll(false);
  resize();
  updateRun();

  // ---------- dışa açılan kol ----------
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      setRunning(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      for (const d of disposers) { try { d(); } catch (e) { /* yok say */ } }
      disposers.length = 0;
      queue.length = 0;
      clearKeys();
      container.textContent = '';
    },
    reset() { if (!destroyed) resetAll(true); },
    setOption(key, value) {
      if (destroyed) return;
      if (key === 'telegraph') applyTele(value, false);
    },
    getOptions() { return { telegraph: opt.telegraph }; },
  };
}
