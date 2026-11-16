import { BUTTON, createButtons, createRepeat, direction, neighbor } from './nav.js';

const list = document.querySelector('#games');
const status = document.querySelector('#status');
const SELECTED = 'hub.selected';

const remembered = () => {
  try {
    return sessionStorage.getItem(SELECTED);
  } catch {
    return null;
  }
};
const remember = (url) => {
  try {
    sessionStorage.setItem(SELECTED, url);
  } catch {}
};

function card(game) {
  const link = document.createElement('a');
  link.href = game.url;
  let cover;
  if (game.cover) {
    cover = document.createElement('img');
    cover.src = game.cover;
    cover.alt = '';
  } else {
    cover = document.createElement('span');
    cover.textContent = [...game.title][0];
  }
  cover.className = 'cover';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = game.title;
  link.append(cover, title);
  link.addEventListener('focus', () => remember(link.getAttribute('href')));
  const item = document.createElement('li');
  item.append(link);
  return item;
}

const links = () => [...list.querySelectorAll('a')];

// The focused card, or else the one last focused, so that a tap elsewhere does not lose your place.
function current() {
  const all = links();
  if (all.includes(document.activeElement)) return document.activeElement;
  return all.find((a) => a.getAttribute('href') === remembered()) ?? all[0];
}

// Focusing a card also scrolls it into view.
function select(link) {
  link?.focus({ focusVisible: true });
}

function move(dir) {
  const all = links();
  if (!all.length) return;
  select(all[neighbor(all.map((a) => a.getBoundingClientRect()), all.indexOf(current()), dir)]);
}

function play(pad) {
  const link = current();
  if (!link) return;
  pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 80, strongMagnitude: 0.3, weakMagnitude: 0.5 })?.catch(() => {});
  location.href = link.href;
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
addEventListener('keydown', (e) => {
  if (!ARROWS[e.key]) return;
  e.preventDefault();
  move(ARROWS[e.key]);
});

// One reader per pad index, so each pad's held buttons are tracked separately.
const readers = new Map();
const repeat = createRepeat();

function poll(now) {
  const pads = [...navigator.getGamepads()].filter((p) => p?.connected);
  let dir = null;
  let launcher = null;
  for (const pad of pads) {
    if (!readers.has(pad.index)) readers.set(pad.index, createButtons());
    const pressed = readers.get(pad.index)(pad);
    dir ??= direction(pad);
    if (pressed.includes(BUTTON.a) || pressed.includes(BUTTON.start)) launcher ??= pad;
  }
  const step = repeat(dir, now);
  if (launcher) play(launcher);
  else if (step) move(step);
  requestAnimationFrame(poll);
}

// Coming back to a cached page, buttons held from the game must not count.
addEventListener('pageshow', (e) => {
  if (e.persisted) readers.clear();
});

async function load() {
  try {
    const response = await fetch('games.json');
    if (!response.ok) throw new Error(response.statusText);
    const games = await response.json();
    list.append(...games.map(card));
    select(current());
  } catch {
    status.textContent = 'Could not load the list of games.';
  }
  requestAnimationFrame(poll);
}

load();
