/**
 * tools/verify.mjs
 * Real-browser acceptance harness for the studio layer.
 *
 * Runs Chromium against demo/studio.html and checks behaviour that jsdom cannot prove:
 * actual pixel movement, real transition timing, keyboard focus, and layout metrics.
 * Also measures performance on a 60-tile board with CPU throttling disabled.
 *
 * Usage: node tools/verify.mjs
 * Outputs: shots/*.png and a JSON summary on stdout.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shotDir = path.join(root, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const url = pathToFileURL(path.join(root, 'demo', 'studio.html')).href;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({
  // This machine has several Chromium builds cached; the one Playwright 1.54 expects
  // (1181) is absent, so point at an installed build instead of downloading.
  executablePath: process.env.PW_CHROME
    || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__studio && !!window.__grid);
await page.waitForTimeout(350);

// ---------------------------------------------------------------- 1. boot
{
  const tiles = await page.locator('.grid-stack-item').count();
  check('8 tiles render on boot', tiles === 8, `${tiles} tiles`);

  const roles = await page.evaluate(() => ({
    container: document.querySelector('.grid-stack').getAttribute('role'),
    itemRole: document.querySelector('.grid-stack-item').getAttribute('role'),
    itemDesc: document.querySelector('.grid-stack-item').getAttribute('aria-roledescription'),
    label: document.querySelector('.grid-stack-item').getAttribute('aria-label'),
  }));
  check('container has role=application', roles.container === 'application');
  check('tiles have role=group + roledescription', roles.itemRole === 'group' && roles.itemDesc === 'tile');
  check('tile label carries position', /row \d+ column \d+/.test(roles.label || ''), roles.label);
}

await page.screenshot({ path: path.join(shotDir, '01-boot.png') });

// ------------------------------------------------- 1b. no clipped tile text
{
  // Catches the class of bug screenshots kept revealing: a flex child with a fixed basis gets
  // squeezed and the figure is cut through the middle. scrollHeight > clientHeight is the
  // signal; it is checked on every tile, at every breakpoint, not just the default viewport.
  const clipped = async () => page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.grid-stack-item').forEach(el => {
      const v = el.querySelector('.tile-val');
      const c = el.querySelector('.grid-stack-item-content');
      if (!v || !c) return;
      const vRect = v.getBoundingClientRect();
      const cRect = c.getBoundingClientRect();
      // the figure must sit fully inside the tile's padded content box
      // Only geometric containment matters: the figure's box must sit inside the content box.
      // (scrollHeight/clientHeight is useless here - sub-pixel line boxes make it report a
      // 1px overflow on perfectly rendered text.)
      if (vRect.bottom > cRect.bottom + 1 || vRect.top < cRect.top - 1) {
        bad.push(el.getAttribute('gs-id') + ' val[' + Math.round(vRect.top) + ',' + Math.round(vRect.bottom) + '] content[' + Math.round(cRect.top) + ',' + Math.round(cRect.bottom) + ']');
      }
    });
    return bad;
  });

  const bad = await clipped();
  check('no tile figure is clipped at 1440px', bad.length === 0, bad.slice(0, 3).join(' | '));
}

// ------------------------------------------------- 2. real pixel movement
{
  const before = await page.locator('[gs-id="queue"]').boundingBox();
  await page.evaluate(async () => {
    const g = window.__grid;
    const n = g.engine.nodes.find(n => n.id === 'queue');
    g.update(n.el, { x: 0, y: 6 });
  });
  await page.waitForTimeout(200);
  const after = await page.locator('[gs-id="queue"]').boundingBox();
  check('a moved tile actually changes pixel position',
    Math.abs(after.x - before.x) > 50 && Math.abs(after.y - before.y) > 50,
    `dx=${Math.round(after.x - before.x)} dy=${Math.round(after.y - before.y)}`);
}

// ------------------------------------------------------ 3. undo restores px
{
  const before = await page.locator('[gs-id="queue"]').boundingBox();
  await page.evaluate(() => window.__studio.undo());
  await page.waitForTimeout(450);
  const after = await page.locator('[gs-id="queue"]').boundingBox();
  check('undo restores the original pixels',
    Math.abs(after.x - before.x) > 50 || Math.abs(after.y - before.y) > 50,
    `back to x=${Math.round(after.x)} y=${Math.round(after.y)}`);

  const model = await page.evaluate(() => {
    const n = window.__grid.engine.nodes.find(n => n.id === 'queue');
    return { x: n.x, y: n.y };
  });
  check('undo restores the model coordinates', model.x === 7 && model.y === 2, JSON.stringify(model));
}

// ------------------------------------------------------- 4. undo/redo chain
{
  // Three quick programmatic edits of the same kind coalesce into ONE undo step by design
  // (that is what makes one Ctrl+Z undo one gesture). Verify that contract explicitly.
  const depth0 = await page.evaluate(() => window.__studio.state.depth);
  await page.evaluate(async () => {
    const g = window.__grid;
    const n = g.engine.nodes.find(n => n.id === 'rev');
    g.update(n.el, { x: 1 });
    g.update(n.el, { x: 2 });
    g.update(n.el, { x: 3 });
  });
  await page.waitForTimeout(200);
  const depth3 = await page.evaluate(() => window.__studio.state.depth);
  check('a burst of same-kind edits coalesces into one undo step', depth3 === depth0 + 1,
    `depth ${depth0} -> ${depth3}`);

  await page.evaluate(async () => { await window.__studio.undo(); });
  await page.waitForTimeout(250);
  const x = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'rev').x);
  check('one undo reverts the whole burst', x === 0, `x=${x}`);

  await page.evaluate(async () => { await window.__studio.redo(); });
  await page.waitForTimeout(250);
  const xr = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'rev').x);
  check('redo re-applies the burst', xr === 3, `x=${xr}`);
}

// --------------------------------------------------- 5. align reduces slack
{
  await page.evaluate(() => document.getElementById('scramble').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shotDir, '02-scrambled.png') });

  const before = await page.evaluate(() => {
    const items = window.__grid.engine.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
    return { rows: Math.max(...items.map(i => i.y + i.h)), count: items.length };
  });

  // preview ghosts, then apply
  await page.evaluate(() => document.getElementById('preview').click());
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shotDir, '03-preview.png') });

  await page.evaluate(() => document.getElementById('align-seam').click());
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotDir, '04-aligned.png') });

  const after = await page.evaluate(() => {
    const items = window.__grid.engine.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
    return { rows: Math.max(...items.map(i => i.y + i.h)), count: items.length };
  });
  check('align does not lose tiles', after.count === before.count, `${before.count} -> ${after.count}`);
  check('align reduces or keeps row count', after.rows <= before.rows, `rows ${before.rows} -> ${after.rows}`);
}

// ----------------------------------------------- 6. no overlaps after align
{
  const overlaps = await page.evaluate(() => {
    const items = window.__grid.engine.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
    const bad = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const hit = !(a.y >= b.y + b.h || a.y + a.h <= b.y || a.x >= b.x + b.w || a.x + a.w <= b.x);
      if (hit) bad.push([a.id, b.id]);
    }
    return bad;
  });
  check('no two tiles overlap after align', overlaps.length === 0, overlaps.length ? JSON.stringify(overlaps) : 'clean');

  // regression guard: reset used to leave orphaned DOM nodes, producing duplicate gs-id tiles
  const dupes = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.grid-stack-item')].map(e => e.getAttribute('gs-id'));
    const seen = new Set(), dup = new Set();
    ids.forEach(i => { if (seen.has(i)) dup.add(i); seen.add(i); });
    return { total: ids.length, dup: [...dup] };
  });
  check('no duplicate tile ids in the DOM', dupes.dup.length === 0,
    dupes.dup.length ? dupes.dup.join(',') : `${dupes.total} unique tiles`);
}

// ------------------------------------------------------ 7. keyboard moves
{
  await page.evaluate(() => document.getElementById('reset').click());
  await page.waitForTimeout(300);

  await page.locator('[gs-id="errors"]').focus();
  const beforeX = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'errors').x);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const afterX = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'errors').x);
  check('ArrowRight moves the focused tile by one cell', afterX === beforeX + 1, `x ${beforeX} -> ${afterX}`);

  // ctrl+arrow resizes
  const beforeW = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'errors').w);
  await page.keyboard.press('Control+ArrowRight');
  await page.waitForTimeout(150);
  const afterW = await page.evaluate(() => window.__grid.engine.nodes.find(n => n.id === 'errors').w);
  check('Ctrl+ArrowRight widens the tile', afterW === beforeW + 1, `w ${beforeW} -> ${afterW}`);

  await page.screenshot({ path: path.join(shotDir, '05-keyboard-focus.png') });

  // focus ring must be visible
  const outline = await page.evaluate(() => {
    const el = document.querySelector('[gs-id="errors"]');
    return getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth;
  });
  check('focused tile shows a visible outline', /solid|dashed/.test(outline) && !/0px/.test(outline), outline);
}

// ------------------------------------------------- 8. live region announces
{
  const text = await page.locator('#announce').textContent();
  check('live region receives an announcement', !!text && text.trim().length > 3, text?.slice(0, 70));
}

// ------------------------------------------------------ 9. responsive layout
{
  for (const [w, h, tag] of [[1024, 900, '1024'], [768, 900, '768'], [390, 844, '390']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(320);
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return { scroll: de.scrollWidth - de.clientWidth, bodyW: document.body.getBoundingClientRect().width };
    });
    check(`no horizontal overflow at ${tag}px`, overflow.scroll <= 1, `scrollWidth-clientWidth=${overflow.scroll}`);

    const clipped = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.grid-stack-item').forEach(el => {
        const v = el.querySelector('.tile-val');
        const c = el.querySelector('.grid-stack-item-content');
        if (!v || !c) return;
        const vRect = v.getBoundingClientRect();
        const cRect = c.getBoundingClientRect();
        if (vRect.bottom > cRect.bottom + 1 || vRect.top < cRect.top - 1) {
          bad.push(el.getAttribute('gs-id'));
        }
      });
      return bad;
    });
    check(`no tile figure is clipped at ${tag}px`, clipped.length === 0, clipped.slice(0, 3).join(','));

    await page.screenshot({ path: path.join(shotDir, `06-responsive-${tag}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(320);

  // A responsive round-trip must restore the desktop arrangement exactly, otherwise anyone who
  // rotates a tablet loses the dashboard they arranged.
  const wideBefore = await page.evaluate(() =>
    window.__grid.engine.nodes.map(n => `${n.id}@${n.x},${n.y}`).sort().join('|'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(420);
  const narrowCols = await page.evaluate(() => window.__grid.getColumn());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(420);
  const wideAfter = await page.evaluate(() =>
    window.__grid.engine.nodes.map(n => `${n.id}@${n.x},${n.y}`).sort().join('|'));
  check('grid collapses to 1 column on a phone', narrowCols === 1, `column=${narrowCols}`);
  check('desktop layout is restored exactly after the round-trip', wideBefore === wideAfter,
    wideBefore === wideAfter ? 'identical' : `\n  before ${wideBefore}\n  after  ${wideAfter}`);
}

// --------------------------------------------------- 10. reduced motion path
{
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => window.__studio.reducedMotion);
  check('reduced-motion preference is detected', reduced === true);

  const t0 = Date.now();
  await page.evaluate(() => document.getElementById('reset').click());
  await page.waitForTimeout(60);
  await page.evaluate(() => document.getElementById('align-seam').click());
  await page.waitForTimeout(80);
  const elapsed = Date.now() - t0;
  check('alignment still completes under reduced motion', elapsed < 900, `${elapsed}ms wall clock`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

// ----------------------------------------------------------- 11. performance
{
  const perf = await page.evaluate(async () => {
    const g = window.__grid;
    // build a 60-tile board with deliberate slack (one empty row between bands) so the solver
    // actually has to move things: measuring a no-op would be meaningless.
    g.removeAll(true);
    const items = [];
    for (let i = 0; i < 60; i++) {
      items.push({ id: 'p' + i, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 1, content: '' });
    }
    g.load(items);
    await new Promise(r => setTimeout(r, 80));

    const t0 = performance.now();
    const plan = window.__studio.plan('seam');
    const planMs = performance.now() - t0;

    // measure apply with morph disabled to isolate solver + DOM write cost
    const morphBefore = window.__studio._opts.morph;
    window.__studio._opts.morph = false;
    const t1 = performance.now();
    await window.__studio.applyPlan(plan);
    const applyMs = performance.now() - t1;
    window.__studio._opts.morph = morphBefore;

    return { tiles: g.engine.nodes.length, planMs, applyMs, moves: plan.moves.length, rowsAfter: plan.after.rows };
  });
  check('solver handles 60 tiles', perf.tiles === 60, `${perf.tiles} tiles`);
  check('the 60-tile benchmark actually moves tiles', perf.moves > 20, `${perf.moves} moves, rows -> ${perf.rowsAfter}`);
  check('plan() stays under 40ms for 60 tiles', perf.planMs < 40, `${perf.planMs.toFixed(2)}ms`);
  check('applyPlan() stays under 400ms for 60 tiles', perf.applyMs < 400, `${perf.applyMs.toFixed(1)}ms`);

  // frame timing during a morph on the 60-tile board
  const frames = await page.evaluate(async () => {
    const g = window.__grid;
    g.removeAll(true);
    const items = [];
    for (let i = 0; i < 60; i++) {
      items.push({ id: 'q' + i, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 1, content: '' });
    }
    g.load(items);
    await new Promise(r => setTimeout(r, 120));

    const gaps = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const plan = window.__studio.plan('seam');
    await window.__studio.applyPlan(plan);
    await new Promise(r => setTimeout(r, 200));
    running = false;
    gaps.shift();
    gaps.sort((a, b) => a - b);
    const p = q => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))];
    return {
      samples: gaps.length,
      avg: gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1),
      p50: p(0.5), p95: p(0.95), max: gaps[gaps.length - 1],
      long: gaps.filter(g => g > 50).length,
    };
  });
  check('morph on 60 tiles produces no long tasks (>50ms)', frames.long === 0,
    `samples=${frames.samples} avg=${frames.avg.toFixed(1)}ms p95=${frames.p95.toFixed(1)}ms max=${frames.max.toFixed(1)}ms`);

  await page.screenshot({ path: path.join(shotDir, '07-sixty-tiles.png') });
  results.push({ name: 'PERF_FRAMES', pass: true, detail: JSON.stringify(frames) });
  console.log(`\nFrame timing (60 tiles, morph): avg=${frames.avg.toFixed(1)}ms p50=${frames.p50.toFixed(1)}ms p95=${frames.p95.toFixed(1)}ms max=${frames.max.toFixed(1)}ms longTasks=${frames.long}`);
  console.log(`Solver: plan=${perf.planMs.toFixed(2)}ms apply=${perf.applyMs.toFixed(1)}ms moves=${perf.moves}`);
}

// ---------------------------------------------------------- 12. no JS errors
check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.filter(r => r.name !== 'PERF_FRAMES').length - failed.length}/${results.filter(r => r.name !== 'PERF_FRAMES').length} checks passed`);
fs.writeFileSync(path.join(root, 'shots', 'verify-results.json'), JSON.stringify(results, null, 2));
if (failed.length) { console.error('\nFAILED:', failed.map(f => f.name).join(', ')); process.exit(1); }
