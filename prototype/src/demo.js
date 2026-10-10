/* SamSo · example sheet: a drum circle, a bass square and a sun with a face.
   Built from the same data the drawing code produces, so it reads exactly
   like hand-drawn ink would. */
(function (S) {
  'use strict';
  const R = S.Reader, M = S.Music;
  const TAU = Math.PI * 2;
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);

  function circlePts(cx, cy, r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      pts.push({ x: cx + r * Math.sin(th), y: cy - r * Math.cos(th) });
    }
    return pts;
  }

  // Square perimeter starting at the top middle, clockwise.
  function squarePts(cx, cy, half, n) {
    const corners = [[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [0, -1]];
    const pts = [];
    const per = n / 4;
    for (let c = 0; c < 5; c++) {
      const [ax, ay] = corners[c], [bx, by] = corners[c + 1];
      const len = c === 0 || c === 4 ? 0.5 : 1;
      const k = Math.max(2, Math.round(per * len));
      for (let i = 0; i < k; i++) {
        const t = i / k;
        pts.push({ x: cx + half * (ax + (bx - ax) * t), y: cy + half * (ay + (by - ay) * t) });
      }
    }
    return pts;
  }

  function makeLoop(inst, shape, cx, cy, size, bars) {
    const pts = shape === 'square' ? squarePts(cx, cy, size * 0.43, 120) : circlePts(cx, cy, size / 2, 120);
    let r = 0;
    for (const p of pts) r += Math.hypot(p.x - cx, p.y - cy);
    const L = { id: uid('L'), inst, shape, points: pts, cx, cy, r: r / pts.length, dir: 1, bars, muted: false, params: {} };
    return R.prepareLoop(L);
  }

  function mark(inst, kind, pts, extra) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return Object.assign({
      id: uid('m'), inst, kind, shape: null,
      points: pts.map((p) => ({ x: p.x, y: p.y, p: 0.5 })),
      cx: x / pts.length, cy: y / pts.length, jag: 0, pen: false, pressure: 0.5,
    }, extra || {});
  }

  const dotXY = (inst, x, y) => mark(inst, 'dot', [{ x, y }]);
  const dotAt = (L, inst, step, u) => {
    const p = R.pointAt(L, step / L.steps, u);
    return dotXY(inst, p.x, p.y);
  };
  // A short stroke along the ring at height u, covering `len` steps.
  const dash = (L, inst, step, len, u) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(R.pointAt(L, (step - 0.35 + (len - 0.3) * (i / 8)) / L.steps, u));
    return mark(inst, 'curve', pts);
  };

  function build(W, H) {
    const S0 = Math.min(W, H);
    const top = 80, bottom = 100, side = 18;
    const aw = W - 2 * side, ah = H - top - bottom;
    let dD = 0.32 * S0, dB = 0.5 * S0, dS = 0.48 * S0;
    const halo = 1.45;
    let g = 0.07 * S0;
    const landscape = aw > ah * 1.15;
    let tw, th;
    if (landscape) {
      tw = Math.max(dD, dB) + g + dS * halo;
      th = Math.max(dD + g + dB, dS * halo);
    } else {
      tw = Math.max(dD + g + dB, dS * halo);
      th = Math.max(dD, dB) + g + dS * halo;
    }
    const k = Math.min(1, aw / tw, ah / th);
    dD *= k; dB *= k; dS *= k; g *= k; tw *= k; th *= k;
    const x0 = (W - tw) / 2, y0 = top + (ah - th) / 2;
    let pD, pB, pS;
    if (landscape) {
      const colW = Math.max(dD, dB);
      const colH = dD + g + dB;
      const cy0 = y0 + (th - colH) / 2;
      pD = { x: x0 + colW / 2 - colW * 0.08, y: cy0 + dD / 2 };
      pB = { x: x0 + colW / 2, y: cy0 + dD + g + dB / 2 };
      pS = { x: x0 + colW + g + (dS * halo) / 2, y: y0 + th / 2 };
    } else {
      const rowW = dD + g + dB;
      const rx = (W - rowW) / 2;
      const rowH = Math.max(dD, dB);
      pD = { x: rx + dD / 2, y: y0 + rowH / 2 - dD * 0.08 };
      pB = { x: rx + dD + g + dB / 2, y: y0 + rowH / 2 };
      pS = { x: W / 2, y: y0 + rowH + g + (dS * halo) / 2 };
    }

    const D = makeLoop('drums', 'circle', pD.x, pD.y, dD, 1);
    const B = makeLoop('bass', 'square', pB.x, pB.y, dB, 2);
    const Sun = makeLoop('lead', 'circle', pS.x, pS.y, dS, 2);
    const marks = [];

    // Drums: centre dot = kick on every beat, snare on 2 and 4, hihat between the beats.
    marks.push(dotXY('drums', D.cx, D.cy));
    marks.push(dotAt(D, 'drums', 4, 0.57), dotAt(D, 'drums', 12, 0.57));
    for (const s of [2, 6, 10, 14]) marks.push(dash(D, 'drums', s, 1, 0.86));

    // Bass: [step, length, scale step]
    const bass = [[0, 3, 0], [3, 1, 0], [6, 2, 3], [10, 2, 0], [14, 2, 5], [16, 3, 0], [19, 1, 0], [22, 2, 1], [26, 2, 2], [29, 1, 3], [30, 2, 4]];
    for (const [s, len, slot] of bass) marks.push(dash(B, 'bass', s, len, M.slotU(slot, M.INSTRUMENTS.bass.slots)));

    // Sun: eyes, smile, and rays in the halo that sparkle as high notes.
    const r = Sun.r;
    marks.push(dotXY('lead', Sun.cx - 0.32 * r, Sun.cy - 0.24 * r), dotXY('lead', Sun.cx + 0.32 * r, Sun.cy - 0.24 * r));
    const smile = [];
    for (let i = 0; i <= 24; i++) {
      const a = ((120 + (120 * i) / 24) / 360) * TAU;
      smile.push({ x: Sun.cx + 0.6 * r * Math.sin(a), y: Sun.cy - 0.12 * r - 0.6 * r * Math.cos(a) });
    }
    marks.push(mark('lead', 'curve', smile));
    // rays sit between the beats (offbeat eighths), together with the hihats
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * TAU;
      const u1 = i % 2 ? 1.27 : 1.42;
      const pts = [];
      for (let j = 0; j <= 6; j++) pts.push(R.pointAtAngle(Sun, a, 1.12 + ((u1 - 1.12) * j) / 6));
      marks.push(mark('lead', 'line', pts));
    }

    return { v: 1, world: { w: W, h: H }, loops: [D, B, Sun], marks };
  }

  S.Demo = { build };
})(globalThis.SamSo = globalThis.SamSo || {});
