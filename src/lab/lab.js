// lab.js — Mobu'nun Oyun Laboratuvarı: içinde dolaşılan yan görünüşlü karanlık laboratuvar.
// 12 istasyon yatay sırada; Mobu zeminde yürür, monitöre girince deney açılır.
import { EXPERIMENTS } from '../config/experiments.js';
import { PREVIEWS } from './previews.js';
import { Input } from '../core/input.js';
import { TouchControls } from '../core/touch.js';
import { audio } from '../core/audio.js';
import { store } from '../core/store.js';
import { computeView, sizeCanvas, beginFrame } from '../core/view.js';
import { clamp, lerp, eIO, eBack, lin, hash01 } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, setBoil, poly } from '../core/ink.js';
import { mk, walk, hop, landSq, drawMobu, ARM_HIP, ARM_UPS } from '../core/mobu.js';
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
const ZDUR = 0.75;               // giriş/çıkış zoom süresi (sn)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Lab {
  // root: #lab elementi; app: {openExperiment(id,{cut}), setFlash(a)}
  constructor(root, app) {
    this.root = root; this.app = app;
    this.time = 0; this.visible = false; this.raf = 0; this.last = 0;
    this.parts = new Particles(120);
    this.m = { x: 120, dir: 1, v: 0, ph: 0 };      // Mobu durumu
    this.cam = { x: 120, y: 300, z: 1 };
    this.target = null; this.pending = null; this.zoom = null;
    this.idleT = 0; this.hopT = -9; this.arriveT = -9; this.sorpT = -9; this.celeT = -99; this.dustT = 0; this.zzT = 0; this.nearT = 0;
    this.glow = new Array(N).fill(0); this.chipK = 0; this.near = -1; this.modalOpen = false; this.celeb = false;
    this.snap = this._count();
    this.reduced = !!store.get('reduced', false);
    this._build();
    window.addEventListener('keydown', e => this._key(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
      else if (this.visible && !this.raf) { this.last = 0; this.raf = requestAnimationFrame(this._frame); }
    });
    store.onChange(() => this._counts());
    this._counts();
  }

  _count() { const st = store.stamps(); return EXPERIMENTS.filter(e => st[e.id]).length; }

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
            <a class="btn lab-home" href="${base}" title="JUIT ana sitesine dön"><span aria-hidden="true">←</span> JUIT<span class="sr-only"> ana sitesine dön</span></a>
            <button class="lab-count" type="button" data-a="stamps" title="Hatıralarını gör"></button>
            <button class="btn btn-icon" type="button" data-a="sound" aria-label="Ses"></button>
            <button class="btn btn-reduce" type="button" data-a="reduce" aria-pressed="false"><span class="rd-ico">◐</span><span class="rd-t">Hareketi azalt</span></button>
          </div>
        </div>
        <div class="stamp-modal" hidden>
          <div class="sm-box" role="dialog" aria-modal="true" aria-labelledby="sm-t">
            <button class="sm-x btn btn-icon" type="button" data-a="smclose" aria-label="Kapat">✕</button>
            <h2 id="sm-t">Hatıralar</h2>
            <p class="sm-sub"></p>
            <div class="sm-grid"></div>
            <div class="sm-foot">
              <button class="sm-reset" type="button" data-a="smreset">Hepsini sıfırla</button>
              <span class="sm-confirm" hidden>Tüm damgalar silinsin mi? <button type="button" data-a="smyes">Evet, sil</button><button type="button" data-a="smno">Vazgeç</button></span>
            </div>
          </div>
        </div>
      </div>
      <nav class="lab-strip" aria-label="Hızlı erişim"></nav>`;
    const q = s => this.root.querySelector(s);
    this.view_el = q('.lab-view'); this.cv = q('.lab-cv'); this.g = this.cv.getContext('2d');
    this.subEl = q('.lab-sub'); this.countEl = q('.lab-count'); this.soundEl = q('[data-a=sound]'); this.reduceEl = q('[data-a=reduce]');
    this.strip = q('.lab-strip'); this.modal = q('.stamp-modal'); this.smGrid = q('.sm-grid'); this.smSub = q('.sm-sub');
    EXPERIMENTS.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qs'; b.dataset.id = c.id;
      b.innerHTML = `<span class="qn">${pad2(c.no)}</span><span class="qt">${esc(c.short)}</span><i class="qk" aria-hidden="true"></i>`;
      b.setAttribute('aria-label', `${c.no}. ${c.short}`);
      b.addEventListener('click', () => { this.goTo(c.id, { enter: true }); b.blur(); });
      this.strip.appendChild(b);
    });
    this.root.addEventListener('click', e => {
      if (e.target === this.modal) { this._modal(false); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'sound') { audio.enabled = !audio.enabled; this._soundUI(); if (audio.enabled) audio.play('click'); }
      else if (a === 'reduce') { this.reduced = !this.reduced; store.set('reduced', this.reduced); this._reduceUI(); }
      else if (a === 'stamps') this._modal(true);
      else if (a === 'smclose') this._modal(false);
      else if (a === 'smreset') { this.root.querySelector('.sm-reset').hidden = true; this.root.querySelector('.sm-confirm').hidden = false; }
      else if (a === 'smno') { this.root.querySelector('.sm-reset').hidden = false; this.root.querySelector('.sm-confirm').hidden = true; }
      else if (a === 'smyes') { store.set('stamps', {}); this.root.querySelector('.sm-reset').hidden = false; this.root.querySelector('.sm-confirm').hidden = true; audio.play('click'); }
      b.blur();
    });
    this._soundUI(); this._reduceUI();
    // arayüz katmanlarındaki dokunuşlar canvas girdisine (pointer capture) gitmesin
    for (const el of [q('.lab-ui'), this.modal]) el.addEventListener('pointerdown', e => e.stopPropagation());
    this.input = new Input(); this.input.enabled = false;
    this.view = computeView(300, 300);
    this.input.attach(this.view_el, this.view);
    this.input.onFirst = () => this.subEl.classList.add('gone');
    this.touch = new TouchControls(this.view_el, this.input);
    this.touch.configure({ joystick: 'horizontal', buttons: [{ name: 'action', label: 'GİR' }] });
    this.ro = new ResizeObserver(() => this._resize()); this.ro.observe(this.view_el);
  }
  _soundUI() { this.soundEl.textContent = audio.enabled ? '🔊' : '🔇'; this.soundEl.setAttribute('aria-pressed', audio.enabled); }
  _reduceUI() { this.reduceEl.setAttribute('aria-pressed', this.reduced); this.reduceEl.querySelector('.rd-ico').textContent = this.reduced ? '●' : '◐'; }
  _counts() {
    const st = store.stamps(), n = this._count(); this.countEl.textContent = `Hatıralar ${n}/${N}`;
    this.strip.querySelectorAll('.qs').forEach(b => b.classList.toggle('done', !!st[b.dataset.id]));
    if (this.modalOpen) this._renderStamps();
  }
  // "Hatıralar" penceresi: 12 yuva, kazanılanlar mor mühürlü
  _modal(open) {
    this.modalOpen = open; this.modal.hidden = !open; this.input.enabled = this.visible && !open;
    if (open) { this._renderStamps(); this.root.querySelector('.sm-reset').hidden = false; this.root.querySelector('.sm-confirm').hidden = true; audio.play('click'); this.modal.querySelector('.sm-x').focus(); }
  }
  _renderStamps() {
    const st = store.stamps(), n = this._count();
    this.smSub.textContent = `${n}/${N} damga kazandın`;
    this.smGrid.innerHTML = EXPERIMENTS.map(c => {
      const on = !!st[c.id];
      return `<div class="slot${on ? ' done' : ''}"><div class="seal">${on ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : `<span>${pad2(c.no)}</span>`}</div><b>${on ? esc(c.short) : '— — —'}</b><small>#${pad2(c.no)}${on ? '' : ' · henüz yok'}</small></div>`;
    }).join('');
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
    this.m.x = stopX(i); this.m.v = 0; this.cam.x = this._followX(); this.target = null; this.pending = null; this.zoom = null; this.snap = this._count();
  }
  // exitFrom: deneyden dönüşse o istasyondan geri çekilme animasyonu
  show(exitFrom) {
    this.visible = true; this.input.enabled = !this.modalOpen; this.last = performance.now();
    this._resize();
    if (exitFrom) {
      const i = EXPERIMENTS.findIndex(e => e.id === exitFrom);
      if (i >= 0) {
        this.m.x = stopX(i); this.m.v = 0; this.target = null; this.pending = null; this.near = -1; this.chipK = 0;
        this.zoom = { dir: -1, t: 0, dur: this.reduced ? 0.001 : ZDUR, i }; this.arriveT = this.time;
        const c = this._count(); this.celeb = c > this.snap; this.snap = c;
      }
    } else this.zoom = null;
    this.idleT = 0;
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this._frame);
    // bekçi: rAF gelmezse (odaksız/arka plan paneli) döngüyü zamanlayıcı ilerletir; sadece document.hidden iken durur
    this.lastTick = performance.now(); clearInterval(this._wd);
    this._wd = setInterval(() => { if (this.visible && !document.hidden && performance.now() - this.lastTick > 50) this._tick(performance.now(), true); }, 25);
  }
  hide() { clearInterval(this._wd); this._wd = 0; this.visible = false; this.input.enabled = false; cancelAnimationFrame(this.raf); this.raf = 0; this.input.setJoy(0, 0); this.root.classList.remove('zooming'); }

  _frame = ts => {
    this.raf = requestAnimationFrame(this._frame);
    this._tick(ts);
  };
  _tick(ts, wd) {
    this.lastTick = performance.now();
    if (document.hidden || !this.last) { this.last = ts; return; }
    const dt = Math.max(0, Math.min((ts - this.last) / 1000, wd ? 0.075 : 1 / 30)); this.last = ts;
    this._update(dt); this._render();
  }

  // ---------- giriş / yürüme ----------
  _idx(id) { return EXPERIMENTS.findIndex(e => e.id === id); }
  goTo(id, o = {}) {
    const i = this._idx(id); if (i < 0 || this.zoom) return;
    if (o.enter && this.reduced) { this.snap = this._count(); this.app.openExperiment(id, { cut: true }); return; }
    const tx = o.x != null ? o.x : stopX(i), d = Math.abs(tx - this.m.x);
    this.target = { x: tx, id: o.enter || o.arrive ? id : null, enter: !!o.enter, speed: clamp(d / 1.4, 420, 1400) };
    this.pending = null; this.idleT = 0;
    this.subEl.classList.add('gone');
  }
  _enter(id) {
    const i = this._idx(id); if (i < 0 || this.zoom) return;
    audio.play('whoosh'); this.snap = this._count();
    if (this.reduced) { this.app.openExperiment(id, { cut: true }); return; }
    this.zoom = { dir: 1, t: 0, dur: ZDUR, i, id };
  }
  _stepStation(d) {
    let i;
    if (this.near >= 0) i = clamp(this.near + d, 0, N - 1);
    else if (d > 0) { i = 0; while (i < N - 1 && stopX(i) <= this.m.x + 8) i++; }
    else { i = N - 1; while (i > 0 && stopX(i) >= this.m.x - 8) i--; }
    this.goTo(EXPERIMENTS[i].id, { arrive: true });
  }
  _key(e) {
    if (!this.visible) return;
    if (this.modalOpen) { if (e.key === 'Escape') this._modal(false); return; }
    if (this.zoom || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    const c = e.code; let n = -1;
    if (/^(Digit|Numpad)[1-9]$/.test(c)) n = +c.slice(-1) - 1;
    else if (c === 'Digit0' || c === 'Numpad0') n = 9;
    else if (c === 'Minus' || c === 'NumpadSubtract') n = 10;
    else if (c === 'Equal' || c === 'NumpadAdd') n = 11;
    if (n >= 0 && n < N) { this.goTo(EXPERIMENTS[n].id, { enter: true }); this.input._touch(); return; }
    if (e.repeat) return;
    if (c === 'KeyQ') { this._stepStation(-1); this.input._touch(); }
    else if (c === 'KeyE') { this._stepStation(1); this.input._touch(); }
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'ArrowUp' || c === 'Space' || c === 'KeyW') {
      if (this.near >= 0) { this.pending = null; this._enter(EXPERIMENTS[this.near].id); this.idleT = 0; }
    }
  }
  // ekranı tam dolduran yakınlık
  _zFill() { return Math.max(this.view.w / SCR.w, this.view.h / SCR.h) * 1.04; }

  // ---------- güncelleme ----------
  _update(dt) {
    this.time += dt; const T = this.time, m = this.m, inp = this.input, P = inp.pointer;
    const prevX = m.x;
    // giriş/çıkış geçişi
    if (this.zoom) {
      const z = this.zoom; z.t += dt; const u = clamp(z.t / z.dur);
      if (z.dir > 0) {
        if (!z.hold) this.app.setFlash(lin(u, 0.78, 1) * 0.7);
        if (u >= 1 && !z.hold) { z.hold = true; this.app.openExperiment(z.id, {}); }
      } else {
        this.app.setFlash((1 - lin(u, 0, 0.4)) * 0.55);
        if (u >= 1) {
          this.zoom = null;
          if (this.celeb) { this.celeb = false; this.celeT = T; this.parts.confetti(m.x, MY - 170, 22); audio.play('coin'); }
        }
      }
      this.root.classList.toggle('zooming', !!this.zoom && (z.dir > 0 || u < 0.6));
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
    if (near !== this.near) { this.near = near; this.nearT = T; this.strip.querySelectorAll('.qs').forEach((b, i) => b.classList.toggle('here', i === near)); }
    this.chipK += ((near >= 0 && !busy ? 1 : 0) - this.chipK) * (1 - Math.exp(-14 * dt));
    // dokunmatik "GİR" düğmesi (klavye E/Enter ayrı işlenir)
    if (!busy && near >= 0 && inp.pressed('action') && (inp.virt.get('action') || 0) > 0) { this.pending = null; this._enter(EXPERIMENTS[near].id); this.idleT = 0; }
    // işaretçi
    if (!busy && P.pressed && P.inside) this._click(P);
    if (P.dx || P.dy || P.pressed) this.idleT = 0;
    if (Math.abs(m.v) < 1 && !this.target && !busy) this.idleT += dt;
    // parçacıklar
    if (Math.abs(m.v) > 60) { this.dustT -= dt; if (this.dustT <= 0) { this.dustT = 0.16; this.parts.dust(m.x - m.dir * 18, MY, 1, -m.dir); } }
    if (this.idleT > 6) { this.zzT -= dt; if (this.zzT <= 0) { this.zzT = 1.3; this.parts.zz(m.x + 38, MY - 178, 15); } }
    this.parts.update(dt);
    m.ph += Math.min(Math.abs(m.x - prevX), 14) * 0.045;
    // kamera
    if (this.zoom) {
      const z = this.zoom, u = eIO(clamp(z.t / z.dur)), e = z.dir > 0 ? u : 1 - u;
      const fx = this._followX();
      this.cam.z = Math.exp(Math.log(this._zFill()) * e); this.cam.x = lerp(fx, sx(z.i), e); this.cam.y = lerp(300, SCR.y + SCR.h / 2, e);
    } else {
      const fx = this._followX(); this.cam.x += (fx - this.cam.x) * (1 - Math.exp(-6.5 * dt));
      this.cam.z = 1; this.cam.y = 300;
    }
    inp.endFrame();
  }
  _followX() {
    const W = this.view.w, half = W / 2;
    return clamp(this.m.x + this.m.dir * 40, half, WORLD - half);
  }
  _click(P) {
    const c = this.cam, W = this.view.w, H = this.view.h, sc = this.view.scale;
    const wx = c.x + (P.x - W / 2) / c.z, wy = c.y + (P.y - H / 2) / c.z, m = this.m;
    // GİR çipi
    if (this.near >= 0 && this.chipK > 0.6) {
      const sz = this._chipSize(), cx = sx(this.near), cy = this._chipY(sz);
      if (Math.abs(wx - cx) < 40 + sz * 1.4 && Math.abs(wy - cy) < sz * 1.1 + 6) { this._enter(EXPERIMENTS[this.near].id); return; }
    }
    // Mobu'ya tıklama (sürpriz)
    if (Math.abs(wx - m.x) < 52 && wy > MY - 215 && wy < MY + 8) { this.sorpT = this.time; this.hopT = this.time; audio.play('pop'); this.target = null; this.pending = null; this.idleT = 0; return; }
    // istasyon: yürü ve gir
    for (let i = 0; i < N; i++) if (Math.abs(wx - sx(i)) < 108 && wy > 195 && wy < FLOOR + 10) { this.goTo(EXPERIMENTS[i].id, { enter: true }); return; }
    // zemin: sadece yürü
    if (wy > FLOOR) { this.target = { x: clamp(wx, 90, WORLD - 90), id: null, enter: false, speed: clamp(Math.abs(wx - m.x) / 1.4, 420, 1400) }; this.pending = null; this.subEl.classList.add('gone'); }
    void sc;
  }
  // GİR çipi: dokunmatikte ≥44 css px yükseklik
  _chipSize() { const minPx = this.touch.coarse ? 46 : 30; return Math.max(16, minPx / (1.9 * this.view.scale)); }
  _chipY(sz) { return 200 - sz * 0.55; }

  // ---------- çizim ----------
  _render() {
    const g = this.g, view = this.view, T = this.time, c = this.cam;
    if (!view.cssW) return;
    setBoil(T);
    beginFrame(g, view, '#050407');
    const W = view.w, H = view.h;
    this.pt = Math.floor(T * 30) / 30;                       // önizlemeler 30 fps
    g.save();
    g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y);
    const hx = W / 2 / c.z, x0 = c.x - hx - 30, x1 = c.x + hx + 30;
    this._wall(g, x0, x1, T);
    this._shelves(g, x0, x1, T);
    this._floor(g, x0, x1);
    this._lamps(g, x0, x1, T);
    for (let i = 0; i < N; i++) if (sx(i) > x0 - 130 && sx(i) < x1 + 130) this._station(g, i, T);
    this._mobu(g, T);
    this.parts.draw(g);
    this._chip(g, T);
    g.restore();
    // CRT: zoom sırasında tarama çizgileri ve hafif titreşim (ekran uzayı)
    if (this.zoom) {
      const z = this.zoom, e = z.dir > 0 ? eIO(clamp(z.t / z.dur)) : 1 - eIO(clamp(z.t / z.dur)), k = lin(e, 0.35, 1);
      if (k > 0) {
        const st = 3 / view.scale; g.fillStyle = `rgba(0,0,0,${0.16 * k})`;
        for (let y = 0; y < H; y += st) g.fillRect(0, y, W, st * 0.4);
        const by = ((T * 0.9) % 1) * (H + 80) - 40; const bg = g.createLinearGradient(0, by - 40, 0, by + 40);
        bg.addColorStop(0, 'rgba(182,124,255,0)'); bg.addColorStop(0.5, `rgba(182,124,255,${0.12 * k})`); bg.addColorStop(1, 'rgba(182,124,255,0)');
        g.fillStyle = bg; g.fillRect(0, by - 40, W, 80);
      }
    }
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
    for (let k = k0; k <= k1; k++) { const wx = k * 240, X = cx + (wx - cx) * 0.88; g.moveTo(X, 20); g.lineTo(X, FLOOR); }
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
    this._plaque(g, 112, 190);
    this._board(g, X0 + (N - 1) * SP + 150, 190);
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
      const cx = x - 48 + (i % 5) * 24, cy = y - 18 + Math.floor(i / 5) * 26, on = !!st[EXPERIMENTS[i].id];
      g.beginPath(); g.arc(cx, cy, 9, 0, 7);
      if (on) { g.fillStyle = PURPLE; g.fill(); g.strokeStyle = LAV; g.lineWidth = 1.5; g.stroke(); } else { g.strokeStyle = '#3a3050'; g.lineWidth = 1.5; g.setLineDash([2, 2.5]); g.stroke(); g.setLineDash([]); }
    }
  }

  _shelves(g, x0, x1, T) {
    for (let i = 0; i < N - 1; i++) {
      const gx = sx(i) + SP / 2;
      if (gx < x0 - 70 || gx > x1 + 70) continue;
      for (const [by, kinds] of [[262, 'tfT'], [342, 'ftf']]) {
        g.fillStyle = '#2B2B2B'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.roundRect(gx - 50, by, 100, 8, 2); g.fill(); g.stroke();
        g.fillStyle = '#1e1a27'; g.fillRect(gx - 40, by + 8, 7, 16); g.fillRect(gx + 33, by + 8, 7, 16);
        for (let k = 0; k < 3; k++) {
          const ix = gx - 30 + k * 30, kind = kinds[k].toLowerCase(), col = (i + k + (by > 300 ? 1 : 0)) % 2 ? GLOW : PURPLE;
          this._glass(g, ix, by, kind, col, T, i === 5 && by === 262 && k === 0);   // sürpriz: tek tüp kabarcık çıkarır
        }
      }
    }
  }
  _glass(g, x, y, kind, col, T, bubbles) {
    g.save(); g.translate(x, y);
    g.lineWidth = 2.2; g.strokeStyle = 'rgba(233,221,255,.55)'; g.fillStyle = 'rgba(233,221,255,.07)';
    if (kind === 't') {
      g.beginPath(); g.roundRect(-8, -44, 16, 44, [2, 2, 8, 8]); g.fill(); g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(-6.5, -24, 13, 23, [0, 0, 6, 6]); g.fill(); g.globalAlpha = 1;
      if (bubbles) for (let b = 0; b < 3; b++) {
        const u = (T * 0.55 + b / 3) % 1;
        g.fillStyle = `rgba(255,255,255,${0.75 * (1 - u * 0.6)})`; g.beginPath(); g.arc(Math.sin(u * 8 + b * 2) * 2.6, -5 - u * 36, 1.7 + (1 - u) * 0.8, 0, 7); g.fill();
      }
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
    g.strokeStyle = 'rgba(182,124,255,.07)'; g.lineWidth = 1.2; g.beginPath();
    for (const y of [492, 522, 562, 612]) { g.moveTo(x0, y); g.lineTo(x1, y); }
    const cx = this.cam.x; for (let wx = Math.floor(x0 / 100) * 100; wx < x1 + 100; wx += 100) { g.moveTo(wx, FLOOR); g.lineTo(wx + (wx - cx) * 0.4, 640); }
    g.stroke();
  }

  // sürpriz: ara sıra tek bir lamba titrer (12 sn'de bir, ~0.5 sn)
  _lampK(i, T) {
    const ev = Math.floor(T / 12), ph = T - ev * 12;
    if (ph > 0.55 || i !== Math.floor(hash01(ev * 13 + 5) * N)) return 1;
    return Math.sin(ph * 62) > 0.05 ? 1 : 0.22;
  }
  _lamps(g, x0, x1, T) {
    for (let i = 0; i < N; i++) {
      const X = sx(i); if (X < x0 - 160 || X > x1 + 160) continue;
      const fk = this._lampK(i, T), lit = (0.55 + 0.45 * this.glow[i]) * fk;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, 146, 0, FLOOR + 90); gr.addColorStop(0, `rgba(139,61,255,${0.2 * lit})`); gr.addColorStop(1, 'rgba(139,61,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(X - 22, 146); g.lineTo(X + 22, 146); g.lineTo(X + 130, FLOOR + 90); g.lineTo(X - 130, FLOOR + 90); g.closePath(); g.fill();
      g.translate(X, FLOOR + 62); g.scale(1, 0.22);
      const sp = g.createRadialGradient(0, 0, 0, 0, 0, 150); sp.addColorStop(0, `rgba(182,124,255,${0.42 * lit})`); sp.addColorStop(1, 'rgba(182,124,255,0)');
      g.fillStyle = sp; g.fillRect(-150, -150, 300, 300); g.restore();
      g.strokeStyle = '#1B1426'; g.lineWidth = 3; g.beginPath(); g.moveTo(X, 80); g.lineTo(X, 118); g.stroke();
      poly(g, [[X - 11, 118], [X + 11, 118], [X + 26, 146], [X - 26, 146]], '#2B2B2B', 4000 + i * 10, 3);
      g.fillStyle = `rgba(233,221,255,${(0.7 + 0.3 * this.glow[i]) * fk})`; g.beginPath(); g.ellipse(X, 147, 17, 4.5, 0, 0, 7); g.fill();
      glowAt(g, X, 150, 60, '182,124,255', 0.35 * lit);
    }
  }

  _station(g, i, T) {
    const c = EXPERIMENTS[i], X = sx(i), gl = this.glow[i], done = store.hasStamp(c.id);
    const cz = this.cam.z;
    // zemin kabloları: istasyondan iki yana (komşu istasyonun kablosuyla orta noktada buluşur)
    for (const s of [-1, 1]) {
      const pts = () => { g.beginPath(); g.moveTo(X + s * 96, 458); g.bezierCurveTo(X + s * 112, 480, X + s * 122, 470, X + s * 136, 478); g.lineTo(X + s * 150, 478); };
      g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 7; pts(); g.stroke(); g.strokeStyle = '#3b2468'; g.lineWidth = 3.5; pts(); g.stroke();
    }
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
    // monitör gövdesi
    if (gl > 0.02) glowAt(g, X, MON.top + 70, 150, '139,61,255', 0.4 * gl);
    g.fillStyle = '#211a2e'; g.strokeStyle = INK; g.lineWidth = 4.5; g.beginPath(); g.roundRect(X - MON.w / 2, MON.top, MON.w, MON.h, 18); g.fill(); g.stroke();
    g.strokeStyle = gl > 0.3 ? `rgba(182,124,255,${0.3 + 0.5 * gl})` : 'rgba(255,255,255,.07)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(X - MON.w / 2 + 3, MON.top + 3, MON.w - 6, MON.h - 6, 15); g.stroke();
    // ekran
    g.save(); g.translate(X + SCR.x, SCR.y); g.beginPath(); g.roundRect(0, 0, SCR.w, SCR.h, 10); g.clip();
    const f = PREVIEWS[c.id]; if (f) f(g, this.pt + i * 0.37, SCR.w, SCR.h);
    const st = 3 / (this.view.scale * cz); g.fillStyle = 'rgba(0,0,0,.24)';              // CRT tarama çizgileri (ekran pikseli sabit)
    for (let y = st * 0.6; y < SCR.h; y += st) g.fillRect(0, y, SCR.w, st * 0.38);
    if (gl < 0.98) { g.fillStyle = `rgba(0,0,0,${0.22 * (1 - gl)})`; g.fillRect(0, 0, SCR.w, SCR.h); }
    const gg = g.createLinearGradient(0, 0, SCR.w, SCR.h); gg.addColorStop(0, 'rgba(255,255,255,.1)'); gg.addColorStop(0.35, 'rgba(255,255,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, SCR.w, SCR.h);
    if (gl > 0.05) { // vurgulanan istasyonda cam parlaması: tarayan çapraz ışık bandı
      const bx = ((T * 0.42 + i * 0.2) % 1.7 - 0.35) * (SCR.w + 60);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(182,124,255,${0.07 * gl})`; g.fillRect(0, 0, SCR.w, SCR.h);
      const bg = g.createLinearGradient(bx - 26, 0, bx + 26, 0); bg.addColorStop(0, 'rgba(233,221,255,0)'); bg.addColorStop(0.5, `rgba(233,221,255,${0.2 * gl})`); bg.addColorStop(1, 'rgba(233,221,255,0)');
      g.fillStyle = bg; g.beginPath(); g.moveTo(bx - 40, SCR.h); g.lineTo(bx + 12, 0); g.lineTo(bx + 52, 0); g.lineTo(bx, SCR.h); g.closePath(); g.fill(); g.restore();
    }
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(X + SCR.x, SCR.y, SCR.w, SCR.h, 10); g.stroke();
    // alt çerçeve: simetrik iki LED + "DENEY 03" plakası
    const by = MON.top + MON.h - 11, on = ((T * 1.15 + i * 0.37) % 1) < 0.62;
    for (const s of [-1, 1]) {
      g.fillStyle = on ? (gl > 0.4 ? LAV : GLOW) : '#3a3350'; g.beginPath(); g.arc(X + s * 78, by, 3, 0, 7); g.fill();
      if (on) glowAt(g, X + s * 78, by, 12, '182,124,255', 0.5);
    }
    g.fillStyle = '#0d0a12'; g.strokeStyle = '#3a3050'; g.lineWidth = 1.2; g.beginPath(); g.roundRect(X - 31, by - 7, 62, 14, 4); g.fill(); g.stroke();
    txt(g, 'DENEY ' + pad2(c.no), X, by + 0.5, 8.5, '#cfc6e0', 'center', 800);
    // numara rozeti (sol üst) ve tamamlanma ✓ (sağ üst)
    g.save(); g.translate(X - MON.w / 2 + 6, MON.top + 2); g.fillStyle = PURPLE; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(-16, -12, 40, 24, 12); g.fill(); g.stroke();
    txt(g, '#' + pad2(c.no), 4, 0.5, 12, '#fff', 'center', 900); g.restore();
    if (done) {
      g.save(); g.translate(X + MON.w / 2 - 6, MON.top + 2); g.fillStyle = PURPLE; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-5.5, 0.5); g.lineTo(-1.5, 4.5); g.lineTo(6, -4); g.stroke(); g.restore();
    }
  }

  _mobu(g, T) {
    const m = this.m, mo = mk(T, m.x, MY, MS);
    mo.gy = MY; const moving = Math.abs(m.v) > 8 || !!this.target;
    const dir = m.dir || 1;
    if (moving) walk(mo, m.ph, dir, 1, clamp(Math.abs(m.v) / 360, 0.45, 1));
    // bakış: vurgulanan istasyona, yoksa imlece
    let look = null;
    for (let i = 0; i < N; i++) if (this.glow[i] > 0.3) look = clamp((sx(i) - m.x) / 160, -1, 1);
    const P = this.input.pointer, c = this.cam;
    if (look == null && P.inside && P.type === 'mouse') { const wx = c.x + (P.x - this.view.w / 2) / c.z; look = clamp((wx - m.x) / 240, -1, 1); }
    mo.look = look || 0;
    const sorp = T - this.sorpT, cele = T - this.celeT;
    if (sorp < 0.6) { mo.face = 'angry'; landSq(mo, T, this.sorpT, 1.2, 0.5); hop(mo, T, this.sorpT, this.sorpT + 0.3, 26); }
    else if (sorp < 2.1) { mo.face = 'proud'; mo.armR = ARM_HIP; mo.armL = ARM_HIP; hop(mo, T, this.sorpT + 0.6, this.sorpT + 0.9, 14); }
    else if (cele >= 0 && cele < 1.7) {   // damgayla dönünce tek seferlik kutlama
      mo.face = 'star'; mo.armR = ARM_UPS; mo.armL = ARM_UPS;
      hop(mo, T, this.celeT, this.celeT + 0.4, 34); hop(mo, T, this.celeT + 0.5, this.celeT + 0.9, 24); landSq(mo, T, this.celeT + 0.9, 0.7, 0.2);
    }
    else if (this.idleT > 6) { mo.face = 'closed'; mo.rot = (mo.rot || 0) + Math.sin(T * 1.2) * 0.02; mo.smile = 0.4; }
    else if (this.near >= 0 && !moving) {
      mo.face = 'o';
      const ph = (T - this.nearT - 0.5) % 1.9; if (ph > 0 && ph < 0.3) hop(mo, ph, 0, 0.3, 6);     // meraklı küçük sekme
    }
    else if (this.zoom && this.zoom.dir < 0 && this.zoom.t < 0.8) mo.face = 'happy';
    if (T - this.hopT < 0.36 && sorp > 0.6) { hop(mo, T, this.hopT, this.hopT + 0.36, 20); landSq(mo, T, this.hopT + 0.36, 0.7, 0.2); }
    drawMobu(g, mo);
  }

  _chip(g, T) {
    if (this.chipK < 0.02 || this.near < 0) return;
    const X = sx(this.near), k = clamp(this.chipK), s = eBack(k), sz = this._chipSize();
    g.save(); g.translate(X, this._chipY(sz) - (1 - k) * 8); g.scale(s, s);
    chip(g, 'GİR', 0, 0, true, sz);
    g.restore();
    void T;
  }
}
