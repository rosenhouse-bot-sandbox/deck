import { assisted, botInput } from './ai.js';
import { stepRace } from './race.js';

export const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

// Returns `advance(pads, dt)`, which runs the race in fixed steps for a frame and returns its events.
// `pads` maps a gamepad index to its state. The bot drives a racer whose pad is missing.
export function createDriver(race) {
  let carry = 0;
  // A press waits here until a step uses it, since a short frame may run no step.
  const pressed = new Map();

  return (pads, dt) => {
    for (const racer of race.racers) {
      const pad = pads.get(racer.pad);
      if (!pad) continue;
      const waiting = pressed.get(racer.id) ?? {};
      pressed.set(racer.id, { use: waiting.use || pad.pressed.x, reset: waiting.reset || pad.pressed.y });
    }

    const events = [];
    carry = Math.min(carry + dt, STEP * MAX_STEPS_PER_FRAME);
    for (; carry >= STEP && race.phase !== 'finished'; carry -= STEP) {
      const inputs = {};
      for (const racer of race.racers) {
        const pad = racer.human && !racer.finished ? pads.get(racer.pad) : undefined;
        if (!pad) {
          inputs[racer.id] = botInput(racer, race.track);
          continue;
        }
        const input = { steer: pad.steer, throttle: pad.throttle, brake: pad.brake, ...pressed.get(racer.id) };
        inputs[racer.id] = racer.assist ? assisted(input, botInput(racer, race.track)) : input;
      }
      pressed.clear();
      stepRace(race, inputs, STEP);
      events.push(...race.events);
    }
    return events;
  };
}
