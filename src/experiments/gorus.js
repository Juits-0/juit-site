// gorus.js — "Düşmanlar seni nasıl görüyor?" Görüş açısı + mesafe + engel kesmesi (üstten bakışlı gizlilik haritası).
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, angDiff } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, poly, setBoil, HATCH_L } from '../core/ink.js';
import { mk, walk, drawMobu, ARM_SCARED, ARM_HIP } from '../core/mobu.js';
import { enemy } from '../core/enemy.js';
import { Particles, glowAt, bangMark, speedLines } from '../core/fx.js';
import { txt, bar } from '../core/ui.js';

const WS = 560;                         // dünya karesi
const S = 0.24, MR = 11;                // Mobu ölçeği ve çarpışma yarıçapı
const SPD = 170, CHASE = 200, CHASE_T = 1.5, SEEN_T = 0.5, LOSE_T = 1.0, RAYS = 48;
const START = { x: 62, y: 498 }, DOOR = { x: 506, y: 50 };
// duvar blokları [x,y,w,h]: iki L biçimli sığınak, orta bar ve iki yan bar (180° dönüşüm simetrisi)
const WALLS = [
  [100, 380, 40, 140], [100, 380, 150, 40],
  [420, 40, 40, 140], [310, 140, 150, 40],
  [230, 262, 100, 36],
  [80, 200, 100, 40], [380, 320, 100, 40],
];
// nöbetçiler: rot = iki açı arasında döner (derece), pat = devriye yolu
const SENT = [
  { x: 300, y: 450, rot: [-205, -125], period: 7, ph: 0 },
  { x: 250, y: 120, rot: [10, 80], period: 8, ph: 2 },
  { x: 170, y: 330, pat: [[170, 330], [390, 330]], spd: 58 },
];
const D2R = Math.PI / 180;

