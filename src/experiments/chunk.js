// chunk.js — #05 "Sonsuz oyun dünyaları bilgisayarını neden patlatmıyor?" (chunk sistemi)
// Dünya sonsuz ve deterministik; bellekte sadece Mobu'ya yakın parçalar (chunk) tutulur.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eIn, eBack } from '../core/math.js';
import { PURPLE, GLOW, LAV, RED, setBoil } from '../core/ink.js';
import { mk, walk, drawMobu } from '../core/mobu.js';
import { Particles } from '../core/fx.js';
import { txt } from '../core/ui.js';

const TS = 24, CN = 8, CS = TS * CN;           // karo, chunk (karo), chunk (px)
const S = 0.3;                                  // Mobu ölçeği
const SPEED = 200, WATER_SPEED = 120;
const LOAD_T = 0.25, UNLOAD_T = 0.3;
const RMAX = 4, FULL = (2 * RMAX + 1) ** 2;     // bellek çubuğu: radius 4 → 81 chunk
const SPAWN_T = 4;                              // başlangıç karosu (chunk 0,0 içinde)
const DEEP = 0, WATER = 1, SAND = 2, GRASS = 3, DGRASS = 4, TREE = 5, ROCK = 6;
const COL = ['#0b1a33', '#102a4d', '#5b5169', '#17372f', '#10292a', '#17372f', '#10292a'];

