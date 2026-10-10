// Unit tests for the pure parts: recognition, radar reading, music mapping, taste learning.
// Run: node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const memory = new Map();
const ctx = vm.createContext({
  console,
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  },
});
for (const f of ['geometry.js', 'shapes.js', 'music.js', 'reader.js', 'taste.js', 'demo.js']) {
  vm.runInContext(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { Shapes, Reader: R, Music: M, Taste, Demo } = ctx.SamSo;

// ---------- synthetic strokes ----------
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const TAU = Math.PI * 2;

// Ellipse-ish stroke starting at 12 o'clock; dir 1 = clockwise on screen.
function ring({ cx = 400, cy = 400, rx = 120, ry = rx, n = 90, sweep = 1.04, dir = 1, jitter = 2, seed = 1, rot = 0 }) {
  const rand = rng(seed);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = dir * (i / n) * sweep * TAU;
    const x0 = rx * Math.sin(a), y0 = -ry * Math.cos(a);
    const x = x0 * Math.cos(rot) - y0 * Math.sin(rot), y = x0 * Math.sin(rot) + y0 * Math.cos(rot);
    pts.push({ x: cx + x + (rand() - 0.5) * jitter, y: cy + y + (rand() - 0.5) * jitter, p: 0.5 });
  }
  return pts;
}

function poly(vertices, { per = 22, jitter = 2, seed = 3, overshoot = 0.08 } = {}) {
  const rand = rng(seed);
  const pts = [];
  const vs = vertices.concat([vertices[0], vertices[1]]);
  for (let i = 0; i < vertices.length; i++) {
    const [ax, ay] = vs[i], [bx, by] = vs[i + 1];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      pts.push({ x: ax + (bx - ax) * t + (rand() - 0.5) * jitter, y: ay + (by - ay) * t + (rand() - 0.5) * jitter, p: 0.5 });
    }
  }
  const [ax, ay] = vs[vertices.length], [bx, by] = vs[vertices.length + 1];
  for (let k = 0; k <= per * overshoot; k++) pts.push({ x: ax + ((bx - ax) * k) / per, y: ay + ((by - ay) * k) / per, p: 0.5 });
  return pts;
}

function rotated(vertices, deg, cx = 400, cy = 400) {
  const a = (deg * Math.PI) / 180;
  return vertices.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
}

const opts = { S: 800 };

// ---------- recognition ----------
test('a hand-drawn circle is a closed circle, drawn clockwise', () => {
  const r = Shapes.analyze(ring({}), opts);
  assert.equal(r.kind, 'closed');
  assert.equal(r.shape, 'circle');
  assert.equal(r.dir, 1);
  assert.ok(Math.abs(r.r - 120) < 10, `radius ${r.r}`);
});

test('counter-clockwise circle reports dir -1', () => {
  const r = Shapes.analyze(ring({ dir: -1 }), opts);
  assert.equal(r.shape, 'circle');
  assert.equal(r.dir, -1);
});

test('ellipses and sloppy circles with a gap still count as circles', () => {
  assert.equal(Shapes.analyze(ring({ rx: 160, ry: 100 }), opts).shape, 'circle');
  assert.equal(Shapes.analyze(ring({ rx: 100, ry: 150, rot: 0.6, jitter: 6, seed: 9 }), opts).shape, 'circle');
  const gap = Shapes.analyze(ring({ sweep: 0.93, jitter: 5, seed: 4 }), opts);
  assert.equal(gap.kind, 'closed');
  assert.equal(gap.shape, 'circle');
});

test('squares, rectangles and rotated squares are squares', () => {
  const sq = [[300, 300], [500, 300], [500, 500], [300, 500]];
  assert.equal(Shapes.analyze(poly(sq), opts).shape, 'square');
  assert.equal(Shapes.analyze(poly([[250, 330], [560, 330], [560, 470], [250, 470]]), opts).shape, 'square');
  assert.equal(Shapes.analyze(poly(rotated(sq, 30), { jitter: 4, seed: 7 }), opts).shape, 'square');
});

test('triangles are triangles', () => {
  assert.equal(Shapes.analyze(poly([[400, 260], [540, 500], [260, 500]]), opts).shape, 'triangle');
  assert.equal(Shapes.analyze(poly([[300, 300], [520, 520], [300, 520]], { jitter: 4, seed: 5 }), opts).shape, 'triangle');
});

test('an open arc is not a loop', () => {
  const r = Shapes.analyze(ring({ sweep: 0.66 }), opts);
  assert.notEqual(r.kind, 'closed');
});

