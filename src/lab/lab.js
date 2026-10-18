// lab.js — Mobu'nun Oyun Laboratuvarı: içinde dolaşılan yan görünüşlü karanlık laboratuvar.
// 12 istasyon yatay sırada; Mobu zeminde yürür, monitöre girince deney açılır.
import { EXPERIMENTS } from '../config/experiments.js';
import { PREVIEWS } from './previews.js';
import { Input } from '../core/input.js';
import { TouchControls } from '../core/touch.js';
import { audio } from '../core/audio.js';
import { store } from '../core/store.js';
import { computeView, sizeCanvas, beginFrame } from '../core/view.js';
import { clamp, lerp, eIO, eBack, lin, hash } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, FONT, MONO, setBoil, poly, inkLine } from '../core/ink.js';
import { mk, walk, hop, landSq, drawMobu, ARM_HIP, ARM_UPS, lerpArm, ARM_DEF } from '../core/mobu.js';
import { Particles, glowAt } from '../core/fx.js';
import { txt, chip, jtLogo } from '../core/ui.js';

// ---- düzen sabitleri (dünya koordinatı, mantıksal birim) ----
const FLOOR = 470;               // duvar–zemin çizgisi
const MY = 545;                  // Mobu'nun ayak y'si (zemin şeridinde)
const SP = 300, X0 = 300;        // istasyon aralığı ve ilk istasyonun x'i
const N = EXPERIMENTS.length;
const WORLD = X0 * 2 + (N - 1) * SP;
const MS = 0.42;                 // Mobu ölçeği (~197 px)
const MON = { w: 190, h: 146, top: 222 };   // monitör gövdesi
const SCR = { x: -78, y: 238, w: 156, h: 110 };   // ekran (istasyon merkezine göre)
const sx = i => X0 + i * SP;
const stopX = i => sx(i) - 110;
const pad2 = n => String(n).padStart(2, '0');

export class Lab {
  // root: #lab elementi; app: {openExperiment(id,{cut}), setFlash(a)}
  constructor(root, app) {
    this.root = root; this.app = app;
    this.time = 0; this.visible = false; this.raf = 0; this.last = 0;
    this.parts = new Particles(80);
    this.m = { x: 120, dir: 1, v: 0, ph: 0 };      // Mobu durumu
    this.cam = { x: 120, y: 300, z: 1 };
    this.target = null; this.pending = null; this.zoom = null;
    this.idleT = 0; this.hopT = -9; this.arriveT = -9; this.sorpT = -9; this.dustT = 0; this.zzT = 0;
    this.glow = new Array(N).fill(0); this.chipK = 0; this.near = -1;
    this.reduced = !!store.get('reduced', false);
    this._build();
    this._onKey = e => this._key(e);
    window.addEventListener('keydown', this._onKey);
    store.onChange(() => this._counts());
    this._counts();
  }

