// runner.js — deney ekranını kurar ve çalıştırır (döngü, boyutlandırma, ayar paneli, HUD, kartlar).
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { audio } from './audio.js';
import { store } from './store.js';
import { computeView, sizeCanvas, beginFrame } from './view.js';
import { hash } from './math.js';
import { EXPERIMENTS } from '../config/experiments.js';

const STEP = 1 / 120;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = n => String(n).padStart(2, '0');

export class Runner {
  // root: #exp elementi. app: {goLab(), goExperiment(id)}
  constructor(root, app) { this.root = root; this.app = app; this.exp = null; this.raf = 0; }

  async start(cfg, Cls) {
    this.stop();
    this.cfg = cfg; this.Cls = Cls;
    this.reduced = store.get('reduced', null);
    if (this.reduced == null) this.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.tech = !!store.get('tech', false);
    this._build();
    this._create();
    this.last = 0; this.acc = 0; this.shakePx = 0; this.flashA = 0; this.interacted = false;
    this.raf = requestAnimationFrame(this._frame);
  }

  stop() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.exp) { try { this.exp.dispose(); } catch (e) { console.error(e); } this.exp = null; }
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    if (this.input) { this.input.dispose(); this.input = null; }
    if (this.touch) { this.touch.destroy(); this.touch = null; }
    clearTimeout(this._toastT); clearTimeout(this._goalT);
    this.root.innerHTML = '';
    if (window.__exp) window.__exp = null;
  }

  // ---------- DOM ----------
  _build() {
    const c = this.cfg, Cls = this.Cls;
    const nextCfg = EXPERIMENTS.find(e => e.no === c.no + 1);
    this.nextCfg = nextCfg;
    this.root.innerHTML = `
      <header class="exp-top">
        <button class="btn btn-back" type="button" data-a="back" aria-label="Laboratuvara dön">←<span class="hide-s"> Laboratuvar</span></button>
        <h1 class="exp-title"><span class="exp-no">#${pad2(c.no)}</span><span class="exp-title-t">${esc(c.title)}</span></h1>
        <div class="exp-tools">
          <button class="btn btn-video" type="button" data-a="video" ${c.video ? '' : 'disabled title="Bağlantı eklenecek"'}>🎬<span class="hide-s"> Video</span></button>
          <button class="btn btn-icon" type="button" data-a="sound" aria-label="Ses" title="Ses"></button>
          <button class="btn btn-icon" type="button" data-a="help" aria-label="Bu deney nedir?" title="Bu deney nedir?">?</button>
        </div>
      </header>
      <div class="exp-main">
        <div class="exp-stage">
          <div class="exp-view"></div>
          <div class="exp-goal"><span class="goal-k">AMAÇ</span><span class="goal-t"></span><span class="goal-hint"></span></div>
          <div class="exp-hud"><div class="hud-l"></div><div class="hud-r"></div></div>
          <div class="exp-toast" role="status" aria-live="polite"></div>
          <div class="exp-flash"></div>
          <div class="exp-help" hidden></div>
          <div class="exp-card" hidden></div>
        </div>
        <div class="exp-quick"></div>
        <section class="exp-panel" aria-label="Ayarlar">
          <button class="panel-head" type="button" data-a="sheet" aria-expanded="false"><span>Ayarlar</span><i aria-hidden="true">▲</i></button>
          <div class="panel-body"></div>
        </section>
      </div>`;
    const q = s => this.root.querySelector(s);
    this.el = { view: q('.exp-view'), stage: q('.exp-stage'), goal: q('.exp-goal'), goalT: q('.goal-t'), goalH: q('.goal-hint'), hudL: q('.hud-l'), hudR: q('.hud-r'), toast: q('.exp-toast'), flash: q('.exp-flash'), help: q('.exp-help'), card: q('.exp-card'), panel: q('.exp-panel'), pbody: q('.panel-body'), quick: q('.exp-quick'), sound: q('[data-a=sound]'), video: q('[data-a=video]') };
    this.el.goalT.textContent = c.goal;
    this._soundUI();
    this._buildPanel(Cls.settings || []);
    this.root.addEventListener('click', this._onClick = e => {
      const b = e.target.closest('[data-a]'); if (!b || !this.root.contains(b)) return;
      const a = b.dataset.a;
      if (a === 'back') this.app.goLab();
      else if (a === 'video' && this.cfg.video) window.open(this.cfg.video, '_blank', 'noopener');
      else if (a === 'sound') { audio.enabled = !audio.enabled; this._soundUI(); if (audio.enabled) audio.play('click'); }
      else if (a === 'help') this._toggleHelp();
      else if (a === 'sheet') { const o = this.el.panel.classList.toggle('open'); b.setAttribute('aria-expanded', o); }
      else if (a === 'restart') this.restart();
      else if (a === 'again') this.restart();
      else if (a === 'next' && this.nextCfg) this.app.goExperiment(this.nextCfg.id);
      else if (a === 'closehelp') this._toggleHelp(false);
      b.blur && b.blur();     // odak düğmede kalıp Boşluk/Enter'ı yutmasın
    });
  }

  _soundUI() { const b = this.el.sound; b.textContent = audio.enabled ? '🔊' : '🔇'; b.setAttribute('aria-pressed', audio.enabled ? 'true' : 'false'); }

  _buildPanel(settings) {
    const groups = new Map();
    for (const s of settings) { const g = s.group || 'Ayarlar'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
    // yerleşik grup
    groups.set('Görünüm', [
      { key: '__tech', label: 'Teknik görünüm', type: 'toggle', builtin: true },
      { key: '__reduced', label: 'Hareketi azalt', type: 'toggle', builtin: true },
      { key: '__restart', label: 'Yeniden başlat', type: 'button', builtin: true },
    ]);
    this.ctrls = [];
    const body = this.el.pbody; body.innerHTML = '';
    for (const [name, list] of groups) {
      const sec = document.createElement('div'); sec.className = 'pgroup';
      sec.innerHTML = `<h3>${esc(name)}</h3>`;
      for (const s of list) sec.appendChild(this._mkCtrl(s));
      body.appendChild(sec);
    }
    // mobil hızlı çipler: ilk 2 anahtar (kullanıcı ayarlarından)
    const q = settings.filter(s => s.type === 'toggle').slice(0, 2);
    this.el.quick.innerHTML = '';
    for (const s of q) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qchip'; b.textContent = s.label; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { this._set(s.key, !this.settingsState[s.key]); b.blur(); });
      this.el.quick.appendChild(b); this.ctrls.push({ key: s.key, quick: b, type: 'toggle', s });
    }
    this.el.quick.hidden = !q.length;
  }

  _mkCtrl(s) {
    const row = document.createElement('div'); row.className = 'set set-' + s.type;
    const id = 'c_' + s.key;
    if (s.type === 'toggle') {
      row.innerHTML = `<span class="lbl">${esc(s.label)}</span><button type="button" role="switch" class="sw" aria-checked="false" aria-label="${esc(s.label)}"><i></i></button>`;
      const b = row.querySelector('button');
      b.addEventListener('click', () => { this._setCtrl(s, !this._getCtrl(s)); b.blur(); });
      this.ctrls.push({ key: s.key, type: 'toggle', sw: b, s });
    } else if (s.type === 'range') {
      row.innerHTML = `<label class="lbl" for="${id}">${esc(s.label)}</label><input id="${id}" type="range" min="${s.min}" max="${s.max}" step="${s.step || 1}"><output></output>`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      inp.addEventListener('input', () => this._setCtrl(s, Number(inp.value)));
      inp.addEventListener('pointerup', () => inp.blur());
      this.ctrls.push({ key: s.key, type: 'range', inp, out, s });
    } else if (s.type === 'select') {
      row.innerHTML = `<span class="lbl">${esc(s.label)}</span><div class="seg" role="group"></div>`;
      const seg = row.querySelector('.seg'), btns = [];
      for (const o of s.options || []) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label || o.value; b.dataset.v = o.value;
        b.addEventListener('click', () => { this._setCtrl(s, o.value); b.blur(); }); seg.appendChild(b); btns.push(b);
      }
      this.ctrls.push({ key: s.key, type: 'select', btns, s });
    } else if (s.type === 'button') {
      row.innerHTML = `<button type="button" class="btn btn-set">${esc(s.label)}</button>`;
      const b = row.querySelector('button');
      b.addEventListener('click', () => { if (s.builtin) this.restart(); else this.exp && this.exp.onSetting(s.key); b.blur(); });
    }
    return row;
  }
  _getCtrl(s) {
    if (s.key === '__tech') return this.tech;
    if (s.key === '__reduced') return this.reduced;
    return this.settingsState[s.key];
  }
  _setCtrl(s, v) {
    if (s.key === '__tech') { this.tech = v; store.set('tech', v); if (this.exp) { this.exp.tech = v; this.exp.onTech(v); } this._sync(); }
    else if (s.key === '__reduced') { this.reduced = v; store.set('reduced', v); if (this.exp) this.exp.reduced = v; this._sync(); }
    else this._set(s.key, v);
  }
  _set(key, value) {
    this.settingsState[key] = value;
    if (this.exp) { this.exp.s[key] = value; this.exp.onSetting(key, value); }
    this._sync();
  }
  setSetting(key, value) { this._set(key, value); }
  // kontrolleri mevcut duruma göre güncelle
  _sync() {
    for (const c of this.ctrls) {
      const s = c.s;
      if (c.type === 'toggle') { const v = !!this._getCtrl(s); if (c.sw) c.sw.setAttribute('aria-checked', v); if (c.quick) c.quick.setAttribute('aria-pressed', v); }
      else if (c.type === 'range') { const v = this.settingsState[s.key]; c.inp.value = v; c.out.textContent = v + (s.unit ? ' ' + s.unit : ''); const p = (v - s.min) / ((s.max - s.min) || 1) * 100; c.inp.style.setProperty('--p', p + '%'); }
      else if (c.type === 'select') { const v = this.settingsState[s.key]; c.btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v) === String(v))); }
    }
  }

  // ---------- deneyi oluştur ----------
  _create() {
    const Cls = this.Cls;
    this.settingsState = {};
    for (const s of Cls.settings || []) if (s.type !== 'button') this.settingsState[s.key] = s.value;
    this.input = new Input();
    const kind = Cls.kind || '2d';
    let cv = null;
    if (kind === '2d') { cv = document.createElement('canvas'); cv.className = 'exp-cv'; this.el.view.appendChild(cv); this.cv = cv; this.g = cv.getContext('2d'); }
    else { this.cv = null; this.g = null; this.container = document.createElement('div'); this.container.className = 'exp-dom'; this.el.view.appendChild(this.container); }
    const host = this.el.view;
    this.view = computeView(host.clientWidth, host.clientHeight);
    if (cv) sizeCanvas(cv, this.view);
    this.input.attach(this.el.view, this.view);
    this.input.onFirst = () => this._firstInteraction();
    this.touch = new TouchControls(this.el.stage, this.input);
    const ctl = Cls.controls || {};
    this.touch.configure(ctl);
    this.el.goalH.textContent = (this.touch.coarse && ctl.hintTouch) ? ctl.hintTouch : (ctl.hint || '');
    this.el.goalH.hidden = !this.el.goalH.textContent;

    this.exp = new Cls({
      view: this.view, s: this.settingsState, tech: this.tech, reduced: this.reduced, input: this.input, audio, store,
      cfg: this.cfg, container: this.container || null, _rt: this,
    });
    window.__exp = this.exp;      // geliştirme/test kolaylığı
    this.exp.init();
    this._sync();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(host);
  }

  _resize() {
    if (!this.exp) return;
    const host = this.el.view;
    this.view = computeView(host.clientWidth, host.clientHeight);
    if (this.cv) sizeCanvas(this.cv, this.view);
    this.input.setView(this.view);
    this.exp.view = this.view;
    this.exp.resize(this.view);
  }

  restart() {
    if (!this.exp) return;
    this.el.card.hidden = true; this.el.card.innerHTML = '';
    this.exp.completed = false; this.exp.time = 0; this.exp.frame = 0;
    this.exp.reset();
    this.hud(null);
  }

  // ---------- döngü ----------
  _frame = ts => {
    this.raf = requestAnimationFrame(this._frame);
    if (!this.exp) return;
    if (document.hidden || !this.last) { this.last = ts; return; }
    const dt = Math.min((ts - this.last) / 1000, 1 / 30); this.last = ts;
    this.acc += dt; let n = 0;
    while (this.acc >= STEP && n < 4) { this._step(); this.acc -= STEP; n++; }
    if (n >= 4) this.acc = 0;
    // sarsıntı / flaş sönümü
    this.shakePx *= Math.pow(0.0005, dt); if (this.shakePx < 0.2) this.shakePx = 0;
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - dt * 2.2); this.el.flash.style.opacity = this.flashA; }
    this._render();
  };
  _step() {
    const e = this.exp;
    if (this.input.pressed('reset')) this.restart();
    e.time += STEP; e.frame++;
    e.update(STEP);
    this.input.endFrame();
  }
  _render() {
    const e = this.exp; if (!this.g) return;
    const g = this.g; beginFrame(g, this.view);
    if (this.shakePx > 0 && !this.reduced) { const f = Math.floor(e.time * 60); g.translate(hash(f) * this.shakePx, hash(f + 7) * this.shakePx); }
    e.render(g);
    g.restore();
  }

  _firstInteraction() {
    if (this.interacted) return; this.interacted = true;
    this._goalT = setTimeout(() => this.el.goal.classList.add('mini'), 3000);
  }

  // ---------- deneyin çağırdığı hizmetler ----------
  shake(px) { this.shakePx = Math.max(this.shakePx, px); }
  flash(a) { this.flashA = Math.max(this.flashA, a); this.el.flash.style.opacity = this.flashA; }
  setGoal(text) { this.el.goalT.textContent = text; this.el.goal.classList.remove('mini'); clearTimeout(this._goalT); this._goalT = setTimeout(() => this.el.goal.classList.add('mini'), 3000); }
  toast(text, ms = 1800) {
    const t = this.el.toast; t.textContent = text; t.classList.add('on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('on'), ms);
  }
  hud(o) {
    const key = JSON.stringify(o || null); if (key === this._hudKey) return; this._hudKey = key;
    const fill = (el, arr) => { el.innerHTML = (arr || []).map(s => `<div>${esc(s)}</div>`).join(''); };
    fill(this.el.hudL, o && o.left); fill(this.el.hudR, o && o.right);
  }
  _toggleHelp(force) {
    const h = this.el.help, show = force == null ? h.hidden : force;
    if (show) {
      const ctl = this.Cls.controls || {};
      h.innerHTML = `<div class="help-box"><h2>${esc(this.cfg.title)}</h2><p class="help-goal"><b>Amaç:</b> ${esc(this.cfg.goal)}</p>${ctl.hint ? `<p class="help-hint">${esc(ctl.hint)}</p>` : ''}<p>${esc(this.cfg.lesson)}</p><button class="btn btn-primary" type="button" data-a="closehelp">Tamam</button></div>`;
    }
    h.hidden = !show;
  }
  complete(o = {}) {
    const c = this.cfg, isNew = store.stamp(c.id);
    const card = this.el.card;
    const text = o.text || c.lesson;
    card.innerHTML = `<div class="card-box">
      <div class="card-stamp${isNew ? ' new' : ''}" aria-hidden="true"><span>#${pad2(c.no)}</span><b>${esc(c.short)}</b></div>
      <h2>${esc(o.title || 'Tamamlandı!')}</h2>
      <p>${esc(text)}</p>
      <p class="card-note">${isNew ? 'Hatıra damgası kazandın.' : 'Bu damga zaten sende.'}</p>
      <div class="card-btns">
        <button class="btn btn-primary" type="button" data-a="again">Tekrar</button>
        <button class="btn" type="button" data-a="back">Laboratuvar</button>
        ${this.nextCfg ? '<button class="btn btn-primary" type="button" data-a="next">Sıradaki deney →</button>' : ''}
        <button class="btn" type="button" data-a="video" ${c.video ? '' : 'disabled title="Bağlantı eklenecek"'}>🎬 Video</button>
      </div></div>`;
    card.hidden = false;
  }
}
