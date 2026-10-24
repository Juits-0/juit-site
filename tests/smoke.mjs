// smoke.mjs — derlenmiş siteyi (dist/) yerel sunucuda açar ve temel kontrolleri yapar.
// Kullanım: npm run build && npm test   (CI'da yayından önce çalışır; hata varsa çıkış kodu 1)
// Yerelde sistem Chrome'u kullanmak için: PW_CHANNEL=chrome npm test
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { EXPERIMENTS } from '../src/config/experiments.js';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.otf': 'font/otf', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };

// ---- küçük statik sunucu (vite preview'a gerek yok) ----
const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
  const f = join(DIST, p);
  try { await stat(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const SIZES = { masaustu: { viewport: { width: 1280, height: 720 } }, mobil: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } };

// sayfadaki yatay taşma: belge genişliği + kırpılmayan, ekran dışına çıkan öğeler
const overflow = () => {
  const W = innerWidth, bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.mobu-layer,[hidden],.intro')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) { if (getComputedStyle(p).overflowX !== 'visible') { clipped = true; break; } p = p.parentElement; }
    if (!clipped && (r.right > W + 1 || r.left < -1)) bad.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 4) };
};

for (const [name, opts] of Object.entries(SIZES)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/youtube|ERR_|net::/i.test(m.text())) errs.push(m.text()); });
  const urls = ['', 'mobu', 'arcade', 'lab', 'about', 'cekmece'].map(r => `/#/${r}`)
    .concat(['/lab.html#/'], EXPERIMENTS.map(e => `/lab.html#/deney/${e.id}`));
  for (const u of urls) {
    errs.length = 0;
    await page.goto(BASE + u); await wait(u.includes('lab.html') ? 1800 : 1200);
    const o = await page.evaluate(overflow);
    ok(o.sw <= o.W + 1 && !o.bad.length, `[${name}] ${u} yatay taşma: ${o.sw}/${o.W} ${o.bad.join(', ')}`);
    ok(!errs.length, `[${name}] ${u} konsol hatası: ${errs.join(' | ').slice(0, 200)}`);
    if (u.includes('/deney/')) ok(await page.locator('.exp-title').count() > 0 && !(await page.getByText('Bu deney yakında').count()), `[${name}] ${u} deney yüklenmedi (yer tutucu açıldı)`);
  }
  await ctx.close();
}

// ---- etkileşim testleri (masaüstü) ----
const ctx = await browser.newContext(SIZES.masaustu);
const page = await ctx.newPage();

// 1) deney geçişlerinde tıklama dinleyicisi birikmemeli: 5 deneyden sonra ses düğmesi tek tıkla bir kez değişir
for (const e of EXPERIMENTS.slice(0, 5)) { await page.goto(`${BASE}/lab.html#/deney/${e.id}`); await wait(700); }
const snd = page.locator('#exp [data-a="sound"]');
await page.evaluate(() => { window.__sndN = 0; const b = document.querySelector('#exp [data-a="sound"]'); new MutationObserver(r => { window.__sndN += r.length; }).observe(b, { attributes: true, attributeFilter: ['aria-pressed'] }); });
await snd.click(); await wait(150);
const sndN = await page.evaluate(() => window.__sndN);
ok(sndN === 1, `deney geçişlerinden sonra ses düğmesi tek tıklamada ${sndN} kez işlendi (dinleyici birikmesi)`);

// 2) bölüm geçişlerinde video açma tek kez çalışmalı; modal 9:16 ve çerçevenin içinde
await page.goto(`${BASE}/#/mobu`); await wait(800);
for (const r of ['lab', 'about', 'mobu', 'lab', 'mobu']) { await page.evaluate(h => { location.hash = h; }, '#/' + r); await wait(500); }
let opens = 0; await page.exposeFunction('__countOpen', () => { opens++; });
await page.evaluate(() => { const m = document.getElementById('modal'); new MutationObserver(() => { if (!m.hidden) window.__countOpen(); }).observe(m, { attributes: true, attributeFilter: ['hidden'] }); });
await page.locator('.vcard').first().click(); await wait(900);
ok(opens === 1, `video modalı ${opens} kez açıldı (1 bekleniyordu)`);
const box = await page.evaluate(() => { const f = document.querySelector('.player__frame').getBoundingClientRect(), m = document.querySelector('.modal__frame').getBoundingClientRect(); return { r: f.width / f.height, inside: f.right <= m.right + 1 && f.bottom <= m.bottom + 1 }; });
ok(Math.abs(box.r - 9 / 16) < 0.02 && box.inside, `video oynatıcı 9:16 değil ya da taşıyor (${box.r.toFixed(3)})`);
await page.keyboard.press('Escape');

// 3) Hakkımda: masa nesnesi seçilince görünür panel başlığı değişir; sayfada tekrarlı id yok
await page.goto(`${BASE}/#/about`); await wait(800);
const tabs = page.locator('.desk-tab'); const n = await tabs.count();
const seen = new Set();
for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await wait(100); seen.add((await page.locator('#desk-title').innerText()).trim()); }
ok(n > 0 && seen.size === n, `masa paneli başlığı her nesnede değişmiyor (${n} nesne, ${seen.size} farklı başlık)`);
const dup = await page.evaluate(() => { const s = {}; for (const e of document.querySelectorAll('[id]')) s[e.id] = (s[e.id] || 0) + 1; return Object.keys(s).filter(k => s[k] > 1); });
ok(!dup.length, `tekrarlı id: ${dup.join(', ')}`);

// 4) "İçeriğe atla" rotayı değiştirmez, odağı ana içeriğe taşır
await page.goto(`${BASE}/#/arcade`); await wait(800);
await page.evaluate(() => document.querySelector('.skip-link').click()); await wait(200);
ok(await page.evaluate(() => location.hash === '#/arcade' && document.activeElement.id === 'main'), 'İçeriğe atla rotayı bozdu ya da odağı taşımadı');

// 5) bilinmeyen rota → bulunamadı ekranı
await page.goto(`${BASE}/#/yok-boyle-bir-sayfa`); await wait(600);
ok(await page.getByText('Bu sayfa bulunamadı').count() > 0, 'bilinmeyen rota için bulunamadı ekranı yok');

// 6) mobil menü aria-controls gerçek bir öğeyi gösterir
ok(await page.evaluate(() => !!document.getElementById(document.getElementById('menu-toggle').getAttribute('aria-controls'))), 'menü aria-controls hedefi yok');

// 7) laboratuvarda ana siteye dönüş bağlantısı
await page.goto(`${BASE}/lab.html#/`); await wait(1200);
ok(await page.locator('a.lab-home').count() > 0, 'laboratuvarda ana siteye dönüş bağlantısı yok');

await browser.close(); server.close();
if (fails.length) { console.error(`✗ ${fails.length} sorun:\n - ` + fails.join('\n - ')); process.exit(1); }
console.log('✓ smoke testleri geçti');
