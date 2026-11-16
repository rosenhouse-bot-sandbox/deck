import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createButtons, createRepeat, direction, neighbor } from '../site/nav.js';

// Two rows: three cards, then one under the first.
const box = (x, y) => ({ left: x, top: y, width: 100, height: 60 });
const GRID = [box(0, 0), box(120, 0), box(240, 0), box(0, 80)];

test('neighbor moves along a row and between rows', () => {
  assert.equal(neighbor(GRID, 0, 'right'), 1);
  assert.equal(neighbor(GRID, 1, 'left'), 0);
  assert.equal(neighbor(GRID, 0, 'down'), 3);
  assert.equal(neighbor(GRID, 3, 'up'), 0);
});

test('neighbor prefers the card in line over a nearer diagonal one', () => {
  assert.equal(neighbor(GRID, 2, 'down'), 3);
  assert.equal(neighbor(GRID, 3, 'right'), 1);
});

test('neighbor stays put at an edge', () => {
  assert.equal(neighbor(GRID, 2, 'right'), 2);
  assert.equal(neighbor(GRID, 0, 'up'), 0);
  assert.equal(neighbor(GRID, 3, 'down'), 3);
});

const pad = ({ buttons = [], axes = [0, 0] } = {}) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
});

test('direction reads the d-pad and the left stick', () => {
  assert.equal(direction(pad()), null);
  assert.equal(direction(pad({ buttons: [12] })), 'up');
  assert.equal(direction(pad({ buttons: [13] })), 'down');
  assert.equal(direction(pad({ buttons: [14] })), 'left');
  assert.equal(direction(pad({ buttons: [15] })), 'right');
  assert.equal(direction(pad({ axes: [0.9, 0.2] })), 'right');
  assert.equal(direction(pad({ axes: [-0.2, -0.9] })), 'up');
  assert.equal(direction(pad({ axes: [0.3, 0.3] })), null);
});

test('repeat moves once, waits, then moves steadily', () => {
  const repeat = createRepeat({ delay: 300, interval: 100 });
  assert.equal(repeat('right', 0), 'right');
  assert.equal(repeat('right', 299), null);
  assert.equal(repeat('right', 300), 'right');
  assert.equal(repeat('right', 350), null);
  assert.equal(repeat('right', 400), 'right');
  assert.equal(repeat(null, 450), null);
  assert.equal(repeat('down', 460), 'down');
  assert.equal(repeat('left', 470), 'left');
});

test('repeat does not catch up after a stalled frame', () => {
  const repeat = createRepeat({ delay: 300, interval: 100 });
  repeat('up', 0);
  assert.equal(repeat('up', 1000), 'up');
  assert.equal(repeat('up', 1016), null);
});

test('buttons ignore a press held since before the page opened', () => {
  const buttons = createButtons();
  assert.deepEqual(buttons(pad({ buttons: [0] })), []);
  assert.deepEqual(buttons(pad({ buttons: [0] })), []);
  assert.deepEqual(buttons(pad()), []);
  assert.deepEqual(buttons(pad({ buttons: [0, 9] })), [0, 9]);
  assert.deepEqual(buttons(pad({ buttons: [0, 9] })), []);
});
