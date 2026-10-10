/* SamSo · taste learning from thumbs up / thumbs down.
   Two levels:
   - the vibe (mood, tempo, swing, space) via the buttons in the top bar
   - the sound of each instrument per loop shape ("bass in a square") via a loop's menu
   Thumbs down tries a perceptibly different variation near what you liked
   before; thumbs up pulls the remembered preference toward what is playing.
   Everything is stored on the device. */
(function (S) {
  'use strict';
  const G = S.Geo, M = S.Music;
  const KEY = 'samso.taste.v1';

  const VIBE = {
    tempo: { min: 70, max: 140, init: 98, sigma: 14, sigmaMin: 5, minDelta: 8, round: 1, words: ['trager', 'sneller'] },
    swing: { min: 0, max: 0.32, init: 0.06, sigma: 0.08, sigmaMin: 0.03, minDelta: 0.06, round: 0.01, words: ['strakker', 'swingender'] },
    space: { min: 0, max: 1, init: 0.4, sigma: 0.22, sigmaMin: 0.08, minDelta: 0.15, round: 0.01, words: ['droger', 'ruimtelijker'] },
  };

  const SOUND = {
    bright: { min: 0, max: 1, sigma: 0.22, minDelta: 0.15, round: 0.01, words: ['donkerder', 'feller'] },
    reso: { min: 0, max: 1, sigma: 0.22, minDelta: 0.15, round: 0.01, words: ['ronder', 'scherper'] },
    decay: { min: 0, max: 1, sigma: 0.22, minDelta: 0.15, round: 0.01, words: ['korter', 'langer'] },
    drive: { min: 0, max: 1, sigma: 0.2, minDelta: 0.15, round: 0.01, words: ['zuiverder', 'ruwer'] },
    octave: { min: -1, max: 1, discrete: true, words: ['lager', 'hoger'] },
  };

  // What a shape sounds like before anything is learned.
  const SHAPE_DEFAULTS = {
    circle: { bright: 0.35, reso: 0.15, decay: 0.6, drive: 0, octave: 0 },
    square: { bright: 0.5, reso: 0.3, decay: 0.45, drive: 0.12, octave: 0 },
    triangle: { bright: 0.72, reso: 0.4, decay: 0.35, drive: 0.22, octave: 0 },
    blob: { bright: 0.5, reso: 0.25, decay: 0.5, drive: 0.08, octave: 0 },
  };

  let rng = Math.random;
  let st = fresh();

  function fresh() {
    const mu = {}, sigma = {};
    for (const k in VIBE) { mu[k] = VIBE[k].init; sigma[k] = VIBE[k].sigma; }
    return { v: 1, likes: 0, dislikes: 0, vibe: { mu, sigma, moods: {}, avoid: [] }, sounds: {}, log: [] };
  }

  function load() {
    try {
      const raw = globalThis.localStorage && localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && o.v === 1 && o.vibe && o.vibe.mu) st = Object.assign(fresh(), o);
    } catch (e) { /* storage unavailable: start fresh */ }
  }

  function save() {
    try { if (globalThis.localStorage) localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  }

  function reset() { st = fresh(); save(); }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function roundTo(v, r) { return r ? Math.round(v / r) * r : v; }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function logEvent(e) {
    st.log.push(Object.assign({ t: Date.now() }, e));
    if (st.log.length > 300) st.log.splice(0, st.log.length - 300);
  }

  // A new value that is clearly different from the current one, drawn around the preference.
  function propose(spec, cur, mu, sigma, avoid) {
    if (spec.discrete) {
      const opts = [];
      for (let v = spec.min; v <= spec.max; v++) if (v !== cur) opts.push(v);
      return opts[Math.floor(rng() * opts.length)];
    }
    for (let t = 0; t < 20; t++) {
      const v = roundTo(G.clamp(mu + sigma * 1.3 * randn(), spec.min, spec.max), spec.round);
      if (Math.abs(v - cur) < spec.minDelta) continue;
      if (avoid.some((a) => Math.abs(a - v) < spec.minDelta / 2)) continue;
      return v;
    }
    const up = spec.max - cur > cur - spec.min;
    return roundTo(G.clamp(cur + (up ? 1 : -1) * spec.minDelta * 1.5, spec.min, spec.max), spec.round);
  }

  // ---------- vibe ----------
  function initialVibe() {
    let mood = 'nacht', best = -Infinity;
    for (const m of M.MOODS) {
      const s = st.vibe.moods[m.id] || 0;
      if (s > best + 1e-9) { best = s; mood = m.id; }
    }
    if (best <= 0) mood = 'nacht';
    const v = { mood };
    for (const k in VIBE) v[k] = roundTo(st.vibe.mu[k], VIBE[k].round);
    return v;
  }

  function likeVibe(cur) {
    st.likes++;
    for (const k in VIBE) {
      st.vibe.mu[k] += 0.5 * (cur[k] - st.vibe.mu[k]);
      st.vibe.sigma[k] = Math.max(VIBE[k].sigmaMin, st.vibe.sigma[k] * 0.85);
    }
    st.vibe.moods[cur.mood] = (st.vibe.moods[cur.mood] || 0) + 1.5;
    logEvent({ scope: 'vibe', verdict: 1, params: cur });
    save();
    return { text: 'Onthouden: ' + vibeLabel(cur) };
  }

  function dislikeVibe(cur) {
    st.dislikes++;
    st.vibe.moods[cur.mood] = (st.vibe.moods[cur.mood] || 0) - 1;
    st.vibe.avoid.push(cur);
    if (st.vibe.avoid.length > 12) st.vibe.avoid.shift();
    const next = Object.assign({}, cur);
    const words = [];
    const changeMood = rng() < 0.45;
    if (changeMood) {
      const cands = M.MOODS.filter((m) => m.id !== cur.mood);
      const w = cands.map((m) => Math.exp(Math.max(-3, Math.min(3, st.vibe.moods[m.id] || 0))));
      let r = rng() * w.reduce((a, b) => a + b, 0);
      let pick = cands[0];
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { pick = cands[i]; break; } }
      next.mood = pick.id;
      words.push(pick.more);
    }
    const n = changeMood ? (rng() < 0.5 ? 1 : 0) : (rng() < 0.6 ? 1 : 2);
    for (const k of shuffle(Object.keys(VIBE)).slice(0, n)) {
      next[k] = propose(VIBE[k], cur[k], st.vibe.mu[k], st.vibe.sigma[k], st.vibe.avoid.map((a) => a[k]));
      words.push(VIBE[k].words[next[k] > cur[k] ? 1 : 0]);
    }
    logEvent({ scope: 'vibe', verdict: -1, params: cur });
    save();
    return { next, text: 'Anders geprobeerd: ' + words.join(', ') };
  }

  function vibeLabel(v) {
    const mood = (M.MOOD[v.mood] || M.MOOD.nacht).name;
    const swing = v.swing < 0.04 ? 'strak' : v.swing < 0.15 ? 'licht swingend' : 'swingend';
    const space = v.space < 0.25 ? 'droog' : v.space < 0.6 ? 'wat ruimte' : 'veel ruimte';
    return `${mood}, tempo ${Math.round(v.tempo)}, ${swing}, ${space}`;
  }

  // ---------- sound per instrument + shape ----------
  const soundKey = (inst, shape) => inst + ':' + shape;

  function soundFor(inst, shape) {
    const base = Object.assign({}, SHAPE_DEFAULTS[shape] || SHAPE_DEFAULTS.blob);
    const s = st.sounds[soundKey(inst, shape)];
    return s ? Object.assign(base, s.mu) : base;
  }

  function likeSound(inst, shape, params) {
    st.likes++;
    const key = soundKey(inst, shape);
    const s = st.sounds[key];
    if (!s) st.sounds[key] = { mu: Object.assign({}, params), n: 1, avoid: [] };
    else if (!s.n) {
      s.mu = Object.assign({}, params);
      s.n = 1;
    } else {
      for (const k in SOUND) {
        if (params[k] == null) continue;
        const mu = s.mu[k] == null ? params[k] : s.mu[k];
        s.mu[k] = SOUND[k].discrete ? params[k] : mu + 0.6 * (params[k] - mu);
      }
      s.n++;
    }
    logEvent({ scope: 'sound', key, verdict: 1, params });
    save();
    return { text: `Onthouden: zo klinkt ${M.INSTRUMENTS[inst].name.toLowerCase()} in een ${shapeName(shape)} voortaan` };
  }

  function dislikeSound(inst, shape, params) {
    st.dislikes++;
    const key = soundKey(inst, shape);
    const s = st.sounds[key] || (st.sounds[key] = { mu: soundFor(inst, shape), n: 0, avoid: [] });
    s.avoid.push(params);
    if (s.avoid.length > 12) s.avoid.shift();
    const next = Object.assign({}, params);
    const words = [];
    const keys = shuffle(Object.keys(SOUND)).slice(0, rng() < 0.5 ? 1 : 2);
    for (const k of keys) {
      const mu = s.mu[k] == null ? params[k] : s.mu[k];
      next[k] = propose(SOUND[k], params[k], mu, SOUND[k].sigma || 1, s.avoid.map((a) => a[k]));
      words.push(SOUND[k].words[next[k] > params[k] ? 1 : 0]);
    }
    logEvent({ scope: 'sound', key, verdict: -1, params });
    save();
    return { next, text: `${M.INSTRUMENTS[inst].name}: ${words.join(' en ')}. Beter?` };
  }

  function shapeName(shape) {
    return { circle: 'cirkel', square: 'vierkant', triangle: 'driehoek', blob: 'vorm' }[shape] || 'vorm';
  }

  // Human-readable summary for the "what the app learned" panel.
  function describe() {
    const moods = M.MOODS.map((m) => ({ id: m.id, name: m.name, score: st.vibe.moods[m.id] || 0 }));
    const sounds = Object.entries(st.sounds)
      .filter(([, s]) => s.n > 0)
      .map(([key, s]) => {
        const [inst, shape] = key.split(':');
        const base = SHAPE_DEFAULTS[shape] || SHAPE_DEFAULTS.blob;
        const words = [];
        for (const k in SOUND) {
          const d = (s.mu[k] == null ? base[k] : s.mu[k]) - base[k];
          if (Math.abs(d) >= (SOUND[k].discrete ? 1 : 0.1)) words.push(SOUND[k].words[d > 0 ? 1 : 0]);
        }
        return { key, inst: M.INSTRUMENTS[inst] ? M.INSTRUMENTS[inst].name : inst, shape: shapeName(shape), n: s.n, words };
      });
    return {
      likes: st.likes, dislikes: st.dislikes, moods, sounds,
      vibe: initialVibe(), vibeText: vibeLabel(initialVibe()),
    };
  }

  S.Taste = {
    VIBE, SOUND, SHAPE_DEFAULTS,
    load, save, reset, initialVibe, likeVibe, dislikeVibe, soundFor, likeSound, dislikeSound, describe, vibeLabel,
    _setRng(f) { rng = f || Math.random; },
    _state() { return st; },
  };
})(globalThis.SamSo = globalThis.SamSo || {});
