import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const BASE='http://localhost:5187/lab.html#/deney/zaman', OUT='C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs=[];
const mkp = async (w,h,mob)=>{const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:mob?2:1,hasTouch:!!mob,isMobile:!!mob});const p=await c.newPage();
 p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text())});p.on('pageerror',e=>logs.push('PE '+e.message));return p;};
const p = await mkp(1280,720);
await p.goto(BASE); await p.waitForTimeout(1500);
// bot: hold slow, walk up with simple dodge
const res = await p.evaluate(async()=>{
  const e=window.__exp, inp=e.input; let completes=0; const oc=e.complete.bind(e); e.complete=(a)=>{completes++;return oc(a)};
  const step=()=>{e.time+=1/120;e.frame++;e.update(1/120);inp.endFrame();};
  const out={};
  for (const ws of [1,0.25]) {
    e.setSetting('worldScale',ws); e.reset(); e.completed=false; inp.codes.clear();
    let steps=0;
    while(steps<120*120 && e.st!=='won'){
      // slow aç, ileri git; mermiye yakınsa dur
      if(e.en>0.3) inp.codes.add('ShiftLeft'); else inp.codes.delete('ShiftLeft');
      let danger=false;
      for(const bl of e.bullets){ const dy=Math.abs(bl.y-(e.y-60)), ahead=(bl.x-e.x)*Math.sign(bl.vx); if(dy<75 && Math.abs(bl.x-e.x)<110 && ahead<0) danger=true; if(bl.vy&&Math.hypot(bl.x-e.x,bl.y-e.y+60)<90) danger=true; }
      inp.codes.delete('ArrowDown'); if(danger) inp.codes.add('ArrowDown'); else inp.codes.delete('ArrowDown');
      if(!danger) inp.codes.add('ArrowUp'); else inp.codes.delete('ArrowUp');
      step(); steps++;
    }
    out['ws'+ws]={st:e.st,sec:+(steps/120).toFixed(1),hits:e.hits,attempts:e.attempts,hearts:e.hearts,tReal:+e.tReal.toFixed(1),tWorld:+e.tWorld.toFixed(1),tPlayer:+e.tPlayer.toFixed(1)};
  }
  await new Promise(r=>setTimeout(r,2500));
  out.completes=completes; return out;
});
console.log(JSON.stringify(res));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(()=>{const e=window.__exp;e.setSetting('worldScale',0.25);e.reset();});await p.waitForTimeout(300);
await p.keyboard.down('ArrowUp'); await p.keyboard.down('Shift'); await p.waitForTimeout(1500);
await p.screenshot({path:OUT+'zaman_desktop.png'});
await p.keyboard.up('ArrowUp'); await p.keyboard.up('Shift');
// teknik
await p.evaluate(()=>{const e=window.__exp;e.tech=true;e.reset();}); 
await p.keyboard.down('Shift'); await p.waitForTimeout(1200);
await p.screenshot({path:OUT+'zaman_tech.png'}); await p.keyboard.up('Shift');
await p.evaluate(()=>{window.__exp.tech=false});
const m = await mkp(390,844,true); await m.goto(BASE); await m.waitForTimeout(2200);
await m.screenshot({path:OUT+'zaman_mobile.png'});
console.log(logs.join('\n')||'konsol temiz');
await b.close();
