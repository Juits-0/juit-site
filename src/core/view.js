// view.js — mantıksal görünüm hesabı. Mantıksal yükseklik SABİT H=600; genişlik 420..1200.
export const LH = 600;
export function computeView(cssW, cssH, maxDpr = 2.5) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  cssW = Math.max(1, cssW); cssH = Math.max(1, cssH);
  const aspect = cssW / cssH;
  const w = Math.max(420, Math.min(1200, aspect * LH));
  const scale = Math.min(cssW / w, cssH / LH);
  const ox = (cssW - w * scale) / 2, oy = (cssH - LH * scale) / 2;     // letterbox payı (css px)
  return { w, h: LH, scale, dpr, cssW, cssH, ox, oy };
}
// canvas boyutunu view'a göre ayarla
export function sizeCanvas(cv, view) {
  const pw = Math.round(view.cssW * view.dpr), ph = Math.round(view.cssH * view.dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  cv.style.width = view.cssW + 'px'; cv.style.height = view.cssH + 'px';
}
// kareyi başlat: tüm canvas'ı koyu boya, mantıksal dikdörtgene kırp ve ölçekle. g.restore() ile bitir.
export function beginFrame(g, view, bg = '#0A0A0A') {
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = bg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.save();
  const k = view.dpr * view.scale;
  g.setTransform(k, 0, 0, k, view.ox * view.dpr, view.oy * view.dpr);
  g.beginPath(); g.rect(0, 0, view.w, view.h); g.clip();
}
