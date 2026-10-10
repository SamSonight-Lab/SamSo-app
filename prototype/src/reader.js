/* SamSo · the "radar" reading. A loop is a clock: a hand sweeps around it,
   and every bit of ink it passes sounds. Angle = when, distance from the
   centre = how high (or which drum). Special marks get special meanings:
   centre dot = every beat, small circle = chord, small triangle = arpeggio,
   small square = chord stabs, spiral = a run up or down. */
(function (S) {
  'use strict';
  const G = S.Geo, M = S.Music;
  const TAU = Math.PI * 2;
  const NB = 72; // boundary profile resolution (5 degree bins)

  // Clock angle: 0 at 12 o'clock, increasing clockwise on screen.
  function clockAngle(dx, dy) {
    let th = Math.atan2(dx, -dy);
    if (th < 0) th += TAU;
    return th;
  }

  function prepareLoop(loop) {
    const ring = G.resampleClosed(loop.points, 144);
    const sum = new Float64Array(NB), cnt = new Uint16Array(NB);
    for (const p of ring) {
      const dx = p.x - loop.cx, dy = p.y - loop.cy;
      const b = Math.min(NB - 1, Math.floor((clockAngle(dx, dy) / TAU) * NB));
      sum[b] += Math.hypot(dx, dy);
      cnt[b]++;
    }
    const prof = new Array(NB).fill(NaN);
    for (let i = 0; i < NB; i++) if (cnt[i]) prof[i] = sum[i] / cnt[i];
    const filled = prof.map((v, i) => (isNaN(v) ? -1 : i)).filter((i) => i >= 0);
    if (!filled.length) prof.fill(loop.r || 50);
    else {
      for (let i = 0; i < NB; i++) {
        if (!isNaN(prof[i])) continue;
        let a = i, b = i, da = 0, db = 0;
        while (isNaN(prof[a]) || a === i) { a = (a - 1 + NB) % NB; da++; if (da > NB) break; }
        while (isNaN(prof[b]) || b === i) { b = (b + 1) % NB; db++; if (db > NB) break; }
        prof[i] = (prof[a] * db + prof[b] * da) / (da + db);
      }
    }
    loop.profile = prof;
    loop.ring = ring;
    loop.steps = 16 * loop.bars;
    loop.maxR = Math.max(...prof);
    return loop;
  }

  function boundaryR(loop, th) {
    const f = (th / TAU) * NB - 0.5;
    let i0 = Math.floor(f);
    const t = f - i0;
    i0 = ((i0 % NB) + NB) % NB;
    const i1 = (i0 + 1) % NB;
    return loop.profile[i0] * (1 - t) + loop.profile[i1] * t;
  }

  function polar(loop, x, y) {
    const dx = x - loop.cx, dy = y - loop.cy;
    const th = clockAngle(dx, dy);
    const u = Math.hypot(dx, dy) / (boundaryR(loop, th) || 1);
    let phase = th / TAU;
    if (loop.dir < 0) phase = (1 - phase) % 1;
    return { th, u, phase };
  }

  function angleOf(loop, phase) {
    phase = ((phase % 1) + 1) % 1;
    return loop.dir < 0 ? ((1 - phase) % 1) * TAU : phase * TAU;
  }

  function pointAtAngle(loop, th, u) {
    const R = boundaryR(loop, th);
    return { x: loop.cx + u * R * Math.sin(th), y: loop.cy - u * R * Math.cos(th) };
  }

  function pointAt(loop, phase, u) {
    return pointAtAngle(loop, angleOf(loop, phase), u);
  }

  // Every mark belongs to the loop it sits most deeply inside (halo included).
  function assign(scene) {
    for (const m of scene.marks) {
      let best = null, bu = Infinity;
      for (const L of scene.loops) {
        const u = polar(L, m.cx, m.cy).u;
        if (u <= M.HALO && u < bu) { bu = u; best = L; }
      }
      m.loopId = best ? best.id : null;
    }
  }

  function dense(m) {
    if (!m._dense) m._dense = m.points.length > 1 ? G.resampleSpacing(m.points, 3, 4000) : m.points.slice();
    return m._dense;
  }

  function accent(s, inst) {
    if (inst.type === 'drum') return s % 4 === 0 ? 1 : s % 2 === 0 ? 0.86 : 0.74;
    return s % 4 === 0 ? 1 : 0.92;
  }

  // Smallest arc of the clock that contains all phases: {start, len} in phase units.
  function phaseExtent(phases) {
    const p = phases.slice().sort((a, b) => a - b);
    if (p.length < 2) return { start: p[0] || 0, len: 0 };
    let gap = p[0] + 1 - p[p.length - 1], start = p[0];
    for (let i = 1; i < p.length; i++) {
      const g = p[i] - p[i - 1];
      if (g > gap) { gap = g; start = p[i]; }
    }
    return { start, len: 1 - gap };
  }

  function readLoop(loop, marks) {
    const ev = Array.from({ length: loop.steps }, () => []);
    for (const m of marks) readMark(loop, m, ev);
    finalize(loop, ev);
    loop.events = ev;
    return ev;
  }

  function readMark(loop, m, ev) {
    const inst = M.INSTRUMENTS[m.inst];
    const steps = loop.steps;
    const vel0 = m.pen ? 0.5 + 0.5 * G.clamp((m.pressure || 0.5) / 0.55, 0, 1) : 0.85;
    const drive = G.clamp((m.jag || 0) * 0.85, 0, 1);
    const add = (s, note) => {
      s = ((s % steps) + steps) % steps;
      note.inst = m.inst;
      note.mark = m.id;
      if (note.drive == null) note.drive = drive;
      note.vel = Math.min(1, (note.vel == null ? vel0 : note.vel) * accent(s, inst));
      ev[s].push(note);
      return note;
    };
    const single = (u, x, y, dur) => {
      const vel = u > 1 ? vel0 * 0.7 : vel0;
      if (inst.type === 'drum') return { type: 'hit', lane: M.uToLane(u, inst), dur: 1, vel, x, y };
      return { type: 'note', slot: M.uToSlot(u, inst.slots), dur: dur || 1, vel, glide: null, x, y };
    };

    if (m.kind === 'dot') {
      const pp = polar(loop, m.cx, m.cy);
      if (pp.u < M.PULSE) {
        for (let s = 0; s < steps; s += 4) {
          add(s, inst.type === 'drum'
            ? { type: 'hit', lane: 0, dur: 1, x: m.cx, y: m.cy }
            : { type: 'note', slot: 0, dur: 2, glide: null, x: m.cx, y: m.cy });
        }
        return;
      }
      add(Math.round(pp.phase * steps), single(pp.u, m.cx, m.cy));
      return;
    }
    if (m.kind === 'closed') return readOrnament(loop, m, inst, add, vel0);
    if (m.kind === 'spiral') return readSpiral(loop, m, inst, add);
    readRadar(loop, m, inst, add, vel0, drive);
  }

  function readRadar(loop, m, inst, add, vel0, drive) {
    const steps = loop.steps;
    const buckets = new Map();
    for (const p of dense(m)) {
      const pp = polar(loop, p.x, p.y);
      if (pp.u < M.CENTER || pp.u > M.HALO) continue;
      const s = Math.round(pp.phase * steps) % steps;
      let b = buckets.get(s);
      if (!b) buckets.set(s, (b = []));
      b.push({ u: pp.u, x: p.x, y: p.y });
    }
    const order = [...buckets.keys()].sort((a, b) => a - b);
    let prev = null; // {s, start, note}: last single note, for ties and glides
    for (const s of order) {
      const pts = buckets.get(s).sort((a, b) => a.u - b.u);
      const clusters = [];
      let cur = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].u - pts[i - 1].u > 0.06) { clusters.push(cur); cur = []; }
        cur.push(pts[i]);
      }
      clusters.push(cur);

      const singles = [];
      for (const cl of clusters) {
        const u0 = cl[0].u, u1 = cl[cl.length - 1].u;
        let um = 0, x = 0, y = 0;
        for (const q of cl) { um += q.u; x += q.x; y += q.y; }
        um /= cl.length; x /= cl.length; y /= cl.length;
        const vel = um > 1 ? vel0 * 0.7 : vel0;
        if (inst.type === 'drum') {
          const l0 = M.uToLane(u0, inst), l1 = M.uToLane(u1, inst);
          for (let l = l0; l <= l1; l++) add(s, { type: 'hit', lane: l, dur: 1, vel, x, y });
          continue;
        }
        const a = M.uToSlot(u0, inst.slots), b = M.uToSlot(u1, inst.slots);
        if (inst.type === 'melodic' && b - a >= 2) {
          // a radial stroke spans several heights at once: play it as a chord
          const slots = [];
          for (let k = a; k <= b && slots.length < 4; k += 2) slots.push(k);
          add(s, { type: 'chord', slots, dur: 1, vel, x, y });
        } else {
          singles.push({ slot: M.uToSlot(um, inst.slots), x, y, vel });
        }
      }

      if (inst.type === 'drum') continue;
      if (singles.length === 1) {
        const sg = singles[0];
        const contiguous = prev && prev.s === s - 1;
        if (contiguous && (prev.note.slot === sg.slot || s - prev.start < (inst.minSteps || 1))) {
          prev.note.dur++;
          prev.s = s;
          continue;
        }
        const note = add(s, { type: 'note', slot: sg.slot, dur: 1, vel: sg.vel, glide: null, x: sg.x, y: sg.y });
        if (contiguous && inst.type === 'melodic' && (m.jag || 0) < 0.3) note.glide = prev.note.slot;
        prev = { s, start: s, note };
      } else {
        for (const sg of singles) add(s, { type: 'note', slot: sg.slot, dur: 1, vel: sg.vel, glide: null, x: sg.x, y: sg.y });
        prev = null;
      }
    }
  }

  function readOrnament(loop, m, inst, add, vel0) {
    const steps = loop.steps;
    const pc = polar(loop, m.cx, m.cy);
    const ext = phaseExtent(dense(m).map((p) => polar(loop, p.x, p.y).phase));
    // steps whose tick lies inside the shape's arc; a tiny shape snaps to the nearest tick
    let s0 = Math.ceil(ext.start * steps - 1e-9);
    let s1 = Math.floor((ext.start + ext.len) * steps + 1e-9);
    if (s1 < s0) s0 = s1 = Math.round((ext.start + ext.len / 2) * steps);
    const len = s1 - s0 + 1;
    const x = m.cx, y = m.cy;
    if (inst.type === 'drum') {
      const lane = M.uToLane(pc.u, inst);
      const every = m.shape === 'square' ? 2 : 1;
      const n = m.shape === 'triangle' ? Math.min(len, 3) : len;
      for (let i = 0; i < n; i += every) add(s0 + i, { type: 'hit', lane, dur: 1, vel: vel0 * (0.5 + (0.5 * (i + 1)) / n), x, y });
      return;
    }
    const root = M.uToSlot(pc.u, inst.slots);
    if (inst.type === 'noise') {
      add(s0, { type: 'note', slot: root, dur: Math.max(len, 2), glide: null, x, y });
      return;
    }
    if (m.shape === 'triangle') {
      const pat = [0, 2, 4, 5];
      const n = Math.max(len, 4);
      for (let i = 0; i < n; i++) add(s0 + i, { type: 'note', slot: root + pat[i % 4], dur: 1, glide: null, x, y });
    } else if (m.shape === 'square') {
      for (let i = 0; i < Math.max(len, 2); i += 2) add(s0 + i, { type: 'chord', slots: [root, root + 3, root + 5], dur: 1, x, y });
    } else {
      add(s0, { type: 'chord', slots: [root, root + 2, root + 4], dur: Math.max(len, 2), x, y });
    }
  }

  function readSpiral(loop, m, inst, add) {
    const d = dense(m);
    const a = polar(loop, d[0].x, d[0].y), b = polar(loop, d[d.length - 1].x, d[d.length - 1].y);
    const s0 = Math.round(a.phase * loop.steps);
    const x = m.cx, y = m.cy;
    if (inst.type === 'drum') {
      const la = M.uToLane(Math.max(a.u, M.CENTER), inst), lb = M.uToLane(b.u, inst);
      const n = 6;
      for (let i = 0; i < n; i++) add(s0 + i, { type: 'hit', lane: Math.round(la + ((lb - la) * i) / (n - 1)), dur: 1, x, y });
      return;
    }
    const slots = inst.slots;
    const sa = M.uToSlot(Math.max(a.u, M.CENTER), slots), sb = M.uToSlot(b.u, slots);
    const n = G.clamp(Math.abs(sb - sa) + 1, 3, 12);
    const dir = sb >= sa ? 1 : -1;
    for (let i = 0; i < n; i++) add(s0 + i, { type: 'note', slot: Math.max(0, sa + dir * i), dur: 1, glide: null, x, y });
    m.runUp = dir > 0;
  }

  function finalize(loop, ev) {
    for (const id of M.ORDER) {
      const inst = M.INSTRUMENTS[id];
      if (inst.type === 'drum') continue;
      const notes = [];
      ev.forEach((list, s) => { for (const n of list) if (n.inst === id) notes.push({ s, n }); });
      if (!notes.length) continue;
      if (inst.sustain) {
        const starts = [...new Set(notes.map((o) => o.s))].sort((a, b) => a - b);
        for (const o of notes) {
          const i = starts.indexOf(o.s);
          const next = i + 1 < starts.length ? starts[i + 1] : starts[0] + loop.steps;
          o.n.dur = Math.max(o.n.dur, next - o.s);
        }
      }
      if (inst.minSteps > 1) for (const o of notes) o.n.dur = Math.max(o.n.dur, inst.minSteps);
    }
  }

  S.Reader = {
    clockAngle, prepareLoop, boundaryR, polar, angleOf, pointAt, pointAtAngle,
    assign, readLoop, phaseExtent,
  };
})(globalThis.SamSo = globalThis.SamSo || {});
