import { angleDiff } from './track.js';

export const IDLE = { steer: 0, throttle: 0, brake: 0 };

// The vehicle turns on the spot and its travel direction catches up with its heading at the `grip` rate.
// Positive steer turns right.
export function stepVehicle(v, input, handling, dt, { topSpeed = 1, thrust = 1 } = {}) {
  const cap = handling.maxSpeed * topSpeed;
  v.speed += handling.accel * thrust * input.throttle * dt;
  v.speed -= (v.speed > 0 ? handling.brake : handling.accel * 0.6) * input.brake * dt;
  if (!input.throttle && !input.brake) {
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), handling.coast * dt);
  }
  if (v.speed > cap) v.speed = Math.max(cap, v.speed - handling.brake * dt);
  v.speed = Math.max(v.speed, -handling.maxSpeed * 0.3);

  const steerAuthority = Math.min(1, Math.abs(v.speed) / 6) * Math.sign(v.speed);
  v.heading -= input.steer * handling.turnRate * steerAuthority * dt;
  v.slide += angleDiff(v.heading, v.slide) * Math.min(1, handling.grip * dt);
  v.x += Math.sin(v.slide) * v.speed * dt;
  v.z += Math.cos(v.slide) * v.speed * dt;
}
