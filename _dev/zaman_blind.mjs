import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
await p.goto('http://localhost:5187/lab.html#/deney/zaman'); await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(()=>{
  const e=window.__exp,inp=e.input;const step=()=>{e.time+=1/120;e.frame++;e.update(1/120);inp.endFrame();};
  const o={};
  for(const ws of [1]){ e.setSetting('worldScale',ws); e.reset(); inp.codes.clear(); inp.codes.add('ArrowUp'); let n=0,deaths=0,hits=0,won=false;
   while(n<120*60&&e.st!=='won'){ const a=e.attempts; step(); n++; }
   o.blind={st:e.st,attempts:e.attempts,hits:e.hits,sec:n/120}; }
  return o;})));
await b.close();
