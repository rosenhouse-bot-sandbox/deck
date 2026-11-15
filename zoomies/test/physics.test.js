import { describe, expect, it } from 'vitest';
import { IDLE, stepVehicle } from '../src/physics.js';

const handling = { maxSpeed: 30, accel: 20, brake: 40, coast: 10, turnRate: 2, grip: 8 };
const car = (over = {}) => ({ x: 0, z: 0, heading: 0, slide: 0, speed: 0, ...over });
const run = (v, input, seconds, factors) => {
  for (let i = 0; i < seconds * 60; i++) stepVehicle(v, { ...IDLE, ...input }, handling, 1 / 60, factors);
  return v;
};

describe('stepVehicle', () => {
  it('accelerates forward up to top speed', () => {
    const v = run(car(), { throttle: 1 }, 5);
    expect(v.speed).toBeCloseTo(30);
    expect(v.z).toBeGreaterThan(100);
    expect(v.x).toBeCloseTo(0);
  });

  it('raises top speed while boosted and sheds it afterwards', () => {
    const v = run(car(), { throttle: 1 }, 5, { topSpeed: 1.5 });
    expect(v.speed).toBeCloseTo(45);
    expect(run(v, { throttle: 1 }, 0.1).speed).toBeCloseTo(43);
    expect(run(v, { throttle: 1 }, 1).speed).toBeCloseTo(30);
  });

  it('accelerates harder with more thrust, whatever the top speed', () => {
    expect(run(car(), { throttle: 1 }, 0.5, { topSpeed: 1.5 }).speed).toBeCloseTo(10);
    expect(run(car(), { throttle: 1 }, 0.5, { thrust: 2 }).speed).toBeCloseTo(20);
  });

  it('coasts to a stop', () => {
    expect(run(car({ speed: 20 }), {}, 3).speed).toBe(0);
  });

  it('brakes, then reverses slowly', () => {
    const v = car({ speed: 20 });
    expect(run(v, { brake: 1 }, 0.5).speed).toBeCloseTo(0);
    expect(run(v, { brake: 1 }, 0.5).speed).toBeCloseTo(-6, 0);
    expect(run(v, { brake: 1 }, 5).speed).toBeCloseTo(-9);
  });

  it('steers the same way on screen when reversing', () => {
    expect(run(car({ speed: -9 }), { brake: 1, steer: 1 }, 0.5).heading).toBeGreaterThan(0);
  });

  it('turns right on positive steer, toward -x', () => {
    const v = run(car({ speed: 20 }), { throttle: 1, steer: 1 }, 0.5);
    expect(v.heading).toBeLessThan(0);
    expect(v.x).toBeLessThan(0);
  });

  it('cannot turn while standing still', () => {
    expect(run(car(), { steer: 1 }, 1).heading).toBe(0);
  });

  it('slides more with less grip', () => {
    const drift = (grip) => {
      const v = car({ speed: 30 });
      for (let i = 0; i < 30; i++) stepVehicle(v, { steer: 1, throttle: 1, brake: 0 }, { ...handling, grip }, 1 / 60);
      return Math.abs(v.heading - v.slide);
    };
    expect(drift(2)).toBeGreaterThan(drift(10) * 2);
  });
});
