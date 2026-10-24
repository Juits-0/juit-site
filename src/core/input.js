// input.js — klavye + fare/dokunma + sanal kontroller için tek giriş katmanı.
// Runner her SABİT ADIMDAN sonra endFrame() çağırır; pressed/released/delta değerleri bir adım yaşar.

const KEYS = {
  jump: ['Space', 'KeyW', 'ArrowUp'],
  action: ['KeyE', 'Enter'],
  slow: ['ShiftLeft', 'ShiftRight'],
  reset: ['KeyR'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
};
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const CODE2NAMES = {};
for (const n in KEYS) for (const c of KEYS[n]) (CODE2NAMES[c] = CODE2NAMES[c] || []).push(n);

export class Input {
  constructor() {
    this.codes = new Set();         // basılı tuş kodları
    this.virt = new Map();          // sanal düğmeler: ad → sayı (kaç parmak basıyor)
    this.joy = { x: 0, y: 0 };      // sanal joystick
    this._p = new Set(); this._r = new Set();   // bu adımın pressed / released adları
    this.pointer = { x: -999, y: -999, cx: 0, cy: 0, down: false, pressed: false, released: false, dx: 0, dy: 0, wheel: 0, pinch: 1, inside: false, type: 'mouse' };
    this.view = null; this.el = null; this.enabled = true; this.onFirst = null; this._first = false;
    this._pts = new Map(); this._pinchD = 0;
    this._ac = new AbortController();
    this._bind();
  }
  // ---- sorgular ----
  get axis() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0), y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    x += this.joy.x; y += this.joy.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  held(name) {
    if ((this.virt.get(name) || 0) > 0) return true;
    const ks = KEYS[name]; if (!ks) return false;
    for (const c of ks) if (this.codes.has(c)) return true;
    return false;
  }
  pressed(name) { return this._p.has(name); }
  released(name) { return this._r.has(name); }
  // ---- sanal giriş (touch.js kullanır) ----
  setVirtual(name, on) {
    const v = this.virt.get(name) || 0;
    if (on) { this.virt.set(name, v + 1); if (v === 0) this._p.add(name); this._touch(); }
    else if (v > 0) { this.virt.set(name, v - 1); if (v === 1) this._r.add(name); }
  }
  setJoy(x, y) { this.joy.x = x; this.joy.y = y; }
  // ---- bağlama ----
  attach(el, view) { this.el = el; this.view = view; el.style.touchAction = 'none'; this._bindEl(); }
  setView(view) { this.view = view; }
  _touch() { if (!this._first) { this._first = true; this.onFirst && this.onFirst(); } }
  _bind() {
    const o = { signal: this._ac.signal };
    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      // odaktaki düğme/bağlantıda Boşluk ve Enter arayüze aittir (klavyeyle düğme kullanımı bozulmasın); yön tuşları oyuna gider
      if (t && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && t.closest && t.closest('button, a[href], [role="button"], [role="switch"], [role="tab"], summary')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this._touch();
      if (!this.codes.has(e.code)) { this.codes.add(e.code); for (const n of CODE2NAMES[e.code] || []) this._p.add(n); }
    }, o);
    window.addEventListener('keyup', e => {
      if (!this.codes.has(e.code)) return;
      this.codes.delete(e.code); for (const n of CODE2NAMES[e.code] || []) if (!this.held(n)) this._r.add(n);
    }, o);
    window.addEventListener('blur', () => { this.codes.clear(); this.virt.clear(); this.joy.x = this.joy.y = 0; this.pointer.down = false; }, o);
  }
  _bindEl() {
    const el = this.el, o = { signal: this._ac.signal }, P = this.pointer;
    const upd = e => {
      const r = el.getBoundingClientRect(); P.cx = e.clientX - r.left; P.cy = e.clientY - r.top;
      const v = this.view; if (v) { P.x = (P.cx - v.ox) / v.scale; P.y = (P.cy - v.oy) / v.scale; P.inside = P.x >= 0 && P.x <= v.w && P.y >= 0 && P.y <= v.h; }
    };
    el.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      upd(e); P.type = e.pointerType; P.down = true; P.pressed = true; this._touch();
      this._pts.set(e.pointerId, [e.clientX, e.clientY]); if (this._pts.size === 2) this._pinchD = this._dist();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* yoksay */ }
    }, o);
    el.addEventListener('pointermove', e => {
      const ox = P.cx, oy = P.cy; upd(e); P.type = e.pointerType;
      if (this._pts.size <= 1) { P.dx += P.cx - ox; P.dy += P.cy - oy; }
      if (this._pts.has(e.pointerId)) {
        this._pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (this._pts.size === 2) { const d = this._dist(); if (this._pinchD > 0) P.pinch *= d / this._pinchD; this._pinchD = d; }
      }
    }, o);
    const up = e => { upd(e); if (this._pts.delete(e.pointerId) && this._pts.size === 0) { P.down = false; P.released = true; } this._pinchD = 0; };
    el.addEventListener('pointerup', up, o); el.addEventListener('pointercancel', up, o);
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') P.inside = false; }, o);
    el.addEventListener('wheel', e => { P.wheel += e.deltaY; e.preventDefault(); }, { passive: false, signal: this._ac.signal });
    el.addEventListener('contextmenu', e => e.preventDefault(), o);
  }
  _dist() { const a = [...this._pts.values()]; return a.length < 2 ? 0 : Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); }
  // her sabit adımdan sonra: tek-adımlık değerleri sıfırla
  endFrame() {
    this._p.clear(); this._r.clear();
    const P = this.pointer; P.pressed = false; P.released = false; P.dx = 0; P.dy = 0; P.wheel = 0; P.pinch = 1;
  }
  dispose() { this._ac.abort(); }
}
