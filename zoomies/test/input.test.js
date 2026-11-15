import { describe, expect, it } from 'vitest';
import { after, createPads, readPad } from '../src/input.js';
import { viewports } from '../src/layout.js';

function gamepad({ buttons = {}, axes = [0, 0], index = 0 } = {}) {
  return {
    index,
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) > 0.5, value: buttons[i] ?? 0 })),
  };
}

describe('readPad', () => {
  it('maps triggers and face buttons to driving', () => {
    expect(readPad(gamepad({ buttons: { 7: 0.6 } })).throttle).toBe(0.6);
    expect(readPad(gamepad({ buttons: { 0: 1 } })).throttle).toBe(1);
    expect(readPad(gamepad({ buttons: { 6: 0.4 } })).brake).toBe(0.4);
    expect(readPad(gamepad({ buttons: { 1: 1 } })).brake).toBe(1);
  });

  it('steers with the stick, ignoring drift, or with the d-pad', () => {
    expect(readPad(gamepad({ axes: [0.5, 0] })).steer).toBe(0.5);
    expect(readPad(gamepad({ axes: [0.1, 0] })).steer).toBe(0);
    expect(readPad(gamepad({ buttons: { 14: 1 } })).steer).toBe(-1);
    expect(readPad(gamepad({ buttons: { 15: 1 } })).steer).toBe(1);
  });

  it('ignores a trigger that does not quite spring back', () => {
    expect(readPad(gamepad({ buttons: { 7: 0.03, 6: 0.03 } }))).toMatchObject({ throttle: 0, brake: 0 });
  });

  it('caps a stick that reports more than full deflection', () => {
    expect(readPad(gamepad({ axes: [1.2, 0] })).steer).toBe(1);
    expect(readPad(gamepad({ axes: [-1.2, 0] })).steer).toBe(-1);
  });

  it('uses a power-up with X or either bumper', () => {
    for (const button of [2, 4, 5]) expect(readPad(gamepad({ buttons: { [button]: 1 } })).pressed.x).toBe(true);
  });

  it('reports a press once, until the button is released', () => {
    const first = readPad(gamepad({ buttons: { 2: 1 } }));
    expect(first.pressed.x).toBe(true);
    const second = readPad(gamepad({ buttons: { 2: 1 } }), first);
    expect(second.pressed.x).toBe(false);
    const third = readPad(gamepad(), second);
    expect(readPad(gamepad({ buttons: { 5: 1 } }), third).pressed.x).toBe(true);
  });

  it('treats a flick of the stick as a d-pad press in menus', () => {
    expect(readPad(gamepad({ axes: [-0.9, 0] })).pressed).toMatchObject({ left: true, right: false });
    expect(readPad(gamepad({ axes: [0.9, 0] })).pressed).toMatchObject({ left: false, right: true });
    expect(readPad(gamepad({ axes: [0, 0.9] })).pressed).toMatchObject({ down: true, up: false });
    expect(readPad(gamepad({ axes: [0, -0.9] })).pressed).toMatchObject({ down: false, up: true });
    expect(readPad(gamepad({ axes: [0.5, 0.5] })).pressed).toMatchObject({ right: false, down: false });
  });
});

describe('after', () => {
  it('ignores input until the screen has been up for a while', () => {
    const seen = [];
    const update = after(1, (pads, dt) => seen.push([pads, dt]));
    update('early', 0.6);
    update('still early', 0.4);
    expect(seen).toEqual([]);
    update('late', 0.1);
    expect(seen).toEqual([['late', 0.1]]);
  });
});

describe('createPads', () => {
  it('polls connected pads by index and remembers what was held', () => {
    const held = gamepad({ index: 1, buttons: { 9: 1 } });
    let pads = [null, held, { index: 2, connected: false }];
    const reader = createPads(() => pads);
    expect([...reader.poll().keys()]).toEqual([1]);
    expect(reader.poll().get(1).pressed.start).toBe(false);

    pads = [];
    reader.poll();
    pads = [null, held];
    expect(reader.poll().get(1).pressed.start).toBe(true);
  });
});

describe('viewports', () => {
  const area = (rects) => rects.reduce((sum, r) => sum + r.w * r.h, 0);

  it('covers the screen for any number of players', () => {
    for (const players of [1, 2, 3, 4]) expect(area(viewports(players))).toBe(1);
  });

  it('stacks two players and quarters four', () => {
    expect(viewports(2)[1]).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
    expect(viewports(4)[3]).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('gives three players an overview in the spare quarter', () => {
    const rects = viewports(3);
    expect(rects.map((r) => Boolean(r.overview))).toEqual([false, false, false, true]);
  });
});