export default class Gorus extends Experiment {
  static id = 'gorus';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: null,
    hint: 'WASD / oklar: sürün · Nöbetçilerin görüşünden kaçın, çıkışa ulaş',
    hintTouch: 'Joystick: sürün · Çıkışa görülmeden ulaş',
  };
  static settings = [
    { key: 'occlusion', label: 'Engeller görüşü keser', type: 'toggle', value: true, group: 'Görüş' },
    { key: 'fov', label: 'Görüş açısı', type: 'range', value: 70, min: 30, max: 180, step: 5, unit: '°', group: 'Görüş' },
    { key: 'range', label: 'Görüş mesafesi', type: 'range', value: 150, min: 80, max: 300, step: 10, unit: 'px', group: 'Görüş' },
    { key: 'showCone', label: 'Görüş konisi', type: 'toggle', value: true, group: 'Görünüm' },
    { key: 'showLos', label: 'Görüş hattı', type: 'toggle', value: false, group: 'Görünüm' },
  ];

  init() {
    // duvar kenar parçaları (ışın ve görüş hattı için): dünya sınırı + blok kenarları
    this.segs = [[0, 0, WS, 0], [WS, 0, WS, WS], [WS, WS, 0, WS], [0, WS, 0, 0]];
    for (const [x, y, w, h] of WALLS) this.segs.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
    this.parts = new Particles(120);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.x = START.x; this.y = START.y; this.dir = 1; this.phase = 0; this.moving = false;
    this.caught = 0; this.st = 'play'; this.stT = 0; this.seenAny = false; this.sees = 0;
    this.sent = SENT.map((d, i) => {
      const s = { i, d, x: d.x, y: d.y, ang: 0, det: 0, mode: 'patrol', cT: 0, rT: 0, ph: d.ph || 0, u: 0, dsg: 1, pause: 0, jolt: -9, qT: -9, sight: 'out', hitX: 0, hitY: 0, lookX: 1 };
      this._patrolPose(s, 0); return s;
    });
    this.camera.x = WS / 2; this.camera.y = WS / 2;
    this._cam();
    this.hud(null);
  }

  onSetting() { /* anında etki: her karede ayarlar okunuyor */ }
  onTech() { this.hud(null); }
  resize() { this._cam(); }
  _cam() { this.camera.z = Math.min(this.view.w, this.view.h) / 600; this.camera.x = WS / 2; this.camera.y = WS / 2; }

  // ---------------- geometri ----------------
  _rayDist(ox, oy, dx, dy, max) {
    let best = max;
    for (const [x1, y1, x2, y2] of this.segs) {
      const sx = x2 - x1, sy = y2 - y1, den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den, u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
      if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }
  _slide(o, dx, dy, h) {
    o.x = clamp(o.x + dx, h, WS - h);
    for (const [x, y, w, ht] of WALLS) if (o.x + h > x && o.x - h < x + w && o.y + h > y && o.y - h < y + ht) o.x = dx > 0 ? x - h : dx < 0 ? x + w + h : o.x;
    o.y = clamp(o.y + dy, h, WS - h);
    for (const [x, y, w, ht] of WALLS) if (o.x + h > x && o.x - h < x + w && o.y + h > y && o.y - h < y + ht) o.y = dy > 0 ? y - h : dy < 0 ? y + ht + h : o.y;
  }
  _patrolPose(s, dt) {
    const d = s.d;
    if (d.rot) {
      s.ph += dt; const k = 0.5 - 0.5 * Math.cos(s.ph * Math.PI * 2 / d.period);
      s.ang = lerp(d.rot[0], d.rot[1], k) * D2R; s.x = d.x; s.y = d.y;
    } else {
      const [a, b] = d.pat, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s.pause > 0) s.pause -= dt;
      else { s.u += s.dsg * d.spd * dt; if (s.u >= L || s.u <= 0) { s.u = clamp(s.u, 0, L); s.dsg *= -1; s.pause = 0.9; } }
      const k = s.u / L; s.x = lerp(a[0], b[0], k); s.y = lerp(a[1], b[1], k);
      s.ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (s.dsg < 0 ? Math.PI : 0);
    }
  }
  _home(s) {
    const d = s.d;
    if (d.rot) return [d.x, d.y];
    const [a, b] = d.pat, L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = s.u / L;
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  }
  // nöbetçinin Mobu'yu görme durumu: 'open' | 'blocked' | 'out'; blocked ise çarpma noktası
  _sight(s) {
    const dx = this.x - s.x, dy = this.y - s.y, dist = Math.hypot(dx, dy);
    if (dist < 1) return 'open';
    const inRange = dist <= this.s.range;
    const inAng = Math.abs(angDiff(Math.atan2(dy, dx), s.ang)) <= this.s.fov * D2R / 2;
    if (!inRange || !inAng) return 'out';
    if (!this.s.occlusion) return 'open';
    const t = this._rayDist(s.x, s.y, dx / dist, dy / dist, dist);
    if (t < dist - 0.5) { s.hitX = s.x + dx / dist * t; s.hitY = s.y + dy / dist * t; return 'blocked'; }
    return 'open';
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    if (this.st === 'play') this._play(dt, T);
    else if (this.st === 'caught') this._caught(T);
    else if (this.st === 'won') { if (T - this.stT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson }); }
    if (this.tech) {
      const n = this.sent.filter(s => s.sight === 'open').length;
      this.hud({ left: [`Görünür nöbetçi: ${n}/3`, `Görüş hattı: ${n ? 'açık' : 'kapalı'}`], right: [`Yakalanma: ${this.caught}`] });
    } else this.hud(null);
  }

  _play(dt, T) {
    // Mobu hareketi
    const ax = this.input.axis; let vx = ax.x, vy = ax.y; const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    this.moving = m > 0.12;
    if (this.moving) {
      this._slide(this, vx * SPD * dt, vy * SPD * dt, MR);
      this.phase += SPD * Math.min(1, m) * dt * 0.05;
      if (Math.abs(vx) > 0.2) this.dir = Math.sign(vx);
    }
    // nöbetçiler
    let anySeen = false, nOpen = 0;
    for (const s of this.sent) {
      if (s.mode === 'patrol') {
        this._patrolPose(s, dt);
      } else if (s.mode === 'chase') {
        const dx = this.x - s.x, dy = this.y - s.y, d = Math.hypot(dx, dy) || 1;
        this._slide(s, dx / d * CHASE * dt, dy / d * CHASE * dt, 14); s.ang = Math.atan2(dy, dx);
        s.cT -= dt;
        if (d < 26) { this._catch(T); return; }
        if (s.cT <= 0) { s.mode = 'return'; s.rT = 3; s.det = 0; }
      } else {
        const [hx, hy] = this._home(s), dx = hx - s.x, dy = hy - s.y, d = Math.hypot(dx, dy);
        s.rT -= dt;
        if (d < 4 || s.rT <= 0) { s.x = hx; s.y = hy; s.mode = 'patrol'; }
        else { this._slide(s, dx / d * 110 * dt, dy / d * 110 * dt, 14); s.ang = Math.atan2(dy, dx); }
      }
      if (Math.abs(Math.cos(s.ang)) > 0.05) s.lookX = Math.sign(Math.cos(s.ang));
      // görüş ve tespit sayacı
      s.sight = this._sight(s);
      if (s.mode === 'chase') { s.det = 1; }
      else if (s.mode === 'patrol') {
        const was = s.det;
        if (s.sight === 'open') {
          s.det = Math.min(1, s.det + dt / SEEN_T);
          if (was < 0.2 && s.det >= 0.2) { s.jolt = T; s.qT = T; this.audio.play('pop'); }
          if (was < 1 && s.det >= 1) { s.mode = 'chase'; s.cT = CHASE_T; s.jolt = T; this.audio.play('alarm'); }
        } else s.det = Math.max(0, s.det - dt / LOSE_T);
      }
      if (s.sight === 'open') nOpen++;
      if (s.det > 0.05) anySeen = true;
    }
    this.seenAny = anySeen; this.sees = nOpen;
    // çıkış
    if (Math.hypot(this.x - DOOR.x, this.y - DOOR.y + 6) < 28) {
      this.st = 'won'; this.stT = T; this.audio.play('success');
      this.parts.confetti(DOOR.x, DOOR.y - 40, 50);
    }
  }

  _catch(T) {
    this.st = 'caught'; this.stT = T; this.caught++;
    this.audio.play('hurt'); this.flash(0.25); this.shake(5); this.toast('Yakalandın', 900);
    this.parts.stars(this.x, this.y - 60, 6);
  }
  _caught(T) {
    if (T - this.stT > 0.7) {
      const c = this.caught; this.reset(); this.caught = c;
      this.parts.dust(this.x, this.y, 6); this.audio.play('pop');
    }
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); this.applyCamera(g);
    // zemin
    g.fillStyle = '#17112a'; g.fillRect(0, 0, WS, WS);
    glowAt(g, WS / 2, WS / 2, 360, '139,61,255', 0.08);
    if (this.tech) {
      g.strokeStyle = 'rgba(182,124,255,.12)'; g.lineWidth = 1; g.beginPath();
      for (let k = 40; k < WS; k += 40) { g.moveTo(k, 0); g.lineTo(k, WS); g.moveTo(0, k); g.lineTo(WS, k); }
      g.stroke();
    }
    g.save(); g.beginPath(); g.rect(0, 0, WS, WS); g.clip();
    if (this.s.showCone || this.tech) for (const s of this.sent) this._cone(g, s, T);
    if (this.tech) for (const s of this.sent) this._rays(g, s);
    this._walls(g);
    this._door(g, T);
    g.restore();
    g.strokeStyle = 'rgba(182,124,255,.45)'; g.lineWidth = 1.5; g.strokeRect(0, 0, WS, WS);
    // başlangıç işareti
    g.strokeStyle = 'rgba(182,124,255,.35)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(START.x, START.y + 2, 26, 12, 0, 0, 7); g.stroke(); g.setLineDash([]);
    if (this.s.showLos || this.tech) for (const s of this.sent) this._los(g, s);
    // karakterler: y'ye göre sıralı
    const items = this.sent.map(s => ({ y: s.y, f: () => this._sentry(g, s, T) }));
    items.push({ y: this.y, f: () => this._mobu(g, T) });
    items.sort((a, b) => a.y - b.y).forEach(o => o.f());
    this.parts.draw(g);
    for (const s of this.sent) this._marks(g, s, T);
    if (this.tech) for (const s of this.sent) this._label(g, s);
    g.restore();
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  _walls(g) {
    WALLS.forEach(([x, y, w, h], i) => {
      poly(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], '#202026', 8000 + i * 7, 4, HATCH_L);
      g.strokeStyle = 'rgba(182,124,255,.7)'; g.lineWidth = 2.5; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });
  }
  _door(g, T) {
    const { x, y } = DOOR;
    glowAt(g, x, y, 80, '139,61,255', 0.3);
    g.fillStyle = '#0a0810'; g.fillRect(x - 24, y - 30, 48, 60);
    g.strokeStyle = LAV; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeRect(x - 24, y - 30, 48, 60);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x - 28, y - 34, 56, 68);
    // küçük bayrak
    g.strokeStyle = '#b9b2c9'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 36, y + 30); g.lineTo(x + 36, y - 20); g.stroke();
    const w = Math.sin(T * 5) * 2;
    g.fillStyle = PURPLE; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + 37, y - 20); g.quadraticCurveTo(x + 50, y - 20 + w, x + 60, y - 14 + w); g.quadraticCurveTo(x + 50, y - 6 + w, x + 37, y - 6); g.closePath(); g.fill(); g.stroke();
  }

  // koni çokgeni: occlusion açıkken ışınlar duvara kadar, kapalıyken tam dilim
  _fan(s) {
    const a0 = s.ang - this.s.fov * D2R / 2, step = this.s.fov * D2R / (RAYS - 1), R = this.s.range, pts = [];
    for (let i = 0; i < RAYS; i++) {
      const a = a0 + step * i, dx = Math.cos(a), dy = Math.sin(a);
      const d = this.s.occlusion ? this._rayDist(s.x, s.y, dx, dy, R) : R;
      pts.push([s.x + dx * d, s.y + dy * d, a, d]);
    }
    return pts;
  }
  _cone(g, s, T) {
    const pts = this._fan(s), hot = s.mode === 'chase' ? 1 : clamp(s.det);
    g.beginPath(); g.moveTo(s.x, s.y); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath();
    const gr = g.createRadialGradient(s.x, s.y, 4, s.x, s.y, this.s.range);
    const c = hot > 0.2 ? '255,80,100' : '225,215,255';
    gr.addColorStop(0, `rgba(${c},${0.14 + hot * 0.08})`); gr.addColorStop(1, `rgba(${c},${0.10 + hot * 0.12})`);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = `rgba(${c},${0.3 + hot * 0.3})`; g.lineWidth = 1; g.stroke();
  }
  _rays(g, s) {
    const pts = this._fan(s);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 0.8; g.beginPath();
    for (const p of pts) { g.moveTo(s.x, s.y); g.lineTo(p[0], p[1]); }
    g.stroke();
  }
  _los(g, s) {
    const fs = 13 / this.camera.z;
    g.save(); g.lineWidth = 2; g.lineCap = 'round';
    if (s.sight === 'open') {
      g.strokeStyle = 'rgba(214,255,235,.9)'; g.setLineDash([7, 5]); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(this.x, this.y); g.stroke(); g.setLineDash([]);
      txt(g, '✓', (s.x + this.x) / 2, (s.y + this.y) / 2 - 6, fs, '#d6ffeb', 'center', 900);
    } else if (s.sight === 'blocked') {
      g.strokeStyle = 'rgba(239,74,92,.9)'; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.hitX, s.hitY); g.stroke();
      g.strokeStyle = 'rgba(239,74,92,.35)'; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(s.hitX, s.hitY); g.lineTo(this.x, this.y); g.stroke(); g.setLineDash([]);
      txt(g, '✗', s.hitX, s.hitY + fs * 0.35, fs * 1.3, RED, 'center', 900);
    } else {
      g.strokeStyle = 'rgba(190,180,210,.22)'; g.setLineDash([3, 6]); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(this.x, this.y); g.stroke(); g.setLineDash([]);
    }
    g.restore();
  }

  _sentry(g, s, T) {
    const chase = s.mode === 'chase', alert = !chase && s.det > 0.2;
    const j = clamp((T - s.jolt) / 0.28), lift = j < 1 ? Math.sin(j * Math.PI) * 14 : 0;
    const e = { x: s.x, y: s.y, s: 0.5, flip: s.lookX < 0 ? -1 : 1, lift, lookX: s.lookX, face: chase ? 'angry' : alert ? 'alert' : 'wait' };
    if (chase) { e.foot = Math.sin(T * 24 + s.i) * 5; e.rot = s.lookX * 0.08; }
    if (chase) speedLines(g, s.x - s.lookX * 22, s.y - 30, -s.lookX, 1, 0.5);
    if (this.st === 'caught' && chase) { e.sy = 1 + Math.sin(T * 30) * 0.03; }
    enemy(g, e, s.i + 1);
  }

  _marks(g, s, T) {
    const top = s.y - 96;
    if (s.mode === 'chase') bangMark(g, s.x, top + 6, 0.3, eBack(clamp((T - s.jolt) / 0.2)), T);
    else if (s.det >= 0.2) {
      const k = eBack(clamp((T - s.qT) / 0.2));
      g.save(); g.translate(s.x, top - 6); g.scale(k, k);
      txt(g, '?', 0, 0, 34, '#000', 'center', 900); txt(g, '?', 0, -1, 30, GOLD, 'center', 900);
      g.restore();
    }
    if (s.det > 0.01 || this.tech) {
      const bw = 38, bx = s.x - bw / 2, by = top + 4;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.roundRect(bx - 2, by - 2, bw + 4, 9, 4); g.fill();
      bar(g, bx, by, bw, 5, clamp(s.det), s.det >= 1 ? RED : PURPLE, 'rgba(255,255,255,.14)');
    }
  }
  _label(g, s) {
    const fs = 11 / this.camera.z;
    const lx = clamp(s.x, 50, WS - 50), ly = Math.max(12, s.y - 130);
    txt(g, `${this.s.fov}° · ${this.s.range} px`, lx, ly, fs, LAV, 'center', 700, true);
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    const won = this.st === 'won', caught = this.st === 'caught';
    if (caught) {
      const u = T - this.stT;
      m.face = 'scared'; m.armL = m.armR = ARM_SCARED; m.sx *= 1 + 0.06 * Math.sin(u * 40); m.sy *= 1 - 0.06 * Math.sin(u * 40);
    } else if (won) {
      m.face = 'proud'; m.armL = m.armR = ARM_HIP;
      m.sy *= 1 + 0.04 * Math.sin((T - this.stT) * 9);
    } else {
      if (this.moving) walk(m, this.phase, this.dir, 1, 0.8);
      m.face = this.seenAny ? 'O' : 'sus';
      if (this.seenAny) { m.armL = m.armR = ARM_SCARED; }
    }
    drawMobu(g, m);
  }
}
