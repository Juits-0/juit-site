// experiment.js — tüm deneylerin temel sınıfı. Ayrıntılı sözleşme: src/core/API.md
export class Experiment {
  static id = 'x';
  static kind = '2d';        // '2d' → render(g) canvas'a çizer; 'dom' → this.container (div) verilir, deney kendi canvas/WebGL'ini kurar
  static controls = { joystick: true, buttons: [], pointer: null, hint: '' };
  static settings = [];      // {key,label,type:'toggle'|'range'|'select'|'button',value,min,max,step,unit,options,group}

  // runner yeni örneği {view, s, tech, input, audio, store, reduced, cfg, container, _rt} ile oluşturur
  constructor(o = {}) {
    Object.assign(this, o);
    this.time = 0; this.frame = 0; this.completed = false;
    this.camera = { x: 0, y: 0, z: 1 };
  }
  // ---- deneyin dolduracağı kancalar ----
  init() {}
  reset() {}
  update(dt) {}
  render(g) {}
  onSetting(key, value) {}
  onTech(on) {}
  resize(view) {}
  dispose() {}

  // ---- runner'ın sağladığı yardımcılar ----
  complete(o = {}) { if (this.completed) return; this.completed = true; this._rt && this._rt.complete(o); }
  toast(text, ms = 1800) { this._rt && this._rt.toast(text, ms); }
  hud(o) { this._rt && this._rt.hud(o); }
  setGoal(text) { this._rt && this._rt.setGoal(text); }
  shake(px = 6) { if (!this.reduced && this._rt) this._rt.shake(px); }
  flash(alpha = 0.3) { if (!this.reduced && this._rt) this._rt.flash(alpha); }
  // ayarı koddan değiştir (panel güncellenir, onSetting çağrılır)
  setSetting(key, value) { this._rt && this._rt.setSetting(key, value); }
  // ---- kamera ----
  // dünya → mantıksal ekran koordinatı
  worldToView(x, y) { const c = this.camera; return [this.view.w / 2 + (x - c.x) * c.z, this.view.h / 2 + (y - c.y) * c.z]; }
  // mantıksal ekran → dünya (fare/dokunma için)
  viewToWorld(x, y) { const c = this.camera; return [c.x + (x - this.view.w / 2) / c.z, c.y + (y - this.view.h / 2) / c.z]; }
  // render içinde g.save() sonrası çağır: dünya çizimi için kamerayı uygular
  applyCamera(g) { const c = this.camera; g.translate(this.view.w / 2, this.view.h / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y); }
}
