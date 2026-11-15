export const wrap = (i, n) => ((i % n) + n) % n;

// Shortest signed difference on a loop of length n.
export const wrapDelta = (d, n) => wrap(d + n / 2, n) - n / 2;

export const angleDiff = (a, b) => wrapDelta(a - b, Math.PI * 2);

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

// A closed loop through `points`, resampled to `samples` evenly spaced centres.
// Distances along the track are measured in samples.
export function buildTrack(points, samples = 600) {
  const perSegment = 40;
  const dense = [];
  const at = (i) => points[wrap(i, points.length)];
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < perSegment; j++) {
      const point = {};
      for (const axis of ['x', 'y', 'z']) {
        point[axis] = catmullRom(at(i - 1)[axis], at(i)[axis], at(i + 1)[axis], at(i + 2)[axis], j / perSegment);
      }
      dense.push(point);
    }
  }

  const cumulative = [0];
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[dense.length];

  const pos = [];
  let segment = 0;
  for (let i = 0; i < samples; i++) {
    const target = (i / samples) * length;
    while (cumulative[segment + 1] < target) segment++;
    const t = (target - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment]);
    const a = dense[segment];
    const b = dense[(segment + 1) % dense.length];
    pos.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  }

  const tan = pos.map((_, i) => {
    const a = pos[wrap(i - 1, samples)];
    const b = pos[(i + 1) % samples];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
  });

  return { n: samples, pos, tan, length, spacing: length / samples };
}

// Where (x, z) sits relative to the track: `s` is the distance along it,
// `offset` is the distance left of the centre line.
// A `hint` keeps the search local, so nearby stretches of track cannot steal the racer.
export function locate(track, x, z, hint = null, window = 40) {
  let index = -1;
  let nearest = Infinity;
  const consider = (i) => {
    const p = track.pos[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < nearest) {
      nearest = d;
      index = i;
    }
  };
  if (hint === null) {
    for (let i = 0; i < track.n; i++) consider(i);
  } else {
    for (let d = -window; d <= window; d++) consider(wrap(hint + d, track.n));
  }
  const p = track.pos[index];
  const t = track.tan[index];
  const dx = x - p.x;
  const dz = z - p.z;
  return {
    index,
    s: wrap(index + (dx * t.x + dz * t.z) / track.spacing, track.n),
    offset: dx * t.z - dz * t.x,
  };
}

export function pointAt(track, s, offset = 0) {
  const base = Math.floor(s);
  const f = s - base;
  const i = wrap(base, track.n);
  const j = (i + 1) % track.n;
  const a = track.pos[i];
  const b = track.pos[j];
  const tx = track.tan[i].x + (track.tan[j].x - track.tan[i].x) * f;
  const tz = track.tan[i].z + (track.tan[j].z - track.tan[i].z) * f;
  const norm = Math.hypot(tx, tz);
  return {
    x: a.x + (b.x - a.x) * f + (tz / norm) * offset,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f - (tx / norm) * offset,
    heading: Math.atan2(tx, tz),
  };
}
