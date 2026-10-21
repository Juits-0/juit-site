import * as THREE from 'three';
import { Experiment } from '../core/experiment.js';

// =====================================================================
//  AYNA ODASI — aynı sahne, üç farklı yansıma yöntemi.
//   bake   : CubeCamera ile bir kere çekilmiş sabit çevre haritası
//   ssr    : "Ekran bilgisi" — GERÇEK SSR ray-march DEĞİL, basitleştirilmiş simülasyon
//   planar : ayna düzlemine göre yansıtılmış ikinci kamera (Reflector mantığı)
// =====================================================================

const COL = { bg: 0x0a0a0a, purple: 0x8b3dff, glow: 0xb67cff, lav: 0xe9ddff, white: 0xf5f5f5, red: 0xef4a5c, gold: 0xf5c542 };

// Oda (dünya birimi ≈ metre). Ön taraf açık, kamera oradan bakar.
const ROOM = { x0: -8, x1: 8, z0: -6, z1: 10, h: 6 };
// Ayna: arka duvarda, +z'ye bakan düzlem
const MIR = { z: -5.9, w: 7, h: 3.4, cy: 2.35 };
const PROBE = new THREE.Vector3(0, MIR.cy, MIR.z + 0.2);   // küp harita kamerası: aynanın hemen önünde
const PEND = { px: 0, py: 5.6, pz: -2.6, len: 2.8, amp: 0.9 };
const CUBE = { x: 4.2, z: -5.0, s: 0.9 };

// Katmanlar: hangi geçiş neyi çizer
const L_WORLD = 0, L_MIRROR = 1, L_QUAD = 2, L_FRAME = 3, L_TECH = 4;
const bit = (...ls) => ls.reduce((m, l) => m | (1 << l), 0);
const MASK_NORMAL = bit(L_WORLD, L_MIRROR, L_FRAME, L_TECH);   // bake + planar ana çizim
const MASK_SSR_MAIN = bit(L_WORLD, L_FRAME);                   // SSR: ayna hariç sahne
const MASK_SSR_FINAL = bit(L_MIRROR, L_QUAD, L_TECH);          // SSR: birleştirme geçişi
const MASK_REFL = bit(L_WORLD);                                // yansıma kamerası / küp harita

const METHODS = {
  bake: {
    name: 'Sabit çevre yansıması',
    short: 'Sabit çevre',
    limit: 'Hareket eden hiçbir şey yansımada güncellenmez.',
  },
  ssr: {
    name: 'Basitleştirilmiş SSR simülasyonu (gerçek ray-march değil)',
    short: 'SSR sim.',
    limit: 'Ekran dışındaki ya da kameranın görmediği şey yansımada yok.',
  },
  planar: {
    name: 'Ayna kamerası (düzlemsel yansıma)',
    short: 'Ayna kamerası',
    limit: 'Her şey doğru yansır; bedeli: sahne iki kez çizilir.',
  },
};

const GOALS = [
  { text: 'Topu kameranın görüşünden çıkar. Aynada ne oluyor?', short: 'Topu görüşten çıkar', done: 'Top görüşten çıktı' },
  { text: 'Aynanın önünden geç. Hangi yöntem hareketini takip ediyor?', short: 'Aynanın önünden geç', done: 'Aynanın önünden geçtin' },
  { text: 'Kamera açısını değiştir, kaybolan yansımayı bul.', short: 'Kamerayı 60°+ çevir', done: 'Kamera 60°+ döndü' },
];

