/* SamSo · Web Audio synth engine. Every instrument is synthesized (no samples).
   Works with a live AudioContext and with an OfflineAudioContext (for tests).
   Loop shape sets the character: circle = round/soft, square = hollow/retro,
   triangle = sharp/bright. Per-loop sound params (0..1): bright, reso, decay,
   drive, octave (-1..1). */
(function (S) {
  'use strict';
  const M = S.Music;

  const BUS_GAIN = { drums: 0.9, perc: 0.7, bass: 0.75, lead: 0.42, pad: 0.34, drone: 0.3, noise: 0.32 };
  const SENDS = {
    drums: { rev: 0.06, dly: 0 },
    perc: { rev: 0.2, dly: 0.15 },
    bass: { rev: 0.03, dly: 0 },
    lead: { rev: 0.25, dly: 0.32 },
    pad: { rev: 0.55, dly: 0.1 },
    drone: { rev: 0.5, dly: 0 },
    noise: { rev: 0.4, dly: 0.1 },
  };
  const WAVE = { circle: 'triangle', square: 'square', triangle: 'sawtooth', blob: 'sawtooth' };
  const MAX_VOICES = 72;

  function makeCurve(k) {
    const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / norm;
    }
    return c;
  }

  class Engine {
    constructor(ctx) {
      this.ctx = ctx;
      const c = ctx;
      this.out = c.createGain();
      this.out.gain.value = 0.9;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.22;
      this.comp.connect(this.out);
      this.out.connect(c.destination);

      this.verb = c.createConvolver();
      this.verb.buffer = this._impulse(2.6);
      this.verbIn = c.createGain();
      this.verbOut = c.createGain();
      this.verbIn.connect(this.verb);
      this.verb.connect(this.verbOut);
      this.verbOut.connect(this.comp);

      this.dly = c.createDelay(2);
      this.dlyFb = c.createGain();
      this.dlyFb.gain.value = 0.32;
      this.dlyTone = c.createBiquadFilter();
      this.dlyTone.type = 'lowpass';
      this.dlyTone.frequency.value = 2800;
      this.dlyIn = c.createGain();
      this.dlyOut = c.createGain();
      this.dlyIn.connect(this.dly);
      this.dly.connect(this.dlyTone);
      this.dlyTone.connect(this.dlyFb);
      this.dlyFb.connect(this.dly);
      this.dlyTone.connect(this.dlyOut);
      this.dlyOut.connect(this.comp);

      this.bus = {};
      for (const id of M.ORDER) {
        const g = c.createGain();
        g.gain.value = BUS_GAIN[id];
        const rs = c.createGain();
        rs.gain.value = SENDS[id].rev;
        const ds = c.createGain();
        ds.gain.value = SENDS[id].dly;
        g.connect(this.comp);
        g.connect(rs);
        rs.connect(this.verbIn);
        g.connect(ds);
        ds.connect(this.dlyIn);
        this.bus[id] = g;
      }
      this.noise = this._noiseBuffer(2);
      this.curves = [null, makeCurve(1.6), makeCurve(3.5), makeCurve(8)];
      this.active = 0;
      this.setSpace(0.4);
      this.setTempo(98);
    }

    setSpace(space) {
      const t = this.ctx.currentTime;
      this.verbOut.gain.setTargetAtTime(0.15 + space * 1.1, t, 0.05);
      this.dlyOut.gain.setTargetAtTime(0.08 + space * 0.7, t, 0.05);
    }

    setTempo(bpm) {
      this.dly.delayTime.setTargetAtTime(Math.min(1.9, (0.75 * 60) / bpm), this.ctx.currentTime, 0.05);
    }

    _impulse(seconds) {
      const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const a = 0.9 - 0.75 * t; // high frequencies die out faster
          lp += a * (Math.random() * 2 - 1 - lp);
          const fadeIn = i < rate * 0.004 ? i / (rate * 0.004) : 1;
          d[i] = lp * Math.pow(1 - t, 2.4) * fadeIn;
        }
      }
      return buf;
    }

    _noiseBuffer(seconds) {
      const len = Math.floor(this.ctx.sampleRate * seconds);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    // ---------- plumbing ----------
    _route(node, inst, pan, nodes) {
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan || 0));
        node.connect(p);
        p.connect(this.bus[inst]);
        nodes.push(p);
      } else {
        node.connect(this.bus[inst]);
      }
    }

    _shaper(drive) {
      const idx = drive < 0.12 ? 0 : drive < 0.4 ? 1 : drive < 0.7 ? 2 : 3;
      if (!idx) return null;
      const ws = this.ctx.createWaveShaper();
      ws.curve = this.curves[idx];
      ws.oversample = '2x';
      return ws;
    }

    _done(sources, stopAt, nodes) {
      this.active++;
      let left = sources.length;
      for (const s of sources) {
        s.onended = () => {
          if (--left > 0) return;
          this.active--;
          for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already gone */ } }
        };
        s.stop(stopAt);
      }
    }

    _osc(type, freq, t) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      return o;
    }

    _gain(v) {
      const g = this.ctx.createGain();
      g.gain.value = v == null ? 1 : v;
      return g;
    }

    // Percussive envelope: instant attack, exponential decay. Returns the end time.
    _perc(g, t, peak, dec, attack) {
      const a = attack || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
      return t + a + dec;
    }

    // Attack / decay-to-sustain / release. Returns when the sound is silent.
    _adsr(g, t, a, d, s, peak, end, r) {
      end = Math.max(end, t + a + 0.005);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
      g.gain.setTargetAtTime(0, end, Math.max(0.005, r / 4));
      return end + r * 1.3;
    }

    _noiseHit(t, amp, freq, dec, type, inst, pan, q, attack) {
      const c = this.ctx, nodes = [];
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q == null ? 0.7 : q;
      const g = this._gain(0);
      src.connect(f);
      f.connect(g);
      nodes.push(src, f, g);
      this._route(g, inst, pan, nodes);
      const end = this._perc(g, t, amp, dec, attack);
      src.start(t, Math.random() * Math.max(0, this.noise.duration - dec - 0.1));
      this._done([src], end + 0.02, nodes);
    }

    // ---------- entry point ----------
    // n: note event from Reader; sp: loop sound params for n.inst; shape: loop shape.
    play(n, t, stepDur, sp, shape, pan, mood) {
      const inst = M.INSTRUMENTS[n.inst];
      if (!inst) return;
      if (this.active > MAX_VOICES && n.inst !== 'drums') return;
      sp = sp || {};
      const drive = Math.min(1, (sp.drive || 0) + (n.drive || 0));
      const vel = n.vel == null ? 0.85 : n.vel;
      const durSec = Math.max(0.04, n.dur * stepDur * 0.92);
      if (n.inst === 'drums') return this.drum(n.lane, t, vel, sp, shape, pan, drive);
      if (n.inst === 'perc') return this.perc(n.lane, t, vel, sp, shape, pan, drive);
      if (n.inst === 'noise') return this.noiseVoice(t, n.slot, inst.slots, durSec, vel, sp, shape, pan, drive);
      const toMidi = (s) => M.slotToMidi(s, n.inst, mood, sp.octave || 0);
      let notes;
      if (n.type === 'chord') notes = n.slots.map(toMidi);
      else if (n.inst === 'pad') notes = [n.slot, n.slot + 2, n.slot + 4].map(toMidi);
      else notes = [toMidi(n.slot)];
      const glide = n.glide == null ? null : toMidi(n.glide);
      const v = vel / Math.sqrt(notes.length);
      if (n.inst === 'pad') return this.pad(t, notes, durSec, vel, sp, shape, pan);
      for (const m of notes) {
        if (n.inst === 'bass') this.bass(t, m, durSec, v, sp, shape, pan, drive, glide);
        else if (n.inst === 'lead') this.lead(t, m, durSec, v, sp, shape, pan, drive, glide);
        else if (n.inst === 'drone') this.drone(t, m, durSec, v, sp, shape, pan);
      }
    }

    // ---------- drums ----------
    drum(lane, t, vel, sp, shape, pan, drive) {
      if (lane === 0) return this.kick(t, vel, sp, shape, pan, drive);
      if (lane === 1) return this.snare(t, vel, sp, shape, pan, drive);
      return this.hat(t, vel, sp, shape, pan, lane >= 3);
    }

    kick(t, vel, sp, shape, pan, drive) {
      const K = {
        circle: { f0: 120, f1: 44, dec: 0.55, click: 0 },
        square: { f0: 170, f1: 50, dec: 0.38, click: 0.25 },
        triangle: { f0: 210, f1: 56, dec: 0.28, click: 0.45 },
        blob: { f0: 150, f1: 48, dec: 0.45, click: 0.12 },
      }[shape] || { f0: 150, f1: 48, dec: 0.45, click: 0.1 };
      const tune = Math.pow(2, ((sp.octave || 0) * 3) / 12);
      const dec = K.dec * (0.6 + (sp.decay == null ? 0.5 : sp.decay) * 0.9);
      const nodes = [];
      const o = this._osc('sine', K.f0 * tune, t);
      o.frequency.exponentialRampToValueAtTime(K.f1 * tune, t + 0.07 + 0.05 * (sp.decay || 0));
      const g = this._gain(0);
      let head = o;
      const sh = this._shaper(drive);
      if (sh) { o.connect(sh); head = sh; nodes.push(sh); }
      head.connect(g);
      nodes.push(o, g);
      this._route(g, 'drums', pan, nodes);
      const end = this._perc(g, t, vel, dec);
      o.start(t);
      this._done([o], end + 0.03, nodes);
      const click = K.click + (sp.bright || 0) * 0.3;
      if (click > 0.05) this._noiseHit(t, vel * click * 0.5, 2500 + (sp.bright || 0) * 5000, 0.01, 'highpass', 'drums', pan);
    }

    snare(t, vel, sp, shape, pan, drive) {
      const K = {
        circle: { tone: 0.55, noise: 0.55, nf: 1100, dec: 0.17 },
        square: { tone: 0.45, noise: 0.75, nf: 1500, dec: 0.15 },
        triangle: { tone: 0.3, noise: 0.95, nf: 2200, dec: 0.13 },
        blob: { tone: 0.45, noise: 0.7, nf: 1400, dec: 0.15 },
      }[shape] || { tone: 0.45, noise: 0.7, nf: 1400, dec: 0.15 };
      const tune = Math.pow(2, ((sp.octave || 0) * 3) / 12);
      const dec = K.dec * (0.6 + (sp.decay == null ? 0.5 : sp.decay));
      const nodes = [];
      const o = this._osc('triangle', 190 * tune, t);
      o.frequency.exponentialRampToValueAtTime(135 * tune, t + 0.06);
      const g = this._gain(0);
      let head = o;
      const sh = this._shaper(drive);
      if (sh) { o.connect(sh); head = sh; nodes.push(sh); }
      head.connect(g);
      nodes.push(o, g);
      this._route(g, 'drums', pan, nodes);
      const end = this._perc(g, t, vel * K.tone, 0.09);
      o.start(t);
      this._done([o], end + 0.02, nodes);
      this._noiseHit(t, vel * K.noise, K.nf + (sp.bright || 0) * 1800, dec, 'highpass', 'drums', pan, 0.5);
    }

    hat(t, vel, sp, shape, pan, open) {
      const bright = sp.bright == null ? 0.5 : sp.bright;
      const dec = (open ? 0.32 : 0.045) * (0.6 + (sp.decay == null ? 0.5 : sp.decay));
      const base = 6200 + bright * 3500 + (shape === 'triangle' ? 900 : shape === 'circle' ? -1200 : 0);
      this._noiseHit(t, vel * (shape === 'circle' ? 0.42 : 0.3), base, dec, 'highpass', 'drums', pan, 0.8);
      if (shape === 'circle') return;
      // metallic layer: inharmonic square partials (808 style)
      const c = this.ctx, nodes = [], srcs = [];
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 9500 + bright * 1500;
      bp.Q.value = 1.2;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = this._gain(0);
      bp.connect(hp);
      hp.connect(g);
      nodes.push(bp, hp, g);
      for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
        const o = this._osc('square', 40 * r * (shape === 'triangle' ? 1.12 : 1), t);
        o.connect(bp);
        o.start(t);
        srcs.push(o);
        nodes.push(o);
      }
      this._route(g, 'drums', pan, nodes);
      const end = this._perc(g, t, vel * 0.22, dec);
      this._done(srcs, end + 0.02, nodes);
    }

    perc(lane, t, vel, sp, shape, pan, drive) {
      const tune = Math.pow(2, ((sp.octave || 0) * 3) / 12);
      const decK = 0.6 + (sp.decay == null ? 0.5 : sp.decay) * 0.9;
      if (lane === 3) return this._noiseHit(t, vel * 0.45, 6500 + (sp.bright || 0) * 2500, 0.07 * decK, 'bandpass', 'perc', pan, 1.6, 0.012);
      const nodes = [], c = this.ctx;
      let o, dec, peak = vel;
      if (lane === 0 || lane === 1) {
        const f = (lane === 0 ? 190 : 330) * tune;
        o = this._osc(shape === 'square' ? 'triangle' : 'sine', f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.78, t + 0.08);
        dec = (lane === 0 ? 0.26 : 0.16) * decK;
      } else if (lane === 2) {
        o = this._osc(shape === 'square' ? 'square' : 'triangle', (shape === 'triangle' ? 1400 : 950) * tune, t);
        dec = 0.05 * decK;
        peak = vel * 0.6;
      } else {
        // bell: two inharmonic partials
        o = this._osc('sine', 880 * tune, t);
        const o2 = this._osc('sine', 880 * 1.5 * 1.004 * tune, t);
        const g2 = this._gain(0);
        o2.connect(g2);
        nodes.push(o2, g2);
        this._route(g2, 'perc', pan, nodes);
        const end2 = this._perc(g2, t, vel * 0.25, 0.7 * decK);
        o2.start(t);
        this._done([o2], end2 + 0.02, nodes.slice());
        dec = 0.9 * decK;
        peak = vel * 0.35;
      }
      const g = this._gain(0);
      let head = o;
      const sh = this._shaper(drive);
      if (sh) { o.connect(sh); head = sh; nodes.push(sh); }
      if (lane === 2) {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200 * tune;
        bp.Q.value = 3;
        head.connect(bp);
        head = bp;
        nodes.push(bp);
      }
      head.connect(g);
      nodes.push(o, g);
      this._route(g, 'perc', pan, nodes);
      const end = this._perc(g, t, peak, dec);
      o.start(t);
      this._done([o], end + 0.02, nodes);
    }

    // ---------- melodic ----------
    _glideFreq(o, t, f, glideFreq, glideTime) {
      if (glideFreq && Math.abs(glideFreq - f) > 0.5) {
        o.frequency.setValueAtTime(glideFreq, t);
        o.frequency.exponentialRampToValueAtTime(f, t + glideTime);
      }
    }

    bass(t, midi, durSec, vel, sp, shape, pan, drive, glideMidi) {
      const c = this.ctx, nodes = [];
      const f = M.mtof(midi);
      const gf = glideMidi == null ? null : M.mtof(glideMidi);
      const o = this._osc(WAVE[shape] || 'sawtooth', f, t);
      this._glideFreq(o, t, f, gf, 0.05);
      const srcs = [o];
      const mix = this._gain(1);
      o.connect(mix);
      nodes.push(o, mix);
      if (shape === 'circle') {
        const sub = this._osc('sine', f, t);
        this._glideFreq(sub, t, f, gf, 0.05);
        const sg = this._gain(0.6);
        sub.connect(sg);
        sg.connect(mix);
        srcs.push(sub);
        nodes.push(sub, sg);
      }
      const bright = sp.bright == null ? 0.5 : sp.bright;
      const decay = sp.decay == null ? 0.5 : sp.decay;
      const cut = 180 + Math.pow(bright, 1.6) * 3200;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.8 + (sp.reso || 0) * 11;
      const peakCut = Math.min(14000, cut * (2.2 + (sp.reso || 0) * 2 + drive * 2));
      lp.frequency.setValueAtTime(peakCut, t);
      lp.frequency.setTargetAtTime(cut, t + 0.005, 0.03 + decay * 0.12);
      let head = mix;
      const sh = this._shaper(drive);
      if (sh) { mix.connect(sh); head = sh; nodes.push(sh); }
      head.connect(lp);
      const g = this._gain(0);
      lp.connect(g);
      nodes.push(lp, g);
      this._route(g, 'bass', pan, nodes);
      const end = this._adsr(g, t, 0.004, 0.1 + decay * 0.3, 0.75, vel * 0.8, t + durSec, 0.05 + decay * 0.25);
      for (const s of srcs) s.start(t);
      this._done(srcs, end, nodes);
    }

    lead(t, midi, durSec, vel, sp, shape, pan, drive, glideMidi) {
      const c = this.ctx, nodes = [], srcs = [];
      const f = M.mtof(midi);
      const gf = glideMidi == null ? null : M.mtof(glideMidi);
      const types = shape === 'blob' ? ['sawtooth', 'square'] : [WAVE[shape] || 'sawtooth', WAVE[shape] || 'sawtooth'];
      const mix = this._gain(0.5);
      nodes.push(mix);
      types.forEach((ty, i) => {
        const o = this._osc(ty, f, t);
        o.detune.value = i ? 7 : -7;
        this._glideFreq(o, t, f, gf, 0.06);
        o.connect(mix);
        srcs.push(o);
        nodes.push(o);
      });
      if (durSec > 0.35) {
        const lfo = this._osc('sine', 5.2, t);
        const lg = this._gain(0);
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(9, t + Math.min(durSec, 0.5));
        lfo.connect(lg);
        for (const o of srcs) lg.connect(o.detune);
        srcs.push(lfo);
        nodes.push(lfo, lg);
      }
      const bright = sp.bright == null ? 0.5 : sp.bright;
      const decay = sp.decay == null ? 0.5 : sp.decay;
      const cut = 500 + Math.pow(bright, 1.5) * 7000;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.7 + (sp.reso || 0) * 8;
      lp.frequency.setValueAtTime(Math.min(16000, cut * 2.2), t);
      lp.frequency.setTargetAtTime(cut, t + 0.005, 0.04 + decay * 0.15);
      let head = mix;
      const sh = this._shaper(drive);
      if (sh) { mix.connect(sh); head = sh; nodes.push(sh); }
      head.connect(lp);
      const g = this._gain(0);
      lp.connect(g);
      nodes.push(lp, g);
      this._route(g, 'lead', pan, nodes);
      const end = this._adsr(g, t, 0.008, 0.15, 0.7, vel * 0.9, t + durSec, 0.08 + decay * 0.5);
      for (const s of srcs) s.start(t);
      this._done(srcs, end, nodes);
    }

    pad(t, midis, durSec, vel, sp, shape, pan) {
      const c = this.ctx, nodes = [], srcs = [];
      const bright = sp.bright == null ? 0.5 : sp.bright;
      const decay = sp.decay == null ? 0.5 : sp.decay;
      const attack = 0.25 + decay * 0.9;
      const release = 0.6 + decay * 2;
      const cut = 400 + Math.pow(bright, 1.4) * 3800;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5 + (sp.reso || 0) * 4;
      lp.frequency.setValueAtTime(cut * 0.5, t);
      lp.frequency.linearRampToValueAtTime(cut, t + attack);
      const g = this._gain(0);
      lp.connect(g);
      nodes.push(lp, g);
      const per = 0.5 / Math.sqrt(midis.length);
      const type = WAVE[shape] || 'sawtooth';
      for (const m of midis) {
        for (const det of [-9, 9]) {
          const o = this._osc(type, M.mtof(m), t);
          o.detune.value = det;
          const og = this._gain(per);
          o.connect(og);
          og.connect(lp);
          srcs.push(o);
          nodes.push(o, og);
        }
      }
      this._route(g, 'pad', pan, nodes);
      const end = this._adsr(g, t, attack, 0.4, 0.85, vel * 0.8, t + durSec, release);
      for (const s of srcs) s.start(t);
      this._done(srcs, end, nodes);
    }

    drone(t, midi, durSec, vel, sp, shape, pan) {
      const c = this.ctx, nodes = [], srcs = [];
      const bright = sp.bright == null ? 0.5 : sp.bright;
      const decay = sp.decay == null ? 0.5 : sp.decay;
      const type = WAVE[shape] || 'sawtooth';
      const parts = [[midi, -6, 0.5, type], [midi, 6, 0.5, type], [midi + 7, 0, 0.3, 'triangle']];
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6 + (sp.reso || 0) * 6;
      const cut = 250 + Math.pow(bright, 1.5) * 2200;
      lp.frequency.value = cut;
      const lfo = this._osc('sine', 0.07 + bright * 0.1, t);
      const lg = this._gain(cut * 0.55);
      lfo.connect(lg);
      lg.connect(lp.frequency);
      srcs.push(lfo);
      nodes.push(lfo, lg, lp);
      for (const [m, det, amp, ty] of parts) {
        const o = this._osc(ty, M.mtof(m), t);
        o.detune.value = det;
        const og = this._gain(amp);
        o.connect(og);
        og.connect(lp);
        srcs.push(o);
        nodes.push(o, og);
      }
      const g = this._gain(0);
      lp.connect(g);
      nodes.push(g);
      this._route(g, 'drone', pan, nodes);
      const end = this._adsr(g, t, 1 + decay * 1.5, 0.5, 0.9, vel * 0.8, t + durSec, 1.5 + decay * 2.5);
      for (const s of srcs) s.start(t);
      this._done(srcs, end, nodes);
    }

    noiseVoice(t, slot, slots, durSec, vel, sp, shape, pan, drive) {
      const c = this.ctx, nodes = [];
      const decay = sp.decay == null ? 0.5 : sp.decay;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const center = Math.min(9000, 160 * Math.pow(2, (Math.min(slot, slots + 4) / slots) * 5.5) * (0.7 + (sp.bright || 0) * 0.6));
      const bp = c.createBiquadFilter();
      bp.type = shape === 'triangle' ? 'highpass' : 'bandpass';
      bp.Q.value = 0.6 + (sp.reso || 0) * 6;
      bp.frequency.setValueAtTime(center, t);
      if (shape === 'circle' || shape === 'blob') bp.frequency.exponentialRampToValueAtTime(center * 1.6, t + durSec);
      src.connect(bp);
      let head = bp;
      const sh = this._shaper(drive);
      if (sh) { bp.connect(sh); head = sh; nodes.push(sh); }
      const g = this._gain(0);
      head.connect(g);
      nodes.push(src, bp, g);
      if (shape === 'square') {
        // radio static: chopped in sixteenths
        const lfo = this._osc('square', 12, t);
        const lg = this._gain(0.5);
        const chop = this._gain(0.5);
        lfo.connect(lg);
        lg.connect(chop.gain);
        g.connect(chop);
        nodes.push(lfo, lg, chop);
        this._route(chop, 'noise', pan, nodes);
        lfo.start(t);
        const end = this._adsr(g, t, 0.05 + decay * 0.3, 0.2, 0.8, vel * 0.9, t + durSec, 0.2 + decay * 0.9);
        src.start(t, Math.random());
        this._done([src, lfo], end, nodes);
        return;
      }
      this._route(g, 'noise', pan, nodes);
      const end = this._adsr(g, t, 0.05 + decay * 0.3, 0.2, 0.8, vel * 0.9, t + durSec, 0.2 + decay * 0.9);
      src.start(t, Math.random());
      this._done([src], end, nodes);
    }
  }

  S.Engine = Engine;
})(globalThis.SamSo = globalThis.SamSo || {});
