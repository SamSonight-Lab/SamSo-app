// Browser test: draws with real pointer events, checks audio runs, renders sound
// offline, and saves screenshots to test/out/. Run: npm run e2e
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }

// Local files are served by request interception on a made-up origin, so no web
// server is needed and only Google Fonts go over the network (through a proxy if set).
const base = 'http://samso.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
async function serveLocal(target) {
  await target.route(`${base}/**`, (route) => {
    const p = normalize(join(root, decodeURIComponent(new URL(route.request().url()).pathname)));
    if (!p.startsWith(root) || !existsSync(p)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
}

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await pw.chromium.launch(proxy ? { proxy: { server: proxy } } : {});

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, ctxOpts, url) {
  console.log(`\n# ${name}`);
  const context = await browser.newContext(ctxOpts);
  await serveLocal(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SamSo && window.SamSo.debug && window.SamSo.debug.scene);
  await wait(400);
  const W = ctxOpts.viewport.width, H = ctxOpts.viewport.height, S = Math.min(W, H);

  check(await page.isVisible('#ssIntro'), 'intro shows on first visit');
  await page.screenshot({ path: join(out, `${name}-1-intro.png`) });

  await page.click('#ssStartDemo');
  await wait(1600);
  const live = await page.evaluate(() => {
    const d = window.SamSo.debug;
    return { playing: d.state.playing, state: d.audio && d.audio.ctx.state, steps: d.audio && d.audio.transport.stepIndex, loops: d.scene.loops.length };
  });
  check(live.playing && live.state === 'running' && live.steps > 8, `example plays (${JSON.stringify(live)})`);
  const level = await page.evaluate(async () => {
    const { ctx, engine } = window.SamSo.debug.audio;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    engine.out.connect(an);
    let peak = 0;
    const buf = new Float32Array(an.fftSize);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
    }
    engine.out.disconnect(an);
    return peak;
  });
  check(level > 0.02 && level < 1.5, `live output is audible, peak ${level.toFixed(3)}`);
  await page.screenshot({ path: join(out, `${name}-2-example.png`) });

  // New sheet via the menu, then draw for real.
  await page.click('#ssMore');
  await page.click('#ssMorePanel [data-act="new"]');
  await page.click('.swatch[data-inst="bass"]');
  const cx = W / 2, cy = H / 2, r = S * 0.3;
  await page.mouse.move(cx, cy - r);
  await page.mouse.down();
  for (let i = 1; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2 * 1.04;
    await page.mouse.move(cx + r * Math.sin(a) + Math.sin(i) * 2, cy - r * Math.cos(a), { steps: 1 });
  }
  await page.mouse.up();
  await wait(150);
  const loop = await page.evaluate(() => { const L = window.SamSo.debug.scene.loops[0]; return L && { inst: L.inst, shape: L.shape, bars: L.bars, dir: L.dir }; });
  check(loop && loop.inst === 'bass' && loop.shape === 'circle' && loop.bars === 2 && loop.dir === 1, `drawn circle becomes a 2-bar bass loop (${JSON.stringify(loop)})`);
  const t1 = await page.textContent('#ssToast');
  check(/bas-loop van 2 maten/.test(t1), `toast explains it: "${t1}"`);

  // Dots and a wavy melody inside, drawn with touch where available.
  const tap = async (x, y) => (ctxOpts.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  await tap(cx + r * 0.5, cy + r * 0.3);
  await wait(60);
  await tap(cx - r * 0.3, cy + r * 0.3);
  await wait(60);
  await page.click('.swatch[data-inst="lead"]');
  await page.mouse.move(cx - r * 0.75, cy - r * 0.15);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(cx - r * 0.75 + (r * 1.5 * i) / 30, cy - r * 0.15 - Math.sin(i / 4) * r * 0.3);
  await page.mouse.up();
  await wait(150);
  const read = await page.evaluate(() => {
    const L = window.SamSo.debug.scene.loops[0];
    const n = L.events.reduce((a, l) => a + l.length, 0);
    return { marks: window.SamSo.debug.scene.marks.length, notes: n, toast: document.querySelector('#ssToast').textContent };
  });
  check(read.marks === 3 && read.notes >= 6, `marks inside are read as notes (${JSON.stringify(read)})`);

  // Loop menu: thumbs down changes that loop's sound.
  await page.click('.chip');
  check(await page.isVisible('#ssLoopMenu'), 'tapping a loop label opens its menu');
  const before = await page.evaluate(() => JSON.stringify(window.SamSo.debug.scene.loops[0].params));
  await page.click('#ssLoopMenu [data-act="dislike"]');
  const after = await page.evaluate(() => JSON.stringify(window.SamSo.debug.scene.loops[0].params));
  check(before !== after, 'thumbs down on a loop changes its sound');
  check(/Beter\?/.test(await page.textContent('#ssToast')), 'and says what changed');

  // Vibe: thumbs down and mood choice.
  const vibe0 = await page.evaluate(() => JSON.stringify(window.SamSo.debug.state.vibe));
  await page.click('#ssDislike');
  const vibe1 = await page.evaluate(() => JSON.stringify(window.SamSo.debug.state.vibe));
  check(vibe0 !== vibe1 && /Anders geprobeerd/.test(await page.textContent('#ssToast')), 'global thumbs down tries another vibe');
  await page.click('#ssVibe');
  await page.click('.mood[data-mood="zonnig"]');
  check((await page.evaluate(() => window.SamSo.debug.state.vibe.mood)) === 'zonnig', 'mood can be picked by hand');
  await page.screenshot({ path: join(out, `${name}-3-vibe-panel.png`) });
  await page.keyboard.press('Escape');

  // Eraser removes the first dot; undo brings it back.
  await page.click('#ssErase');
  await page.mouse.move(cx + r * 0.5 - 12, cy + r * 0.3);
  await page.mouse.down();
  await page.mouse.move(cx + r * 0.5 + 12, cy + r * 0.3, { steps: 4 });
  await page.mouse.up();
  const erased = await page.evaluate(() => window.SamSo.debug.scene.marks.length);
  check(erased === 2, `eraser removes a mark (${erased} left)`);
  await page.click('#ssUndo');
  check((await page.evaluate(() => window.SamSo.debug.scene.marks.length)) === 3, 'undo restores it');
  await page.click('#ssErase');
  await wait(700);
  await page.screenshot({ path: join(out, `${name}-4-drawn.png`) });

  // Reload: the drawing and the learned taste survive, the intro does not come back.
  await wait(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.SamSo && window.SamSo.debug && window.SamSo.debug.scene);
  const restored = await page.evaluate(() => ({ loops: window.SamSo.debug.scene.loops.length, marks: window.SamSo.debug.scene.marks.length }));
  check(restored.loops === 1 && restored.marks === 3, `drawing restored after reload (${JSON.stringify(restored)})`);
  check(!(await page.isVisible('#ssIntro')), 'intro stays away for returning users');

  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await context.close();
}

async function offline() {
  console.log('\n# offline render');
  const page = await browser.newPage();
  await serveLocal(page);
  await page.goto(`${base}/dist/samso-standalone.html`);
  await page.waitForFunction(() => window.SamSo && window.SamSo.Engine);
  const res = await page.evaluate(async () => {
    const S = window.SamSo;
    const stats = (buf) => {
      let peak = 0, sum = 0, bad = 0, clip = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        for (const v of buf.getChannelData(c)) {
          if (!Number.isFinite(v)) { bad++; continue; }
          const a = Math.abs(v);
          if (a > peak) peak = a;
          if (a > 0.99) clip++;
          sum += v * v;
        }
      }
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (buf.length * buf.numberOfChannels)).toFixed(4), bad, clip };
    };
    // 1) every instrument with every shape
    const rate = 44100;
    let ctx = new OfflineAudioContext(2, rate * 5, rate);
    let eng = new S.Engine(ctx);
    let t = 0.05;
    const per = {};
    for (const inst of S.Music.ORDER) {
      const def = S.Music.INSTRUMENTS[inst];
      ['circle', 'square', 'triangle', 'blob'].forEach((shape, k) => {
        const n = def.type === 'drum'
          ? { inst, type: 'hit', lane: k % def.lanes.length, dur: 1, vel: 0.9 }
          : { inst, type: k === 3 ? 'chord' : 'note', slot: k * 2, slots: [0, 2, 4], dur: 3, vel: 0.9, glide: k === 1 ? 0 : null, drive: k === 2 ? 0.8 : 0 };
        eng.play(n, t, 0.15, S.Taste.soundFor(inst, shape), shape, k % 2 ? 0.4 : -0.4, 'nacht');
        t += 0.07;
      });
    }
    per.all = stats(await ctx.startRendering());
    // 2) the example sheet, two bars, exactly as the app schedules it
    const sc = S.Demo.build(1180, 820);
    S.Reader.assign(sc);
    for (const L of sc.loops) S.Reader.readLoop(L, sc.marks.filter((m) => m.loopId === L.id));
    ctx = new OfflineAudioContext(2, rate * 6, rate);
    eng = new S.Engine(ctx);
    const sd = 60 / 98 / 4;
    for (let i = 0; i < 32; i++) {
      for (const L of sc.loops) {
        for (const n of L.events[i % L.steps]) eng.play(n, 0.05 + i * sd, sd, S.Taste.soundFor(n.inst, L.shape), L.shape, 0, 'nacht');
      }
    }
    per.example = stats(await ctx.startRendering());
    return per;
  });
  for (const [k, s] of Object.entries(res)) {
    check(s.bad === 0 && s.peak > 0.05 && s.peak <= 1.2 && s.rms > 0.005 && s.clip < 2000, `${k}: ${JSON.stringify(s)}`);
  }
  await page.close();
}

try {
  await offline();
  await run('iphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, `${base}/dist/samso-standalone.html`);
  await run('ipad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' }, `${base}/dist/samso-standalone.html`);
  await run('desktop-dev', { viewport: { width: 1280, height: 800 } }, `${base}/index.html`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