test('line, zigzag, spiral and dot', () => {
  const line = [];
  for (let i = 0; i <= 40; i++) line.push({ x: 200 + i * 8, y: 300 + i * 2 + (i % 3), p: 0.5 });
  assert.equal(Shapes.analyze(line, opts).kind, 'line');

  const zig = [];
  for (let i = 0; i <= 8; i++) {
    const x0 = 200 + i * 40, y0 = i % 2 ? 260 : 340;
    const x1 = 200 + (i + 1) * 40, y1 = (i + 1) % 2 ? 260 : 340;
    for (let k = 0; k < 10; k++) zig.push({ x: x0 + ((x1 - x0) * k) / 10, y: y0 + ((y1 - y0) * k) / 10, p: 0.5 });
  }
  const z = Shapes.analyze(zig, opts);
  assert.equal(z.kind, 'zigzag');
  assert.ok(z.jag > 0.5, `jag ${z.jag}`);

  const sp = [];
  for (let i = 0; i <= 300; i++) {
    const a = (i / 300) * 3 * TAU, r = 10 + i * 0.5;
    sp.push({ x: 400 + r * Math.sin(a), y: 400 - r * Math.cos(a), p: 0.5 });
  }
  assert.equal(Shapes.analyze(sp, opts).kind, 'spiral');

  assert.equal(Shapes.analyze([{ x: 100, y: 100 }, { x: 102, y: 101 }], opts).kind, 'dot');
});

// ---------- radar reading ----------
function loopFrom(stroke, inst = 'drums', bars = 1) {
  const a = Shapes.analyze(stroke, opts);
  return R.prepareLoop({ id: 'L1', inst, shape: a.shape, points: a.ringPts, cx: a.cx, cy: a.cy, r: a.r, dir: a.dir, bars, params: {} });
}
const dot = (id, inst, x, y) => ({ id, inst, kind: 'dot', points: [{ x, y, p: 0.5 }], cx: x, cy: y, jag: 0, pen: false, pressure: 0.5 });
// arrays from the vm realm fail deepStrictEqual on prototype, so copy them into this realm
const plain = (x) => JSON.parse(JSON.stringify(x));
const notesOf = (ev) => plain(ev.flatMap((list, s) => list.map((n) => Object.assign({ s }, n))));

test('a dot at 3 o\'clock, halfway out, is a snare on beat 2 of a drum loop', () => {
  const L = loopFrom(ring({ jitter: 0 }));
  const ev = R.readLoop(L, [dot('a', 'drums', 400 + 60, 400)]);
  const ns = notesOf(ev);
  assert.equal(ns.length, 1);
  assert.equal(ns[0].s, 4);
  assert.equal(ns[0].lane, 1);
});

test('counter-clockwise loops run the other way round', () => {
  const L = loopFrom(ring({ dir: -1, jitter: 0 }));
  const ns = notesOf(R.readLoop(L, [dot('a', 'drums', 460, 400)]));
  assert.equal(ns[0].s, 12);
});

test('a centre dot plays on every beat', () => {
  const L = loopFrom(ring({ jitter: 0 }));
  const ns = notesOf(R.readLoop(L, [dot('c', 'drums', 400, 400)]));
  assert.deepEqual(ns.map((n) => n.s), [0, 4, 8, 12]);
  assert.ok(ns.every((n) => n.lane === 0));
});

test('an arc at constant height becomes one held note; a radial stroke a chord', () => {
  const L = loopFrom(ring({ jitter: 0 }), 'lead', 1);
  const arc = [];
  for (let i = 0; i <= 30; i++) {
    const a = (0.02 + (0.23 * i) / 30) * TAU;
    arc.push({ x: 400 + 70 * Math.sin(a), y: 400 - 70 * Math.cos(a), p: 0.5 });
  }
  const held = notesOf(R.readLoop(L, [{ id: 'arc', inst: 'lead', kind: 'curve', points: arc, cx: 0, cy: 0, jag: 0 }]));
  assert.equal(held.length, 1);
  assert.ok(held[0].dur >= 3, `dur ${held[0].dur}`);

  const radial = [];
  for (let i = 0; i <= 20; i++) radial.push({ x: 400 + 20 + i * 4.5, y: 400 + 1, p: 0.5 });
  const chord = notesOf(R.readLoop(L, [{ id: 'rad', inst: 'lead', kind: 'line', points: radial, cx: 0, cy: 0, jag: 0 }]));
  assert.ok(chord.some((n) => n.type === 'chord' && n.slots.length >= 2), JSON.stringify(chord));
});

test('small shapes inside a loop: circle = chord, triangle = arpeggio', () => {
  const L = loopFrom(ring({ jitter: 0 }), 'pad', 2);
  const small = ring({ cx: 470, cy: 400, rx: 18, jitter: 0 });
  const a = Shapes.analyze(small, opts);
  const m = { id: 'o', inst: 'pad', kind: 'closed', shape: 'circle', points: a.points, cx: a.cx, cy: a.cy, jag: 0 };
  const ns = notesOf(R.readLoop(L, [m]));
  assert.equal(ns.length, 1);
  assert.equal(ns[0].type, 'chord');
  assert.ok(ns[0].dur >= 4);
  m.shape = 'triangle';
  m.inst = 'lead';
  const arp = notesOf(R.readLoop(L, [m]));
  assert.ok(arp.length >= 4);
  assert.ok(arp.every((n) => n.type === 'note'));
});

