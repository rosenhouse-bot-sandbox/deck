import { assisted, botInput } from './ai.js';
import { createAudio } from './audio.js';
import { createPads } from './input.js';
import { viewports } from './layout.js';
import { LEVELS, trackFor } from './levels.js';
import { createRace, stepRace } from './race.js';
import { createHud, showJoin, showPause, showResults, showSelect } from './ui.js';
import { createBackdrop, createRaceView, createRenderer } from './view.js';

const HUB_URL = '../';
const STEP = 1 / 60;
const GRID_SIZE = 6;
const MAX_LAPS = 5;
const PLAYER_COLORS = [0xff4d4d, 0x3d8bff, 0xffd23d, 0x4ddb6a];
const BOT_COLORS = [0xb06bff, 0xff8c2e, 0x35d6c8, 0xff7ac8, 0x9aa3ad];

const renderer = createRenderer(document.querySelector('canvas'));
const root = document.querySelector('#ui');
const pads = createPads();
const audio = createAudio();

// A slot holds the gamepad index of the player who joined it.
const slots = PLAYER_COLORS.map((color) => ({ color, joined: false, pad: null, assist: false }));
let levelIndex = 0;
let laps = 3;
let backdrop = null;
let session = null;
let update = null;

const anyPressed = (input, button) => [...input.values()].some((pad) => pad.pressed[button]);
const joined = () => slots.filter((slot) => slot.joined);

function showBackdrop() {
  const level = LEVELS[levelIndex];
  backdrop = createBackdrop(level, trackFor(level));
}

function enterJoin() {
  session = null;
  showBackdrop();
  showJoin(root, slots);
  update = (input) => {
    let changed = false;
    for (const [index, pad] of input) {
      const slot = slots.find((s) => s.joined && s.pad === index);
      if (!slot && pad.pressed.a) {
        const free = slots.find((s) => !s.joined);
        if (free) Object.assign(free, { joined: true, pad: index, assist: false });
        changed = true;
      } else if (slot && pad.pressed.b) {
        slot.joined = false;
        changed = true;
      } else if (slot && pad.pressed.x) {
        slot.assist = !slot.assist;
        changed = true;
      } else if (slot && pad.pressed.start) {
        return enterSelect();
      }
      if (pad.pressed.y) location.href = HUB_URL;
    }
    if (changed) {
      audio.play('menu');
      showJoin(root, slots);
    }
  };
}

function enterSelect() {
  session = null;
  showBackdrop();
  showSelect(root, LEVELS, levelIndex, laps);
  update = (input) => {
    const turn = (anyPressed(input, 'right') ? 1 : 0) - (anyPressed(input, 'left') ? 1 : 0);
    const more = (anyPressed(input, 'up') ? 1 : 0) - (anyPressed(input, 'down') ? 1 : 0);
    if (anyPressed(input, 'a')) return enterRace();
    if (anyPressed(input, 'b')) return enterJoin();
    if (turn || more) {
      levelIndex = (levelIndex + turn + LEVELS.length) % LEVELS.length;
      laps = Math.max(1, Math.min(MAX_LAPS, laps + more));
      audio.play('menu');
      if (turn) showBackdrop();
      showSelect(root, LEVELS, levelIndex, laps);
    }
  };
}

function enterRace() {
  const level = LEVELS[levelIndex];
  const track = trackFor(level);
  const humans = joined().map((slot) => ({
    human: true,
    name: `P${slots.indexOf(slot) + 1}`,
    color: slot.color,
    pad: slot.pad,
    assist: slot.assist,
  }));
  const bots = BOT_COLORS.slice(0, GRID_SIZE - humans.length).map((color, i) => ({
    human: false,
    name: `Bot ${i + 1}`,
    color,
    skill: 0.86 + 0.03 * i,
  }));
  const race = createRace({ track, level, entrants: [...humans, ...bots], laps });
  const rects = viewports(humans.length);
  session = { race, track, rects, view: createRaceView(level, track, race), hud: null, carry: 0 };
  resumeRace();
}

function resumeRace() {
  const { race, track, rects } = session;
  session.hud = createHud(root, race, rects);
  update = (input, dt) => {
    if (anyPressed(input, 'start')) return enterPause();
    session.carry = Math.min(session.carry + dt, STEP * 5);
    for (let first = true; session.carry >= STEP; session.carry -= STEP, first = false) {
      const inputs = {};
      for (const racer of race.racers) {
        const bot = botInput(racer, track);
        const pad = input.get(racer.pad);
        if (!racer.human || racer.finished) inputs[racer.id] = bot;
        else if (pad) {
          // A press counts once, however many steps this frame takes.
          const drive = { steer: pad.steer, throttle: pad.throttle, brake: pad.brake, use: first && pad.pressed.x, reset: first && pad.pressed.y };
          inputs[racer.id] = racer.assist ? assisted(drive, bot) : drive;
        }
      }
      stepRace(race, inputs, STEP);
      for (const event of race.events) {
        if (event.racer && !event.racer.human) continue;
        audio.play(event.type);
        if (event.type === 'hit') pads.rumble(event.racer.pad);
      }
      if (race.phase === 'finished') return enterResults();
    }
    session.hud.update();
  };
}

function enterPause() {
  showPause(root);
  update = (input) => {
    if (anyPressed(input, 'a') || anyPressed(input, 'start')) return resumeRace();
    if (anyPressed(input, 'b')) return enterSelect();
  };
}

function enterResults() {
  showResults(root, session.race);
  update = (input) => {
    if (anyPressed(input, 'a')) enterSelect();
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(pads.poll(), dt);
  if (session) {
    session.view.update(now / 1000, dt);
    session.view.render(renderer, session.rects);
  } else {
    backdrop.render(renderer, now / 1000);
  }
  requestAnimationFrame(frame);
}

enterJoin();
requestAnimationFrame(frame);
