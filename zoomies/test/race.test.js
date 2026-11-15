import { describe, expect, it } from 'vitest';
import { assisted, botInput } from '../src/ai.js';
import { LEVELS, trackFor } from '../src/levels.js';
import { COUNTDOWN, createRace, lapOf, stepRace } from '../src/race.js';
import { angleDiff, pointAt } from '../src/track.js';

const DT = 1 / 60;
const level = LEVELS[0];
const track = trackFor(level);
const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const GO = { steer: 0, throttle: 1, brake: 0 };

function start(entrants = [{ human: true }], options = {}) {
  const race = createRace({ track, level, entrants, rng: seeded(), ...options });
  for (let i = 0; i <= COUNTDOWN * 60; i++) stepRace(race, {}, DT);
  expect(race.phase).toBe('racing');
  return race;
}

const place = (racer, s, offset = 0) => Object.assign(racer, pointAt(track, s, offset), { index: Math.round(s), s });
const bots = (race) => Object.fromEntries(race.racers.map((r) => [r.id, botInput(r, track)]));
const steps = (race, seconds, inputs = () => ({})) => {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    stepRace(race, inputs(race), DT);
    events.push(...race.events);
  }
  return events;
};

describe('countdown', () => {
  it('holds racers on the grid and ticks once a second', () => {
    const race = createRace({ track, level, entrants: [{ human: true }], rng: seeded() });
    const { x, z } = race.racers[0];
    const events = steps(race, COUNTDOWN - 0.5, () => ({ 0: GO }));
    expect(race.racers[0]).toMatchObject({ x, z, speed: 0 });
    expect(events.map((e) => e.type)).toEqual(['tick', 'tick']);
    expect(steps(race, 1).map((e) => e.type)).toContain('go');
  });
});

