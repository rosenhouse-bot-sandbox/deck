import { describe, expect, it } from 'vitest';
import { STEP, createDriver } from '../src/drive.js';
import { LEVELS, trackFor } from '../src/levels.js';
import { COUNTDOWN, createRace } from '../src/race.js';

const level = LEVELS[0];
const track = trackFor(level);
const pad = (over = {}) => ({ steer: 0, throttle: 0, brake: 0, pressed: {}, ...over });

function start(entrant = {}, others = []) {
  const race = createRace({ track, level, entrants: [{ human: true, pad: 0, ...entrant }, ...others], rng: () => 0.5 });
  const advance = createDriver(race);
  for (let i = 0; i <= COUNTDOWN * 60; i++) advance(new Map(), STEP);
  return { race, racer: race.racers[0], advance };
}

describe('createDriver', () => {
  it('runs one step per sixtieth of a second, and at most five a frame', () => {
    const { race, advance } = start();
    const before = race.time;
    advance(new Map(), STEP * 3);
    expect(race.time - before).toBeCloseTo(STEP * 3);
    advance(new Map(), 1);
    expect(race.time - before).toBeCloseTo(STEP * 8);
  });

  it('keeps a press made in a frame too short to run a step', () => {
    const { racer, advance } = start();
    racer.item = 'shield';
    advance(new Map([[0, pad({ pressed: { x: true } })]]), STEP / 2);
    expect(racer.item).toBe('shield');
    advance(new Map([[0, pad()]]), STEP / 2);
    expect(racer.item).toBeNull();
  });

  it('uses a press once in a frame that runs several steps', () => {
    const { race, racer, advance } = start();
    racer.speed = 20;
    advance(new Map([[0, pad({ pressed: { y: true }, throttle: 1 })]]), STEP * 4);
    expect(racer.speed).toBeGreaterThan(0);
    racer.item = 'goo';
    advance(new Map([[0, pad({ pressed: { x: true } })]]), STEP * 4);
    racer.item = 'goo';
    advance(new Map([[0, pad()]]), STEP * 4);
    expect(race.goo).toHaveLength(1);
  });

  it('collects the events of every step', () => {
    const race = createRace({ track, level, entrants: [{ human: true, pad: 0 }] });
    const events = createDriver(race)(new Map(), STEP * 5);
    expect(events).toEqual([]);
    const advance = createDriver(race);
    const all = [];
    for (let i = 0; i < COUNTDOWN * 12 + 1; i++) all.push(...advance(new Map(), STEP * 5));
    expect(all.map((e) => e.type)).toEqual(['tick', 'tick', 'go']);
  });

  it('drives with the pad', () => {
    const { racer, advance } = start();
    const { heading } = racer;
    for (let i = 0; i < 60; i++) advance(new Map([[0, pad({ throttle: 1, steer: 1 })]]), STEP);
    expect(racer.speed).toBeGreaterThan(10);
    expect(racer.heading).toBeLessThan(heading - 0.5);
  });

  it('lets the bot drive when the pad is missing', () => {
    const { race, racer, advance } = start();
    for (let i = 0; i < 60 * 20; i++) advance(new Map(), STEP);
    expect(racer.dist).toBeGreaterThan(race.track.n / 3);
    expect(racer.offroad).toBe(false);
  });

  it('lets the bot drive a human who has finished', () => {
    const { racer, advance } = start({}, [{ human: true, pad: 1 }]);
    racer.finished = true;
    for (let i = 0; i < 60; i++) advance(new Map([[0, pad()]]), STEP);
    expect(racer.speed).toBeGreaterThan(10);
  });

  it('steers for a player with steering help', () => {
    const { race, racer, advance } = start({ assist: true });
    for (let i = 0; i < 60 * 20; i++) advance(new Map([[0, pad({ throttle: 1 })]]), STEP);
    expect(racer.dist).toBeGreaterThan(race.track.n / 3);
    expect(racer.offroad).toBe(false);
  });

  it('does not steer for a player without steering help', () => {
    const { racer, advance } = start();
    for (let i = 0; i < 60 * 20; i++) advance(new Map([[0, pad({ throttle: 1 })]]), STEP);
    expect(racer.offroad).toBe(true);
  });
});
