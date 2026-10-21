import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const src = (await import('node:fs')).readFileSync('C:/Claude/juit-site/_dev/sirayla_test.mjs','utf8');
