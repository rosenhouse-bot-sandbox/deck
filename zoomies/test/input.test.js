import { describe, expect, it } from 'vitest';
import { createPads, readPad } from '../src/input.js';
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

  it('reports a press once, until the button is released', () => {
    const first = readPad(gamepad({ buttons: { 2: 1 } }));
    expect(first.pressed.x).toBe(true);
    const second = readPad(gamepad({ buttons: { 2: 1 } }), first);
    expect(second.pressed.x).toBe(false);
    const third = readPad(gamepad(), second);
    expect(readPad(gamepad({ buttons: { 5: 1 } }), third).pressed.x).toBe(true);
  });

  it('treats a flick of the stick as a d-pad press in menus', () => {
    expect(readPad(gamepad({ axes: [-0.9, 0] })).pressed.left).toBe(true);
    expect(readPad(gamepad({ axes: [0, 0.9] })).pressed.down).toBe(true);
  });
});

describe('createPads', () => {
  it('polls connected pads by index and remembers what was held', () => {
    let pads = [null, gamepad({ index: 1, buttons: { 9: 1 } }), { index: 2, connected: false }];
    const reader = createPads(() => pads);
    expect([...reader.poll().keys()]).toEqual([1]);
    expect(reader.poll().get(1).pressed.start).toBe(false);
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
