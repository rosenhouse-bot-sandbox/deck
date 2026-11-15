import { createAudio } from './audio.js';
import { createDriver } from './drive.js';
import { after, createPads } from './input.js';
import { viewports } from './layout.js';
import { LEVELS, trackFor } from './levels.js';
import { createSlots, dropMissing, entrantsFor, updateLobby } from './lobby.js';
import { createRace } from './race.js';
import { createHud, showJoin, showPause, showResults, showSelect } from './ui.js';
import { createBackdrop, createRaceView, createRenderer } from './view.js';

const HUB_URL = '../';
const MAX_LAPS = 5;
// A is also the throttle, so these screens ignore input at first.
const RESULTS_HOLD = 3;
const SELECT_HOLD = 1.5;

const renderer = createRenderer(document.querySelector('canvas'));
const root = document.querySelector('#ui');
const pads = createPads();
const audio = createAudio();
const slots = createSlots();

let levelIndex = 0;
let laps = 3;
let backdrop = null;
// `session` is the race in progress, or null in the menus.
let session = null;
// `update(pads, dt)` handles one frame of the current screen.
let update = null;

const anyPressed = (input, button) => [...input.values()].some((pad) => pad.pressed[button]);

function leaveRace() {
  session?.view.dispose();
  session = null;
  backdrop = createBackdrop(LEVELS[levelIndex]);
}

function enterJoin() {
  leaveRace();
  showJoin(root, slots);
  update = (input) => {
    const outcome = updateLobby(slots, input);
    if (outcome === 'hub') location.href = HUB_URL;
    if (outcome === 'start') return enterSelect();
    if (outcome === 'changed') {
      audio.play('menu');
      showJoin(root, slots);
    }
  };
}

function enterSelect() {
  leaveRace();
  showSelect(root, LEVELS, levelIndex, laps);
  update = after(SELECT_HOLD, (input) => {
    if (dropMissing(slots, input) && !slots.some((slot) => slot.joined)) return enterJoin();
    const turn = (anyPressed(input, 'right') ? 1 : 0) - (anyPressed(input, 'left') ? 1 : 0);
    const more = (anyPressed(input, 'up') ? 1 : 0) - (anyPressed(input, 'down') ? 1 : 0);
    if (anyPressed(input, 'a')) return enterRace();
    if (anyPressed(input, 'b')) return enterJoin();
    if (turn || more) {
      levelIndex = (levelIndex + turn + LEVELS.length) % LEVELS.length;
      laps = Math.max(1, Math.min(MAX_LAPS, laps + more));
      audio.play('menu');
      backdrop = createBackdrop(LEVELS[levelIndex]);
      showSelect(root, LEVELS, levelIndex, laps);
    }
  });
}

function enterRace() {
  const level = LEVELS[levelIndex];
  const entrants = entrantsFor(slots);
  const race = createRace({ track: trackFor(level), level, entrants, laps });
  session = {
    race,
    rects: viewports(entrants.filter((entrant) => entrant.human).length),
    view: createRaceView(race),
    advance: createDriver(race),
  };
  resumeRace();
}

function resumeRace() {
  const { race, rects, advance } = session;
  const hud = createHud(root, race, rects);
  update = (input, dt) => {
    const pauser = race.racers.find((racer) => input.get(racer.pad)?.pressed.start);
    if (pauser) return enterPause(pauser);
    for (const event of advance(input, dt)) {
      if (event.racer && !event.racer.human) continue;
      audio.play(event.type);
      if (event.type === 'hit') pads.rumble(event.racer.pad);
    }
    if (race.phase === 'finished') return enterResults();
    hud.update(input);
  };
}

// Only the player who paused can resume or quit, so a brake press elsewhere does not end the race.
function enterPause(pauser) {
  showPause(root, pauser.name);
  update = (input) => {
    const pad = input.get(pauser.pad);
    if (!pad || pad.pressed.a || pad.pressed.start) return resumeRace();
    if (pad.pressed.b) return enterSelect();
  };
}

function enterResults() {
  showResults(root, session.race);
  update = after(RESULTS_HOLD, (input) => {
    if (anyPressed(input, 'a')) enterSelect();
  });
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(pads.poll(), dt);
  if (session) {
    session.view.update(now / 1000, dt);
    session.view.render(renderer, session.rects);
  } else {
    backdrop.render(renderer, now / 1000);
  }
}

enterJoin();
requestAnimationFrame(frame);
