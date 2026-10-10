/* SamSo · Schetslab app: UI, input, rendering and audio wiring. */
(function (S) {
  'use strict';
  const { Geo: G, Shapes, Music: M, Reader: R, Taste, Engine, Transport, Demo } = S;
  const TAU = Math.PI * 2;
  const SCENE_KEY = 'samso.scene.v1';
  const INTRO_KEY = 'samso.intro.v1';
  const ERASE_R = 18;

  const store = {
    get(k) { try { return globalThis.localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } },
    set(k, v) { try { if (globalThis.localStorage) localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  // ---------- markup ----------
  const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const svg = (body, attrs, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${cls ? ` class="${cls}"` : ''} ${attrs || STROKE}>${body}</svg>`;
  const THUMB = '<path d="M3 11h4v10H3z"/><path d="M7 11l3.5-7c1.6 0 2.6 1.2 2.3 2.8L12.3 10H19a2 2 0 0 1 2 2.3l-1.2 6.8A2 2 0 0 1 17.8 21H7"/>';
  const ICON = {
    play: svg('<path d="M8 5.2v13.6L19 12z"/>', 'fill="currentColor"', 'i-play'),
    pause: svg('<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/>', 'fill="currentColor"', 'i-pause'),
    up: svg(THUMB),
    down: svg('<g transform="rotate(180 12 12)">' + THUMB + '</g>'),
    more: svg('<circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/>', 'fill="currentColor"'),
    undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    eraser: svg('<path d="m7 20-3.6-3.6a1.4 1.4 0 0 1 0-2l9.6-9.6a1.4 1.4 0 0 1 2 0l4.6 4.6a1.4 1.4 0 0 1 0 2L12 19.9"/><path d="M7 20h13"/><path d="m6.5 11 6.5 6.5"/>'),
    mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  };

  const glyph = (body) => `<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const RULES = [
    [glyph('<circle cx="20" cy="21" r="14" style="stroke:var(--i-bass)"/><path d="M17 3.5 21.5 7 17 10.5" style="stroke:var(--i-bass)"/>'),
      '<b>Cirkel = loop.</b> Hoe groter je hem tekent, hoe langer hij duurt: 1, 2 of 4 maten.'],
    [glyph('<circle cx="12" cy="12" r="6" style="fill:var(--i-drums);stroke:none"/><circle cx="28" cy="12" r="6" style="fill:var(--i-bass);stroke:none"/><circle cx="12" cy="28" r="6" style="fill:var(--i-lead);stroke:none"/><circle cx="28" cy="28" r="6" style="fill:var(--i-pad);stroke:none"/>'),
      '<b>Kleur = instrument.</b> Kies onderin: drums, bas, lead, pad, drone, perc of ruis.'],
    [glyph('<circle cx="20" cy="20" r="16" style="stroke:var(--i-lead)"/><circle cx="14" cy="15" r="2.4" style="fill:var(--i-lead);stroke:none"/><circle cx="26" cy="15" r="2.4" style="fill:var(--i-lead);stroke:none"/><path d="M11 24c3 5 15 5 18 0" style="stroke:var(--i-lead)"/>'),
      '<b>Teken ín de cirkel.</b> De wijzer draait rond en alles wat hij raakt, klinkt. Midden is laag, de rand is hoog. Een stip is een noot, een lijn een melodie. Een stip precies in het midden speelt op elke tel.'],
    [glyph('<circle cx="8" cy="20" r="5.5" style="stroke:var(--i-pad)"/><rect x="16" y="14.5" width="11" height="11" style="stroke:var(--i-pad)"/><path d="M33 14.5 38.5 25.5h-11z" style="stroke:var(--i-pad)"/>'),
      '<b>Vorm = klank.</b> Rond klinkt zacht, vierkant hol, driehoek scherp. In een loop wordt een klein rondje een akkoord en een driehoekje een arpeggio. Krassen klinkt ruw.'],
    [glyph('<g transform="translate(8 8)" style="stroke:var(--fg)">' + THUMB + '</g>'),
      '<b>Duim omhoog of omlaag.</b> Bovenin voor de sfeer, op het label van een loop voor de klank. De app probeert iets anders en onthoudt wat jij mooi vindt.'],
  ];

  function template() {
    const swatches = M.ORDER.map((id) =>
      `<button class="swatch" type="button" role="radio" aria-checked="false" data-inst="${id}" style="--c: var(--i-${id})"><span class="ink" aria-hidden="true"></span><span class="lbl">${M.INSTRUMENTS[id].name}</span></button>`).join('');
    const moods = M.MOODS.map((m) => `<button class="mood" type="button" data-mood="${m.id}" aria-pressed="false">${m.name}</button>`).join('');
    const rules = RULES.map(([g, t]) => `<li>${g}<p>${t}</p></li>`).join('');
    return `
<canvas class="layer" id="ssBg" aria-hidden="true"></canvas>
<canvas class="layer layer-draw" id="ssFx" role="img" aria-label="Tekenvel. Teken hier je muziek."></canvas>
<div class="chips" id="ssChips"></div>
<header class="bar bar-top" id="ssTop">
  <button class="btn-play" id="ssPlay" type="button" aria-label="Afspelen">${ICON.play}${ICON.pause}</button>
  <button class="vibe" id="ssVibe" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="ssVibePanel"><span class="vibe-mood" id="ssVibeMood">Nacht</span><span class="vibe-tempo" id="ssVibeTempo">98</span></button>
  <span class="grow"></span>
  <button class="icon-btn" id="ssDislike" type="button" aria-label="Niet wat ik bedoel, probeer iets anders" title="Niet wat ik bedoel">${ICON.down}</button>
  <button class="icon-btn" id="ssLike" type="button" aria-label="Ja, dit. Onthoud deze sfeer" title="Ja, dit!">${ICON.up}</button>
  <button class="icon-btn" id="ssMore" type="button" aria-label="Meer" aria-haspopup="true" aria-expanded="false" aria-controls="ssMorePanel">${ICON.more}</button>
</header>
<footer class="bar bar-bottom" id="ssBottom">
  <button class="icon-btn" id="ssUndo" type="button" aria-label="Ongedaan maken" title="Ongedaan maken">${ICON.undo}</button>
  <div class="palette" id="ssPalette" role="radiogroup" aria-label="Instrument">${swatches}</div>
  <button class="icon-btn" id="ssErase" type="button" aria-label="Gum" aria-pressed="false" title="Gum">${ICON.eraser}</button>
</footer>
<div class="toast" id="ssToast" role="status" aria-live="polite"></div>
<section class="panel panel-left" id="ssVibePanel" hidden aria-label="Sfeer">
  <h2 class="panel-title">Sfeer</h2>
  <div class="moods" id="ssMoods">${moods}</div>
  <label class="slider" for="ssTempo"><span>Tempo</span><input id="ssTempo" type="range" min="60" max="150" step="1"><output id="ssTempoOut" for="ssTempo"></output></label>
  <label class="slider" for="ssSwing"><span>Swing</span><input id="ssSwing" type="range" min="0" max="0.32" step="0.01"><output id="ssSwingOut" for="ssSwing"></output></label>
  <label class="slider" for="ssSpace"><span>Ruimte</span><input id="ssSpace" type="range" min="0" max="1" step="0.01"><output id="ssSpaceOut" for="ssSpace"></output></label>
  <p class="panel-note">Liever niet zelf schuiven? Gebruik de duimpjes, dan zoekt de app de sfeer voor je.</p>
</section>
<section class="panel panel-right menu" id="ssMorePanel" hidden aria-label="Meer">
  <button class="menu-item" type="button" data-act="help">Uitleg</button>
  <button class="menu-item" type="button" data-act="taste">Wat de app over jou leerde</button>
  <button class="menu-item" type="button" data-act="demo">Voorbeeld laden</button>
  <button class="menu-item" type="button" data-act="new">Nieuw blad</button>
</section>
<section class="panel panel-right panel-wide" id="ssTastePanel" hidden aria-label="Wat de app over jou leerde"></section>
<div class="loopmenu" id="ssLoopMenu" hidden role="menu" aria-label="Loop">
  <button type="button" role="menuitem" data-act="like">${ICON.up}<span>Mooi</span></button>
  <button type="button" role="menuitem" data-act="dislike">${ICON.down}<span>Anders</span></button>
  <button type="button" role="menuitem" data-act="mute">${ICON.mute}<span>Stil</span></button>
  <button type="button" role="menuitem" data-act="delete">${ICON.trash}<span>Weg</span></button>
</div>
<div class="intro" id="ssIntro" hidden>
  <div class="intro-card" role="dialog" aria-modal="true" aria-labelledby="ssIntroTitle">
    <h1 class="intro-title" id="ssIntroTitle">SamSo <span>schetslab</span></h1>
    <p class="intro-lede">Teken muziek. Je hoeft geen noten te kennen.</p>
    <ul class="rules">${rules}</ul>
    <div class="intro-actions">
      <button class="btn-primary" id="ssStartDemo" type="button">Speel het voorbeeld</button>
      <button class="btn-ghost" id="ssStartBlank" type="button">Begin met een leeg blad</button>
      <button class="btn-ghost" id="ssIntroClose" type="button" hidden>Terug naar mijn tekening</button>
    </div>
    <p class="intro-fine">Hoor je niets? Zet je iPhone of iPad niet op stil en draai het volume op.</p>
  </div>
</div>`;
  }

  // ---------- state ----------
  const st = { inst: 'drums', tool: 'draw', vibe: null, playing: false, userPaused: false, undo: [], isDemo: false };
  const el = {};
  let root, bg, fx, bgc, fxc;
  let W = 0, H = 0, dpr = 1, fxRect = { left: 0, top: 0 };
  let view = { s: 1, ox: 0, oy: 0 };
  let theme = null;
  let scene = null;
  let loopById = new Map(), markById = new Map();
  let staticDirty = true;
  const flashes = [];
  let audio = null;
  let active = null;
  let penDown = false, lastPen = -1e9;
  let menuLoop = null;
  let toastTimer = 0, saveTimer = 0;
  let reduceMotion = false;

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const barsText = (n) => (n === 1 ? '1 maat' : n + ' maten');
  const SHAPE_NAME = { circle: 'Cirkel', square: 'Vierkant', triangle: 'Driehoek', blob: 'Vorm' };
  const SMALL_NAME = { circle: 'rondje', square: 'vierkantje', triangle: 'driehoekje', blob: 'vormpje' };
  const CHARACTER = { circle: 'rond en zacht', square: 'hol en retro', triangle: 'scherp en fel', blob: 'organisch' };

  // ---------- theme ----------
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    theme = {
      bg: v('--bg', '#f1f2ee'), grid: v('--grid', '#c9cdd3'), fg: v('--fg', '#1b2130'),
      dark: v('--is-dark', '0') === '1', hand: v('--font-hand', 'cursive'), inst: {},
    };
    for (const id of M.ORDER) theme.inst[id] = v('--i-' + id, '#888888');
  }

  const rgbaCache = new Map();
  function rgba(hex, a) {
    const key = hex + '/' + a;
    let s = rgbaCache.get(key);
    if (s) return s;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    s = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    rgbaCache.set(key, s);
    return s;
  }

  // ---------- layout ----------
  function measure() {
    W = root.clientWidth || window.innerWidth || 800;
    H = root.clientHeight || window.innerHeight || 600;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const cv of [bg, fx]) {
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
    }
    fxRect = fx.getBoundingClientRect();
  }

  function fitView() {
    const w = scene.world.w, h = scene.world.h;
    const s = Math.min(W / w, H / h);
    view = { s, ox: (W - w * s) / 2, oy: (H - h * s) / 2 };
  }

  function onResize() {
    measure();
    fitView();
    layoutChips();
    staticDirty = true;
  }

  const worldS = () => Math.min(scene.world.w, scene.world.h);

  function toWorld(e) {
    const pen = e.pointerType === 'pen';
    return {
      x: (e.clientX - fxRect.left - view.ox) / view.s,
      y: (e.clientY - fxRect.top - view.oy) / view.s,
      t: e.timeStamp,
      p: pen ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5,
    };
  }

  // ---------- scene ----------
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  function serialize() {
    return {
      v: 1,
      world: scene.world,
      loops: scene.loops.map((L) => ({
        id: L.id, inst: L.inst, shape: L.shape, points: L.points.map((p) => [r1(p.x), r1(p.y)]),
        cx: r1(L.cx), cy: r1(L.cy), r: r1(L.r), dir: L.dir, bars: L.bars, muted: !!L.muted, params: L.params,
      })),
      marks: scene.marks.map((m) => ({
        id: m.id, inst: m.inst, kind: m.kind, shape: m.shape || null,
        points: m.points.map((p) => [r1(p.x), r1(p.y), r2(p.p == null ? 0.5 : p.p)]),
        cx: r1(m.cx), cy: r1(m.cy), jag: r2(m.jag || 0), pen: !!m.pen, pressure: r2(m.pressure == null ? 0.5 : m.pressure),
      })),
    };
  }

  function deserialize(o) {
    if (!o || o.v !== 1 || !o.world || !Array.isArray(o.loops) || !Array.isArray(o.marks)) return null;
    const sc = { v: 1, world: { w: +o.world.w, h: +o.world.h }, loops: [], marks: [] };
    if (!(sc.world.w > 0 && sc.world.h > 0)) return null;
    for (const L of o.loops) {
      if (!M.INSTRUMENTS[L.inst] || !Array.isArray(L.points) || L.points.length < 3) continue;
      sc.loops.push(R.prepareLoop({
        id: String(L.id), inst: L.inst, shape: CHARACTER[L.shape] ? L.shape : 'blob',
        points: L.points.map(([x, y]) => ({ x, y })), cx: +L.cx, cy: +L.cy, r: +L.r,
        dir: L.dir < 0 ? -1 : 1, bars: [1, 2, 4].includes(L.bars) ? L.bars : 1, muted: !!L.muted,
        params: L.params && typeof L.params === 'object' ? L.params : {},
      }));
    }
    for (const m of o.marks) {
      if (!M.INSTRUMENTS[m.inst] || !Array.isArray(m.points) || !m.points.length) continue;
      sc.marks.push({
        id: String(m.id), inst: m.inst, kind: m.kind || 'curve', shape: m.shape || null,
        points: m.points.map(([x, y, p]) => ({ x, y, p: p == null ? 0.5 : p })),
        cx: +m.cx, cy: +m.cy, jag: +m.jag || 0, pen: !!m.pen, pressure: m.pressure == null ? 0.5 : +m.pressure,
      });
    }
    return sc;
  }

  function snapshot() {
    st.undo.push(JSON.stringify(serialize()));
    if (st.undo.length > 60) st.undo.shift();
  }

  function undo() {
    const s = st.undo.pop();
    if (!s) return toast('Niets meer om ongedaan te maken');
    const sc = deserialize(JSON.parse(s));
    if (!sc) return;
    scene = sc;
    fitView();
    rebuild();
    toast('Ongedaan gemaakt');
  }

  function rebuild(opts) {
    R.assign(scene);
    loopById = new Map(scene.loops.map((L) => [L.id, L]));
    markById = new Map(scene.marks.map((m) => [m.id, m]));
    for (const L of scene.loops) {
      const own = scene.marks.filter((m) => m.loopId === L.id);
      L.markCount = own.length;
      L.pan = G.clamp((L.cx / scene.world.w - 0.5) * 1.2, -0.6, 0.6);
      R.readLoop(L, own);
    }
    layoutChips();
    staticDirty = true;
    if (!opts || opts.save !== false) scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(SCENE_KEY, JSON.stringify(serialize())), 400);
  }

  function soundParams(L, inst) {
    if (!L.params[inst]) L.params[inst] = Taste.soundFor(inst, L.shape);
    return L.params[inst];
  }

  function loadDemo() {
    scene = Demo.build(W, H);
    st.isDemo = true;
    fitView();
    rebuild();
  }

  function newSheet() {
    scene = { v: 1, world: { w: W, h: H }, loops: [], marks: [] };
    st.isDemo = false;
    fitView();
    rebuild();
  }

  // ---------- audio ----------
  function ensureAudio() {
    if (audio) {
      if (audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
      return audio;
    }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Deze browser kan geen geluid maken'); return null; }
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    audio = { ctx, engine: new Engine(ctx), transport: new Transport(ctx, { onStep }) };
    applyVibe(st.vibe);
    try {
      // iOS unlock: a silent buffer started inside the tap
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* ignore */ }
    ctx.resume().catch(() => {});
    return audio;
  }

  // iOS Safari only unlocks audio inside touchend/click, not on touch-down.
  function unlockAudio() {
    if (!audio || audio.ctx.state === 'running') return;
    audio.ctx.resume().catch(() => {});
    try {
      const b = audio.ctx.createBuffer(1, 1, 22050), s = audio.ctx.createBufferSource();
      s.buffer = b;
      s.connect(audio.ctx.destination);
      s.start(0);
    } catch (e) { /* ignore */ }
  }

  function setPlaying(on) {
    if (on) {
      const a = ensureAudio();
      if (!a) return;
      a.transport.start();
      st.playing = true;
    } else {
      if (audio) audio.transport.stop();
      st.playing = false;
      flashes.length = 0;
    }
    el.play.classList.toggle('is-playing', st.playing);
    el.play.setAttribute('aria-label', st.playing ? 'Pauzeren' : 'Afspelen');
  }

  function togglePlay() {
    st.userPaused = st.playing;
    setPlaying(!st.playing);
  }

  function onStep(i, time, sd) {
    for (const L of scene.loops) {
      if (L.muted || !L.events) continue;
      const evs = L.events[i % L.steps];
      if (!evs || !evs.length) continue;
      for (const n of evs) {
        audio.engine.play(n, time, sd, soundParams(L, n.inst), L.shape, L.pan, st.vibe.mood);
        if (flashes.length < 400) flashes.push({ t: time, x: n.x, y: n.y, inst: n.inst, mark: n.mark });
      }
    }
  }

  function audioNow() {
    const ctx = audio && audio.ctx;
    if (!ctx) return 0;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  function applyVibe(v) {
    const moodChanged = !st.vibe || st.vibe.mood !== v.mood;
    st.vibe = Object.assign({}, v);
    if (audio) {
      audio.transport.tempo = v.tempo;
      audio.transport.swing = v.swing;
      audio.engine.setSpace(v.space);
      audio.engine.setTempo(v.tempo);
    }
    if (moodChanged) staticDirty = true;
    updateVibeUI();
  }

  function updateVibeUI() {
    const v = st.vibe;
    if (!el.vibeMood) return;
    el.vibeMood.textContent = (M.MOOD[v.mood] || M.MOOD.nacht).name;
    el.vibeTempo.textContent = Math.round(v.tempo);
    el.tempo.value = v.tempo;
    el.tempoOut.textContent = Math.round(v.tempo);
    el.swing.value = v.swing;
    el.swingOut.textContent = v.swing < 0.02 ? 'strak' : Math.round(v.swing * 100) + '%';
    el.space.value = v.space;
    el.spaceOut.textContent = Math.round(v.space * 100) + '%';
    for (const b of el.moods) b.setAttribute('aria-pressed', String(b.dataset.mood === v.mood));
  }

  // ---------- drawing ----------
  function smoothPath(pts, closed) {
    const p = new Path2D();
    const n = pts.length;
    if (!n) return p;
    if (n < 3) {
      p.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) p.lineTo(pts[i].x, pts[i].y);
      if (closed) p.closePath();
      return p;
    }
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (closed) {
      const m0 = mid(pts[n - 1], pts[0]);
      p.moveTo(m0.x, m0.y);
      for (let i = 0; i < n; i++) {
        const a = pts[i], m = mid(a, pts[(i + 1) % n]);
        p.quadraticCurveTo(a.x, a.y, m.x, m.y);
      }
      p.closePath();
    } else {
      p.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n - 1; i++) {
        const a = pts[i], m = mid(a, pts[i + 1]);
        p.quadraticCurveTo(a.x, a.y, m.x, m.y);
      }
      p.lineTo(pts[n - 1].x, pts[n - 1].y);
    }
    return p;
  }

  const loopPath = (L) => L._path || (L._path = smoothPath(L.ring, true));
  const markPath = (m) => m._path || (m._path = smoothPath(m.points, false));

  function renderStatic() {
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = theme.bg;
    c.fillRect(0, 0, W, H);
    c.fillStyle = theme.grid;
    const gap = 26;
    for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) c.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    c.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
    for (const L of scene.loops) drawLoop(c, L);
    for (const m of scene.marks) drawMark(c, m);
  }

  function drawLoop(c, L) {
    const col = theme.inst[L.inst];
    const inst = M.INSTRUMENTS[L.inst];
    const path = loopPath(L);
    const px = 1 / view.s;
    c.save();
    c.globalAlpha = L.muted ? 0.4 : 1;
    c.fillStyle = rgba(col, theme.dark ? 0.07 : 0.06);
    c.fill(path);

    // height guides: drum lanes, or octave rings for melodic instruments
    const us = [];
    if (inst.type === 'drum') us.push(...inst.edges.slice(0, -1));
    else if (inst.slots) {
      const n = (M.MOOD[st.vibe.mood] || M.MOOD.nacht).scale.length;
      for (let k = n; k < inst.slots; k += n) us.push(M.CENTER + (k / inst.slots) * (1 - M.CENTER));
    }
    c.strokeStyle = rgba(col, 0.34);
    for (const u of us) {
      c.save();
      c.translate(L.cx, L.cy);
      c.scale(u, u);
      c.translate(-L.cx, -L.cy);
      c.lineWidth = (1.2 * px) / u;
      c.setLineDash([(2 * px) / u, (6 * px) / u]);
      c.stroke(path);
      c.restore();
    }
    c.setLineDash([2 * px, 5 * px]);
    c.lineWidth = 1.2 * px;
    c.beginPath();
    c.arc(L.cx, L.cy, M.PULSE * L.r, 0, TAU);
    c.stroke();
    c.setLineDash([]);

    // the ring itself
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = rgba(col, 0.16);
    c.lineWidth = 10 * px;
    c.stroke(path);
    c.strokeStyle = col;
    c.lineWidth = 3 * px;
    if (L.muted) c.setLineDash([7 * px, 7 * px]);
    c.stroke(path);
    c.setLineDash([]);

    // beat ticks, longer at the start of each bar
    const beats = L.bars * 4;
    for (let b = 0; b < beats; b++) {
      const bar = b % 4 === 0;
      const a = R.pointAt(L, b / beats, 1), z = R.pointAt(L, b / beats, bar ? 0.86 : 0.92);
      c.strokeStyle = rgba(col, bar ? 0.95 : 0.6);
      c.lineWidth = (bar ? 2.6 : 1.6) * px;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(z.x, z.y);
      c.stroke();
    }

    // start marker: an arrowhead outside the ring pointing the way the hand turns
    const p0 = R.pointAt(L, 0, 1.1), p1 = R.pointAt(L, 0.03, 1.1);
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const sz = 7 * px;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(p0.x + Math.cos(ang) * sz, p0.y + Math.sin(ang) * sz);
    c.lineTo(p0.x + Math.cos(ang + 2.5) * sz, p0.y + Math.sin(ang + 2.5) * sz);
    c.lineTo(p0.x + Math.cos(ang - 2.5) * sz, p0.y + Math.sin(ang - 2.5) * sz);
    c.closePath();
    c.fill();

    // hints in an empty loop: drum lane names, or where low and high are
    if (!L.markCount && L.r * view.s > 56) {
      c.font = `600 ${15 * px}px ${theme.hand}`;
      c.fillStyle = rgba(col, 0.7);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const th = (316 / 360) * TAU;
      if (inst.type === 'drum') {
        const edges = [M.CENTER].concat(inst.edges.slice(0, -1), [1]);
        for (let i = 0; i < edges.length - 1; i++) {
          const p = R.pointAtAngle(L, th, (edges[i] + edges[i + 1]) / 2);
          c.fillText(inst.lanes[i], p.x, p.y);
        }
      } else {
        const lo = R.pointAtAngle(L, th, 0.32), hi = R.pointAtAngle(L, th, 0.84);
        c.fillText('laag', lo.x, lo.y);
        c.fillText('hoog', hi.x, hi.y);
      }
    }
    c.restore();
  }

  function drawMark(c, m) {
    const col = theme.inst[m.inst];
    const px = 1 / view.s;
    c.save();
    c.globalAlpha = m.loopId ? 1 : 0.38;
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (m.kind === 'dot') {
      c.beginPath();
      c.arc(m.cx, m.cy, (m.pen ? 3.5 + (m.pressure || 0.5) * 4 : 5.5) * px, 0, TAU);
      c.fill();
    } else if (m.pen && m.points.length > 1) {
      for (let i = 1; i < m.points.length; i++) {
        const a = m.points[i - 1], b = m.points[i];
        c.lineWidth = (1.4 + (a.p + b.p) * 2.4) * px;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    } else {
      c.lineWidth = 3.4 * px;
      c.stroke(markPath(m));
    }
    c.restore();
  }

  function drawSweep(c, L, pos) {
    const col = theme.inst[L.inst];
    const ph = (pos % L.steps) / L.steps;
    const trail = Math.min(0.2, 4 / L.steps);
    const R0 = L.maxR * 1.02;
    c.save();
    c.clip(loopPath(L));
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a0 = R.angleOf(L, ph - (trail * (i + 1)) / N) - Math.PI / 2;
      const a1 = R.angleOf(L, ph - (trail * i) / N) - Math.PI / 2;
      c.beginPath();
      c.moveTo(L.cx, L.cy);
      c.arc(L.cx, L.cy, R0, a0, a1, L.dir < 0);
      c.closePath();
      c.fillStyle = rgba(col, (theme.dark ? 0.22 : 0.15) * (1 - i / N));
      c.fill();
    }
    c.restore();
    const e = R.pointAt(L, ph, 1);
    c.strokeStyle = rgba(col, 0.9);
    c.lineWidth = 2 / view.s;
    c.beginPath();
    c.moveTo(L.cx, L.cy);
    c.lineTo(e.x, e.y);
    c.stroke();
    c.fillStyle = col;
    c.beginPath();
    c.arc(e.x, e.y, 5 / view.s, 0, TAU);
    c.fill();
  }

  function drawFlashes(c, now) {
    const LIFE = 0.42;
    const px = 1 / view.s;
    let keep = 0;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      const age = now - f.t;
      if (age > LIFE) continue;
      flashes[keep++] = f;
      if (age < 0) continue;
      const k = age / LIFE;
      const col = theme.inst[f.inst];
      const m = markById.get(f.mark);
      c.globalAlpha = 1 - k;
      if (m && m.kind !== 'dot' && k < 0.5) {
        c.strokeStyle = rgba(col, 0.35);
        c.lineWidth = 9 * px;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.stroke(markPath(m));
      }
      if (m && m.kind === 'dot') {
        c.fillStyle = col;
        c.beginPath();
        c.arc(f.x, f.y, (5.5 + 4 * (1 - k)) * px, 0, TAU);
        c.fill();
      }
      if (!reduceMotion) {
        c.strokeStyle = col;
        c.lineWidth = (2.6 * (1 - k) + 0.6) * px;
        c.beginPath();
        c.arc(f.x, f.y, (6 + 18 * (1 - (1 - k) * (1 - k))) * px, 0, TAU);
        c.stroke();
      }
    }
    flashes.length = keep;
    c.globalAlpha = 1;
  }

  function drawLive(c, a) {
    const pts = a.pts;
    if (!pts.length) return;
    const col = theme.inst[a.inst];
    const px = 1 / view.s;
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (pts.length === 1) {
      c.beginPath();
      c.arc(pts[0].x, pts[0].y, 5 * px, 0, TAU);
      c.fill();
      return;
    }
    if (a.pen) {
      for (let i = 1; i < pts.length; i++) {
        c.lineWidth = (1.4 + (pts[i - 1].p + pts[i].p) * 2.4) * px;
        c.beginPath();
        c.moveTo(pts[i - 1].x, pts[i - 1].y);
        c.lineTo(pts[i].x, pts[i].y);
        c.stroke();
      }
      return;
    }
    c.lineWidth = 3.4 * px;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  function frame() {
    requestAnimationFrame(frame);
    if (staticDirty) {
      staticDirty = false;
      renderStatic();
    }
    const c = fxc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
    if (st.playing && audio) {
      const now = audioNow();
      const pos = audio.transport.position(now);
      if (pos != null) for (const L of scene.loops) if (!L.muted) drawSweep(c, L, pos);
      drawFlashes(c, now);
    }
    if (active && active.tool === 'draw') drawLive(c, active);
    if (active && active.tool === 'erase' && active.last) {
      c.strokeStyle = theme.fg;
      c.globalAlpha = 0.5;
      c.lineWidth = 1.5 / view.s;
      c.beginPath();
      c.arc(active.last.x, active.last.y, ERASE_R / view.s, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  // ---------- input ----------
  function onPointerDown(e) {
    if (e.button > 0) return;
    if (anyPanelOpen()) {
      closePanels();
      e.preventDefault();
      return;
    }
    ensureAudio();
    const isPen = e.pointerType === 'pen';
    const now = performance.now();
    if (e.pointerType === 'touch' && (penDown || now - lastPen < 1500)) return; // resting palm
    if (isPen) {
      penDown = true;
      lastPen = now;
      if (active && active.type === 'touch') active = null; // the palm landed first: drop it
    }
    if (active) return;
    try { fx.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = toWorld(e);
    active = { id: e.pointerId, type: e.pointerType, pen: isPen, inst: st.inst, tool: st.tool, pts: [p], last: p, erased: false };
    if (st.tool === 'erase') {
      snapshot();
      active.erased = eraseAt(p);
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || e.pointerId !== active.id) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) {
      const p = toWorld(ev);
      const last = active.pts[active.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * view.s < 0.8) continue;
      active.pts.push(p);
      active.last = p;
      if (active.tool === 'erase' && eraseAt(p)) active.erased = true;
    }
    if (active.pen) lastPen = performance.now();
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (e.pointerType === 'pen') {
      penDown = false;
      lastPen = performance.now();
    }
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    if (a.tool === 'erase') {
      if (!a.erased) st.undo.pop();
      return;
    }
    finishStroke(a);
  }

  function eraseAt(p) {
    const rad = ERASE_R / view.s;
    let changed = false;
    const marks = scene.marks.filter((m) => {
      const hit = m.kind === 'dot' || m.points.length < 2
        ? Math.hypot(m.cx - p.x, m.cy - p.y) < rad + 4 / view.s
        : m.points.some((q, i) => i > 0 && G.distToSegment(p, m.points[i - 1], q) < rad);
      if (hit) changed = true;
      return !hit;
    });
    const loops = scene.loops.filter((L) => {
      let hit = false;
      for (let i = 0; i < L.ring.length && !hit; i++) hit = G.distToSegment(p, L.ring[i], L.ring[(i + 1) % L.ring.length]) < rad;
      if (hit) changed = true;
      return !hit;
    });
    if (changed) {
      scene.marks = marks;
      scene.loops = loops;
      st.isDemo = false;
      rebuild();
    }
    return changed;
  }

  function hostLoop(res) {
    let best = null, bu = Infinity;
    for (const L of scene.loops) {
      const u = R.polar(L, res.cx, res.cy).u;
      if (u < 1 && res.r < 0.55 * L.r && u < bu) { bu = u; best = L; }
    }
    return best;
  }

  function makeLoop(res, inst) {
    const L = {
      id: uid('L'), inst, shape: res.shape,
      points: G.resampleSpacing(res.ringPts, 4, 360).map((p) => ({ x: p.x, y: p.y })),
      cx: res.cx, cy: res.cy, r: res.r, dir: res.dir,
      bars: M.barsFor(2 * res.r, worldS()), muted: false, params: {},
    };
    return R.prepareLoop(L);
  }

  function makeMark(res, a) {
    const pts = res.kind === 'dot'
      ? [{ x: res.cx, y: res.cy, p: res.pressure }]
      : res.points.length > 600 ? G.resample(res.points, 600) : res.points;
    return {
      id: uid('m'), inst: a.inst, kind: res.kind, shape: res.shape || null, points: pts,
      cx: res.cx, cy: res.cy, jag: res.jag || 0, pen: !!a.pen, pressure: res.pressure,
    };
  }

  function finishStroke(a) {
    if (!a.pts.length) return;
    const S0 = worldS();
    const res = Shapes.analyze(a.pts, { S: S0 });
    snapshot();
    let loop = null, mark = null, small = false;
    if (res.kind === 'closed') {
      const host = hostLoop(res);
      if (!host && 2 * res.r >= 0.12 * S0) loop = makeLoop(res, a.inst);
      else {
        mark = makeMark(res, a);
        small = !host;
      }
    } else mark = makeMark(res, a);
    if (loop) scene.loops.push(loop);
    if (mark) scene.marks.push(mark);
    st.isDemo = false;
    rebuild();
    if (loop) {
      toast(loopText(loop));
      if (!st.playing && !st.userPaused) setPlaying(true);
    } else toast(markText(mark, small));
    return loop || mark;
  }

  function loopText(L) {
    return `${SHAPE_NAME[L.shape]} → ${M.INSTRUMENTS[L.inst].name.toLowerCase()}-loop van ${barsText(L.bars)}, ${CHARACTER[L.shape]}`;
  }

  function markText(m, small) {
    if (!m.loopId) {
      return small ? 'Te klein voor een loop. Teken een grotere cirkel.' : 'Hoort nog bij geen loop. Teken er een cirkel omheen.';
    }
    const L = loopById.get(m.loopId);
    const inst = M.INSTRUMENTS[m.inst];
    const name = inst.name;
    const evs = [];
    for (const list of L.events) for (const e of list) if (e.mark === m.id) evs.push(e);
    const n = evs.length;
    const drum = inst.type === 'drum';
    switch (m.kind) {
      case 'dot':
        if (R.polar(L, m.cx, m.cy).u < M.PULSE) return `${name}: stip in het midden → op elke tel`;
        if (drum && evs[0]) return `${name}: stip → ${inst.lanes[evs[0].lane]}`;
        return `${name}: stip → één noot`;
      case 'closed':
        if (drum) return `${name}: ${SMALL_NAME[m.shape]} → roffel`;
        if (inst.type === 'noise') return `${name}: ${SMALL_NAME[m.shape]} → ruisvlaag`;
        if (m.shape === 'triangle') return `${name}: driehoekje → arpeggio`;
        if (m.shape === 'square') return `${name}: vierkantje → akkoordstoten`;
        return `${name}: ${SMALL_NAME[m.shape]} → akkoord`;
      case 'spiral':
        return `${name}: spiraal → loopje ${m.runUp === false ? 'omlaag' : 'omhoog'}`;
      case 'zigzag':
        return drum ? `${name}: zigzag → ${n} ruwe slagen` : `${name}: zigzag → ruw, ${n} noten`;
      default:
        if (!n) return `${name}: lijn te dicht bij het midden, die hoor je niet`;
        return drum ? `${name}: lijn → ${n} slagen` : `${name}: lijn → melodie van ${n} ${n === 1 ? 'noot' : 'noten'}`;
    }
  }

  // ---------- UI ----------
  function toast(text) {
    if (!text || !el.toast) return;
    el.toast.textContent = text;
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
  }

  function selectInst(id) {
    st.inst = id;
    for (const b of el.swatches) b.setAttribute('aria-checked', String(b.dataset.inst === id));
    if (st.tool === 'erase') setTool('draw');
  }

  function setTool(t) {
    st.tool = t;
    el.erase.setAttribute('aria-pressed', String(t === 'erase'));
    fx.classList.toggle('is-erasing', t === 'erase');
  }

  // Each loop gets a label: above it if there is room, else below or beside it,
  // never on top of another label or under the tool bars.
  function layoutChips() {
    if (!el.chips || !scene) return;
    el.chips.textContent = '';
    const topLimit = el.top ? el.top.getBoundingClientRect().bottom - fxRect.top + 6 : 66;
    const bottomLimit = el.bottom ? el.bottom.getBoundingClientRect().top - fxRect.top - 6 : H - 90;
    const placed = [];
    const hits = (c, w, h) => placed.some((p) => c.x < p.x + p.w + 6 && c.x + w + 6 > p.x && c.y < p.y + p.h + 4 && c.y + h + 4 > p.y);
    for (const L of scene.loops) {
      const tip = R.pointAt(L, 0, 1.1);
      let top = Math.min(L.cy - L.maxR, tip.y - 10 / view.s), bottom = L.cy + L.maxR;
      let left = L.cx - L.maxR, right = L.cx + L.maxR;
      for (const m of scene.marks) {
        if (m.loopId !== L.id) continue;
        for (const q of m.points) {
          if (q.y < top) top = q.y;
          if (q.y > bottom) bottom = q.y;
          if (q.x < left) left = q.x;
          if (q.x > right) right = q.x;
        }
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (L.muted ? ' is-muted' : '');
      b.style.setProperty('--c', `var(--i-${L.inst})`);
      b.innerHTML = `<span class="chip-dot" aria-hidden="true"></span><span>${M.INSTRUMENTS[L.inst].name} · ${barsText(L.bars)}</span>`;
      b.setAttribute('aria-label', `Loop ${M.INSTRUMENTS[L.inst].name}, ${barsText(L.bars)}${L.muted ? ', stil' : ''}. Opties`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openLoopMenu(L, b);
      });
      el.chips.appendChild(b);
      const w = b.offsetWidth, h = b.offsetHeight;
      const sx = view.ox + L.cx * view.s, sy = view.oy + L.cy * view.s;
      const cands = [
        { x: sx - w / 2, y: view.oy + top * view.s - 8 - h },
        { x: sx - w / 2, y: view.oy + bottom * view.s + 8 },
        { x: view.ox + left * view.s - 10 - w, y: sy - h / 2 },
        { x: view.ox + right * view.s + 10, y: sy - h / 2 },
      ];
      const inside = (c) => c.y >= topLimit && c.y + h <= bottomLimit && c.x >= 4 && c.x + w <= W - 4;
      const pos = Object.assign({}, cands.find((c) => inside(c) && !hits(c, w, h)) || cands.find((c) => !hits(c, w, h)) || cands[0]);
      pos.x = G.clamp(pos.x, 4, Math.max(4, W - w - 4));
      pos.y = G.clamp(pos.y, topLimit, Math.max(topLimit, bottomLimit - h));
      b.style.left = pos.x + 'px';
      b.style.top = pos.y + 'px';
      placed.push({ x: pos.x, y: pos.y, w, h });
    }
  }

  const panels = () => [el.vibePanel, el.morePanel, el.tastePanel, el.loopMenu];
  const anyPanelOpen = () => panels().some((p) => !p.hidden);

  function closePanels() {
    for (const p of panels()) p.hidden = true;
    el.vibe.setAttribute('aria-expanded', 'false');
    el.more.setAttribute('aria-expanded', 'false');
    menuLoop = null;
  }

  function togglePanel(panel, btn) {
    const open = panel.hidden;
    closePanels();
    if (!open) return;
    panel.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function openLoopMenu(L, chip) {
    closePanels();
    menuLoop = L;
    const m = el.loopMenu;
    m.querySelector('[data-act="mute"] span').textContent = L.muted ? 'Aan' : 'Stil';
    m.hidden = false;
    const r = chip.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = r.left - rr.left + r.width / 2 - mw / 2;
    let y = r.bottom - rr.top + 6;
    if (y + mh > H - 8) y = r.top - rr.top - mh - 6;
    m.style.left = G.clamp(x, 8, W - mw - 8) + 'px';
    m.style.top = G.clamp(y, 8, H - mh - 8) + 'px';
  }

  function instrumentsIn(L) {
    const count = new Map();
    for (const m of scene.marks) if (m.loopId === L.id) count.set(m.inst, (count.get(m.inst) || 0) + 1);
    if (!count.size) return [L.inst];
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }

  function loopAction(act) {
    const L = menuLoop;
    closePanels();
    if (!L) return;
    if (act === 'like') {
      let msg = '';
      for (const id of instrumentsIn(L)) msg = Taste.likeSound(id, L.shape, soundParams(L, id)).text;
      toast(msg);
    } else if (act === 'dislike') {
      let msg = '';
      instrumentsIn(L).forEach((id, i) => {
        const r = Taste.dislikeSound(id, L.shape, soundParams(L, id));
        L.params[id] = r.next;
        if (i === 0) msg = r.text;
      });
      toast(msg);
      if (!st.playing) { st.userPaused = false; setPlaying(true); }
      scheduleSave();
    } else if (act === 'mute') {
      L.muted = !L.muted;
      staticDirty = true;
      layoutChips();
      scheduleSave();
      toast(L.muted ? 'Deze loop zwijgt even' : 'Deze loop speelt weer');
    } else if (act === 'delete') {
      snapshot();
      scene.loops = scene.loops.filter((x) => x !== L);
      rebuild();
      toast('Loop weg. Spijt? Tik linksonder op ongedaan maken.');
    }
  }

  function renderTaste() {
    const d = Taste.describe();
    const max = Math.max(1, ...d.moods.map((m) => m.score));
    const moods = d.moods.map((m) =>
      `<li><span>${esc(m.name)}</span><span class="meter" aria-hidden="true"><span style="width:${Math.round((Math.max(0, m.score) / max) * 100)}%"></span></span></li>`).join('');
    const sounds = d.sounds.length
      ? d.sounds.map((s) => `<li><b>${esc(s.inst)}</b> in een ${esc(s.shape)}: ${s.words.length ? esc(s.words.join(', ')) : 'zoals standaard'} <small>(${s.n}× mooi)</small></li>`).join('')
      : '<li class="muted">Nog niets. Tik op het label boven een loop en geef een duim.</li>';
    el.tastePanel.innerHTML = `
      <h2 class="panel-title">Wat de app over jou leerde</h2>
      <p class="panel-note">${d.likes}× duim omhoog, ${d.dislikes}× omlaag. Dit blijft op dit apparaat.</p>
      <h3>Sfeer waarmee je start</h3>
      <p>${esc(d.vibeText)}</p>
      <ul class="mood-meters">${moods}</ul>
      <h3>Klank per instrument en vorm</h3>
      <ul class="sound-list">${sounds}</ul>
      <button class="btn-ghost" type="button" id="ssForget">Smaak vergeten</button>`;
    const forget = el.tastePanel.querySelector('#ssForget');
    forget.addEventListener('click', () => {
      if (!forget.dataset.armed) {
        forget.dataset.armed = '1';
        forget.textContent = 'Zeker weten? Tik nog een keer';
        return;
      }
      Taste.reset();
      renderTaste();
      toast('Smaak vergeten. De app begint opnieuw met leren.');
    });
  }

  function showIntro(fromMenu) {
    closePanels();
    el.introClose.hidden = !fromMenu;
    el.intro.hidden = false;
    el.startDemo.focus({ preventScroll: true });
  }

  function hideIntro() {
    el.intro.hidden = true;
    store.set(INTRO_KEY, '1');
  }

  function bindUI() {
    fx.addEventListener('pointerdown', onPointerDown);
    fx.addEventListener('pointermove', onPointerMove);
    fx.addEventListener('pointerup', onPointerUp);
    fx.addEventListener('pointercancel', onPointerUp);
    // Safari: block pinch-zoom and the long-press magnifier on the sheet
    for (const t of ['gesturestart', 'gesturechange', 'contextmenu']) fx.addEventListener(t, (e) => e.preventDefault());
    fx.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

    el.play.addEventListener('click', togglePlay);
    el.vibe.addEventListener('click', () => togglePanel(el.vibePanel, el.vibe));
    el.more.addEventListener('click', () => togglePanel(el.morePanel, el.more));
    el.like.addEventListener('click', () => {
      ensureAudio();
      toast(Taste.likeVibe(st.vibe).text);
    });
    el.dislike.addEventListener('click', () => {
      ensureAudio();
      const r = Taste.dislikeVibe(st.vibe);
      applyVibe(r.next);
      toast(r.text);
      if (!st.playing) { st.userPaused = false; setPlaying(true); }
    });
    el.undo.addEventListener('click', undo);
    el.erase.addEventListener('click', () => setTool(st.tool === 'erase' ? 'draw' : 'erase'));
    for (const b of el.swatches) b.addEventListener('click', () => selectInst(b.dataset.inst));
    for (const b of el.moods) b.addEventListener('click', () => applyVibe(Object.assign({}, st.vibe, { mood: b.dataset.mood })));
    el.tempo.addEventListener('input', () => applyVibe(Object.assign({}, st.vibe, { tempo: +el.tempo.value })));
    el.swing.addEventListener('input', () => applyVibe(Object.assign({}, st.vibe, { swing: +el.swing.value })));
    el.space.addEventListener('input', () => applyVibe(Object.assign({}, st.vibe, { space: +el.space.value })));
    el.morePanel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      closePanels();
      if (act === 'help') showIntro(true);
      else if (act === 'taste') {
        renderTaste();
        el.tastePanel.hidden = false;
      } else if (act === 'demo') {
        snapshot();
        loadDemo();
        toast('Voorbeeld geladen');
      } else if (act === 'new') {
        snapshot();
        newSheet();
        toast('Nieuw blad. Kies een kleur en teken een cirkel.');
      }
    });
    el.loopMenu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) loopAction(b.dataset.act);
    });
    el.startDemo.addEventListener('click', () => {
      ensureAudio();
      if (!st.isDemo) {
        snapshot();
        loadDemo();
      }
      hideIntro();
      st.userPaused = false;
      setPlaying(true);
    });
    el.startBlank.addEventListener('click', () => {
      ensureAudio();
      if (scene.loops.length || scene.marks.length) snapshot();
      newSheet();
      hideIntro();
      toast('Kies een kleur en teken een cirkel');
    });
    el.introClose.addEventListener('click', hideIntro);

    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (!el.intro.hidden) hideIntro();
        return closePanels();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return undo();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault();
        return togglePlay();
      }
      if (e.key === 'e' || e.key === 'E') return setTool(st.tool === 'erase' ? 'draw' : 'erase');
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= M.ORDER.length) selectInst(M.ORDER[n - 1]);
    });

    for (const t of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(t, unlockAudio, true);
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && st.playing && audio && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
    });
    const onTheme = () => {
      readTheme();
      staticDirty = true;
    };
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
      const rm = matchMedia('(prefers-reduced-motion: reduce)');
      reduceMotion = rm.matches;
    }
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { staticDirty = true; });
  }

  function init() {
    root = document.getElementById('app');
    if (!root) {
      root = document.createElement('div');
      root.id = 'app';
      document.body.appendChild(root);
    }
    if (!document.documentElement.lang) document.documentElement.lang = 'nl';
    root.classList.add('samso');
    root.innerHTML = template();
    const $ = (id) => root.querySelector('#' + id);
    bg = $('ssBg');
    fx = $('ssFx');
    bgc = bg.getContext('2d');
    fxc = fx.getContext('2d');
    Object.assign(el, {
      chips: $('ssChips'), top: $('ssTop'), bottom: $('ssBottom'), play: $('ssPlay'), vibe: $('ssVibe'), vibeMood: $('ssVibeMood'), vibeTempo: $('ssVibeTempo'),
      like: $('ssLike'), dislike: $('ssDislike'), more: $('ssMore'), undo: $('ssUndo'), erase: $('ssErase'), toast: $('ssToast'),
      vibePanel: $('ssVibePanel'), morePanel: $('ssMorePanel'), tastePanel: $('ssTastePanel'), loopMenu: $('ssLoopMenu'),
      tempo: $('ssTempo'), tempoOut: $('ssTempoOut'), swing: $('ssSwing'), swingOut: $('ssSwingOut'), space: $('ssSpace'), spaceOut: $('ssSpaceOut'),
      intro: $('ssIntro'), startDemo: $('ssStartDemo'), startBlank: $('ssStartBlank'), introClose: $('ssIntroClose'),
      swatches: [...root.querySelectorAll('.swatch')], moods: [...root.querySelectorAll('.mood')],
    });

    Taste.load();
    st.vibe = Taste.initialVibe();
    readTheme();
    measure();
    const saved = store.get(SCENE_KEY);
    let sc = null;
    if (saved) { try { sc = deserialize(JSON.parse(saved)); } catch (e) { sc = null; } }
    if (sc) scene = sc;
    else {
      scene = Demo.build(W, H);
      st.isDemo = true;
    }
    fitView();
    bindUI();
    rebuild({ save: false });
    selectInst('drums');
    setTool('draw');
    updateVibeUI();
    requestAnimationFrame(frame);
    if (!store.get(INTRO_KEY)) showIntro(false);
  }

  // Hooks for tests and for experimenting from the browser console.
  S.debug = {
    get scene() { return scene; },
    get state() { return st; },
    get audio() { return audio; },
    get view() { return view; },
    rebuild, setPlaying, loadDemo, newSheet, serialize,
    draw(points, inst) { return finishStroke({ pts: points.map((p) => G.pt(p.x, p.y, p.p)), inst: inst || st.inst, pen: false }); },
  };

  function boot() {
    try { init(); } catch (e) {
      console.error(e);
      const r = document.getElementById('app');
      if (r) r.textContent = 'SamSo kon niet starten: ' + e.message;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.SamSo = globalThis.SamSo || {});
