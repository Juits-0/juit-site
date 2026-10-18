import * as THREE from 'three';
import { Experiment } from '../core/experiment.js';

const LEVEL_COLORS = [0xe9ddff, 0x8b3dff, 0xf5c542, 0xef4a5c];
const FADE_T = 0.25;
const GLOW_T = 0.35;

const triCount = (geo) => (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3);
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Sürekli (seviyeden bağımsız) bozulma: tüm LOD seviyelerinde aynı siluet.
function warp(geo, amp, fy = 1) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const k = 1 + amp * (Math.sin(n.x * 3.1 + n.z * 2.3) * 0.5 + Math.sin(n.y * 4.7 + n.x * 1.7) * 0.5);
    p.setXYZ(i, v.x * k, v.y * k * fy, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Her tür: seviye başına parça listesi (gerçek, ayrı BufferGeometry'ler).
function treeLevels() {
  const sph = [[48, 32], [16, 12], [6, 4]];
  const cyl = [12, 6, 4];
  const lv = sph.map(([w, h], i) => [
    { geo: new THREE.CylinderGeometry(0.22, 0.34, 1.6, cyl[i], i < 1 ? 4 : 1), color: 0x7a5233, y: 0.8 },
    { geo: new THREE.SphereGeometry(1.25, w, h), color: 0x2f9e5b, y: 2.3 },
  ]);
  lv.push([
    { geo: new THREE.CylinderGeometry(0.22, 0.34, 1.6, 3, 1), color: 0x7a5233, y: 0.8 },
    { geo: new THREE.TetrahedronGeometry(1.5, 0), color: 0x2f9e5b, y: 2.4 },
  ]);
  return lv;
}
function rockLevels(scale, col) {
  return [12, 5, 2, 0].map((d) => [{ geo: warp(new THREE.IcosahedronGeometry(1, d), 0.22, 0.75), color: col, y: 0.7 * scale, s: scale }]);
}
function crystalLevels() {
  return [10, 4, 1, 0].map((d) => {
    const g = new THREE.OctahedronGeometry(0.7, d);
    g.scale(1, 2.2, 1);
    return [{ geo: g, color: 0x4fd1e8, y: 1.55 }];
  });
}

const SPECS = [
  { kind: 'tree', name: 'Ağaç', pos: [-2.2, 0, 3.5], make: treeLevels },
  { kind: 'rock', name: 'Kaya', pos: [3.4, 0, -2], make: () => rockLevels(1.1, 0x8a8f9c) },
  { kind: 'crystal', name: 'Kristal', pos: [-1.5, 0, -9], make: crystalLevels },
  { kind: 'tree', name: 'Ağaç', pos: [6, 0, -16], make: treeLevels },
  { kind: 'rock', name: 'Kaya', pos: [-6, 0, -24], make: () => rockLevels(1.4, 0x7d8594) },
  { kind: 'crystal', name: 'Kristal', pos: [3, 0, -33], make: crystalLevels },
  { kind: 'tree', name: 'Ağaç', pos: [-4, 0, -44], make: treeLevels },
];

export default class LodExperiment extends Experiment {
  static id = 'lod';
  static kind = 'dom';
  static controls = { joystick: true, buttons: [], pointer: 'aim', hint: 'Sürükle: kamerayı çevir · Tekerlek/çimdik: yaklaş · WASD: yürü' };
  static settings = [
    { key: 'lodOn', type: 'toggle', label: 'LOD', value: true, group: 'LOD' },
    { key: 'd1', type: 'range', label: '1→2 geçiş', min: 4, max: 20, step: 1, value: 8, unit: 'm', group: 'LOD' },
    { key: 'd2', type: 'range', label: '2→3 geçiş', min: 8, max: 40, step: 1, value: 16, unit: 'm', group: 'LOD' },
    { key: 'd3', type: 'range', label: '3→4 geçiş', min: 12, max: 60, step: 1, value: 28, unit: 'm', group: 'LOD' },
    { key: 'colorize', type: 'toggle', label: 'Seviyeyi renkle göster', value: false, group: 'Görünüm' },
    { key: 'wire', type: 'toggle', label: 'Tel kafes', value: false, group: 'Görünüm' },
    { key: 'fade', type: 'toggle', label: 'Yumuşak geçiş', value: true, group: 'Görünüm' },
  ];

  init() {
    const c = this.container;
    this.s = this.s || {};
    for (const d of LodExperiment.settings) if (this.s[d.key] === undefined) this.s[d.key] = d.value;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0a0a, 1);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    c.appendChild(this.renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 35, 95);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xb67cff, 0x1a0b30, 0.7));

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this._disposables = [];
    this._glowTex = this._radialTex();
    this._disposables.push(this._glowTex);
    this._mkGround();

    this.objs = SPECS.map((sp) => this._mkObject(sp));
    this.rings = [0, 1, 2].map((i) => {
      const g = new THREE.RingGeometry(0.985, 1, 128);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ color: LEVEL_COLORS[i + 1], transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.y = 0.03;
      scene.add(mesh);
      this._disposables.push(g, m);
      return mesh;
    });

    this.resize();
    this.reset();
  }

  _radialTex() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(182,124,255,0.55)');
    g.addColorStop(1, 'rgba(182,124,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  _mkGround() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = '#121212';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(139,61,255,0.5)';
    x.lineWidth = 4;
    x.strokeRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(100, 100);
    tex.anisotropy = 4;
    const g = new THREE.PlaneGeometry(200, 200);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    this.scene.add(new THREE.Mesh(g, m));
    this._disposables.push(tex, g, m);
  }

  _label(text) {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 64;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(23,23,23,0.9)';
    x.beginPath();
    x.roundRect(2, 2, 316, 60, 14);
    x.fill();
    x.strokeStyle = '#8B3DFF';
    x.lineWidth = 3;
    x.stroke();
    x.fillStyle = '#F5F5F5';
    x.font = 'bold 28px monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 160, 33);
    return new THREE.CanvasTexture(cv);
  }

  _mkObject(sp) {
    const root = new THREE.Group();
    root.position.set(...sp.pos);
    const levelsDef = sp.make();
    const levels = levelsDef.map((parts, li) => {
      const grp = new THREE.Group();
      const mats = [];
      let tris = 0;
      for (const p of parts) {
        const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.75, flatShading: li >= 2 });
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.position.y = p.y;
        if (p.s) mesh.scale.setScalar(p.s);
        grp.add(mesh);
        mats.push({ mat, base: p.color });
        tris += triCount(p.geo);
        this._disposables.push(p.geo, mat);
      }
      grp.visible = false;
      root.add(grp);
      return { grp, mats, tris };
    });
    const top = sp.kind === 'tree' ? 4.6 : sp.kind === 'crystal' ? 3.6 : 2.4;
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false, sizeAttenuation: false }));
    lab.position.y = top;
    lab.scale.set(0.2, 0.04, 1);
    lab.renderOrder = 10;
    lab.visible = false;
    root.add(lab);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    glow.position.y = top * 0.4;
    glow.scale.setScalar(4);
    root.add(glow);
    this.scene.add(root);
    this._disposables.push(lab.material, glow.material);
    return { sp, root, levels, lab, glow, labCache: new Map(), cur: -1, prev: -1, fadeT: 1, glowT: 0, phase: 0, labKey: '', dist: 0 };
  }

  reset() {
    this.yaw = 0.35;
    this.pitch = 0.42;
    this.dist = 12;
    this.cyaw = this.yaw;
    this.cpitch = this.pitch;
    this.cdist = this.dist;
    this.target = new THREE.Vector3(0, 0.8, 0);
    this.ctarget = this.target.clone();
    this.done = false;
    for (const o of this.objs) {
      o.cur = -1; o.prev = -1; o.phase = 0; o.fadeT = 1; o.glowT = 0;
      o.glow.material.opacity = 0;
    }
    this._applyCam();
    this._applyStyle();
  }

  onSetting(key, value) {
    this.s[key] = value;
    const s = this.s;
    // d1 < d2 < d3 zorla (panel kaydırıcıları da güncellenir)
    const fix = (k, v) => { if (s[k] !== v) this.setSetting(k, v); };
    if (key === 'd1') { fix('d2', Math.max(s.d2, value + 1)); fix('d3', Math.max(s.d3, s.d2 + 1)); }
    if (key === 'd2') { fix('d1', Math.min(s.d1, value - 1)); fix('d3', Math.max(s.d3, value + 1)); }
    if (key === 'd3') { fix('d2', Math.min(s.d2, value - 1)); fix('d1', Math.min(s.d1, s.d2 - 1)); }
    this._applyStyle();
  }

  onTech() {}

  _applyStyle() {
    this.objs.forEach((o) =>
      o.levels.forEach((L, i) => {
        for (const m of L.mats) {
          m.mat.color.setHex(this.s.colorize ? LEVEL_COLORS[i] : m.base);
          m.mat.wireframe = !!this.s.wire;
        }
      })
    );
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _applyCam() {
    const cp = Math.cos(this.cpitch);
    this.camera.position.set(
      this.ctarget.x + Math.sin(this.cyaw) * cp * this.cdist,
      this.ctarget.y + Math.sin(this.cpitch) * this.cdist,
      this.ctarget.z + Math.cos(this.cyaw) * cp * this.cdist
    );
    this.camera.lookAt(this.ctarget);
  }

  _levelFor(d) {
    if (!this.s.lodOn) return 0;
    const { d1, d2, d3 } = this.s;
    return d < d1 ? 0 : d < d2 ? 1 : d < d3 ? 2 : 3;
  }

  _setLevelVis(o) {
    o.levels.forEach((L, i) => {
      let op = 0;
      if (o.fadeT >= 1) op = i === o.cur ? 1 : 0;
      else if (i === o.cur) op = o.fadeT;
      else if (i === o.prev) op = 1 - o.fadeT;
      L.grp.visible = op > 0.001;
      const fading = op > 0 && op < 1;
      for (const m of L.mats) {
        const was = m.mat.transparent;
        m.mat.transparent = fading;
        m.mat.opacity = op;
        m.mat.depthWrite = !fading || i === o.cur;
        if (was !== fading) m.mat.needsUpdate = true;
      }
    });
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const inp = this.input;
    const p = inp.pointer;
    const red = !!this.reduced;
    if (p.down) {
      this.yaw -= (p.dx || 0) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (p.dy || 0) * 0.005, 0.08, 1.4);
    }
    if (p.wheel) this.dist *= Math.exp(p.wheel * 0.0012);
    if (p.pinch && p.pinch !== 1) this.dist /= p.pinch;
    this.dist = THREE.MathUtils.clamp(this.dist, 3, 60);
    const ax = inp.axis || { x: 0, y: 0 };
    if (ax.x || ax.y) {
      // axis.y < 0 = ileri (ekran koordinatı)
      const sp = 8 * Math.max(0.5, this.dist / 12);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      this.target.x = THREE.MathUtils.clamp(this.target.x + (fx * -ax.y + rx * ax.x) * sp * dt, -50, 50);
      this.target.z = THREE.MathUtils.clamp(this.target.z + (fz * -ax.y + rz * ax.x) * sp * dt, -60, 30);
    }
    const kk = 1 - Math.exp(-dt * (red ? 30 : 11));
    this.cyaw += (this.yaw - this.cyaw) * kk;
    this.cpitch += (this.pitch - this.cpitch) * kk;
    this.cdist += (this.dist - this.cdist) * kk;
    this.ctarget.lerp(this.target, kk);
    this._applyCam();

    const cam = this.camera.position;
    let drawn = 0, full = 0;
    const per = [];
    for (const o of this.objs) {
      const d = cam.distanceTo(o.root.position);
      const want = this._levelFor(d);
      if (want !== o.cur) {
        const first = o.cur < 0;
        o.prev = o.cur;
        o.cur = want;
        o.fadeT = first || !this.s.fade ? 1 : 0;
        if (!first && !this.s.fade) {
          if (!red) o.glowT = GLOW_T;
          if (this.audio) this.audio.play('tick');
        }
        this._questStep(o);
      }
      if (o.fadeT < 1) o.fadeT = Math.min(1, o.fadeT + dt / FADE_T);
      if (o.fadeT >= 1) o.prev = -1;
      this._setLevelVis(o);
      if (o.glowT > 0) {
        o.glowT -= dt;
        o.glow.material.opacity = Math.max(0, o.glowT / GLOW_T);
      } else o.glow.material.opacity = 0;
      const t = o.levels[o.cur].tris;
      drawn += t;
      full += o.levels[0].tris;
      per.push(t);
      o.dist = d;
    }

    const tech = !!this.tech;
    this.rings.forEach((r, i) => {
      r.visible = tech && !!this.s.lodOn;
      const R = [this.s.d1, this.s.d2, this.s.d3][i];
      r.scale.set(R, 1, R);
      r.position.x = cam.x;
      r.position.z = cam.z;
    });
    for (const o of this.objs) {
      o.lab.visible = tech;
      if (!tech) continue;
      const txt = `LOD${o.cur + 1} · ${fmt(o.levels[o.cur].tris)} ▲`;
      if (txt !== o.labKey) {
        o.labKey = txt;
        let t = o.labCache.get(txt);
        if (!t) { t = this._label(txt); o.labCache.set(txt, t); }
        o.lab.material.map = t;
        o.lab.material.needsUpdate = true;
      }
    }

    const left = [`Çizilen üçgen: ${fmt(drawn)}`];
    const right = [];
    if (tech) {
      left.push(`LOD kapalı olsaydı: ${fmt(full)}`);
      left.push(`Tasarruf: %${Math.round((1 - drawn / full) * 100)}`);
      right.push('Nesne başına:');
      this.objs.forEach((o, i) => right.push(`${o.sp.name} ${i + 1}: L${o.cur + 1} · ${fmt(per[i])} · ${o.dist.toFixed(1)} m`));
    }
    this.hud({ left, right });

    if (!this._rq) this._rq = requestAnimationFrame(() => { this._rq = 0; if (this.renderer) this.renderer.render(this.scene, this.camera); });
  }

  // Görev: bir ağaç seviye 1 → 3/4 → tekrar 1
  _questStep(o) {
    if (this.done || o.sp.kind !== 'tree' || !this.s.lodOn) return;
    if (o.phase === 0 && o.cur === 0) o.phase = 1;
    else if (o.phase === 1 && o.cur >= 2) o.phase = 2;
    else if (o.phase === 2 && o.cur === 0) {
      this.done = true;
      if (this.audio) this.audio.play('success');
      this.complete({ text: this.cfg && this.cfg.lesson });
    }
  }

  dispose() {
    cancelAnimationFrame(this._rq);
    for (const d of this._disposables) if (d.dispose) d.dispose();
    for (const o of this.objs) for (const t of o.labCache.values()) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
