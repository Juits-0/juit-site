// MOBU — sitede yaşayan karakter. Tüm pencereyi kaplayan, tıklama geçirgen bir canvas'ta çizilir.
// Davranışlar coroutine (async) olarak yazılır; rota değişince iptal edilir. Tepkiler (bus 'mobu:react')
// davranışın üstüne kısa süreli biner. Mobu, [data-occluder] elemanlarının "arkasında" görünür
// (o dikdörtgenler çizimden kırpılır): kartların arkasından bakar, ekranların üstüne oturur.
import { mk, stageMobu, walk, airPose, squash, pancake, setBoil, facePos, lerpArm, clamp, lerp, eBack, eIO, eOut,
  ARM_DEF, ARM_UPS, ARM_HIP, ARM_HEAD, ARM_CATCH, ARM_SHRUG, ARM_WAVE, ARM_POINT, ARM_CHIN, ARM_SCARED, PURPLE, GLOW, INK } from './mobu-draw.js';
import { $, bus, isCoarse, prefersReducedMotion, rand, pick } from '../utils.js';
import { modalFrame, modalKind } from '../ui/modal.js';
import { parseHash } from '../router.js';

export function initMobu(app) {
  const cv = $('#mobu-layer'), hit = $('#mobu-hit');
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  const RM = prefersReducedMotion();
  let W = innerWidth, H = innerHeight, dpr = 1;
  const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) };
  resize(); addEventListener('resize', resize);

  // ---- durum ----
  const S = {
    s: isCoarse() ? .22 : .3, ox: 0, oy: 0,                     // ölçek, çapaya göre ofset
    anchor: () => ({ x: 120, y: H - 10 }),                       // çapa (her karede hesaplanır)
    face: 'calm', look: 0, lookY: 0, armL: null, armR: null, rot: 0, legL: null, legR: null,
    walking: false, walkPhase: 0, dir: 1, air: 0, sq: 0, pancake: 0, alpha: 1, hidden: false, visible: true,
    sweat: 0, sleep: false, react: null, lookAt: null, lookFollow: true, clipSel: [], onFloor: true, flat: 0,
  };
  const abs = () => { const a = S.anchor(); return { x: a.x + S.ox, y: a.y + S.oy } };
  const setAnchor = fn => { const p = abs(); S.anchor = fn; const a = fn(); S.ox = p.x - a.x; S.oy = p.y - a.y };
  const rectOf = sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? r : null };
  const floorY = () => H - (isCoarse() ? 14 : 10);

  // ---- girdi ----
  let px = W / 2, py = H / 2, lastInput = performance.now();
  const poke = () => { lastInput = performance.now(); if (S.sleep) wake() };
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; poke() }, { passive: true });
  addEventListener('pointerdown', poke, { passive: true }); addEventListener('keydown', poke); addEventListener('scroll', poke, { passive: true });

  // ---- coroutine altyapısı ----
  let token = { c: false }; const waiters = [];
  const nextF = tk => new Promise((res, rej) => waiters.push({ res, rej, tk }));
  class Cancel extends Error { }
  async function wait(tk, sec) { let a = 0; while (a < sec) a += await nextF(tk) }
  async function tween(tk, props, dur, ease = eIO) {
    const from = {}; for (const k in props) from[k] = S[k]; let a = 0;
    while (a < dur) { a += await nextF(tk); const u = ease(clamp(a / dur)); for (const k in props) S[k] = lerp(from[k], props[k], u) }
    for (const k in props) S[k] = props[k];
  }
  async function walkTo(tk, tx, speed = 230) {
    S.walking = true; const sign = Math.sign(tx - S.ox) || 1; S.dir = sign; S.look = sign * .8;
    while (Math.abs(tx - S.ox) > 1.5) { const dt = await nextF(tk); const st = Math.min(speed * dt, Math.abs(tx - S.ox)); S.ox += sign * st; S.walkPhase += st * .05 }
    S.walking = false; S.ox = tx;
  }
  async function hop(tk, dx, dy, dur = .45, h = 70) {
    const x0 = S.ox, y0 = S.oy; let a = 0; S.air = 1;
    while (a < dur) { a += await nextF(tk); const u = clamp(a / dur); S.ox = lerp(x0, x0 + dx, u); S.oy = lerp(y0, y0 + dy, u) - h * S.s * 4 * u * (1 - u) * 3.3; S.airU = u }
    S.air = 0; S.ox = x0 + dx; S.oy = y0 + dy; land();
  }
  function land() { S.sq = 1; app.sfx?.play('land', { gain: .35 }); fx.push({ kind: 'dust', x: abs().x, y: abs().y, t: 0 }) }
  function run(fn) { token.c = true; const tk = token = { c: false }; (async () => { try { await fn(tk) } catch (e) { if (!(e instanceof Cancel)) console.warn('[mobu]', e) } })(); return tk }
  const cancelled = tk => tk.c;

  // ---- tepkiler (davranışın üstüne biner) ----
  const REACT = {
    surprise: { face: 'O', armR: ARM_UPS, dur: .9, hop: true },
    proud: { face: 'proud', armR: ARM_HIP, dur: 1.4 },
    sad: { face: 'T', armR: ARM_DEF, dur: 1.4 },
    scared: { face: 'scared', armR: ARM_HEAD, dur: 1.1 },
    star: { face: 'star', armR: ARM_UPS, dur: 1.6, hop: true },
    sus: { face: 'sus', armR: ARM_CHIN, dur: 1.5 },
    wave: { face: 'happy', armR: 'wave', dur: 1.5 },
    angry: { face: 'angry', armR: ARM_PUNCH_SAFE(), dur: 1.2, sweat: 1 },
    alert: { face: 'o', armR: ARM_DEF, dur: .9 },
    happy: { face: 'happy', dur: 1.2 },
    shrug: { face: 'flat', armR: ARM_SHRUG, dur: 1.3 },
    ko: { face: 'x', dur: 1.6, pancake: 1 },
  };
  function ARM_PUNCH_SAFE() { return { e: [112, -175], h: [158, -172] } }
  function react(type, opts = {}) {
    const r = REACT[type]; if (!r) return;
    S.react = { ...r, ...opts, until: now + (opts.dur ?? r.dur) };
    if (r.hop && !S.air && !RM) { S.hopT = now }
    if (r.pancake) S.pancakeT = now;
  }
  bus.on('mobu:react', d => { if (typeof d === 'string') react(d); else react(d.type, d) });

  // ---- efektler ----
  const fx = [];
  function drawFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      if (f.kind === 'dust') { if (f.t > .6) { fx.splice(i, 1); continue } const k = f.t / .6; ctx.save(); ctx.globalAlpha = (1 - k) * .5; ctx.fillStyle = '#B67CFF'; for (const d of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(f.x + d * (14 + 26 * k) * S.s * 3, f.y - 4 - 18 * k * S.s * 3, (6 + 10 * k) * S.s * 3, 0, 7); ctx.fill() } ctx.restore() }
      else if (f.kind === 'z') { if (f.t > 2.2) { fx.splice(i, 1); continue } const k = f.t / 2.2; ctx.save(); ctx.globalAlpha = (1 - k) * .8; ctx.fillStyle = '#B67CFF'; ctx.font = `900 ${Math.round((10 + 8 * k) * S.s * 3.2)}px InterDisplay, Inter, sans-serif`; ctx.fillText('z', f.x + 18 * S.s * 3 + Math.sin(f.t * 3) * 6, f.y - 40 * k * S.s * 3); ctx.restore() }
      else if (f.kind === 'stars') { if (f.t > 1.6) { fx.splice(i, 1); continue } ctx.save(); ctx.translate(f.x, f.y); for (let j = 0; j < 3; j++) { const a = f.t * 4 + j * 2.09; ctx.save(); ctx.translate(Math.cos(a) * 22 * S.s * 3, Math.sin(a) * 8 * S.s * 3 - 10); ctx.rotate(f.t * 3); ctx.fillStyle = '#F5C542'; star(ctx, 7 * S.s * 3); ctx.restore() } ctx.restore() }
      else if (f.kind === 'gem') { drawGem(f, dt); if (f.done) fx.splice(i, 1) }
      else if (f.kind === 'ring') { if (f.t > .6) { fx.splice(i, 1); continue } const k = f.t / .6; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = GLOW; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, (10 + 50 * k) * S.s * 3, 0, 7); ctx.stroke(); ctx.restore() }
    }
  }
  function star(g, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * .45 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) } g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke() }
  function drawGem(f, dt) {
    // basit fizik: parabol + zıplama, hedef Mobu'nun ayağı; yakalanınca elinde durur ve söner
    if (f.state === 'fly') { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; const gy = f.floor(); if (f.y >= gy) { f.y = gy; f.vy = -f.vy * .45; f.vx *= .7; f.bounces++; app.sfx?.play('coin', { gain: .3 }); if (f.bounces >= 3 || Math.abs(f.vy) < 60) { f.state = 'rest'; f.restT = 0 } } }
    else if (f.state === 'rest') { f.restT += dt; const gy = f.floor(); f.y = gy; if (f.restT > .9) f.state = 'held' }
    else if (f.state === 'held') { const h = handWorld(1); f.x = lerp(f.x, h[0], .25); f.y = lerp(f.y, h[1] - 10, .25); f.heldT = (f.heldT || 0) + dt; if (f.heldT > 2.4) { f.state = 'fade'; f.fadeT = 0 } }
    else if (f.state === 'fade') { f.fadeT += dt; if (f.fadeT > .5) { f.done = true; return } }
    const r = 9 * S.s * 3; ctx.save(); ctx.globalAlpha = f.state === 'fade' ? 1 - f.fadeT / .5 : 1; ctx.translate(f.x, f.y - r); ctx.rotate(f.state === 'fly' ? f.t * 6 : Math.sin(f.t * 2) * .1);
    ctx.shadowColor = GLOW; ctx.shadowBlur = 14; ctx.fillStyle = PURPLE; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .8, -r * .25); ctx.lineTo(0, r); ctx.lineTo(-r * .8, -r * .25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-r * .3, -r * .55); ctx.lineTo(r * .1, -r * .6); ctx.lineTo(-r * .15, -r * .2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function handWorld(side) { const m = lastM; if (!m) return [abs().x, abs().y]; const a = side > 0 ? (m.armR || ARM_DEF) : (m.armL || ARM_DEF); const s = m.s; return [m.x + side * a.h[0] * s * (m.sx || 1) * (1 + ((m.bw || 1) - 1) * .85), m.y + (a.h[1] + 6) * s * (m.sy || 1)] }

  // ---- sahneler ----
  const SCENES = {
    // Hub: TV'nin üstüne iner, arkasından bakar, saklanır, yeniden belirir
    async hub(tk) {
      const tv = () => rectOf('#hub-tv');
      if (!tv()) { setAnchor(() => ({ x: Math.min(W * .14, 140), y: floorY() })); S.clipSel = []; return idleCorner(tk) }
      S.clipSel = ['#hub-tv']; const topY = () => { const r = tv(); return r ? r.top + 6 : floorY() };
      setAnchor(() => { const r = tv(); return r ? { x: r.left + r.width * .5, y: r.top + 6 } : { x: 120, y: floorY() } });
      if (S.fresh) { S.ox = 0; S.oy = -H * .9; S.fresh = false; S.air = 1; S.face = 'calm'; await tween(tk, { oy: 0 }, .55, x => x * x); S.air = 0; land(); S.look = 0; await wait(tk, .3) }
      else if (Math.abs(S.oy) > 4 || Math.abs(S.ox) > 4) { S.hidden = false; await tween(tk, { ox: 0, oy: 0 }, .5) }
      let mode = 0;
      for (; ;) {
        if (cancelled(tk)) throw new Cancel();
        S.lookFollow = true; S.face = 'calm'; S.armR = null; S.legL = S.legR = null; S.rot = 0;
        if (RM) { await wait(tk, 5); continue }
        await wait(tk, rand(3, 6));
        if (S.near === 'arcade') { S.face = 'sus'; S.lookFollow = false; S.look = 1; S.armR = ARM_CHIN; await wait(tk, 2.2); continue }
        mode = (mode + 1) % 3;
        if (mode === 1) { // TV'nin arkasına in → üst kenardan gözleriyle bak
          S.face = 'calm'; S.lookFollow = false; S.look = 0; await tween(tk, { oy: 330 * S.s }, .35, eIO); S.hidden = false; await wait(tk, rand(.8, 1.6));
          S.face = 'sus'; await tween(tk, { oy: 300 * S.s }, .6, eOut); S.lookFollow = true;
          const t0 = now; let ducked = false;
          while (now - t0 < rand(3, 5)) { await nextF(tk); const f = faceWorld(); if (Math.hypot(px - f[0], py - f[1]) < 120 * (S.s / .3)) { ducked = true; break } }
          if (ducked) { S.face = 'O'; app.sfx?.play('pop', { gain: .4 }); await tween(tk, { oy: 340 * S.s }, .16, eOut); await wait(tk, 1.4) }
          S.face = 'calm'; await tween(tk, { oy: 0 }, .5, eOut); S.sq = .6;
        } else if (mode === 2) { // sağ kenardan yan bakış
          S.lookFollow = false; await tween(tk, { oy: 330 * S.s }, .3, eIO); await wait(tk, 1);
          const r = tv(); if (r) { S.ox = r.width * .5 + 10 * S.s; S.oy = r.height * .55; S.rot = -.18; S.face = 'sus'; S.look = -1; await tween(tk, { ox: r.width * .5 + 70 * S.s }, .5, eOut); await wait(tk, rand(2, 3.5)); await tween(tk, { ox: r.width * .5 - 40 * S.s }, .35, eIO); S.rot = 0 }
          S.oy = 330 * S.s; S.ox = 0; await wait(tk, .8); S.face = 'calm'; await tween(tk, { oy: 0 }, .5, eOut); S.sq = .6;
        } else { // üstte: cursor'a bak, bazen el salla
          if (S.near === 'mobu') { S.face = 'happy'; S.armR = 'wave'; await wait(tk, 1.6); S.armR = null }
          else { S.face = pick(['calm', 'calm', 'proud', 'flat']); await wait(tk, 2) }
        }
      }
    },
    async mobu(tk) { setAnchor(() => ({ x: Math.min(W * .1, 120), y: floorY() })); S.clipSel = []; await enterFromSide(tk); return idleCorner(tk, 'video') },
    async arcade(tk) { setAnchor(() => ({ x: W - Math.min(W * .1, 120), y: floorY() })); S.clipSel = []; await enterFromSide(tk); return idleCorner(tk, 'arcade') },
    async lab(tk) { setAnchor(() => ({ x: Math.min(W * .1, 120), y: floorY() })); S.clipSel = []; await enterFromSide(tk); return idleCorner(tk, 'lab') },
    async about(tk) {
      const mon = () => rectOf('[data-object="monitor"]');
      let tries = 0; while (!mon() && tries++ < 40) await wait(tk, .1);
      if (!mon()) { setAnchor(() => ({ x: Math.min(W * .1, 120), y: floorY() })); return idleCorner(tk) }
      S.clipSel = ['[data-object="monitor"]'];
      setAnchor(() => { const r = mon(); return r ? { x: r.left + r.width * .5, y: r.top + r.height * .07 } : { x: 120, y: floorY() } });
      S.ox = 0; S.oy = -H * .6; S.air = 1; await tween(tk, { oy: 0 }, .5, x => x * x); S.air = 0; land(); S.face = 'happy'; await wait(tk, 1); S.face = 'calm';
      for (; ;) { await wait(tk, rand(4, 7)); if (RM) continue; S.face = pick(['calm', 'proud', 'happy']); S.armR = pick([null, null, ARM_CHIN]); await wait(tk, 2); S.armR = null }
    },
    async cekmece(tk) { setAnchor(() => ({ x: Math.min(W * .1, 120), y: floorY() })); S.clipSel = []; await enterFromSide(tk); S.face = 'sus'; S.armR = ARM_CHIN; await wait(tk, 1.6); S.face = 'happy'; S.armR = 'wave'; await wait(tk, 1.5); S.armR = null; return idleCorner(tk) },
  };
  async function enterFromSide(tk) {
    const a = S.anchor(); const fromLeft = a.x < W / 2;
    const p = abs(); const offX = fromLeft ? -200 : W + 200;
    if (Math.abs(p.y - a.y) > 40 || p.x < -150 || p.x > W + 150) { S.ox = offX - a.x; S.oy = 0 }
    S.hidden = false; S.face = 'calm'; S.rot = 0; S.armR = null;
    await walkTo(tk, 0, 260);
  }
  async function idleCorner(tk, kind = '') {
    for (; ;) {
      if (cancelled(tk)) throw new Cancel();
      S.lookFollow = true; S.face = 'calm'; S.armR = null; S.legL = S.legR = null;
      if (RM) { await wait(tk, 6); continue }
      await wait(tk, rand(5, 9));
      const r = Math.random();
      if (r < .3) { S.face = 'sus'; S.armR = ARM_CHIN; await wait(tk, 1.6) }
      else if (r < .5) { S.lookFollow = false; S.look = -1; await wait(tk, .6); S.look = 1; await wait(tk, .6); S.look = 0 }
      else if (r < .65) { S.face = 'happy'; await hop(tk, 0, 0, .4, 50) }
      else if (r < .8 && kind === 'arcade') { S.face = 'o'; S.lookFollow = false; S.look = -1; S.armR = ARM_POINT; await wait(tk, 1.4) }
      else { S.face = 'closed'; S.armR = ARM_SHRUG; await wait(tk, .8); S.face = 'calm' }
    }
  }
  // Modal: video → çerçevenin üstüne oturur; oyun/deney → sol altta izler
  async function sceneModal(tk, kind) {
    const fr = () => modalFrame()?.getBoundingClientRect();
    if (!fr()) return;
    S.clipSel = ['.modal__frame'];
    const r0 = fr(); const canSit = r0 && r0.top > 150 * (S.s / .3);   // üstte yer yoksa yanında durur
    if (kind === 'video' && canSit) {
      setAnchor(() => { const r = fr(); return r ? { x: r.left + 56 * (S.s / .3), y: r.top + 46 * S.s } : { x: 120, y: floorY() } });
      S.ox = 0; S.oy = -220; S.air = 1; S.face = 'happy'; await tween(tk, { oy: 0 }, .45, x => x * x); S.air = 0; S.sq = .7; S.legL = [-10, 10]; S.legR = [12, 12];
      for (; ;) { await wait(tk, rand(3, 6)); if (RM) continue; S.face = pick(['happy', 'star', 'o', 'calm']); S.lookFollow = false; S.look = 0; S.lookY = 1; await wait(tk, 2); S.lookFollow = true; S.lookY = 0 }
    } else {
      setAnchor(() => { const r = fr(); const left = r ? r.left : 0; return { x: left > 150 ? left - 60 * (S.s / .3) : Math.min(W * .1, 90), y: r && left > 150 ? Math.min(floorY(), r.bottom) : floorY() } });
      await tween(tk, { ox: 0, oy: 0 }, .5); S.face = 'o'; S.lookFollow = false; S.look = 1; S.lookY = -.3;
      for (; ;) { await wait(tk, rand(4, 8)); if (RM) continue; S.armR = ARM_POINT; await wait(tk, 1.2); S.armR = null }
    }
  }
  // Deney etkinken: sahnenin sağ üst köşesine oturur, kenardan izler
  async function sceneLab(tk, el) {
    S.clipSel = [el];
    setAnchor(() => { const r = rectOf(el); return r ? { x: r.right - 70 * (S.s / .3), y: r.top + 44 * S.s } : { x: 120, y: floorY() } });
    const p = abs(); const a = S.anchor(); if (Math.abs(p.y - a.y) > 60) { S.ox = 0; S.oy = -200; S.air = 1; await tween(tk, { oy: 0 }, .4, x => x * x); S.air = 0; S.sq = .7 } else await tween(tk, { ox: 0, oy: 0 }, .4);
    S.legL = [-10, 10]; S.legR = [12, 12]; S.face = 'o'; S.lookFollow = false; S.look = -.6; S.lookY = 1;
    for (; ;) { await wait(tk, rand(4, 7)); if (RM) continue; S.face = pick(['o', 'calm', 'happy']); await wait(tk, 2) }
  }
  async function runAway(tk) {
    S.face = 'angry'; S.lookFollow = false; await wait(tk, .5); S.face = 'flat'; S.clipSel = [];
    const a = abs(); setAnchor(() => ({ x: a.x, y: floorY() })); S.ox = 0; S.oy = 0;
    await walkTo(tk, W + 160 - a.x, 420); await wait(tk, 2.2);
    S.ox = -200 - a.x; S.face = 'calm'; await walkTo(tk, 0, 260); S.face = 'sus'; await wait(tk, 1.5);
    scene(); // sahneye dön
  }

  // ---- sahne seçimi ----
  let labEl = null, currentScene = '';
  function scene() {
    const kind = modalKind();
    if (kind && modalFrame()) { currentScene = 'modal:' + kind; run(tk => sceneModal(tk, kind)); return }
    if (labEl && document.contains(labEl)) { currentScene = 'lab'; run(tk => sceneLab(tk, labEl)); return }
    const path = parseHash().path || 'hub'; currentScene = path;
    run(SCENES[path] || SCENES.mobu);
  }
  bus.on('route', () => { labEl = null; S.sleep = false; scene() });
  bus.on('modal:open', () => scene()); bus.on('modal:close', () => scene());
  bus.on('lab:active', ({ el }) => { if (labEl !== el) { labEl = el; scene() } });
  bus.on('lab:inactive', () => { if (labEl) { labEl = null; scene() } });
  bus.on('hub:near', n => { S.near = n });
  const tryGem = (n = 0) => { if (RM || S.gemDone || currentScene !== 'hub') return; if (S.oy !== 0 || S.ox !== 0) { if (n < 6) setTimeout(() => tryGem(n + 1), 2500); return } S.gemDone = true; gemSurprise() };
  bus.on('hub:idle', () => tryGem());
  bus.on('lab:event', ({ type }) => {
    if (type === 'coyoteSave' || type === 'dodge') react('proud', { dur: 1.1 });
    else if (type === 'fall' || type === 'hit' || type === 'spotted') { react('scared', { dur: .8 }); setTimeout(() => react('sad', { dur: 1 }), 820) }
    else if (type === 'goal' || type === 'win') react('star');
    else if (type === 'miss') react('sus', { dur: 1 });
    else if (type === 'ko') react('ko');
    else if (type === 'toggle') react('alert', { dur: .6 });
  });
  bus.on('arcade:hover', ({ el }) => { if (!el) { S.lookAt = null; return } const r = el.getBoundingClientRect(); S.lookAt = [r.left + r.width / 2, r.top + r.height / 2]; react('alert', { dur: .7 }) });
  bus.on('video:hover', ({ el }) => { if (!el) { S.lookAt = null; return } const r = el.getBoundingClientRect(); S.lookAt = [r.left + r.width / 2, r.top + r.height / 2] });
  bus.on('about:select', ({ el }) => { if (!el) return; const r = el.getBoundingClientRect(); S.lookAt = [r.left + r.width / 2, r.top + r.height / 2]; react('alert', { dur: .8 }); setTimeout(() => { S.lookAt = null }, 2500) });

  function gemSurprise() {
    const cab = document.querySelector('.cab--1') || document.querySelector('#world-arcade'); if (!cab) return;
    const r = cab.getBoundingClientRect(); const a = abs();
    const dx = (a.x + 40 * S.s * 3) - (r.left + r.width / 2); const T = 1.1;
    fx.push({ kind: 'gem', state: 'fly', x: r.left + r.width / 2, y: r.top + r.height * .3, vx: dx / T, vy: -(a.y - r.top - r.height * .3) / T - 750 * T / 2, bounces: 0, t: 0, floor: () => abs().y });
    app.sfx?.play('whoosh', { gain: .4 });
    S.lookAt = null; S.lookFollow = false; S.look = 1;
    setTimeout(() => { react('alert', { dur: 1.2 }) }, 600);
    setTimeout(() => { react('star', { dur: 2.6, hop: false }); S.react.armR = ARM_CATCH }, 2200);
    setTimeout(() => { S.lookFollow = true }, 5200);
  }

  // ---- tıklama ----
  let clicks = []; hit.hidden = false;
  hit.addEventListener('click', () => {
    const t = performance.now(); clicks = clicks.filter(c => t - c < 2200); clicks.push(t); poke();
    app.sfx?.play('pop');
    if (clicks.length >= 5) { clicks = []; run(runAway) }
    else if (clicks.length >= 3) react('angry', { dur: 1.2 });
    else react('surprise');
  });

  // ---- uyku ----
  function wake() { S.sleep = false; fx.length = 0; react('surprise', { dur: .7 }) }

  // ---- kare ----
  let now = performance.now() / 1000, last = now, lastM = null, running = true, hiddenDoc = false;
  document.addEventListener('visibilitychange', () => { hiddenDoc = document.hidden; last = performance.now() / 1000; if (!hiddenDoc) requestAnimationFrame(frame) });
  function faceWorld() { const m = lastM; return m ? facePos(m) : [abs().x, abs().y - 100] }
  function frame() {
    if (!running || hiddenDoc) return;
    now = performance.now() / 1000; const dt = Math.min(.1, now - last); last = now;
    // coroutine'leri ilerlet
    const ws = waiters.splice(0); for (const w of ws) { if (w.tk.c) w.rej(new Cancel()); else w.res(dt) }
    // uyku
    if (!S.sleep && !RM && now * 1000 - lastInput > 42000 && !modalKind()) { S.sleep = true; S.zT = 0 }
    if (S.sleep) { S.zT += dt; if (S.zT > 1.4) { S.zT = 0; const f = faceWorld(); fx.push({ kind: 'z', x: f[0], y: f[1], t: 0 }) } }
    // tepki süresi
    if (S.react && now > S.react.until) S.react = null;
    S.sq = Math.max(0, S.sq - dt * 4.2);
    draw(dt);
    requestAnimationFrame(frame);
  }
  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    const p = abs(); setBoil(Math.floor(now * 8));
    const m = mk(now, p.x, p.y, S.s); m.gy = S.anchor().y + (S.oy > 4 ? S.oy : 0);
    // bakış
    let look = S.look, lookY = S.lookY;
    const target = S.lookAt || (S.lookFollow ? [px, py] : null);
    if (target) { const f = facePos(m); look = clamp((target[0] - f[0]) / 260, -1, 1); lookY = clamp((target[1] - f[1]) / 260, -1, 1) }
    S.lookS = lerp(S.lookS ?? look, look, .15); S.lookYS = lerp(S.lookYS ?? lookY, lookY, .15);
    m.look = S.lookS; m.lookY = S.lookYS; m.face = S.face; m.rot = S.rot;
    if (S.armR) m.armR = S.armR === 'wave' ? ARM_WAVE(now) : S.armR; if (S.armL) m.armL = S.armL;
    if (S.legL) m.legL = S.legL; if (S.legR) m.legR = S.legR;
    if (S.walking) walk(m, S.walkPhase, S.dir, 1, 1);
    if (S.air) airPose(m, S.airU || .5);
    if (S.sq > 0) squash(m, S.sq);
    if (S.sleep) { m.face = 'closed'; m.smile = .5; m.rot = Math.sin(now * 1.2) * .03 }
    // tepki katmanı
    const r = S.react;
    if (r) { m.face = r.face || m.face; if (r.armR) m.armR = r.armR === 'wave' ? ARM_WAVE(now) : r.armR; if (r.sweat) { m.sweat = 1; m.sweatT = now * .8 } if (r.pancake) { const k = clamp((now - (S.pancakeT || 0)) / .18); pancake(m, k * .85); if (k >= 1 && !r.starred) { r.starred = true; fx.push({ kind: 'stars', x: p.x, y: p.y - 60 * S.s, t: 0 }) } } }
    if (S.hopT != null) { const u = (now - S.hopT) / .42; if (u < 1) { m.y -= 60 * S.s * 4 * u * (1 - u) * 1.6; airPose(m, u) } else { S.hopT = null; S.sq = .8 } }
    // kırpma: arkasında durduğu nesneler
    ctx.save();
    if (S.clipSel.length) { ctx.beginPath(); ctx.rect(0, 0, W, H); let any = false; for (const sel of S.clipSel) { const rc = rectOf(sel); if (rc) { ctx.rect(rc.left, rc.top, rc.width, rc.height); any = true } } if (any) ctx.clip('evenodd') }
    ctx.globalAlpha = S.alpha;
    if (!S.hidden) { if (S.oy > 4 || S.clipSel.length) m.nosh = true; stageMobu(ctx, m) }
    ctx.restore();
    lastM = m;
    drawFx(dt);
    // tık hedefi: yüz
    const f = facePos(m); const sz = Math.round(110 * S.s);
    hit.style.transform = `translate(${Math.round(f[0] - sz / 2)}px, ${Math.round(f[1] - sz / 2)}px)`; hit.style.width = hit.style.height = sz + 'px';
    hit.hidden = S.hidden || f[0] < -50 || f[0] > W + 50;
  }

  S.fresh = true; scene(); requestAnimationFrame(frame);
  return {
    react, scene, state: S,
    destroy() { running = false; token.c = true },
  };
}
