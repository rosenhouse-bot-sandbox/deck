// Standard Gamepad API button indices, as an Xbox pad reports them.
export const BUTTON = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };
const STICK = 0.5;

const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];

// Returns the index of the closest box from `boxes[from]` in `dir`, or `from` at an edge.
// Distance across the direction counts double, so a box in line wins over a diagonal one.
export function neighbor(boxes, from, dir) {
  const [x0, y0] = center(boxes[from]);
  const [ax, sign] = { left: [0, -1], right: [0, 1], up: [1, -1], down: [1, 1] }[dir];
  let best = from;
  let bestScore = Infinity;
  boxes.forEach((box, i) => {
    const d = center(box).map((v, k) => v - [x0, y0][k]);
    const along = d[ax] * sign;
    if (along <= 1) return;
    const score = along + 2 * Math.abs(d[1 - ax]);
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

export function direction(gamepad) {
  const down = (name) => Boolean(gamepad.buttons[BUTTON[name]]?.pressed);
  for (const name of ['up', 'down', 'left', 'right']) if (down(name)) return name;
  const [x = 0, y = 0] = gamepad.axes;
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

// Turns a held direction into moves: one at once, then one per `interval` after `delay`.
export function createRepeat({ delay = 350, interval = 110 } = {}) {
  let held = null;
  let next = 0;
  return (dir, now) => {
    if (dir !== held) {
      held = dir;
      next = now + delay;
      return dir;
    }
    if (dir === null || now < next) return null;
    next += interval;
    return dir;
  };
}

// Returns the buttons pressed since the last call. A button already down on the first call
// counts only after it is released, so a press that left the previous page does nothing here.
export function createButtons() {
  let previous = null;
  return (gamepad) => {
    const now = gamepad.buttons.map((b) => Boolean(b?.pressed));
    const was = previous ?? now;
    previous = now;
    return now.flatMap((down, i) => (down && !was[i] ? [i] : []));
  };
}
