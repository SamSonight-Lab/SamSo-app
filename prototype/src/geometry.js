/* SamSo · geometry helpers. Pure functions, no DOM, so they can be unit-tested
   in Node and ported 1:1 to Swift later. Screen coordinates: y points down. */
(function (S) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const heading = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  function wrapPi(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }

  function pt(x, y, p) {
    return { x, y, p: p == null ? 0.5 : p };
  }

  function lerpPt(a, b, t) {
    return pt(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.p == null ? 0.5 : a.p, b.p == null ? 0.5 : b.p, t));
  }

  function pathLength(pts, closed) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
    return L;
  }

  function bbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    const n = Math.max(1, pts.length);
    return { x: x / n, y: y / n };
  }

  // Resample an open polyline to n points spaced evenly along its length (both ends kept).
  function resample(pts, n) {
    const out = [];
    if (!pts.length) return out;
    const L = pathLength(pts);
    if (L === 0 || pts.length === 1 || n < 2) {
      for (let k = 0; k < Math.max(1, n); k++) out.push(pt(pts[0].x, pts[0].y, pts[0].p));
      return out;
    }
    const step = L / (n - 1);
    out.push(pt(pts[0].x, pts[0].y, pts[0].p));
    let target = step;
    let acc = 0;
    for (let i = 1; i < pts.length && out.length < n - 1; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = dist(a, b);
      while (seg > 0 && acc + seg >= target && out.length < n - 1) {
        out.push(lerpPt(a, b, (target - acc) / seg));
        target += step;
      }
      acc += seg;
    }
    const last = pts[pts.length - 1];
    while (out.length < n) out.push(pt(last.x, last.y, last.p));
    return out;
  }

  // Resample a closed ring to n points (no duplicated end point).
  function resampleClosed(pts, n) {
    if (pts.length < 2) return resample(pts, n);
    const r = resample(pts.concat([pts[0]]), n + 1);
    r.pop();
    return r;
  }

  function resampleSpacing(pts, spacing, maxN) {
    const n = clamp(Math.round(pathLength(pts) / spacing) + 1, 2, maxN || 2000);
    return resample(pts, n);
  }

  // The part of a polyline up to fraction f of its length.
  function trimToFraction(pts, f) {
    const target = pathLength(pts) * f;
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = dist(pts[i - 1], pts[i]);
      if (acc + seg >= target) {
        out.push(lerpPt(pts[i - 1], pts[i], seg > 0 ? (target - acc) / seg : 0));
        return out;
      }
      out.push(pts[i]);
      acc += seg;
    }
    return out;
  }

  // Signed shoelace area. Positive = clockwise on screen (because y points down).
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  function polygonCentroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const cr = p.x * q.y - q.x * p.y;
      a += cr;
      cx += (p.x + q.x) * cr;
      cy += (p.y + q.y) * cr;
    }
    if (Math.abs(a) < 1e-6) return centroid(pts);
    a /= 2;
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  // Andrew's monotone chain.
  function convexHull(pts) {
    const p = pts.map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  // Minimum-area enclosing rectangle via rotating each hull edge onto the x axis.
  function minAreaRect(hull) {
    if (hull.length < 3) return { area: 0, w: 0, h: 0, angle: 0 };
    let best = { area: Infinity, w: 0, h: 0, angle: 0 };
    for (let i = 0; i < hull.length; i++) {
      const ang = heading(hull[i], hull[(i + 1) % hull.length]);
      const c = Math.cos(-ang), s = Math.sin(-ang);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const q of hull) {
        const x = q.x * c - q.y * s, y = q.x * s + q.y * c;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area < best.area) best = { area, w: maxX - minX, h: maxY - minY, angle: ang };
    }
    return best;
  }

  // Area of the largest triangle with corners on the hull (brute force, hull is small).
  function maxTriangleArea(hull) {
    let h = hull;
    if (h.length > 72) {
      const step = h.length / 72;
      h = Array.from({ length: 72 }, (_, i) => hull[Math.floor(i * step)]);
    }
    const n = h.length;
    let best = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ax = h[j].x - h[i].x, ay = h[j].y - h[i].y;
        for (let k = j + 1; k < n; k++) {
          const A = Math.abs(ax * (h[k].y - h[i].y) - (h[k].x - h[i].x) * ay) / 2;
          if (A > best) best = A;
        }
      }
    }
    return best;
  }

  // Signed turning angle at each vertex, arms of k samples. Positive = clockwise on screen.
  function turning(pts, k, closed) {
    const n = pts.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a, c;
      if (closed) {
        a = pts[(i - k + n * 4) % n];
        c = pts[(i + k) % n];
      } else {
        if (i - k < 0 || i + k >= n) continue;
        a = pts[i - k];
        c = pts[i + k];
      }
      const b = pts[i];
      out[i] = wrapPi(heading(b, c) - heading(a, b));
    }
    return out;
  }

  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return dist(p, a);
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  S.Geo = {
    TAU, clamp, lerp, dist, heading, wrapPi, pt, pathLength, bbox, centroid,
    resample, resampleClosed, resampleSpacing, trimToFraction,
    polygonArea, polygonCentroid, convexHull, minAreaRect, maxTriangleArea,
    turning, distToSegment,
  };
})(globalThis.SamSo = globalThis.SamSo || {});
