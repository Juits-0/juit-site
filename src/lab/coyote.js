// =====================================================================
//  COYOTE TIME — JUIT LAB deneyi
//  "Oyunlar neden hatalı zıplamalarını affediyor?" videosundan.
//
//  Kenardan yürüyüp düştükten sonra 100 ms boyunca hâlâ zıplayabilmek
//  (coyote time) hissini gösterir. Pencere görünür bir kapsülle (damlayan
//  çubuk) ve yavaş çekimle okunur hale getirilir.
//
//  mountCoyoteLab(container, opts) → { destroy, reset, setOption, getOptions }
//  opts:    { onEvent(ev), reducedMotion, sfx:{play(name)} | null }
//  seçenek: coyote (bool, varsayılan true)
//  olaylar: start, toggle{key,value}, coyoteSave, miss, fall, goal{saves,falls}, reset
// =====================================================================
import {
  mk, stageMobu, walk, airPose, squash, pancake, setBoil,
  ARM_UPS, ARM_HEAD, ARM_HIP, ARM_DEF, lerpArm,
  eBack, eOut, S3, lerp, clamp,
  INK, PURPLE, GLOW, RED, GOLD,
} from '../mobu/mobu-draw.js';

// ---------- sabitler ----------
const W = 960, H = 540;
const GROUND = 420;                 // platform üst yüzü
const PIT_FLOOR = 522;              // çukur tabanı (alttaki taş şerit)
const PLATS = [[0, 220], [330, 560], [690, 820], [900, 960]];
const SPAWN = [70, 372, 732, 903];  // her platformun başlangıç noktası (ayak ortası)
const GOAL_X = 906, POLE_X = 948;
const HW = 12;                      // ayak yarı genişliği
const X_MIN = 40, X_MAX = 916;      // Mobu'nun kolları kadraj dışına taşmasın
const CAP_Y = GROUND - 196;         // coyote kapsülünün merkezi (Mobu'nun başının çok üstü)
const MS = 0.28;                    // Mobu ölçeği

const RUN = 260, ACC_G = 3250, ACC_A = 2600;
const GRAV = 1900, JUMP_V = -640;
const DT = 1 / 120;
const COYOTE_T = 0.1, SLOW = 0.35;
const PIT_PAUSE = 0.7, GOAL_HOLD = 1.5, FADE_OUT = 0.2, FADE_IN = 0.25;

const F_DISP = '"InterDisplay", Inter, system-ui, sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, monospace';
const TXT = '#F5F5F5', DIM = '#8C8C8C';

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
};

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

function platAt(px) {
  for (let i = 0; i < PLATS.length; i++) {
    if (px + HW > PLATS[i][0] && px - HW < PLATS[i][1]) return i;
  }
  return -1;
}