describe.each(LEVELS)('bots on $name', (level) => {
  it('finish three laps without leaving the road much', () => {
    const track = trackFor(level);
    const race = createRace({ track, level, entrants: Array(6).fill({ human: false }), rng: seeded() });
    let offroadSteps = 0;
    let total = 0;
    while (!race.racers.every((r) => r.finished) && race.time < 300) {
      stepRace(race, Object.fromEntries(race.racers.map((r) => [r.id, botInput(r, track)])), DT);
      for (const r of race.racers) {
        total++;
        if (r.offroad) offroadSteps++;
      }
    }
    expect(race.racers.every((r) => r.finished)).toBe(true);
    expect(offroadSteps / total).toBeLessThan(0.05);
    expect(race.racers.map((r) => r.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('laps', () => {
  it('counts a lap only for driving the whole way round', () => {
    const race = start();
    const racer = race.racers[0];
    expect(lapOf(race, racer)).toBe(1);
    steps(race, 2, () => ({ 0: GO }));
    expect(racer.dist).toBeGreaterThan(0);
    expect(lapOf(race, racer)).toBe(1);
    racer.heading = racer.slide += Math.PI;
    steps(race, 4, () => ({ 0: GO }));
    expect(racer.dist).toBeLessThan(0);
    expect(lapOf(race, racer)).toBe(1);
  });

  it('shows the lap being driven, up to the last one', () => {
    const race = start();
    const racer = race.racers[0];
    racer.dist = track.n + 5;
    expect(lapOf(race, racer)).toBe(2);
    racer.dist = 3 * track.n + 5;
    expect(lapOf(race, racer)).toBe(3);
  });
});

describe('finishing', () => {
  const nearFinish = (race, racer, samplesToGo) => {
    racer.dist = race.laps * track.n - samplesToGo;
    place(racer, track.n - samplesToGo);
  };

  it('ranks finishers by finish time, ahead of everyone still racing', () => {
    const race = start([{ human: true }, { human: true }, { human: true }], { laps: 1 });
    const [late, early, never] = race.racers;
    nearFinish(race, early, 5);
    nearFinish(race, late, 40);
    steps(race, 4, (r) => ({ 0: botInput(late, track), 1: botInput(early, track) }));
    expect(early.finishTime).toBeLessThan(late.finishTime);
    expect([early.place, late.place, never.place]).toEqual([1, 2, 3]);
  });

  it('does not start the stragglers clock when a bot finishes', () => {
    const race = start([{ human: true }, { human: false }], { laps: 1 });
    nearFinish(race, race.racers[1], 5);
    steps(race, 32, (r) => ({ 1: botInput(r.racers[1], track) }));
    expect(race.racers[1].finished).toBe(true);
    expect(race.phase).toBe('racing');
  });

  it('ends a race without humans when every bot has finished', () => {
    const race = start([{ human: false }, { human: false }], { laps: 1 });
    nearFinish(race, race.racers[0], 5);
    steps(race, 2, bots);
    expect(race.phase).toBe('racing');
    nearFinish(race, race.racers[1], 5);
    steps(race, 2, bots);
    expect(race.phase).toBe('finished');
  });

  it('finishes the race when every human has finished', () => {
    const race = start([{ human: true }, { human: false }], { laps: 1 });
    race.racers[0].dist = track.n - 5;
    place(race.racers[0], track.n - 5);
    const events = steps(race, 2, bots);
    expect(events.find((e) => e.type === 'finish').racer.id).toBe(0);
    expect(race.racers[0]).toMatchObject({ finished: true, place: 1 });
    expect(race.phase).toBe('finished');
  });

  it('gives stragglers 30 seconds after the first human finishes', () => {
    const race = start([{ human: true }, { human: true }], { laps: 1 });
    race.racers[0].dist = track.n - 5;
    place(race.racers[0], track.n - 5);
    steps(race, 29, () => ({ 0: GO }));
    expect(race.phase).toBe('racing');
    steps(race, 3, () => ({ 0: GO }));
    expect(race.phase).toBe('finished');
    expect(race.racers[1]).toMatchObject({ finished: false, place: 2 });
  });
});

describe('road', () => {
  it('slows racers off the road and walls them in at the shoulder', () => {
    const race = start();
    const racer = race.racers[0];
    racer.heading = racer.slide += Math.PI / 2;
    steps(race, 6, () => ({ 0: GO }));
    expect(racer.offroad).toBe(true);
    expect(Math.abs(racer.offset)).toBeLessThanOrEqual(level.halfWidth + level.shoulder + 0.01);
    // Scraping the wall costs more speed than the rough ground alone.
    expect(racer.speed).toBeLessThan(level.handling.maxSpeed * level.offroad * 0.8);
  });

  it('turns a racer who hits the wall along the track, so nobody gets stuck', () => {
    const race = start();
    const racer = race.racers[0];
    racer.heading = racer.slide += Math.PI / 2;
    steps(race, 4, () => ({ 0: GO }));
    const { dist } = racer;
    steps(race, 4, () => ({ 0: GO }));
    expect(racer.dist - dist).toBeGreaterThan(20);
    expect(Math.abs(angleDiff(racer.heading, pointAt(track, racer.s).heading))).toBeLessThan(0.3);
  });

  it('slows racers on the shoulder to the off-road top speed', () => {
    const race = start();
    const racer = race.racers[0];
    place(racer, 100, level.halfWidth + 3);
    Object.assign(racer, { slide: racer.heading, speed: level.handling.maxSpeed * level.offroad + 10 });
    steps(race, 0.5, () => ({ 0: GO }));
    expect(Math.abs(racer.offset)).toBeLessThan(level.halfWidth + level.shoulder - 1);
    expect(racer.speed).toBeCloseTo(level.handling.maxSpeed * level.offroad, 0);
  });

  it('leaves a racer without input to coast to a stop', () => {
    const race = start();
    race.racers[0].speed = 5;
    steps(race, 1);
    expect(race.racers[0].speed).toBe(0);
  });

  it('puts a racer back on the centre line on reset', () => {
    const race = start();
    const racer = race.racers[0];
    place(racer, 100, level.halfWidth + 5);
    racer.heading = 1;
    racer.speed = 20;
    const reset = { 0: { steer: 0, throttle: 0, brake: 0, reset: true } };
    stepRace(race, reset, DT);
    expect(racer.offset).toBeCloseTo(0, 1);
    expect(racer.heading).toBeCloseTo(pointAt(track, racer.s).heading, 1);
    expect(racer.speed).toBe(0);

    place(racer, 100, 5);
    racer.finished = true;
    stepRace(race, reset, DT);
    expect(racer.offset).toBeCloseTo(5, 1);
  });

  it('pushes overlapping racers apart', () => {
    const race = start([{ human: true }, { human: true }]);
    place(race.racers[0], 100, 0);
    place(race.racers[1], 100, 1);
    stepRace(race, {}, DT);
    const [a, b] = race.racers;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(3.2);
  });

  it('lets the racer in last place go faster than the leader', () => {
    const race = start([{ human: true }, { human: true }]);
    place(race.racers[0], 60);
    race.racers[0].dist = 60;
    place(race.racers[1], 20);
    race.racers[1].dist = 20;
    steps(race, 4, bots);
    expect(race.racers[0].speed).toBeCloseTo(level.handling.maxSpeed, 1);
    expect(race.racers[1].speed).toBeCloseTo(level.handling.maxSpeed * 1.1, 1);
  });
});

describe('power-ups', () => {
  const onBox = (race, racer) => {
    const box = race.boxes[0];
    Object.assign(racer, { x: box.x, z: box.z, index: Math.round(box.s), s: box.s });
    return box;
  };

  it('hands out an item from a box, which then takes time to come back', () => {
    const race = start([{ human: true }, { human: true }]);
    const [first, second] = race.racers;
    onBox(race, first);
    stepRace(race, {}, DT);
    expect(race.events).toEqual([{ type: 'pickup', racer: first }]);
    expect(['turbo', 'shield', 'goo', 'ball']).toContain(first.item);
    const held = first.item;
    place(first, 300);
    onBox(race, second);
    stepRace(race, {}, DT);
    expect(second.item).toBeNull();
    steps(race, 3.5);
    onBox(race, second);
    stepRace(race, {}, DT);
    expect(second.item).toBeNull();
    steps(race, 0.5);
    onBox(race, second);
    stepRace(race, {}, DT);
    expect(second.item).not.toBeNull();
    expect(first.item).toBe(held);
  });

  it('boosts on turbo', () => {
    const race = start();
    const racer = race.racers[0];
    racer.item = 'turbo';
    steps(race, 2, (r) => ({ 0: { ...bots(r)[0], use: true } }));
    expect(racer.item).toBeNull();
    expect(racer.speed).toBeGreaterThan(level.handling.maxSpeed * 1.2);
    steps(race, 3, bots);
    expect(racer.speed).toBeCloseTo(level.handling.maxSpeed);
  });

  it('boosts on a boost pad', () => {
    const race = start();
    const racer = race.racers[0];
    place(racer, race.pads[0].s, race.pads[0].offset);
    stepRace(race, {}, DT);
    expect(racer.boost).toBeGreaterThan(1);
    expect(race.events).toEqual([{ type: 'pad', racer }]);
    stepRace(race, {}, DT);
    expect(race.events).toEqual([]);
  });

  it('cannot use an item while spinning out', () => {
    const race = start();
    const racer = race.racers[0];
    Object.assign(racer, { item: 'turbo', spin: 1 });
    steps(race, 0.5, () => ({ 0: { ...GO, use: true } }));
    expect(racer.item).toBe('turbo');
    steps(race, 1, () => ({ 0: { ...GO, use: true } }));
    expect(racer.item).toBeNull();
  });

  it('wears a shield for six seconds', () => {
    const race = start();
    const racer = race.racers[0];
    racer.item = 'shield';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    expect(race.events).toEqual([{ type: 'use', racer, item: 'shield' }]);
    steps(race, 5.5);
    expect(racer.shield).toBeGreaterThan(0);
    steps(race, 1);
    expect(racer.shield).toBe(0);
  });

  it('dries up goo after 25 seconds', () => {
    const race = start();
    const racer = race.racers[0];
    place(racer, 100);
    racer.item = 'goo';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    place(racer, 300);
    steps(race, 24);
    expect(race.goo).toHaveLength(1);
    steps(race, 2);
    expect(race.goo).toHaveLength(0);
  });

  it('lets a ball that finds nobody roll away after six seconds, sparing its thrower', () => {
    const race = start();
    const racer = race.racers[0];
    place(racer, 100);
    racer.item = 'ball';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    const launched = race.balls[0].s;
    steps(race, 5);
    expect(race.balls[0].s - launched).toBeCloseTo((level.handling.maxSpeed * 1.8 * 5) / track.spacing, 0);
    steps(race, 1.5);
    expect(race.balls).toHaveLength(0);
    expect(racer.spin).toBe(0);
  });

  it('spins out whoever drives into goo, but not through a shield', () => {
    const race = start([{ human: true }, { human: true }, { human: true }]);
    const [dropper, victim, shielded] = race.racers;
    place(dropper, 100);
    dropper.item = 'goo';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    expect(race.goo).toHaveLength(1);
    expect(dropper.spin).toBe(0);

    Object.assign(victim, { x: race.goo[0].x, z: race.goo[0].z, index: 100, speed: 20 });
    stepRace(race, {}, DT);
    expect(race.events).toEqual([{ type: 'hit', racer: victim }]);
    expect(victim.spin).toBeGreaterThan(1.1);
    expect(race.goo).toHaveLength(0);
    const { heading } = victim;
    steps(race, 0.5, () => ({ 1: { ...GO, steer: 1 } }));
    expect(victim.heading).toBe(heading);

    place(dropper, 200);
    dropper.item = 'goo';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    shielded.item = 'shield';
    stepRace(race, { 2: { ...GO, use: true } }, DT);
    Object.assign(shielded, { x: race.goo[0].x, z: race.goo[0].z, index: 200 });
    stepRace(race, {}, DT);
    expect(race.events).toEqual([{ type: 'block', racer: shielded }]);
    expect(shielded).toMatchObject({ spin: 0, shield: 0 });
    expect(race.goo).toHaveLength(0);
  });

  it('rolls a ball up the track into the racer ahead', () => {
    const race = start([{ human: true }, { human: true }]);
    const [thrower, target] = race.racers;
    place(thrower, 100, -5);
    place(target, 130, 6);
    thrower.item = 'ball';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    expect(race.balls).toHaveLength(1);
    const events = steps(race, 3);
    expect(events.find((e) => e.type === 'hit').racer).toBe(target);
    expect(thrower.spin).toBe(0);
    expect(race.balls).toHaveLength(0);
  });

  it('aims a ball only at racers ahead of it', () => {
    const race = start([{ human: true }, { human: true }]);
    const [thrower, behind] = race.racers;
    place(thrower, 100, 0);
    place(behind, 90, 8);
    thrower.item = 'ball';
    stepRace(race, { 0: { ...GO, use: true } }, DT);
    stepRace(race, {}, DT);
    expect(race.balls[0].offset).toBeCloseTo(0, 1);
  });

  it('favours turbo for racers at the back', () => {
    const count = (placeOf) => {
      const race = start(Array(6).fill({ human: true }));
      let turbos = 0;
      for (let i = 0; i < 300; i++) {
        const racer = race.racers[0];
        for (const box of race.boxes) box.respawn = 0;
        racer.item = null;
        onBox(race, racer);
        // Ranking runs after collection, so pin the place the roll will see.
        racer.place = placeOf;
        racer.dist = placeOf === 1 ? 1e6 : -1e6;
        stepRace(race, {}, DT);
        if (racer.item === 'turbo') turbos++;
      }
      return turbos;
    };
    expect(count(6)).toBeGreaterThan(count(1) * 1.5);
  });
});

describe('bots', () => {
  it('use an item after holding it a while', () => {
    const race = start([{ human: false }]);
    const racer = race.racers[0];
    racer.item = 'shield';
    steps(race, racer.useDelay - 0.2, bots);
    expect(racer.item).toBe('shield');
    steps(race, 0.5, bots);
    expect(racer.item).toBeNull();
  });

  it('keep to their own lanes', () => {
    const race = start([{ human: false }, { human: false }]);
    const [left, right] = race.racers;
    left.lane = 6;
    right.lane = -6;
    steps(race, 8, bots);
    expect(left.offset).toBeGreaterThan(3);
    expect(right.offset).toBeLessThan(-3);
  });
});

describe('steering help', () => {
  const bot = { steer: -0.8 };
  it('follows the bot when the stick is centred', () => {
    expect(assisted({ steer: 0, throttle: 1 }, bot)).toEqual({ steer: -0.8, throttle: 1 });
  });
  it('yields to a player who steers hard', () => {
    expect(assisted({ steer: 1 }, bot).steer).toBe(1);
    expect(assisted({ steer: 0.7 }, bot).steer).toBe(0.7);
  });
  it('blends with a player who steers gently', () => {
    expect(assisted({ steer: 0.4 }, bot).steer).toBeCloseTo(0.4 * 0.6 - 0.8 * 0.4);
  });
});
