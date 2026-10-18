// JT logosu — vektör geometri (1024×1024 uzayı), JUIT intro'sundaki onaylı çizimle aynı.
export const LOGO = {
  size: 1024,
  C: [506, 509],
  J: [[338, 228], [557, 228], [484, 668], [316, 778], [100, 778], [122, 620], [230, 560], [210, 672], [308, 672], [362, 632], [408, 338], [232, 338]],
  T: [[586, 228], [912, 228], [888, 338], [798, 338], [738, 684], [590, 790], [662, 350], [570, 350]],
  ACC: [[[510, 298], [530, 298], [522, 340], [500, 340]], [[838, 268], [888, 268], [878, 338], [826, 338]]],
};

const pts = P => P.map(p => p.join(',')).join(' ');

// SVG (inline) — stroke beyaz, aksan mor. `glow` true ise filtreli parıltı katmanı eklenir.
export function logoSVG({ cls = '', stroke = '#F5F5F5', accent = '#8B3DFF', lw = 22, glow = true, id = 'jt' } = {}) {
  const fid = `${id}-glow`;
  return `<svg class="${cls}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs><filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  ${glow ? `<g filter="url(#${fid})" opacity=".55" fill="none" stroke="#B67CFF" stroke-width="${lw + 6}" stroke-linejoin="round"><polygon points="${pts(LOGO.J)}"/><polygon points="${pts(LOGO.T)}"/></g>` : ''}
  <g fill="none" stroke="${stroke}" stroke-width="${lw}" stroke-linejoin="round"><polygon points="${pts(LOGO.J)}"/><polygon points="${pts(LOGO.T)}"/></g>
  <g fill="${accent}">${LOGO.ACC.map(a => `<polygon points="${pts(a)}"/>`).join('')}</g>
</svg>`;
}

function polyLen(P) { let L = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]) } return L }
function partial(ctx, P, p) {
  const n = P.length, L = polyLen(P) * Math.min(1, p); let acc = 0;
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i <= n; i++) {
    const a = P[i - 1], b = P[i % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + d >= L) { const k = (L - acc) / d; ctx.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); break }
    ctx.lineTo(b[0], b[1]); acc += d;
  }
  if (p >= 1) ctx.closePath();
}

// Canvas çizimi. (x,y) merkez, s = ölçek (1 → 1024 px), p = çizilme ilerlemesi 0..1,
// glow 0..1 parıltı, acc 0..1 aksan belirme.
export function drawLogo(ctx, { x, y, s, p = 1, stroke = '#F5F5F5', accent = '#8B3DFF', lw = 22, glow = 0, acc = 1, alpha = 1 }) {
  if (p <= 0 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-LOGO.C[0], -LOGO.C[1]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (glow > 0) {
    ctx.save(); ctx.strokeStyle = `rgba(182,124,255,${.55 * glow})`; ctx.lineWidth = lw + 10; ctx.shadowColor = '#B67CFF'; ctx.shadowBlur = 60 * glow;
    partial(ctx, LOGO.J, p); ctx.stroke(); partial(ctx, LOGO.T, p); ctx.stroke(); ctx.restore();
  }
  ctx.strokeStyle = stroke; ctx.lineWidth = lw;
  partial(ctx, LOGO.J, p); ctx.stroke(); partial(ctx, LOGO.T, p); ctx.stroke();
  if (acc > 0) { ctx.save(); ctx.globalAlpha = alpha * acc; ctx.fillStyle = accent; if (glow > 0) { ctx.shadowColor = accent; ctx.shadowBlur = 30 * glow } for (const A of LOGO.ACC) { ctx.beginPath(); A.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill() } ctx.restore() }
  ctx.restore();
}
