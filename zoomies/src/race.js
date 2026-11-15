import { IDLE, stepVehicle } from './physics.js';
import { angleDiff, locate, pointAt, wrap, wrapDelta } from './track.js';

export const COUNTDOWN = 3;
const RACER_RADIUS = 1.6;
const PICKUP_RADIUS = 2.8;
const HIT_RADIUS = 2.6;
const BOOST_TOP_SPEED = 1.5;
const BOOST_THRUST = 2;
const CATCH_UP = 0.1;
const BOX_RESPAWN = 4;
const SPIN_TIME = 1.2;
const STRAGGLER_GRACE = 30;
// A racer against the wall turns to face along the track at this rate, per second.
const WALL_TURN = 3;

const BOX_ROWS = [0.12, 0.37, 0.62, 0.87];
const PAD_SPOTS = [0.25, 0.5, 0.75];

export function createRace({ track, level, entrants, laps = 3, rng = Math.random }) {
  const racers = entrants.map((entrant, id) => {
    const s = track.n - 6 - Math.floor(id / 2) * 5;
    const lane = (id % 2 ? -1 : 1) * level.halfWidth * 0.45;
    const start = pointAt(track, s, lane);
    return {
      id,
      skill: 1,
      ...entrant,
      x: start.x,
      z: start.z,
      heading: start.heading,
      slide: start.heading,
      speed: 0,
      index: wrap(s, track.n),
      s: wrap(s, track.n),
      // `dist` counts samples travelled since the start line. It is negative on the grid.
      dist: s - track.n,
      offset: lane,
      lane: lane + (rng() - 0.5) * 4,
      offroad: false,
      place: id + 1,
      finished: false,
      finishTime: null,
      item: null,
      itemHeld: 0,
      useDelay: 1 + rng() * 3,
      boost: 0,
      shield: 0,
      spin: 0,
    };
  });

  const boxes = BOX_ROWS.flatMap((fraction) =>
    [-0.6, -0.2, 0.2, 0.6].map((across) => {
      const p = pointAt(track, fraction * track.n, across * level.halfWidth);
      return { x: p.x, z: p.z, s: fraction * track.n, respawn: 0 };
    }),
  );
  return {
    track,
    level,
    laps,
    rng,
    racers,
    boxes,
    pads: padsFor(track, level),
    goo: [],
    balls: [],
    phase: 'countdown',
    countdown: COUNTDOWN,
    time: 0,
    firstHumanFinish: null,
    events: [],
  };
}

export const padsFor = (track, level) =>
  PAD_SPOTS.map((fraction, i) => ({ s: fraction * track.n, offset: (i % 2 ? -1 : 1) * level.halfWidth * 0.4 }));

export const lapOf = (race, racer) => Math.min(race.laps, Math.max(1, Math.floor(racer.dist / race.track.n) + 1));

const near = (a, b, radius) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < radius ** 2;

