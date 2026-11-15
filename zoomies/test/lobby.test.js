import { describe, expect, it } from 'vitest';
import { createSlots, entrantsFor, updateLobby } from '../src/lobby.js';

const pads = (presses) => new Map(Object.entries(presses).map(([index, button]) => [Number(index), { pressed: { [button]: true } }]));
const joinedPads = (slots) => slots.filter((s) => s.joined).map((s) => s.pad);

describe('updateLobby', () => {
  it('gives each pad that presses A the next free slot', () => {
    const slots = createSlots();
    expect(updateLobby(slots, pads({ 2: 'a', 0: 'none' }))).toBe('changed');
    expect(updateLobby(slots, pads({ 2: 'a', 0: 'a' }))).toBe('changed');
    expect(joinedPads(slots)).toEqual([2, 0]);
    expect(updateLobby(slots, pads({ 2: 'a', 0: 'a' }))).toBeNull();
    expect(joinedPads(slots)).toEqual([2, 0]);
  });

  it('ignores a fifth pad', () => {
    const slots = createSlots();
    updateLobby(slots, pads({ 0: 'a', 1: 'a', 2: 'a', 3: 'a' }));
    expect(updateLobby(slots, pads({ 0: 'none', 1: 'none', 2: 'none', 3: 'none', 4: 'a' }))).toBeNull();
    expect(joinedPads(slots)).toEqual([0, 1, 2, 3]);
  });

  it('lets a player leave with B, freeing the slot for the next pad', () => {
    const slots = createSlots();
    updateLobby(slots, pads({ 0: 'a', 1: 'a' }));
    expect(updateLobby(slots, pads({ 0: 'b', 1: 'none' }))).toBe('changed');
    updateLobby(slots, pads({ 1: 'none', 3: 'a' }));
    expect(joinedPads(slots)).toEqual([3, 1]);
  });

  it('toggles steering help with X, off again for whoever takes the slot next', () => {
    const slots = createSlots();
    updateLobby(slots, pads({ 0: 'a' }));
    updateLobby(slots, pads({ 0: 'x' }));
    expect(slots[0].assist).toBe(true);
    updateLobby(slots, pads({ 0: 'x' }));
    expect(slots[0].assist).toBe(false);
    updateLobby(slots, pads({ 0: 'x' }));
    updateLobby(slots, pads({ 0: 'b' }));
    updateLobby(slots, pads({ 0: 'a' }));
    expect(slots[0].assist).toBe(false);
  });

  it('drops a player whose pad has gone', () => {
    const slots = createSlots();
    updateLobby(slots, pads({ 0: 'a', 1: 'a' }));
    expect(updateLobby(slots, pads({ 1: 'none' }))).toBe('changed');
    expect(joinedPads(slots)).toEqual([1]);
  });

  it('starts only for a player who has joined', () => {
    const slots = createSlots();
    expect(updateLobby(slots, pads({ 0: 'start' }))).toBeNull();
    updateLobby(slots, pads({ 0: 'a' }));
    expect(updateLobby(slots, pads({ 0: 'start' }))).toBe('start');
  });

  it('goes back to the hub on Y from any pad', () => {
    expect(updateLobby(createSlots(), pads({ 3: 'y' }))).toBe('hub');
  });
});

describe('entrantsFor', () => {
  it('fills the grid of six with bots slower than a player', () => {
    const slots = createSlots();
    updateLobby(slots, pads({ 1: 'a', 2: 'a', 5: 'a' }));
    updateLobby(slots, pads({ 1: 'b', 2: 'none', 5: 'x' }));
    const entrants = entrantsFor(slots);
    expect(entrants.map((e) => e.name)).toEqual(['P2', 'P3', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4']);
    expect(entrants[1]).toEqual({ human: true, name: 'P3', pad: 5, assist: true, color: slots[2].color });
    expect(new Set(entrants.map((e) => e.color)).size).toBe(6);
    for (const bot of entrants.slice(2)) expect(bot.skill).toBeLessThan(1);
  });
});
