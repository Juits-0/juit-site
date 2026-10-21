import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 420, height: 700 } })).newPage();
const logs = []; p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); p.on('pageerror', e => logs.push('PE ' + e.message));
await p.goto('http://localhost:5186/lab.html#/deney/boss'); await p.waitForTimeout(800);
await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); e.reduced = true; e.setSetting('signals', false); });
await p.waitForTimeout(9000);   // gerçek zamanlı: Mobu hareketsiz, vurulur, ölür, yeniden başlar
console.log('unwarned real-time', await p.evaluate(() => { const e = window.__exp; return { t: e.time, st: e.st, hitsTotal: e.hitsTotal, hearts: e.hearts, hits: e.hits, att: e.att && e.att.kind }; }));
await p.evaluate(() => { const e = window.__exp; e.reduced = false; e.setSetting('signals', true); e.setSetting('windupMs', 400); e.reset(); });
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(400); await p.keyboard.up('ArrowRight'); await p.keyboard.press('Space'); await p.waitForTimeout(6000);
await p.screenshot({ path: 'C:/Claude/juit-site/_dev/shots/boss_dbg_run.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
