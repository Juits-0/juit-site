// Açılış: siyah perde, yukarıdan inen JT logosu, ışığın ortaya çıkardığı iki dünya silüeti,
// iniş darbesi, sonra hub'a devir. Atlanabilir (Esc / Enter / Boşluk / düğme), tekrar gelen
// ziyaretçi kısa sürümü görür, hareket azaltma tercihinde sadece soluklaşarak gelir.
import { $, clamp, lerp, easeOut, easeIO, easeBack, prefersReducedMotion } from '../utils.js';
import { drawLogo } from '../logo.js';

export function runIntro({ short = false, sfx = null, onReveal = () => { }, onDone = () => { } } = {}) {
  const root = $('#intro'), cv = $('#intro-canvas'), skipBtn = $('#intro-skip');
  if (!root || !cv) { onReveal(); onDone(); return }
  root.classList.add('is-live');
  const rm = prefersReducedMotion();
  // zaman çizelgesi (sn)
  const TL = rm ? { d0: 0, d1: .05, land: .05, r0: .45, r1: 1.0, end: 1.05 }
    : short ? { d0: .05, d1: .62, land: .62, r0: .85, r1: 1.4, end: 1.45 }
      : { d0: .18, d1: 1.32, land: 1.32, r0: 1.72, r1: 2.75, end: 2.8 };
  let ctx; try { ctx = cv.getContext('2d') } catch { }
  if (!ctx) { finish(true); return }

  let W = 0, H = 0, dpr = 1;
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
  resize(); addEventListener('resize', resize);

  // toz parçacıkları (deterministik)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd(), z: .3 + rnd() * .7, ph: rnd() * 6.28 }));
  const chips = Array.from({ length: 26 }, () => { const a = rnd() * Math.PI * 2, sp = 180 + rnd() * 420; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6 - 120, life: .5 + rnd() * .5, sz: 1.5 + rnd() * 2.5 } });

  let t0 = performance.now(), t = 0, done = false, revealed = false, landed = false, shake = 0, fast = false;
  let target = null; // devir hedefi: hub logosunun ekran dikdörtgeni

  function logoSize() { return Math.min(W * .62, H * .42, 360) }  // canvas logosunun genişliği (px)
  function measureTarget() {
    const el = document.getElementById('hub-logo'); if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }

  function silhouettes(a, lx, ly) {
    if (a <= 0) return;
    const lightR = Math.max(W, H) * .55;
    const wTV = Math.min(W * .22, 300), hTV = wTV * .78, cxL = W * .2, cyL = H * .56;
    const cxR = W * .8, cyR = H * .58, wC = Math.min(W * .15, 190), hC = wC * 2.1;
    const near = (x, y) => clamp(1 - Math.hypot(x - lx, y - ly) / lightR);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 2;
    // sol: tüplü TV + arkasından bakan Mobu silüeti (kulaklar + saç)
    let k = near(cxL, cyL) * a; ctx.strokeStyle = `rgba(182,124,255,${.55 * k})`; ctx.fillStyle = `rgba(139,61,255,${.08 * k})`;
    roundRect(cxL - wTV / 2, cyL - hTV / 2, wTV, hTV, 18); ctx.fill(); ctx.stroke();
    roundRect(cxL - wTV / 2 + 16, cyL - hTV / 2 + 14, wTV * .72, hTV - 28, 10); ctx.stroke();
    ctx.beginPath(); ctx.arc(cxL + wTV * .38, cyL - 10, 6, 0, 7); ctx.arc(cxL + wTV * .38, cyL + 16, 6, 0, 7); ctx.stroke();
    const mx = cxL + wTV * .18, my = cyL - hTV / 2; ctx.fillStyle = `rgba(139,61,255,${.35 * k})`; ctx.strokeStyle = `rgba(182,124,255,${.7 * k})`;
    ctx.beginPath(); ctx.arc(mx - 34, my - 4, 11, Math.PI, 0); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(mx + 34, my - 4, 11, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 14, my - 36); ctx.lineTo(mx - 2, my - 14); ctx.lineTo(mx + 10, my - 42); ctx.lineTo(mx + 16, my - 12); ctx.lineTo(mx + 30, my - 32); ctx.lineTo(mx + 28, my); ctx.closePath(); ctx.fill(); ctx.stroke();
    // sağ: atari kabini
    k = near(cxR, cyR) * a; ctx.strokeStyle = `rgba(182,124,255,${.55 * k})`; ctx.fillStyle = `rgba(139,61,255,${.08 * k})`;
    ctx.beginPath(); ctx.moveTo(cxR - wC / 2, cyR + hC / 2); ctx.lineTo(cxR - wC / 2, cyR - hC / 2); ctx.lineTo(cxR + wC / 2, cyR - hC / 2); ctx.lineTo(cxR + wC / 2, cyR - hC * .1); ctx.lineTo(cxR + wC * .42, cyR + hC * .02); ctx.lineTo(cxR + wC / 2, cyR + hC * .12); ctx.lineTo(cxR + wC / 2, cyR + hC / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    roundRect(cxR - wC * .36, cyR - hC * .36, wC * .72, hC * .3, 6); ctx.stroke();
    ctx.beginPath(); ctx.rect(cxR - wC * .4, cyR - hC * .46, wC * .8, hC * .07); ctx.stroke();
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }

  function frame(now) {
    if (done) return;
    t = (now - t0) / 1000;
    try { draw() } catch (e) { console.warn('[intro]', e); finish(true); return }
    if (t >= TL.r0 && !revealed) { revealed = true; target = measureTarget(); try { onReveal() } catch { } }
    if (t >= TL.end) { finish(); return }
    requestAnimationFrame(frame);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    const rev = clamp((t - TL.r0) / (TL.r1 - TL.r0));           // 0..1 devir/perde kalkışı
    const u = easeIO(clamp((t - TL.d0) / (TL.d1 - TL.d0)));      // iniş ilerlemesi
    const size0 = logoSize(); const cx0 = W / 2, cy0 = H * .5;
    let x = cx0, y = rm ? cy0 : lerp(-size0 * .9, cy0, u), s = (size0 / 1024) * (rm ? 1 : lerp(1.18, 1, u));
    // devir: hub logosunun dikdörtgenine süzül
    if (target) { const k = easeIO(rev); x = lerp(x, target.x, k); y = lerp(y, target.y, k); s = lerp(s, target.w / 1024, k) }
    // iniş sarsıntısı
    if (landed && t < TL.land + .35) { const k = 1 - (t - TL.land) / .35; shake = 7 * k * k; x += (Math.random() - .5) * shake; y += (Math.random() - .5) * shake }
    const lightA = rm ? clamp(t / .4) : clamp(u * 1.2) * (1 - rev * .9);
    // ışık havuzu (logo bir ışık kaynağı gibi) + zemin yansıması
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * .55);
    g.addColorStop(0, `rgba(139,61,255,${.22 * lightA})`); g.addColorStop(.35, `rgba(139,61,255,${.07 * lightA})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const floorY = cy0 + size0 * .42;
    const fl = ctx.createRadialGradient(cx0, floorY, 0, cx0, floorY, size0 * .9);
    const floorA = (rm ? lightA : clamp((u - .55) / .45)) * (1 - rev) * (landed ? 1 : .5);
    fl.addColorStop(0, `rgba(182,124,255,${.16 * floorA})`); fl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(cx0, floorY); ctx.scale(1, .18); ctx.translate(-cx0, -floorY); ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H); ctx.restore();
    // toz
    ctx.save(); for (const d of dust) { const px = d.x * W + Math.sin(t * .6 + d.ph) * 14, py = ((d.y - t * .025 * d.z) % 1 + 1) % 1 * H; const near = clamp(1 - Math.hypot(px - x, py - y) / (Math.max(W, H) * .5)); ctx.globalAlpha = lightA * near * (.35 + .35 * Math.sin(t * 3 + d.ph)) * (1 - rev); ctx.fillStyle = d.z > .75 ? '#B67CFF' : '#fff'; ctx.fillRect(px, py, 1.5 * d.z + .5, 1.5 * d.z + .5) } ctx.restore();
    // dünya silüetleri
    silhouettes(lightA * (1 - rev), x, y);
    // iniş: halka + kıvılcım
    if (!rm && landed) {
      const dt = t - TL.land;
      if (dt < .8) { const k = dt / .8; ctx.save(); ctx.globalAlpha = (1 - k) * .8; ctx.strokeStyle = '#B67CFF'; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(cx0, floorY, size0 * (.3 + k * 1.3), size0 * (.06 + k * .26), 0, 0, 7); ctx.stroke(); ctx.restore() }
      if (dt < 1) { ctx.save(); for (const c of chips) { if (dt > c.life) continue; const k = dt / c.life; ctx.globalAlpha = 1 - k; ctx.fillStyle = Math.random() < .3 ? '#fff' : '#B67CFF'; ctx.fillRect(cx0 + c.vx * dt, floorY + c.vy * dt + 500 * dt * dt, c.sz, c.sz) } ctx.restore() }
    }
    // logo
    const p = rm ? 1 : clamp((t - TL.d0) / (TL.d1 - TL.d0) * 1.15);
    const glow = rm ? .6 * clamp(t / .4) : clamp(u * 1.3) * (landed ? lerp(1, .55, clamp((t - TL.land) / .6)) : .8);
    const acc = rm ? clamp(t / .4) : (landed ? clamp((t - TL.land) / .15) : 0);
    const alpha = rm ? clamp(t / .35) : 1;
    const canvasFade = 1 - clamp((rev - .55) / .45);
    drawLogo(ctx, { x, y, s, p, glow: glow * canvasFade, acc, alpha: alpha * canvasFade, lw: 22 });
    // perde: hub görünür olurken canvas şeffaflaşır
    root.style.background = `rgba(5,5,5,${1 - rev})`;
    if (!landed && t >= TL.land) { landed = true; try { sfx?.play?.('logo') } catch { } }
  }

  function skip() { if (done) return; if (t < TL.r0) { t0 = performance.now() - TL.r0 * 1000; landed = true } }
  const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); skip() } };
  skipBtn?.addEventListener('click', skip); addEventListener('keydown', onKey); root.addEventListener('pointerdown', e => { if (e.target !== skipBtn) skip() });

  function finish(failed = false) {
    if (done) return; done = true;
    removeEventListener('keydown', onKey); removeEventListener('resize', resize);
    if (!revealed) { revealed = true; try { onReveal() } catch { } }
    root.classList.add('is-done'); root.style.background = 'transparent';
    setTimeout(() => { root.remove() }, 700);
    try { onDone({ failed }) } catch (e) { console.warn(e) }
  }
  // bekçi: ne olursa olsun perde kalkar
  setTimeout(() => finish(true), (TL.end + 2) * 1000);
  requestAnimationFrame(frame);
  return { skip, finish };
}
