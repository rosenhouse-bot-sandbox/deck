import { angleDiff, pointAt } from './track.js';

const LOOKAHEAD = 14;

// Aims the direction of travel at a point further down the track, in the racer's preferred lane.
export function botInput(racer, track) {
  const target = pointAt(track, racer.s + LOOKAHEAD, racer.lane);
  const wanted = Math.atan2(target.x - racer.x, target.z - racer.z);
  const error = angleDiff(wanted, racer.slide);
  return {
    steer: Math.max(-1, Math.min(1, -error * 2.5)),
    throttle: Math.abs(error) > 0.5 ? 0.3 : 1,
    brake: 0,
    use: racer.item !== null && racer.itemHeld > racer.useDelay,
  };
}

// Steering help for small kids: the bot steers unless the player insists.
export function assisted(input, bot) {
  const insistence = Math.min(1, Math.abs(input.steer) * 1.5);
  return { ...input, steer: input.steer * insistence + bot.steer * (1 - insistence) };
}
