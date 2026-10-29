// usage: node run.mjs <W> <H> <steps.mjs> [base]   (mobile + DPR2 when W<600 or H<500)
import { chromium } from 'playwright-core';
import path from 'node:path';
const [W, H, steps, base = 'http://localhost:5199/'] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5]];
const mobile = W < 600 || H < 500;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
await ctx.addInitScript(() => { window.__ECU_E2E__ = true; });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); });
const dir = path.dirname(new URL(import.meta.url).pathname);
const name = path.basename(steps, '.mjs');
let n = 0;
const shot = async (tag = String(++n)) => { const f = `${dir}/out-${name}-${tag}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
page.base = base;
await page.goto(base);
await page.waitForTimeout(1500);
const mod = await import(path.resolve(steps));
try { await mod.default(page, shot); } catch (e) { console.log('STEP ERROR', e.message); await shot('err'); }
console.log(errs.slice(-25).join('\n'));
await browser.close();