// ---- deterministik gürültü ----
function hI(a, b, s) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hI(ix, iy, s), b = hI(ix + 1, iy, s), c = hI(ix, iy + 1, s), d = hI(ix + 1, iy + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function tileAt(tx, ty) {
  if (Math.abs(tx - SPAWN_T) <= 3 && Math.abs(ty - SPAWN_T) <= 3) return GRASS;     // başlangıç alanı temiz
  const n = 0.65 * vn(tx / 9, ty / 9, 11) + 0.35 * vn(tx / 3.5 + 40, ty / 3.5 + 40, 23);
  if (n < 0.36) return DEEP;
  if (n < 0.43) return WATER;
  if (n < 0.47) return SAND;
  const h = hI(tx, ty, 77);
  if (n < 0.6) return h > 0.9 ? TREE : GRASS;
  if (n > 0.7 && h > 0.8) return ROCK;
  return h > 0.86 ? TREE : (h > 0.97 ? ROCK : DGRASS);
}
const solid = k => k === TREE || k === ROCK;
const wet = k => k === DEEP || k === WATER;
const fl = Math.floor;

export default class Chunk extends Experiment {
  static id = 'chunk';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: null,
    hint: 'WASD ya da oklar: dolaş',
    hintTouch: 'Joystick: dolaş',
  };
  static settings = [
    { key: 'radius', label: 'Yükleme yarıçapı', type: 'range', value: 2, min: 1, max: 4, step: 1, unit: 'chunk', group: 'Chunk' },
    { key: 'showBorders', label: 'Chunk sınırları', type: 'toggle', value: false, group: 'Chunk' },
    { key: 'showStates', label: 'Yükleme/boşaltmayı göster', type: 'toggle', value: true, group: 'Chunk' },
    { key: 'r1', label: 'Yarıçap 1', type: 'button', group: 'Karşılaştır' },
    { key: 'r4', label: 'Yarıçap 4', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(160);
    this.map = new Map();
    this.fpsBuf = []; this.lastNow = 0; this.fps = 0;
    this.reset();
  }

  reset() {
    this.parts.clear(); this.map.clear();
    this.x = SPAWN_T * TS + TS / 2; this.y = SPAWN_T * TS + TS / 2;
    this.dir = 1; this.phase = 0; this.moving = false; this.inWater = false;
    this.loads = 0; this.unloads = 0; this.maxDist = 0; this.drawn = 0;
    this.mcx = null; this.mcy = null; this.dirty = true; this.happyT = -9; this.toldUnload = false;
    this.camera.x = this.x; this.camera.y = this.y - 40; this.camera.z = this.tech ? 0.55 : 1;
    this._manage(this.time, true);
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'r1') { this.setSetting('radius', 1); return; }
    if (key === 'r4') { this.setSetting('radius', 4); return; }
    if (!this.map) return;
    if (key === 'radius') this.dirty = true;
    if (key === 'showStates' && !this.s.showStates) {          // anında moda geç: bekleyenleri bitir
      for (const [k, c] of this.map) {
        if (c.state === 'loading') c.state = 'active';
        else if (c.state === 'unloading') { this.map.delete(k); this.unloads++; }
      }
    }
  }
  onTech() { /* kamera uzaklaşması update içinde yumuşak */ }

  // ---------------- chunk yöneticisi (gerçek) ----------------
  _make(cx, cy, T, instant) {
    const cv = document.createElement('canvas'); cv.width = cv.height = CS + 1;
    const g = cv.getContext('2d'), objs = [];
    for (let j = 0; j <= CN; j++) for (let i = 0; i <= CN; i++) {
      const tx = cx * CN + i, ty = cy * CN + j, k = tileAt(tx, ty), edge = i === CN || j === CN;
      const w = edge ? 1 : TS, h = edge ? 1 : TS;
      if (edge && i === CN && j === CN) { g.fillStyle = COL[k]; g.fillRect(CS, CS, 1, 1); continue; }
      const px = i * TS, py = j * TS, hv = hI(tx, ty, 5);
      g.fillStyle = COL[k]; g.fillRect(px, py, i === CN ? 1 : TS, j === CN ? 1 : TS);
      if (edge) continue;
      // hafif karo tonu
      g.fillStyle = hv > 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.08)'; g.fillRect(px, py, w, h);
      const k2 = hI(tx, ty, 9), k3 = hI(tx, ty, 13);
      if (k === GRASS || k === DGRASS || k === TREE || k === ROCK) {
        g.fillStyle = 'rgba(8,20,18,.55)';
        g.fillRect(px + 4 + k2 * 10, py + 5 + k3 * 8, 2, 4); g.fillRect(px + 13 + k3 * 6, py + 13 + k2 * 6, 2, 3);
      } else if (k === WATER || k === DEEP) {
        g.fillStyle = k === WATER ? 'rgba(70,110,190,.16)' : 'rgba(60,90,170,.10)';
        g.fillRect(px + 3 + k2 * 8, py + 8 + k3 * 6, 9, 1.5);
      } else if (k === SAND) {
        g.fillStyle = 'rgba(30,24,40,.35)'; g.fillRect(px + 4 + k2 * 12, py + 4 + k3 * 12, 2, 2); g.fillRect(px + 14 - k3 * 8, py + 15 + k2 * 4, 2, 2);
      }
      if (solid(k)) objs.push({ k, x: px + TS / 2, y: py + TS - 2, row: j, s: hv, wx: cx * CS + px + TS / 2, wy: cy * CS + py + TS - 2 });
    }
    this.loads++;
    return { cx, cy, cv, objs, state: instant ? 'active' : 'loading', t0: instant ? -9 : T };
  }

  _manage(T, instant = false) {
    const mcx = fl(this.x / CS), mcy = fl(this.y / CS), r = this.s.radius, st = this.s.showStates && !instant;
    if (!this.dirty && mcx === this.mcx && mcy === this.mcy) return;
    this.mcx = mcx; this.mcy = mcy; this.dirty = false;
    this.maxDist = Math.max(this.maxDist, Math.max(Math.abs(mcx), Math.abs(mcy)));
    for (let cy = mcy - r; cy <= mcy + r; cy++) for (let cx = mcx - r; cx <= mcx + r; cx++) {
      const key = cx + ',' + cy, c = this.map.get(key);
      if (!c) this.map.set(key, this._make(cx, cy, T, !st));
      else if (c.state === 'unloading') { c.state = 'active'; c.t0 = T; }       // geri döndü: boşaltma iptal
    }
    for (const [key, c] of this.map) {
      const d = Math.max(Math.abs(c.cx - mcx), Math.abs(c.cy - mcy));
      if (d > r + 1 && c.state !== 'unloading') {
        if (st) { c.state = 'unloading'; c.t0 = T; this._puff(c); }
        else { this.map.delete(key); this._unloaded(); }
      }
    }
  }
  _unloaded() {
    this.unloads++;
    if (!this.toldUnload) { this.toldUnload = true; this.toast('Arkandaki parça bellekten kaldırıldı', 2200); }
  }
  _puff(c) {
    if (this.reduced) return;
    const x = (c.cx + 0.5) * CS, y = (c.cy + 0.5) * CS;
    this.parts.burst(x, y, { n: 5, speed: 60, life: 0.6, size: 12, col: '#9b8fc0', kind: 'dust', g: -10 });
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time, ax = this.input.axis;
    this.parts.update(dt);
    if (!this.completed) {
      const k0 = tileAt(fl(this.x / TS), fl((this.y - 1) / TS));
      this.inWater = wet(k0);
      const sp = this.inWater ? WATER_SPEED : SPEED;
      const mx = ax.x * sp * dt, my = ax.y * sp * dt;
      this.moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.1;
      if (Math.abs(ax.x) > 0.15) this.dir = Math.sign(ax.x);
      const px = this.x, py = this.y;
      if (!this._blocked(this.x + mx, this.y)) this.x += mx;
      if (!this._blocked(this.x, this.y + my)) this.y += my;
      const moved = Math.hypot(this.x - px, this.y - py);
      if (moved > 0) this.phase += moved * 0.05;
      else this.moving = false;
    }
    const pcx = this.mcx, pcy = this.mcy;
    this._manage(T);
    if (this.mcx !== pcx || this.mcy !== pcy) this.happyT = T;
    // zamanlayıcılar
    for (const [key, c] of this.map) {
      const a = T - c.t0;
      if (c.state === 'loading' && a >= LOAD_T) c.state = 'active';
      else if (c.state === 'unloading' && a >= UNLOAD_T) { this.map.delete(key); this._unloaded(); }
    }
    // kamera
    const cam = this.camera, k = 1 - Math.exp(-6 * dt), zt = this.tech ? 0.55 : 1;
    cam.x += (this.x - cam.x) * k; cam.y += (this.y - 40 - cam.y) * k; cam.z += (zt - cam.z) * (1 - Math.exp(-5 * dt));
    // amaç
    if (!this.completed && this.maxDist >= 3 && this.unloads >= 10) this.complete({ text: this.cfg.lesson });
    // teknik HUD
    if (this.tech) {
      let a = 0, l = 0, u = 0;
      for (const c of this.map.values()) { if (c.state === 'active') a++; else if (c.state === 'loading') l++; else u++; }
      this.hud({
        left: [`Yüklü: ${a} · Yükleniyor: ${l} · Boşaltılıyor: ${u}`, `Bellekteki karo: ${this.map.size * CN * CN}`],
        right: [`Çizilen karo: ${this.drawn}`, `Toplam yükleme: ${this.loads} · boşaltma: ${this.unloads}`, `FPS: ${this.fps} (ölçülen)`],
      });
    } else this.hud(null);
  }

  _blocked(px, py) {            // ayak kutusu 16×8 ↔ engel karoları (biraz küçültülmüş)
    const x0 = px - 8, x1 = px + 8, y0 = py - 6, y1 = py;
    for (let ty = fl(y0 / TS); ty <= fl(y1 / TS); ty++) for (let tx = fl(x0 / TS); tx <= fl(x1 / TS); tx++) {
      if (!solid(tileAt(tx, ty))) continue;
      if (x1 > tx * TS + 3 && x0 < (tx + 1) * TS - 3 && y1 > ty * TS + 3 && y0 < (ty + 1) * TS - 3) return true;
    }
    return false;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    const now = performance.now();
    if (this.lastNow) { this.fpsBuf.push(now - this.lastNow); if (this.fpsBuf.length > 30) this.fpsBuf.shift(); const s = this.fpsBuf.reduce((a, b) => a + b, 0) / this.fpsBuf.length; this.fps = Math.round(1000 / s); }
    this.lastNow = now;

    g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H);
    g.save(); this.applyCamera(g);
    const z = c.z, vx0 = c.x - W / 2 / z - 2, vx1 = c.x + W / 2 / z + 2, vy0 = c.y - H / 2 / z - 2, vy1 = c.y + H / 2 / z + 2;
    const vis = []; let drawn = 0;
    // zemin
    for (const ch of this.map.values()) {
      const X = ch.cx * CS, Y = ch.cy * CS;
      if (X > vx1 || X + CS < vx0 || Y > vy1 || Y + CS < vy0) continue;
      const a = T - ch.t0; let rows = CN, alpha = 1, red = 0;
      if (ch.state === 'loading') rows = clamp(Math.ceil(a / LOAD_T * CN), 0, CN);
      else if (ch.state === 'unloading') { const u = clamp(a / UNLOAD_T); alpha = 1 - eIn(u); red = u; }
      ch.rows = rows; ch.alpha = alpha; vis.push(ch);
      drawn += rows * CN;
      if (rows <= 0) continue;
      g.globalAlpha = alpha;
      const hh = rows >= CN ? CS + 1 : rows * TS;
      g.drawImage(ch.cv, 0, 0, CS + 1, hh, X, Y, CS + 1, hh);
      g.globalAlpha = 1;
      if (red > 0) { g.fillStyle = `rgba(150,30,60,${0.35 * red})`; g.fillRect(X, Y, CS, CS); }
      if (ch.state === 'loading') {                          // mor süpürme çizgisi
        const sy = Y + rows * TS - (rows < CN ? 0 : 0);
        const gr = g.createLinearGradient(0, sy - 14, 0, sy); gr.addColorStop(0, 'rgba(139,61,255,0)'); gr.addColorStop(1, 'rgba(139,61,255,.35)');
        g.fillStyle = gr; g.fillRect(X, sy - 14, CS, 14);
        g.fillStyle = GLOW; g.fillRect(X, sy - 1, CS, 2);
      }
    }
    this.drawn = drawn;
    if (this.tech) this._techFill(g, vis);
    // nesneler + Mobu (ayak y'sine göre)
    const items = [];
    for (const ch of vis) for (const o of ch.objs) if (o.row < ch.rows) items.push({ y: o.wy, o, al: ch.alpha });
    items.push({ y: this.y, mobu: true });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.mobu) { this._mobu(g, T); continue; }
      g.globalAlpha = it.al; this._obj(g, it.o); g.globalAlpha = 1;
    }
    this.parts.draw(g);
    if (this.tech || this.s.showBorders) this._borders(g, vis, z);
    if (this.tech) this._techWorld(g, z);
    g.restore();
    // vinyet
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    this._memBar(g, W);
  }

  _obj(g, o) {
    const x = o.wx, y = o.wy;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y, 12, 4, 0, 0, 7); g.fill();
    if (o.k === TREE) {
      g.fillStyle = '#2d2234'; g.fillRect(x - 2.5, y - 12, 5, 12);
      g.fillStyle = '#1c4a3a'; g.strokeStyle = '#0a1816'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y - 22, 14 + o.s * 2, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(120,200,170,.12)'; g.beginPath(); g.arc(x - 4, y - 26, 7, 0, 7); g.fill();
    } else {
      g.fillStyle = '#4a4764'; g.strokeStyle = '#13111c'; g.lineWidth = 2; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x - 9, y - 11); g.lineTo(x - 2, y - 17); g.lineTo(x + 7, y - 13); g.lineTo(x + 12, y - 4); g.lineTo(x + 10, y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(x - 8, y - 10); g.lineTo(x - 2, y - 15); g.lineTo(x + 3, y - 11); g.lineTo(x - 4, y - 8); g.closePath(); g.fill();
    }
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    if (this.moving) walk(m, this.phase, this.dir, 1, this.inWater ? 0.6 : 1);
    // yüzler: su → 'o'; yeni chunk'a geçiş → 'happy'; yüklü alanın sonuna yakın → 'scared'
    const nearVoid = [[-70, 0], [70, 0], [0, -70], [0, 70]].some(([dx, dy]) => !this.map.has(fl((this.x + dx) / CS) + ',' + fl((this.y + dy) / CS)));
    if (nearVoid) m.face = 'scared';
    else if (this.inWater) m.face = 'o';
    else if (T - this.happyT < 0.7) m.face = 'happy';
    if (this.inWater) { m.sy *= 0.97; }
    drawMobu(g, m);
  }

  _rect(g, ch, z) { return [ch.cx * CS, ch.cy * CS]; }

  _techFill(g, vis) {
    for (const ch of vis) {
      const X = ch.cx * CS, Y = ch.cy * CS;
      if (ch.state === 'loading') g.fillStyle = 'rgba(139,61,255,.30)';
      else if (ch.state === 'unloading') g.fillStyle = 'rgba(220,60,70,.28)';
      else if (ch.cx === this.mcx && ch.cy === this.mcy) g.fillStyle = 'rgba(255,255,255,.08)';
      else continue;
      g.fillRect(X, Y, CS, CS);
    }
  }
  _borders(g, vis, z) {
    g.save(); g.lineWidth = 1.5 / z;
    for (const ch of vis) {
      const X = ch.cx * CS, Y = ch.cy * CS;
      g.strokeStyle = this.tech && ch.state === 'active' ? 'rgba(255,255,255,.55)' : 'rgba(182,124,255,.55)';
      if (this.tech && ch.state === 'unloading') g.strokeStyle = 'rgba(255,120,130,.8)';
      g.strokeRect(X + 0.5 / z, Y + 0.5 / z, CS - 1 / z, CS - 1 / z);
      txt(g, `${ch.cx},${ch.cy}`, X + 6 / z, Y + 12 / z, 11 / z, LAV, 'left', 700, true);
    }
    g.restore();
  }
  _techWorld(g, z) {
    const r = this.s.radius, mcx = this.mcx, mcy = this.mcy;
    g.save();
    g.lineWidth = 3 / z; g.strokeStyle = LAV; g.strokeRect(mcx * CS, mcy * CS, CS, CS);          // Mobu'nun chunk'ı
    g.setLineDash([10 / z, 7 / z]); g.lineWidth = 2.5 / z; g.strokeStyle = GLOW;
    g.strokeRect((mcx - r) * CS, (mcy - r) * CS, (2 * r + 1) * CS, (2 * r + 1) * CS);            // yarıçap karesi
    g.restore();
  }

  _memBar(g, W) {
    const w = Math.min(W - 40, 300), x0 = (W - w) / 2, y = 30, n = this.map.size, k = clamp(n / FULL);
    txt(g, 'BELLEK', x0, y - 11, 12, LAV, 'left', 800, true);
    txt(g, `${n} parça · ${n * CN * CN} karo`, x0 + w, y - 11, 12, '#F5F5F5', 'right', 700, true);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(x0 - 2, y - 2, w + 4, 12, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(x0, y, w, 8, 4); g.fill();
    g.fillStyle = k > 0.8 ? LAV : PURPLE; g.beginPath(); g.roundRect(x0, y, Math.max(8, w * k), 8, 4); g.fill();
  }
}
