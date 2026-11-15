import { describe, expect, it } from 'vitest';
import { buildTrack, locate, pointAt, wrapDelta } from '../src/track.js';
import { LEVELS, trackFor } from '../src/levels.js';

const circle = (radius, count = 16) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: 0, z: Math.sin(a) * radius };
  });

describe('buildTrack', () => {
  const track = buildTrack(circle(100), 200);

  it('spaces samples evenly around the loop', () => {
    expect(track.length).toBeCloseTo(2 * Math.PI * 100, -1);
    for (let i = 0; i < track.n; i++) {
      const a = track.pos[i];
      const b = track.pos[(i + 1) % track.n];
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(track.spacing, 1);
    }
  });

  it('locates a point by distance along and left of the centre line', () => {
    const inside = pointAt(track, 50.5, 4);
    const spot = locate(track, inside.x, inside.z);
    expect(spot.s).toBeCloseTo(50.5, 1);
    expect(spot.offset).toBeCloseTo(4, 1);
    // The loop runs counter-clockwise seen from +y, with x to the left: left is outside.
    expect(Math.hypot(inside.x, inside.z)).toBeGreaterThan(100);
  });

  it('searches only near the hint', () => {
    const far = pointAt(track, 150, 0);
    expect(locate(track, far.x, far.z, 10, 5).index).toBeLessThanOrEqual(15);
  });

  it('points along the direction of travel', () => {
    const here = pointAt(track, 20);
    const next = pointAt(track, 21);
    expect(Math.atan2(next.x - here.x, next.z - here.z)).toBeCloseTo(here.heading, 1);
  });
});

describe('wrapDelta', () => {
  it('takes the short way round', () => {
    expect(wrapDelta(598 - 2, 600)).toBe(-4);
    expect(wrapDelta(2 - 598, 600)).toBe(4);
  });
});

describe.each(LEVELS)('$name', (level) => {
  const track = trackFor(level);

  it('has edges that never fold back on themselves', () => {
    const limit = level.halfWidth + level.shoulder;
    for (const side of [-limit, limit]) {
      for (let i = 0; i < track.n; i++) {
        const a = pointAt(track, i, side);
        const b = pointAt(track, i + 1, side);
        const t = track.tan[i];
        expect((b.x - a.x) * t.x + (b.z - a.z) * t.z).toBeGreaterThan(0.2 * track.spacing);
      }
    }
  });

  it('keeps far stretches of track apart', () => {
    const limit = level.halfWidth + level.shoulder;
    for (let i = 0; i < track.n; i += 5) {
      for (let j = i + 60; j < track.n - 60 + i; j += 5) {
        const a = track.pos[i];
        const b = track.pos[j % track.n];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2 * limit);
      }
    }
  });
});
