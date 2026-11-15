// These are the button indices of the standard Gamepad API mapping, as an Xbox pad reports them.
const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };
const DEADZONE = 0.15;
const TRIGGER_DEADZONE = 0.05;
const STICK_AS_DPAD = 0.6;

function held(gamepad) {
  const down = (name) => Boolean(gamepad.buttons[BUTTON[name]]?.pressed);
  const stickX = gamepad.axes[0] ?? 0;
  const stickY = gamepad.axes[1] ?? 0;
  return {
    a: down('a'),
    b: down('b'),
    x: down('x') || down('lb') || down('rb'),
    y: down('y'),
    start: down('start'),
    left: down('left') || stickX < -STICK_AS_DPAD,
    right: down('right') || stickX > STICK_AS_DPAD,
    up: down('up') || stickY < -STICK_AS_DPAD,
    down: down('down') || stickY > STICK_AS_DPAD,
  };
}

// `pressed` holds the buttons that went down since `previous`.
export function readPad(gamepad, previous = null) {
  const now = held(gamepad);
  const pressed = {};
  for (const name of Object.keys(now)) pressed[name] = now[name] && !previous?.held[name];
  const stick = gamepad.axes[0] ?? 0;
  const dpad = (now.right ? 1 : 0) - (now.left ? 1 : 0);
  const trigger = (name) => {
    const value = gamepad.buttons[BUTTON[name]]?.value ?? 0;
    return value < TRIGGER_DEADZONE ? 0 : value;
  };
  return {
    held: now,
    pressed,
    steer: Math.abs(stick) < DEADZONE ? dpad : Math.max(-1, Math.min(1, stick)),
    throttle: Math.max(trigger('rt'), now.a ? 1 : 0),
    brake: Math.max(trigger('lt'), now.b ? 1 : 0),
  };
}

// Wraps a screen's `update(pads, dt)` so that it ignores input for its first `seconds`.
export function after(seconds, update) {
  let shown = 0;
  return (pads, dt) => {
    shown += dt;
    if (shown > seconds) update(pads, dt);
  };
}

export function createPads(getGamepads = () => navigator.getGamepads()) {
  let previous = new Map();
  return {
    // Returns the state of each connected pad, keyed by its index.
    poll() {
      const pads = new Map();
      for (const gamepad of getGamepads()) {
        if (gamepad?.connected) pads.set(gamepad.index, readPad(gamepad, previous.get(gamepad.index)));
      }
      previous = pads;
      return pads;
    },
    rumble(index, strength = 0.7, duration = 250) {
      getGamepads()
        [index]?.vibrationActuator?.playEffect?.('dual-rumble', {
          duration,
          strongMagnitude: strength,
          weakMagnitude: strength,
        })
        ?.catch(() => {});
    },
  };
}
