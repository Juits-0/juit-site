// touch.js — sanal joystick + düğmeler (DOM, pointer events). Input'a yazar.
// Sadece (pointer:coarse) cihazlarda ya da ilk dokunmada görünür.

export class TouchControls {
  constructor(host, input) {
    this.host = host; this.input = input;
    this.root = document.createElement('div'); this.root.className = 'tc';
    host.appendChild(this.root);
    this.coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
    this._ac = new AbortController();
    window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !this.coarse) { this.coarse = true; this._vis(); } }, { signal: this._ac.signal, capture: true });
    this.joy = null; this.btns = [];
  }
  _vis() { this.root.classList.toggle('on', this.coarse && this.has); }
  // controls: {joystick:true|'horizontal'|false, buttons:[{name,label}]}
  configure(c = {}) {
    this.root.innerHTML = ''; this.joy = null; this.btns = [];
    this.has = !!(c.joystick || (c.buttons && c.buttons.length));
    if (c.joystick) this._mkJoy(c.joystick === 'horizontal');
    if (c.buttons && c.buttons.length) {
      const wrap = document.createElement('div'); wrap.className = 'tc-btns';
      c.buttons.forEach((b, i) => {
        const el = document.createElement('button'); el.type = 'button'; el.className = 'tc-btn'; el.textContent = b.label || b.name; el.setAttribute('aria-label', b.label || b.name);
        el.style.setProperty('--i', i); this._mkBtn(el, b.name); wrap.appendChild(el); this.btns.push(el);
      });
      this.root.appendChild(wrap);
    }
    this._vis();
  }
  _mkBtn(el, name) {
    const o = { signal: this._ac.signal }; let id = null;
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (id !== null) return; id = e.pointerId; el.setPointerCapture(id); el.classList.add('down'); this.input.setVirtual(name, true); }, o);
    const up = e => { if (e.pointerId !== id) return; id = null; el.classList.remove('down'); this.input.setVirtual(name, false); };
    el.addEventListener('pointerup', up, o); el.addEventListener('pointercancel', up, o);
    el.addEventListener('contextmenu', e => e.preventDefault(), o);
  }
  _mkJoy(horizontal) {
    const base = document.createElement('div'); base.className = 'tc-joy' + (horizontal ? ' h' : '');
    const knob = document.createElement('div'); knob.className = 'tc-knob'; base.appendChild(knob);
    this.root.appendChild(base); this.joy = base;
    const R = 46, o = { signal: this._ac.signal }; let id = null;
    const set = e => {
      const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = horizontal ? 0 : e.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      let vx = dx / R, vy = dy / R; if (Math.abs(vx) < 0.18) vx = 0; if (Math.abs(vy) < 0.18) vy = 0;
      this.input.setJoy(vx, vy);
    };
    base.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (id !== null) return; id = e.pointerId; base.setPointerCapture(id); base.classList.add('down'); this.input._touch(); set(e); }, o);
    base.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); }, o);
    const up = e => { if (e.pointerId !== id) return; id = null; base.classList.remove('down'); knob.style.transform = ''; this.input.setJoy(0, 0); };
    base.addEventListener('pointerup', up, o); base.addEventListener('pointercancel', up, o);
  }
  destroy() { this._ac.abort(); this.input.setJoy(0, 0); this.root.remove(); }
}