test('ink in the halo just outside the ring plays very high', () => {
  const L = loopFrom(ring({ jitter: 0 }), 'lead', 1);
  const ns = notesOf(R.readLoop(L, [dot('h', 'lead', 400, 400 - 150)]));
  assert.ok(ns[0].slot >= M.INSTRUMENTS.lead.slots, `slot ${ns[0].slot}`);
});

test('drones sustain until the next drone note', () => {
  const L = loopFrom(ring({ jitter: 0 }), 'drone', 1);
  const ns = notesOf(R.readLoop(L, [dot('a', 'drone', 460, 400), dot('b', 'drone', 340, 400)]));
  assert.deepEqual(ns.map((n) => [n.s, n.dur]), [[4, 8], [12, 8]]);
});

test('marks belong to the loop they are inside', () => {
  const A = loopFrom(ring({ cx: 200, cy: 200, rx: 80, jitter: 0 }));
  A.id = 'A';
  const B = loopFrom(ring({ cx: 600, cy: 200, rx: 80, jitter: 0 }));
  B.id = 'B';
  const scene = { loops: [A, B], marks: [dot('1', 'drums', 210, 200), dot('2', 'drums', 590, 230), dot('3', 'drums', 400, 600)] };
  R.assign(scene);
  assert.deepEqual(plain(scene.marks.map((m) => m.loopId)), ['A', 'B', null]);
});

// ---------- music ----------
test('scales: the night mood is A minor pentatonic', () => {
  assert.equal(M.slotToMidi(0, 'bass', 'nacht', 0), 45);
  assert.equal(M.slotToMidi(1, 'bass', 'nacht', 0), 48);
  assert.equal(M.slotToMidi(5, 'bass', 'nacht', 0), 57);
  assert.equal(M.slotToMidi(0, 'bass', 'nacht', 1), 57);
  assert.equal(M.barsFor(200, 800), 1);
  assert.equal(M.barsFor(400, 800), 2);
  assert.equal(M.barsFor(700, 800), 4);
});

// ---------- taste ----------
test('thumbs down proposes a clearly different vibe, thumbs up moves the preference', () => {
  Taste._setRng(rng(42));
  Taste.reset();
  const v0 = Taste.initialVibe();
  assert.equal(v0.mood, 'nacht');
  const d = Taste.dislikeVibe(v0);
  const changed = Object.keys(v0).filter((k) => d.next[k] !== v0[k]);
  assert.ok(changed.length >= 1, d.text);
  assert.match(d.text, /^Anders geprobeerd: /);
  const liked = Object.assign({}, v0, { tempo: 120, mood: 'zonnig' });
  Taste.likeVibe(liked);
  Taste.likeVibe(liked);
  const v1 = Taste.initialVibe();
  assert.equal(v1.mood, 'zonnig');
  assert.ok(v1.tempo > 110, `tempo ${v1.tempo}`);
  assert.ok(memory.get('samso.taste.v1').includes('zonnig'), 'saved to storage');
});

test('sound preferences are remembered per instrument and shape', () => {
  Taste.reset();
  const base = Taste.soundFor('bass', 'square');
  const d = Taste.dislikeSound('bass', 'square', base);
  assert.ok(Object.keys(base).some((k) => d.next[k] !== base[k]));
  const liked = Object.assign({}, base, { bright: 0.9, decay: 0.1 });
  Taste.likeSound('bass', 'square', liked);
  const after = Taste.soundFor('bass', 'square');
  assert.equal(after.bright, 0.9);
  assert.deepEqual(plain(Taste.soundFor('bass', 'circle')), plain(Taste.SHAPE_DEFAULTS.circle));
  const desc = Taste.describe();
  assert.equal(desc.sounds.length, 1);
  assert.ok(desc.sounds[0].words.includes('feller'));
});

// ---------- demo ----------
for (const [w, h] of [[390, 844], [1180, 820], [820, 1180], [1440, 900], [844, 390]]) {
  test(`example sheet fits and plays on ${w}x${h}`, () => {
    const sc = Demo.build(w, h);
    R.assign(sc);
    assert.equal(sc.loops.length, 3);
    for (const L of sc.loops) {
      assert.ok(L.cx - L.maxR > 0 && L.cx + L.maxR < w, `loop ${L.inst} inside width`);
      assert.ok(L.cy - L.maxR > 0 && L.cy + L.maxR < h, `loop ${L.inst} inside height`);
      const ev = R.readLoop(L, sc.marks.filter((m) => m.loopId === L.id));
      assert.ok(notesOf(ev).length >= 6, `${L.inst} has notes`);
    }
    assert.ok(sc.marks.every((m) => m.loopId), 'every example mark belongs to a loop');
  });
}