// ---------- çizim yardımcıları ----------
function inkText(g, str, x, y, size, fill, shade) {
  g.font = `900 ${size}px ${F_DISP}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.miterLimit = 2;
  const d = Math.max(2, size * 0.09);
  g.lineWidth = size * 0.2; g.strokeStyle = INK;
  g.strokeText(str, x, y + d);
  g.fillStyle = shade; g.fillText(str, x, y + d);
  g.fillStyle = fill; g.fillText(str, x, y);
}

function pillPath(g, cx, cy, w, h) {
  const r = h / 2, x0 = cx - w / 2, y0 = cy - h / 2;
  g.beginPath();
  g.moveTo(x0 + r, y0); g.lineTo(x0 + w - r, y0);
  g.arc(x0 + w - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x0 + r, y0 + h);
  g.arc(x0 + r, y0 + r, r, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
}

function starPath(g, cx, cy, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

function block(g, x, y, w, h) {
  g.fillStyle = '#2B2B2B'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 2, y + 2, w - 4, 3);   // düz üst yüz ışığı
  g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'miter';
  g.strokeRect(x, y, w, h);
}

function arrowGlyph(g, cx, cy, dir, a) {
  g.save();
  g.globalAlpha = a; g.strokeStyle = TXT; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - dir * 12, cy); g.lineTo(cx + dir * 12, cy);
  g.moveTo(cx + dir * 4, cy - 8); g.lineTo(cx + dir * 12, cy); g.lineTo(cx + dir * 4, cy + 8);
  g.stroke();
  g.restore();
}

// =====================================================================
export function mountCoyoteLab(container, opts = {}) {
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;
  const reduced = () => !!opts.reducedMotion;
  const play = name => { try { opts.sfx?.play?.(name); } catch (e) { /* ses hatası oyunu durdurmasın */ } };
  const emit = ev => { try { opts.onEvent?.(ev); } catch (e) { console.error('[coyote] onEvent hatası', e); } };

  const options = { coyote: true };
  let destroyed = false;

  const offs = [];
  const timers = new Set();
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const later = (fn, ms) => { const id = win.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------------------------------------------------------------- DOM
  const stage = el('div', 'lab-stage');
  const canvas = el('canvas');
  canvas.width = W; canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Coyote Time deneyi. Ok tuşlarıyla yürü, boşluk tuşuyla zıpla.');
  canvas.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:16/9;outline-offset:-3px;-webkit-tap-highlight-color:transparent;';
  stage.appendChild(canvas);

  const panel = el('div', 'lab-panel');
  const title = el('div', 'lab-panel-title lab-coyote-title', 'OYUN AYARLARI');
  title.style.cssText = `flex:1 0 100%;font:700 12px/1.2 ${F_MONO};letter-spacing:.14em;color:${DIM};`;
  const sw = el('button', 'lab-switch');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', 'true');
  sw.classList.add('is-on');
  sw.appendChild(el('span', 'lab-switch-label', 'COYOTE TIME'));
  const makeStat = (cls, label) => {
    const s = el('span', 'lab-stat ' + cls);
    const v = el('b', 'lab-stat-value', '0');
    s.append(el('span', 'lab-stat-label', label), ' ', v);
    return { root: s, val: v };
  };
  const statSaves = makeStat('is-good', 'KURTARAN ZIPLAMA');
  const statFalls = makeStat('is-bad', 'DÜŞME');
  statSaves.val.style.color = GLOW;
  statFalls.val.style.color = RED;
  const btnReset = el('button', 'lab-btn', 'Sıfırla');
  btnReset.type = 'button';
  panel.append(title, sw, statSaves.root, statFalls.root, btnReset);

  const touchBar = el('div', 'lab-touch');
  const hintKb = el('p', 'lab-hint lab-hint--kb', '← → yürü · Boşluk zıpla · Önce anahtar AÇIK, sonra KAPALI dene');
  const hintTouch = el('p', 'lab-hint lab-hint--touch', 'Düğmelerle yürü ve zıpla · Anahtarı kapatıp farkı hisset');

  container.append(stage, panel, touchBar, hintKb, hintTouch);

  const ctx = canvas.getContext('2d');

  // -------------------------------------------------------------- girdi
  const held = { left: new Set(), right: new Set(), jump: new Set() };
  const isHeld = a => held[a].size > 0;
  let jumpPressed = false;
  let hasInput = false, runStarted = false;
  let focused = false, hintFlashed = false;

  function noteInput() {
    hasInput = true;
    if (!runStarted) { runStarted = true; emit({ type: 'start' }); }
  }
  function press(a, src) {
    if (held[a].has(src)) return;
    held[a].add(src);
    if (a === 'jump') jumpPressed = true;
    noteInput();
  }
  function release(a, src) { held[a].delete(src); }
  function clearInputs() { held.left.clear(); held.right.clear(); held.jump.clear(); }

  on(canvas, 'keydown', e => {
    const a = KEYMAP[e.code];
    if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.repeat) return;
    press(a, 'k:' + e.code);
  });
  on(canvas, 'keyup', e => {
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    release(a, 'k:' + e.code);
  });
  on(canvas, 'pointerdown', () => { try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); } });
  on(canvas, 'focus', () => {
    focused = true;
    try { canvas.style.outline = canvas.matches(':focus-visible') ? '2px solid rgba(182,124,255,.7)' : 'none'; } catch (e) { /* eski tarayıcı */ }
    flashHint();
  });
  on(canvas, 'blur', () => { focused = false; canvas.style.outline = 'none'; clearInputs(); });
  on(win, 'blur', clearInputs);

  function flashHint() {
    if (hintFlashed) return;
    hintFlashed = true;
    for (const h of [hintKb, hintTouch]) {
      h.classList.add('is-lit');
      if (!reduced()) { try { h.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' }); } catch (e) { /* WAAPI yok */ } }
    }
    later(() => { hintKb.classList.remove('is-lit'); hintTouch.classList.remove('is-lit'); }, 1400);
  }

  // dokunmatik düğmeler
  function makeKey(act, label, aria) {
    const b = el('button', 'lab-key', label);
    b.type = 'button';
    b.dataset.key = act;
    b.setAttribute('aria-label', aria);
    b.style.touchAction = 'none';
    b.style.userSelect = 'none';
    b.style.webkitUserSelect = 'none';
    b.style.webkitTouchCallout = 'none';
    const down = e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* yakalama yok */ }
      b.classList.add('is-down');
      press(act, 'p:' + e.pointerId);
    };
    const up = e => { b.classList.remove('is-down'); release(act, 'p:' + e.pointerId); };
    on(b, 'pointerdown', down);
    on(b, 'pointerup', up);
    on(b, 'pointercancel', up);
    on(b, 'pointerleave', up);
    on(b, 'lostpointercapture', up);
    on(b, 'contextmenu', e => e.preventDefault());
    on(b, 'keydown', e => {            // klavye ile düğmeye odaklıysa
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) press(act, 'bk');
    });
    on(b, 'keyup', e => { if (e.key === 'Enter' || e.key === ' ') release(act, 'bk'); });
    on(b, 'blur', () => release(act, 'bk'));
    if (act === 'right') b.style.marginRight = 'auto';   // sol+sağ yan yana, zıpla karşı uçta
    touchBar.appendChild(b);
  }
  makeKey('left', '←', 'Sola yürü');
  makeKey('right', '→', 'Sağa yürü');
  makeKey('jump', 'ZIPLA', 'Zıpla');

  // ------------------------------------------------------------ durum
  let saves = 0, falls = 0;

  let x = SPAWN[0], y = GROUND, px_ = x, py_ = y;   // px_/py_: enterpolasyon için önceki adım
  let vx = 0, vy = 0;
  let grounded = true, jumping = false, savedAir = false;
  let lastPlat = 0;
  let facing = 1, lookV = 1, gaitPhase = 0;
  let landT = 0, landK = 0;
  let jumpBuf = 0;

  let state = 'play';                  // play | fall | pit | goal
  let stT = 0;
  let fade = null;                     // { phase:'out'|'in', t, level, hard }

  const wnd = { active: false, t: 0, pressed: false };
  let cv = null;                       // coyote kapsülü görseli

  // zaman
  let rt = 0, animT = 0, accum = 0, tsc = 1, last = 0, raf = 0;
  let visible = true;
  let scale = 1, bg = null;
  let shake = 0, promptA = 1, keysChecked = false;

  // efektler
  const pops = [], parts = [], rings = [];
  let chip = null;

  const coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);

  // ---------------------------------------------------------- yardımcılar
  function updateStats(bumpEl) {
    statSaves.val.textContent = String(saves);
    statFalls.val.textContent = String(falls);
    if (bumpEl && !reduced()) {
      try { bumpEl.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(.2,1.6,.4,1)' }); } catch (e) { /* WAAPI yok */ }
    }
  }

  function setCoyote(v, fromUser) {
    options.coyote = v;
    sw.setAttribute('aria-checked', v ? 'true' : 'false');
    sw.classList.toggle('is-on', v);
    chip = { text: v ? 'COYOTE: AÇIK' : 'COYOTE: KAPALI', on: v, born: rt };
    if (fromUser) {
      play('switch');
      emit({ type: 'toggle', key: 'coyote', value: v });
    }
    if (!raf) draw(0);
  }

  function snap() { px_ = x; py_ = y; }

  function teleport(plat) {
    x = SPAWN[plat]; y = GROUND; snap();
    vx = 0; vy = 0;
    grounded = true; jumping = false; savedAir = false;
    lastPlat = plat; facing = 1; lookV = 1;
    wnd.active = false; cv = null;
    jumpBuf = 0; jumpPressed = false; landT = 0;
    state = 'play'; stT = 0;
  }

  function startWindow() {
    wnd.active = true; wnd.t = 0; wnd.pressed = false;
    if (!reduced()) { tsc = SLOW; accum *= SLOW; }
    cv = { born: rt, ax: clamp(x + facing * 70, 135, 825), ay: CAP_Y, endAt: null, result: null, frac: 1 };
  }
  function closeCapsule(result) {
    if (cv && cv.endAt == null) { cv.endAt = rt; cv.result = result; }
  }

  function spawnDust(dx, dy) {
    if (reduced()) return;
    for (let i = -1; i <= 1; i++) {
      parts.push({ k: 'dust', x: dx + i * 13, y: dy - 2, vx: i * 42 + (Math.random() - 0.5) * 12, vy: -16 - Math.random() * 10, r0: 4 + Math.random(), r1: 10 + Math.random() * 3, age: 0, life: 0.34 });
    }
  }
  function spawnSparks(sx, sy) {
    if (reduced()) return;
    const cols = [GLOW, TXT, PURPLE];
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * (0.08 + 0.84 * i / 13) + (Math.random() - 0.5) * 0.3;
      const sp = 140 + Math.random() * 160;
      parts.push({ k: 'spark', x: sx, y: sy - 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, life: 0.38 + Math.random() * 0.16, col: cols[i % 3] });
    }
  }

  // -------------------------------------------------------- olay eylemleri
  function doJump(viaCoyote) {
    vy = JUMP_V; grounded = false; jumping = true; jumpBuf = 0;
    wnd.active = false;
    savedAir = viaCoyote;
    play('jump');
    if (viaCoyote) {
      saves++; updateStats(statSaves.val);
      spawnSparks(x, y);
      const ax = cv ? cv.ax : clamp(x + facing * 70, 135, 825);
      pops.push({ kind: 'save', x: ax, y: CAP_Y - 100, born: rt, life: 1.3 });
      closeCapsule('save');
      play('save');
      emit({ type: 'coyoteSave' });
    }
  }

  function doMiss() {
    wnd.pressed = true;
    const ax = cv ? cv.ax : clamp(x + facing * 70, 135, 825);
    pops.push({ kind: 'miss', x: ax, y: CAP_Y - 80, born: rt, life: 1.3 });
    play('fail');
    emit({ type: 'miss' });
  }

  function handleJumpPress() {
    if (grounded) { doJump(false); return; }
    if (wnd.active) {
      if (options.coyote) doJump(true);
      else if (!wnd.pressed) doMiss();
      return;
    }
    jumpBuf = 0.1;                       // yere inmeden hemen önceki basış
  }

  function land(idx) {
    const impact = vy;
    y = GROUND; vy = 0; grounded = true; jumping = false; savedAir = false;
    lastPlat = idx;
    if (wnd.active) { wnd.active = false; closeCapsule('regain'); }
    if (impact > 260) {
      landT = 0.25; landK = clamp(impact / 900, 0.45, 1);
      spawnDust(x, GROUND);
      play('land');
    }
    if (jumpBuf > 0 && state === 'play') doJump(false);
  }

  function pitImpact() {
    y = PIT_FLOOR; vy = 0; vx = 0; grounded = false;
    state = 'pit'; stT = 0;
    falls++; updateStats(statFalls.val);
    spawnDust(x, PIT_FLOOR);
    if (!reduced()) shake = 7;
    play('fail');
    emit({ type: 'fall' });
  }

  function reachGoal() {
    state = 'goal'; stT = 0;
    vx *= 0.3;                           // kısa, keskin duruş (kollar kadrajda kalsın)
    for (const p of pops) if (p.kill == null) p.kill = rt;   // eski etiketler hızla silinsin
    pops.push({ kind: 'goal', x: 735, y: 245, born: rt, life: 1.7 });
    if (!reduced()) {
      rings.push({ x, y: GROUND - 70, born: rt });
      rings.push({ x, y: GROUND - 70, born: rt + 0.1 });
    }
    play('win');
    emit({ type: 'goal', saves, falls });
  }

  function resetAll() {
    saves = 0; falls = 0; updateStats();
    pops.length = 0; parts.length = 0; rings.length = 0; chip = null;
    cv = null; wnd.active = false; shake = 0;
    const atStart = state === 'play' && grounded && lastPlat === 0 && Math.abs(x - SPAWN[0]) < 2 && !fade;
    if (atStart) {
      teleport(0); hasInput = false; runStarted = false; promptA = 0;
    } else {
      fade = { phase: 'out', t: 0, level: true, hard: true };   // sıçrama yok: solma ile
    }
    emit({ type: 'reset' });
    if (!raf) draw(0);
  }

  function updateFade(h) {
    fade.t += h;
    if (fade.phase === 'out') {
      if (fade.t >= FADE_OUT) {
        teleport(fade.level ? 0 : lastPlat);
        if (fade.hard) { hasInput = false; runStarted = false; promptA = 0; }
        else if (fade.level) runStarted = false;
        fade.phase = 'in'; fade.t = 0;
      }
    } else if (fade.t >= FADE_IN) {
      fade = null;
    }
  }

  // ------------------------------------------------------------- fizik
  function step(h) {
    px_ = x; py_ = y;
    stT += h;
    if (fade) updateFade(h);
    if (jumpBuf > 0) jumpBuf -= h;
    if (landT > 0) landT -= h;

    const locked = state !== 'play';
    const dirIn = locked ? 0 : (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
    if (dirIn) facing = dirIn;

    // zıplama basışı
    if (jumpPressed) {
      jumpPressed = false;
      if (!locked) handleJumpPress();
    }

    // yatay hareket
    let target = dirIn * RUN, acc = grounded ? ACC_G : ACC_A;
    if (dirIn && vx * dirIn < 0) acc *= 1.6;           // yön değiştirme daha keskin
    if (state === 'fall') target = vx;                  // girdi yok, momentum sürer
    vx = approach(vx, target, acc * h);
    x += vx * h;
    if (x < X_MIN) { x = X_MIN; vx = Math.max(vx, 0); } else if (x > X_MAX) { x = X_MAX; vx = Math.min(vx, 0); }

    // kenardan ayrılma
    if (grounded && platAt(x) < 0) {
      grounded = false; vy = 0;
      if (state === 'play') startWindow();
    }

    // dikey hareket
    if (!grounded && state !== 'pit') {
      if (jumping) {
        if (vy < 0 && !isHeld('jump')) { vy *= 0.5; jumping = false; }   // değişken zıplama yüksekliği
        else if (vy >= 0) jumping = false;
      }
      const prevY = y;
      vy += GRAV * h;
      y += vy * h;
      const idx = platAt(x);
      if (vy >= 0 && idx >= 0 && prevY <= GROUND + (wnd.active ? 12 : 0.01) && y >= GROUND) {
        land(idx);
      } else if (y > GROUND + 0.5) {
        for (const p of PLATS) {                        // çukur duvarları
          if (x + HW > p[0] && x - HW < p[1]) {
            x = x < (p[0] + p[1]) / 2 ? p[0] - HW : p[1] + HW;
            vx = 0;
          }
        }
        if (y >= PIT_FLOOR) pitImpact();
      }
    }

    // coyote penceresi
    if (wnd.active) {
      wnd.t += h;
      if (cv) cv.frac = Math.max(0, 1 - wnd.t / COYOTE_T);
      if (wnd.t >= COYOTE_T) {
        wnd.active = false;
        if (cv) cv.frac = 0;
        closeCapsule('expired');
      }
    }

    // geri dönüşsüz düşüş
    if (state === 'play' && !grounded && !wnd.active && vy > 0 && y > GROUND + 1) {
      state = 'fall'; stT = 0;
    }

    // yürüme fazı: gidilen yol × 0.045
    if (grounded && state === 'play') gaitPhase += Math.abs(vx) * h * 0.045;

    // hedef
    if (state === 'play' && grounded && lastPlat === 3 && x >= GOAL_X) reachGoal();

    // zamanlayıcılı durumlar
    if (!fade) {
      if (state === 'pit' && stT >= PIT_PAUSE) fade = { phase: 'out', t: 0 };
      else if (state === 'goal' && stT >= GOAL_HOLD) fade = { phase: 'out', t: 0, level: true };
    }
  }

  // ------------------------------------------------------------ çizim
  function buildBg() {
    bg = doc.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    if (!g) { bg = null; return; }
    const w = bg.width, h = bg.height;
    g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, w, h);
    let gr = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.55);
    gr.addColorStop(0, 'rgba(139,61,255,.10)'); gr.addColorStop(1, 'rgba(139,61,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    gr = g.createRadialGradient(w / 2, h / 2, h * 0.55, w / 2, h / 2, w * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }

  function resize() {
    if (destroyed) return;
    const cssW = stage.clientWidth || canvas.clientWidth;
    if (!cssW) return;
    const dpr = Math.min(win.devicePixelRatio || 1, 2.5);
    const pw = Math.max(2, Math.round(cssW * dpr));
    const ph = Math.round(pw * H / W);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
      buildBg();
    } else if (!bg) buildBg();
    scale = pw / W;
    if (!keysChecked && touchBar.isConnected) {
      keysChecked = true;
      for (const k of touchBar.children) {
        if (k.dataset.key === 'jump') continue;
        try {
          if (win.getComputedStyle(k).backgroundColor === 'rgba(0, 0, 0, 0)') {
            k.style.background = 'rgba(255,255,255,.08)'; k.style.fontSize = '22px';
          }
        } catch (e) { /* stil okunamadı */ }
      }
    }
    draw(clamp(accum / DT));
  }

  function drawWorld(g) {
    block(g, -10, PIT_FLOOR, W + 20, 60);                 // çukur tabanı
    for (const [a, b] of PLATS) {
      const x0 = a === 0 ? -10 : a, x1 = b === W ? W + 10 : b;
      block(g, x0, GROUND, x1 - x0, 140);
    }
  }

  function drawBeacon(g) {
    const done = state === 'goal';
    const fl = Math.sin(rt * (done ? 7 : 3.4));
    const pulse = 0.8 + 0.2 * Math.sin(rt * 2.4);
    const gx = POLE_X - 20, gy = 255;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, done ? 110 : 80);
    gr.addColorStop(0, `rgba(182,124,255,${(done ? 0.34 : 0.2) * pulse})`);
    gr.addColorStop(1, 'rgba(182,124,255,0)');
    g.fillStyle = gr; g.fillRect(gx - 120, gy - 120, 240, 240);
    // flama
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(POLE_X - 3, 238); g.lineTo(POLE_X - 3, 272);
    g.lineTo(POLE_X - 41 + fl * 2, 255 + fl * 3);
    g.closePath();
    g.fillStyle = PURPLE; g.fill(); g.stroke();
    // direk
    g.fillStyle = '#DCCBFF';
    g.fillRect(POLE_X - 3, 232, 6, GROUND - 232);
    g.strokeRect(POLE_X - 3, 232, 6, GROUND - 232);
    g.beginPath(); g.arc(POLE_X, 230, 6, 0, Math.PI * 2);
    g.fillStyle = GLOW; g.fill(); g.stroke();
  }

  function drawPrompt(g) {
    if (promptA < 0.02) return;
    const cx = SPAWN[0], cy = GROUND + 36;
    const s = 0.5 + 0.5 * Math.sin(rt * 5);
    g.save();
    g.globalAlpha = promptA;
    arrowGlyph(g, cx - 34, cy, -1, 0.4 + 0.5 * s);
    arrowGlyph(g, cx + 34, cy, 1, 0.4 + 0.5 * (1 - s));
    if (!focused && !coarse) {
      g.font = `700 12px ${F_MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = DIM;
      g.fillText('oynamak için tıkla', cx, cy + 34);
    }
    g.restore();
  }

  function drawMobu(g, a) {
    const ix = lerp(px_, x, a), iy = lerp(py_, y, a);
    setBoil(Math.floor(rt * 8));
    const m = mk(animT, ix, iy, MS);
    m.look = lookV;
    if (state === 'pit') {
      m.face = 'x';
      pancake(m, eOut(clamp(stT / 0.1)));
    } else if (state === 'goal') {
      m.face = 'proud'; m.armR = ARM_HIP;
    } else if (!grounded) {
      if (state === 'fall') {
        m.face = 'scared'; m.armR = ARM_HEAD; airPose(m, 0.5);
      } else if (wnd.active) {
        m.face = 'o'; m.armR = ARM_UPS; airPose(m, 0.5);
      } else {
        airPose(m, clamp((vy + 640) / 1280));
        m.face = savedAir ? 'happy' : 'calm';
        m.armR = lerpArm(ARM_UPS, ARM_DEF, clamp(vy / 700));
      }
    } else {
      const amp = clamp(Math.abs(vx) / RUN);
      if (amp > 0.08) walk(m, gaitPhase, vx >= 0 ? 1 : -1, 1, amp);
      if (landT > 0) squash(m, landK * Math.pow(landT / 0.25, 1.5));
    }
    // gölge: platform üstündeyken zeminde, çukur üstünde/düşerken yok, çukur tabanına inince tabanda
    if (state === 'pit') m.gy = PIT_FLOOR;
    else if (state === 'fall' || (!grounded && platAt(ix) < 0)) m.nosh = true;
    else m.gy = GROUND;
    stageMobu(g, m);

    if (state === 'pit') {                                  // dönen yıldızlar
      for (let i = 0; i < 3; i++) {
        const ang = (reduced() ? 0 : rt * 7) + i * Math.PI * 2 / 3;
        starPath(g, ix + Math.cos(ang) * 34, PIT_FLOOR - 52 + Math.sin(ang) * 8, 7.5, reduced() ? 0 : rt * 5 + i);
        g.fillStyle = GOLD; g.fill();
        g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
      }
    }
  }

  function drawParts(g, sparks) {
    for (const p of parts) {
      const u = p.age / p.life;
      if (sparks && p.k === 'spark') {
        g.globalAlpha = 1 - u;
        g.strokeStyle = p.col; g.lineWidth = 4.5 * (1 - u * 0.5); g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); g.stroke();
        g.globalAlpha = 1;
      } else if (!sparks && p.k === 'dust') {
        g.fillStyle = `rgba(233,221,255,${(1 - u) * 0.55})`;
        g.beginPath(); g.arc(p.x, p.y, lerp(p.r0, p.r1, eOut(u)), 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawRings(g) {
    for (const r of rings) {
      const age = rt - r.born;
      if (age < 0 || age > 0.6) continue;
      const u = age / 0.6;
      g.globalAlpha = (1 - u) * 0.9;
      g.strokeStyle = GLOW; g.lineWidth = lerp(10, 1.5, u);
      g.beginPath(); g.arc(r.x, r.y, lerp(24, 150, eOut(u)), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
  }

  function drawCapsule(g) {
    if (!cv) return;
    const age = rt - cv.born;
    let sc = Math.max(0.001, eBack(clamp(age / 0.2)));
    let al = 1;
    if (cv.endAt != null) {
      const e = rt - cv.endAt;
      if (cv.result === 'save' || cv.result === 'regain') {
        const k = clamp(e / 0.12);
        sc *= 1 - 0.4 * k; al = 1 - k;
      } else {
        al = 1 - S3((e - 0.55) / 0.3);
      }
      if (al <= 0.01) return;
    }
    const on = options.coyote;
    const frac = wnd.active && cv.endAt == null ? clamp(1 - (wnd.t + accum) / COYOTE_T) : cv.frac;
    const { ax, ay } = cv;
    g.save();
    g.globalAlpha = al;
    g.translate(ax, ay); g.scale(sc, sc); g.translate(-ax, -ay);
    pillPath(g, ax, ay, 176, 48);
    g.fillStyle = 'rgba(27,20,38,.94)'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = on ? PURPLE : '#555'; g.stroke();
    g.font = `700 15px ${F_MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = on ? TXT : DIM;
    g.fillText('COYOTE 100 ms', ax, ay - 8);
    if (!on) {
      const tw = g.measureText('COYOTE 100 ms').width;
      g.strokeStyle = '#EF4A5C'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax - tw / 2 - 3, ay - 8); g.lineTo(ax + tw / 2 + 3, ay - 8); g.stroke();
    }
    pillPath(g, ax, ay + 10, 136, 6);
    g.fillStyle = on ? 'rgba(139,61,255,.28)' : '#333'; g.fill();
    if (frac > 0.01) {
      const fw = 136 * frac;
      pillPath(g, ax - 68 + fw / 2, ay + 10, Math.max(6, fw), 6);
      g.fillStyle = on ? GLOW : '#6A6A6A'; g.fill();
    }
    g.restore();
  }

  function drawPops(g) {
    for (const p of pops) {
      const age = rt - p.born;
      const kf = p.kill != null ? 1 - clamp((rt - p.kill) / 0.2) : 1;   // hedef görününce eski etiketler söner
      if (age < 0 || kf <= 0.01) continue;
      g.save();
      g.globalAlpha = kf;
      if (p.kind === 'save') {
        const k = Math.max(0.001, eBack(clamp(age / 0.28)));
        g.globalAlpha *= 1 - S3((age - 0.85) / 0.35);
        g.translate(p.x, p.y - age * 10); g.scale(k, k);
        inkText(g, 'KURTARDI!', 0, 0, 40, GLOW, PURPLE);
      } else if (p.kind === 'goal') {
        const k = Math.max(0.001, eBack(clamp(age / 0.3)));
        g.globalAlpha *= 1 - S3((age - 1.25) / 0.4);
        g.translate(p.x, p.y); g.scale(k, k);
        inkText(g, 'TAMAM!', 0, 0, 54, GLOW, PURPLE);
      } else if (p.kind === 'miss') {
        const k = lerp(1.8, 1, eOut(clamp(age / 0.16)));
        g.globalAlpha *= clamp(age / 0.06) * (1 - S3((age - 0.9) / 0.3));
        g.translate(p.x, p.y); g.rotate(-0.09); g.scale(k, k);
        g.font = `900 34px ${F_DISP}`;
        const tw = g.measureText('✗ GEÇ!').width, bw = tw + 34, bh = 54;
        g.fillStyle = 'rgba(239,74,92,.16)'; g.fillRect(-bw / 2, -bh / 2, bw, bh);
        g.strokeStyle = RED; g.lineWidth = 4; g.lineJoin = 'miter'; g.strokeRect(-bw / 2, -bh / 2, bw, bh);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = RED; g.fillText('✗ GEÇ!', 0, 2);
      }
      g.restore();
    }
  }

  function drawChip(g) {
    if (!chip) return;
    const age = rt - chip.born;
    if (age > 1.8) return;
    const sc = Math.max(0.001, eBack(clamp(age / 0.22)));
    const al = 1 - S3((age - 1.4) / 0.4);
    g.save();
    g.globalAlpha = al;
    g.translate(W / 2, 34); g.scale(sc, sc);
    g.font = `700 16px ${F_MONO}`;
    const w = g.measureText(chip.text).width + 44;
    pillPath(g, 0, 0, w, 34);
    g.fillStyle = 'rgba(27,20,38,.95)'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = chip.on ? PURPLE : '#555'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = chip.on ? GLOW : TXT;
    g.fillText(chip.text, 0, 1);
    g.restore();
  }

  function draw(a = 0) {
    if (destroyed || !ctx) return;
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) g.drawImage(bg, 0, 0);
    else { g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.setTransform(scale, 0, 0, scale, 0, 0);

    g.save();
    if (shake > 0.2 && !reduced()) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawWorld(g);
    drawPrompt(g);
    drawBeacon(g);
    drawParts(g, false);
    drawMobu(g, a);
    drawParts(g, true);
    drawRings(g);
    g.restore();

    drawCapsule(g);
    drawPops(g);
    drawChip(g);

    if (fade) {
      const fa = fade.phase === 'out' ? S3(fade.t / FADE_OUT) : 1 - S3(fade.t / FADE_IN);
      if (fa > 0.005) { g.fillStyle = `rgba(10,10,10,${fa})`; g.fillRect(-10, -10, W + 20, H + 20); }
    }
  }

  // ------------------------------------------------------------ döngü
  function updateFx(rdt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += rdt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      if (p.k === 'spark') { p.vy += 520 * rdt; p.vx *= 1 - 2.2 * rdt; }
      p.x += p.vx * rdt; p.y += p.vy * rdt;
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      if (rt - p.born > p.life || (p.kill != null && rt - p.kill > 0.25)) pops.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) if (rt - rings[i].born > 0.7) rings.splice(i, 1);
    if (cv && cv.endAt != null && rt - cv.endAt > 1.2) cv = null;
    shake *= Math.exp(-rdt * 9);
    promptA = hasInput ? Math.max(0, promptA - rdt * 4) : Math.min(1, promptA + rdt * 4);
    lookV += (facing - lookV) * Math.min(1, rdt * 16);
  }

  function frame(ts) {
    raf = 0;
    if (destroyed || !visible || doc.hidden) { last = 0; return; }
    if (!last) last = ts;
    const rdt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    last = ts;
    rt += rdt;

    // yavaş çekim: pencere boyunca 0.35×, sonra yumuşakça 1×
    const tgt = wnd.active && !reduced() ? SLOW : 1;
    if (tgt < tsc) tsc = tgt;
    else { tsc += (tgt - tsc) * Math.min(1, rdt * 14); if (tsc > 0.995) tsc = 1; }

    accum += rdt * tsc;
    let n = 0;
    while (accum >= DT && n < 60) { step(DT); animT += DT; accum -= DT; n++; }
    if (n >= 60) accum = 0;

    updateFx(rdt);
    draw(clamp(accum / DT));
    if (!destroyed) raf = win.requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !destroyed && visible && !doc.hidden) {
      last = 0;
      raf = win.requestAnimationFrame(frame);
    }
  }
  function halt() { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } last = 0; }

  // ---------------------------------------------------- panel etkileşimi
  on(sw, 'click', e => {
    setCoyote(!options.coyote, true);
    if (e.detail) { try { canvas.focus({ preventScroll: true }); } catch (err) { /* odak yok */ } }
  });
  on(btnReset, 'click', e => {
    resetAll();
    if (e.detail) { try { canvas.focus({ preventScroll: true }); } catch (err) { /* odak yok */ } }
  });

  // ------------------------------------------------ görünürlük / boyut
  let ro = null, io = null;
  if (typeof win.ResizeObserver === 'function') {
    ro = new win.ResizeObserver(() => resize());
    ro.observe(stage);
  }
  if (typeof win.IntersectionObserver === 'function') {
    io = new win.IntersectionObserver(entries => {
      const en = entries[entries.length - 1];
      visible = !!en && en.isIntersecting;
      if (visible) kick(); else halt();
    }, { threshold: 0.01 });
    io.observe(stage);
  }
  on(doc, 'visibilitychange', () => { if (doc.hidden) halt(); else kick(); });

  // ------------------------------------------------------------ başlat
  updateStats();
  resize();
  if (!bg) buildBg();
  draw(0);
  kick();

  // ------------------------------------------------------------ dışa açık
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    halt();
    for (const f of offs) { try { f(); } catch (e) { /* zaten kaldırılmış */ } }
    offs.length = 0;
    for (const id of timers) win.clearTimeout(id);
    timers.clear();
    try { ro?.disconnect(); io?.disconnect(); } catch (e) { /* yok */ }
    clearInputs();
    pops.length = 0; parts.length = 0; rings.length = 0;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  return {
    destroy,
    reset: () => { if (!destroyed) resetAll(); },
    setOption(key, value) { if (!destroyed && key === 'coyote') setCoyote(!!value, false); },
    getOptions: () => ({ coyote: options.coyote }),
  };
}
