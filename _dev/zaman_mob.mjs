import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' }); const logs=[];
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});const m=await c.newPage();
m.on('console',x=>{if(['error','warning'].includes(x.type()))logs.push(x.text())});m.on('pageerror',e=>logs.push('PE '+e.message));
await m.goto('http://localhost:5188/lab.html#/deney/zaman'); await m.waitForTimeout(4500);
await m.screenshot({path:'C:/Claude/juit-site/_dev/shots/zaman_mobile.png'}); console.log(logs.join('\n')||'konsol temiz'); await b.close();
