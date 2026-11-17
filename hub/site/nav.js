// Standard Gamepad API button indices, as an Xbox pad reports them.
export const BUTTON = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };
const STICK = 0.5;

const AXES = {
  left: { near: 'right', far: 'left', sign: -1, across: ['top', 'height'] },
  right: { near: 'left', far: 'right', sign: 1, across: ['top', 'height'] },
  up: { near: 'bottom', far: 'top', sign: -1, across: ['left', 'width'] },
  down: { near: 'top', far: 'bottom', sign: 1, across: ['left', 'width'] },
};
const SUBPIXEL = 1;

const edges = (r) => ({ left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height });

// Returns the index of the nearest box from `boxes[from]` in `dir`, or `from` if there is none.
// Boxes that overlap the current one across the direction win; otherwise distance across counts double.
export function neighbor(boxes, from, dir) {
  const { near, far, sign, across: [start, size] } = AXES[dir];
  const current = boxes[from];
  const middle = (r) => r[start] + r[size] / 2;
  const candidates = boxes
    .map((box, i) => ({
      i,
      gap: (edges(box)[near] - edges(current)[far]) * sign,
      offset: Math.abs(middle(box) - middle(current)),
      aligned: box[start] < current[start] + current[size] && current[start] < box[start] + box[size],
    }))
    .filter((c) => c.i !== from && c.gap >= -SUBPIXEL);
  const aligned = candidates.filter((c) => c.aligned);
  const [best] = aligned.length
    ? aligned.sort((a, b) => a.gap - b.gap || a.offset - b.offset)
    : candidates.sort((a, b) => a.gap + 2 * a.offset - (b.gap + 2 * b.offset));
  return best?.i ?? from;
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
    next = now + interval;
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
