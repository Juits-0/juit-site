// hile.js — #16 "Oyunlarda wallhack ve aimbot nasıl çalışıyor?"
// Eğitici/savunma bakışı: hile kodu yok; "neden mümkün" ve "oyun buna karşı ne yapar" kavramları.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, setBoil, poly, HATCH_L } from '../core/ink.js';
import { mk, walk, pancake, drawMobu, ARM_PUNCH, ARM_DEF } from '../core/mobu.js';
import { enemy } from '../core/enemy.js';
import { Particles, glowAt, starPoly } from '../core/fx.js';
import { txt, pill } from '../core/ui.js';

// ---- dünya (arena, mantıksal px) ----
const AW = 720, AH = 440;
const MS = 0.27, ES = 0.40;            // Mobu / düşman ölçeği
const MR = 11, ER = 20;               // Mobu çarpışma yarıçapı, düşman isabet yarıçapı
const LIFT = 20;                       // nişan noktası ayak seviyesindedir; imleç göğüs hizasında çizilir
const WALK = 150, FIRE_CD = 0.22, DOWN_T = 2.4, SPIKE_CD = 0.3;
const DEG = 180 / Math.PI;

// simetrik siper düzeni: dört köşe bloğu, iki yan duvar, ortada sütun
const WALLS = (() => {
  const w = [];
  const mir = (x, y, ww, hh) => {
    for (const mx of [false, true]) for (const my of [false, true])
      w.push({ x: mx ? AW - x - ww : x, y: my ? AH - y - hh : y, w: ww, h: hh });
  };
  mir(120, 76, 100, 22);
  w.push({ x: 190, y: 160, w: 22, h: 120 }, { x: AW - 190 - 22, y: 160, w: 22, h: 120 });
  w.push({ x: AW / 2 - 30, y: 165, w: 60, h: 110 });
  return w;
})();

// devriye hatları (simetrik)
const PATROLS = [
  [[280, 105], [440, 105], 58],
  [[60, 90], [60, 360], 52],
  [[AW - 60, 90], [AW - 60, 360], 52],
  [[270, 125], [270, 320], 46],
  [[AW - 270, 125], [AW - 270, 320], 46],
];
const SPAWN = { x: AW / 2, y: 392 };

