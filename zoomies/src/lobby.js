const GRID_SIZE = 6;
const PLAYER_COLORS = [0xff4d4d, 0x3d8bff, 0xffd23d, 0x4ddb6a];
const BOT_COLORS = [0xb06bff, 0xff8c2e, 0x35d6c8, 0xff7ac8, 0x9aa3ad];

// A slot holds the gamepad index of the player who joined it.
export const createSlots = () => PLAYER_COLORS.map((color) => ({ color, joined: false, pad: null, assist: false }));

// Applies one frame of presses to the join screen.
// Returns 'hub' or 'start' when a player asks to leave the screen, 'changed' when a slot changed, else null.
export function updateLobby(slots, pads) {
  let outcome = null;
  const change = (slot, fields) => {
    Object.assign(slot, fields);
    outcome = 'changed';
  };
  for (const slot of slots) {
    if (slot.joined && !pads.has(slot.pad)) change(slot, { joined: false });
  }
  for (const [index, pad] of pads) {
    const slot = slots.find((s) => s.joined && s.pad === index);
    const free = slots.find((s) => !s.joined);
    if (pad.pressed.y) return 'hub';
    if (slot && pad.pressed.start) return 'start';
    if (slot && pad.pressed.b) change(slot, { joined: false });
    else if (slot && pad.pressed.x) change(slot, { assist: !slot.assist });
    else if (!slot && free && pad.pressed.a) change(free, { joined: true, pad: index, assist: false });
  }
  return outcome;
}

// Lists the racers for the grid: joined players first, then bots of rising skill.
export function entrantsFor(slots) {
  const humans = slots
    .filter((slot) => slot.joined)
    .map((slot) => ({ human: true, name: `P${slots.indexOf(slot) + 1}`, color: slot.color, pad: slot.pad, assist: slot.assist }));
  const bots = BOT_COLORS.slice(0, GRID_SIZE - humans.length).map((color, i) => ({
    human: false,
    name: `Bot ${i + 1}`,
    color,
    skill: 0.86 + 0.03 * i,
  }));
  return [...humans, ...bots];
}
