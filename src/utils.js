// Küçük yardımcılar — bağımlılık yok.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = x => 1 - Math.pow(1 - x, 3);
export const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

// localStorage — özel pencerede/engellendiğinde sessizce geçer
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } },
};

// DOM kurucu: h('div', {class:'x', onclick}, [children])
export function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))) }
  return e;
}
export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Basit olay yayıcı (dünyalar arası haberleşme)
export function createBus() {
  const map = new Map();
  return {
    on(type, fn) { (map.get(type) || map.set(type, new Set()).get(type)).add(fn); return () => map.get(type)?.delete(fn) },
    emit(type, detail) { map.get(type)?.forEach(fn => { try { fn(detail) } catch (e) { console.warn('[bus]', type, e) } }); map.get('*')?.forEach(fn => { try { fn({ type, detail }) } catch { } }) },
  };
}
export const bus = createBus();

// Görünürlük: elemana göre rAF döngüsü aç/kapat
export function whenVisible(el, onShow, onHide, margin = '200px') {
  if (!('IntersectionObserver' in window)) { onShow(); return () => onHide() }
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? onShow() : onHide()), { rootMargin: margin });
  io.observe(el);
  return () => { io.disconnect(); onHide() };
}

export const wait = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
