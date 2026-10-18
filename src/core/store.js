// store.js — localStorage sarmalayıcı (yoksa bellekte tutar) + damgalar (hatıralar)
const PREFIX = 'juit.lab.';
const mem = {};
const subs = new Set();

function raw(k) { try { return localStorage.getItem(PREFIX + k); } catch (_) { return mem[k] ?? null; } }
function rawSet(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (_) { mem[k] = v; } }

export const store = {
  get(key, def = null) { const r = raw(key); if (r == null) return def; try { return JSON.parse(r); } catch (_) { return def; } },
  set(key, val) { rawSet(key, JSON.stringify(val)); subs.forEach(f => f(key, val)); },
  // deney tamamlama damgası: ilk kez kazanıldıysa true döner
  stamp(id) {
    const s = this.stamps(); if (s[id]) return false;
    s[id] = Date.now(); this.set('stamps', s); return true;
  },
  stamps() { return this.get('stamps', {}) || {}; },
  hasStamp(id) { return !!this.stamps()[id]; },
  count() { return Object.keys(this.stamps()).length; },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};
