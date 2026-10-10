/* SamSo · stroke recognition. Turns raw pointer points into a description:
   dot / line / curve / zigzag / spiral / closed (circle, square, triangle, blob),
   plus features (size, jaggedness, pressure, drawing direction).
   Closed shapes are classified with rotation- and aspect-invariant hull ratios
   (in the spirit of the CALI recognizer), so ellipses still count as circles. */
(function (S) {
  'use strict';
  const G = S.Geo;

  function dedupe(raw) {
    const out = [];
    for (const p of raw) {
      const last = out[out.length - 1];
      if (!last || G.dist(last, p) >= 0.75) out.push(G.pt(p.x, p.y, p.p));
    }
    if (out.length === 1 && raw.length > 1) {
      const p = raw[raw.length - 1];
      out.push(G.pt(p.x, p.y, p.p));
    }
    return out;
  }

  function avgPressure(pts) {
    let s = 0;
    for (const p of pts) s += p.p == null ? 0.5 : p.p;
    return pts.length ? s / pts.length : 0.5;
  }

  // Count sharp corners (turning peaks above ~69 degrees) and how often their sign flips.
  function sharpCorners(pts) {
    const k = 2, n = pts.length;
    const a = G.turning(pts, k, false);
    const TH = 1.2;
    let count = 0, alternations = 0, lastSign = 0;
    for (let i = k; i < n - k; i++) {
      const v = Math.abs(a[i]);
      if (v < TH) continue;
      let isMax = true;
      for (let j = Math.max(k, i - 2 * k); j <= Math.min(n - k - 1, i + 2 * k); j++) {
        if (j !== i && Math.abs(a[j]) > v) { isMax = false; break; }
      }
      if (!isMax) continue;
      count++;
      const sg = Math.sign(a[i]);
      if (lastSign && sg !== lastSign) alternations++;
      lastSign = sg;
      i += 2 * k;
    }
    return { count, alternations };
  }

  function classifyClosed(ring) {
    const hull = G.convexHull(ring);
    const hullArea = Math.abs(G.polygonArea(hull));
    if (hullArea <= 0) return { shape: 'blob', solidity: 0 };
    const solidity = Math.abs(G.polygonArea(ring)) / hullArea;
    const rectFill = hullArea / Math.max(1e-6, G.minAreaRect(hull).area);
    const triFill = G.maxTriangleArea(hull) / hullArea;
    const per = G.pathLength(hull, true);
    const thinness = (per * per) / hullArea; // 4π for a circle, 16 square, ~20.8 triangle
    let shape = 'blob';
    if (solidity < 0.72) shape = 'blob';
    else if (triFill > 0.78) shape = 'triangle';
    else if (rectFill > 0.87) shape = 'square';
    else if (rectFill > 0.7 && thinness < 16.5) shape = 'circle';
    return { shape, solidity, rectFill, triFill, thinness };
  }

  /**
   * @param raw  array of {x, y, p}
   * @param opts {S: short side of the drawing world in px}
   */
  function analyze(raw, opts) {
    const Sx = (opts && opts.S) || 800;
    const pts = dedupe(raw);
    const L = G.pathLength(pts);
    const bb = G.bbox(pts);
    const diag = Math.hypot(bb.w, bb.h);
    const c = G.centroid(pts);
    const out = {
      kind: 'curve', shape: null, closed: false,
      L, diag, cx: c.x, cy: c.y, jag: 0,
      pressure: avgPressure(pts), points: pts,
    };

    const dotSize = Math.max(14, 0.03 * Sx);
    if (pts.length < 2 || (diag < dotSize && L < dotSize * 2.5)) {
      out.kind = 'dot';
      return out;
    }

    // Closed? The path must come back near its start after at least 55% of its length.
    const N = 64;
    const rs = G.resample(pts, N);
    let bestJ = -1, bestD = Infinity;
    for (let j = Math.floor(N * 0.55); j < N; j++) {
      const d = G.dist(rs[j], rs[0]);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestD < Math.max(12, 0.22 * diag)) {
      const ringPts = G.trimToFraction(pts, bestJ / (N - 1));
      const ring = G.resampleClosed(ringPts, N);
      const area = G.polygonArea(ring);
      const cls = classifyClosed(ring);
      if (cls.solidity > 0.45) {
        const cc = G.polygonCentroid(ring);
        let r = 0;
        for (const p of ring) r += G.dist(p, cc);
        r /= ring.length;
        return Object.assign(out, {
          kind: 'closed', closed: true, shape: cls.shape, metrics: cls,
          ring, ringPts, cx: cc.x, cy: cc.y, r, dir: area >= 0 ? 1 : -1,
        });
      }
    }

    // Open stroke.
    const fine = G.resampleSpacing(pts, 5, 600);
    const corners = sharpCorners(fine);
    const t1 = G.turning(fine, 1, false);
    let net = 0;
    for (let i = 0; i < t1.length; i++) net += t1[i];
    const straight = G.dist(pts[0], pts[pts.length - 1]) / Math.max(L, 1e-6);
    out.corners = corners.count;
    out.net = net;
    out.jag = G.clamp((corners.count - 1) / 6, 0, 1);
    if (corners.count >= 3 && corners.alternations >= 2) out.kind = 'zigzag';
    else if (Math.abs(net) > 2.2 * Math.PI) out.kind = 'spiral';
    else if (straight > 0.9) out.kind = 'line';
    else out.kind = 'curve';
    return out;
  }

  S.Shapes = { analyze, classifyClosed, sharpCorners };
})(globalThis.SamSo = globalThis.SamSo || {});