// ---- geometri yardımcıları ----
function rayRect(ox, oy, dx, dy, r) {
  let t0 = 0, t1 = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < r.x || ox > r.x + r.w) return Infinity; }
  else { let a = (r.x - ox) / dx, b = (r.x + r.w - ox) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
  if (Math.abs(dy) < 1e-9) { if (oy < r.y || oy > r.y + r.h) return Infinity; }
  else { let a = (r.y - oy) / dy, b = (r.y + r.h - oy) / dy; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
  if (t0 > t1 || t1 < 0) return Infinity;
  return t0;
}
// birim yönde ilk duvar uzaklığı (sınır dahil değil)
function castWalls(ox, oy, dx, dy) {
  let t = Infinity;
  for (const r of WALLS) { const h = rayRect(ox, oy, dx, dy, r); if (h < t) t = h; }
  return t;
}
// duvarlar + arena sınırı
function castAll(ox, oy, dx, dy) {
  let t = castWalls(ox, oy, dx, dy);
  const tx = dx > 0 ? (AW - ox) / dx : dx < 0 ? -ox / dx : Infinity;
  const ty = dy > 0 ? (AH - oy) / dy : dy < 0 ? -oy / dy : Infinity;
  return Math.min(t, tx, ty);
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export default class Hile extends Experiment {
  static id = 'hile';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [{ name: 'fire', label: 'ATEŞ' }], pointer: 'aim',
    hint: 'WASD / oklar: yürü · Fare: nişan · Tık / Boşluk: ateş',
    hintTouch: 'Joystick: yürü · Dokun: nişan al · ATEŞ: ateş',
  };
  static settings = [
    { key: 'wallhack', label: 'Wallhack', type: 'toggle', value: false, group: 'HİLELER' },
    { key: 'aimbot', label: 'Aimbot', type: 'toggle', value: false, group: 'HİLELER' },
    { key: 'filter', label: 'Sunucu yalnız görüneni gönderir', type: 'toggle', value: false, group: 'KORUMA' },
    { key: 'anti', label: 'Anti-cheat (nişan analizi)', type: 'toggle', value: false, group: 'KORUMA' },
    { key: 'thresh', label: 'Şüphe eşiği (nişan hızı)', type: 'range', value: 2200, min: 1200, max: 4000, step: 100, unit: '°/sn', group: 'KORUMA' },
  ];

  init() {
    this.parts = new Particles(160);
    this.hist = new Array(90).fill(0);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.mx = SPAWN.x; this.my = SPAWN.y; this.vx = 0; this.vy = 0; this.phase = 0; this.dirX = 1;
    this.pa = { x: AW / 2 + 130, y: 330 };     // oyuncunun kendi nişanı (ayak düzleminde)
    this.A = { x: AW / 2 + 130, y: 330 };          // gerçek nişan (aimbot üstüne yazabilir)
    this.prevTh = null; this.omega = 0; this.omegaPk = 0; this.histN = 0;
    this.sus = 0; this.spikeCd = 0; this.spikes = 0; this.flashSpike = -9;
    this.target = -1; this.locked = false;
    this.shots = 0; this.hits = 0; this.fireCd = 0; this.shotT = -9; this.tracer = null;
    this.enemies = PATROLS.map((p, i) => ({ a: p[0], b: p[1], sp: p[2], k: i % 2 ? 0.25 : 0.7, dir: i % 2 ? 1 : -1, x: 0, y: 0, down: 0, vis: false, known: true, shown: false, ghost: false, flip: 1, hitT: -9 }));
    for (const e of this.enemies) this._place(e);
    this.nKnown = this.enemies.length; this.nShown = 0; this.nVis = 0; this.nHidden = 0;
    this.blind = false; this.blindT0 = -9; this.blindAcc = 0; this.seeAcc = 0;
    this.pop = -9; this.popKind = '';
    this.done = [false, false, false]; this.doneT = [-9, -9, -9];
    this.st = 'play'; this.stT = 0; this.spawnT = -9; this.bans = 0;
    this._sense();
    this.hud(null);
  }

  // ayar değişimi
  onSetting(key, value) {
    if (key === 'wallhack' || key === 'aimbot') { this.pop = this.time; this.popKind = key; this.audio.play('pop'); }
    else if (key === 'filter' || key === 'anti') this.audio.play('click');
    if (key === 'aimbot' && !value) { this.locked = false; this.target = -1; }
    if (key === 'aimbot') this.prevTh = null;
  }
  onTech(on) { if (!on) this.hud(null); }

  _place(e) {
    e.x = lerp(e.a[0], e.b[0], e.k); e.y = lerp(e.a[1], e.b[1], e.k);
  }

  // ---- yerleşim: arena ekrana sığar ----
  _lay() {
    const W = this.view.w, H = this.view.h;
    const z = clamp(Math.min((W - 12) / AW, (H - 74 - 84) / AH), 0.4, 1.25);
    return { z, ox: (W - AW * z) / 2, oy: 74, W, H };
  }
  _toWorld(sx, sy) { const L = this._lay(); return { x: (sx - L.ox) / L.z, y: (sy - L.oy) / L.z }; }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    this.fireCd -= dt; this.spikeCd -= dt;
    this._enemies(dt);
    if (this.st === 'play' && !this.completed) {
      this._move(dt);
      this._sense(dt, T);
      this._aim(dt, T);
      this._fire(T);
      this._progress(dt, T);
    } else {
      this._sense(dt, T);
      if (this.st === 'caught') this._caught(T);
      if (this.st === 'won' && T - this.stT > 0.5 && !this.completed) this.complete({ text: this.cfg.lesson });
    }
    // nişan hızı geçmişi (30 Hz, kare başına tepe değer)
    if (++this.histN >= 4) { this.histN = 0; this.hist.push(this.omegaPk); this.hist.shift(); this.omegaPk = 0; }
    if (this.tech) {
      this.hud({
        left: [`sunucudan gelen: ${this.nKnown}/${this.enemies.length} düşman`, `ekranda görünen: ${this.nShown}/${this.enemies.length}`],
        right: [`şüphe: %${Math.round(this.sus * 100)}`],
      });
    } else this.hud(null);
  }

  _enemies(dt) {
    for (const e of this.enemies) {
      if (e.down > 0) { e.down -= dt; continue; }
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      e.k += e.dir * e.sp * dt / len;
      if (e.k >= 1) { e.k = 1; e.dir = -1; } else if (e.k <= 0) { e.k = 0; e.dir = 1; }
      this._place(e);
      const vx = (e.b[0] - e.a[0]) * e.dir;
      if (Math.abs(vx) > 1) e.flip = Math.sign(vx);
    }
  }

  _move(dt) {
    const ax = this.input.axis.x, ay = this.input.axis.y;
    const tvx = ax * WALK, tvy = ay * WALK;
    const k = 1 - Math.exp(-14 * dt);
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    this.mx += this.vx * dt; this.my += this.vy * dt;
    this.mx = clamp(this.mx, 16, AW - 16); this.my = clamp(this.my, 34, AH - 8);
    for (const r of WALLS) {                   // daire–dikdörtgen itme
      const cx = clamp(this.mx, r.x, r.x + r.w), cy = clamp(this.my, r.y, r.y + r.h);
      let dx = this.mx - cx, dy = this.my - cy, d = Math.hypot(dx, dy);
      if (d < MR) {
        if (d < 1e-4) { dx = this.mx < r.x + r.w / 2 ? -1 : 1; dy = 0; d = 1; this.mx = cx + dx * 0.01; }
        const n = (MR - d) / d; this.mx += dx * n; this.my += dy * n;
      }
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 12) { this.phase += sp * dt * 0.05; if (Math.abs(this.vx) > 8) this.dirX = Math.sign(this.vx); }
  }

  // görüş hattı + istemcinin bildiği + ekranda görünen
  _sense() {
    let known = 0, shown = 0, vis = 0, hidden = 0;
    for (const e of this.enemies) {
      const dx = e.x - this.mx, dy = e.y - this.my, d = Math.hypot(dx, dy) || 1;
      e.vis = castWalls(this.mx, this.my, dx / d, dy / d) >= d - 0.5;
      e.known = this.s.filter ? e.vis : true;          // sunucu filtresi: görünmeyenin konumu hiç gelmez
      e.ghost = !e.vis && this.s.wallhack && e.known;  // duvar arkası, wallhack ile çizilen
      e.shown = e.vis || e.ghost;
      if (e.known) known++; if (e.shown) shown++; if (e.vis) vis++; else hidden++;
    }
    this.nKnown = known; this.nShown = shown; this.nVis = vis; this.nHidden = hidden;
  }

  _aim(dt, T) {
    // oyuncunun kendi nişanı: imleç ya da dokunma
    const p = this.input.pointer;
    if (p && (p.inside || p.down)) {
      const w = this._toWorld(p.x, p.y);
      this.pa.x = clamp(w.x, 0, AW); this.pa.y = clamp(w.y + LIFT, 0, AH);
    }
    // aimbot: en yakın görünen hedefe anında kilit
    this.locked = false;
    if (this.s.aimbot) {
      let best = -1, bd = 1e9;
      this.enemies.forEach((e, i) => {
        if (!e.shown || e.down > 0) return;
        const d = Math.hypot(e.x - this.mx, e.y - this.my);
        if (d < bd) { bd = d; best = i; }
      });
      const cur = this.enemies[this.target];
      if (cur && cur.shown && cur.down <= 0 && best >= 0) {          // histerezis: sürekli kaymasın
        if (Math.hypot(cur.x - this.mx, cur.y - this.my) < bd * 1.25) best = this.target;
      }
      this.target = best;
      if (best >= 0) { this.locked = true; this.A.x = this.enemies[best].x; this.A.y = this.enemies[best].y; }
    } else this.target = -1;
    if (!this.locked) { this.A.x = this.pa.x; this.A.y = this.pa.y; }
    // nişan açısal hızı (gerçek)
    const dx = this.A.x - this.mx, dy = this.A.y - this.my;
    if (Math.hypot(dx, dy) > 24) {
      const th = Math.atan2(dy, dx);
      this.omega = this.prevTh === null ? 0 : Math.abs(angDiff(th, this.prevTh)) / dt * DEG;
      this.prevTh = th;
    } else { this.omega = 0; this.prevTh = null; }
    if (this.omega > this.omegaPk) this.omegaPk = this.omega;
    // anti-cheat: eşik aşan ani kilitlenme = şüphe
    if (this.s.anti && this.s.aimbot) {
      if (this.omega > this.s.thresh && this.spikeCd <= 0) {
        this.sus = Math.min(1, this.sus + 0.36); this.spikeCd = SPIKE_CD; this.spikes++; this.flashSpike = T;
        this.audio.play('warn');
      } else this.sus = Math.max(0, this.sus - 0.09 * dt);
      if (this.sus >= 1) this._catch(T);
    } else this.sus = Math.max(0, this.sus - 0.25 * dt);
  }

  _fire(T) {
    const inp = this.input, p = inp.pointer;
    const want = (p && p.pressed) || inp.pressed('fire') || inp.pressed('jump') || inp.pressed('action');
    if (!want || this.fireCd > 0 || this.st !== 'play') return;
    this.fireCd = FIRE_CD; this.shotT = T; this.shots++;
    let dx = this.A.x - this.mx, dy = this.A.y - this.my; const L = Math.hypot(dx, dy);
    if (L < 1) { dx = this.dirX; dy = 0; } else { dx /= L; dy /= L; }
    const tw = castAll(this.mx, this.my, dx, dy);
    let tHit = tw, who = -1;
    this.enemies.forEach((e, i) => {
      if (e.down > 0) return;
      const ex = e.x - this.mx, ey = e.y - this.my, tc = ex * dx + ey * dy;
      if (tc <= 0 || tc >= tHit) return;
      if (Math.abs(ex * dy - ey * dx) <= ER) { tHit = tc; who = i; }
    });
    this.tracer = { x0: this.mx, y0: this.my, x1: this.mx + dx * tHit, y1: this.my + dy * tHit, t0: T, hit: who >= 0 };
    this.audio.play('laser');
    if (who >= 0) {
      const e = this.enemies[who]; e.down = DOWN_T; e.hitT = T; this.hits++;
      this.parts.sparks(e.x, e.y - 24, 10, GLOW); this.parts.stars(e.x, e.y - 52, 4); this.audio.play('hit');
    } else this.parts.sparks(this.tracer.x1, this.tracer.y1, 4, LAV);
  }

  _progress(dt, T) {
    const wh = this.s.wallhack, ft = this.s.filter;
    // adım 1: wallhack, duvar arkasındaki bir düşmanı gösteriyor
    if (wh && !ft && this.enemies.some(e => e.ghost)) this.seeAcc += dt; else this.seeAcc = 0;
    // adım 2: wallhack açık, filtre açık, duvar arkasında düşman var -> körleşme
    const blind = wh && ft && this.nHidden > 0;
    if (blind && !this.blind) { this.blindT0 = T; this.audio.play('warn'); }
    this.blind = blind;
    if (blind) this.blindAcc += dt; else this.blindAcc = 0;
    if (!this.done[0] && this.seeAcc >= 0.4) this._done(0, T);
    if (!this.done[1] && this.blindAcc >= 0.8) this._done(1, T);
  }
  _done(i, T) {
    this.done[i] = true; this.doneT[i] = T; this.audio.play('coin');
    this.toast(['Wallhack: duvarın arkasını gördün', 'Sunucu veriyi göndermeyince wallhack körleşti', 'Anti-cheat seni yakaladı'][i], 1800);
    this._maybeWin(T);
  }
  _maybeWin(T) {
    if (this.done[0] && this.done[1] && this.done[2] && this.st === 'play') { this.st = 'won'; this.stT = T; this.audio.play('success'); }
  }

  _catch(T) {
    this.st = 'caught'; this.stT = T; this.bans++;
    this.audio.play('alarm'); this.audio.play('ko'); this.shake(6); this.flash(0.12);
    this.parts.stars(this.mx, this.my - 90, 6);
    this.done[2] = true; this.doneT[2] = T;
  }
  _caught(T) {
    if (T - this.stT < 2.6) return;
    // kısa sıfırlama: hile kapatılır, yeni tur
    const all = this.done[0] && this.done[1];
    this.setSetting('aimbot', false);
    this.sus = 0; this.spikeCd = 0; this.prevTh = null; this.locked = false; this.target = -1;
    this.mx = SPAWN.x; this.my = SPAWN.y; this.vx = this.vy = 0; this.tracer = null;
    this.enemies.forEach((e, i) => { e.down = 0; e.k = i % 2 ? 0.25 : 0.7; e.dir = i % 2 ? 1 : -1; this._place(e); });
    this.st = 'play'; this.spawnT = T; this.parts.dust(this.mx, this.my, 8);
    this.audio.play('pop');
    if (all) { this.st = 'won'; this.stT = T - 0.4; }
    else { this.toast('Bu kadar güç vermemeliydik', 2000); this._maybeWin(T); }
  }

  // ---------------- çizim ----------------
  render(g) {
    const L = this._lay(), W = L.W, H = L.H, T = this.time, z = L.z;
    setBoil(T);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    glowAt(g, W / 2, L.oy + AH * z / 2, 360, '139,61,255', 0.07);

    g.save(); g.translate(L.ox, L.oy); g.scale(z, z);
    g.save(); g.beginPath(); g.rect(-6, -60, AW + 12, AH + 66); g.clip();
    this._arena(g, T);
    if (this.tech) this._techWorld(g, T);
    this._sprites(g, T);
    this._aimDraw(g, T);
    this.parts.draw(g);
    g.restore();
    g.restore();

    // mor kenar vinyeti
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);

    this._ui(g, L, T);
    if (this.st === 'caught') this._stamp(g, L, T);
  }

  _arena(g, T) {
    poly(g, [[0, 0], [AW, 0], [AW, AH], [0, AH]], '#171021', 9001, 5);
    glowAt(g, AW / 2, AH / 2, 330, '139,61,255', 0.06);
    WALLS.forEach((r, i) => {
      poly(g, [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], '#2B2B2B', 9100 + i * 7, 4, HATCH_L);
      g.fillStyle = 'rgba(182,124,255,.5)'; g.fillRect(r.x + 2, r.y + 1, r.w - 4, 2.5);
    });
  }

  _sprites(g, T) {
    // wallhack siluetleri (duvarın üstünde, her şeyin altında)
    this.enemies.forEach((e, i) => { if (e.ghost && e.down <= 0) this._ghost(g, e, T, i); });
    // derinlik sırası: ayak y'sine göre
    const list = [];
    this.enemies.forEach((e, i) => { if (e.vis) list.push({ y: e.y, e, i }); });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) this._enemy(g, it.e, it.i, T);
    this._mobu(g, T);          // Mobu her zaman en üstte: yüzü hiç kapanmaz
  }

  _ghost(g, e, T, i) {
    const a = 0.85 + 0.15 * Math.sin(T * 6 + i);
    const k = ES / 0.3;
    g.save(); g.globalAlpha = a; g.translate(e.x, e.y); g.scale(k, k); g.translate(-e.x, -e.y);
    glowAt(g, e.x, e.y - 26, 40, '239,74,92', 0.35);
    g.fillStyle = 'rgba(239,74,92,.2)'; g.strokeStyle = RED; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(e.x - 13, e.y - 46, 26, 46, 11); g.fill(); g.stroke();
    g.beginPath(); g.arc(e.x, e.y - 54, 11, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(e.x, e.y, 15, 5, 0, 0, 7); g.stroke();
    g.restore();
  }

  _enemy(g, e, i, T) {
    const down = e.down > 0;
    const dMob = Math.hypot(e.x - this.mx, e.y - this.my);
    const face = down ? 'dizzy' : (dMob < 210 ? 'alert' : 'wait');
    const hurt = clamp(1 - (T - e.hitT) / 0.2);
    enemy(g, {
      x: e.x, y: e.y, s: ES, rot: down ? Math.sin(T * 9) * 0.06 : 0, flip: e.flip, lift: 0, foot: down ? 0 : T * 6 + i,
      sx: 1 + hurt * 0.12, sy: down ? 0.94 : 1 - hurt * 0.1, face, lookX: clamp((this.mx - e.x) / 120, -1, 1),
    }, i);
    if (down) for (let k = 0; k < 3; k++) { const a = T * 6 + k * 2.09; starPoly(g, e.x + Math.cos(a) * 18, e.y - 58 + Math.sin(a) * 5, 5, '#FFD23F', a, true); }
  }

  _mobu(g, T) {
    const m = mk(T, this.mx, this.my, MS);
    const sp = Math.hypot(this.vx, this.vy);
    if (this.st === 'caught') {
      const k = eOut(lin(T - this.stT, 0, 0.14)); pancake(m, k); m.face = 'x'; drawMobu(g, m);
      const a = (T - this.stT) * 7;
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.mx + Math.cos(aa) * 30, this.my - 32 + Math.sin(aa) * 7, 7, '#FFD23F', aa, true); }
      return;
    }
    if (sp > 14) walk(m, this.phase, this.dirX, 1, clamp(sp / WALK, 0.3, 1.1));
    m.look = clamp((this.A.x - this.mx) / 140, -1, 1);
    // ifade: olayla aynı karede değişir
    if (T - this.shotT < 0.15) { m.face = 'angry'; m.armR = ARM_PUNCH; m.armL = ARM_DEF; }
    else if (this.blind) m.face = (T - this.blindT0 < 1.2) ? 'O' : 'flat';
    else if (this.s.wallhack) m.face = 'sus';
    else if (this.locked) m.face = 'proud';
    else m.face = 'calm';
    // aç/kapa pop'u
    const pk = T - this.pop;
    if (pk < 0.3 && pk >= 0) { const k = eBack(clamp(pk / 0.3)); m.sx *= lerp(1.18, 1, k); m.sy *= lerp(0.86, 1, k); }
    const sp2 = T - this.spawnT; if (sp2 >= 0 && sp2 < 0.3) { const k = eBack(clamp(sp2 / 0.3)); m.sx *= lerp(0.5, 1, k); m.sy *= lerp(0.5, 1, k); }
    drawMobu(g, m);
  }

  _aimDraw(g, T) {
    // izi (hitscan)
    const tr = this.tracer;
    if (tr) {
      const u = (T - tr.t0) / 0.14;
      if (u < 1) {
        g.save(); g.globalAlpha = 1 - u; g.lineCap = 'round';
        g.strokeStyle = tr.hit ? '#E9DDFF' : LAV; g.lineWidth = 3;
        g.beginPath(); g.moveTo(tr.x0, tr.y0 - LIFT); g.lineTo(tr.x1, tr.y1 - LIFT); g.stroke(); g.restore();
      }
    }
    if (this.st === 'caught') return;
    // nişangâh (göğüs hizasında)
    const cx = this.A.x, cy = this.A.y - LIFT;
    g.save(); g.translate(cx, cy);
    if (this.locked) {                                     // kilit: kırmızı çerçeve (hile uyarısı)
      const r = 20 + 3 * Math.sin(T * 12);
      g.strokeStyle = RED; g.lineWidth = 2.5; g.lineCap = 'round';
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.beginPath(); g.moveTo(sx * r, sy * (r - 9)); g.lineTo(sx * r, sy * r); g.lineTo(sx * (r - 9), sy * r); g.stroke();
      }
      g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fillStyle = RED; g.fill();
    } else {
      g.strokeStyle = '#E9DDFF'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, 11, 0, 7); g.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(dx * 7, dy * 7); g.lineTo(dx * 16, dy * 16); g.stroke(); }
    }
    g.restore();
  }

  // ---- teknik görünüm: görüş hatları, görüş alanı, gizli düşmanlar ----
  _techWorld(g, T) {
    const mx = this.mx, my = this.my;
    // görüş alanı çokgeni (gerçek ışın atımı)
    g.beginPath();
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), t = castAll(mx, my, dx, dy);
      if (i === 0) g.moveTo(mx + dx * t, my + dy * t); else g.lineTo(mx + dx * t, my + dy * t);
    }
    g.closePath(); g.fillStyle = 'rgba(139,61,255,.13)'; g.fill();
    g.lineWidth = 1.4;
    this.enemies.forEach((e) => {
      const dx = e.x - mx, dy = e.y - my, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const t = Math.min(castWalls(mx, my, ux, uy), d);
      g.strokeStyle = e.vis ? 'rgba(182,124,255,.85)' : 'rgba(182,124,255,.7)';
      g.setLineDash([]); g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + ux * t, my + uy * t); g.stroke();
      if (!e.vis) {                                          // duvara çarpan: kalan kısım kesik
        g.fillStyle = LAV; g.beginPath(); g.arc(mx + ux * t, my + uy * t, 3, 0, 7); g.fill();
        g.strokeStyle = 'rgba(233,221,255,.3)'; g.setLineDash([5, 5]);
        g.beginPath(); g.moveTo(mx + ux * t, my + uy * t); g.lineTo(e.x, e.y); g.stroke(); g.setLineDash([]);
      }
      // isabet dairesi
      g.strokeStyle = 'rgba(182,124,255,.6)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(e.x, e.y, ER, 0, 7); g.stroke(); g.setLineDash([]);
      if (!e.known) {                                        // sunucu konumu göndermedi: istemci bilmiyor
        g.fillStyle = 'rgba(233,221,255,.55)'; g.font = '700 11px ' + 'monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', e.x, e.y - 22);
      }
    });
  }

  // ---- ekran arayüzü ----
  _ui(g, L, T) {
    const W = L.W, z = L.z;
    // amaç listesi
    const labels = ['Wallhack: duvar arkasını gör', 'Filtre aç: wallhack körleşsin', 'Aimbot: anti-cheat\'e yakalan'];
    labels.forEach((s, i) => {
      const y = 16 + i * 17, d = this.done[i], k = d ? eBack(clamp((T - this.doneT[i]) / 0.3)) : 1;
      g.save(); g.translate(20, y); if (d) g.scale(lerp(1.5, 1, k), lerp(1.5, 1, k));
      g.fillStyle = d ? PURPLE : 'rgba(0,0,0,.4)'; g.strokeStyle = d ? LAV : 'rgba(182,124,255,.6)'; g.lineWidth = 1.6;
      g.beginPath(); g.roundRect(-7, -7, 14, 14, 3); g.fill(); g.stroke();
      if (d) { g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-3.5, 0); g.lineTo(-1, 3); g.lineTo(4, -3.5); g.stroke(); }
      g.restore();
      txt(g, s, 34, y, 12, d ? 'rgba(233,221,255,.6)' : '#E9DDFF', 'left', 700);
    });
    // şüphe çubuğu (anti-cheat açıkken)
    if (this.s.anti) {
      const bw = 96, bx = W - bw - 14, by = 22;
      const hot = T - this.flashSpike < 0.25;
      txt(g, 'ANTI-CHEAT ŞÜPHE', W - 14, 12, 10, hot ? RED : LAV, 'right', 800, true);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(bx, by, bw, 9, 4.5); g.fill();
      if (this.sus > 0.01) { g.fillStyle = this.sus > 0.6 ? RED : PURPLE; g.beginPath(); g.roundRect(bx, by, Math.max(8, bw * this.sus), 9, 4.5); g.fill(); }
      g.strokeStyle = 'rgba(182,124,255,.5)'; g.lineWidth = 1.2; g.beginPath(); g.roundRect(bx, by, bw, 9, 4.5); g.stroke();
    }
    // arena üstü etiketler
    const px = W - 84, py = 54;
    if (this.s.wallhack && !this.blind && this.st === 'play') pill(g, 'WALLHACK AÇIK', px, py, RED, 12);
    if (this.blind && this.st === 'play') pill(g, '?  konum gelmedi', px, py, 'rgba(60,10,20,.9)', 12, '#ff9aa6');
    // teknik: nişan hızı grafiği
    if (this.tech) this._techRow(g, L, T);
  }

  _techRow(g, L, T) {
    const x0 = L.ox + 2, y0 = L.oy + AH * L.z + 12, cw = 150, ch = 46;
    const mxw = 4000;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.roundRect(x0, y0, cw, ch, 6); g.fill();
    const n = this.hist.length, bw = (cw - 8) / n;
    this.hist.forEach((v, i) => {
      const h = clamp(v / mxw) * (ch - 16);
      g.fillStyle = v > this.s.thresh ? RED : PURPLE; g.fillRect(x0 + 4 + i * bw, y0 + ch - 4 - h, Math.max(1, bw - 0.5), h);
    });
    const ty = y0 + ch - 4 - clamp(this.s.thresh / mxw) * (ch - 16);
    g.strokeStyle = 'rgba(239,74,92,.8)'; g.setLineDash([4, 3]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + 3, ty); g.lineTo(x0 + cw - 3, ty); g.stroke(); g.setLineDash([]);
    txt(g, `nişan hızı ${Math.round(this.omega / 10) * 10} °/sn`, x0 + 6, y0 + 8, 10, LAV, 'left', 700, true);
  }

  _stamp(g, L, T) {
    const u = T - this.stT, k = eBack(clamp(u / 0.3));
    const cx = L.W / 2, cy = L.oy + AH * L.z * 0.42;
    g.save(); g.translate(cx, cy); g.rotate(-0.1); g.scale(lerp(1.7, 1, k), lerp(1.7, 1, k)); g.globalAlpha = clamp(u / 0.12);
    const w = Math.min(L.W - 40, 270);
    g.fillStyle = 'rgba(30,6,12,.88)'; g.strokeStyle = RED; g.lineWidth = 4;
    g.beginPath(); g.roundRect(-w / 2, -28, w, 56, 8); g.fill(); g.stroke();
    txt(g, 'YAKALANDI', 0, 0, 34, RED, 'center', 900);
    g.restore();
    const a = clamp((u - 0.7) / 0.4);
    if (a > 0) { g.save(); g.globalAlpha = a; pill(g, 'Bu kadar güç vermemeliydik', cx, cy + 52, 'rgba(20,12,34,.92)', 13, '#E9DDFF'); g.restore(); }
  }
}
