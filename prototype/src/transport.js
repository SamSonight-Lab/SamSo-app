/* SamSo · clock. Look-ahead scheduler on the audio clock ("a tale of two
   clocks"): a 25 ms timer schedules every sixteenth note ~140 ms ahead with
   sample-accurate audio times. Loops are 1, 2 or 4 bars, so they stay in phase. */
(function (S) {
  'use strict';

  class Transport {
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.onStep = opts.onStep;
      this.tempo = 98;
      this.swing = 0.06;
      this.playing = false;
      this.stepIndex = 0;
      this.nextTime = 0;
      this.timeline = [];
      this._timer = 0;
    }

    get stepDur() { return 60 / this.tempo / 4; }

    start() {
      if (this.playing) return;
      this.playing = true;
      this.stepIndex = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.timeline = [];
      this._timer = setInterval(() => this._tick(), 25);
      this._tick();
    }

    stop() {
      this.playing = false;
      clearInterval(this._timer);
      this.timeline = [];
    }

    _tick() {
      if (!this.playing) return;
      const now = this.ctx.currentTime;
      let sd = this.stepDur;
      if (this.nextTime < now - 0.25) {
        // The timer was asleep (background tab): skip ahead instead of firing a burst.
        const missed = Math.ceil((now - this.nextTime) / sd);
        this.stepIndex += missed;
        this.nextTime += missed * sd;
      }
      while (this.nextTime < now + 0.14) {
        sd = this.stepDur;
        const swing = this.stepIndex % 2 === 1 ? this.swing * sd : 0;
        this.timeline.push({ i: this.stepIndex, t: this.nextTime, d: sd });
        try { this.onStep(this.stepIndex, this.nextTime + swing, sd); } catch (e) { console.error(e); }
        this.nextTime += sd;
        this.stepIndex++;
      }
      while (this.timeline.length > 4 && this.timeline[1].t < now - 0.5) this.timeline.shift();
    }

    // Fractional global step that is audible at audio time `at`.
    position(at) {
      const tl = this.timeline;
      if (!tl.length) return null;
      let e = tl[0];
      for (const x of tl) {
        if (x.t <= at) e = x;
        else break;
      }
      return e.i + Math.max(0, Math.min(1, (at - e.t) / e.d));
    }
  }

  S.Transport = Transport;
})(globalThis.SamSo = globalThis.SamSo || {});