function rollItem(race, racer) {
  const behind = race.racers.length > 1 ? (racer.place - 1) / (race.racers.length - 1) : 0;
  const weights = { turbo: 1 + 2 * behind, ball: 0.5 + 1.5 * behind, shield: 1, goo: 1.5 - behind };
  let roll = race.rng() * Object.values(weights).reduce((a, b) => a + b);
  for (const [item, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return 'turbo';
}

function hit(race, racer) {
  if (racer.shield > 0) {
    racer.shield = 0;
    race.events.push({ type: 'block', racer });
    return;
  }
  racer.spin = SPIN_TIME;
  racer.speed *= 0.4;
  race.events.push({ type: 'hit', racer });
}

function useItem(race, racer) {
  const item = racer.item;
  racer.item = null;
  if (item === 'turbo') racer.boost = 2.5;
  if (item === 'shield') racer.shield = 6;
  if (item === 'goo') {
    race.goo.push({
      x: racer.x - Math.sin(racer.heading) * 4,
      z: racer.z - Math.cos(racer.heading) * 4,
      s: racer.s,
      ttl: 25,
    });
  }
  if (item === 'ball') race.balls.push({ owner: racer.id, s: racer.s + 2, offset: racer.offset, ttl: 6 });
  race.events.push({ type: 'use', racer, item });
}

function moveRacer(race, racer, input, dt) {
  const { track, level } = race;
  for (const timer of ['boost', 'shield', 'spin']) racer[timer] = Math.max(0, racer[timer] - dt);

  if (input.reset && !racer.finished) {
    const centre = pointAt(track, racer.s);
    Object.assign(racer, { x: centre.x, z: centre.z, heading: centre.heading, slide: centre.heading, speed: 0 });
  }

  const catchUp = race.racers.length > 1 ? (CATCH_UP * (racer.place - 1)) / (race.racers.length - 1) : 0;
  const boosting = racer.boost > 0;
  const topSpeed = racer.skill * (1 + catchUp) * (boosting ? BOOST_TOP_SPEED : 1) * (racer.offroad ? level.offroad : 1);
  stepVehicle(racer, racer.spin > 0 ? IDLE : input, level.handling, dt, { topSpeed, thrust: boosting ? BOOST_THRUST : 1 });

  let spot = locate(track, racer.x, racer.z, racer.index);
  const limit = level.halfWidth + level.shoulder;
  if (Math.abs(spot.offset) > limit) {
    const excess = spot.offset - Math.sign(spot.offset) * limit;
    const t = track.tan[spot.index];
    racer.x -= t.z * excess;
    racer.z += t.x * excess;
    racer.speed *= 1 - Math.min(1, 1.5 * dt);
    const along = Math.atan2(t.x, t.z);
    racer.heading += angleDiff(along, racer.heading) * Math.min(1, WALL_TURN * dt);
    racer.slide += angleDiff(along, racer.slide) * Math.min(1, WALL_TURN * dt);
    spot = locate(track, racer.x, racer.z, spot.index);
  }
  racer.dist += wrapDelta(spot.s - racer.s, track.n);
  racer.index = spot.index;
  racer.s = spot.s;
  racer.offset = spot.offset;
  racer.offroad = Math.abs(spot.offset) > level.halfWidth;
}

function collect(race, racer, input, dt) {
  const { track } = race;
  for (const pad of race.pads) {
    if (Math.abs(wrapDelta(racer.s - pad.s, track.n)) < 3 && Math.abs(racer.offset - pad.offset) < 3) {
      if (racer.boost < 0.5) race.events.push({ type: 'pad', racer });
      racer.boost = Math.max(racer.boost, 1.2);
    }
  }
  for (const box of race.boxes) {
    if (box.respawn <= 0 && racer.item === null && near(racer, box, PICKUP_RADIUS)) {
      box.respawn = BOX_RESPAWN;
      racer.item = rollItem(race, racer);
      racer.itemHeld = 0;
      race.events.push({ type: 'pickup', racer });
    }
  }
  if (racer.item !== null) {
    racer.itemHeld += dt;
    if (input.use && racer.spin <= 0) useItem(race, racer);
  }
}

function separate(racers) {
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= RACER_RADIUS * 2 || d === 0) continue;
      const push = (RACER_RADIUS * 2 - d) / 2 / d;
      a.x -= dx * push;
      a.z -= dz * push;
      b.x += dx * push;
      b.z += dz * push;
    }
  }
}

function moveHazards(race, dt) {
  const { track, level } = race;
  race.goo = race.goo.filter((goo) => {
    goo.ttl -= dt;
    const victim = race.racers.find((r) => r.spin <= 0 && near(r, goo, HIT_RADIUS));
    if (victim) hit(race, victim);
    return !victim && goo.ttl > 0;
  });
  race.balls = race.balls.filter((ball) => {
    ball.ttl -= dt;
    ball.s += (level.handling.maxSpeed * 1.8 * dt) / track.spacing;
    const others = race.racers.filter((r) => r.id !== ball.owner);
    const ahead = (r) => wrapDelta(r.s - ball.s, track.n);
    const target = others.filter((r) => ahead(r) > 0 && ahead(r) < 60).sort((a, b) => ahead(a) - ahead(b))[0];
    if (target) ball.offset += Math.max(-20 * dt, Math.min(20 * dt, target.offset - ball.offset));
    Object.assign(ball, pointAt(track, ball.s, ball.offset));
    const victim = others.find((r) => near(r, ball, HIT_RADIUS));
    if (victim) hit(race, victim);
    return !victim && ball.ttl > 0;
  });
}

function rank(race) {
  const order = [...race.racers].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return a.finished ? a.finishTime - b.finishTime : b.dist - a.dist;
  });
  order.forEach((racer, i) => (racer.place = i + 1));
}

// `inputs[id]` is { steer, throttle, brake, use, reset } for each racer.
export function stepRace(race, inputs, dt) {
  race.events = [];
  if (race.phase === 'countdown') {
    const before = Math.ceil(race.countdown);
    race.countdown -= dt;
    if (race.countdown <= 0) {
      race.phase = 'racing';
      race.events.push({ type: 'go' });
    } else if (Math.ceil(race.countdown) < before) {
      race.events.push({ type: 'tick' });
    }
    return;
  }

  race.time += dt;
  for (const box of race.boxes) box.respawn -= dt;
  for (const racer of race.racers) {
    const input = inputs[racer.id] ?? IDLE;
    moveRacer(race, racer, input, dt);
    collect(race, racer, input, dt);
  }
  separate(race.racers);
  moveHazards(race, dt);

  for (const racer of race.racers) {
    if (!racer.finished && racer.dist >= race.laps * race.track.n) {
      racer.finished = true;
      racer.finishTime = race.time;
      race.events.push({ type: 'finish', racer });
      if (racer.human) race.firstHumanFinish ??= race.time;
    }
  }
  rank(race);

  const humans = race.racers.filter((r) => r.human);
  const awaited = humans.length ? humans : race.racers;
  const waitedEnough = race.firstHumanFinish !== null && race.time - race.firstHumanFinish > STRAGGLER_GRACE;
  if (awaited.every((r) => r.finished) || waitedEnough) race.phase = 'finished';
}
