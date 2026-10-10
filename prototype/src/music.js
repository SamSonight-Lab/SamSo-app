/* SamSo · musical vocabulary: moods (scales), instruments, pitch mapping.
   Every melodic note is snapped to a five- or six-note scale, so nothing a
   user draws can sound "wrong". */
(function (S) {
  'use strict';

  // Friendly names instead of theory. root = pitch class (0 = C).
  const MOODS = [
    { id: 'zonnig', name: 'Zonnig', more: 'zonniger', scale: [0, 2, 4, 7, 9], root: 0 },
    { id: 'dromerig', name: 'Dromerig', more: 'dromeriger', scale: [0, 2, 4, 7, 11], root: 5 },
    { id: 'nacht', name: 'Nacht', more: 'nachtelijker', scale: [0, 3, 5, 7, 10], root: 9 },
    { id: 'mysterie', name: 'Mysterie', more: 'mysterieuzer', scale: [0, 2, 3, 7, 8], root: 2 },
    { id: 'stoer', name: 'Stoer', more: 'stoerder', scale: [0, 3, 5, 6, 7, 10], root: 4 },
  ];
  const MOOD = Object.fromEntries(MOODS.map((m) => [m.id, m]));

  const ORDER = ['drums', 'bass', 'lead', 'pad', 'drone', 'perc', 'noise'];

  // type 'drum': distance from the centre picks a lane (edges are upper bounds of u).
  // type 'melodic' / 'noise': distance from the centre picks a scale step (slot).
  const INSTRUMENTS = {
    drums: { id: 'drums', name: 'Drums', type: 'drum', lanes: ['kick', 'snare', 'hihat', 'open hihat'], edges: [0.42, 0.72, 1.0] },
    bass: { id: 'bass', name: 'Bas', type: 'melodic', low: 40, slots: 8, minSteps: 1 },
    lead: { id: 'lead', name: 'Lead', type: 'melodic', low: 57, slots: 11, minSteps: 1 },
    pad: { id: 'pad', name: 'Pad', type: 'melodic', low: 50, slots: 10, minSteps: 4 },
    drone: { id: 'drone', name: 'Drone', type: 'melodic', low: 38, slots: 6, minSteps: 8, sustain: true },
    perc: { id: 'perc', name: 'Perc', type: 'drum', lanes: ['conga', 'bongo', 'blokje', 'shaker', 'bel'], edges: [0.4, 0.58, 0.78, 1.0] },
    noise: { id: 'noise', name: 'Ruis', type: 'noise', slots: 8, minSteps: 2 },
  };

  const CENTER = 0.2; // inner zone: too close to the centre to have a meaningful angle
  const PULSE = 0.16; // a dot this close to the centre plays on every beat
  const HALO = 1.5; // ink up to 1.5x the radius still belongs to the loop (sun rays!)
  const HALO_SLOTS = 5;

  function uToSlot(u, slots) {
    if (u > 1) return slots + Math.min(HALO_SLOTS - 1, Math.floor(((u - 1) / (HALO - 1)) * HALO_SLOTS));
    const e = (u - CENTER) / (1 - CENTER);
    return Math.max(0, Math.min(slots - 1, Math.floor(e * slots)));
  }

  // Centre of a slot in u (used to place demo notes).
  function slotU(slot, slots) {
    if (slot >= slots) return 1 + ((slot - slots + 0.5) / HALO_SLOTS) * (HALO - 1);
    return CENTER + ((slot + 0.5) / slots) * (1 - CENTER);
  }

  function uToLane(u, inst) {
    const e = inst.edges;
    for (let i = 0; i < e.length; i++) if (u <= e[i]) return i;
    return e.length;
  }

  function laneU(lane, inst) {
    const lo = lane === 0 ? CENTER : inst.edges[lane - 1];
    const hi = lane < inst.edges.length ? inst.edges[lane] : HALO;
    return (lo + hi) / 2;
  }

  function slotToMidi(slot, instId, moodId, octave) {
    const inst = INSTRUMENTS[instId];
    const mood = MOOD[moodId] || MOOD.nacht;
    const sc = mood.scale, n = sc.length;
    const base = inst.low + ((((mood.root - inst.low) % 12) + 12) % 12);
    const o = Math.floor(slot / n);
    const d = ((slot % n) + n) % n;
    return base + 12 * o + sc[d] + 12 * (octave || 0);
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Loop size -> length. Bigger circle, longer loop.
  function barsFor(diameter, shortSide) {
    const f = diameter / shortSide;
    return f < 0.4 ? 1 : f < 0.7 ? 2 : 4;
  }

  S.Music = {
    MOODS, MOOD, ORDER, INSTRUMENTS, CENTER, PULSE, HALO,
    uToSlot, slotU, uToLane, laneU, slotToMidi, mtof, barsFor,
  };
})(globalThis.SamSo = globalThis.SamSo || {});