  // ---------- DOM ----------
  _build() {
    const base = (import.meta.env && import.meta.env.BASE_URL) || './';
    this.root.innerHTML = `
      <div class="lab-view">
        <canvas class="lab-cv"></canvas>
        <div class="lab-ui">
          <div class="lab-brand">
            <img src="${base}logo/jt_logo.png" alt="JT" width="38" height="38" onerror="this.style.display='none'">
            <div><h1>MOBU'NUN OYUN LABORATUVARI</h1><p class="lab-sub">Videoda gördün. Şimdi kendin dene.</p></div>
          </div>
          <div class="lab-tools">
            <span class="lab-count" title="Kazandığın damgalar"></span>
            <button class="btn btn-icon" type="button" data-a="sound" aria-label="Ses"></button>
            <button class="btn btn-reduce" type="button" data-a="reduce" aria-pressed="false"><span class="rd-ico">◐</span><span class="rd-t">Hareketi azalt</span></button>
          </div>
        </div>
      </div>
      <nav class="lab-strip" aria-label="Hızlı erişim"></nav>`;
    const q = s => this.root.querySelector(s);
    this.view_el = q('.lab-view'); this.cv = q('.lab-cv'); this.g = this.cv.getContext('2d');
    this.subEl = q('.lab-sub'); this.countEl = q('.lab-count'); this.soundEl = q('[data-a=sound]'); this.reduceEl = q('[data-a=reduce]');
    this.strip = q('.lab-strip');
    EXPERIMENTS.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qs'; b.dataset.id = c.id;
      b.innerHTML = `<span class="qn">${pad2(c.no)}</span><span class="qt">${c.short}</span><i class="qk" aria-hidden="true"></i>`;
      b.setAttribute('aria-label', `${c.no}. ${c.short}`);
      b.addEventListener('click', () => { this.goTo(c.id, { enter: true }); b.blur(); });
      this.strip.appendChild(b);
    });
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'sound') { audio.enabled = !audio.enabled; this._soundUI(); if (audio.enabled) audio.play('click'); }
      else if (b.dataset.a === 'reduce') { this.reduced = !this.reduced; store.set('reduced', this.reduced); this._reduceUI(); }
      b.blur();
    });
    this._soundUI(); this._reduceUI();
    this.input = new Input(); this.input.enabled = false;
    this.view = computeView(300, 300);
    this.input.attach(this.view_el, this.view);
    this.input.onFirst = () => this.subEl.classList.add('gone');
    this.touch = new TouchControls(this.view_el, this.input);
    this.touch.configure({ joystick: 'horizontal', buttons: [{ name: 'action', label: 'GİR' }] });
    this.ro = new ResizeObserver(() => this._resize()); this.ro.observe(this.view_el);
    // tarama çizgisi deseni (monitörler için)
    const sc = document.createElement('canvas'); sc.width = 4; sc.height = 3; const sg = sc.getContext('2d'); sg.fillStyle = 'rgba(0,0,0,.28)'; sg.fillRect(0, 2, 4, 1);
    this.scan = this.g.createPattern(sc, 'repeat');
  }
  _soundUI() { this.soundEl.textContent = audio.enabled ? '🔊' : '🔇'; this.soundEl.setAttribute('aria-pressed', audio.enabled); }
  _reduceUI() { this.reduceEl.setAttribute('aria-pressed', this.reduced); this.reduceEl.querySelector('.rd-ico').textContent = this.reduced ? '●' : '◐'; }
  _counts() {
    const st = store.stamps(); this.countEl.textContent = `Hatıralar ${Object.keys(st).filter(k => EXPERIMENTS.some(e => e.id === k)).length}/${N}`;
    this.strip.querySelectorAll('.qs').forEach(b => b.classList.toggle('done', !!st[b.dataset.id]));
  }
  _resize() {
    const el = this.view_el; if (!el.clientWidth) return;
    this.view = computeView(el.clientWidth, el.clientHeight);
    sizeCanvas(this.cv, this.view); this.input.setView(this.view);
  }

  // ---------- yaşam döngüsü ----------
  // Mobu'yu bir istasyonun önüne yerleştir (hash ile doğrudan deney açılınca)
  prime(id) {
    const i = EXPERIMENTS.findIndex(e => e.id === id); if (i < 0) return;
    this.m.x = stopX(i); this.m.v = 0; this.cam.x = this._followX(); this.target = null; this.pending = null; this.zoom = null;
  }
  // exitFrom: deneyden dönüşse o istasyondan geri çekilme animasyonu
  show(exitFrom) {
    this.visible = true; this.input.enabled = true; this.last = 0;
    this._resize();
    if (exitFrom) {
      const i = EXPERIMENTS.findIndex(e => e.id === exitFrom);
      if (i >= 0) { this.m.x = stopX(i); this.m.v = 0; this.target = null; this.pending = null; this.zoom = { dir: -1, t: 0, dur: this.reduced ? 0.001 : 0.6, i }; this.arriveT = this.time; }
    } else this.zoom = null;
    this.idleT = 0;
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this._frame);
  }
  hide() { this.visible = false; this.input.enabled = false; cancelAnimationFrame(this.raf); this.raf = 0; this.input.setJoy(0, 0); }

  _frame = ts => {
    this.raf = requestAnimationFrame(this._frame);
    if (document.hidden || !this.last) { this.last = ts; return; }
    const dt = Math.min((ts - this.last) / 1000, 1 / 30); this.last = ts;
    this._update(dt); this._render();
  };

  // ---------- giriş / yürüme ----------
  _idx(id) { return EXPERIMENTS.findIndex(e => e.id === id); }
  goTo(id, o = {}) {
    const i = this._idx(id); if (i < 0 || this.zoom) return;
    if (o.enter && this.reduced) { this.app.openExperiment(id, { cut: true }); return; }
    const tx = o.x != null ? o.x : stopX(i), d = Math.abs(tx - this.m.x);
    this.target = { x: tx, id: o.enter || o.arrive ? id : null, enter: !!o.enter, speed: clamp(d / 1.4, 420, 1400) };
    this.pending = null; this.idleT = 0;
    this.subEl.classList.add('gone');
  }
  _enter(id) {
    const i = this._idx(id); if (i < 0 || this.zoom) return;
    audio.play('whoosh');
    if (this.reduced) { this.app.openExperiment(id, { cut: true }); return; }
    this.zoom = { dir: 1, t: 0, dur: 0.6, i, id };
  }
  _key(e) {
    if (!this.visible || this.zoom || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    let n = -1;
    if (e.key >= '1' && e.key <= '9') n = +e.key - 1; else if (e.key === '0') n = 9;
    if (n >= 0 && n < N) { this.goTo(EXPERIMENTS[n].id, { enter: true }); this.input._touch(); }
  }

  // ---------- güncelleme ----------
  _update(dt) {
    this.time += dt; const T = this.time, m = this.m, inp = this.input, P = inp.pointer;
    const prevX = m.x;
    // yakınlaştırma geçişi
    if (this.zoom) {
      const z = this.zoom; z.t += dt; const u = clamp(z.t / z.dur);
      if (z.dir > 0) {
        this.app.setFlash(lin(u, 0.65, 1));
        if (u >= 1 && !z.hold) { z.hold = true; this.app.openExperiment(z.id, {}); }
      } else {
        this.app.setFlash(1 - lin(u, 0, 0.35));
        if (u >= 1) this.zoom = null;
      }
    }
    const busy = !!this.zoom;
    // klavye / joystick
    const ax = inp.axis.x;
    if (!busy && Math.abs(ax) > 0.12) {
      this.target = null; this.pending = null;
      m.v = ax * 360; m.dir = Math.sign(ax); m.x += m.v * dt; this.idleT = 0; this.subEl.classList.add('gone');
    } else if (!busy && this.target) {
      const d = this.target.x - m.x, step = this.target.speed * dt;
      if (Math.abs(d) <= step) {
        m.x = this.target.x; m.v = 0; const tg = this.target; this.target = null;
        this.hopT = T; this.arriveT = T; audio.play('pop'); this.parts.dust(m.x, MY, 5);
        if (tg.enter) this.pending = { id: tg.id, at: T + 0.42 };
      } else { m.dir = Math.sign(d); m.v = m.dir * this.target.speed; m.x += m.v * dt; }
    } else m.v = 0;
    m.x = clamp(m.x, 90, WORLD - 90);
    if (this.pending && T >= this.pending.at && !this.zoom) { const id = this.pending.id; this.pending = null; this._enter(id); }
    // yakın istasyon
    let near = -1; const still = Math.abs(m.v) < 1 && !this.target;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(m.x - stopX(i));
      this.glow[i] += ((d < 70 ? 1 : 0) - this.glow[i]) * (1 - Math.exp(-9 * dt));
      if (d < 36 && still) near = i;
    }
    if (near !== this.near) { this.near = near; this.strip.querySelectorAll('.qs').forEach((b, i) => b.classList.toggle('here', i === near)); }
    this.chipK += ((near >= 0 && !busy ? 1 : 0) - this.chipK) * (1 - Math.exp(-14 * dt));
    // giriş tuşları
    if (!busy && near >= 0 && (inp.pressed('action') || inp.pressed('jump') || inp.pressed('up'))) { this.pending = null; this._enter(EXPERIMENTS[near].id); this.idleT = 0; }
    // işaretçi
    if (!busy && P.pressed && P.inside) this._click(P);
    if (P.dx || P.dy || P.pressed) this.idleT = 0;
    if (Math.abs(m.v) < 1 && !this.target && !inp.pressed('action')) this.idleT += dt;
    // parçacıklar
    if (Math.abs(m.v) > 60) { this.dustT -= dt; if (this.dustT <= 0) { this.dustT = 0.16; this.parts.dust(m.x - m.dir * 18, MY, 1, -m.dir); } }
    if (this.idleT > 6) { this.zzT -= dt; if (this.zzT <= 0) { this.zzT = 1.3; this.parts.zz(m.x + 38, MY - 178, 15); } }
    this.parts.update(dt);
    m.ph += Math.min(Math.abs(m.x - prevX), 14) * 0.045;
    // kamera
    const targetZ = 1;
    if (this.zoom) {
      const z = this.zoom, u = eIO(clamp(z.t / z.dur)), e = z.dir > 0 ? u : 1 - u;
      const fx = this._followX();
      this.cam.z = 1 + (3 - 1) * e; this.cam.x = lerp(fx, sx(z.i), e); this.cam.y = lerp(300, 300 - 5, e);
    } else {
      const fx = this._followX(); this.cam.x += (fx - this.cam.x) * (1 - Math.exp(-6.5 * dt));
      this.cam.z = targetZ; this.cam.y = 300;
    }
    inp.endFrame();
  }
  _followX() {
    const W = this.view.w, half = W / 2;
    return clamp(this.m.x + this.m.dir * 40, half, WORLD - half);
  }
  _click(P) {
    const c = this.cam, W = this.view.w, H = this.view.h;
    const wx = c.x + (P.x - W / 2) / c.z, wy = c.y + (P.y - H / 2) / c.z, m = this.m;
    // GİR çipi
    if (this.near >= 0 && this.chipK > 0.6) {
      const cx = sx(this.near), cy = 190;
      if (Math.abs(wx - cx) < 46 && Math.abs(wy - cy) < 26) { this._enter(EXPERIMENTS[this.near].id); return; }
    }
    // Mobu'ya tıklama (sürpriz)
    if (Math.abs(wx - m.x) < 52 && wy > MY - 215 && wy < MY + 8) { this.sorpT = this.time; this.hopT = this.time; audio.play('pop'); this.target = null; this.pending = null; this.idleT = 0; return; }
    // istasyon
    for (let i = 0; i < N; i++) if (Math.abs(wx - sx(i)) < 108 && wy > 195 && wy < FLOOR + 10) { this.goTo(EXPERIMENTS[i].id, { enter: true }); return; }
    // zemin: sadece yürü
    if (wy > FLOOR) { this.target = { x: clamp(wx, 90, WORLD - 90), id: null, enter: false, speed: clamp(Math.abs(wx - m.x) / 1.4, 420, 1400) }; this.pending = null; this.subEl.classList.add('gone'); }
  }

  // ---------- çizim ----------
  _render() {
    const g = this.g, view = this.view, T = this.time, c = this.cam;
    if (!view.cssW) return;
    setBoil(T);
    beginFrame(g, view, '#050407');
    const W = view.w, H = view.h;
    g.save();
    g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y);
    const hx = W / 2 / c.z, x0 = c.x - hx - 30, x1 = c.x + hx + 30;
    this._wall(g, x0, x1, T);
    this._shelves(g, x0, x1, T);
    this._floor(g, x0, x1);
    this._lamps(g, x0, x1);
    for (let i = 0; i < N; i++) if (sx(i) > x0 - 130 && sx(i) < x1 + 130) this._station(g, i, T);
    // Mobu
    this._mobu(g, T);
    this.parts.draw(g);
    this._chip(g, T);
    g.restore();
    // vinyet (ekran uzayı)
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.7, 'rgba(18,6,36,.28)'); v.addColorStop(1, 'rgba(8,2,16,.7)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    g.restore();
  }

  _wall(g, x0, x1, T) {
    const gr = g.createLinearGradient(0, -20, 0, FLOOR); gr.addColorStop(0, '#0e0a15'); gr.addColorStop(0.6, '#150f1f'); gr.addColorStop(1, '#1a1327');
    g.fillStyle = gr; g.fillRect(x0, -30, x1 - x0, FLOOR + 30);
    // uzak katman: yavaş kayan panel çizgileri
    g.strokeStyle = 'rgba(182,124,255,.06)'; g.lineWidth = 2;
    const cx = this.cam.x, k0 = Math.floor((x0 - cx) / 0.88 / 240) - 1, k1 = Math.ceil((x1 - cx) / 0.88 / 240) + 1;
    g.beginPath();
    for (let k = k0; k <= k1; k++) { const wx = k * 240, X = cx + (wx - cx) * 0.88 + 0; g.moveTo(X, 20); g.lineTo(X, FLOOR); }
    g.stroke();
    g.fillStyle = 'rgba(139,61,255,.07)'; g.fillRect(x0, 372, x1 - x0, 4);        // süpürgelik şeridi
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, 376, x1 - x0, FLOOR - 376);
    // tavan borusu
    g.fillStyle = '#211c2b'; g.fillRect(x0, 36, x1 - x0, 14); g.fillStyle = 'rgba(233,221,255,.12)'; g.fillRect(x0, 38, x1 - x0, 2);
    g.fillStyle = INK; g.fillRect(x0, 34, x1 - x0, 2); g.fillRect(x0, 50, x1 - x0, 2);
    for (let wx = Math.floor(x0 / 150) * 150; wx < x1; wx += 150) { g.fillStyle = '#2B2B2B'; g.fillRect(wx - 5, 30, 10, 26); g.fillStyle = INK; g.fillRect(wx - 5, 30, 10, 2); }
    // kablo: istasyonlar arasında sarkan mor kablo
    g.strokeStyle = '#4a2c8a'; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, 80); g.lineTo(sx(0) - 150, 80);
    for (let i = 0; i < N - 1; i++) { g.moveTo(sx(i), 80); g.quadraticCurveTo((sx(i) + sx(i + 1)) / 2, 80 + 24, sx(i + 1), 80); }
    g.moveTo(sx(0), 80); g.lineTo(sx(0) - 150, 80); g.moveTo(sx(N - 1), 80); g.lineTo(x1, 80);
    g.stroke();
    g.strokeStyle = INK; g.lineWidth = 1; g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;
    // sol uç: JT plaket, sağ uç: hatıra panosu
    this._plaque(g, 112, 190, T);
    this._board(g, X0 + (N - 1) * SP + 150, 190, T);
  }
  _plaque(g, x, y) {
    g.fillStyle = '#120e19'; g.strokeStyle = '#2B2B2B'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - 62, y - 54, 124, 112, 10); g.fill(); g.stroke();
    jtLogo(g, x, y - 6, 0.075, 1, '#F5F5F5', 10);
    txt(g, 'MOBU LAB', x, y + 40, 11, GLOW, 'center', 900);
  }
  _board(g, x, y) {
    g.fillStyle = '#120e19'; g.strokeStyle = '#2B2B2B'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - 62, y - 54, 124, 112, 10); g.fill(); g.stroke();
    txt(g, 'HATIRALAR', x, y - 40, 10, '#8C8C8C', 'center', 900);
    const st = store.stamps();
    for (let i = 0; i < N; i++) {
      const cx = x - 36 + (i % 4) * 24, cy = y - 18 + Math.floor(i / 4) * 26, on = !!st[EXPERIMENTS[i].id];
      g.beginPath(); g.arc(cx, cy, 9, 0, 7);
      if (on) { g.fillStyle = PURPLE; g.fill(); g.strokeStyle = LAV; g.lineWidth = 1.5; g.stroke(); } else { g.strokeStyle = '#3a3050'; g.lineWidth = 1.5; g.setLineDash([2, 2.5]); g.stroke(); g.setLineDash([]); }
    }
  }

  _shelves(g, x0, x1, T) {
    for (let i = 0; i < N - 1; i++) {
      const gx = sx(i) + SP / 2;
      if (gx < x0 - 70 || gx > x1 + 70) continue;
      for (const [by, kinds] of [[262, 'tfT'], [342, 'ftf']]) {
        // raf tahtası + iki yan destek
        g.fillStyle = '#2B2B2B'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.roundRect(gx - 50, by, 100, 8, 2); g.fill(); g.stroke();
        g.fillStyle = '#1e1a27'; g.fillRect(gx - 40, by + 8, 7, 16); g.fillRect(gx + 33, by + 8, 7, 16);
        for (let k = 0; k < 3; k++) {
          const ix = gx - 30 + k * 30, kind = kinds[k].toLowerCase(), col = (i + k + (by > 300 ? 1 : 0)) % 2 ? GLOW : PURPLE;
          this._glass(g, ix, by, kind, col, T + i * 0.7 + k);
        }
      }
    }
  }
  _glass(g, x, y, kind, col, T) {
    g.save(); g.translate(x, y);
    g.lineWidth = 2.2; g.strokeStyle = 'rgba(233,221,255,.55)'; g.fillStyle = 'rgba(233,221,255,.07)';
    if (kind === 't') {
      g.beginPath(); g.roundRect(-8, -44, 16, 44, [2, 2, 8, 8]); g.fill(); g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(-6.5, -24, 13, 23, [0, 0, 6, 6]); g.fill(); g.globalAlpha = 1;
      const b = (T * 0.5) % 1; g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(Math.sin(T * 2) * 2, -4 - b * 18, 1.6, 0, 7); g.fill();
    } else {
      g.beginPath(); g.moveTo(-5, -40); g.lineTo(5, -40); g.lineTo(5, -26); g.lineTo(17, -2); g.quadraticCurveTo(18, 0, 14, 0); g.lineTo(-14, 0); g.quadraticCurveTo(-18, 0, -17, -2); g.lineTo(-5, -26); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(-10, -14); g.lineTo(10, -14); g.lineTo(15, -3); g.lineTo(-15, -3); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    g.restore();
  }

  _floor(g, x0, x1) {
    const gr = g.createLinearGradient(0, FLOOR, 0, 640); gr.addColorStop(0, '#1b1428'); gr.addColorStop(0.5, '#120d1b'); gr.addColorStop(1, '#09070d');
    g.fillStyle = gr; g.fillRect(x0, FLOOR, x1 - x0, 200);
    g.fillStyle = INK; g.fillRect(x0, FLOOR - 2, x1 - x0, 4);
    g.fillStyle = 'rgba(182,124,255,.28)'; g.fillRect(x0, FLOOR + 2, x1 - x0, 1.5);
    // ızgara
    g.strokeStyle = 'rgba(182,124,255,.07)'; g.lineWidth = 1.2; g.beginPath();
    for (const y of [492, 522, 562, 612]) { g.moveTo(x0, y); g.lineTo(x1, y); }
    const cx = this.cam.x; for (let wx = Math.floor(x0 / 100) * 100; wx < x1 + 100; wx += 100) { g.moveTo(wx, FLOOR); g.lineTo(wx + (wx - cx) * 0.4, 640); }
    g.stroke();
  }

  _lamps(g, x0, x1) {
    for (let i = 0; i < N; i++) {
      const X = sx(i); if (X < x0 - 160 || X > x1 + 160) continue;
      const lit = 0.55 + 0.45 * this.glow[i];
      // ışık konisi
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, 146, 0, FLOOR + 90); gr.addColorStop(0, `rgba(139,61,255,${0.2 * lit})`); gr.addColorStop(1, 'rgba(139,61,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(X - 22, 146); g.lineTo(X + 22, 146); g.lineTo(X + 130, FLOOR + 90); g.lineTo(X - 130, FLOOR + 90); g.closePath(); g.fill();
      // zemin spotu
      g.translate(X, FLOOR + 62); g.scale(1, 0.22);
      const sp = g.createRadialGradient(0, 0, 0, 0, 0, 150); sp.addColorStop(0, `rgba(182,124,255,${0.42 * lit})`); sp.addColorStop(1, 'rgba(182,124,255,0)');
      g.fillStyle = sp; g.fillRect(-150, -150, 300, 300); g.restore();
      // kordon + abajur
      g.strokeStyle = '#1B1426'; g.lineWidth = 3; g.beginPath(); g.moveTo(X, 80); g.lineTo(X, 118); g.stroke();
      poly(g, [[X - 11, 118], [X + 11, 118], [X + 26, 146], [X - 26, 146]], '#2B2B2B', 4000 + i * 10, 3);
      g.fillStyle = `rgba(233,221,255,${0.7 + 0.3 * this.glow[i]})`; g.beginPath(); g.ellipse(X, 147, 17, 4.5, 0, 0, 7); g.fill();
      glowAt(g, X, 150, 60, '182,124,255', 0.35 * lit);
    }
  }

  _station(g, i, T) {
    const c = EXPERIMENTS[i], X = sx(i), gl = this.glow[i], done = store.hasStamp(c.id);
    // kaide
    poly(g, [[X - 100, 382], [X + 100, 382], [X + 100, 474], [X - 100, 474]], '#171717', 4100 + i * 10, 3.5);
    g.fillStyle = '#2B2B2B'; g.fillRect(X - 98, 384, 196, 8); g.fillStyle = 'rgba(182,124,255,.25)'; g.fillRect(X - 98, 384, 196, 1.5);
    // başlık plakası
    g.fillStyle = '#0d0a12'; g.strokeStyle = gl > 0.5 ? GLOW : '#2B2B2B'; g.lineWidth = 2; g.beginPath(); g.roundRect(X - 84, 410, 168, 32, 7); g.fill(); g.stroke();
    txt(g, c.short, X - (done ? 8 : 0), 426.5, 13, gl > 0.5 ? '#fff' : '#d8d2e4', 'center', 800);
    if (done) { // mor mühür
      g.save(); g.translate(X + 68, 426); g.rotate(-0.25); g.fillStyle = PURPLE; g.strokeStyle = LAV; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-4, 0.5); g.lineTo(-1, 4); g.lineTo(5, -4); g.stroke(); g.restore();
    }
    // boyun
    g.fillStyle = '#2B2B2B'; g.fillRect(X - 22, MON.top + MON.h - 2, 44, 20); g.fillStyle = INK; g.fillRect(X - 22, MON.top + MON.h - 2, 44, 2);
    // monitör
    if (gl > 0.02) glowAt(g, X, MON.top + 70, 150, '139,61,255', 0.4 * gl);
    g.fillStyle = '#211a2e'; g.strokeStyle = INK; g.lineWidth = 4.5; g.beginPath(); g.roundRect(X - MON.w / 2, MON.top, MON.w, MON.h, 18); g.fill(); g.stroke();
    g.strokeStyle = gl > 0.3 ? `rgba(182,124,255,${0.3 + 0.5 * gl})` : 'rgba(255,255,255,.07)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(X - MON.w / 2 + 3, MON.top + 3, MON.w - 6, MON.h - 6, 15); g.stroke();
    // ekran
    g.save(); g.translate(X + SCR.x, SCR.y); g.beginPath(); g.roundRect(0, 0, SCR.w, SCR.h, 10); g.clip();
    const f = PREVIEWS[c.id]; if (f) f(g, T + i * 0.37, SCR.w, SCR.h);
    g.fillStyle = this.scan; g.fillRect(0, 0, SCR.w, SCR.h);
    if (gl < 0.98) { g.fillStyle = `rgba(0,0,0,${0.22 * (1 - gl)})`; g.fillRect(0, 0, SCR.w, SCR.h); }
    const gg = g.createLinearGradient(0, 0, SCR.w, SCR.h); gg.addColorStop(0, 'rgba(255,255,255,.1)'); gg.addColorStop(0.35, 'rgba(255,255,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, SCR.w, SCR.h);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(X + SCR.x, SCR.y, SCR.w, SCR.h, 10); g.stroke();
    // LED
    g.fillStyle = gl > 0.4 ? GLOW : '#4a4458'; g.beginPath(); g.arc(X + MON.w / 2 - 14, MON.top + MON.h - 11, 3, 0, 7); g.fill();
    // numara rozeti
    g.save(); g.translate(X - MON.w / 2 + 6, MON.top + 2); g.fillStyle = PURPLE; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(-16, -12, 40, 24, 12); g.fill(); g.stroke();
    txt(g, '#' + pad2(c.no), 4, 0.5, 12, '#fff', 'center', 900); g.restore();
  }

  _mobu(g, T) {
    const m = this.m, mo = mk(T, m.x, MY, MS);
    mo.gy = MY; const moving = Math.abs(m.v) > 8 || !!this.target;
    const dir = m.dir || 1;
    if (moving) walk(mo, m.ph, dir, 1, clamp(Math.abs(m.v) / 360, 0.45, 1));
    // bakış
    const P = this.input.pointer, c = this.cam;
    if (P.inside && P.type === 'mouse') { const wx = c.x + (P.x - this.view.w / 2) / c.z; mo.look = clamp((wx - m.x) / 240, -1, 1); }
    // yüz
    const sorp = T - this.sorpT;
    if (sorp < 0.6) { // sürpriz: >_<
      mo.face = 'angry'; landSq(mo, T, this.sorpT, 1.2, 0.5); hop(mo, T, this.sorpT, this.sorpT + 0.3, 26);
    } else if (sorp < 2.1) { mo.face = 'proud'; mo.armR = ARM_HIP; mo.armL = ARM_HIP; hop(mo, T, this.sorpT + 0.6, this.sorpT + 0.9, 14); }
    else if (this.idleT > 6) { mo.face = 'closed'; mo.rot = (mo.rot || 0) + Math.sin(T * 1.2) * 0.02; mo.smile = 0.4; }
    else if (this.near >= 0 && !moving) mo.face = 'o';
    else if (this.zoom && this.zoom.dir < 0 && this.zoom.t < 0.8) mo.face = 'happy';
    // varış zıplaması
    if (T - this.hopT < 0.36 && sorp > 0.6) { hop(mo, T, this.hopT, this.hopT + 0.36, 20); landSq(mo, T, this.hopT + 0.36, 0.7, 0.2); }
    drawMobu(g, mo);
  }

  _chip(g, T) {
    if (this.chipK < 0.02 || this.near < 0) return;
    const X = sx(this.near), k = clamp(this.chipK), s = eBack(k);
    g.save(); g.translate(X, 190 - (1 - k) * 8); g.scale(s, s);
    chip(g, 'GİR', 0, 0, true, 15);
    g.restore();
  }
}