// ---------------------------------------------------------------- shader'lar
const MIRROR_VERT = /* glsl */ `
uniform mat4 uTexMat;
varying vec3 vWorld;
varying vec4 vTex;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vTex = uTexMat * wp;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const MIRROR_GLASS = /* glsl */ `
// aynanın iç kenarında ince mor parıltı + hafif cam tonu
vec3 glass(vec3 c, vec2 uv) {
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.03, 0.0, min(e.x * 2.06, e.y));
  c = c * 0.93 + vec3(0.010, 0.006, 0.020);
  return mix(c, vec3(0.55, 0.30, 1.0), edge * 0.35);
}`;

const PLANAR_FRAG = /* glsl */ `
uniform sampler2D tRefl;
varying vec4 vTex;
varying vec2 vUv;
${MIRROR_GLASS}
void main() {
  vec3 c = texture2D(tRefl, vTex.xy / vTex.w).rgb;
  gl_FragColor = vec4(glass(c, vUv), 1.0);
  #include <colorspace_fragment>
}`;

const BAKE_FRAG = /* glsl */ `
uniform samplerCube tCube;
uniform vec3 uProbe;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uBox;
varying vec3 vWorld;
varying vec2 vUv;
${MIRROR_GLASS}
void main() {
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 r = reflect(v, vec3(0.0, 0.0, 1.0));
  // kutu projeksiyonu: oda duvarlarına çarpan nokta, probe'a göre yön
  vec3 t1 = (uBoxMax - vWorld) / r;
  vec3 t2 = (uBoxMin - vWorld) / r;
  vec3 tm = max(t1, t2);
  float t = min(min(tm.x, tm.y), tm.z);
  vec3 dir = uBox > 0.5 ? vWorld + r * t - uProbe : r;
  vec3 c = textureCube(tCube, dir).rgb;
  gl_FragColor = vec4(glass(c, vUv), 1.0);
  #include <colorspace_fragment>
}`;

const SSR_FRAG = /* glsl */ `
uniform sampler2D tRefl;        // yansıma kamerası rengi
uniform sampler2D tReflDepth;   // yansıma kamerası derinliği
uniform mat4 uReflInv;          // (yansıma proj * view)^-1
uniform sampler2D tMain;        // ana kamera rengi (ayna hariç)
uniform sampler2D tMainDepth;   // ana kamera derinliği
uniform mat4 uMainVP;
uniform float uNear;
uniform float uFar;
uniform float uPx;
uniform float uTech;
varying vec4 vTex;
varying vec2 vUv;
${MIRROR_GLASS}
float eyeZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
vec3 voidTex() {
  float s = (gl_FragCoord.x + gl_FragCoord.y) / (16.0 * uPx);
  float stripe = step(0.5, fract(s));
  vec3 base = mix(vec3(0.075, 0.068, 0.092), vec3(0.115, 0.085, 0.165), stripe);
  return base;
}
void main() {
  vec2 ruv = vTex.xy / vTex.w;
  float rd = texture2D(tReflDepth, ruv).r;
  vec3 col;
  float voidness = 0.0;
  if (rd >= 0.99999) {
    // yansıma kamerası hiçbir şey görmedi: oda dışı / arka plan
    col = texture2D(tRefl, ruv).rgb;
  } else {
    // yansıyan dünya noktasını yansıma kamerasının derinliğinden yeniden kur
    vec4 ndc = vec4(ruv * 2.0 - 1.0, rd * 2.0 - 1.0, 1.0);
    vec4 wp = uReflInv * ndc;
    vec3 P = wp.xyz / wp.w;
    // bu noktayı ANA kameraya projekte et
    vec4 clip = uMainVP * vec4(P, 1.0);
    vec2 muv = clip.xy / clip.w * 0.5 + 0.5;
    float pd = clip.z / clip.w * 0.5 + 0.5;
    bool inFront = clip.w > 0.0;
    bool onScreen = inFront && muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0;
    if (!onScreen) {
      voidness = 1.0;
    } else {
      float eP = eyeZ(pd);
      float eM = eyeZ(texture2D(tMainDepth, muv).r);
      float bias = 0.10 + 0.012 * eP;
      if (eP > eM + bias) voidness = 1.0;   // ana kamera bu noktayı görmüyor (örtülü)
      float m = min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y));
      voidness = max(voidness, 1.0 - smoothstep(0.0, 0.05, m));
    }
    col = texture2D(tMain, clamp(muv, 0.0, 1.0)).rgb;
  }
  vec3 outc = mix(col, voidTex(), voidness);
  // sRGB'ye çevrilmiş boşluk rengi ile karışmasın diye: boşluk dokusu doğrusal değer olarak verildi
  gl_FragColor = vec4(glass(outc, vUv), 1.0);
  #include <colorspace_fragment>
}`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const QUAD_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tColor, vUv);
  gl_FragDepth = texture2D(tDepth, vUv).r;
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- yardımcılar
const setLayer = (obj, l) => obj.traverse((o) => o.layers.set(l));
const clamp = THREE.MathUtils.clamp;

function clipPoly(poly, x0, x1, z0, z1) {
  const planes = [
    (p) => p[0] - x0, (p) => x1 - p[0], (p) => p[1] - z0, (p) => z1 - p[1],
  ];
  let out = poly;
  for (const f of planes) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!out.length) break;
  }
  return out;
}

export default class AynaExperiment extends Experiment {
  static id = 'ayna';
  static kind = 'dom';
  static controls = {
    joystick: true,
    buttons: [{ name: 'action', label: 'İT' }],
    pointer: 'aim',
    hint: 'WASD: Mobu yürür · Sürükle: kamera · E: topu it',
  };
  static settings = [
    {
      key: 'method', type: 'select', label: 'Yansıma yöntemi', group: 'Ayna', default: 'bake', value: 'bake',
      options: [
        { value: 'bake', label: 'Sabit çevre' },
        { value: 'ssr', label: 'Ekran bilgisi (SSR sim.)' },
        { value: 'planar', label: 'Ayna kamerası' },
      ],
    },
    { key: 'rebake', type: 'button', label: 'Haritayı yeniden al', group: 'Ayna' },
    {
      key: 'mirrorRes', type: 'select', label: 'Ayna çözünürlüğü', group: 'Ayna', default: '512', value: '512',
      options: [
        { value: '256', label: '256' },
        { value: '512', label: '512' },
        { value: '1024', label: '1024' },
      ],
    },
    { key: 'pendulum', type: 'toggle', label: 'Hareketli nesne', group: 'Sahne', default: true, value: true },
  ];

  // ------------------------------------------------------------------ init
  init() {
    const c = this.container;
    this.s = this.s || {};
    for (const d of AynaExperiment.settings) if (d.default !== undefined && this.s[d.key] === undefined) this.s[d.key] = d.default;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(COL.bg, 1);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    c.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.bg);
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 80);
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.layers.mask = MASK_REFL;

    this._disposables = [];
    this._tmp = { v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(), m4: new THREE.Matrix4(), plane: new THREE.Plane(), v4: new THREE.Vector4(), q: new THREE.Vector4(), fr: new THREE.Frustum(), sph: new THREE.Sphere(), pv: new THREE.Matrix4() };
    this.texMat = new THREE.Matrix4();
    this._clipPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -MIR.z)];
    this.reflInv = new THREE.Matrix4();

    this._buildRoom();
    this._buildMirror();
    this._buildObjects();
    this._buildTech();
    this._buildOverlay();

    // kamera durumu
    this.cam = { yaw: 0, pitch: 0.42, dist: 10.5, cyaw: 0, cpitch: 0.42, cdist: 10.5, target: new THREE.Vector3(), ctarget: new THREE.Vector3() };

    this.ft = []; this.cpuT = []; this._lastNow = 0; this._hudT = 0;
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (this._ro) this._ro.observe(c);

    this._applyMethod(true);
    this.resize();
    this.reset();
    this._raf = requestAnimationFrame(this._loop);
  }

  // ------------------------------------------------------------ oda
  _buildRoom() {
    const sc = this.scene;
    const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0;
    const mk = (g, m) => { this._disposables.push(g, m); return new THREE.Mesh(g, m); };

    sc.add(new THREE.AmbientLight(0xa090d0, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(3, 9, 7);
    sc.add(sun);
    const pl = new THREE.PointLight(COL.purple, 90, 0, 2);
    pl.position.set(0, 5.3, MIR.z + 0.6);
    sc.add(pl);

    const floor = mk(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (ROOM.z0 + ROOM.z1) / 2);
    sc.add(floor);

    const grid = new THREE.GridHelper(W, W, 0x4a2d86, 0x2a2140);
    grid.scale.z = D / W;
    grid.position.set(0, 0.005, (ROOM.z0 + ROOM.z1) / 2);
    this._disposables.push(grid.geometry, grid.material);
    sc.add(grid);

    const wallMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
    const back = mk(new THREE.PlaneGeometry(W, ROOM.h), wallMat(0x1e1d27));
    back.position.set(0, ROOM.h / 2, ROOM.z0);
    sc.add(back);
    const left = mk(new THREE.PlaneGeometry(D, ROOM.h), wallMat(0x18171f));
    left.rotation.y = Math.PI / 2;
    left.position.set(ROOM.x0, ROOM.h / 2, (ROOM.z0 + ROOM.z1) / 2);
    sc.add(left);
    const right = mk(new THREE.PlaneGeometry(D, ROOM.h), wallMat(0x18171f));
    right.rotation.y = -Math.PI / 2;
    right.position.set(ROOM.x1, ROOM.h / 2, (ROOM.z0 + ROOM.z1) / 2);
    sc.add(right);

    // mor kenar ışıkları (simetrik): zemin-duvar birleşimleri + köşe sütunları
    const strip = (w, h, d, x, y, z) => {
      const s = mk(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: COL.purple }));
      s.position.set(x, y, z);
      sc.add(s);
    };
    const zc = (ROOM.z0 + ROOM.z1) / 2;
    strip(W, 0.07, 0.07, 0, 0.035, ROOM.z0 + 0.035);
    strip(0.07, 0.07, D, ROOM.x0 + 0.035, 0.035, zc);
    strip(0.07, 0.07, D, ROOM.x1 - 0.035, 0.035, zc);
    strip(0.07, ROOM.h, 0.07, ROOM.x0 + 0.035, ROOM.h / 2, ROOM.z0 + 0.035);
    strip(0.07, ROOM.h, 0.07, ROOM.x1 - 0.035, ROOM.h / 2, ROOM.z0 + 0.035);

    // sarkaç kirişi
    const beam = mk(new THREE.BoxGeometry(W, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.6, metalness: 0.4 }));
    beam.position.set(0, PEND.py + 0.07, PEND.pz);
    sc.add(beam);

    // yumuşak gölge dokusu
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.65)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this.blobTex = new THREE.CanvasTexture(cv);
    this._disposables.push(this.blobTex);
  }

  _blob(radius) {
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const m = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false });
    this._disposables.push(g, m);
    const b = new THREE.Mesh(g, m);
    b.rotation.x = -Math.PI / 2;
    b.position.y = 0.012;
    b.renderOrder = 1;
    return b;
  }

  // ------------------------------------------------------------ ayna
  _buildMirror() {
    const sc = this.scene;
    const g = new THREE.PlaneGeometry(MIR.w, MIR.h);
    this.mirrorGeo = g;
    this._disposables.push(g);
    this.mirror = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    this.mirror.position.set(0, MIR.cy, MIR.z);
    this.mirror.frustumCulled = false;
    this.mirror.updateMatrixWorld();
    setLayer(this.mirror, L_MIRROR);
    sc.add(this.mirror);

    // çerçeve (4 kutu) — simetrik
    const frame = new THREE.Group();
    const fm = new THREE.MeshStandardMaterial({ color: 0x2c2b36, roughness: 0.45, metalness: 0.6 });
    const lm = new THREE.MeshBasicMaterial({ color: COL.glow });
    this._disposables.push(fm, lm);
    const t = 0.22, dpt = 0.12;
    const add = (w, h, x, y, mat = fm, d = dpt, z = 0) => {
      const bg = new THREE.BoxGeometry(w, h, d);
      this._disposables.push(bg);
      const b = new THREE.Mesh(bg, mat);
      b.position.set(x, y, z);
      frame.add(b);
    };
    const hw = MIR.w / 2, hh = MIR.h / 2;
    add(MIR.w + t * 2, t, 0, hh + t / 2);
    add(MIR.w + t * 2, t, 0, -hh - t / 2);
    add(t, MIR.h, -hw - t / 2, 0);
    add(t, MIR.h, hw + t / 2, 0);
    // ince açık iç çizgi
    add(MIR.w + 0.03, 0.03, 0, hh + 0.015, lm, 0.02, 0.07);
    add(MIR.w + 0.03, 0.03, 0, -hh - 0.015, lm, 0.02, 0.07);
    add(0.03, MIR.h, -hw - 0.015, 0, lm, 0.02, 0.07);
    add(0.03, MIR.h, hw + 0.015, 0, lm, 0.02, 0.07);
    frame.position.set(0, MIR.cy, MIR.z - 0.01);
    setLayer(frame, L_FRAME);
    sc.add(frame);
    this.frame = frame;

    // malzemeler
    this.uPlanar = { tRefl: { value: null }, uTexMat: { value: this.texMat } };
    this.matPlanar = new THREE.ShaderMaterial({ uniforms: this.uPlanar, vertexShader: MIRROR_VERT, fragmentShader: PLANAR_FRAG });

    this.uBake = {
      tCube: { value: null }, uProbe: { value: PROBE },
      uBoxMin: { value: new THREE.Vector3(ROOM.x0, 0, ROOM.z0) },
      uBoxMax: { value: new THREE.Vector3(ROOM.x1, ROOM.h, ROOM.z1) },
      uTexMat: { value: this.texMat }, uBox: { value: 1 },
    };
    this.matBake = new THREE.ShaderMaterial({ uniforms: this.uBake, vertexShader: MIRROR_VERT, fragmentShader: BAKE_FRAG });

    this.uSsr = {
      tRefl: { value: null }, tReflDepth: { value: null }, uReflInv: { value: this.reflInv },
      tMain: { value: null }, tMainDepth: { value: null }, uMainVP: { value: new THREE.Matrix4() },
      uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
      uPx: { value: 1 }, uTech: { value: 0 }, uTexMat: { value: this.texMat },
    };
    this.matSsr = new THREE.ShaderMaterial({ uniforms: this.uSsr, vertexShader: MIRROR_VERT, fragmentShader: SSR_FRAG });
    this._disposables.push(this.matPlanar, this.matBake, this.matSsr);

    // SSR birleştirme dörtgeni (sahne rengi + derinliği ekrana yazar)
    this.uQuad = { tColor: { value: null }, tDepth: { value: null } };
    const qm = new THREE.ShaderMaterial({ uniforms: this.uQuad, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    const qg = new THREE.PlaneGeometry(2, 2);
    this._disposables.push(qm, qg);
    this.quad = new THREE.Mesh(qg, qm);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -10;
    setLayer(this.quad, L_QUAD);
    sc.add(this.quad);

    // küp harita (bake)
    this.cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(0.2, 60, this.cubeRT);
    this.cubeCam.layers.mask = MASK_REFL;
    this.cubeCam.position.copy(PROBE);
    this.uBake.tCube.value = this.cubeRT.texture;
    this._disposables.push(this.cubeRT);
    this.bakeCount = 0;
  }

  // ------------------------------------------------------------ nesneler
  _buildObjects() {
    const sc = this.scene;
    const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra }); this._disposables.push(m); return m; };
    const mk = (g, m) => { this._disposables.push(g); return new THREE.Mesh(g, m); };

    // ---- Mobu
    const mobu = (this.mobu = new THREE.Group());
    const inner = (this.mobuIn = new THREE.Group());
    mobu.add(inner);
    const purple = std(COL.purple), purple2 = std(0x9a52ff), lav = std(COL.lav, { roughness: 0.8 });
    const dark = std(0x16101f, { roughness: 0.9 });

    const body = mk(new THREE.CapsuleGeometry(0.4, 0.34, 6, 18), purple);
    body.scale.z = 0.9;
    body.position.y = 0.66;
    inner.add(body);
    const head = mk(new THREE.SphereGeometry(0.58, 28, 20), purple2);
    head.scale.set(1.08, 0.95, 0.98);
    head.position.y = 1.55;
    inner.add(head);
    for (const sx of [-1, 1]) {
      const ear = mk(new THREE.SphereGeometry(0.21, 14, 10), purple2);
      ear.scale.z = 0.55;
      ear.position.set(sx * 0.62, 1.78, -0.02);
      inner.add(ear);
      const ei = mk(new THREE.SphereGeometry(0.12, 12, 8), lav);
      ei.scale.z = 0.4;
      ei.position.set(sx * 0.62, 1.78, 0.09);
      inner.add(ei);
    }
    // yüz diski
    const face = mk(new THREE.SphereGeometry(1, 24, 16), lav);
    face.scale.set(0.41, 0.37, 0.2);
    face.position.set(0, 1.48, 0.42);
    inner.add(face);
    // gözler: yarım kapalı çizgiler
    for (const sx of [-1, 1]) {
      const eye = mk(new THREE.BoxGeometry(0.15, 0.034, 0.02), dark);
      eye.position.set(sx * 0.165, 1.55, 0.612);
      eye.rotation.z = sx * -0.12;
      inner.add(eye);
    }
    const smile = mk(new THREE.TorusGeometry(0.09, 0.014, 6, 18, Math.PI), dark);
    smile.rotation.z = Math.PI;
    smile.position.set(0, 1.43, 0.615);
    inner.add(smile);
    // kalp lekesi (göğüs)
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.5);
    hs.bezierCurveTo(-0.15, -0.35, -0.55, -0.1, -0.55, 0.2);
    hs.bezierCurveTo(-0.55, 0.5, -0.1, 0.55, 0, 0.28);
    hs.bezierCurveTo(0.1, 0.55, 0.55, 0.5, 0.55, 0.2);
    hs.bezierCurveTo(0.55, -0.1, 0.15, -0.35, 0, -0.5);
    const heart = mk(new THREE.ExtrudeGeometry(hs, { depth: 0.05, bevelEnabled: false }), lav);
    heart.scale.set(0.34, 0.34, 1);
    heart.position.set(0, 0.66, 0.345);
    inner.add(heart);
    // saç tutamları: sağa yatık 3 koni
    [[-0.12, 2.04, -0.45], [0.0, 2.09, -0.68], [0.12, 2.04, -0.9]].forEach(([x, y, rz]) => {
      const cone = mk(new THREE.ConeGeometry(0.06, 0.24, 8), purple);
      cone.position.set(x, y, 0.02);
      cone.rotation.z = rz;
      inner.add(cone);
    });
    // kollar & ayaklar (yürüme animasyonu için pivotlu)
    this.mobuArms = [];
    for (const sx of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(sx * 0.46, 0.98, 0);
      const arm = mk(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), purple);
      arm.position.y = -0.2;
      piv.add(arm);
      piv.rotation.z = sx * 0.25;
      inner.add(piv);
      this.mobuArms.push(piv);
    }
    this.mobuFeet = [];
    for (const sx of [-1, 1]) {
      const foot = mk(new THREE.SphereGeometry(0.15, 12, 8), std(0x5a24b8));
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(sx * 0.2, 0.08, 0.05);
      inner.add(foot);
      this.mobuFeet.push(foot);
    }
    this.mobuBlob = this._blob(0.65);
    sc.add(this.mobuBlob);
    sc.add(mobu);

    // ---- kırmızı top
    const ball = (this.ballMesh = new THREE.Group());
    const bs = mk(new THREE.SphereGeometry(0.35, 22, 16), std(COL.red, { roughness: 0.4 }));
    ball.add(bs);
    const belt = mk(new THREE.TorusGeometry(0.352, 0.035, 6, 24), std(0xffd5da));
    ball.add(belt);
    const belt2 = belt.clone();
    belt2.rotation.y = Math.PI / 2;
    ball.add(belt2);
    this.ballBlob = this._blob(0.5);
    sc.add(this.ballBlob);
    sc.add(ball);

    // ---- altın küp
    const cube = mk(new THREE.BoxGeometry(CUBE.s, CUBE.s, CUBE.s), std(COL.gold, { roughness: 0.3, metalness: 0.5 }));
    cube.position.set(CUBE.x, CUBE.s / 2, CUBE.z);
    cube.rotation.y = 0.5;
    sc.add(cube);
    const cb = this._blob(0.85);
    cb.position.set(CUBE.x, 0.012, CUBE.z);
    sc.add(cb);

    // ---- sarkaç
    const pend = (this.pend = new THREE.Group());
    pend.position.set(PEND.px, PEND.py, PEND.pz);
    const rod = mk(new THREE.CylinderGeometry(0.025, 0.025, PEND.len, 6), std(0x8c8c8c, { metalness: 0.6, roughness: 0.4 }));
    rod.position.y = -PEND.len / 2;
    pend.add(rod);
    const bob = mk(new THREE.SphereGeometry(0.38, 22, 16), std(0x6d2bd6, { emissive: 0x3a1480, roughness: 0.35 }));
    bob.position.y = -PEND.len;
    pend.add(bob);
    sc.add(pend);
    this.pendBob = bob;
    this.pendBlob = this._blob(0.55);
    sc.add(this.pendBlob);

    this.v = new THREE.Vector3(); // Mobu hızı
    this.ball = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0.35 };
  }

  // ------------------------------------------------------------ teknik görünüm
  _buildTech() {
    const g = (this.techGroup = new THREE.Group());
    // aynanın gördüğü bölge: köşe ışınları + kapak
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const lm = new THREE.LineBasicMaterial({ color: COL.glow, transparent: true, opacity: 0.85 });
    this.pyrLines = new THREE.LineSegments(lg, lm);
    this.pyrLines.frustumCulled = false;
    g.add(this.pyrLines);
    // zemindeki görünür bölge
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    const idx = [];
    for (let i = 1; i < 11; i++) idx.push(0, i, i + 1);
    fg.setIndex(idx);
    const fm = new THREE.MeshBasicMaterial({ color: COL.purple, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.wedgeMesh = new THREE.Mesh(fg, fm);
    this.wedgeMesh.frustumCulled = false;
    this.wedgeMesh.renderOrder = 2;
    g.add(this.wedgeMesh);
    this._disposables.push(lg, lm, fg, fm);
    setLayer(g, L_TECH);
    g.visible = false;
    this.scene.add(g);
  }

  _buildOverlay() {
    const ov = (this.overlay = document.createElement('div'));
    ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:600 11px "JetBrains Mono",ui-monospace,monospace;color:#F5F5F5';
    const lab = (txt, color) => {
      const d = document.createElement('div');
      d.textContent = txt;
      d.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);padding:3px 7px;border-radius:5px;background:rgba(10,10,10,.72);border:1px solid ${color};color:${color};white-space:nowrap;display:none`;
      ov.appendChild(d);
      return d;
    };
    this.labMirror = lab('', '#B67CFF');
    this.labSeen = lab('Aynanın gördüğü bölge', '#B67CFF');
    this.labUnseen = lab('Aynanın görmediği bölge', '#8C8C8C');
    // SSR ekran sınırı çerçevesi
    this.ssrFrame = document.createElement('div');
    this.ssrFrame.style.cssText = 'position:absolute;inset:3px;border:2px solid rgba(239,74,92,.85);border-radius:3px;display:none';
    const fl = document.createElement('div');
    fl.textContent = 'Ekran sınırı — dışı SSR’da yok';
    fl.style.cssText = 'position:absolute;right:8px;top:50%;padding:2px 6px;background:rgba(10,10,10,.72);color:#EF4A5C;border-radius:4px';
    this.ssrFrame.appendChild(fl);
    ov.appendChild(this.ssrFrame);
    // üstten harita
    const mm = (this.mini = document.createElement('canvas'));
    this.miniS = 168;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mm.width = mm.height = Math.round(this.miniS * dpr);
    mm.style.cssText = `position:absolute;left:10px;bottom:10px;width:${this.miniS}px;height:${this.miniS}px;border:1px solid rgba(139,61,255,.55);border-radius:6px;background:rgba(10,10,10,.78);display:none`;
    ov.appendChild(mm);
    this.container.appendChild(ov);
  }

  // ------------------------------------------------------------ yöntem / hedefler
  _applyMethod(silent) {
    const m = this.s.method || 'bake';
    this.method = m;
    this.mirror.material = m === 'bake' ? this.matBake : m === 'ssr' ? this.matSsr : this.matPlanar;
    this.camera.layers.mask = MASK_NORMAL;
    this._camBase = null;
    if (this.cam) this.cam.yaw0 = this.cam.yaw;
    this._hudDirty = true;
    this._refreshGoal();
  }

  _ensureTargets() {
    const r = this.renderer;
    const res = Number(this.s.mirrorRes) || 512;
    const needRefl = this.method !== 'bake';
    if (needRefl) {
      const wantDepth = this.method === 'ssr';
      if (!this.reflRT || this.reflRT.width !== res || !!this.reflRT.depthTexture !== wantDepth) {
        if (this.reflRT) { this.reflRT.depthTexture?.dispose(); this.reflRT.dispose(); }
        this.reflRT = new THREE.WebGLRenderTarget(res, res, {
          type: THREE.HalfFloatType, samples: wantDepth ? 0 : 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
        });
        if (wantDepth) {
          this.reflRT.depthTexture = new THREE.DepthTexture(res, res);
          this.reflRT.depthTexture.minFilter = THREE.NearestFilter;
          this.reflRT.depthTexture.magFilter = THREE.NearestFilter;
        }
      }
    }
    if (this.method === 'ssr') {
      const size = r.getDrawingBufferSize((this._sz = this._sz || new THREE.Vector2()));
      const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
      if (!this.mainRT || this.mainRT.width !== w || this.mainRT.height !== h) {
        if (this.mainRT) { this.mainRT.depthTexture?.dispose(); this.mainRT.dispose(); }
        this.mainRT = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType, samples: 4, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
        });
        this.mainRT.depthTexture = new THREE.DepthTexture(w, h);
        this.mainRT.depthTexture.minFilter = THREE.NearestFilter;
        this.mainRT.depthTexture.magFilter = THREE.NearestFilter;
      }
    }
  }

  _credit(i) {
    if (this.done) return;
    const set = this.prog[i];
    if (set.has(this.method)) return;
    set.add(this.method);
    this.toast(`✓ ${GOALS[i].done} — ${METHODS[this.method].short}`);
    if (this.audio) this.audio.play('success');
    this._hudDirty = true;
    this._refreshGoal();
    if (this.prog.every((s) => s.size >= 2)) {
      this.done = true;
      this.setGoal('Tamam: üç görevi iki farklı yöntemde denedin.');
      this.complete({ title: 'Ayna odası', text: this.cfg && this.cfg.lesson });
    }
  }

  _refreshGoal() {
    if (!this.prog || this.done) return;
    let t;
    const first = this.prog.findIndex((s) => s.size === 0);
    if (first >= 0) t = GOALS[first].text;
    else {
      const miss = this.prog.map((s, i) => (s.has(this.method) ? -1 : i)).filter((i) => i >= 0);
      if (miss.length) t = `Bu yöntemde de dene (${METHODS[this.method].short}): ${miss.map((i) => GOALS[i].short.toLowerCase()).join(', ')}.`;
      else t = 'Bu yöntemde tamam. Yöntemi değiştir ve görevleri orada da dene.';
    }
    if (t !== this._goalTxt) { this._goalTxt = t; this.setGoal(t); }
  }

  // ------------------------------------------------------------ yaşam döngüsü
  reset() {
    this.mobu.position.set(0, 0, 3);
    this.mobu.rotation.y = 0;
    this.v.set(0, 0, 0);
    this.walkPhase = 0;
    this.kick = 0;
    this.ball.p.set(2.6, this.ball.r, 1.8);
    this.ball.v.set(0, 0, 0);
    this.ball.q = new THREE.Quaternion();
    this.pendPhase = 0.9;
    this.cam.yaw = this.cam.cyaw = 0;
    this.cam.pitch = this.cam.cpitch = 0.42;
    this.cam.dist = this.cam.cdist = 10.5;
    this.cam.target.set(this.mobu.position.x, 1, this.mobu.position.z);
    this.cam.ctarget.copy(this.cam.target);
    this.cam.yaw0 = 0;
    this.prog = [new Set(), new Set(), new Set()];
    this.done = false;
    this._goalTxt = null;
    this._ballOut = false;
    this._syncObjects(0);
    this._applyCam();
    this._bake();
    this._hudDirty = true;
    this._refreshGoal();
  }

  _bake() {
    // ayna ve çerçeve gizli, sadece dünya katmanı; sahnenin ŞU ANKİ hâli bir kere çekilir
    this.scene.updateMatrixWorld(true);
    const wasTech = this.techGroup.visible;
    this.techGroup.visible = false;
    this.cubeCam.position.copy(PROBE);
    this.cubeCam.update(this.renderer, this.scene);
    this.techGroup.visible = wasTech;
    this.bakeCount++;
  }

  onSetting(key, value) {
    if (key === 'rebake') {
      this._bake();
      this.toast(this.method === 'bake'
        ? 'Çevre haritası bu anın görüntüsüyle yenilendi — yine donmuş durumda.'
        : 'Bu yöntem çevre haritası kullanmıyor; harita yine de güncellendi, "Sabit çevre"ye geçince bu anı göreceksin.');
      if (this.audio) this.audio.play('click');
      return;
    }
    this.s[key] = value;
    if (key === 'method') {
      this._applyMethod();
      this.toast(METHODS[this.method].name);
    } else if (key === 'mirrorRes') {
      this._hudDirty = true;
    } else if (key === 'pendulum') {
      this.pend.visible = this.pendBlob.visible = !!value;
    }
  }

  onTech(on) {
    this.tech = on;
    this._hudDirty = true;
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // dar (dikey) ekranda yatay görüş açısı daralmasın: dikey FOV büyütülür
    const a = w / h;
    this.camera.fov = a >= 1.4 ? 52 : Math.min(88, (2 * Math.atan(Math.tan((26 * Math.PI) / 180) * 1.4 / a) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
    // dar (telefon) ekranda minimap joystick/düğmenin arasına, alt ortaya
    this._narrow = w < 600;
    if (this.mini) {
      const sz = this._narrow ? 112 : 168;
      this.miniS = sz;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.mini.width = this.mini.height = Math.round(sz * dpr);
      this.mini.style.width = this.mini.style.height = sz + 'px';
      this.mini.style.left = this._narrow ? '50%' : '10px';
      this.mini.style.transform = this._narrow ? 'translateX(-50%)' : 'none';
    }
  }

  // ------------------------------------------------------------ simülasyon
  // Çekirdek update'i sabit 1/120 sn adımla çağırır; çizim ayrı, kare başına bir kez (kendi rAF'ımızda).
  update(dt) {
    dt = Math.min(dt, 0.1);
    this._dt = dt;
    this._input(dt);
    this._simulate(dt);
    this._applyCam();
    this._track();
    this._syncObjects(dt);
  }

  _loop = (ts) => {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden || !this.renderer) { this._lastTs = 0; return; }
    if (this._lastTs) {
      this.ft.push(ts - this._lastTs);
      if (this.ft.length > 60) this.ft.shift();
    }
    this._lastTs = ts;
    const t0 = performance.now();
    this._render();
    this.cpuT.push(performance.now() - t0);
    if (this.cpuT.length > 60) this.cpuT.shift();
    this._drawTech();
    const dtf = this.ft.length ? this.ft[this.ft.length - 1] / 1000 : 0.016;
    this._hudT += dtf;
    if (this._hudDirty || this._hudT > 0.25) { this._hudT = 0; this._hudDirty = false; this._pushHud(); }
  };

  _input(dt) {
    const inp = this.input;
    const p = inp.pointer;
    const cam = this.cam;
    if (p.down) {
      cam.yaw -= (p.dx || 0) * 0.006;
      cam.pitch = clamp(cam.pitch + (p.dy || 0) * 0.005, 0.08, 1.35);
    }
    if (p.wheel) cam.dist *= Math.exp(p.wheel * 0.0012);
    if (p.pinch && p.pinch !== 1) cam.dist /= p.pinch;
    cam.dist = clamp(cam.dist, 4.5, 18);
    this._ax = inp.axis || { x: 0, y: 0 };
    this._kickReq = inp.pressed('action');
  }

  _simulate(dt) {
    const cam = this.cam, mob = this.mobu.position, b = this.ball;
    // ---- Mobu: kamera yönüne göre yürür (axis.y < 0 = ileri)
    const sp = 3.6;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const ax = this._ax;
    const tx = (fx * -ax.y + rx * ax.x) * sp, tz = (fz * -ax.y + rz * ax.x) * sp;
    const k = 1 - Math.exp(-dt * 14);
    this.v.x += (tx - this.v.x) * k;
    this.v.z += (tz - this.v.z) * k;
    mob.x += this.v.x * dt;
    mob.z += this.v.z * dt;
    mob.x = clamp(mob.x, ROOM.x0 + 0.6, ROOM.x1 - 0.6);
    mob.z = clamp(mob.z, ROOM.z0 + 0.8, ROOM.z1 - 0.8);
    // altın küpten it
    {
      const dx = mob.x - CUBE.x, dz = mob.z - CUBE.z, d = Math.hypot(dx, dz), R = 0.5 + 0.7;
      if (d < R && d > 1e-4) { mob.x = CUBE.x + (dx / d) * R; mob.z = CUBE.z + (dz / d) * R; }
    }
    const spd = Math.hypot(this.v.x, this.v.z);
    if (spd > 0.25) {
      const want = Math.atan2(this.v.x, this.v.z);
      let d = want - this.mobu.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.mobu.rotation.y += d * (1 - Math.exp(-dt * 12));
    }
    this.walkPhase += spd * dt * 2.6;
    this.walkAmt = clamp(spd / sp, 0, 1);

    // ---- top
    if (this._kickReq) {
      const dx = b.p.x - mob.x, dz = b.p.z - mob.z, d = Math.hypot(dx, dz);
      if (d < 1.8) {
        const nx = d > 1e-4 ? dx / d : 0, nz = d > 1e-4 ? dz / d : 1;
        b.v.x += nx * 9;
        b.v.z += nz * 9;
        this.kick = 1;
        if (this.audio) this.audio.play('pop');
      } else {
        this.toast('Topa yaklaş, sonra E.');
      }
    }
    this.kick = Math.max(0, this.kick - dt * 5);
    // Mobu'ya çarpınca itilir
    {
      const dx = b.p.x - mob.x, dz = b.p.z - mob.z, d = Math.hypot(dx, dz), R = 0.5 + b.r;
      if (d < R && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        b.p.x = mob.x + nx * R;
        b.p.z = mob.z + nz * R;
        const rel = this.v.x * nx + this.v.z * nz, cur = b.v.x * nx + b.v.z * nz;
        if (rel * 1.15 > cur) { b.v.x += nx * (rel * 1.15 - cur); b.v.z += nz * (rel * 1.15 - cur); }
      }
    }
    b.p.x += b.v.x * dt;
    b.p.z += b.v.z * dt;
    const fr = Math.exp(-dt * 0.9);
    b.v.x *= fr; b.v.z *= fr;
    const bs = Math.hypot(b.v.x, b.v.z);
    if (bs < 0.05) { b.v.x = b.v.z = 0; }
    else { const dec = Math.min(bs, 0.7 * dt); b.v.x -= (b.v.x / bs) * dec; b.v.z -= (b.v.z / bs) * dec; }
    const e = 0.72;
    if (b.p.x < ROOM.x0 + b.r) { b.p.x = ROOM.x0 + b.r; b.v.x = Math.abs(b.v.x) * e; }
    if (b.p.x > ROOM.x1 - b.r) { b.p.x = ROOM.x1 - b.r; b.v.x = -Math.abs(b.v.x) * e; }
    if (b.p.z < MIR.z + 0.12 + b.r) { b.p.z = MIR.z + 0.12 + b.r; b.v.z = Math.abs(b.v.z) * e; }
    if (b.p.z > ROOM.z1 - b.r) { b.p.z = ROOM.z1 - b.r; b.v.z = -Math.abs(b.v.z) * e; }
    {
      // altın küp (kare) ile çarpışma: en yakın noktaya göre
      const hs = CUBE.s / 2 + 0.05;
      const cx = clamp(b.p.x, CUBE.x - hs, CUBE.x + hs), cz = clamp(b.p.z, CUBE.z - hs, CUBE.z + hs);
      const dx = b.p.x - cx, dz = b.p.z - cz, d = Math.hypot(dx, dz);
      if (d < b.r && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        b.p.x = cx + nx * b.r; b.p.z = cz + nz * b.r;
        const vn = b.v.x * nx + b.v.z * nz;
        if (vn < 0) { b.v.x -= (1 + e) * vn * nx; b.v.z -= (1 + e) * vn * nz; }
      }
    }
    // dönme
    const sp2 = Math.hypot(b.v.x, b.v.z);
    if (sp2 > 1e-3) {
      const axis = this._tmp.v1.set(b.v.z, 0, -b.v.x).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (sp2 * dt) / b.r);
      b.q.premultiply(q);
    }

    // ---- sarkaç
    if (this.s.pendulum) this.pendPhase += dt * (this.reduced ? 0.8 : 1.6);
  }

  _applyCam() {
    const cam = this.cam, dt = this._dt || 1 / 60;
    const red = !!this.reduced;
    const kk = 1 - Math.exp(-dt * (red ? 30 : 9));
    cam.target.set(this.mobu.position.x, 1.0, this.mobu.position.z);
    cam.cyaw += (cam.yaw - cam.cyaw) * kk;
    cam.cpitch += (cam.pitch - cam.cpitch) * kk;
    cam.cdist += (cam.dist - cam.cdist) * kk;
    cam.ctarget.lerp(cam.target, kk);
    const cp = Math.cos(cam.cpitch);
    const c = this.camera.position;
    c.set(
      cam.ctarget.x + Math.sin(cam.cyaw) * cp * cam.cdist,
      cam.ctarget.y + Math.sin(cam.cpitch) * cam.cdist,
      cam.ctarget.z + Math.cos(cam.cyaw) * cp * cam.cdist
    );
    // kamera oda içinde kalsın (aynanın arkasına geçmesin)
    c.x = clamp(c.x, ROOM.x0 + 0.5, ROOM.x1 - 0.5);
    c.z = clamp(c.z, MIR.z + 0.6, 16);
    c.y = clamp(c.y, 0.7, 14);
    this.camera.lookAt(cam.ctarget);
    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();
  }

  _syncObjects(dt) {
    const m = this.mobu.position;
    // Mobu: yürürken hafif bob + kol/ayak sallanması, itişte öne eğilme
    const ph = this.walkPhase || 0, wa = this.walkAmt || 0;
    const bob = Math.abs(Math.sin(ph)) * 0.07 * wa;
    this.mobuIn.position.y = bob;
    const sq = 1 + Math.sin(performance.now() * 0.003) * 0.008;
    this.mobuIn.scale.set(1 + this.kick * 0.08, sq - this.kick * 0.06, 1 + this.kick * 0.08);
    this.mobuIn.rotation.x = this.kick * 0.18;
    this.mobuArms[0].rotation.x = Math.sin(ph) * 0.7 * wa - this.kick * 0.9;
    this.mobuArms[1].rotation.x = -Math.sin(ph) * 0.7 * wa - this.kick * 0.9;
    this.mobuFeet[0].position.z = 0.05 + Math.sin(ph) * 0.14 * wa;
    this.mobuFeet[1].position.z = 0.05 - Math.sin(ph) * 0.14 * wa;
    this.mobuBlob.position.set(m.x, 0.012, m.z);

    const b = this.ball;
    this.ballMesh.position.copy(b.p);
    this.ballMesh.quaternion.copy(b.q);
    this.ballBlob.position.set(b.p.x, 0.012, b.p.z);

    const th = PEND.amp * Math.sin(this.pendPhase);
    this.pend.rotation.z = th;
    this.pend.visible = !!this.s.pendulum;
    this.pendBlob.visible = !!this.s.pendulum;
    this.pendBlob.position.set(PEND.px + Math.sin(th) * PEND.len, 0.012, PEND.pz);
    this.scene.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------ görevler
  _track() {
    if (this.done && !this.tech) { /* izleme sürer ama kredi verilmez */ }
    const cam = this.camera;
    cam.updateMatrixWorld();
    const T = this._tmp;
    T.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    T.fr.setFromProjectionMatrix(T.pv);
    T.sph.set(this.ball.p, this.ball.r);
    this._ballOut = !T.fr.intersectsSphere(T.sph);
    this._mobuIn = false;
    if (this._ballOut) this._credit(0);
    const m = this.mobu.position;
    this._inFront = m.z < -2.2 && Math.abs(m.x) < 3.8;
    if (this._inFront) this._credit(1);
    const dy = Math.abs(Math.atan2(Math.sin(this.cam.yaw - this.cam.yaw0), Math.cos(this.cam.yaw - this.cam.yaw0)));
    if (dy >= (60 * Math.PI) / 180) this._credit(2);
  }

  // ------------------------------------------------------------ çizim
  _updateReflCam() {
    const T = this._tmp;
    const rc = this.reflCam, cam = this.camera;
    const N = T.v1.set(0, 0, 1);
    const mp = T.v2.set(0, MIR.cy, MIR.z);
    const camPos = T.v3.setFromMatrixPosition(cam.matrixWorld);
    const view = new THREE.Vector3().subVectors(mp, camPos);
    view.reflect(N).negate().add(mp);
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = new THREE.Vector3().subVectors(mp, look).reflect(N).negate().add(mp);
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(rot).reflect(N);
    rc.lookAt(target);
    rc.far = cam.far;
    rc.near = cam.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(cam.projectionMatrix);
    // planar: oblique near plane ile aynanın arkasındaki her şeyi kes.
    // SSR: derinlik dokusundan dünya konumu kuracağız; oblique matris derinlik hassasiyetini bozar,
    // bu yüzden standart projeksiyon + global kırpma düzlemi kullanılır.
    if (this.method === 'ssr') {
      this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      this.texMat.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
      this.reflInv.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse).invert();
      return;
    }
    T.plane.setFromNormalAndCoplanarPoint(N, mp);
    T.plane.applyMatrix4(rc.matrixWorldInverse);
    const cp = T.v4.set(T.plane.normal.x, T.plane.normal.y, T.plane.normal.z, T.plane.constant);
    const pm = rc.projectionMatrix.elements;
    const q = T.q;
    q.x = (Math.sign(cp.x) + pm[8]) / pm[0];
    q.y = (Math.sign(cp.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1.0 + pm[10]) / pm[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm[2] = cp.x;
    pm[6] = cp.y;
    pm[10] = cp.z + 1.0 - 0.003;
    pm[14] = cp.w;
    // doku matrisi: dünya → yansıma ekranı (0..1)
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    this.reflInv.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse).invert();
  }

  _renderReflection() {
    const r = this.renderer;
    r.setRenderTarget(this.reflRT);
    if (this.method === 'ssr') r.clippingPlanes = this._clipPlanes;
    r.render(this.scene, this.reflCam);
    r.clippingPlanes = [];
    r.setRenderTarget(null);
  }

  _render() {
    const r = this.renderer, cam = this.camera, sc = this.scene;
    this._ensureTargets();
    this.techGroup.visible = !!this.tech;
    const m = this.method;
    if (m === 'bake') {
      cam.layers.mask = MASK_NORMAL;
      this._updateReflCamForWedge();
      r.render(sc, cam);
    } else if (m === 'planar') {
      this._updateReflCam();
      this._renderReflection();
      this.uPlanar.tRefl.value = this.reflRT.texture;
      cam.layers.mask = MASK_NORMAL;
      r.render(sc, cam);
    } else {
      this._updateReflCam();
      cam.layers.mask = MASK_SSR_MAIN;
      r.setRenderTarget(this.mainRT);
      r.render(sc, cam);
      r.setRenderTarget(null);
      this._renderReflection();
      const u = this.uSsr;
      u.tRefl.value = this.reflRT.texture;
      u.tReflDepth.value = this.reflRT.depthTexture;
      u.tMain.value = this.mainRT.texture;
      u.tMainDepth.value = this.mainRT.depthTexture;
      u.uMainVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uPx.value = r.getPixelRatio();
      this.uQuad.tColor.value = this.mainRT.texture;
      this.uQuad.tDepth.value = this.mainRT.depthTexture;
      cam.layers.mask = MASK_SSR_FINAL;
      r.render(sc, cam);
      cam.layers.mask = MASK_NORMAL;
    }
  }

  // bake modunda yansıma kamerası çizilmez, ama teknik görünüm için "aynanın gördüğü" bölge yine hesaplanır
  _updateReflCamForWedge() {
    if (this.tech) this._updateReflCam();
  }

  // ------------------------------------------------------------ teknik görünüm çizimi
  _wedgePoly() {
    const c = this.camera.position;
    const vx = c.x, vz = 2 * MIR.z - c.z;      // yansıtılmış kamera (xz)
    const L = [-MIR.w / 2, MIR.z], R = [MIR.w / 2, MIR.z];
    const far = (P) => {
      const dx = P[0] - vx, dz = P[1] - vz, n = Math.hypot(dx, dz) || 1;
      return [P[0] + (dx / n) * 60, P[1] + (dz / n) * 60];
    };
    const poly = [L, R, far(R), far(L)];
    return clipPoly(poly, ROOM.x0, ROOM.x1, MIR.z, ROOM.z1);
  }

  _drawTech() {
    const tech = !!this.tech;
    this.overlay.style.display = tech ? 'block' : 'none';
    this.mini.style.display = tech ? 'block' : 'none';
    this.ssrFrame.style.display = tech && this.method === 'ssr' ? 'block' : 'none';
    for (const l of [this.labMirror, this.labSeen, this.labUnseen]) l.style.display = 'none';
    if (!tech) return;

    const wedge = this._wedgePoly();
    const dyn = this.method !== 'bake';
    this.pyrLines.visible = this.wedgeMesh.visible = dyn;

    // --- 3B: aynanın gördüğü bölge
    if (dyn) {
      const c = this.camera.position;
      const V = this._tmp.v1.set(c.x, c.y, 2 * MIR.z - c.z);
      const hw = MIR.w / 2, hh = MIR.h / 2;
      const corners = [[-hw, MIR.cy + hh], [hw, MIR.cy + hh], [hw, MIR.cy - hh], [-hw, MIR.cy - hh]];
      const pos = this.pyrLines.geometry.attributes.position;
      const ends = corners.map(([x, y]) => {
        const P = new THREE.Vector3(x, y, MIR.z);
        const d = P.clone().sub(V).normalize();
        return [P, P.clone().addScaledVector(d, 8)];
      });
      let o = 0;
      const put = (v) => pos.setXYZ(o++, v.x, v.y, v.z);
      for (const [a, b] of ends) { put(a); put(b); }
      for (let i = 0; i < 4; i++) { put(ends[i][1]); put(ends[(i + 1) % 4][1]); }
      pos.needsUpdate = true;
      const wp = this.wedgeMesh.geometry.attributes.position;
      const pts = wedge.slice(0, 11);
      for (let i = 0; i < 12; i++) {
        const p = pts[Math.min(i, pts.length - 1)];
        wp.setXYZ(i, p[0], 0.03, p[1]);
      }
      wp.needsUpdate = true;
    }

    // --- DOM etiketleri
    const place = (el, v, txt) => {
      const p = v.clone().project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return;
      el.style.display = 'block';
      if (txt) el.textContent = txt;
      const px = (p.x * 0.5 + 0.5) * this.container.clientWidth, py = (-p.y * 0.5 + 0.5) * this.container.clientHeight;
      // üstten harita kutusunun üstüne binmesin
      if (px < this.miniS + 90 && py > this.container.clientHeight - this.miniS - 30) { el.style.display = 'none'; return; }
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
    };
    if (!this._narrow) place(this.labMirror, new THREE.Vector3(0, MIR.cy + MIR.h / 2 + 0.55, MIR.z),
      this.method === 'bake' ? 'Yansıma = baştaki küp harita (güncellenmiyor)'
        : this.method === 'planar' ? 'Yansıma = ayna kamerası (her karede çizilir)'
          : 'Yansıma = ekrandaki pikseller (veri yoksa boşluk)');
    if (dyn && wedge.length) {
      let cx = 0, cz = 0;
      wedge.forEach((p) => { cx += p[0]; cz += p[1]; });
      cx /= wedge.length; cz /= wedge.length;
      place(this.labSeen, new THREE.Vector3(cx, 0.1, cz));
      const ox = cx > 0 ? -5.8 : 5.8;
      place(this.labUnseen, new THREE.Vector3(ox, 0.1, 5.5));
    }

    this._drawMini(wedge, dyn);
  }

  _drawMini(wedge, dyn) {
    const cv = this.mini, g = cv.getContext('2d');
    const S = cv.width, sc = S / 16;
    const X = (x) => (x - ROOM.x0) * sc, Z = (z) => (z - ROOM.z0) * sc;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    // ana kamera görüş açısı (üstten)
    const cam = this.camera, cp = cam.position;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const ang = Math.atan2(fwd.x, fwd.z);                       // xz düzleminde bakış
    const hfov = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
    const wedgeCam = [[cp.x, cp.z]];
    for (const s of [-1, 1]) wedgeCam.push([cp.x + Math.sin(ang + s * hfov) * 60, cp.z + Math.cos(ang + s * hfov) * 60]);
    g.fillStyle = 'rgba(245,245,245,0.10)';
    g.strokeStyle = 'rgba(245,245,245,0.6)';
    g.lineWidth = 1 * (S / this.miniS);
    g.beginPath();
    wedgeCam.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))));
    g.closePath(); g.fill(); g.stroke();
    // aynanın gördüğü bölge
    if (dyn && wedge.length) {
      g.fillStyle = 'rgba(139,61,255,0.32)';
      g.strokeStyle = 'rgba(182,124,255,0.9)';
      g.beginPath();
      wedge.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))));
      g.closePath(); g.fill(); g.stroke();
    }
    // oda çerçevesi + ayna
    g.strokeStyle = 'rgba(139,61,255,0.8)';
    g.lineWidth = 1.5 * (S / this.miniS);
    g.strokeRect(1, 1, S - 2, S - 2);
    g.strokeStyle = '#E9DDFF';
    g.lineWidth = 3 * (S / this.miniS);
    g.beginPath(); g.moveTo(X(-MIR.w / 2), Z(MIR.z)); g.lineTo(X(MIR.w / 2), Z(MIR.z)); g.stroke();
    // nesneler
    const dot = (x, z, r, col, ring) => {
      g.beginPath(); g.arc(X(x), Z(z), r * (S / this.miniS), 0, Math.PI * 2);
      g.fillStyle = col; g.fill();
      if (ring) { g.strokeStyle = ring; g.lineWidth = 1.6 * (S / this.miniS); g.stroke(); }
    };
    g.fillStyle = '#F5C542'; g.fillRect(X(CUBE.x - CUBE.s / 2), Z(CUBE.z - CUBE.s / 2), CUBE.s * sc, CUBE.s * sc);
    if (this.s.pendulum) {
      const bx = PEND.px + Math.sin(PEND.amp * Math.sin(this.pendPhase)) * PEND.len;
      g.strokeStyle = 'rgba(139,61,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(PEND.px), Z(PEND.pz)); g.lineTo(X(bx), Z(PEND.pz)); g.stroke();
      dot(bx, PEND.pz, 3.6, '#8B3DFF', '#E9DDFF');
    }
    dot(this.ball.p.x, this.ball.p.z, 4, '#EF4A5C', this._ballOut ? '#F5F5F5' : null);
    dot(this.mobu.position.x, this.mobu.position.z, 5.5, '#B67CFF', '#E9DDFF');
    dot(cp.x, cp.z, 3, '#F5F5F5');
    g.restore();
    g.fillStyle = 'rgba(245,245,245,0.7)';
    g.font = `${Math.round(9 * (S / this.miniS))}px "JetBrains Mono", monospace`;
    g.fillText('üstten görünüm', 6, S - 6);
    if (this._ballOut) {
      g.fillStyle = '#EF4A5C';
      g.fillText('top ekran dışı', 6, 14 * (S / this.miniS));
    }
  }

  // ------------------------------------------------------------ HUD
  _avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

  _pushHud() {
    const M = METHODS[this.method];
    const res = Number(this.s.mirrorRes) || 512;
    const left = [`Yöntem: ${M.name}`, M.limit];
    if (this.tech) {
      left.push(this.method === 'bake'
        ? 'Sahne çizimi: 1× (+ başta 6 yüz)'
        : 'Sahne çizimi: 2× (ana + ayna)');
      left.push(this.method === 'bake'
        ? `Ayna dokusu: küp 512²×6 (${this.bakeCount}. çekim)`
        : `Ayna dokusu: ${res}×${res}`);
      const ft = this._avg(this.ft), cpu = this._avg(this.cpuT);
      left.push(`Kare süresi (ort. ${this.ft.length}): ${ft.toFixed(1)} ms · CPU ${cpu.toFixed(1)}`);
      if (this.method === 'ssr') left.push(`Top ana kamerada: ${this._ballOut ? 'HAYIR → yansımada yok' : 'evet'}`);
    }
    // görev listesi ve sayaç yalnızca teknik görünümde; normalde aktif görev setGoal ile gösterilir
    const right = [];
    if (this.tech) {
      GOALS.forEach((g, i) => {
        const st = this.prog ? this.prog[i] : new Set();
        const ms = [...st].map((m) => METHODS[m].short).join(', ');
        right.push(`${st.size ? '✓' : '·'} ${g.short}${ms ? ` (${ms})` : ''}`);
      });
      if (this.prog) right.push(`Her görev ≥2 yöntemde: ${this.prog.reduce((a, st) => a + Math.min(2, st.size), 0)}/6`);
    }
    this.hud({ left, right });
  }

  // ------------------------------------------------------------ temizlik
  dispose() {
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    for (const d of this._disposables) if (d && d.dispose) d.dispose();
    for (const rt of [this.reflRT, this.mainRT]) if (rt) { rt.depthTexture?.dispose(); rt.dispose(); }
    this.cubeRT?.dispose();
    this.scene?.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay?.remove();
  }
}
